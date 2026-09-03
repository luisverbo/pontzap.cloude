# Agente de WhatsApp na VPS

O PONTZAP passa a poder enviar as mensagens por um **agente seu**, em vez da
Evolution API. Basta o agente expor **um endpoint HTTP**; o resto (quando
enviar, para quem, com que texto) continua no PONTZAP.

## O contrato

É só isto — qualquer linguagem/stack serve:

```
POST  <a URL que você configurar>
Header: Authorization: Bearer <o token que você configurar>
Body:   { "phone": "5521999999999", "message": "texto da mensagem" }

Resposta 2xx  → o PONTZAP considera enviado
Resposta 4xx/5xx → registra a falha no log
```

Para aparecer o QR Code no Painel Master, o agente também expõe (mesmo token):

```
GET   <base>/status  → { "connected": true|false, "qr": "data:image/png;base64,..." }
POST  <base>/logout  → encerra a sessão e gera um QR novo
```

Onde `<base>` é a URL de envio sem o `/send`. O painel nunca fala direto com a
VPS: a chamada passa pela edge function `whatsapp-agent` (só master), o que
evita o bloqueio de conteúdo misto (painel HTTPS × agente HTTP).

O telefone já vai normalizado (só dígitos, com o 55 na frente).

## Onde configurar

Painel Master → aba WhatsApp → **Conexão de WhatsApp**:

- **Provedor:** `Meu agente (VPS)`
- **URL do endpoint de envio:** ex. `http://SEU_IP:3011/send`
- **Token de acesso:** um segredo forte, qualquer string
- **Ativa:** marcado

A troca vale na hora — nenhuma função precisa ser reimplantada.

## Opção A — seu agente já existente

Se o agente que já roda na VPS envia WhatsApp, o menor caminho é **adicionar
uma rota** nele que receba `{ phone, message }`, confira o token e chame a
função de envio que ele já tem. Nada mais muda.

## Opção B — serviço separado (não encosta no agente atual)

Um processo próprio, em porta própria. Não compartilha nada com o agente que
já está lá.

`pontzap-whatsapp.js`:

```js
const express = require('express');
const fs = require('fs');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');

const PORT = process.env.PORT || 3011;                 // porta EXCLUSIVA deste serviço
const TOKEN = process.env.PONTZAP_TOKEN;               // o mesmo token do painel
if (!TOKEN) { console.error('Defina PONTZAP_TOKEN'); process.exit(1); }

const AUTH_DIR = './auth-pontzap';                     // sessão própria
let sock = null;
let connected = false;
let lastQR = null;                                     // data URL PNG do QR atual

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();
  sock = makeWASocket({ version, auth: state, printQRInTerminal: false, browser: ['PONTZAP', 'Chrome', '1.0'] });

  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', async ({ connection, qr, lastDisconnect }) => {
    if (qr) {
      // Guarda como imagem para o painel do PONTZAP exibir
      lastQR = await QRCode.toDataURL(qr).catch(() => null);
      connected = false;
      console.log('QR Code novo disponivel (leia pelo painel ou por /status)');
    }
    if (connection === 'open') { connected = true; lastQR = null; console.log('\n>>> WHATSAPP CONECTADO! <<<\n'); }
    if (connection === 'close') {
      connected = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code !== DisconnectReason.loggedOut) start();
      else { try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }); } catch {} start(); }
    }
  });
}
start();

const app = express();
app.use(express.json());

const auth = (req, res) => {
  if (req.get('authorization') !== `Bearer ${TOKEN}`) {
    res.status(401).json({ error: 'token invalido' });
    return false;
  }
  return true;
};

app.post('/send', async (req, res) => {
  if (!auth(req, res)) return;
  const { phone, message } = req.body || {};
  if (!phone || !message) return res.status(400).json({ error: 'phone e message sao obrigatorios' });
  if (!sock || !connected) return res.status(503).json({ error: 'WhatsApp nao conectado' });
  try {
    await sock.sendMessage(`${String(phone).replace(/\D/g, '')}@s.whatsapp.net`, { text: message });
    res.json({ ok: true });
  } catch (e) {
    console.error('Falha ao enviar:', e);
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// Consumido pelo Painel Master: status + QR quando desconectado
app.get('/status', (req, res) => {
  if (!auth(req, res)) return;
  res.json({ connected, qr: connected ? null : lastQR });
});

// Trocar de número: encerra a sessão e força um QR novo
app.post('/logout', async (req, res) => {
  if (!auth(req, res)) return;
  try {
    try { await sock?.logout(); } catch {}
    try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }); } catch {}
    connected = false; lastQR = null;
    setTimeout(start, 1000);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.get('/health', (_req, res) => res.json({ ok: true, connected }));

app.listen(PORT, () => console.log(`PONTZAP WhatsApp ouvindo na porta ${PORT}`));
```

Instalação:

```bash
mkdir -p ~/pontzap-whatsapp && cd ~/pontzap-whatsapp
npm init -y
npm i express @whiskeysockets/baileys qrcode

# primeira vez: rode no terminal para conectar o numero
PONTZAP_TOKEN='seu-token-secreto' node pontzap-whatsapp.js

# depois, deixe rodando como servico
npm i -g pm2
PORT=3011 PONTZAP_TOKEN='seu-token-secreto' pm2 start pontzap-whatsapp.js --name pontzap-whatsapp
pm2 save && pm2 startup
```

Da primeira vez o QR aparece nos logs (`pm2 logs pontzap-whatsapp`). Depois disso,
trocar de número é feito pelo **Painel Master → WhatsApp → Número do WhatsApp**,
sem abrir o terminal.

### Como não atrapalhar o agente que já está na VPS

| Ponto | Como fica isolado |
|---|---|
| Porta | `3011` (ou outra livre) — confira com `ss -ltnp \| grep 3011` antes |
| Processo | Nome próprio no PM2: `pontzap-whatsapp` |
| Sessão do WhatsApp | Pasta `./auth-pontzap`, separada da sessão do outro agente |
| Dependências | Pasta própria, `node_modules` isolado |

Se o outro agente usa Docker, dá para subir este em um container próprio
mapeando só a porta 3011 — mesmo efeito.

### HTTPS

O Supabase chama a URL pela internet. Se a VPS já tem Nginx com domínio, o
mais simples é criar um subdomínio apontando para a porta 3011 e deixar o
Nginx cuidar do certificado. Sem HTTPS, o token trafega em texto puro.

## ⚠️ O ponto mais importante: separe os números

Os números estão sendo bloqueados por causa do **disparo em massa**, não da
Evolution — trocar de biblioteca não muda isso, porque o bloqueio vem do
próprio WhatsApp.

**Use um número só para o PONTZAP**, diferente do número que faz prospecção.
As mensagens do PONTZAP são poucas, transacionais e para contatos conhecidos
(seus funcionários) — esse perfil quase não corre risco. Se o mesmo número
também dispara prospecção em massa, ele será bloqueado pelo disparo e vai
derrubar os alertas de ponto junto.

Quando o PONTZAP virar produto vendido para outras empresas, o caminho é a
API oficial (Cloud API): número verificado, sem risco de bloqueio e com
mensagens de template. Para o uso interno de agora, o agente resolve.

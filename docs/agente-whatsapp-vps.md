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

O telefone já vai normalizado (só dígitos, com o 55 na frente).

## Onde configurar

Painel Master → aba WhatsApp → **Conexão de WhatsApp**:

- **Provedor:** `Meu agente (VPS)`
- **URL do endpoint de envio:** ex. `https://sua-vps.com:3001/send`
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
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');

const PORT = process.env.PORT || 3001;                 // porta EXCLUSIVA deste serviço
const TOKEN = process.env.PONTZAP_TOKEN;               // o mesmo token do painel
if (!TOKEN) { console.error('Defina PONTZAP_TOKEN'); process.exit(1); }

let sock = null;

async function start() {
  // Sessão em pasta própria — não mexe na sessão do outro agente
  const { state, saveCreds } = await useMultiFileAuthState('./auth-pontzap');
  // Usa a versão de protocolo mais recente — evita "connection closed" por versão antiga
  const { version } = await fetchLatestBaileysVersion();
  sock = makeWASocket({ version, auth: state, printQRInTerminal: false, browser: ['PONTZAP', 'Chrome', '1.0'] });

  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', ({ connection, qr, lastDisconnect }) => {
    if (qr) qrcode.generate(qr, { small: true });       // leia com o WhatsApp do número
    if (connection === 'open') console.log('WhatsApp conectado');
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code !== DisconnectReason.loggedOut) start(); // reconecta sozinho
      else console.error('Sessão encerrada — apague ./auth-pontzap e leia o QR de novo');
    }
  });
}
start();

const app = express();
app.use(express.json());

app.post('/send', async (req, res) => {
  if (req.get('authorization') !== `Bearer ${TOKEN}`) {
    return res.status(401).json({ error: 'token inválido' });
  }
  const { phone, message } = req.body || {};
  if (!phone || !message) return res.status(400).json({ error: 'phone e message são obrigatórios' });
  if (!sock) return res.status(503).json({ error: 'WhatsApp ainda não conectado' });

  try {
    await sock.sendMessage(`${String(phone).replace(/\D/g, '')}@s.whatsapp.net`, { text: message });
    res.json({ ok: true });
  } catch (e) {
    console.error('Falha ao enviar:', e);
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.get('/health', (_req, res) => res.json({ ok: true, connected: !!sock }));

app.listen(PORT, () => console.log(`PONTZAP WhatsApp ouvindo na porta ${PORT}`));
```

Instalação:

```bash
mkdir -p ~/pontzap-whatsapp && cd ~/pontzap-whatsapp
npm init -y
npm i express @whiskeysockets/baileys qrcode-terminal

# rode uma vez no terminal para ler o QR Code
PONTZAP_TOKEN='seu-token-secreto' node pontzap-whatsapp.js

# depois de conectado, deixe rodando como serviço
npm i -g pm2
PONTZAP_TOKEN='seu-token-secreto' pm2 start pontzap-whatsapp.js --name pontzap-whatsapp
pm2 save
```

### Como não atrapalhar o agente que já está na VPS

| Ponto | Como fica isolado |
|---|---|
| Porta | `3001` (ou outra livre) — confira com `ss -ltnp` antes |
| Processo | Nome próprio no PM2: `pontzap-whatsapp` |
| Sessão do WhatsApp | Pasta `./auth-pontzap`, separada da sessão do outro agente |
| Dependências | Pasta própria, `node_modules` isolado |

Se o outro agente usa Docker, dá para subir este em um container próprio
mapeando só a porta 3001 — mesmo efeito.

### HTTPS

O Supabase chama a URL pela internet. Se a VPS já tem Nginx com domínio, o
mais simples é criar um subdomínio apontando para a porta 3001 e deixar o
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

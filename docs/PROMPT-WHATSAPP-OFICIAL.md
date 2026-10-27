# Prompt — configurar o número oficial do PONTZAP na Meta

> Para colar num **chat novo do app do Claude**, com o projeto `pontzap.cloude`
> aberto e o **Claude in Chrome** ligado. O Chrome precisa estar logado na conta
> da Meta (Business) e no PONTZAP com a conta master.

---

Preciso que você configure o número **+55 21 97231-1161** na **API oficial do
WhatsApp (Meta Cloud API)** para o PONTZAP, usando o meu Chrome. Eu não sou
programador: me explique em português simples e **pare e me pergunte** antes de
qualquer coisa que possa afetar os dois números que já uso na Meta.

## 0. Antes de abrir o navegador

1. Use o branch `claude/migrate-vercel-supabase-Mqic6` e traga o mais recente
   (`git fetch origin claude/migrate-vercel-supabase-Mqic6` e
   `git checkout claude/migrate-vercel-supabase-Mqic6 && git pull`).
2. Leia para entender o que já foi construído — **não reescreva nada disso**:
   - `supabase/functions/_shared/templates.ts` — os 15 templates (fonte única)
   - `supabase/functions/_shared/whatsapp.ts` — envio, janela de 24 h
   - `supabase/functions/whatsapp-meta/index.ts` — webhook (botões, status)
   - `supabase/functions/whatsapp-official/index.ts` — ações do Painel Master
   - `src/components/master/WhatsAppOfficialSettings.tsx` — a tela que você vai preencher
   - `supabase/migrations/20261030000001_whatsapp_meta_official.sql`
3. Me pergunte se eu já rodei esse SQL no Supabase. Se não, me mande o
   conteúdo para eu colar no SQL Editor e espere eu confirmar.
4. Confira no GitHub Actions (workflow *Deploy Edge Functions*) que o último
   deploy passou — as funções `whatsapp-meta` e `whatsapp-official` precisam
   existir antes do passo 7. Se falhou, leia o log e corrija.
5. Confirme comigo que o 21 97231-1161 **não está ativo no aplicativo WhatsApp**
   de nenhum celular (se estiver, preciso apagar a conta no app primeiro:
   Configurações → Conta → Apagar conta).

## Regras

- **Não altere nada dos dois números que já existem**, nem a URL de webhook
  que eles usam.
- **Não crie templates à mão na Meta.** O PONTZAP cria os 15 pela API com o
  botão do Painel Master.
- O código de verificação chega por **SMS no próprio 21 97231-1161** — me peça
  e espere.
- **Nunca** escreva token, chave secreta ou PIN em arquivo do projeto, commit
  ou mensagem — eles ficam só no Painel Master.

**Dados do número**
- Nome de exibição: **PONTZAP**
- Categoria: Serviços profissionais (ou "Outro")
- Descrição: Sistema de ponto eletrônico — avisos de registro de ponto,
  alertas e solicitações dos funcionários.

## 1. Decidir onde o número vai ficar

business.facebook.com → Configurações → **Contas do WhatsApp**: veja qual WABA
guarda os dois números atuais. Depois developers.facebook.com/apps → o app
ligado a ela → **WhatsApp → Configuração** → veja a **URL de callback**.

- **Vazia** ou já igual a
  `https://hzedbdiznmlnlxnmtoho.supabase.co/functions/v1/whatsapp-meta`
  → use a mesma WABA e o mesmo app.
- Apontando para **outra ferramenta** (o mais provável) → **não troque**. Cada
  app só tem um webhook. Crie para o PONTZAP:
  - um **app novo** (tipo *Empresa*, nome "PONTZAP", mesmo portfólio) com o
    produto **WhatsApp**;
  - uma **nova WABA** "PONTZAP" no mesmo portfólio;
  - na nova WABA → **Pagamentos**: a mesma forma de pagamento das outras.

Me diga qual caminho seguiu antes de continuar.

## 2. Adicionar e verificar o número

WhatsApp Manager → WABA escolhida → **Números de telefone → Adicionar número**
com os dados acima → SMS → **me peça o código**. O nome "PONTZAP" entra em
análise; pode seguir.

## 3. Copiar os IDs

developers.facebook.com → app → **WhatsApp → Configuração da API** → número
novo: **ID do número de telefone** e **ID da conta do WhatsApp Business**.

## 4. Token permanente

business.facebook.com → Configurações → **Usuários do sistema**: use um que já
exista ou crie "PONTZAP" (Administrador). **Atribuir ativos**: o app do passo 1
e a WABA do número (controle total). **Gerar token** → validade **Nunca** →
permissões `whatsapp_business_messaging` e `whatsapp_business_management`.

## 5. Chave secreta do app

developers.facebook.com → app → **Configurações do app → Básico → Chave secreta
do app**.

## 6. Preencher o PONTZAP

https://pontzap-cloude.vercel.app com a **conta master** (se não estiver logado, me peça
para entrar) → **Painel Master → aba de WhatsApp**:
1. Provedor: **API oficial do WhatsApp (Meta)**.
2. ID do número, ID da WABA, token e chave secreta → **Salvar e usar a API
   oficial**.

   ⚠️ Salvar já troca o provedor de todos os avisos. Se os templates ainda não
   estiverem aprovados, os avisos param até a aprovação. **Me pergunte antes**
   se prefiro fazer isso fora do horário de trabalho.
3. Copie a **URL de callback** e o **Token de verificação** da seção *Webhook*.

## 7. Webhook na Meta

App do passo 1 → **WhatsApp → Configuração → Webhook → Editar** → cole URL e
token → **Verificar e salvar** → assine os campos `messages`,
`message_template_status_update` e `template_category_update`.

Se a verificação falhar, veja os logs da função `whatsapp-meta` no Supabase
(Edge Functions → whatsapp-meta → Logs) e me explique o que encontrou.

## 8. Ativar, testar e criar os templates

No Painel Master, seção *Número oficial*:
1. **Verificar.** Se o status vier **PENDING**: invente um PIN de 6 números,
   **me diga qual é** (vou guardar) e clique **Ativar número**.
2. *Mensagem de teste* para um número que eu indicar → deve chegar
   "Hello World" (template padrão da Meta, em inglês).
3. Seção *Templates* → **Criar templates na Meta** → 15 em análise. Espere
   alguns minutos → **Atualizar status**.

## 9. Se algum template for rejeitado ou virar Marketing

O painel mostra o motivo. Então:
- ajuste o texto em `supabase/functions/_shared/templates.ts`, mantendo as
  regras escritas no topo do arquivo (evento concreto, sem tom de promoção,
  sem começar/terminar com variável);
- **troque o nome** acrescentando `_v2` (template já enviado não pode ser
  editado com o mesmo nome);
- commit e push no mesmo branch, espere o deploy e clique de novo em **Criar
  templates na Meta**.

## No final, me diga

- qual caminho do passo 1 você usou;
- status do número (nome de exibição, qualidade, status);
- quantos templates estão aprovados, em análise e rejeitados, com os motivos;
- se o teste chegou.

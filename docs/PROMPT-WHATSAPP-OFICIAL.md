# Prompt — configurar o número oficial do PONTZAP na Meta

> Cole tudo abaixo para o Claude que tem acesso ao Chrome (Claude in Chrome),
> no computador onde a conta da Meta (Business) já está logada.

---

Preciso que você configure, no meu navegador Chrome, um número novo na **API
oficial do WhatsApp (Meta Cloud API)** para o meu sistema **PONTZAP**. A conta
da Meta Business já está logada e já tenho outros dois números funcionando lá.
Trabalhe com calma, passo a passo, e **pare e me pergunte** antes de qualquer
coisa que possa afetar os dois números que já existem.

**Número novo:** +55 21 97231-1161
**Nome de exibição:** PONTZAP
**Categoria do negócio:** Serviços profissionais (ou "Outro", se não houver)
**Descrição:** Sistema de ponto eletrônico — avisos de registro de ponto, alertas e solicitações dos funcionários.

## Regras importantes

1. **Não altere nada dos dois números que já existem**, nem a URL de webhook
   que eles usam. Se algum passo for mexer neles, pare e me pergunte.
2. **Não crie templates manualmente.** O próprio PONTZAP cria todos pela API,
   com o texto certo para serem aprovados como *Utilidade*.
3. O código de verificação do número chega por **SMS ou ligação no próprio
   21 97231-1161** — quando chegar a hora, me peça o código e espere.
4. Antes de começar, confirme comigo que o 21 97231-1161 **não está ativo no
   aplicativo WhatsApp** de nenhum celular (se estiver, a pessoa precisa apagar
   a conta no app primeiro: Configurações → Conta → Apagar conta).

## Passo 1 — Decidir onde o número vai ficar

Abra https://business.facebook.com → Configurações → **Contas do WhatsApp** e
veja qual conta do WhatsApp Business (WABA) guarda os dois números atuais. Em
seguida abra https://developers.facebook.com/apps → o app ligado a essa WABA →
**WhatsApp → Configuração** e veja a **URL de callback do webhook**.

- Se a URL de callback estiver **vazia** ou já for
  `https://hzedbdiznmlnlxnmtoho.supabase.co/functions/v1/whatsapp-meta`
  → pode usar a mesma WABA e o mesmo app.
- Se ela apontar para **outra ferramenta** (é o mais provável) → **não troque.**
  Crie uma estrutura separada para o PONTZAP:
  - um app novo em developers.facebook.com → Criar app → tipo **Empresa** →
    nome "PONTZAP" → vincular ao mesmo portfólio empresarial → adicionar o
    produto **WhatsApp**;
  - uma **nova conta do WhatsApp Business** chamada "PONTZAP" no mesmo
    portfólio (o próprio fluxo do app costuma oferecer a criação);
  - na nova WABA, em **Pagamentos**, adicione a mesma forma de pagamento que as
    outras usam (sem isso a Meta não envia template).

Me diga qual caminho você seguiu antes de continuar.

## Passo 2 — Adicionar e verificar o número

WhatsApp Manager (business.facebook.com/wa/manage) → a WABA escolhida →
**Números de telefone → Adicionar número**. Preencha nome de exibição, categoria
e descrição acima, informe +55 21 97231-1161, escolha SMS, **me peça o código**
e conclua. O nome "PONTZAP" entra em análise da Meta — tudo bem, segue.

## Passo 3 — Copiar os dois IDs

Em developers.facebook.com → app → **WhatsApp → Configuração da API** (API
Setup), selecione o número novo e anote:
- **ID do número de telefone** (Phone number ID)
- **ID da conta do WhatsApp Business** (WhatsApp Business Account ID)

## Passo 4 — Token permanente

business.facebook.com → Configurações → **Usuários → Usuários do sistema**.
- Use o usuário do sistema que já existe (se houver) ou crie um chamado
  "PONTZAP" com função **Administrador**.
- **Atribuir ativos:** o app usado no passo 1 (controle total) e a WABA do
  número novo (controle total).
- **Gerar token** → app do passo 1 → validade **Nunca** → permissões
  `whatsapp_business_messaging` e `whatsapp_business_management`.
- Copie o token (ele só aparece uma vez).

## Passo 5 — Chave secreta do app

developers.facebook.com → app → **Configurações do app → Básico → Chave
secreta do app** → Mostrar → copie.

## Passo 6 — Colar no PONTZAP

Abra o PONTZAP (https://toosmart.com.br) logado com a **conta master** (se não
estiver logado, me peça para entrar). Vá em **Painel Master → aba de WhatsApp**:
1. **Provedor:** "API oficial do WhatsApp (Meta)".
2. Preencha **ID do número**, **ID da WABA**, **Token** e **Chave secreta do
   app** → clique **Salvar e usar a API oficial**.
3. Na mesma tela, copie a **URL de callback** e o **Token de verificação** que
   aparecem na seção *Webhook*.

## Passo 7 — Webhook

developers.facebook.com → app (o do passo 1) → **WhatsApp → Configuração →
Webhook → Editar**: cole a URL e o token do passo 6 → **Verificar e salvar**.
Depois, em *Campos do webhook*, **assine**:
`messages`, `message_template_status_update` e `template_category_update`.

(Lembre: se esse app for o mesmo dos outros números e a URL dele for de outra
ferramenta, você não deveria estar aqui — volte ao passo 1.)

## Passo 8 — Ativar e testar (de volta no PONTZAP)

No Painel Master, seção *Número oficial*:
1. Clique **Verificar**. Se o status vier **PENDING**, invente um PIN de 6
   números, **me diga qual é** e clique **Ativar número**.
2. Em *Mensagem de teste*, envie para um número que eu indicar → deve chegar
   "Hello World" (é o template de teste padrão da Meta, em inglês).
3. Na seção *Templates*, clique **Criar templates na Meta**. Devem aparecer 15
   templates "Em análise". Depois de alguns minutos, clique **Atualizar status**.

## No final, me mande

- qual caminho do passo 1 foi usado (mesma WABA ou separada);
- os status: nome de exibição, número (Verificar), quantos templates
  aprovados/em análise/rejeitados — e o motivo de qualquer rejeição;
- o PIN de 6 números escolhido (vou guardar).

**Não me mande o token nem a chave secreta** — eles já ficam salvos no PONTZAP.

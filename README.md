# PONTZAP — Controle de Ponto

Sistema de controle de ponto com suporte a QR Code, GPS, offline-first e PWA.

## Stack

- **Frontend**: React 18 + TypeScript + Vite + shadcn-ui + Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Auth + Edge Functions)
- **Deploy**: Vercel (frontend) + Supabase (backend)
- **PWA**: Service Worker com suporte offline e sincronização automática

---

## Configuração local

### 1. Pré-requisitos

- Node.js 18+
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- Conta no [Supabase](https://supabase.com) e no [Vercel](https://vercel.com)

### 2. Clonar e instalar

```sh
git clone <URL_DO_REPOSITORIO>
cd pontzap
npm install
```

### 3. Variáveis de ambiente

Copie o exemplo e preencha com as credenciais do seu projeto Supabase:

```sh
cp .env.example .env
```

Edite `.env`:

```env
VITE_SUPABASE_URL=https://SEU_PROJECT_ID.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sua_anon_key
VITE_SUPABASE_PROJECT_ID=SEU_PROJECT_ID
```

> Encontre esses valores em: Supabase Dashboard → Project Settings → API

### 4. Rodar em desenvolvimento

```sh
npm run dev
```

---

## Deploy — Supabase

### 1. Criar projeto no Supabase

Acesse [supabase.com/dashboard](https://supabase.com/dashboard) e crie um novo projeto.

### 2. Aplicar migrations

Com o Supabase CLI autenticado:

```sh
supabase link --project-ref SEU_PROJECT_ID
supabase db push
```

Ou aplique manualmente os arquivos em `supabase/migrations/` na ordem cronológica pelo SQL Editor do dashboard.

### 3. Atualizar config.toml

Edite `supabase/config.toml` e substitua `SEU_PROJECT_ID_AQUI` pelo ID real do seu projeto.

### 4. Deploy das Edge Functions

```sh
supabase functions deploy --project-ref SEU_PROJECT_ID
```

### 5. Secrets das Edge Functions

Configure os secrets necessários pelas Edge Functions (ex: chave da API do WhatsApp):

```sh
supabase secrets set WHATSAPP_API_KEY=sua_chave --project-ref SEU_PROJECT_ID
supabase secrets set WHATSAPP_PHONE_NUMBER_ID=seu_id --project-ref SEU_PROJECT_ID
```

---

## Deploy — Vercel

### 1. Importar projeto

- Acesse [vercel.com/new](https://vercel.com/new)
- Importe o repositório do GitHub
- Framework: **Vite**

### 2. Variáveis de ambiente no Vercel

Adicione em Project → Settings → Environment Variables:

| Variável | Valor |
|---|---|
| `VITE_SUPABASE_URL` | `https://SEU_PROJECT_ID.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | sua anon key |
| `VITE_SUPABASE_PROJECT_ID` | seu project ID |

### 3. Deploy

O Vercel faz deploy automático a cada push. O arquivo `vercel.json` já está configurado para o SPA routing funcionar corretamente com o React Router.

---

## Estrutura do projeto

```
src/
├── pages/          # 23 páginas (dashboard, clock-in, relatórios, etc.)
├── components/     # Componentes UI (shadcn-ui + componentes próprios)
├── contexts/       # AuthContext (autenticação + roles)
├── hooks/          # Hooks customizados (clock records, employees, etc.)
├── integrations/   # Cliente Supabase + tipos TypeScript gerados
├── lib/            # offlineStorage (IndexedDB para modo offline)
└── types/          # Definições de tipos

supabase/
├── migrations/     # 27 migrations SQL (schema completo)
├── functions/      # 10 Edge Functions (Deno)
└── config.toml     # Configuração do projeto Supabase
```

## Edge Functions incluídas

| Função | Autenticação | Descrição |
|---|---|---|
| `send-whatsapp` | JWT | Notificações WhatsApp para registros de ponto |
| `check-lateness` | Pública | Detecção automática de atrasos |
| `get-lateness-alert` | Pública | Consulta detalhes de alerta de atraso |
| `respond-lateness` | Pública | Resposta do funcionário ao alerta |
| `invite-employee` | JWT | Convite de funcionários por email |
| `send-swap-notification` | JWT | Notificações de troca de turno |
| `send-company-welcome` | Pública | Email de boas-vindas da empresa |
| `create-company-admin` | Pública | Criação do admin da empresa |
| `payment-webhook` | Pública | Webhook do sistema de pagamentos |
| `subscription-status` | Pública | Verificação do status da assinatura |

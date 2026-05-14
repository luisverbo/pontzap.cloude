# PONTZAP — Controle de Ponto

**Deploy:** https://pontzap-cloude.vercel.app

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

## Deploy — Supabase (banco de dados)

### 1. Criar projeto no Supabase

Acesse [supabase.com/dashboard](https://supabase.com/dashboard) e crie um novo projeto. Anote o **Project ID** e a **senha do banco**.

### 2. Aplicar migrations

Com o Supabase CLI autenticado (`supabase login`):

```sh
supabase link --project-ref SEU_PROJECT_ID
supabase db push
```

Isso aplica as 27 migrations em `supabase/migrations/` na ordem correta, recriando toda a estrutura de tabelas, RLS policies, triggers e extensões (incluindo `pg_cron` e `pg_net`).

> **Alternativa manual**: aplique os arquivos de `supabase/migrations/` em ordem cronológica pelo SQL Editor do Supabase Dashboard.

### 3. Atualizar config.toml

Edite `supabase/config.toml` e substitua `SEU_PROJECT_ID_AQUI` pelo ID real do seu projeto:

```toml
project_id = "seu_project_id_real"
```

### 4. Deploy das Edge Functions

```sh
supabase functions deploy --project-ref SEU_PROJECT_ID
```

Isso faz deploy das 10 funções em `supabase/functions/`.

### 5. Secrets das Edge Functions

Configure todos os secrets necessários. Eles são usados pelas Edge Functions e **não ficam no `.env`** — ficam seguros no servidor Supabase:

```sh
# Z-API (WhatsApp) — obtenha em https://z-api.io
supabase secrets set ZAPI_INSTANCE_ID=sua_instance_id --project-ref SEU_PROJECT_ID
supabase secrets set ZAPI_TOKEN=seu_token --project-ref SEU_PROJECT_ID
supabase secrets set ZAPI_CLIENT_TOKEN=seu_client_token --project-ref SEU_PROJECT_ID

# Resend (email) — obtenha em https://resend.com
supabase secrets set RESEND_API_KEY=sua_api_key --project-ref SEU_PROJECT_ID

# Webhook de pagamentos (Kiwify ou outro)
supabase secrets set PAYMENT_WEBHOOK_SECRET=seu_secret --project-ref SEU_PROJECT_ID
```

> Alternativamente, adicione via Dashboard: Supabase → Edge Functions → Secrets

### 6. Habilitar extensões no banco

As extensões `pg_cron` e `pg_net` são criadas pelas migrations, mas no Supabase Cloud você também precisa habilitá-las pelo Dashboard:

1. Supabase Dashboard → Database → Extensions
2. Busque e habilite: **pg_cron** e **pg_net**

### 7. Criar o cron job de alertas de atraso

O sistema de alertas de atraso usa `pg_cron` para chamar a Edge Function `check-lateness` periodicamente. Crie o job manualmente no **SQL Editor** do Supabase:

```sql
-- Roda a cada 5 minutos (ajuste conforme necessário)
SELECT cron.schedule(
  'check-lateness-job',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://SEU_PROJECT_ID.supabase.co/functions/v1/check-lateness',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer SUA_SERVICE_ROLE_KEY"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

> Substitua `SEU_PROJECT_ID` e `SUA_SERVICE_ROLE_KEY` (encontre a service role key em: Supabase Dashboard → Project Settings → API → `service_role`).

---

## Deploy — Vercel (frontend)

### 1. Importar projeto

- Acesse [vercel.com/new](https://vercel.com/new)
- Importe o repositório do GitHub
- Framework preset: **Vite**

### 2. Variáveis de ambiente no Vercel

Adicione em Project → Settings → Environment Variables:

| Variável | Onde encontrar |
|---|---|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API (anon key) |
| `VITE_SUPABASE_PROJECT_ID` | Supabase → Project Settings → General |

### 3. Deploy

O Vercel faz deploy automático a cada push na branch principal. O arquivo `vercel.json` já está configurado para o SPA routing funcionar corretamente com React Router (sem 404 em refresh de página).

---

## Reconfiguração manual após migração

Itens que **não são migrados automaticamente** pelas migrations e precisam ser refeitos:

| Item | Onde configurar | O que fazer |
|---|---|---|
| **Auth redirect URLs** | Supabase → Auth → URL Configuration | Site URL: `https://pontzap-cloude.vercel.app` / Redirect URLs: `https://pontzap-cloude.vercel.app/**` |
| **Webhook Kiwify** | Painel da Kiwify | Atualizar a URL do webhook para `https://hzedbdiznmlnlxnmtoho.supabase.co/functions/v1/payment-webhook` |
| **Cron job alertas** | SQL Editor do Supabase | Executar o SQL da seção 7 acima |
| **Secrets das funções** | CLI ou Supabase Dashboard | Ver seção 5 acima |

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
| `send-whatsapp` | JWT | Notificações WhatsApp via Z-API para registros de ponto |
| `check-lateness` | Pública | Detecção automática de atrasos (chamada via pg_cron) |
| `get-lateness-alert` | Pública | Consulta detalhes de alerta de atraso |
| `respond-lateness` | Pública | Resposta do funcionário ao alerta (link público) |
| `invite-employee` | JWT | Convite de funcionários por email via Resend |
| `send-swap-notification` | JWT | Notificações de troca de turno via WhatsApp |
| `send-company-welcome` | Pública | Email de boas-vindas da empresa via Resend |
| `create-company-admin` | Pública | Criação do admin da empresa no onboarding |
| `payment-webhook` | Pública | Webhook do sistema de pagamentos (Kiwify) |
| `subscription-status` | Pública | Verificação do status da assinatura |

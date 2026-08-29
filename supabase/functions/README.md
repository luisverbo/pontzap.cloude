# Edge Functions

Todas são publicadas automaticamente pelo workflow `deploy-edge-functions.yml`
a cada push que toca esta pasta. O `verify_jwt` de cada uma fica em
`supabase/config.toml` — quem está como `false` é acessível sem login e por
isso valida a autorização por conta própria (token na URL, segredo
compartilhado ou checagem do JWT dentro do código).

| Função | JWT | O que faz |
|---|---|---|
| `register-clock` | sim | Registra o ponto. É a fronteira de confiança: define o horário no servidor, valida a cerca geográfica e gera NSR + hash. |
| `invite-employee` | sim | Cria o usuário do funcionário e o vincula à empresa. |
| `create-company-admin` | sim | Cria/atualiza o admin de uma empresa (só master). |
| `send-whatsapp` | sim | Notifica os destinatários da empresa a cada batida. |
| `send-swap-notification` | sim | Avisa sobre troca de escala. |
| `hour-bank-calc` | não* | Calcula o banco de horas. Sem `companyId` roda em modo cron (só empresas que optaram); com `companyId` exige admin daquela empresa. |
| `daily-summary` | não | Resumo diário no WhatsApp; disparado por cron a cada 5 min, envia na janela configurada. |
| `check-lateness` | não | Detecta atrasos e dispara o alerta. |
| `get-lateness-alert` | não | Lê um alerta de atraso pelo link público (assinatura HMAC). |
| `respond-lateness` | não | Recebe a resposta do funcionário ao alerta. |
| `occurrence-public` | não | Mostra ao condomínio uma ocorrência aprovada, pelo token do link. |
| `send-company-welcome` | não | E-mail de boas-vindas da empresa. |
| `payment-webhook` | não | Webhook de pagamento (Kiwify). |
| `subscription-status` | não | Consulta o status da assinatura. |
| `whatsapp-webhook` | não | Ponto por WhatsApp — **desativado** por padrão; só liga com `WHATSAPP_CLOCKIN_ENABLED=true`. |

\* validação feita dentro da função.

## Segredos usados

Configurados em Supabase → Project Settings → Edge Functions → Secrets:

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — injetados automaticamente
- `ALERT_SIGNING_SECRET` — assina os links de alerta de atraso
- `RESEND_API_KEY` — envio de e-mail
- `PAYMENT_WEBHOOK_SECRET` — valida o webhook de pagamento
- `WHATSAPP_CLOCKIN_ENABLED` — liga o ponto por WhatsApp

A conexão com a Evolution API (WhatsApp) fica na tabela `evolution_config`,
editável pelo Painel Master, com as variáveis de ambiente como reserva.

## Deploy

O workflow usa o secret `SUPABASE_ACCESS_TOKEN` (token pessoal do Supabase).
Se ele expirar, o deploy falha com `401 Unauthorized` — gere outro em
https://supabase.com/dashboard/account/tokens e atualize o secret no GitHub.

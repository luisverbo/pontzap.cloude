# FOLGUISTA — briefing completo do projeto

> **Como usar este documento:** cole-o inteiro como primeira mensagem de um
> chat novo com o Claude Code. Ele contém tudo: contexto, regras de negócio,
> arquitetura, modelo de dados, pagamento, integração com o PONTZAP e a ordem
> de construção. A última seção diz exatamente o que fazer primeiro.

---

## 0. Quem está pedindo e como trabalhamos

- O dono do projeto **não é programador**. Explique tudo em português simples,
  passo a passo, e nunca peça para ele rodar coisas no computador dele.
- **Zero setup local.** Tudo é construído e publicado pela nuvem: código no
  GitHub, banco no Supabase, site na Vercel, APK Android gerado pelo GitHub
  Actions — ele só baixa o APK em *Releases*. Esse esquema já funciona no
  projeto irmão (PONTZAP) e deve ser copiado.
- Quando precisar de SQL no Supabase, entregue o arquivo pronto para ele colar
  no SQL Editor (as aprovações automáticas de migração costumam expirar).
- Ele já tem conta no **Asaas** e um agente de WhatsApp (Baileys) rodando na
  VPS dele, na porta 3011, que recebe `POST /send { phone, message }` com
  `Authorization: Bearer <token>`. Reaproveite para as notificações.

## 1. O produto em uma frase

**Folguista** é um marketplace (tipo Uber) onde empresas de manutenção de
piscina do Rio de Janeiro encontram, na hora, um **guardião de piscina
folguista** para cobrir uma folga ou um posto vazio — e o folguista recebe
por Pix, com pagamento garantido, assim que a folga é comprovada.

**A dor:** o empresário telefona para 8 pessoas às 6 da manhã para achar
alguém. O folguista, por sua vez, às vezes trabalha e não recebe.

**O diferencial que ninguém tem:** o pagamento é liberado pela **batida do
ponto** (GPS + hora do servidor + selfie), não pela palavra de ninguém.

## 2. Decisões já tomadas (não reabrir)

| Decisão | Valor |
|---|---|
| Nome | **Folguista** |
| Produto separado do PONTZAP | Sim — repositório, Supabase e app próprios; conectados por API (seção 8) |
| Nicho inicial | **Só guardião de piscina** |
| Cidade inicial | **Rio de Janeiro** (capital e região metropolitana) |
| Pagamento | **Asaas** — entrada por Pix/cartão/boleto na conta da plataforma; saída por **transferência Pix para a chave** do folguista (API `/v3/transfers` com `pixAddressKey`). **O folguista NÃO cria conta no Asaas** — ele só informa a chave Pix no app |
| Taxa | **10% da diária, mínimo R$ 12, paga pela empresa** por cima da diária. O folguista recebe a diária inteira |
| Liberação | Folga comprovada pelo ponto (entrada + saída) → **24 h sem contestação** → Pix automático ao folguista |
| Stack | A mesma do PONTZAP: React 18 + TypeScript + Vite + Tailwind + shadcn-ui · Supabase (Postgres, Auth, RLS, Edge Functions, Storage) · Capacitor 6 para o APK Android · GitHub Actions para build e deploy |

## 3. Os três usuários

### 3.1 Empresa (cliente que paga)
- Entra pelo **site** (e pelo mesmo app, se quiser).
- Cadastra: CNPJ, nome, responsável, WhatsApp, locais (condomínios) com
  endereço + GPS + raio.
- Publica uma **vaga**: local, data, horário, diária (R$), observações
  (uniforme, chave, com quem falar). Pode marcar **urgente**.
- Paga na publicação (Pix preferencial). Dinheiro fica retido.
- Vê quem aceitou (nome, foto, nota, nº de folgas feitas), acompanha o ponto
  em tempo real no dia, contesta em até 24 h, avalia o folguista.
- Tem lista de **favoritos** (chamar primeiro) e **bloqueados** (nunca mais).

### 3.2 Folguista (quem trabalha)
- Usa o **app Android** (APK) — cadastro de 1 minuto: nome, CPF, WhatsApp,
  selfie, chave Pix. Opcional depois: documentos para o selo "verificado".
- Define **raio de atuação** e **dias disponíveis**.
- Recebe notificação de vaga perto dele; vê local, horário, diária, nota da
  empresa; **aceita** — o primeiro que aceita leva.
- No dia: **bate o ponto no app** (entrada e saída) com GPS dentro do raio do
  local + selfie. Se a empresa tem PONTZAP, a batida também aparece lá.
- Recebe o Pix 24 h depois. Vê extrato, histórico, sua nota.
- Avalia a empresa (sim — a empresa também tem nota).

### 3.3 Administração (o dono do Folguista)
- Painel web: vagas, pagamentos retidos/liberados, **disputas** (com GPS, hora
  e selfie para decidir em 2 minutos), usuários, bloqueios, taxas, relatórios.

## 4. Regras de negócio (o coração)

**Vaga**
- Estados: `rascunho → publicada → aceita → em_andamento → concluída → paga`
  e os desvios `cancelada_empresa`, `cancelada_folguista`, `nao_compareceu`,
  `em_disputa`, `reembolsada`.
- Uma vaga é publicada **só depois do pagamento confirmado** pelo Asaas (webhook).
- Valor cobrado da empresa = diária + max(10% da diária, R$ 12).
- Notificação (push + WhatsApp) para folguistas ativos num raio de X km, por
  ordem: favoritos da empresa → verificados → demais. Urgente = todos ao mesmo tempo.

**Aceite e cancelamento**
- Primeiro aceite válido trava a vaga. Os outros recebem "já preenchida".
- Folguista pode cancelar até **12 h antes** sem penalidade; depois disso
  leva uma "falta" (3 faltas em 90 dias = suspensão). A vaga volta a ser publicada
  automaticamente, marcada urgente.
- Empresa pode cancelar até **12 h antes** com reembolso integral; depois,
  reembolso da diária menos 30% que vai ao folguista (ele reservou o dia).
  A taxa da plataforma não é reembolsada após aceite.

**Comprovação**
- Entrada válida: GPS dentro do raio do local (ou QR do local), até 30 min
  após o início. Saída válida: após o horário de fim menos 30 min.
- Sem entrada em 60 min após o início → vaga vira `nao_compareceu`:
  folguista leva falta, empresa é reembolsada da diária, vaga republicada urgente.
- Com entrada e saída → `concluída`; abre janela de **24 h** para contestação.

**Pagamento**
- Sem contestação em 24 h → sistema chama Asaas: Pix para a chave do folguista
  no valor da diária. Taxa fica na conta da plataforma. Estado `paga`.
- Com contestação → `em_disputa`; o admin decide: pagar integral, pagar parcial
  ou reembolsar. Tudo registrado com motivo.
- Toda movimentação fica num **livro-razão** (tabela `ledger`): entrada da
  empresa, taxa, repasse, reembolso — nunca se edita, só se adiciona linha.

**Avaliação**
- Mútua, 1 a 5 estrelas + comentário curto, liberada após `paga`/`concluída`.
- Nota média exibida com nº de folgas. Abaixo de 3,5 com 10+ avaliações →
  revisão manual.

**Chave Pix** (lição aprendida no PONTZAP)
- Toda alteração de chave gera registro em histórico (quem, quando, chave
  anterior). Cada vaga **congela** a chave vigente no aceite. Antes de aceitar,
  o folguista confirma a chave.

## 5. Modelo de dados (sugestão de partida)

```
companies          id, cnpj, name, contact_name, whatsapp, email, rating_avg, rating_count,
                   asaas_customer_id, pontzap_api_key_hash (seção 8), created_at
locations          id, company_id, name, address, lat, lng, radius_m, qr_code, notes
workers            id, user_id, name, cpf, whatsapp, selfie_path, pix_key, pix_key_type,
                   pix_key_owner_name, radius_km, available_days[], verified_at,
                   rating_avg, rating_count, strikes_90d, suspended_until, created_at
worker_pix_history id, worker_id, pix_key, previous_pix_key, changed_at
jobs               id, company_id, location_id, date, start_time, end_time, daily_rate,
                   platform_fee, total_charged, urgent, notes, status, worker_id,
                   accepted_at, pix_key_snapshot, asaas_payment_id, paid_out_at,
                   asaas_transfer_id, dispute_reason, decided_by, decided_at,
                   external_ref (id da folga no PONTZAP, seção 8), created_at
job_punches        id, job_id, type (entry|exit), at (server time), lat, lng,
                   distance_m, selfie_path, source (app|pontzap)
job_offers         id, job_id, worker_id, notified_at, seen_at, accepted_at, declined_at
ratings            id, job_id, from_type (company|worker), stars, comment, created_at
favorites          company_id, worker_id, kind (favorite|blocked)
ledger             id, job_id, kind (charge|fee|payout|refund|partial), amount,
                   asaas_ref, created_at          -- só INSERT, nunca UPDATE/DELETE
disputes           id, job_id, opened_by, reason, evidence_paths[], decision, created_at
notifications_log  id, to_type, to_id, channel (push|whatsapp), payload, sent_at, ok
```

Regras de segurança **obrigatórias** (aprendidas no PONTZAP):
- RLS em toda tabela, **fail-closed**: sem empresa/worker resolvido, nada aparece.
- `company_id`/`worker_id` preenchidos por **trigger no servidor**, nunca pelo front.
- Validação de regras (valores, janelas, estados) em **trigger/função do banco**,
  não na tela.
- Buckets de selfie e documentos **privados**, com link temporário assinado.
- Dinheiro só se move por **Edge Function com service role**; o front nunca
  chama o Asaas.
- Webhooks do Asaas validados por token; webhooks do PONTZAP por HMAC (seção 8).
- Trilha de auditoria em jobs, ledger, disputes e alteração de chave Pix.

## 6. Pagamento — Asaas, passo a passo

1. Empresa publica vaga → Edge Function `job-checkout` cria cobrança no Asaas
   (`POST /v3/payments`, billingType PIX/CREDIT_CARD/BOLETO, valor = diária + taxa,
   `externalReference = job.id`). Devolve QR Pix / link.
2. Webhook do Asaas (`PAYMENT_RECEIVED` / `PAYMENT_CONFIRMED`) → Edge Function
   `asaas-webhook` marca `jobs.status = publicada`, grava `ledger(charge)` e
   dispara as notificações. **Só aqui a vaga aparece para os folguistas.**
3. Folga concluída + 24 h → cron (pg_cron) chama `job-payout`: 
   `POST /v3/transfers { value: diária, pixAddressKey, pixAddressKeyType }`,
   grava `ledger(payout)` e `jobs.status = paga`. Usa o **mecanismo de validação
   de saque** do Asaas: antes de qualquer transferência sair, o Asaas consulta
   nossa função, que só autoriza se existir `job_punches` entry+exit válidos.
4. Reembolso → `POST /v3/payments/{id}/refund` (parcial ou total), `ledger(refund)`.
5. Guarde `asaas_*_id` em tudo. Nunca confie no valor vindo do front — recalcule.

Conta do Asaas: a do dono. Chaves em secrets das Edge Functions
(`ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`). Comece no **sandbox** do Asaas.

## 7. Telas (MVP)

**App Folguista (Android, Capacitor)**
Cadastro · Minha chave Pix (com histórico) · Vagas perto de mim · Detalhe da vaga
→ Aceitar · Minhas folgas (próximas/passadas) · Bater ponto (GPS + selfie) ·
Extrato · Minha nota · Avaliar empresa.

**Site da Empresa (web)**
Cadastro · Locais · Publicar vaga (com cálculo da taxa na hora) · Pagamento
(QR Pix) · Minhas vagas (status ao vivo, quem aceitou, ponto do dia) · Contestar ·
Avaliar · Favoritos/bloqueados · **Conectar ao PONTZAP** (seção 8).

**Painel Admin (web)**
Vagas · Pagamentos (retidos / a liberar / pagos) · Disputas · Folguistas
(verificar, suspender) · Empresas · Taxas · Relatórios · Log de notificações.

Notificações: push (Firebase Cloud Messaging via Capacitor) **e** WhatsApp pelo
agente da VPS (os folguistas vivem no WhatsApp).

## 8. Integração com o PONTZAP — contrato (lado Folguista)

O PONTZAP é um sistema de ponto eletrônico (mesmo dono). A conexão permite que
uma empresa que usa o PONTZAP peça folguista em 1 clique e que a batida de ponto
registrada no PONTZAP comprove a folga aqui. **O Folguista não sabe nada do
PONTZAP além desta API; o PONTZAP não sabe nada do Folguista além dela.**

### 8.1 Chave de integração
- Na tela *Empresa → Conectar ao PONTZAP*, o Folguista gera uma **API key**
  (`fk_live_…`, 40+ chars), mostrada uma vez, guardada como hash. A empresa cola
  essa chave no PONTZAP. Uma chave por empresa; pode ser revogada.
- Toda chamada do PONTZAP vem com `Authorization: Bearer fk_live_…`.

### 8.2 Endpoints expostos pelo Folguista (Edge Functions, `verify_jwt=false`, autenticadas pela API key)

```
POST /integrations/pontzap/jobs
  { external_ref, location: { external_ref, name, lat, lng, radius_m },
    date, start_time, end_time, daily_rate, urgent, notes }
  → cria o local se não existir (por external_ref), cria a vaga e devolve
    { job_id, status, checkout_url, qr_pix, total_charged, platform_fee }

GET  /integrations/pontzap/jobs/{job_id}
  → { status, worker: { name, cpf_masked, whatsapp, selfie_url, rating } | null,
      punches: [...], paid_out_at }

DELETE /integrations/pontzap/jobs/{job_id}
  → cancela (aplica as regras de reembolso da seção 4)

POST /integrations/pontzap/jobs/{job_id}/punches
  { type: "entry"|"exit", at, lat, lng, source: "pontzap", evidence_ref }
  → registra batida vinda do PONTZAP como comprovação (mesma validação de raio/janela)

POST /integrations/pontzap/jobs/{job_id}/rating
  { stars, comment }
```

### 8.3 Webhooks enviados pelo Folguista ao PONTZAP
A empresa informa, ao conectar, a URL de webhook do PONTZAP (ele a fornece) e
recebe um **segredo HMAC**. Cada entrega leva `X-Folguista-Signature: sha256=…`
(HMAC-SHA256 do corpo) e `X-Folguista-Event`.

```
job.published   { job_id, external_ref }
job.accepted    { job_id, external_ref, worker: { id, name, cpf, whatsapp, selfie_url, pix_key_type } }
job.cancelled   { job_id, external_ref, by: "worker"|"company"|"system", reason }
job.no_show     { job_id, external_ref }
job.completed   { job_id, external_ref, punches }
job.paid        { job_id, external_ref, amount, paid_out_at }
```

Reentregas com backoff (1 min, 5 min, 30 min, 2 h) até resposta 2xx; idempotência
por `event_id`.

### 8.4 O que o PONTZAP fará do lado dele (fora deste projeto — só para contexto)
- *Minha Empresa → Conectar ao Folguista*: cola a API key, recebe a URL de
  webhook + segredo.
- Em *Escala de Folgas*, toda folga "Sem folguista" e todo alerta de posto vazio
  ganham o botão **"Buscar no Folguista"** → chama `POST …/jobs` com o local e a
  diária cadastrados.
- Ao receber `job.accepted`, cria automaticamente um funcionário tipo
  *folguista* daquele dia, vinculado ao local, para que a batida no PONTZAP
  funcione; ao registrar o ponto dele, chama `POST …/punches`.
- Ao receber `job.paid`, lança a despesa no Financeiro.

Esse contrato é a **fonte da verdade**. Se precisar mudar algo, mude aqui primeiro.

## 9. Fases de construção (nesta ordem)

**Fase 1 — fundação (semana 1)**
Repositório `folguista` · Supabase novo · auth (empresa, folguista, admin) ·
tabelas + RLS + triggers · CI: site na Vercel + APK pelo GitHub Actions
(copiar `build-android.yml` do PONTZAP, inclusive o patch de permissões no
AndroidManifest: CAMERA, ACCESS_FINE_LOCATION, POST_NOTIFICATIONS).

**Fase 2 — o ciclo completo sem dinheiro real (semana 2)**
Cadastro dos três perfis · locais · publicar vaga · notificação · aceite ·
ponto com GPS + selfie · conclusão · avaliação. Asaas em **sandbox**.

**Fase 3 — dinheiro (semana 3)**
Checkout Asaas · webhook de pagamento · retenção · payout por Pix com validação
de saque · reembolsos · ledger · painel de disputas.

**Fase 4 — integração PONTZAP (semana 4)**
API key · endpoints da seção 8.2 · webhooks da 8.3 · sandbox de testes.

**Fase 5 — polimento e lançamento**
Favoritos/bloqueados · selo verificado · relatórios · termos de uso no cadastro ·
Asaas em produção · primeiros 20 folguistas (indicação da Aqualife) e as
primeiras empresas (clientes do PONTZAP).

## 10. Lição de casa jurídica (paralelo, não bloqueia o código)

- **Termo de uso e contrato de intermediação** revisados por advogado
  trabalhista: o folguista é autônomo, escolhe quando trabalha, sem exclusividade,
  sem subordinação à plataforma. Incentivar MEI (emite nota).
- **Retenção de valores de terceiros**: contabilidade separa repasse de receita;
  confirmar com contador/advogado o enquadramento junto ao Banco Central.
- **LGPD**: consentimento no cadastro, finalidade da selfie/GPS, prazo de guarda
  (sugestão: selfies de ponto por 12 meses), canal para exclusão de dados.
- Política de cancelamento e de no-show **visível antes do aceite**.

## 11. O que fazer primeiro (instruções para o Claude no chat novo)

1. Confirme que leu este documento e **não reabra as decisões da seção 2**.
2. Pergunte apenas o que falta para começar: nome do repositório no GitHub
   (sugestão: `luisverbo/folguista`), e-mail do projeto Supabase novo, e se o
   dono já criou o projeto Supabase (se não, oriente a criar — plano **Pro** desde
   o início, por causa do backup: aqui circula dinheiro).
3. Entregue a **Fase 1** inteira: estrutura do repositório, migração SQL inicial
   (tabelas, RLS, triggers), CI de site e de APK, tela de login dos três perfis.
   Termine com a lista exata de cliques que o dono precisa dar (secrets do GitHub,
   SQL para colar, variáveis na Vercel).
4. Só então avance para a Fase 2. Uma fase por vez, com o dono testando no meio.
5. Ao chegar na Fase 4, copie o contrato da seção 8 **sem alterar** — o PONTZAP
   será adaptado para ele.

# Backlog combinado (27/10/2026)

## Próximos — ordem decidida

1. **Portal do Síndico** — link/login por condomínio. O síndico vê **somente o
   que a empresa liberar** (configuração por condomínio: quem está no posto,
   horários, livro de ocorrências, rondas, relatório mensal…). Nada é visível
   por padrão.
2. **Passagem de turno** — na saída o guardião deixa áudio/texto; quem entra
   no próximo turno vê antes de bater o ponto.

## Segurança pendente (fazer antes de vender)

- Buckets `clock-photos`, `occurrence-photos`, `justification-photos` → privados
  com link temporário (atestado é dado de saúde / LGPD)
- `daily-summary` (e conferir `check-lateness`) → exigir segredo do cron
- Atualizar dependências (DOMPurify no jsPDF roda no navegador)
- Senha mínima 8 + 2FA para admin
- Repositório privado · Backup (Supabase Pro)

## Ideias avaliadas, ainda sem data

Cobertura automática de posto vazio via WhatsApp · Ronda com QR · Lucro por
posto · Relatório mensal automático ao síndico · Botão SOS · Documentos com
vencimento · "Pergunte ao PONTZAP" no WhatsApp · Escala automática ·
Reconhecimento facial na selfie · Pacote do contador · Sistema de Pontos +
Sorteio · Biometria no app · Simples Nacional (aguarda Anexo).

## Produto separado em estudo

**App de folgas (marketplace de folguistas de piscina)** — produto próprio,
conectado ao PONTZAP por API. Ver conversa de 27/10 para o modelo.

## Integração com o Folguista (fazer depois que o app existir — Fase 4 dele)

Contrato em `docs/FOLGUISTA.md`, seção 8. Do lado do PONTZAP:
- *Minha Empresa → Conectar ao Folguista* (API key + URL de webhook + segredo HMAC)
- Botão "Buscar no Folguista" em Escala de Folgas e no alerta de posto vazio
- Edge function `folguista-webhook`: `job.accepted` → cria folguista do dia;
  `job.paid` → lança no Financeiro
- `register-clock` → envia a batida do folguista para `POST …/punches`

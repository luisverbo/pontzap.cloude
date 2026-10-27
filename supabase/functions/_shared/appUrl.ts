// Endereço público do PONTZAP usado em links de e-mail e WhatsApp.
//
// Hoje é o domínio da Vercel, que recebe cada atualização. Quando um domínio
// próprio estiver ligado ao mesmo projeto da Vercel, basta criar o secret
// PUBLIC_APP_URL nas Edge Functions do Supabase — nenhuma função precisa mudar.
export const APP_URL = (Deno.env.get("PUBLIC_APP_URL") || "https://pontzap-cloude.vercel.app").replace(/\/$/, "");

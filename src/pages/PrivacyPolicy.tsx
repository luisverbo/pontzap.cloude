import { Link } from 'react-router-dom';
import logoPontzap from '@/assets/logo-pontzap.png';

const UPDATED_AT = '30 de outubro de 2026';
const CONTACT_WHATSAPP = '+55 21 97231-1161';

/**
 * Política de Privacidade pública (/privacidade).
 * Exigida pela Meta para publicar o app da API oficial do WhatsApp e base do
 * atendimento à LGPD.
 */
export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background py-10 px-4">
      <article className="max-w-2xl mx-auto space-y-6 text-sm leading-relaxed text-foreground/90">
        <header className="space-y-3">
          <Link to="/"><img src={logoPontzap} alt="PONTZAP" className="h-9" /></Link>
          <h1 className="text-2xl font-bold text-foreground">Política de Privacidade</h1>
          <p className="text-muted-foreground">Última atualização: {UPDATED_AT}</p>
        </header>

        <section className="space-y-2">
          <p>
            O PONTZAP é um sistema de ponto eletrônico e gestão de equipes usado por empresas para
            registrar a jornada dos seus funcionários. Esta política explica quais dados tratamos,
            para quê, com quem compartilhamos e quais são os seus direitos, conforme a Lei Geral de
            Proteção de Dados (Lei nº 13.709/2018 — LGPD).
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">1. Quem é responsável pelos dados</h2>
          <p>
            A <strong>empresa empregadora</strong> que contrata o PONTZAP é a <em>controladora</em> dos
            dados dos seus funcionários: é ela quem decide quais dados cadastrar e como usá-los. O
            PONTZAP atua como <em>operador</em>, tratando os dados em nome dessa empresa e conforme as
            instruções dela. Para os dados de cadastro das próprias empresas clientes, o PONTZAP é o
            controlador.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">2. Dados que tratamos</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Cadastro:</strong> nome, e-mail, telefone/WhatsApp, CPF, PIS, cargo, setor e data de admissão.</li>
            <li><strong>Registro de ponto:</strong> data e hora de cada marcação, local de trabalho e a localização (GPS) no momento da batida, para confirmar que ela ocorreu no local autorizado.</li>
            <li><strong>Foto (selfie):</strong> somente quando a empresa ativa essa opção, como confirmação de identidade na batida.</li>
            <li><strong>Documentos enviados pelo funcionário:</strong> atestados e justificativas de falta, ocorrências, recados de passagem de turno (texto e áudio).</li>
            <li><strong>Dados de pagamento:</strong> chave Pix e titular, usados exclusivamente para pagamento de vales e adiantamentos solicitados pelo próprio funcionário.</li>
            <li><strong>Mensagens de WhatsApp:</strong> avisos enviados pelo sistema e as respostas aos botões dessas mensagens.</li>
            <li><strong>Dados técnicos:</strong> registros de acesso exigidos pelo Marco Civil da Internet.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">3. Para que usamos</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Registrar e comprovar a jornada de trabalho, como exige a legislação trabalhista (Portaria MTP nº 671/2021), incluindo espelho de ponto e arquivos fiscais.</li>
            <li>Avisar a empresa e o funcionário sobre batidas, atrasos, trocas de turno, folgas, pedidos de vale e outros eventos da rotina de trabalho.</li>
            <li>Permitir que a empresa aprove pedidos, justificativas e ocorrências.</li>
            <li>Manter a segurança do sistema e a trilha de auditoria das alterações.</li>
          </ul>
          <p>
            <strong>Não usamos os dados para publicidade e não vendemos dados a terceiros.</strong> As
            mensagens de WhatsApp enviadas pelo PONTZAP são exclusivamente avisos de serviço.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">4. Bases legais</h2>
          <p>
            Cumprimento de obrigação legal (controle de jornada), execução do contrato de trabalho e do
            contrato de prestação de serviço com a empresa, legítimo interesse (segurança e prevenção a
            fraudes no ponto) e, quando aplicável, consentimento.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">5. Com quem compartilhamos</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>A empresa empregadora</strong>, que é a dona dos dados da sua equipe.</li>
            <li><strong>Síndicos e administradores de condomínio</strong>, apenas as informações que a empresa decidir liberar no Portal do Síndico.</li>
            <li><strong>Fornecedores de infraestrutura</strong> que operam o sistema: hospedagem e banco de dados (Supabase, Vercel) e envio de mensagens (WhatsApp Business Platform, da Meta).</li>
            <li><strong>Autoridades</strong>, quando houver obrigação legal ou ordem judicial.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">6. Por quanto tempo guardamos</h2>
          <p>
            Os registros de ponto e documentos trabalhistas são mantidos pelo prazo exigido pela
            legislação trabalhista e previdenciária, enquanto a empresa mantiver o contrato com o
            PONTZAP. Detalhes de mensagens de WhatsApp são apagados automaticamente em 30 dias. Ao fim
            do contrato, os dados são devolvidos à empresa ou eliminados, salvo obrigação legal de
            guarda.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">7. Segurança</h2>
          <p>
            Acesso por login individual, isolamento dos dados de cada empresa, conexões criptografadas
            (HTTPS), arquivos sensíveis em armazenamento privado e trilha de auditoria das alterações
            feitas por administradores.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">8. Seus direitos</h2>
          <p>
            Você pode pedir confirmação de que tratamos seus dados, acesso, correção, anonimização,
            portabilidade, eliminação (quando não houver obrigação legal de guarda), informação sobre
            compartilhamento e revisão de decisões. Se você é funcionário, o pedido também pode ser
            feito diretamente à sua empresa, que é a controladora.
          </p>
          <p>
            Para deixar de receber avisos pelo WhatsApp, responda à mensagem pedindo o cancelamento ou
            fale com a sua empresa.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">9. Contato</h2>
          <p>
            Dúvidas e solicitações sobre privacidade: WhatsApp <strong>{CONTACT_WHATSAPP}</strong>.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">10. Alterações</h2>
          <p>
            Esta política pode ser atualizada. A data no topo indica a versão em vigor.
          </p>
        </section>

        <footer className="pt-4 border-t border-border text-xs text-muted-foreground">
          <Link to="/" className="underline">Voltar ao PONTZAP</Link>
        </footer>
      </article>
    </div>
  );
}

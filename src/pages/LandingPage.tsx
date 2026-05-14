import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import logoPontzap from '@/assets/logo-pontzap.png';
import logoPontzapBranca from '@/assets/logo-pontzap-branca.png';
import { 
  Clock, 
  MapPin, 
  Bell, 
  Users, 
  QrCode, 
  Smartphone, 
  Shield, 
  TrendingUp,
  Check,
  ArrowRight,
  Star,
  MessageCircle
} from 'lucide-react';

const features = [
  {
    icon: <Clock className="h-8 w-8" />,
    title: "Controle de Ponto Digital",
    description: "Registre entradas, saídas e intervalos com precisão. Elimine planilhas e papelada."
  },
  {
    icon: <MapPin className="h-8 w-8" />,
    title: "Validação por GPS",
    description: "Garanta que seus funcionários estão no local correto com validação por geolocalização."
  },
  {
    icon: <QrCode className="h-8 w-8" />,
    title: "QR Code por Local",
    description: "Cada ponto de trabalho tem seu próprio QR Code. Batida rápida e sem erros."
  },
  {
    icon: <MessageCircle className="h-8 w-8" />,
    title: "Alertas via WhatsApp",
    description: "Receba notificações automáticas de atrasos e batidas diretamente no seu WhatsApp."
  },
  {
    icon: <Users className="h-8 w-8" />,
    title: "Gestão de Escalas",
    description: "Crie escalas fixas ou pontuais. Gerencie trocas entre funcionários facilmente."
  },
  {
    icon: <Smartphone className="h-8 w-8" />,
    title: "App Responsivo (PWA)",
    description: "Funciona em qualquer dispositivo. Instale como app no celular dos seus funcionários."
  },
];

const plans = [
  {
    name: "Essencial",
    description: "Ideal para pequenas equipes",
    price: "R$ 97",
    period: "/mês",
    employees: "1 a 10 funcionários",
    locations: "5 locais de trabalho",
    features: [
      "Controle de ponto digital",
      "QR Code e GPS",
      "Alertas via WhatsApp",
      "Escalas fixas",
      "Relatórios básicos",
      "Suporte por email"
    ],
    popular: false,
    cta: "Começar Agora",
    checkoutUrl: "https://pay.kiwify.com.br/9loygfG"
  },
  {
    name: "Profissional",
    description: "Para empresas em crescimento",
    price: "R$ 197",
    period: "/mês",
    employees: "1 a 20 funcionários",
    locations: "10 locais de trabalho",
    features: [
      "Tudo do plano Essencial",
      "Escalas pontuais",
      "Trocas de escala",
      "Relatórios avançados",
      "Módulo financeiro",
      "Suporte prioritário via WhatsApp"
    ],
    popular: true,
    cta: "Escolher Profissional",
    checkoutUrl: "https://pay.kiwify.com.br/sf3QTrf"
  },
  {
    name: "Empresarial",
    description: "Para operações robustas",
    price: "R$ 297",
    period: "/mês",
    employees: "1 a 40 funcionários",
    locations: "20 locais de trabalho",
    features: [
      "Tudo do plano Profissional",
      "Escalas 12x36 e rotativas",
      "Gestores ilimitados",
      "API para integração",
      "Relatórios personalizados",
      "Suporte dedicado via WhatsApp"
    ],
    popular: false,
    cta: "Escolher Empresarial",
    checkoutUrl: "https://pay.kiwify.com.br/6KEDSIk"
  },
];

const testimonials = [
  {
    name: "Carlos Silva",
    role: "Dono de empresa de jardinagem",
    content: "O PontZap revolucionou minha gestão. Antes eu gastava horas conferindo horários. Agora recebo tudo no WhatsApp automaticamente.",
    rating: 5
  },
  {
    name: "Marina Santos",
    role: "Gestora de piscinas",
    content: "Com funcionários em 8 condomínios diferentes, o controle era impossível. O QR Code resolveu tudo. Recomendo demais!",
    rating: 5
  },
  {
    name: "Roberto Almeida",
    role: "Prestador de serviços",
    content: "Simples de usar, meus funcionários aprenderam em 5 minutos. E o melhor: recebo tudo pelo WhatsApp em tempo real!",
    rating: 5
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <img src={logoPontzap} alt="PontZap" className="h-16 w-auto" />
          <div className="flex items-center gap-4">
            <Link to="/auth">
              <Button variant="ghost">Entrar</Button>
            </Link>
            <a href="#planos">
              <Button className="bg-[#25D366] hover:bg-[#128C7E] text-white gap-2">
                <MessageCircle className="h-4 w-4" />
                Ver Planos
              </Button>
            </a>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4">
        <div className="container mx-auto text-center max-w-4xl">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#25D366]/10 text-[#25D366] text-sm font-medium mb-6">
            <MessageCircle className="h-4 w-4" />
            Notificações automáticas via WhatsApp
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-6 leading-tight">
            Controle de Ponto com{' '}
            <span className="text-[#25D366]">Alertas via WhatsApp</span>
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Ideal para empresas de <strong>jardinagem</strong>, <strong>guardião de piscina</strong>, 
            <strong> limpeza</strong>, <strong>portaria</strong> e outros serviços terceirizados. 
            Receba <strong className="text-[#25D366]">notificações no WhatsApp</strong> sempre que seus funcionários baterem ponto ou se atrasarem.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              size="xl" 
              className="gap-2 shadow-lg bg-[#25D366] hover:bg-[#128C7E] text-white"
              onClick={() => document.getElementById('planos')?.scrollIntoView({ behavior: 'smooth' })}
            >
              <MessageCircle className="h-5 w-5" />
              Escolher Meu Plano
            </Button>
            <Link to="/auth">
              <Button variant="outline" size="xl">
                Já tenho conta
              </Button>
            </Link>
          </div>
          <p className="text-sm text-muted-foreground mt-4">
            ✓ Notificações via WhatsApp &nbsp; ✓ Configuração em 5 minutos &nbsp; ✓ Suporte incluso
          </p>
        </div>
      </section>

      {/* Problem/Solution Section */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Chega de dor de cabeça com controle de ponto
            </h2>
            <p className="text-lg text-muted-foreground">
              Funcionários em múltiplos locais? Dificuldade para conferir horários? 
              Atrasos constantes sem aviso? O PontZap resolve tudo isso.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <Card 
                key={feature.title} 
                className="card-modern hover:shadow-lg transition-all duration-300 animate-slide-up"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <CardContent className="p-6">
                  <div className="p-3 rounded-xl bg-primary/10 text-primary w-fit mb-4">
                    {feature.icon}
                  </div>
                  <h3 className="text-xl font-semibold text-foreground mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Como funciona?
            </h2>
            <p className="text-lg text-muted-foreground">
              Em 3 passos simples você terá controle total da sua equipe
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-[#25D366] text-white flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                1
              </div>
              <h3 className="text-xl font-semibold mb-2">Cadastre seus locais</h3>
              <p className="text-muted-foreground">Adicione os endereços onde seus funcionários trabalham e defina o raio de validação.</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-[#25D366] text-white flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                2
              </div>
              <h3 className="text-xl font-semibold mb-2">Convide sua equipe</h3>
              <p className="text-muted-foreground">Envie convites por email. Seus funcionários acessam pelo celular em segundos.</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-[#25D366] text-white flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                3
              </div>
              <h3 className="text-xl font-semibold mb-2">Receba no WhatsApp</h3>
              <p className="text-muted-foreground">Alertas de atraso e batidas de ponto chegam automaticamente no seu WhatsApp.</p>
            </div>
          </div>
        </div>
      </section>

      {/* WhatsApp Highlight Section */}
      <section className="py-16 bg-[#25D366]/10 border-y border-[#25D366]/20">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-center gap-8 max-w-4xl mx-auto">
            <div className="flex-shrink-0">
              <div className="w-24 h-24 rounded-full bg-[#25D366] flex items-center justify-center animate-float">
                <MessageCircle className="h-12 w-12 text-white" />
              </div>
            </div>
            <div className="text-center md:text-left">
              <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-3">
                Tudo pelo <span className="text-[#25D366]">WhatsApp</span>
              </h2>
              <p className="text-lg text-muted-foreground max-w-xl">
                Receba <strong>notificações em tempo real</strong> direto no seu WhatsApp: 
                entrada, saída, intervalo e <strong>alertas de atraso</strong>. 
                Nunca mais perca uma batida de ponto!
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="planos" className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Planos que cabem no seu bolso
            </h2>
            <p className="text-lg text-muted-foreground">
              Escolha o plano ideal para o tamanho da sua operação.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {plans.map((plan, index) => (
              <Card 
                key={plan.name} 
                className={`relative overflow-hidden animate-slide-up ${plan.popular ? 'border-2 border-[#25D366] shadow-xl scale-105' : 'card-modern'}`}
                style={{ animationDelay: `${index * 100}ms` }}
              >
                {plan.popular && (
                  <div className="absolute top-0 right-0 bg-[#25D366] text-white text-xs font-bold px-3 py-1 rounded-bl-lg">
                    MAIS POPULAR
                  </div>
                )}
                <CardHeader className="text-center pb-2">
                  <CardTitle className="text-2xl">{plan.name}</CardTitle>
                  <CardDescription>{plan.description}</CardDescription>
                </CardHeader>
                <CardContent className="text-center">
                  <div className="mb-4">
                    <span className="text-4xl font-bold text-foreground">{plan.price}</span>
                    <span className="text-muted-foreground">{plan.period}</span>
                  </div>
                  <div className="space-y-2 mb-6 text-sm">
                    <div className="flex items-center justify-center gap-2 font-medium text-foreground">
                      <Users className="h-4 w-4 text-[#25D366]" />
                      {plan.employees}
                    </div>
                    <div className="flex items-center justify-center gap-2 font-medium text-foreground">
                      <MapPin className="h-4 w-4 text-[#25D366]" />
                      {plan.locations}
                    </div>
                  </div>
                  <ul className="space-y-3 text-left mb-6">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm">
                        <Check className="h-4 w-4 text-success shrink-0 mt-0.5" />
                        <span className="text-muted-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  <a href={plan.checkoutUrl} target="_blank" rel="noopener noreferrer" className="w-full">
                    <Button 
                      className={`w-full ${plan.popular ? 'bg-[#25D366] hover:bg-[#128C7E] text-white' : ''}`}
                      variant={plan.popular ? "default" : "outline"}
                      size="lg"
                    >
                      {plan.cta}
                    </Button>
                  </a>
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              O que nossos clientes dizem
            </h2>
            <p className="text-lg text-muted-foreground">
              Empresas como a sua já estão economizando tempo e dinheiro
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {testimonials.map((testimonial, index) => (
              <Card 
                key={testimonial.name} 
                className="card-modern animate-slide-up"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <CardContent className="p-6">
                  <div className="flex gap-1 mb-4">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <Star key={i} className="h-5 w-5 fill-warning text-warning" />
                    ))}
                  </div>
                  <p className="text-muted-foreground mb-4 italic">"{testimonial.content}"</p>
                  <div>
                    <p className="font-semibold text-foreground">{testimonial.name}</p>
                    <p className="text-sm text-muted-foreground">{testimonial.role}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-[#25D366] text-white">
        <div className="container mx-auto px-4 text-center">
          <div className="flex items-center justify-center gap-3 mb-6">
            <MessageCircle className="h-12 w-12" />
            <h2 className="text-3xl md:text-4xl font-bold">
              Receba tudo pelo WhatsApp!
            </h2>
          </div>
          <p className="text-xl opacity-90 mb-8 max-w-2xl mx-auto">
            Alertas de atraso, batidas de ponto, tudo direto no seu WhatsApp. 
            Comece agora em 5 minutos!
          </p>
          <a href="#planos">
            <Button size="xl" className="gap-2 shadow-lg bg-white text-[#25D366] hover:bg-gray-100">
              Escolher Meu Plano
              <ArrowRight className="h-5 w-5" />
            </Button>
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-border">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <img src={logoPontzap} alt="PontZap" className="h-12 w-auto" />
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} PontZap. Todos os direitos reservados.
            </p>
            <div className="flex items-center gap-4">
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground">Termos</a>
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground">Privacidade</a>
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground">Contato</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

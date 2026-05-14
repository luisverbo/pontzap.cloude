import { AlertTriangle, CreditCard, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import logoPontzap from "@/assets/logo-pontzap.png";

interface BlockedAccessProps {
  status: 'cancelled' | 'pending' | 'overdue';
  paymentStatus?: string;
}

export default function BlockedAccess({ status, paymentStatus }: BlockedAccessProps) {
  const { signOut } = useAuth();

  const getStatusInfo = () => {
    switch (status) {
      case 'cancelled':
        return {
          title: 'Assinatura Cancelada',
          description: 'Sua assinatura foi cancelada. Para continuar usando o PontZap, é necessário reativar seu plano.',
          buttonText: 'Reativar Assinatura',
          icon: <AlertTriangle className="h-16 w-16 text-destructive" />,
        };
      case 'overdue':
      case 'pending':
        return {
          title: 'Pagamento Pendente',
          description: 'Identificamos um problema com o pagamento da sua assinatura. Regularize para continuar usando o PontZap.',
          buttonText: 'Regularizar Pagamento',
          icon: <CreditCard className="h-16 w-16 text-warning" />,
        };
      default:
        return {
          title: 'Acesso Bloqueado',
          description: 'Seu acesso está temporariamente bloqueado. Entre em contato com o suporte.',
          buttonText: 'Entrar em Contato',
          icon: <AlertTriangle className="h-16 w-16 text-muted-foreground" />,
        };
    }
  };

  const statusInfo = getStatusInfo();

  const handleRegularize = () => {
    // Redirect to landing page pricing section
    window.open('/#planos', '_blank');
  };

  const handleLogout = async () => {
    await signOut();
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center p-4">
      <Card className="max-w-md w-full text-center">
        <CardHeader className="space-y-4">
          <div className="flex justify-center">
            <img src={logoPontzap} alt="PontZap" className="h-12" />
          </div>
          <div className="flex justify-center">
            {statusInfo.icon}
          </div>
          <CardTitle className="text-2xl">{statusInfo.title}</CardTitle>
          <CardDescription className="text-base">
            {statusInfo.description}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {paymentStatus && (
            <p className="text-sm text-muted-foreground">
              Status do pagamento: <span className="font-medium capitalize">{paymentStatus}</span>
            </p>
          )}
          
          <Button 
            onClick={handleRegularize} 
            className="w-full" 
            size="lg"
          >
            <CreditCard className="mr-2 h-5 w-5" />
            {statusInfo.buttonText}
          </Button>
          
          <Button 
            onClick={handleLogout} 
            variant="outline" 
            className="w-full"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sair da Conta
          </Button>
          
          <p className="text-xs text-muted-foreground pt-4">
            Precisa de ajuda? Entre em contato pelo WhatsApp ou email do suporte.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
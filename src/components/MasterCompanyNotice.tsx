import { Card, CardContent } from '@/components/ui/card';
import { Building2 } from 'lucide-react';

/**
 * Mostrado quando um usuário master abre uma tela de dados sem ter escolhido
 * uma empresa. Antes, nesse caso a tela trazia TODAS as empresas misturadas —
 * agora não traz nada e explica o porquê.
 */
export function MasterCompanyNotice() {
  return (
    <Card className="border-warning/40 bg-warning/5">
      <CardContent className="py-10 text-center">
        <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-warning/10 flex items-center justify-center">
          <Building2 className="h-6 w-6 text-warning" />
        </div>
        <p className="font-medium">Escolha uma empresa</p>
        <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
          Você está logado como <strong>Master</strong>, que não pertence a nenhuma empresa.
          Selecione a empresa que quer administrar no <strong>Painel Master → Empresas</strong>
          {' '}(botão de acessar) para ver os dados dela aqui.
        </p>
      </CardContent>
    </Card>
  );
}

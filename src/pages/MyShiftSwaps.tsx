import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ShiftSwapSection } from '@/components/employee/ShiftSwapSection';

export default function MyShiftSwaps() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [employeeData, setEmployeeData] = useState<{ id: string; companyId: string | null } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEmployeeData = async () => {
      if (!user) return;

      try {
        const { data: employee, error } = await supabase
          .from('employees')
          .select('id, company_id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) throw error;

        if (employee) {
          setEmployeeData({
            id: employee.id,
            companyId: employee.company_id,
          });
        }
      } catch (error) {
        console.error('Error fetching employee data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchEmployeeData();
  }, [user]);

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto px-4 sm:px-0 space-y-4 sm:space-y-6 animate-fade-in pb-6">
        {/* Header with back button */}
        <div className="flex items-center gap-3 pt-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/clock-in')}
            className="shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">
              Troca de Escalas
            </h1>
            <p className="text-muted-foreground text-xs sm:text-sm">
              Solicite ou aceite trocas de escala com colegas
            </p>
          </div>
        </div>

        {/* Shift Swap Section */}
        {employeeData?.id ? (
          <ShiftSwapSection 
            employeeId={employeeData.id} 
            companyId={employeeData.companyId} 
          />
        ) : (
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-muted-foreground">
                Você não está cadastrado como funcionário.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  );
}

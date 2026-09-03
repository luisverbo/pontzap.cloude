import { supabase } from '@/integrations/supabase/client';
import { getImpersonatedCompanyId } from '@/components/ImpersonationBar';

/**
 * UUID que não pertence a nenhuma empresa. As consultas SEMPRE filtram por
 * company_id; quando não há empresa no escopo usamos este valor, então o
 * resultado vem vazio em vez de trazer tudo. Falha fechada, por definição.
 */
export const NO_COMPANY_ID = '00000000-0000-0000-0000-000000000000';

export interface CompanyScope {
  /** Sempre preenchido — NO_COMPANY_ID quando não há empresa no escopo. */
  companyId: string;
  /** true = master sem empresa escolhida; a tela deve pedir a seleção. */
  needsSelection: boolean;
}

/**
 * Empresa cujos dados devem aparecer agora:
 *   1. a empresa que o master está acessando (impersonação)
 *   2. a empresa do usuário (funcionário) ou a que ele administra (dono)
 *   3. nenhuma → master puro, que precisa escolher uma empresa
 *
 * Antes disso, quando não havia empresa resolvida a consulta ia sem filtro e o
 * RLS deixava o master ver TODAS as empresas de uma vez, misturadas.
 */
export async function getCompanyScope(): Promise<CompanyScope> {
  const impersonated = getImpersonatedCompanyId();
  if (impersonated) return { companyId: impersonated, needsSelection: false };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { companyId: NO_COMPANY_ID, needsSelection: false };

  const { data: employee } = await supabase
    .from('employees')
    .select('company_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (employee?.company_id) return { companyId: employee.company_id, needsSelection: false };

  // O dono da empresa normalmente não tem linha em employees
  const { data: owned } = await supabase
    .from('companies')
    .select('id')
    .eq('admin_user_id', user.id)
    .maybeSingle();
  if (owned?.id) return { companyId: owned.id, needsSelection: false };

  return { companyId: NO_COMPANY_ID, needsSelection: true };
}

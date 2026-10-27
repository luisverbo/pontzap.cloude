import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getCompanyScope, NO_COMPANY_ID } from '@/lib/companyScope';

export type AdvanceKind = 'vale' | 'adiantamento';
export type AdvanceStatus = 'pending' | 'approved' | 'rejected' | 'paid' | 'cancelled';
export type PixKeyType = 'cpf' | 'cnpj' | 'phone' | 'email' | 'random';

export interface AdvanceRequest {
  id: string;
  company_id: string;
  employee_id: string;
  kind: AdvanceKind;
  amount: number;
  installments: number;
  reason: string | null;
  pix_key: string | null;
  pix_key_type: PixKeyType | null;
  pix_key_owner_name: string | null;
  status: AdvanceStatus;
  approved_amount: number | null;
  review_note: string | null;
  reviewed_at: string | null;
  paid_at: string | null;
  financial_entry_id: string | null;
  notified_at: string | null;
  created_at: string;
  /** Resolvido em segundo passe (employees não tem relação com profiles). */
  employee_name?: string | null;
}

export interface AdvanceConfig {
  company_id: string;
  enabled: boolean;
  allow_vale: boolean;
  allow_adiantamento: boolean;
  max_amount: number | null;
  max_total_per_month: number | null;
  max_requests_per_month: number;
  min_days_between: number;
  window_day_from: number | null;
  window_day_to: number | null;
  require_reason: boolean;
  max_installments: number;
  notify_whatsapp: string | null;
  rules_text: string | null;
}

export const ADVANCE_KIND_LABELS: Record<AdvanceKind, string> = {
  vale: 'Vale',
  adiantamento: 'Adiantamento',
};

export const ADVANCE_STATUS: Record<
  AdvanceStatus,
  { label: string; variant: 'secondary' | 'warning' | 'success' | 'destructive' }
> = {
  pending: { label: 'Aguardando aprovação', variant: 'warning' },
  approved: { label: 'Aprovado', variant: 'success' },
  rejected: { label: 'Recusado', variant: 'destructive' },
  paid: { label: 'Pago', variant: 'success' },
  cancelled: { label: 'Cancelado', variant: 'secondary' },
};

export const PIX_KEY_TYPE_LABELS: Record<PixKeyType, string> = {
  cpf: 'CPF',
  cnpj: 'CNPJ',
  phone: 'Telefone',
  email: 'E-mail',
  random: 'Chave aleatória',
};

export const DEFAULT_ADVANCE_CONFIG: Omit<AdvanceConfig, 'company_id'> = {
  enabled: false,
  allow_vale: true,
  allow_adiantamento: true,
  max_amount: null,
  max_total_per_month: null,
  max_requests_per_month: 1,
  min_days_between: 0,
  window_day_from: null,
  window_day_to: null,
  require_reason: false,
  max_installments: 1,
  notify_whatsapp: '',
  rules_text: null,
};

export const formatMoney = (value: number | null | undefined): string =>
  `R$ ${Number(value ?? 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/** Dispara o aviso no WhatsApp. Nunca derruba a ação principal se falhar. */
export async function notifyAdvance(
  requestId: string,
  notificationType: 'requested' | 'approved' | 'rejected' | 'paid',
): Promise<{ sent: boolean; reason?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('advance-notify', {
      body: { requestId, notificationType },
    });
    if (error) throw error;
    return { sent: !!data?.sent, reason: data?.reason };
  } catch (e) {
    console.error('Erro ao avisar no WhatsApp:', e);
    return { sent: false, reason: 'Falha ao contatar o serviço de WhatsApp' };
  }
}

/**
 * Regras da empresa. Para o funcionário é só leitura; o admin usa o mesmo
 * hook na tela de configuração.
 */
export function useAdvanceConfig() {
  const [config, setConfig] = useState<AdvanceConfig | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const scope = await getCompanyScope();
      const id = scope.companyId === NO_COMPANY_ID ? null : scope.companyId;
      setCompanyId(id);
      if (!id) { setConfig(null); return; }

      const { data } = await supabase
        .from('advance_config' as any)
        .select('*')
        .eq('company_id', id)
        .maybeSingle();

      setConfig(
        data
          ? (data as unknown as AdvanceConfig)
          : ({ company_id: id, ...DEFAULT_ADVANCE_CONFIG } as AdvanceConfig),
      );
    } catch (e) {
      console.error('Erro ao carregar regras de vale:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  return { config, companyId, loading, refetch };
}

/**
 * Pedidos visíveis para quem está logado. A RLS já limita: o funcionário vê
 * só os próprios, o admin vê a empresa inteira.
 */
export function useAdvanceRequests() {
  const [requests, setRequests] = useState<AdvanceRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('advance_requests' as any)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;

      const rows = (data || []) as unknown as AdvanceRequest[];

      const empIds = [...new Set(rows.map((r) => r.employee_id))];
      if (empIds.length) {
        const { data: emps } = await supabase
          .from('employees')
          .select('id, user_id')
          .in('id', empIds);
        const userIds = [...new Set((emps || []).map((e: any) => e.user_id).filter(Boolean))];
        const { data: profs } = userIds.length
          ? await supabase.from('profiles').select('id, name').in('id', userIds)
          : { data: [] as any[] };
        const nameByUser = Object.fromEntries((profs || []).map((p: any) => [p.id, p.name]));
        const nameByEmp = Object.fromEntries(
          (emps || []).map((e: any) => [e.id, nameByUser[e.user_id] || 'Funcionário']),
        );
        rows.forEach((r) => { r.employee_name = nameByEmp[r.employee_id] ?? null; });
      }

      setRequests(rows);
    } catch (e) {
      console.error('Erro ao carregar pedidos de vale:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  return { requests, loading, refetch };
}

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getImpersonatedCompanyId } from '@/components/ImpersonationBar';
import { dataUrlToBlob } from '@/lib/photoPicker';

export type OccurrenceStatus = 'internal' | 'pending_approval' | 'approved' | 'rejected';
export type OccurrenceSeverity = 'low' | 'medium' | 'high';

export interface OccurrenceType {
  id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
}

export interface Occurrence {
  id: string;
  company_id: string;
  employee_id: string | null;
  location_id: string | null;
  type_id: string | null;
  type_name: string;
  description: string;
  severity: OccurrenceSeverity;
  photo_paths: string[];
  occurred_at: string;
  send_to_condo: boolean;
  status: OccurrenceStatus;
  public_token: string | null;
  approved_at: string | null;
  review_note: string | null;
  created_at: string;
  locations?: { name: string } | null;
  /** Resolved separately (see useOccurrences) — employees has no FK to profiles. */
  employee_name?: string | null;
}

export const SEVERITY_LABELS: Record<OccurrenceSeverity, string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
};

export const STATUS_LABELS: Record<OccurrenceStatus, { label: string; variant: 'secondary' | 'warning' | 'success' | 'destructive' }> = {
  internal: { label: 'Interna', variant: 'secondary' },
  pending_approval: { label: 'Aguardando aprovação', variant: 'warning' },
  approved: { label: 'Enviada ao condomínio', variant: 'success' },
  rejected: { label: 'Não enviada', variant: 'destructive' },
};

export async function resolveCompanyId(companyStatusId?: string | null): Promise<string | null> {
  const imp = getImpersonatedCompanyId();
  if (imp) return imp;
  if (companyStatusId) return companyStatusId;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: emp } = await supabase.from('employees').select('company_id').eq('user_id', user.id).maybeSingle();
  if (emp?.company_id) return emp.company_id;
  const { data: owned } = await supabase.from('companies').select('id').eq('admin_user_id', user.id).maybeSingle();
  return owned?.id ?? null;
}

/** Public URL for a stored occurrence photo. */
export function photoUrl(path: string): string {
  return supabase.storage.from('occurrence-photos').getPublicUrl(path).data.publicUrl;
}

/** Upload the captured data-URL photos, returning their storage paths. */
export async function uploadOccurrencePhotos(dataUrls: string[]): Promise<string[]> {
  const paths: string[] = [];
  for (const dataUrl of dataUrls) {
    const blob = dataUrlToBlob(dataUrl);
    const path = `${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage
      .from('occurrence-photos')
      .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    if (error) throw error;
    paths.push(path);
  }
  return paths;
}

/** Occurrence types of the current company (for the picker and admin settings). */
export function useOccurrenceTypes() {
  const [types, setTypes] = useState<OccurrenceType[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('occurrence_types')
        .select('id, name, is_active, sort_order')
        .order('sort_order')
        .order('name');
      if (error) throw error;
      setTypes((data || []) as OccurrenceType[]);
    } catch (e) {
      console.error('Erro ao carregar tipos de ocorrência:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  return { types, activeTypes: types.filter(t => t.is_active), loading, refetch };
}

/**
 * Occurrences visible to the current user. RLS already scopes this: an employee
 * only ever sees their own rows, an admin sees the whole company.
 */
export function useOccurrences() {
  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('occurrences')
        .select('*, locations(name)')
        .order('created_at', { ascending: false });
      if (error) throw error;

      const rows = (data || []) as unknown as Occurrence[];

      // employees has no PostgREST relationship to profiles (both point at
      // auth.users), so resolve the reporter names in a second pass — same
      // approach used by useEmployees.
      const employeeIds = [...new Set(rows.map((r) => r.employee_id).filter(Boolean))] as string[];
      if (employeeIds.length > 0) {
        const { data: emps } = await supabase
          .from('employees')
          .select('id, user_id')
          .in('id', employeeIds);
        const userIds = [...new Set((emps || []).map((e: any) => e.user_id).filter(Boolean))];
        const { data: profs } = userIds.length
          ? await supabase.from('profiles').select('id, name').in('id', userIds)
          : { data: [] as any[] };

        const nameByEmployeeId = new Map<string, string>();
        (emps || []).forEach((e: any) => {
          const name = (profs || []).find((p: any) => p.id === e.user_id)?.name;
          if (name) nameByEmployeeId.set(e.id, name);
        });
        rows.forEach((r) => {
          r.employee_name = r.employee_id ? nameByEmployeeId.get(r.employee_id) ?? null : null;
        });
      }

      setOccurrences(rows);
    } catch (e) {
      console.error('Erro ao carregar ocorrências:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  return { occurrences, loading, refetch };
}

/** Generate the unguessable token used by the public condo link. */
export function generatePublicToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function publicOccurrenceUrl(token: string): string {
  return `${window.location.origin}/ocorrencia/${token}`;
}

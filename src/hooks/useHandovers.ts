import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { audioExtension, type AudioRecording } from '@/lib/audioRecorder';

export interface Handover {
  id: string;
  company_id: string;
  location_id: string;
  employee_id: string;
  note: string | null;
  audio_path: string | null;
  audio_seconds: number | null;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  created_at: string;
  location_name?: string | null;
  employee_name?: string | null;
  acknowledged_name?: string | null;
}

/** Link temporário (1 h) para o áudio — o bucket é privado. */
export async function handoverAudioUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from('handover-audio').createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export async function uploadHandoverAudio(rec: AudioRecording): Promise<string> {
  const path = `${crypto.randomUUID()}.${audioExtension(rec.mimeType)}`;
  const { error } = await supabase.storage
    .from('handover-audio')
    .upload(path, rec.blob, { contentType: rec.mimeType, upsert: false });
  if (error) throw error;
  return path;
}

export async function createHandover(input: {
  locationId: string;
  note?: string;
  audio?: AudioRecording | null;
}): Promise<string> {
  const audioPath = input.audio ? await uploadHandoverAudio(input.audio) : null;
  const { data, error } = await supabase
    .from('shift_handovers' as any)
    .insert({
      location_id: input.locationId,
      note: input.note?.trim() || null,
      audio_path: audioPath,
      audio_seconds: input.audio?.seconds ?? null,
    } as any)
    .select('id')
    .single();
  if (error) throw error;
  return (data as any).id;
}

export async function acknowledgeHandover(id: string, employeeId: string): Promise<void> {
  const { error } = await supabase
    .from('shift_handovers' as any)
    .update({ acknowledged_by: employeeId, acknowledged_at: new Date().toISOString() } as any)
    .eq('id', id);
  if (error) throw error;
}

/**
 * Passagens visíveis para quem está logado (RLS: funcionário vê os locais
 * dele, admin vê a empresa). Resolve nomes de local e de pessoa.
 */
export function useHandovers(options: { locationId?: string | null; limit?: number } = {}) {
  const [handovers, setHandovers] = useState<Handover[]>([]);
  const [loading, setLoading] = useState(true);
  const { locationId, limit = 100 } = options;

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase
        .from('shift_handovers' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (locationId) q = q.eq('location_id', locationId);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data || []) as unknown as Handover[];

      const locIds = [...new Set(rows.map((r) => r.location_id))];
      const empIds = [...new Set(rows.flatMap((r) => [r.employee_id, r.acknowledged_by]).filter(Boolean))] as string[];

      const [{ data: locs }, { data: emps }] = await Promise.all([
        locIds.length ? supabase.from('locations').select('id, name').in('id', locIds) : Promise.resolve({ data: [] as any[] }),
        empIds.length ? supabase.from('employees').select('id, user_id').in('id', empIds) : Promise.resolve({ data: [] as any[] }),
      ]);
      const userIds = [...new Set((emps || []).map((e: any) => e.user_id).filter(Boolean))];
      const { data: profs } = userIds.length
        ? await supabase.from('profiles').select('id, name').in('id', userIds)
        : { data: [] as any[] };

      const locName = new Map((locs || []).map((l: any) => [l.id, l.name]));
      const nameByUser = new Map((profs || []).map((p: any) => [p.id, p.name]));
      const nameByEmp = new Map((emps || []).map((e: any) => [e.id, nameByUser.get(e.user_id) || 'Guardião']));

      rows.forEach((r) => {
        r.location_name = locName.get(r.location_id) ?? null;
        r.employee_name = nameByEmp.get(r.employee_id) ?? null;
        r.acknowledged_name = r.acknowledged_by ? nameByEmp.get(r.acknowledged_by) ?? null : null;
      });
      setHandovers(rows);
    } catch (e) {
      console.error('Erro ao carregar passagens de turno:', e);
    } finally {
      setLoading(false);
    }
  }, [locationId, limit]);

  useEffect(() => { refetch(); }, [refetch]);

  return { handovers, loading, refetch };
}

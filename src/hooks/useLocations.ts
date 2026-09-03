import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { getImpersonatedCompanyId } from '@/components/ImpersonationBar';

type Location = Tables<'locations'>;
type LocationInsert = TablesInsert<'locations'>;
type LocationUpdate = TablesUpdate<'locations'>;

// Helper function to get current user's company_id.
// O dono da empresa normalmente NÃO tem linha em employees, então a busca
// precisa cair para companies.admin_user_id — sem isso, cadastrar local
// falhava com "Não foi possível identificar a empresa".
async function getUserCompanyId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: employee } = await supabase
    .from('employees')
    .select('company_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (employee?.company_id) return employee.company_id;

  const { data: owned } = await supabase
    .from('companies')
    .select('id')
    .eq('admin_user_id', user.id)
    .maybeSingle();

  return owned?.id ?? null;
}

export function useLocations() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLocations = async () => {
    try {
      const impersonatedCompanyId = getImpersonatedCompanyId();
      
      let query = supabase
        .from('locations')
        .select('*')
        .order('name');
      
      if (impersonatedCompanyId) {
        query = query.eq('company_id', impersonatedCompanyId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setLocations(data || []);
    } catch (error: any) {
      console.error('Error fetching locations:', error);
      toast.error('Erro ao carregar locais');
    } finally {
      setLoading(false);
    }
  };

  const addLocation = async (location: Omit<LocationInsert, 'id' | 'created_at' | 'updated_at' | 'qr_code' | 'company_id'>) => {
    try {
      // Get company_id: prioritize impersonated company, then user's own company
      const impersonatedCompanyId = getImpersonatedCompanyId();
      const companyId = impersonatedCompanyId || await getUserCompanyId();

      if (!companyId) {
        throw new Error('Não foi possível identificar a empresa. Faça login novamente.');
      }

      const { data, error } = await supabase
        .from('locations')
        .insert({ ...location, company_id: companyId })
        .select()
        .single();

      if (error) throw error;
      setLocations([...locations, data]);
      toast.success('Local de trabalho adicionado!');
      return data;
    } catch (error: any) {
      console.error('Error adding location:', error);
      toast.error(error.message || 'Erro ao adicionar local');
      throw error;
    }
  };

  const updateLocation = async (id: string, updates: LocationUpdate) => {
    try {
      const { data, error } = await supabase
        .from('locations')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      setLocations(locations.map(loc => loc.id === id ? data : loc));
      toast.success('Local atualizado!');
      return data;
    } catch (error: any) {
      console.error('Error updating location:', error);
      toast.error('Erro ao atualizar local');
      throw error;
    }
  };

  const deleteLocation = async (id: string) => {
    try {
      const { error } = await supabase
        .from('locations')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setLocations(locations.filter(loc => loc.id !== id));
      toast.success('Local removido!');
    } catch (error: any) {
      console.error('Error deleting location:', error);
      toast.error('Erro ao remover local');
      throw error;
    }
  };

  useEffect(() => {
    fetchLocations();
  }, []);

  return {
    locations,
    loading,
    addLocation,
    updateLocation,
    deleteLocation,
    refetch: fetchLocations,
  };
}
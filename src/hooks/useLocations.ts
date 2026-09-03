import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { getCompanyScope, NO_COMPANY_ID } from '@/lib/companyScope';

type Location = Tables<'locations'>;
type LocationInsert = TablesInsert<'locations'>;
type LocationUpdate = TablesUpdate<'locations'>;

export function useLocations() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsCompanySelection, setNeedsCompanySelection] = useState(false);

  const fetchLocations = async () => {
    try {
      // Sempre no escopo de UMA empresa (evita o master ver todas juntas)
      const scope = await getCompanyScope();
      setNeedsCompanySelection(scope.needsSelection);

      const { data, error } = await supabase
        .from('locations')
        .select('*')
        .eq('company_id', scope.companyId)
        .order('name');

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
      // Mesmo escopo do fetch: empresa acessada, ou a do próprio usuário
      const scope = await getCompanyScope();
      if (scope.needsSelection) {
        throw new Error('Escolha uma empresa na barra do topo antes de cadastrar o local.');
      }
      if (scope.companyId === NO_COMPANY_ID) {
        throw new Error('Não foi possível identificar a empresa. Faça login novamente.');
      }

      const { data, error } = await supabase
        .from('locations')
        .insert({ ...location, company_id: scope.companyId })
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
    needsCompanySelection,
    addLocation,
    updateLocation,
    deleteLocation,
    refetch: fetchLocations,
  };
}
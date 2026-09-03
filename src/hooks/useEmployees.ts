import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Tables, TablesUpdate } from '@/integrations/supabase/types';
import { getCompanyScope } from '@/lib/companyScope';

type Employee = Tables<'employees'>;
type EmployeeLocation = Tables<'employee_locations'>;

export interface EmployeeWithProfile extends Employee {
  profile?: {
    name: string;
    email: string;
    phone?: string | null;
  };
  locations?: (EmployeeLocation & {
    location?: Tables<'locations'>;
  })[];
}

export function useEmployees() {
  const [employees, setEmployees] = useState<EmployeeWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsCompanySelection, setNeedsCompanySelection] = useState(false);

  const fetchEmployees = async () => {
    try {
      // Sempre no escopo de UMA empresa. Sem isso, o master via todas juntas.
      const scope = await getCompanyScope();
      setNeedsCompanySelection(scope.needsSelection);

      const { data: employeesData, error: employeesError } = await supabase
        .from('employees')
        .select('*')
        .eq('company_id', scope.companyId)
        .order('created_at', { ascending: false });

      if (employeesError) throw employeesError;

      // Fetch profiles for all employees
      const userIds = (employeesData || []).map(emp => emp.user_id);
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, name, email, phone')
        .in('id', userIds.length > 0 ? userIds : ['']);

      if (profilesError) throw profilesError;

      // Fetch employee locations
      const employeeIds = (employeesData || []).map(emp => emp.id);
      const { data: locationsData, error: locationsError } = await supabase
        .from('employee_locations')
        .select(`
          *,
          location:locations(*)
        `)
        .in('employee_id', employeeIds.length > 0 ? employeeIds : ['']);

      if (locationsError) throw locationsError;

      // Merge data
      const employeesWithDetails = (employeesData || []).map(emp => ({
        ...emp,
        profile: (profilesData || []).find(p => p.id === emp.user_id),
        locations: (locationsData || []).filter(loc => loc.employee_id === emp.id),
      }));

      setEmployees(employeesWithDetails);
    } catch (error: any) {
      console.error('Error fetching employees:', error);
      toast.error('Erro ao carregar funcionários');
    } finally {
      setLoading(false);
    }
  };

  const updateEmployee = async (id: string, updates: TablesUpdate<'employees'>) => {
    try {
      const { data, error } = await supabase
        .from('employees')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      await fetchEmployees();
      toast.success('Funcionário atualizado!');
      return data;
    } catch (error: any) {
      console.error('Error updating employee:', error);
      toast.error('Erro ao atualizar funcionário');
      throw error;
    }
  };

  const assignLocations = async (employeeId: string, locationIds: string[], primaryLocationId?: string) => {
    try {
      // Remove existing assignments
      await supabase
        .from('employee_locations')
        .delete()
        .eq('employee_id', employeeId);

      // Add new assignments
      if (locationIds.length > 0) {
        const { error } = await supabase
          .from('employee_locations')
          .insert(
            locationIds.map(locationId => ({
              employee_id: employeeId,
              location_id: locationId,
              is_primary: locationId === primaryLocationId,
            }))
          );

        if (error) throw error;
      }

      await fetchEmployees();
      toast.success('Locais atualizados!');
    } catch (error: any) {
      console.error('Error assigning locations:', error);
      toast.error('Erro ao atualizar locais');
      throw error;
    }
  };

  const deleteEmployee = async (id: string) => {
    try {
      const { error } = await supabase
        .from('employees')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setEmployees(employees.filter(emp => emp.id !== id));
      toast.success('Funcionário removido!');
    } catch (error: any) {
      console.error('Error deleting employee:', error);
      toast.error('Erro ao remover funcionário');
      throw error;
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  return {
    employees,
    loading,
    needsCompanySelection,
    updateEmployee,
    assignLocations,
    deleteEmployee,
    refetch: fetchEmployees,
  };
}
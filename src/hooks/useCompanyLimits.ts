import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getImpersonatedCompanyId } from '@/components/ImpersonationBar';

interface CompanyLimits {
  maxEmployees: number;
  maxLocations: number;
  currentEmployees: number;
  currentLocations: number;
}

export function useCompanyLimits() {
  const [limits, setLimits] = useState<CompanyLimits | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchLimits = async () => {
    try {
      const impersonatedCompanyId = getImpersonatedCompanyId();
      
      // Get company limits
      let companyQuery = supabase
        .from('companies')
        .select('max_employees, max_locations');
      
      if (impersonatedCompanyId) {
        companyQuery = companyQuery.eq('id', impersonatedCompanyId);
      }
      
      const { data: companyData, error: companyError } = await companyQuery.maybeSingle();
      
      if (companyError || !companyData) {
        // Try to get via employee's company
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: employeeData } = await supabase
            .from('employees')
            .select('company_id')
            .eq('user_id', user.id)
            .maybeSingle();
          
          if (employeeData?.company_id) {
            const { data: company } = await supabase
              .from('companies')
              .select('max_employees, max_locations')
              .eq('id', employeeData.company_id)
              .maybeSingle();
            
            if (company) {
              // Count current employees and locations
              const [employeesResult, locationsResult] = await Promise.all([
                supabase
                  .from('employees')
                  .select('id', { count: 'exact', head: true })
                  .eq('company_id', employeeData.company_id)
                  .eq('is_active', true),
                supabase
                  .from('locations')
                  .select('id', { count: 'exact', head: true })
                  .eq('company_id', employeeData.company_id)
              ]);
              
              setLimits({
                maxEmployees: company.max_employees,
                maxLocations: company.max_locations,
                currentEmployees: employeesResult.count || 0,
                currentLocations: locationsResult.count || 0,
              });
              return;
            }
          }
        }
        setLimits(null);
        return;
      }
      
      // Count current employees and locations for impersonated company
      if (impersonatedCompanyId) {
        const [employeesResult, locationsResult] = await Promise.all([
          supabase
            .from('employees')
            .select('id', { count: 'exact', head: true })
            .eq('company_id', impersonatedCompanyId)
            .eq('is_active', true),
          supabase
            .from('locations')
            .select('id', { count: 'exact', head: true })
            .eq('company_id', impersonatedCompanyId)
        ]);
        
        setLimits({
          maxEmployees: companyData.max_employees,
          maxLocations: companyData.max_locations,
          currentEmployees: employeesResult.count || 0,
          currentLocations: locationsResult.count || 0,
        });
      } else {
        setLimits({
          maxEmployees: companyData.max_employees,
          maxLocations: companyData.max_locations,
          currentEmployees: 0,
          currentLocations: 0,
        });
      }
    } catch (error) {
      console.error('Error fetching company limits:', error);
      setLimits(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLimits();
  }, []);

  return { limits, loading, refetch: fetchLimits };
}

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { UserRole } from '@/types';

interface CompanyStatus {
  id: string;
  status: string;
  paymentStatus: string | null;
  isBlocked: boolean;
}

interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  companyStatus: CompanyStatus | null;
  loading: boolean;
  isMasterUser: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, name: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [companyStatus, setCompanyStatus] = useState<CompanyStatus | null>(null);
  const [isMasterUser, setIsMasterUser] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string, userEmail?: string) => {
    try {
      // Fetch profile from database
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (profileError) {
        console.error('Error fetching profile:', profileError);
      }

      // Fetch user role
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();

      if (roleError) {
        console.error('Error fetching role:', roleError);
      }

      // If user is an employee, mark invitation as accepted
      if (roleData?.role === 'employee') {
        const { data: employeeData } = await supabase
          .from('employees')
          .select('id, invitation_accepted')
          .eq('user_id', userId)
          .maybeSingle();

        if (employeeData && !employeeData.invitation_accepted) {
          await supabase
            .from('employees')
            .update({ invitation_accepted: true })
            .eq('id', employeeData.id);
        }
      }

      if (profileData) {
        return {
          id: profileData.id,
          email: profileData.email || userEmail || '',
          name: profileData.name || 'Usuário',
          role: (roleData?.role as UserRole) || 'employee',
        };
      }

      // Fallback if profile doesn't exist yet
      return {
        id: userId,
        email: userEmail || '',
        name: userEmail?.split('@')[0] || 'Usuário',
        role: (roleData?.role as UserRole) || ('employee' as UserRole),
      };
    } catch (error) {
      console.error('Error in fetchProfile:', error);
      // Fallback even if something goes wrong (prevents blank screen/spinner loop)
      return {
        id: userId,
        email: userEmail || '',
        name: userEmail?.split('@')[0] || 'Usuário',
        role: 'employee' as UserRole,
      };
    }
  };

  const fetchCompanyStatus = async (userId: string) => {
    try {
      // Check if user is master user
      const { data: masterData } = await supabase
        .from('master_users')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

      if (masterData) {
        setIsMasterUser(true);
        setCompanyStatus(null); // Master users are never blocked
        return;
      }

      // Get employee's company
      const { data: employeeData, error: employeeError } = await supabase
        .from('employees')
        .select('company_id')
        .eq('user_id', userId)
        .maybeSingle();

      if (employeeError || !employeeData?.company_id) {
        console.log('No company found for user');
        setCompanyStatus(null);
        return;
      }

      // Get company status
      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .select('id, status, payment_status, is_blocked')
        .eq('id', employeeData.company_id)
        .maybeSingle();

      if (companyError || !companyData) {
        console.error('Error fetching company status:', companyError);
        setCompanyStatus(null);
        return;
      }

      setCompanyStatus({
        id: companyData.id,
        status: companyData.status,
        paymentStatus: companyData.payment_status,
        isBlocked: companyData.is_blocked || companyData.status !== 'active',
      });
    } catch (error) {
      console.error('Error in fetchCompanyStatus:', error);
      setCompanyStatus(null);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          setTimeout(() => {
            fetchProfile(session.user.id, session.user.email).then(setProfile);
            fetchCompanyStatus(session.user.id);
          }, 0);
        } else {
          setProfile(null);
          setCompanyStatus(null);
          setIsMasterUser(false);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        fetchProfile(session.user.id, session.user.email).then(setProfile);
        fetchCompanyStatus(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string, name: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: { name },
      },
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setCompanyStatus(null);
    setIsMasterUser(false);
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, companyStatus, isMasterUser, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

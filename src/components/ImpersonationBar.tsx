import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { X, Shield } from 'lucide-react';

interface ImpersonatedCompany {
  id: string;
  name: string;
  email: string;
}

export function ImpersonationBar() {
  const [company, setCompany] = useState<ImpersonatedCompany | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('impersonating_company');
    if (stored) {
      try {
        setCompany(JSON.parse(stored));
      } catch {
        localStorage.removeItem('impersonating_company');
      }
    }

    // Listen for storage changes
    const handleStorage = () => {
      const stored = localStorage.getItem('impersonating_company');
      if (stored) {
        try {
          setCompany(JSON.parse(stored));
        } catch {
          setCompany(null);
        }
      } else {
        setCompany(null);
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const handleExit = () => {
    localStorage.removeItem('impersonating_company');
    setCompany(null);
    window.location.href = '/master-panel';
  };

  if (!company) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-destructive text-destructive-foreground shadow-lg">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-destructive-foreground/20 px-3 py-1 rounded-full">
            <Shield className="h-4 w-4" />
            <span className="font-bold text-sm uppercase tracking-wide">Modo Suporte (Master)</span>
          </div>
          <span className="text-sm">
            Você está na conta: <strong className="font-bold">{company.name}</strong>
          </span>
        </div>
        <Button 
          variant="secondary" 
          size="sm"
          onClick={handleExit}
          className="h-8 px-4 bg-destructive-foreground text-destructive hover:bg-destructive-foreground/90 font-semibold"
        >
          <X className="h-4 w-4 mr-2" />
          Sair do modo suporte
        </Button>
      </div>
    </div>
  );
}

export function getImpersonatedCompanyId(): string | null {
  const stored = localStorage.getItem('impersonating_company');
  if (stored) {
    try {
      const company = JSON.parse(stored);
      return company.id || null;
    } catch {
      return null;
    }
  }
  return null;
}

export function isImpersonating(): boolean {
  return !!localStorage.getItem('impersonating_company');
}
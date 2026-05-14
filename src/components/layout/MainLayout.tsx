import { ReactNode, useEffect, useState } from 'react';
import { Sidebar } from './Sidebar';
import { ImpersonationBar, isImpersonating } from '@/components/ImpersonationBar';

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const [showImpersonationBar, setShowImpersonationBar] = useState(false);

  // Initialize theme on mount and check impersonation
  useEffect(() => {
    const stored = localStorage.getItem('pontzap-theme');
    if (stored) {
      document.documentElement.classList.remove('light', 'dark');
      document.documentElement.classList.add(stored);
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.classList.add('dark');
    }
    
    // Check impersonation state
    setShowImpersonationBar(isImpersonating());
  }, []);

  return (
    <div className="min-h-screen bg-background transition-colors duration-300">
      {showImpersonationBar && <ImpersonationBar />}
      <Sidebar />
      <main className={`lg:ml-64 min-h-screen ${showImpersonationBar ? 'pt-10' : ''}`}>
        <div className="p-4 pt-16 lg:p-8 lg:pt-8">
          {children}
        </div>
      </main>
    </div>
  );
}

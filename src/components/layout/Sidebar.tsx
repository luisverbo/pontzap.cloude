import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ResetClockRecordsDialog } from '@/components/ResetClockRecordsDialog';
import logoPontzap from '@/assets/logo-pontzap-branca.png';
import {
  LayoutDashboard,
  Users,
  MapPin,
  Calendar,
  CalendarCheck,
  Bell,
  FileText,
  FileSpreadsheet,
  Clock,
  LogOut,
  Menu,
  X,
  History,
  RotateCcw,
  DollarSign,
  Shield,
  ClipboardList,
  ArrowLeftRight,
} from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  roles: ('admin' | 'manager' | 'employee')[];
  masterOnly?: boolean;
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard className="h-5 w-5" />, roles: ['admin', 'manager'] },
  { label: 'Bater Ponto', href: '/clock', icon: <Clock className="h-5 w-5" />, roles: ['employee'] },
  { label: 'Funcionários', href: '/employees', icon: <Users className="h-5 w-5" />, roles: ['admin'] },
  { label: 'Locais de Trabalho', href: '/locations', icon: <MapPin className="h-5 w-5" />, roles: ['admin'] },
  { label: 'Escala Fixa', href: '/fixed-schedules', icon: <Calendar className="h-5 w-5" />, roles: ['admin'] },
  { label: 'Escalas Pontuais', href: '/punctual-schedules', icon: <CalendarCheck className="h-5 w-5" />, roles: ['admin'] },
  { label: 'Trocas de Escala', href: '/shift-swaps', icon: <ArrowLeftRight className="h-5 w-5" />, roles: ['admin'] },
  { label: 'Notificações', href: '/notifications', icon: <Bell className="h-5 w-5" />, roles: ['admin'] },
  { label: 'Financeiro', href: '/financeiro', icon: <DollarSign className="h-5 w-5" />, roles: ['admin'] },
  { label: 'Anotações', href: '/anotacoes', icon: <ClipboardList className="h-5 w-5" />, roles: ['admin', 'manager'] },
  { label: 'Relatórios', href: '/reports', icon: <FileText className="h-5 w-5" />, roles: ['admin', 'manager'] },
  { label: 'Espelho de Ponto', href: '/espelho-ponto', icon: <FileSpreadsheet className="h-5 w-5" />, roles: ['admin', 'manager'] },
  { label: 'Painel Master', href: '/master-panel', icon: <Shield className="h-5 w-5" />, roles: ['admin'], masterOnly: true },
  { label: 'Meu Histórico', href: '/history', icon: <History className="h-5 w-5" />, roles: ['employee'] },
];

export function Sidebar() {
  const { profile, signOut, isMasterUser } = useAuth();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);

  const filteredNavItems = navItems.filter(
    (item) => {
      if (!profile) return false;
      if (!item.roles.includes(profile.role)) return false;
      // Only show masterOnly items to master users
      if (item.masterOnly && !isMasterUser) return false;
      return true;
    }
  );

  return (
    <>
      {/* Mobile toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-4 left-4 z-50 lg:hidden bg-card/80 backdrop-blur-md shadow-lg border border-border/50"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-40 h-screen w-64 sidebar-modern transition-transform duration-300 lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center gap-3 px-5 py-5 border-b border-sidebar-border/50">
            <img 
              src={logoPontzap} 
              alt="PONTZAP" 
              className="h-14 w-auto object-contain"
            />
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-5 overflow-y-auto">
            <ul className="space-y-1.5">
              {filteredNavItems.map((item) => {
                const isActive = location.pathname === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      to={item.href}
                      onClick={() => setIsOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                        isActive
                          ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md"
                          : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent"
                      )}
                    >
                      <span className={cn(
                        "transition-colors",
                        isActive ? "text-sidebar-primary-foreground" : "text-sidebar-muted group-hover:text-sidebar-foreground"
                      )}>
                        {item.icon}
                      </span>
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* User section */}
          <div className="p-4 border-t border-sidebar-border/50 space-y-3">
            {/* Theme toggle */}
            <div className="flex items-center justify-between px-2 py-1">
              <span className="text-xs text-sidebar-muted">Tema</span>
              <ThemeToggle />
            </div>

            {/* Reset button - only for admin (temporary for testing) */}
            {profile?.role === 'admin' && (
              <Button
                variant="outline"
                size="sm"
                className="w-full text-warning border-warning/30 hover:bg-warning/10 bg-sidebar-accent/50"
                onClick={() => setResetDialogOpen(true)}
              >
              <RotateCcw className="h-4 w-4 mr-2" />
                Zerar Pontos
              </Button>
            )}
            
            <ResetClockRecordsDialog 
              open={resetDialogOpen} 
              onOpenChange={setResetDialogOpen} 
            />
            
            <div className="flex items-center gap-3 p-2 rounded-xl bg-sidebar-accent/30">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-sidebar-primary/20 text-sidebar-primary font-semibold text-sm">
                {profile?.name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-sidebar-foreground truncate">
                  {profile?.name || 'Usuário'}
                </p>
                <p className="text-xs text-sidebar-muted capitalize">
                  {profile?.role === 'admin' ? 'Empresário' : profile?.role === 'manager' ? 'Gestor' : 'Funcionário'}
                </p>
              </div>
            </div>

            <Button
              variant="ghost"
              className="w-full justify-start text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent"
              onClick={signOut}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sair
            </Button>
          </div>
        </div>
      </aside>
    </>
  );
}

import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ResetClockRecordsDialog } from '@/components/ResetClockRecordsDialog';
import logoPontzap from '@/assets/logo-pontzap.png';
import logoPontzapBranca from '@/assets/logo-pontzap-branca.png';
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
  UserCheck,
  ChevronRight,
} from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  roles: ('admin' | 'manager' | 'employee')[];
  masterOnly?: boolean;
}

interface NavGroup {
  label?: string;
  roles: ('admin' | 'manager' | 'employee')[];
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    roles: ['employee'],
    items: [
      { label: 'Bater Ponto', href: '/clock', icon: <Clock className="h-4 w-4" />, roles: ['employee'] },
      { label: 'Meu Histórico', href: '/history', icon: <History className="h-4 w-4" />, roles: ['employee'] },
    ],
  },
  {
    label: 'Visão Geral',
    roles: ['admin', 'manager'],
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard className="h-4 w-4" />, roles: ['admin', 'manager'] },
    ],
  },
  {
    label: 'Equipe',
    roles: ['admin'],
    items: [
      { label: 'Funcionários', href: '/employees', icon: <Users className="h-4 w-4" />, roles: ['admin'] },
      { label: 'Locais de Trabalho', href: '/locations', icon: <MapPin className="h-4 w-4" />, roles: ['admin'] },
    ],
  },
  {
    label: 'Escalas',
    roles: ['admin'],
    items: [
      { label: 'Escala Fixa', href: '/fixed-schedules', icon: <Calendar className="h-4 w-4" />, roles: ['admin'] },
      { label: 'Escalas Pontuais', href: '/punctual-schedules', icon: <CalendarCheck className="h-4 w-4" />, roles: ['admin'] },
    ],
  },
  {
    label: 'Controle',
    roles: ['admin', 'manager'],
    items: [
      { label: 'Folguistas', href: '/anotacoes', icon: <UserCheck className="h-4 w-4" />, roles: ['admin', 'manager'] },
      { label: 'Notificações', href: '/notifications', icon: <Bell className="h-4 w-4" />, roles: ['admin'] },
      { label: 'Financeiro', href: '/financeiro', icon: <DollarSign className="h-4 w-4" />, roles: ['admin'] },
    ],
  },
  {
    label: 'Relatórios',
    roles: ['admin', 'manager'],
    items: [
      { label: 'Relatórios', href: '/reports', icon: <FileText className="h-4 w-4" />, roles: ['admin', 'manager'] },
      { label: 'Espelho de Ponto', href: '/espelho-ponto', icon: <FileSpreadsheet className="h-4 w-4" />, roles: ['admin', 'manager'] },
    ],
  },
  {
    roles: ['admin'],
    items: [
      { label: 'Painel Master', href: '/master-panel', icon: <Shield className="h-4 w-4" />, roles: ['admin'], masterOnly: true },
    ],
  },
];

export function Sidebar() {
  const { profile, signOut, isMasterUser } = useAuth();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);

  const canShow = (roles: ('admin' | 'manager' | 'employee')[]) => {
    if (!profile) return false;
    return roles.includes(profile.role);
  };

  const canShowItem = (item: NavItem) => {
    if (!profile) return false;
    if (!item.roles.includes(profile.role)) return false;
    if (item.masterOnly && !isMasterUser) return false;
    return true;
  };

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
          "fixed left-0 top-0 z-40 h-screen w-60 sidebar-modern transition-transform duration-300 lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center px-4 py-5 border-b border-sidebar-border/40">
            <img src={logoPontzap} alt="PONTZAP" className="h-20 w-auto object-contain dark:hidden" />
            <img src={logoPontzapBranca} alt="PONTZAP" className="h-20 w-auto object-contain hidden dark:block" />
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-2 py-3 overflow-y-auto space-y-4">
            {navGroups.map((group, groupIndex) => {
              if (!canShow(group.roles)) return null;
              const visibleItems = group.items.filter(canShowItem);
              if (visibleItems.length === 0) return null;

              return (
                <div key={groupIndex}>
                  {group.label && (
                    <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-sidebar-muted/60">
                      {group.label}
                    </p>
                  )}
                  <ul className="space-y-0.5">
                    {visibleItems.map((item) => {
                      const isActive = location.pathname === item.href;
                      return (
                        <li key={item.href}>
                          <Link
                            to={item.href}
                            onClick={() => setIsOpen(false)}
                            className={cn(
                              "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150",
                              isActive
                                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                                : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent"
                            )}
                          >
                            <span className="shrink-0">{item.icon}</span>
                            <span className="flex-1 truncate">{item.label}</span>
                            {isActive && (
                              <ChevronRight className="h-3 w-3 shrink-0 opacity-70" />
                            )}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </nav>

          {/* Footer */}
          <div className="p-3 border-t border-sidebar-border/40 space-y-2">
            {/* Theme + Reset row */}
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <ThemeToggle />
              </div>
              {profile?.role === 'admin' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-1 justify-center text-xs text-warning/80 hover:text-warning hover:bg-warning/10 px-2"
                  onClick={() => setResetDialogOpen(true)}
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  Zerar
                </Button>
              )}
            </div>

            <ResetClockRecordsDialog
              open={resetDialogOpen}
              onOpenChange={setResetDialogOpen}
            />

            {/* User card */}
            <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg bg-sidebar-accent/30">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-sidebar-primary/20 text-sidebar-primary font-semibold text-xs shrink-0">
                {profile?.name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-sidebar-foreground truncate leading-tight">
                  {profile?.name || 'Usuário'}
                </p>
                <p className="text-[10px] text-sidebar-muted capitalize leading-tight">
                  {profile?.role === 'admin' ? 'Empresário' : profile?.role === 'manager' ? 'Gestor' : 'Funcionário'}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent"
                onClick={signOut}
                title="Sair"
              >
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/hooks/useTheme';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      className="h-9 w-9 rounded-lg hover:bg-sidebar-accent transition-colors"
      title={theme === 'dark' ? 'Mudar para modo claro' : 'Mudar para modo escuro'}
    >
      {theme === 'dark' ? (
        <Sun className="h-5 w-5 text-sidebar-muted hover:text-sidebar-foreground transition-colors" />
      ) : (
        <Moon className="h-5 w-5 text-sidebar-muted hover:text-sidebar-foreground transition-colors" />
      )}
      <span className="sr-only">Alternar tema</span>
    </Button>
  );
}

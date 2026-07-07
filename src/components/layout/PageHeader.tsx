import { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
}

/**
 * Standard page header — one consistent title/description/actions treatment
 * across every screen (replaces each page inventing its own).
 */
export function PageHeader({ title, description, icon, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div className="flex items-start gap-3 min-w-0">
        {icon && <div className="mt-1 text-primary shrink-0">{icon}</div>}
        <div className="min-w-0">
          <h1 className="font-display text-2xl lg:text-3xl font-bold text-foreground truncate">
            {title}
          </h1>
          {description && (
            <p className="text-muted-foreground mt-1 text-sm">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

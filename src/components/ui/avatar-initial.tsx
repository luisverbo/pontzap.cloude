import { cn } from '@/lib/utils';

interface AvatarInitialProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  tone?: 'primary' | 'warning' | 'muted';
  className?: string;
}

const sizeMap = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
};

const toneMap = {
  primary: 'bg-primary/10 text-primary',
  warning: 'bg-warning/10 text-warning',
  muted: 'bg-muted text-muted-foreground',
};

/** Single source of truth for the "colored circle with the person's initial". */
export function AvatarInitial({ name, size = 'md', tone = 'primary', className }: AvatarInitialProps) {
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center font-semibold shrink-0',
        sizeMap[size],
        toneMap[tone],
        className,
      )}
      aria-hidden="true"
    >
      {initial}
    </div>
  );
}

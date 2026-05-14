import { WifiOff, CloudOff, RefreshCw, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OfflineIndicatorProps {
  online: boolean;
  syncing: boolean;
  pendingCount: number;
  onSync?: () => void;
}

export function OfflineIndicator({ online, syncing, pendingCount, onSync }: OfflineIndicatorProps) {
  if (online && pendingCount === 0) return null;

  return (
    <div
      className={cn(
        "fixed bottom-4 left-4 right-4 mx-auto max-w-sm z-50 rounded-xl px-4 py-3 shadow-lg backdrop-blur-md border transition-all duration-300",
        !online
          ? "bg-warning/90 text-warning-foreground border-warning"
          : pendingCount > 0
          ? "bg-primary/90 text-primary-foreground border-primary"
          : "bg-success/90 text-success-foreground border-success"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {!online ? (
            <>
              <WifiOff className="h-5 w-5" />
              <div>
                <p className="font-semibold text-sm">Modo Offline</p>
                <p className="text-xs opacity-90">
                  {pendingCount > 0
                    ? `${pendingCount} registro(s) aguardando sincronização`
                    : 'Registros serão salvos localmente'}
                </p>
              </div>
            </>
          ) : syncing ? (
            <>
              <RefreshCw className="h-5 w-5 animate-spin" />
              <div>
                <p className="font-semibold text-sm">Sincronizando...</p>
                <p className="text-xs opacity-90">Enviando {pendingCount} registro(s)</p>
              </div>
            </>
          ) : pendingCount > 0 ? (
            <>
              <CloudOff className="h-5 w-5" />
              <div>
                <p className="font-semibold text-sm">Pendente</p>
                <p className="text-xs opacity-90">{pendingCount} registro(s) para sincronizar</p>
              </div>
            </>
          ) : (
            <>
              <Check className="h-5 w-5" />
              <p className="font-semibold text-sm">Tudo sincronizado!</p>
            </>
          )}
        </div>

        {online && pendingCount > 0 && !syncing && onSync && (
          <button
            onClick={onSync}
            className="p-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

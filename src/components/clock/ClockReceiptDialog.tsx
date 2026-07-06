import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Download } from 'lucide-react';
import { CLOCK_TYPE_LABELS, type ClockType } from '@/types';
import type { ClockReceipt } from '@/hooks/useClockRecords';

interface Props {
  receipt: ClockReceipt | null;
  employeeName: string;
  onClose: () => void;
}

const spDateTime = (iso: string): string =>
  new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date(iso));

export function ClockReceiptDialog({ receipt, employeeName, onClose }: Props) {
  if (!receipt) return null;

  const dateTime = spDateTime(receipt.timestamp);
  const tipo = CLOCK_TYPE_LABELS[receipt.type as ClockType] || receipt.type;
  const nsr = receipt.nsr != null ? String(receipt.nsr).padStart(9, '0') : '—';
  const hashShort = receipt.hash ? receipt.hash.slice(0, 32).toUpperCase() : '—';

  const handleDownload = () => {
    const text =
      `COMPROVANTE DE REGISTRO DE PONTO\n` +
      `(Portaria MTP 671/2021)\n` +
      `--------------------------------\n` +
      `Funcionário: ${employeeName}\n` +
      `Tipo: ${tipo}\n` +
      `Local: ${receipt.locationName}\n` +
      `Data/Hora: ${dateTime}\n` +
      `NSR: ${nsr}\n` +
      `Código de verificação (SHA-256):\n${receipt.hash || '—'}\n` +
      `--------------------------------\n` +
      `PONTZAP\n`;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `comprovante-ponto-NSR-${nsr}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={!!receipt} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-success">
            <CheckCircle2 className="h-5 w-5" />
            Comprovante de Ponto
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-xl border border-border/60 bg-secondary/30 p-4 font-mono text-sm space-y-2">
          <div className="text-center text-[11px] uppercase tracking-wider text-muted-foreground">
            Portaria MTP 671/2021
          </div>
          <div className="border-t border-dashed border-border/60 pt-2 space-y-1.5">
            <Row k="Funcionário" v={employeeName} />
            <Row k="Tipo" v={tipo} />
            <Row k="Local" v={receipt.locationName} />
            <Row k="Data/Hora" v={dateTime} />
            <Row k="NSR" v={nsr} strong />
          </div>
          <div className="border-t border-dashed border-border/60 pt-2">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
              Código de verificação
            </div>
            <div className="break-all text-[11px] leading-relaxed text-foreground/80">
              {hashShort}…
            </div>
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground text-center">
          Guarde este comprovante. O NSR e o código garantem a autenticidade do registro.
        </p>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={handleDownload}>
            <Download className="h-4 w-4 mr-2" />
            Baixar
          </Button>
          <Button className="flex-1" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{k}</span>
      <span className={`text-right ${strong ? 'font-bold text-foreground' : 'text-foreground/90'}`}>{v}</span>
    </div>
  );
}

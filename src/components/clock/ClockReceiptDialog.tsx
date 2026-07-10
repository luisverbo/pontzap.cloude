import { useState } from 'react';
import jsPDF from 'jspdf';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Download, Loader2 } from 'lucide-react';
import { CLOCK_TYPE_LABELS, type ClockType } from '@/types';
import type { ClockReceipt } from '@/hooks/useClockRecords';
import { saveOrShareBase64 } from '@/lib/nativeShare';
import { isNative } from '@/lib/native';

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
  const [downloading, setDownloading] = useState(false);
  if (!receipt) return null;

  const dateTime = spDateTime(receipt.timestamp);
  const tipo = CLOCK_TYPE_LABELS[receipt.type as ClockType] || receipt.type;
  const nsr = receipt.nsr != null ? String(receipt.nsr).padStart(9, '0') : '—';
  const hashShort = receipt.hash ? receipt.hash.slice(0, 32).toUpperCase() : '—';

  const buildPdfBase64 = (): string => {
    const doc = new jsPDF({ unit: 'mm', format: 'a5' });
    const left = 14;
    let y = 20;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('Comprovante de Registro de Ponto', left, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text('Portaria MTP 671/2021', left, y);
    doc.setTextColor(30);
    y += 4;
    doc.setDrawColor(200);
    doc.line(left, y, 134, y);
    y += 8;

    const row = (k: string, v: string) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(k, left, y);
      doc.setFont('helvetica', 'normal');
      doc.text(v, left + 32, y);
      y += 7;
    };
    row('Funcionário', employeeName);
    row('Tipo', tipo);
    row('Local', receipt.locationName || '—');
    row('Data/Hora', dateTime);
    row('NSR', nsr);

    y += 2;
    doc.setDrawColor(200);
    doc.line(left, y, 134, y);
    y += 7;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Código de verificação (SHA-256)', left, y);
    y += 6;
    doc.setFont('courier', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(60);
    doc.text(doc.splitTextToSize(receipt.hash || '—', 120), left, y);
    doc.setTextColor(30);

    y += 16;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(110);
    doc.text(
      doc.splitTextToSize(
        'Guarde este comprovante. O NSR e o código de verificação garantem a autenticidade do registro.',
        120
      ),
      left,
      y
    );

    // Base64 without the "data:application/pdf;..." prefix
    return doc.output('datauristring').split(',')[1];
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const base64 = buildPdfBase64();
      const filename = `comprovante-ponto-NSR-${nsr}.pdf`;
      const result = await saveOrShareBase64(filename, base64, 'application/pdf', 'Comprovante de Ponto');
      if (result === 'error') {
        toast.error('Não foi possível gerar o comprovante.');
      } else if (result === 'downloaded') {
        toast.success('Comprovante baixado.');
      }
      // 'shared' → the native share sheet handles feedback
    } catch (e) {
      console.error('Erro ao gerar comprovante:', e);
      toast.error('Não foi possível gerar o comprovante.');
    } finally {
      setDownloading(false);
    }
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
          <Button variant="outline" className="flex-1" onClick={handleDownload} disabled={downloading}>
            {downloading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            {isNative ? 'Compartilhar' : 'Baixar'}
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

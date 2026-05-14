import { useRef, useEffect, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Download, Printer, Loader2 } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { supabase } from '@/integrations/supabase/client';
import { getImpersonatedCompanyId } from '@/components/ImpersonationBar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';

interface LocationQRCodeProps {
  locationId: string;
  locationName: string;
  qrCode: string;
}

export function LocationQRCode({ locationId, locationName, qrCode }: LocationQRCodeProps) {
  const qrRef = useRef<HTMLDivElement>(null);
  const [companyName, setCompanyName] = useState<string>('PONTZAP');
  const [loading, setLoading] = useState(true);
  const [paperSize, setPaperSize] = useState<'full' | 'half'>('half');

  useEffect(() => {
    const fetchCompanyName = async () => {
      try {
        const impersonatedCompanyId = getImpersonatedCompanyId();
        
        if (impersonatedCompanyId) {
          const { data } = await supabase
            .from('companies')
            .select('name')
            .eq('id', impersonatedCompanyId)
            .single();
          if (data?.name) setCompanyName(data.name);
        } else {
          const { data: location } = await supabase
            .from('locations')
            .select('company_id')
            .eq('id', locationId)
            .single();
          
          if (location?.company_id) {
            const { data: company } = await supabase
              .from('companies')
              .select('name')
              .eq('id', location.company_id)
              .single();
            if (company?.name) setCompanyName(company.name);
          }
        }
      } catch (error) {
        console.error('Error fetching company name:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCompanyName();
  }, [locationId]);

  const createBrandedCanvas = (size: 'full' | 'half') => {
    const canvas = qrRef.current?.querySelector('canvas');
    if (!canvas) return null;

    // A4 at 96 DPI: 794 x 1123, Half: 794 x 561
    const width = 794;
    const height = size === 'full' ? 1123 : 561;
    
    const brandedCanvas = document.createElement('canvas');
    brandedCanvas.width = width;
    brandedCanvas.height = height;
    const ctx = brandedCanvas.getContext('2d');
    if (!ctx) return null;

    // Dark blue background (like reference image)
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    const centerX = width / 2;

    // QR Code with white background
    const qrSize = size === 'full' ? 400 : 280;
    const qrPadding = 30;
    const qrY = size === 'full' ? 180 : 80;
    const qrX = (width - qrSize - qrPadding * 2) / 2;
    
    // White rounded rectangle for QR
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(qrX, qrY, qrSize + qrPadding * 2, qrSize + qrPadding * 2, 20);
    ctx.fill();
    
    // Draw QR code
    ctx.drawImage(canvas, qrX + qrPadding, qrY + qrPadding, qrSize, qrSize);

    // Text below QR
    let textY = qrY + qrSize + qrPadding * 2 + (size === 'full' ? 80 : 50);

    // PONTZAP brand
    ctx.fillStyle = '#14b8a6'; // teal-500
    ctx.font = 'bold 24px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PONTZAP', centerX, textY);

    // Company name (if different from PONTZAP)
    if (companyName !== 'PONTZAP') {
      textY += 35;
      ctx.fillStyle = '#94a3b8'; // slate-400
      ctx.font = '18px Arial, sans-serif';
      ctx.fillText(companyName, centerX, textY);
    }

    // Location name
    textY += 40;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px Arial, sans-serif';
    ctx.fillText(locationName, centerX, textY);

    // Code
    textY += 35;
    ctx.fillStyle = '#64748b'; // slate-500
    ctx.font = '16px Arial, sans-serif';
    ctx.fillText(`Código: ${qrCode.substring(0, 8).toUpperCase()}`, centerX, textY);

    // Instructions
    textY += 30;
    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px Arial, sans-serif';
    ctx.fillText('Escaneie este QR Code para registrar o ponto', centerX, textY);

    return brandedCanvas;
  };

  const downloadQRCode = () => {
    const brandedCanvas = createBrandedCanvas(paperSize);
    if (!brandedCanvas) return;

    const url = brandedCanvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `qr-${locationName.replace(/\s+/g, '-').toLowerCase()}.png`;
    link.href = url;
    link.click();
  };

  const printQRCode = () => {
    const canvas = qrRef.current?.querySelector('canvas');
    if (!canvas) return;

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: paperSize === 'full' ? 'a4' : [210, 148.5], // A4 or A5 height
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    // Dark blue background
    pdf.setFillColor(15, 23, 42);
    pdf.rect(0, 0, pageWidth, pageHeight, 'F');

    // QR Code size and position
    const qrSize = paperSize === 'full' ? 100 : 70;
    const qrX = (pageWidth - qrSize) / 2;
    const qrY = paperSize === 'full' ? 50 : 25;
    
    // White rounded background for QR
    const padding = 8;
    pdf.setFillColor(255, 255, 255);
    pdf.roundedRect(qrX - padding, qrY - padding, qrSize + padding * 2, qrSize + padding * 2, 5, 5, 'F');
    
    pdf.addImage(imgData, 'PNG', qrX, qrY, qrSize, qrSize);

    // Text
    let textY = qrY + qrSize + padding + (paperSize === 'full' ? 30 : 20);

    // PONTZAP
    pdf.setFontSize(18);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(20, 184, 166);
    pdf.text('PONTZAP', pageWidth / 2, textY, { align: 'center' });

    // Company name
    if (companyName !== 'PONTZAP') {
      textY += 10;
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(148, 163, 184);
      pdf.text(companyName, pageWidth / 2, textY, { align: 'center' });
    }

    // Location name
    textY += 12;
    pdf.setFontSize(20);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(255, 255, 255);
    pdf.text(locationName, pageWidth / 2, textY, { align: 'center' });

    // Code
    textY += 10;
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(100, 116, 139);
    pdf.text(`Código: ${qrCode.substring(0, 8).toUpperCase()}`, pageWidth / 2, textY, { align: 'center' });

    // Instructions
    textY += 8;
    pdf.setFontSize(10);
    pdf.setTextColor(148, 163, 184);
    pdf.text('Escaneie este QR Code para registrar o ponto', pageWidth / 2, textY, { align: 'center' });

    pdf.save(`qr-${locationName.replace(/\s+/g, '-').toLowerCase()}.pdf`);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-4 p-6 bg-card rounded-xl border border-border">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 p-6 bg-[#0f172a] rounded-xl border border-border">
      <div ref={qrRef} className="p-6 bg-white rounded-2xl shadow-lg">
        <QRCodeCanvas
          value={qrCode}
          size={200}
          level="H"
          includeMargin={false}
        />
      </div>

      <div className="text-center space-y-1">
        <p className="text-sm text-primary font-semibold">PONTZAP</p>
        {companyName !== 'PONTZAP' && (
          <p className="text-xs text-slate-400">{companyName}</p>
        )}
        <h3 className="font-bold text-xl text-white">{locationName}</h3>
        <p className="text-sm text-slate-500 font-mono">
          Código: {qrCode.substring(0, 8).toUpperCase()}
        </p>
        <p className="text-xs text-slate-400 mt-2">
          Escaneie este QR Code para registrar o ponto
        </p>
      </div>

      <div className="w-full space-y-3 pt-2">
        <div className="space-y-1.5">
          <Label className="text-slate-300 text-xs">Tamanho do papel</Label>
          <Select value={paperSize} onValueChange={(v: 'full' | 'half') => setPaperSize(v)}>
            <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="half">Metade A4 (A5)</SelectItem>
              <SelectItem value="full">A4 Completo</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 bg-slate-800 border-slate-700 text-white hover:bg-slate-700" onClick={downloadQRCode}>
            <Download className="h-4 w-4 mr-2" />
            PNG
          </Button>
          <Button variant="outline" className="flex-1 bg-slate-800 border-slate-700 text-white hover:bg-slate-700" onClick={printQRCode}>
            <Printer className="h-4 w-4 mr-2" />
            PDF
          </Button>
        </div>
      </div>
    </div>
  );
}

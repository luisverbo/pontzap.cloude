import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/layout/PageHeader';
import { useShiftSwaps } from '@/hooks/useShiftSwaps';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  ArrowLeftRight,
  Search,
  Check,
  X,
  Clock,
  MapPin,
  User,
  Calendar,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from 'lucide-react';

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info';
const STATUS_LABELS: Record<string, { label: string; variant: BadgeVariant }> = {
  pending: { label: 'Pendente', variant: 'warning' },
  accepted: { label: 'Aceito', variant: 'info' },
  approved: { label: 'Aprovado', variant: 'success' },
  rejected: { label: 'Rejeitado', variant: 'destructive' },
  cancelled: { label: 'Cancelado', variant: 'secondary' },
};

export default function ShiftSwaps() {
  const { user } = useAuth();
  const { swaps, loading, approveSwap, adminRejectSwap, refetch } = useShiftSwaps();
  const [searchTerm, setSearchTerm] = useState('');
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedSwapId, setSelectedSwapId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);

  const filteredSwaps = swaps.filter((swap) => {
    const requesterName = swap.requester?.profiles?.name?.toLowerCase() || '';
    const targetName = swap.target?.profiles?.name?.toLowerCase() || '';
    const locationName = swap.location?.name?.toLowerCase() || '';
    const search = searchTerm.toLowerCase();
    return requesterName.includes(search) || targetName.includes(search) || locationName.includes(search);
  });

  const handleApprove = async (swapId: string) => {
    if (!user?.id) return;
    setProcessing(swapId);
    await approveSwap(swapId, user.id);
    setProcessing(null);
  };

  const handleOpenRejectDialog = (swapId: string) => {
    setSelectedSwapId(swapId);
    setRejectReason('');
    setRejectDialogOpen(true);
  };

  const handleReject = async () => {
    if (!selectedSwapId) return;
    setProcessing(selectedSwapId);
    await adminRejectSwap(selectedSwapId, rejectReason);
    setProcessing(null);
    setRejectDialogOpen(false);
    setSelectedSwapId(null);
  };

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr + 'T12:00:00'), "dd 'de' MMMM", { locale: ptBR });
  };

  const formatTime = (timeStr: string) => {
    return timeStr.substring(0, 5);
  };

  const pendingApprovalSwaps = filteredSwaps.filter(s => s.status === 'accepted');
  const pendingSwaps = filteredSwaps.filter(s => s.status === 'pending');
  const historySwaps = filteredSwaps.filter(s => ['approved', 'rejected', 'cancelled'].includes(s.status));

  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6 animate-fade-in">
        {/* Header */}
        <PageHeader
          icon={<ArrowLeftRight className="h-6 w-6" />}
          title="Trocas de Escala"
          description="Gerencie solicitações de troca de escala entre funcionários"
        />

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por funcionário ou local..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Pending Approval - Most Important */}
            {pendingApprovalSwaps.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-primary" />
                  Aguardando Sua Aprovação ({pendingApprovalSwaps.length})
                </h2>
                <div className="grid gap-4">
                  {pendingApprovalSwaps.map((swap) => (
                    <Card key={swap.id} className="border-primary/30 bg-primary/5">
                      <CardContent className="p-4">
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                          {/* Swap Details */}
                          <div className="flex-1 space-y-3">
                            <div className="flex items-center gap-2">
                              <Badge variant={STATUS_LABELS[swap.status].variant}>
                                {STATUS_LABELS[swap.status].label}
                              </Badge>
                              <Badge variant="outline">
                                {swap.schedule_type === 'punctual' ? 'Escala Pontual' : 'Escala Fixa'}
                              </Badge>
                            </div>
                            
                            <div className="grid sm:grid-cols-2 gap-4">
                              {/* Requester */}
                              <div className="p-3 rounded-lg bg-background border">
                                <p className="text-xs text-muted-foreground mb-1">Solicitante</p>
                                <p className="font-medium flex items-center gap-2">
                                  <User className="h-4 w-4" />
                                  {swap.requester?.profiles?.name || 'N/A'}
                                </p>
                                <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                                  <Calendar className="h-3.5 w-3.5" />
                                  {formatDate(swap.requester_date)}
                                </p>
                                <p className="text-sm text-muted-foreground flex items-center gap-2">
                                  <Clock className="h-3.5 w-3.5" />
                                  {formatTime(swap.requester_start_time)} - {formatTime(swap.requester_end_time)}
                                </p>
                              </div>

                              {/* Arrow */}
                              <div className="hidden sm:flex items-center justify-center absolute left-1/2 -translate-x-1/2">
                                <ArrowLeftRight className="h-5 w-5 text-muted-foreground" />
                              </div>

                              {/* Target */}
                              <div className="p-3 rounded-lg bg-background border">
                                <p className="text-xs text-muted-foreground mb-1">Troca com</p>
                                <p className="font-medium flex items-center gap-2">
                                  <User className="h-4 w-4" />
                                  {swap.target?.profiles?.name || 'N/A'}
                                </p>
                                <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                                  <Calendar className="h-3.5 w-3.5" />
                                  {formatDate(swap.target_date)}
                                </p>
                                <p className="text-sm text-muted-foreground flex items-center gap-2">
                                  <Clock className="h-3.5 w-3.5" />
                                  {formatTime(swap.target_start_time)} - {formatTime(swap.target_end_time)}
                                </p>
                              </div>
                            </div>

                            <p className="text-sm text-muted-foreground flex items-center gap-2">
                              <MapPin className="h-4 w-4" />
                              {swap.location?.name || 'Local não especificado'}
                            </p>
                          </div>

                          {/* Actions */}
                          <div className="flex gap-2 shrink-0">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenRejectDialog(swap.id)}
                              disabled={processing === swap.id}
                              className="text-destructive hover:bg-destructive/10"
                            >
                              <X className="h-4 w-4 mr-1" />
                              Rejeitar
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleApprove(swap.id)}
                              disabled={processing === swap.id}
                              className="bg-success hover:bg-success/90 text-success-foreground"
                            >
                              {processing === swap.id ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-1" />
                              ) : (
                                <Check className="h-4 w-4 mr-1" />
                              )}
                              Aprovar
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Pending Employee Acceptance */}
            {pendingSwaps.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Clock className="h-5 w-5 text-warning" />
                  Aguardando Aceite do Funcionário ({pendingSwaps.length})
                </h2>
                <div className="grid gap-4">
                  {pendingSwaps.map((swap) => (
                    <Card key={swap.id} className="border-warning/30 bg-warning/5">
                      <CardContent className="p-4">
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                          <div className="flex-1 space-y-3">
                            <div className="flex items-center gap-2">
                              <Badge variant={STATUS_LABELS[swap.status].variant}>
                                {STATUS_LABELS[swap.status].label}
                              </Badge>
                              <Badge variant="outline">
                                {swap.schedule_type === 'punctual' ? 'Escala Pontual' : 'Escala Fixa'}
                              </Badge>
                            </div>
                            
                            <div className="flex items-center gap-4 text-sm">
                              <span className="font-medium">{swap.requester?.profiles?.name}</span>
                              <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{swap.target?.profiles?.name}</span>
                            </div>

                            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3.5 w-3.5" />
                                {formatDate(swap.requester_date)} ↔ {formatDate(swap.target_date)}
                              </span>
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3.5 w-3.5" />
                                {swap.location?.name}
                              </span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* History */}
            {historySwaps.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold">Histórico</h2>
                <div className="grid gap-3">
                  {historySwaps.map((swap) => (
                    <Card key={swap.id} className="opacity-80">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-4">
                            {swap.status === 'approved' && <CheckCircle2 className="h-5 w-5 text-success" />}
                            {swap.status === 'rejected' && <XCircle className="h-5 w-5 text-red-500" />}
                            {swap.status === 'cancelled' && <X className="h-5 w-5 text-gray-500" />}
                            
                            <div>
                              <p className="font-medium">
                                {swap.requester?.profiles?.name} ↔ {swap.target?.profiles?.name}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {formatDate(swap.requester_date)} ↔ {formatDate(swap.target_date)}
                              </p>
                              {swap.reason && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  Motivo: {swap.reason}
                                </p>
                              )}
                            </div>
                          </div>
                          
                          <Badge variant={STATUS_LABELS[swap.status].variant}>
                            {STATUS_LABELS[swap.status].label}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Empty State */}
            {filteredSwaps.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center">
                  <ArrowLeftRight className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground">Nenhuma troca de escala encontrada</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Reject Dialog */}
        <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rejeitar Troca</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Motivo da rejeição (opcional)</Label>
                <Textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Informe o motivo..."
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
                Cancelar
              </Button>
              <Button variant="destructive" onClick={handleReject} disabled={processing !== null}>
                {processing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Rejeitar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}

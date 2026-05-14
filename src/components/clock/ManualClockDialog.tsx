import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, HandMetal } from 'lucide-react';
import { CLOCK_TYPE_LABELS, ClockType } from '@/types';

interface ManualClockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string;
  employeeName: string;
  locations: { id: string; name: string }[];
  onSuccess: () => void;
}

export function ManualClockDialog({
  open,
  onOpenChange,
  employeeId,
  employeeName,
  locations,
  onSuccess,
}: ManualClockDialogProps) {
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [type, setType] = useState<ClockType | ''>('');
  const [locationId, setLocationId] = useState('');
  const [observation, setObservation] = useState('');

  const handleSubmit = async () => {
    if (!date || !time || !type || !locationId) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const timestamp = new Date(`${date}T${time}:00`).toISOString();

      const { error } = await supabase.from('clock_records').insert({
        employee_id: employeeId,
        location_id: locationId,
        type: type,
        method: 'gps', // Marcamos como GPS mas o is_manual identifica
        timestamp: timestamp,
        is_manual: true,
        manual_registered_by: user.id,
        manual_observation: observation || null,
      });

      if (error) throw error;

      toast.success('Registro manual adicionado com sucesso!');
      onSuccess();
      onOpenChange(false);
      resetForm();
    } catch (error: any) {
      console.error('Error adding manual clock record:', error);
      toast.error('Erro ao adicionar registro: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setDate('');
    setTime('');
    setType('');
    setLocationId('');
    setObservation('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HandMetal className="h-5 w-5 text-primary" />
            Registro Manual de Ponto
          </DialogTitle>
          <DialogDescription>
            Adicionar registro manual para <strong>{employeeName}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">Data *</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="time">Horário *</Label>
              <Input
                id="time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Tipo de Registro *</Label>
            <Select value={type} onValueChange={(v) => setType(v as ClockType)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CLOCK_TYPE_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Local *</Label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o local" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>
                    {loc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="observation">Observação</Label>
            <Textarea
              id="observation"
              placeholder="Ex: Funcionário esqueceu de bater o ponto"
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
              rows={3}
            />
          </div>

          <div className="bg-warning/10 border border-warning/20 rounded-lg p-3">
            <p className="text-sm text-warning flex items-center gap-2">
              <HandMetal className="h-4 w-4" />
              Este registro será marcado como <strong>MANUAL</strong> no sistema.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              'Salvar Registro'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

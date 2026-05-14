import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Clock, MapPin, CheckCircle, XCircle, Loader2, AlertTriangle, Navigation, AlertCircle } from 'lucide-react';

type ResponseType = 'near_destination' | 'will_be_late' | 'will_not_work';

interface AlertInfo {
  id: string;
  employeeName: string;
  locationName: string;
  scheduledTime: string;
  scheduleDate: string;
  alreadyResponded: boolean;
  responseType?: string;
}

const RESPONSE_LABELS: Record<ResponseType, string> = {
  near_destination: 'Estou próximo do destino',
  will_be_late: 'Vou me atrasar',
  will_not_work: 'Não vou trabalhar',
};

export default function LatenessResponse() {
  const { alertId } = useParams<{ alertId: string }>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [alertInfo, setAlertInfo] = useState<AlertInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [selectedResponse, setSelectedResponse] = useState<ResponseType | null>(null);
  const [showObservation, setShowObservation] = useState(false);
  const [observation, setObservation] = useState('');

  useEffect(() => {
    fetchAlertInfo();
  }, [alertId]);

  const fetchAlertInfo = async () => {
    if (!alertId) {
      setError('Link inválido');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-lateness-alert?alertId=${alertId}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao carregar informações');
      }

      setAlertInfo(data);
    } catch (err: any) {
      console.error('Error fetching alert:', err);
      setError(err.message || 'Erro ao carregar informações do alerta');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectResponse = (responseType: ResponseType) => {
    setSelectedResponse(responseType);
    if (responseType === 'will_not_work') {
      setShowObservation(true);
    } else {
      setShowObservation(false);
      setObservation('');
    }
  };

  const handleSubmit = async () => {
    if (!alertId || !selectedResponse) return;

    // Require observation for "will not work" option
    if (selectedResponse === 'will_not_work' && !observation.trim()) {
      toast.error('Por favor, informe o motivo da falta.');
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/respond-lateness`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            alertId,
            responseType: selectedResponse,
            observation: observation.trim() || null,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao enviar resposta');
      }

      setSuccess(true);
      toast.success('Resposta enviada com sucesso!');
    } catch (err: any) {
      console.error('Error submitting response:', err);
      toast.error(err.message || 'Erro ao enviar resposta');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Card className="w-full max-w-md card-modern">
          <CardContent className="p-8 text-center">
            <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary mb-4" />
            <p className="text-muted-foreground">Carregando...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Card className="w-full max-w-md border-destructive/50 card-modern">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="h-12 w-12 mx-auto text-destructive mb-4" />
            <h2 className="text-xl font-bold mb-2">Erro</h2>
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (alertInfo?.alreadyResponded || success) {
    const responseLabel = success 
      ? RESPONSE_LABELS[selectedResponse!] || selectedResponse
      : RESPONSE_LABELS[alertInfo?.responseType as ResponseType] || alertInfo?.responseType;
    
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Card className="w-full max-w-md border-primary/50 card-modern">
          <CardContent className="p-8 text-center">
            <CheckCircle className="h-16 w-16 mx-auto text-success mb-4" />
            <h2 className="text-2xl font-bold mb-2">Resposta Registrada!</h2>
            <p className="text-muted-foreground mb-4">
              Sua resposta foi enviada com sucesso.
            </p>
            <div className="p-4 rounded-xl bg-muted">
              <p className="font-medium">{responseLabel}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md card-modern">
        <CardContent className="p-6">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-full bg-warning/20 flex items-center justify-center mx-auto mb-4">
              <Clock className="h-8 w-8 text-warning" />
            </div>
            <h1 className="text-2xl font-bold text-primary">PONTZAP</h1>
            <p className="text-muted-foreground mt-1">Alerta de Entrada</p>
          </div>

          {/* Info */}
          <div className="space-y-3 mb-6">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                <span className="text-primary font-bold">
                  {alertInfo?.employeeName?.charAt(0).toUpperCase() || '?'}
                </span>
              </div>
              <div>
                <p className="font-medium">{alertInfo?.employeeName}</p>
                <p className="text-sm text-muted-foreground">Funcionário</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
              <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
                <MapPin className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="font-medium">{alertInfo?.locationName}</p>
                <p className="text-sm text-muted-foreground">Local de Trabalho</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                <Clock className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">{alertInfo?.scheduledTime?.slice(0, 5)}</p>
                <p className="text-sm text-muted-foreground">Horário de Entrada</p>
              </div>
            </div>
          </div>

          {/* Question */}
          <div className="text-center mb-6">
            <p className="text-lg font-medium">
              Está em cima da hora de entrada. Como você está?
            </p>
          </div>

          {/* Response buttons */}
          <div className="space-y-3">
            <Button
              variant={selectedResponse === 'near_destination' ? 'default' : 'outline'}
              className={`w-full h-14 justify-start gap-3 ${
                selectedResponse === 'near_destination' 
                  ? 'bg-success hover:bg-success/90 text-white border-success' 
                  : 'border-success/50 hover:bg-success/10 hover:border-success'
              }`}
              onClick={() => handleSelectResponse('near_destination')}
              disabled={submitting}
            >
              <Navigation className={`h-5 w-5 ${selectedResponse === 'near_destination' ? 'text-white' : 'text-success'}`} />
              <span className="font-medium">Estou próximo do destino</span>
            </Button>

            <Button
              variant={selectedResponse === 'will_be_late' ? 'default' : 'outline'}
              className={`w-full h-14 justify-start gap-3 ${
                selectedResponse === 'will_be_late' 
                  ? 'bg-warning hover:bg-warning/90 text-white border-warning' 
                  : 'border-warning/50 hover:bg-warning/10 hover:border-warning'
              }`}
              onClick={() => handleSelectResponse('will_be_late')}
              disabled={submitting}
            >
              <AlertCircle className={`h-5 w-5 ${selectedResponse === 'will_be_late' ? 'text-white' : 'text-warning'}`} />
              <span className="font-medium">Vou me atrasar</span>
            </Button>

            <Button
              variant={selectedResponse === 'will_not_work' ? 'default' : 'outline'}
              className={`w-full h-14 justify-start gap-3 ${
                selectedResponse === 'will_not_work' 
                  ? 'bg-destructive hover:bg-destructive/90 text-white border-destructive' 
                  : 'border-destructive/50 hover:bg-destructive/10 hover:border-destructive'
              }`}
              onClick={() => handleSelectResponse('will_not_work')}
              disabled={submitting}
            >
              <XCircle className={`h-5 w-5 ${selectedResponse === 'will_not_work' ? 'text-white' : 'text-destructive'}`} />
              <span className="font-medium">Não vou trabalhar</span>
            </Button>
          </div>

          {/* Observation field (shown when "will not work" is selected) */}
          {showObservation && (
            <div className="mt-4 space-y-2 animate-fade-in">
              <Label htmlFor="observation" className="text-sm font-medium">
                Motivo da falta *
              </Label>
              <Textarea
                id="observation"
                placeholder="Informe o motivo..."
                value={observation}
                onChange={(e) => setObservation(e.target.value)}
                className="min-h-[100px] resize-none"
              />
            </div>
          )}

          {/* Submit button */}
          {selectedResponse && (
            <Button
              onClick={handleSubmit}
              disabled={submitting || (selectedResponse === 'will_not_work' && !observation.trim())}
              className="w-full mt-6 h-12"
              variant="glow"
            >
              {submitting ? (
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
              ) : (
                <CheckCircle className="h-5 w-5 mr-2" />
              )}
              Enviar Resposta
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
import { useState, useEffect, useCallback } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useLocations } from '@/hooks/useLocations';
import { MasterCompanyNotice } from '@/components/MasterCompanyNotice';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  Building2, Link2, Copy, MessageCircle, KeyRound, RefreshCw, Loader2, Eye, EyeOff, Power,
} from 'lucide-react';

interface Portal {
  id: string;
  location_id: string;
  token: string;
  pin_hash: string | null;
  is_active: boolean;
  show_on_duty: boolean;
  show_times: boolean;
  show_names: boolean;
  history_days: number;
  show_occurrences: boolean;
  show_handovers: boolean;
  welcome_text: string | null;
  last_access_at: string | null;
  access_count: number;
}

const generateToken = () => {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};

async function hashPin(token: string, pin: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${token}:${pin}`));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

const portalUrl = (token: string) => `${window.location.origin}/portal/${token}`;

const VISIBILITY: { key: keyof Portal; label: string; help: string }[] = [
  { key: 'show_on_duty', label: 'Quem está no posto agora', help: 'Status de cada guardião: no posto, em intervalo, ainda não chegou, turno encerrado.' },
  { key: 'show_times', label: 'Horários das batidas', help: 'Hora exata de entrada, almoço e saída.' },
  { key: 'show_names', label: 'Nome dos guardiões', help: 'Desligado, aparece "Guardião 1", "Guardião 2".' },
  { key: 'show_occurrences', label: 'Ocorrências', help: 'Só as que você já aprovou para o condomínio.' },
  { key: 'show_handovers', label: 'Passagens de turno', help: 'Recados (texto e áudio) deixados entre turnos.' },
];

export default function CondoPortals() {
  const { locations, loading: locationsLoading } = useLocations();
  const [portals, setPortals] = useState<Record<string, Portal>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const [pinDialog, setPinDialog] = useState<{ locationId: string; locationName: string; creating: boolean } | null>(null);
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('location_portals' as any).select('*');
      if (error) throw error;
      const map: Record<string, Portal> = {};
      ((data || []) as unknown as Portal[]).forEach((p) => { map[p.location_id] = p; });
      setPortals(map);
    } catch (e) {
      console.error('Erro ao carregar portais:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const savePortal = async (locationId: string, patch: Partial<Portal>) => {
    const p = portals[locationId];
    if (!p) return;
    setBusy(locationId);
    // Otimista: o switch responde na hora
    setPortals((prev) => ({ ...prev, [locationId]: { ...p, ...patch } }));
    try {
      const { error } = await supabase.from('location_portals' as any).update(patch as any).eq('id', p.id);
      if (error) throw error;
    } catch (e: any) {
      setPortals((prev) => ({ ...prev, [locationId]: p }));
      toast.error(`Erro ao salvar: ${e?.message || 'desconhecido'}`);
    } finally {
      setBusy(null);
    }
  };

  const openCreate = (locationId: string, locationName: string) => {
    setPin('');
    setShowPin(false);
    setPinDialog({ locationId, locationName, creating: true });
  };

  const openChangePin = (locationId: string, locationName: string) => {
    setPin('');
    setShowPin(false);
    setPinDialog({ locationId, locationName, creating: false });
  };

  const handlePinSubmit = async () => {
    if (!pinDialog) return;
    if (!/^\d{4,6}$/.test(pin)) { toast.error('O PIN deve ter de 4 a 6 números.'); return; }
    setBusy(pinDialog.locationId);
    try {
      if (pinDialog.creating) {
        const token = generateToken();
        const { error } = await supabase.from('location_portals' as any).insert({
          location_id: pinDialog.locationId,
          token,
          pin_hash: await hashPin(token, pin),
        } as any);
        if (error) throw error;
        toast.success('Portal criado. Agora escolha o que o síndico pode ver.');
      } else {
        const p = portals[pinDialog.locationId];
        const { error } = await supabase
          .from('location_portals' as any)
          .update({ pin_hash: await hashPin(p.token, pin), failed_attempts: 0, locked_until: null } as any)
          .eq('id', p.id);
        if (error) throw error;
        toast.success('PIN alterado.');
      }
      setPinDialog(null);
      load();
    } catch (e: any) {
      toast.error(`Erro: ${e?.message || 'desconhecido'}`);
    } finally {
      setBusy(null);
    }
  };

  const regenerateLink = async (locationId: string) => {
    const p = portals[locationId];
    if (!p) return;
    if (!confirm('Gerar um novo link? O link antigo para de funcionar e você precisará definir um novo PIN.')) return;
    setPin('');
    // Troca o token e exige PIN novo (o hash antigo é do token antigo)
    setBusy(locationId);
    try {
      const token = generateToken();
      const { error } = await supabase
        .from('location_portals' as any)
        .update({ token, pin_hash: null, failed_attempts: 0, locked_until: null } as any)
        .eq('id', p.id);
      if (error) throw error;
      await load();
      const loc = locations.find((l) => l.id === locationId);
      setPinDialog({ locationId, locationName: loc?.name || '', creating: false });
      toast.success('Novo link gerado. Defina o PIN.');
    } catch (e: any) {
      toast.error(`Erro: ${e?.message || 'desconhecido'}`);
    } finally {
      setBusy(null);
    }
  };

  const copyLink = (token: string) => {
    navigator.clipboard?.writeText(portalUrl(token)).then(
      () => toast.success('Link copiado.'),
      () => toast.error('Não foi possível copiar.'),
    );
  };

  const shareWhatsApp = (locationName: string, token: string) => {
    const text =
      `Olá! Este é o portal de acompanhamento do ${locationName}.\n` +
      `Acesse: ${portalUrl(token)}\n` +
      `O PIN de acesso eu passo por aqui em seguida.`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const isLoading = loading || locationsLoading;

  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto space-y-5 animate-fade-in pb-6">
        <PageHeader
          icon={<Building2 className="h-6 w-6" />}
          title="Portal do Síndico"
          description="Um link por condomínio. O síndico só vê o que você liberar."
        />
        <MasterCompanyNotice />

        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 text-sm text-muted-foreground">
            O síndico abre o link, digita o PIN e vê o posto dele — sem cadastro, sem senha de app.
            <strong className="text-foreground"> Tudo começa desligado</strong>: você liga item por item.
            Pode desativar ou trocar o link a qualquer momento.
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-40 w-full rounded-lg" />)}</div>
        ) : locations.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="font-medium">Nenhum local cadastrado</p>
              <p className="text-sm text-muted-foreground mt-1">Cadastre os condomínios em Locais de Trabalho primeiro.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {locations.map((loc) => {
              const p = portals[loc.id];
              const isBusy = busy === loc.id;
              return (
                <Card key={loc.id}>
                  <CardContent className="p-4 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold">{loc.name}</p>
                        {p && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {p.access_count > 0
                              ? `${p.access_count} acesso(s) · último em ${p.last_access_at ? format(new Date(p.last_access_at), 'dd/MM HH:mm') : '—'}`
                              : 'Nenhum acesso ainda'}
                          </p>
                        )}
                      </div>
                      {p ? (
                        <Badge variant={p.is_active ? 'success' : 'secondary'}>
                          {p.is_active ? 'Ativo' : 'Desativado'}
                        </Badge>
                      ) : (
                        <Button size="sm" onClick={() => openCreate(loc.id, loc.name)} disabled={isBusy}>
                          <Link2 className="h-4 w-4 mr-1.5" />
                          Criar portal
                        </Button>
                      )}
                    </div>

                    {p && (
                      <>
                        {/* Link */}
                        <div className="rounded-lg bg-muted/50 p-3 space-y-2">
                          <p className="font-mono text-xs break-all">{portalUrl(p.token)}</p>
                          <div className="flex flex-wrap gap-2">
                            <Button variant="outline" size="sm" onClick={() => copyLink(p.token)}>
                              <Copy className="h-3.5 w-3.5 mr-1.5" /> Copiar
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => shareWhatsApp(loc.name, p.token)}>
                              <MessageCircle className="h-3.5 w-3.5 mr-1.5" /> Enviar no WhatsApp
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => openChangePin(loc.id, loc.name)}>
                              <KeyRound className="h-3.5 w-3.5 mr-1.5" /> {p.pin_hash ? 'Trocar PIN' : 'Definir PIN'}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => regenerateLink(loc.id)} disabled={isBusy}>
                              <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Novo link
                            </Button>
                          </div>
                          {!p.pin_hash && (
                            <p className="text-xs text-destructive">Sem PIN: qualquer pessoa com o link entra. Defina um PIN.</p>
                          )}
                        </div>

                        {/* O que o síndico vê */}
                        <div className="space-y-2">
                          <p className="text-sm font-medium">O que o síndico pode ver</p>
                          {VISIBILITY.map(({ key, label, help }) => (
                            <div key={key} className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                              <div className="pr-3">
                                <p className="text-sm">{label}</p>
                                <p className="text-xs text-muted-foreground">{help}</p>
                              </div>
                              <Switch
                                checked={!!p[key]}
                                disabled={isBusy}
                                onCheckedChange={(v) => savePortal(loc.id, { [key]: v } as Partial<Portal>)}
                              />
                            </div>
                          ))}
                          <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                            <div className="pr-3">
                              <p className="text-sm">Histórico de dias anteriores</p>
                              <p className="text-xs text-muted-foreground">Quem trabalhou em cada dia (e horários, se liberado acima).</p>
                            </div>
                            <Select
                              value={String(p.history_days)}
                              onValueChange={(v) => savePortal(loc.id, { history_days: Number(v) })}
                            >
                              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="0">Não mostrar</SelectItem>
                                <SelectItem value="7">7 dias</SelectItem>
                                <SelectItem value="15">15 dias</SelectItem>
                                <SelectItem value="30">30 dias</SelectItem>
                                <SelectItem value="60">60 dias</SelectItem>
                                <SelectItem value="90">90 dias</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-sm">Recado no topo do portal (opcional)</Label>
                          <Textarea
                            rows={2}
                            defaultValue={p.welcome_text ?? ''}
                            placeholder="Ex: Dúvidas? Fale com a Aqualife: (21) 99999-9999"
                            onBlur={(e) => {
                              const v = e.target.value.trim() || null;
                              if (v !== (p.welcome_text ?? null)) savePortal(loc.id, { welcome_text: v });
                            }}
                          />
                        </div>

                        <div className="flex justify-end border-t border-border/60 pt-3">
                          <Button
                            variant={p.is_active ? 'outline' : 'default'}
                            size="sm"
                            disabled={isBusy}
                            onClick={() => savePortal(loc.id, { is_active: !p.is_active })}
                          >
                            <Power className="h-3.5 w-3.5 mr-1.5" />
                            {p.is_active ? 'Desativar portal' : 'Reativar portal'}
                          </Button>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={!!pinDialog} onOpenChange={(o) => { if (!o) setPinDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{pinDialog?.creating ? 'Criar portal' : 'PIN do portal'} — {pinDialog?.locationName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>PIN de acesso (4 a 6 números)</Label>
              <div className="flex gap-2">
                <Input
                  type={showPin ? 'text' : 'password'}
                  inputMode="numeric"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className="font-mono tracking-widest"
                />
                <Button variant="ghost" size="icon" onClick={() => setShowPin((s) => !s)} aria-label="Mostrar PIN">
                  {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Passe o PIN ao síndico separado do link (por voz ou outra mensagem). Após 5 erros, o portal trava por 15 minutos.
              </p>
            </div>
            <Button className="w-full" onClick={handlePinSubmit} disabled={!!busy}>
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <KeyRound className="h-4 w-4 mr-2" />}
              {pinDialog?.creating ? 'Criar portal' : 'Salvar PIN'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}

import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Search, Bell, Phone, MoreVertical, Edit, Trash2, Loader2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { useLocations } from '@/hooks/useLocations';
import { useAuth } from '@/contexts/AuthContext';
import { getImpersonatedCompanyId } from '@/components/ImpersonationBar';
import type { Tables, TablesInsert } from '@/integrations/supabase/types';

type NotificationRecipient = Tables<'notification_recipients'>;
type NotificationScope = 'all' | 'location';

export default function NotificationRecipients() {
  const { companyStatus } = useAuth();
  const [recipients, setRecipients] = useState<NotificationRecipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { locations } = useLocations();

  const resolveCompanyId = async (): Promise<string | null> => {
    const imp = getImpersonatedCompanyId();
    if (imp) return imp;
    if (companyStatus?.id) return companyStatus.id;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: emp } = await supabase.from('employees').select('company_id').eq('user_id', user.id).maybeSingle();
    if (emp?.company_id) return emp.company_id;
    const { data: owned } = await supabase.from('companies').select('id').eq('admin_user_id', user.id).maybeSingle();
    return owned?.id ?? null;
  };
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRecipient, setEditingRecipient] = useState<NotificationRecipient | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    whatsapp: '',
    receives_entry: true,
    receives_lunch_out: true,
    receives_lunch_in: true,
    receives_exit: true,
    receives_alerts: true,
    scope_type: 'all' as NotificationScope,
    scope_id: '' as string,
    is_location_admin: false,
  });

  const resetForm = () => {
    setFormData({
      name: '',
      whatsapp: '',
      receives_entry: true,
      receives_lunch_out: true,
      receives_lunch_in: true,
      receives_exit: true,
      receives_alerts: true,
      scope_type: 'all',
      scope_id: '',
      is_location_admin: false,
    });
    setEditingRecipient(null);
  };

  const openEditDialog = (recipient: NotificationRecipient) => {
    setEditingRecipient(recipient);
    setFormData({
      name: recipient.name,
      whatsapp: recipient.whatsapp,
      receives_entry: recipient.receives_entry,
      receives_lunch_out: recipient.receives_lunch_out,
      receives_lunch_in: recipient.receives_lunch_in,
      receives_exit: recipient.receives_exit,
      receives_alerts: recipient.receives_alerts,
      scope_type: recipient.scope_type as NotificationScope,
      scope_id: recipient.scope_id || '',
      is_location_admin: (recipient as any).is_location_admin || false,
    });
    setDialogOpen(true);
  };

  const fetchRecipients = async () => {
    try {
      const { data, error } = await supabase
        .from('notification_recipients')
        .select('*')
        .order('name');

      if (error) throw error;
      setRecipients(data || []);
    } catch (error: any) {
      console.error('Error fetching recipients:', error);
      toast.error('Erro ao carregar destinatários');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecipients();
  }, []);

  const filteredRecipients = recipients.filter((rec) =>
    rec.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    rec.whatsapp.includes(searchTerm)
  );

  const handleSaveRecipient = async () => {
    if (!formData.name || !formData.whatsapp) {
      toast.error('Preencha nome e WhatsApp');
      return;
    }

    if (formData.scope_type === 'location' && !formData.scope_id) {
      toast.error('Selecione um local');
      return;
    }

    setSaving(true);
    try {
      const data = {
        name: formData.name,
        whatsapp: formData.whatsapp,
        receives_entry: formData.receives_entry,
        receives_lunch_out: formData.receives_lunch_out,
        receives_lunch_in: formData.receives_lunch_in,
        receives_exit: formData.receives_exit,
        receives_alerts: formData.is_location_admin ? false : formData.receives_alerts, // Síndicos não recebem alertas
        scope_type: formData.scope_type,
        scope_id: formData.scope_type === 'location' ? formData.scope_id : null,
        is_location_admin: formData.is_location_admin,
      };

      if (editingRecipient) {
        // Update existing
        const { error } = await supabase
          .from('notification_recipients')
          .update(data)
          .eq('id', editingRecipient.id);

        if (error) throw error;
        toast.success('Destinatário atualizado!');
      } else {
        // Insert new — stamp company_id so the RLS company check passes
        const companyId = await resolveCompanyId();
        const { error } = await supabase
          .from('notification_recipients')
          .insert({ ...data, company_id: companyId });

        if (error) throw error;
        toast.success('Destinatário adicionado!');
      }

      await fetchRecipients();
      resetForm();
      setDialogOpen(false);
    } catch (error: any) {
      console.error('Error saving recipient:', error);
      toast.error(`Erro ao salvar destinatário: ${error?.message || error?.code || 'desconhecido'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRecipient = async (id: string) => {
    if (!confirm('Remover este destinatário?')) return;

    try {
      const { error } = await supabase
        .from('notification_recipients')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setRecipients(recipients.filter((rec) => rec.id !== id));
      toast.success('Destinatário removido');
    } catch (error: any) {
      console.error('Error deleting recipient:', error);
      toast.error('Erro ao remover destinatário');
    }
  };

  const getScopeLabel = (recipient: NotificationRecipient) => {
    if (recipient.scope_type === 'all') {
      return 'Todos os Locais';
    }
    if (recipient.scope_type === 'location' && recipient.scope_id) {
      const location = locations.find(l => l.id === recipient.scope_id);
      return location?.name || 'Local específico';
    }
    return 'Todos os Locais';
  };

  const getNotificationsList = (recipient: NotificationRecipient) => {
    const notifications = [];
    if (recipient.receives_entry) notifications.push('Entrada');
    if (recipient.receives_lunch_out) notifications.push('Saída Almoço');
    if (recipient.receives_lunch_in) notifications.push('Volta Almoço');
    if (recipient.receives_exit) notifications.push('Saída');
    if (recipient.receives_alerts) notifications.push('Alertas');
    return notifications;
  };

  const isLocationAdmin = (recipient: NotificationRecipient) => {
    return (recipient as any).is_location_admin === true;
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground">
              Notificações WhatsApp
            </h1>
            <p className="text-muted-foreground mt-1">
              Configure quem recebe notificações
            </p>
          </div>

          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button variant="glow" onClick={() => resetForm()}>
                <Plus className="h-4 w-4 mr-2" />
                Novo Destinatário
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{editingRecipient ? 'Editar Destinatário' : 'Adicionar Destinatário'}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome</Label>
                  <Input
                    id="name"
                    placeholder="Nome do destinatário"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="whatsapp">WhatsApp</Label>
                  <Input
                    id="whatsapp"
                    placeholder="5521999999999"
                    value={formData.whatsapp}
                    onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Formato: código do país + DDD + número (ex: 5521999999999)
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="scope">Escopo</Label>
                  <Select
                    value={formData.scope_type}
                    onValueChange={(value: NotificationScope) =>
                      setFormData({ ...formData, scope_type: value, scope_id: '' })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os Locais</SelectItem>
                      <SelectItem value="location">Local específico</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {formData.scope_type === 'location' && (
                  <div className="space-y-2">
                    <Label htmlFor="location">Selecione o Local</Label>
                    <Select
                      value={formData.scope_id}
                      onValueChange={(value) =>
                        setFormData({ ...formData, scope_id: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Escolha um local" />
                      </SelectTrigger>
                      <SelectContent>
                        {locations.map((location) => (
                          <SelectItem key={location.id} value={location.id}>
                            {location.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {locations.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        Nenhum local cadastrado. Crie um local primeiro.
                      </p>
                    )}
                  </div>
                )}

                {/* Identificação de síndico/admin do local */}
                <div className="space-y-2 p-3 rounded-lg bg-warning/10 border border-warning/20">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="is_location_admin"
                      checked={formData.is_location_admin}
                      onCheckedChange={(checked) =>
                        setFormData({ 
                          ...formData, 
                          is_location_admin: checked as boolean,
                          receives_alerts: checked ? false : formData.receives_alerts 
                        })
                      }
                    />
                    <Label htmlFor="is_location_admin" className="font-medium cursor-pointer">
                      É síndico/administrador do local
                    </Label>
                  </div>
                  <p className="text-xs text-muted-foreground ml-6">
                    Síndicos recebem apenas notificações de ponto (entrada, almoço, saída), mas NÃO recebem alertas de atraso ou respostas de funcionários.
                  </p>
                </div>

                <div className="space-y-3">
                  <Label>O que receber</Label>
                  <div className="space-y-2">
                    {[
                      { key: 'receives_entry', label: 'Entrada' },
                      { key: 'receives_lunch_out', label: 'Saída Almoço' },
                      { key: 'receives_lunch_in', label: 'Volta Almoço' },
                      { key: 'receives_exit', label: 'Saída Final' },
                    ].map(({ key, label }) => (
                      <div key={key} className="flex items-center space-x-2">
                        <Checkbox
                          id={key}
                          checked={formData[key as keyof typeof formData] as boolean}
                          onCheckedChange={(checked) =>
                            setFormData({ ...formData, [key]: checked })
                          }
                        />
                        <Label htmlFor={key} className="font-normal cursor-pointer">
                          {label}
                        </Label>
                      </div>
                    ))}
                    {/* Alertas desabilitado para síndicos */}
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="receives_alerts"
                        checked={formData.receives_alerts}
                        disabled={formData.is_location_admin}
                        onCheckedChange={(checked) =>
                          setFormData({ ...formData, receives_alerts: checked as boolean })
                        }
                      />
                      <Label 
                        htmlFor="receives_alerts" 
                        className={`font-normal cursor-pointer ${formData.is_location_admin ? 'text-muted-foreground' : ''}`}
                      >
                        Alertas de Ausência {formData.is_location_admin && '(desabilitado para síndicos)'}
                      </Label>
                    </div>
                  </div>
                </div>

                <Button className="w-full" onClick={handleSaveRecipient} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editingRecipient ? 'Salvar' : 'Adicionar'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar destinatários..."
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Recipients List */}
        <div className="grid gap-4 md:grid-cols-2">
          {filteredRecipients.map((recipient, index) => (
            <Card
              key={recipient.id}
              variant="interactive"
              className="animate-slide-up"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
                      <Bell className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{recipient.name}</h3>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Phone className="h-3 w-3" />
                        <span>{recipient.whatsapp}</span>
                      </div>
                    </div>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEditDialog(recipient)}>
                        <Edit className="h-4 w-4 mr-2" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => handleDeleteRecipient(recipient.id)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Remover
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="mt-4 pt-4 border-t border-border">
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-xs text-muted-foreground">
                      {getScopeLabel(recipient)}
                    </p>
                    {isLocationAdmin(recipient) && (
                      <span className="inline-flex px-2 py-0.5 rounded text-xs bg-warning/20 text-warning font-medium">
                        Síndico
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {getNotificationsList(recipient).map((notif) => (
                      <span
                        key={notif}
                        className="inline-flex px-2 py-0.5 rounded text-xs bg-primary/10 text-primary"
                      >
                        {notif}
                      </span>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {filteredRecipients.length === 0 && (
          <Card variant="default">
            <CardContent className="py-12 text-center">
              <Bell className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold">Nenhum destinatário encontrado</h3>
              <p className="text-muted-foreground mt-1">
                Adicione destinatários para receber notificações.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  );
}

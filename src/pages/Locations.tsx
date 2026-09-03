import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { MasterCompanyNotice } from '@/components/MasterCompanyNotice';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { toast } from 'sonner';
import { Plus, Search, MapPin, MoreVertical, Edit, Trash2, QrCode, Loader2, Building2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useLocations } from '@/hooks/useLocations';
import { useCompanyLimits } from '@/hooks/useCompanyLimits';
import { Badge } from '@/components/ui/badge';
import { LocationQRCode } from '@/components/locations/LocationQRCode';
import { AddressSearch } from '@/components/locations/AddressSearch';
import { CEPSearch } from '@/components/locations/CEPSearch';
import { LocationMapPreview } from '@/components/locations/LocationMapPreview';
import type { Tables } from '@/integrations/supabase/types';

type Location = Tables<'locations'>;

export default function Locations() {
  const { locations, loading, needsCompanySelection, addLocation, updateLocation, deleteLocation } = useLocations();
  const { limits } = useCompanyLimits();
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [qrSheetOpen, setQrSheetOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [saving, setSaving] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    latitude: '',
    longitude: '',
    radius: '100',
  });

  const filteredLocations = locations.filter((loc) =>
    loc.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const resetForm = () => {
    setFormData({ name: '', latitude: '', longitude: '', radius: '100' });
  };

  const handleAdd = async () => {
    if (!formData.name || !formData.latitude || !formData.longitude) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    setSaving(true);
    try {
      await addLocation({
        name: formData.name,
        latitude: parseFloat(formData.latitude),
        longitude: parseFloat(formData.longitude),
        radius: parseInt(formData.radius),
      });
      resetForm();
      setDialogOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!selectedLocation || !formData.name || !formData.latitude || !formData.longitude) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    setSaving(true);
    try {
      await updateLocation(selectedLocation.id, {
        name: formData.name,
        latitude: parseFloat(formData.latitude),
        longitude: parseFloat(formData.longitude),
        radius: parseInt(formData.radius),
      });
      setEditDialogOpen(false);
      setSelectedLocation(null);
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (location: Location) => {
    if (confirm(`Remover "${location.name}"?`)) {
      await deleteLocation(location.id);
    }
  };

  const openEditDialog = (location: Location) => {
    setSelectedLocation(location);
    setFormData({
      name: location.name,
      latitude: location.latitude.toString(),
      longitude: location.longitude.toString(),
      radius: location.radius.toString(),
    });
    setEditDialogOpen(true);
  };

  const openQrSheet = (location: Location) => {
    setSelectedLocation(location);
    setQrSheetOpen(true);
  };

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocalização não suportada');
      return;
    }

    setGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setFormData({
          ...formData,
          latitude: position.coords.latitude.toFixed(6),
          longitude: position.coords.longitude.toFixed(6),
        });
        toast.success('Localização obtida!');
        setGettingLocation(false);
      },
      (error) => {
        toast.error('Não foi possível obter sua localização');
        setGettingLocation(false);
      },
      { enableHighAccuracy: true }
    );
  };

  const handleAddressSelect = (lat: number, lng: number, address: string) => {
    setFormData({
      ...formData,
      latitude: lat.toFixed(6),
      longitude: lng.toFixed(6),
    });
    toast.success('Coordenadas preenchidas!');
  };

  const handleMapLocationChange = (lat: number, lng: number) => {
    setFormData((prev) => ({
      ...prev,
      latitude: lat.toFixed(6),
      longitude: lng.toFixed(6),
    }));
  };

  // LocationForm moved to render to prevent losing focus on input

  if (loading) {
    return (
      <MainLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-2">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
            <Skeleton className="h-10 w-40 rounded-md" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
        </div>
      </MainLayout>
    );
  }

  if (needsCompanySelection) {
    return (
      <MainLayout>
        <div className="space-y-6">
          <MasterCompanyNotice />
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
            <div className="flex items-center gap-3">
              <h1 className="text-2xl lg:text-3xl font-bold text-foreground">
                Locais de Trabalho
              </h1>
              {limits && (
                <Badge variant="outline" className="flex items-center gap-1.5 px-3 py-1">
                  <Building2 className="h-3.5 w-3.5" />
                  <span className="font-medium">{locations.length}/{limits.maxLocations}</span>
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground mt-1">
              Gerencie os locais de registro de ponto
            </p>
          </div>

          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button variant="glow">
                <Plus className="h-4 w-4 mr-2" />
                Novo Local
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Adicionar Local de Trabalho</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="add-name">Nome do Local</Label>
                  <Input
                    id="add-name"
                    placeholder="Ex: Escritório Central"
                    value={formData.name}
                    onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Buscar por CEP</Label>
                  <CEPSearch onLocationSelect={handleAddressSelect} />
                </div>

                <div className="space-y-2">
                  <Label>Buscar por Endereço</Label>
                  <AddressSearch onLocationSelect={handleAddressSelect} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="add-latitude">Latitude</Label>
                    <Input
                      id="add-latitude"
                      placeholder="-23.5505"
                      value={formData.latitude}
                      onChange={(e) => setFormData((prev) => ({ ...prev, latitude: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="add-longitude">Longitude</Label>
                    <Input
                      id="add-longitude"
                      placeholder="-46.6333"
                      value={formData.longitude}
                      onChange={(e) => setFormData((prev) => ({ ...prev, longitude: e.target.value }))}
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={handleGetCurrentLocation}
                  disabled={gettingLocation}
                >
                  {gettingLocation ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <MapPin className="h-4 w-4 mr-2" />
                  )}
                  Usar minha localização atual
                </Button>
                <div className="space-y-2">
                  <Label htmlFor="add-radius">Raio de validação (metros)</Label>
                  <Input
                    id="add-radius"
                    type="number"
                    placeholder="100"
                    value={formData.radius}
                    onChange={(e) => setFormData((prev) => ({ ...prev, radius: e.target.value }))}
                  />
                </div>

                {/* Mapa de confirmação visual */}
                <div className="space-y-2">
                  <Label>Confirmação Visual</Label>
                  <LocationMapPreview
                    latitude={parseFloat(formData.latitude) || 0}
                    longitude={parseFloat(formData.longitude) || 0}
                    radius={parseInt(formData.radius) || 100}
                    name={formData.name}
                    onLocationChange={handleMapLocationChange}
                  />
                </div>

                <Button className="w-full" onClick={handleAdd} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Adicionar
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar locais..."
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Locations List */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredLocations.map((location, index) => (
            <Card
              key={location.id}
              variant="interactive"
              className="animate-slide-up"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center text-success">
                      <MapPin className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{location.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        Raio: {location.radius}m
                      </p>
                    </div>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openQrSheet(location)}>
                        <QrCode className="h-4 w-4 mr-2" />
                        Ver QR Code
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openEditDialog(location)}>
                        <Edit className="h-4 w-4 mr-2" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => handleDelete(location)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Remover
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="mt-4 pt-4 border-t border-border">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Código</span>
                    <span className="font-mono text-xs">
                      {location.qr_code.substring(0, 8).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm mt-2">
                    <span className="text-muted-foreground">Coordenadas</span>
                    <span className="font-mono text-xs">
                      {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
                    </span>
                  </div>
                </div>

                {/* Quick QR Button */}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-4"
                  onClick={() => openQrSheet(location)}
                >
                  <QrCode className="h-4 w-4 mr-2" />
                  QR Code
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {filteredLocations.length === 0 && (
          <Card variant="default">
            <CardContent className="py-14 text-center flex flex-col items-center">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <MapPin className="h-7 w-7 text-primary" />
              </div>
              {locations.length === 0 ? (
                <>
                  <h3 className="text-lg font-semibold">Cadastre seu primeiro local</h3>
                  <p className="text-muted-foreground mt-1 max-w-sm">
                    Cada local ganha um QR Code e um raio de GPS para validar as batidas.
                  </p>
                  <Button className="mt-5" onClick={() => setDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Novo Local
                  </Button>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-semibold">Nenhum local encontrado</h3>
                  <p className="text-muted-foreground mt-1">Ajuste sua busca.</p>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Edit Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={(open) => { setEditDialogOpen(open); if (!open) { setSelectedLocation(null); resetForm(); } }}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Editar Local de Trabalho</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Nome do Local</Label>
                <Input
                  id="edit-name"
                  placeholder="Ex: Escritório Central"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label>Buscar por CEP</Label>
                <CEPSearch onLocationSelect={handleAddressSelect} />
              </div>

              <div className="space-y-2">
                <Label>Buscar por Endereço</Label>
                <AddressSearch onLocationSelect={handleAddressSelect} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-latitude">Latitude</Label>
                  <Input
                    id="edit-latitude"
                    placeholder="-23.5505"
                    value={formData.latitude}
                    onChange={(e) => setFormData((prev) => ({ ...prev, latitude: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-longitude">Longitude</Label>
                  <Input
                    id="edit-longitude"
                    placeholder="-46.6333"
                    value={formData.longitude}
                    onChange={(e) => setFormData((prev) => ({ ...prev, longitude: e.target.value }))}
                  />
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleGetCurrentLocation}
                disabled={gettingLocation}
              >
                {gettingLocation ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <MapPin className="h-4 w-4 mr-2" />
                )}
                Usar minha localização atual
              </Button>
              <div className="space-y-2">
                <Label htmlFor="edit-radius">Raio de validação (metros)</Label>
                <Input
                  id="edit-radius"
                  type="number"
                  placeholder="100"
                  value={formData.radius}
                  onChange={(e) => setFormData((prev) => ({ ...prev, radius: e.target.value }))}
                />
              </div>

              {/* Mapa de confirmação visual */}
              <div className="space-y-2">
                <Label>Confirmação Visual</Label>
                <LocationMapPreview
                  latitude={parseFloat(formData.latitude) || 0}
                  longitude={parseFloat(formData.longitude) || 0}
                  radius={parseInt(formData.radius) || 100}
                  name={formData.name}
                  onLocationChange={handleMapLocationChange}
                />
              </div>

              <Button className="w-full" onClick={handleEdit} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* QR Code Sheet */}
        <Sheet open={qrSheetOpen} onOpenChange={(open) => { setQrSheetOpen(open); if (!open) setSelectedLocation(null); }}>
          <SheetContent className="w-full sm:max-w-md overflow-y-auto">
            <SheetHeader>
              <SheetTitle>QR Code do Local</SheetTitle>
            </SheetHeader>
            {selectedLocation && (
              <div className="mt-6">
                <LocationQRCode
                  locationId={selectedLocation.id}
                  locationName={selectedLocation.name}
                  qrCode={selectedLocation.qr_code}
                />
              </div>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </MainLayout>
  );
}
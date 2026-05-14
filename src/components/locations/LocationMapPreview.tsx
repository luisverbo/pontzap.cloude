import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface LocationMapPreviewProps {
  latitude: number;
  longitude: number;
  radius: number;
  name?: string;
  onLocationChange?: (lat: number, lng: number) => void;
}

// Fix for default marker icon in Leaflet with bundlers
const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

export function LocationMapPreview({ latitude, longitude, radius, name, onLocationChange }: LocationMapPreviewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const [isValidCoords, setIsValidCoords] = useState(false);

  useEffect(() => {
    // Valida coordenadas
    const validLat = !isNaN(latitude) && latitude >= -90 && latitude <= 90;
    const validLng = !isNaN(longitude) && longitude >= -180 && longitude <= 180;
    setIsValidCoords(validLat && validLng && latitude !== 0 && longitude !== 0);
  }, [latitude, longitude]);

  useEffect(() => {
    if (!mapContainer.current || !isValidCoords) return;

    // Inicializa o mapa se não existir
    if (!mapRef.current) {
      mapRef.current = L.map(mapContainer.current, {
        center: [latitude, longitude],
        zoom: 17,
        zoomControl: true,
        scrollWheelZoom: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(mapRef.current);

      // Adiciona marcador arrastável
      markerRef.current = L.marker([latitude, longitude], { 
        icon: defaultIcon,
        draggable: !!onLocationChange // Só permite arrastar se tiver callback
      })
        .addTo(mapRef.current)
        .bindPopup(name || 'Arraste para ajustar a posição');

      // Evento de arrastar o marcador
      if (onLocationChange) {
        markerRef.current.on('dragend', function(e) {
          const marker = e.target;
          const position = marker.getLatLng();
          
          // Atualiza círculo junto com o marcador
          if (circleRef.current) {
            circleRef.current.setLatLng(position);
          }
          
          // Notifica mudança de posição
          onLocationChange(position.lat, position.lng);
        });
      }

      // Adiciona círculo do raio
      circleRef.current = L.circle([latitude, longitude], {
        color: '#0891b2',
        fillColor: '#0891b2',
        fillOpacity: 0.2,
        radius: radius || 100,
      }).addTo(mapRef.current);
    } else {
      // Atualiza posição do mapa, marcador e círculo
      mapRef.current.setView([latitude, longitude], mapRef.current.getZoom());

      if (markerRef.current) {
        markerRef.current.setLatLng([latitude, longitude]);
        if (name) {
          markerRef.current.setPopupContent(name);
        }
      }

      if (circleRef.current) {
        circleRef.current.setLatLng([latitude, longitude]);
        circleRef.current.setRadius(radius || 100);
      }
    }

    return () => {
      // Cleanup apenas quando componente for desmontado
    };
  }, [latitude, longitude, radius, name, isValidCoords, onLocationChange]);

  // Cleanup do mapa ao desmontar
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
        circleRef.current = null;
      }
    };
  }, []);

  if (!isValidCoords) {
    return (
      <div className="w-full h-48 rounded-lg border border-border bg-muted/50 flex items-center justify-center">
        <p className="text-sm text-muted-foreground text-center px-4">
          Preencha as coordenadas para visualizar o mapa
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div 
        ref={mapContainer} 
        className="w-full h-48 rounded-lg border border-border overflow-hidden"
        style={{ zIndex: 0 }}
      />
      <p className="text-xs text-muted-foreground text-center">
        {onLocationChange 
          ? `Arraste o marcador para ajustar a posição. Raio: ${radius}m`
          : `O círculo azul indica o raio de validação (${radius}m)`
        }
      </p>
    </div>
  );
}

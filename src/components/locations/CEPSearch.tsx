import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, MapPin } from 'lucide-react';
import { toast } from 'sonner';

interface CEPSearchProps {
  onLocationSelect: (lat: number, lng: number, address: string) => void;
}

interface ViaCEPResult {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  localidade: string;
  uf: string;
  erro?: boolean;
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

export function CEPSearch({ onLocationSelect }: CEPSearchProps) {
  const [cep, setCep] = useState('');
  const [loading, setLoading] = useState(false);

  const formatCEP = (value: string) => {
    // Remove tudo que não é número
    const numbers = value.replace(/\D/g, '');
    // Limita a 8 dígitos
    const limited = numbers.slice(0, 8);
    // Formata com hífen
    if (limited.length > 5) {
      return `${limited.slice(0, 5)}-${limited.slice(5)}`;
    }
    return limited;
  };

  const handleCEPChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCep(formatCEP(e.target.value));
  };

  const searchCEP = async () => {
    const cleanCEP = cep.replace(/\D/g, '');
    
    if (cleanCEP.length !== 8) {
      toast.error('CEP deve ter 8 dígitos');
      return;
    }

    setLoading(true);
    try {
      // Busca endereço via ViaCEP
      const viaCepResponse = await fetch(`https://viacep.com.br/ws/${cleanCEP}/json/`);
      const viaCepData: ViaCEPResult = await viaCepResponse.json();

      if (viaCepData.erro) {
        toast.error('CEP não encontrado');
        setLoading(false);
        return;
      }

      // Monta endereço completo para buscar coordenadas
      const fullAddress = `${viaCepData.logradouro}, ${viaCepData.bairro}, ${viaCepData.localidade}, ${viaCepData.uf}, Brasil`;
      
      // Busca coordenadas via Nominatim
      const params = new URLSearchParams({
        format: 'json',
        q: fullAddress,
        limit: '1',
        countrycodes: 'br',
      });

      const nominatimResponse = await fetch(
        `https://nominatim.openstreetmap.org/search?${params.toString()}`,
        {
          headers: {
            'Accept-Language': 'pt-BR,pt;q=0.9',
            'User-Agent': 'PONTZAP-App/1.0',
          },
        }
      );

      const nominatimData: NominatimResult[] = await nominatimResponse.json();

      if (nominatimData.length === 0) {
        // Tenta busca mais genérica só com cidade
        const cityAddress = `${viaCepData.localidade}, ${viaCepData.uf}, Brasil`;
        const cityParams = new URLSearchParams({
          format: 'json',
          q: cityAddress,
          limit: '1',
          countrycodes: 'br',
        });

        const cityResponse = await fetch(
          `https://nominatim.openstreetmap.org/search?${cityParams.toString()}`,
          {
            headers: {
              'Accept-Language': 'pt-BR,pt;q=0.9',
              'User-Agent': 'PONTZAP-App/1.0',
            },
          }
        );

        const cityData: NominatimResult[] = await cityResponse.json();

        if (cityData.length === 0) {
          toast.error('Não foi possível obter coordenadas para este CEP');
          setLoading(false);
          return;
        }

        const formattedAddress = `${viaCepData.logradouro ? viaCepData.logradouro + ', ' : ''}${viaCepData.bairro} - ${viaCepData.localidade}/${viaCepData.uf}`;
        onLocationSelect(
          parseFloat(cityData[0].lat),
          parseFloat(cityData[0].lon),
          formattedAddress
        );
        toast.success('Endereço encontrado! (coordenadas aproximadas da cidade)');
      } else {
        const formattedAddress = `${viaCepData.logradouro ? viaCepData.logradouro + ', ' : ''}${viaCepData.bairro} - ${viaCepData.localidade}/${viaCepData.uf}`;
        onLocationSelect(
          parseFloat(nominatimData[0].lat),
          parseFloat(nominatimData[0].lon),
          formattedAddress
        );
        toast.success('Endereço encontrado!');
      }
    } catch (error) {
      console.error('Error searching CEP:', error);
      toast.error('Erro ao buscar CEP');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Digite o CEP (ex: 01310-100)"
          className="pl-10"
          value={cep}
          onChange={handleCEPChange}
          onKeyDown={(e) => e.key === 'Enter' && searchCEP()}
          maxLength={9}
        />
      </div>
      <Button type="button" variant="outline" onClick={searchCEP} disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Buscar'}
      </Button>
    </div>
  );
}

import { useState, useCallback, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Loader2, MapPin } from 'lucide-react';
import { toast } from 'sonner';

interface AddressSearchProps {
  onLocationSelect: (lat: number, lng: number, address: string) => void;
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  address?: {
    road?: string;
    house_number?: string;
    suburb?: string;
    neighbourhood?: string;
    city?: string;
    town?: string;
    village?: string;
    city_district?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
  importance?: number;
  type?: string;
  class?: string;
}

export function AddressSearch({ onLocationSelect }: AddressSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

  // Fecha resultados ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const searchAddress = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim() || searchQuery.trim().length < 3) {
      setResults([]);
      setShowResults(false);
      return;
    }

    setLoading(true);
    try {
      // Melhora a query adicionando "Brasil" se não estiver presente
      let enhancedQuery = searchQuery.trim();
      const hasBrazilKeyword = /brasil|brazil|br$/i.test(enhancedQuery);
      if (!hasBrazilKeyword) {
        enhancedQuery = `${enhancedQuery}, Brasil`;
      }

      const params = new URLSearchParams({
        format: 'json',
        q: enhancedQuery,
        limit: '10',
        countrycodes: 'br',
        addressdetails: '1',
        dedupe: '1',
        polygon_geojson: '0',
      });

      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?${params.toString()}`,
        {
          headers: {
            'Accept-Language': 'pt-BR,pt;q=0.9',
            'User-Agent': 'PONTZAP-App/1.0',
          },
        }
      );

      if (!response.ok) throw new Error('Erro na busca');

      const data: NominatimResult[] = await response.json();
      
      // Filtra e ordena por relevância
      const sortedResults = data
        .filter(r => r.address) // Apenas resultados com detalhes de endereço
        .sort((a, b) => (b.importance || 0) - (a.importance || 0));

      setResults(sortedResults);
      setShowResults(true);

      if (sortedResults.length === 0) {
        toast.info('Nenhum endereço encontrado. Tente incluir cidade ou bairro.');
      }
    } catch (error) {
      console.error('Error searching address:', error);
      toast.error('Erro ao buscar endereço');
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounce automático ao digitar
  const handleQueryChange = (value: string) => {
    setQuery(value);
    
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (value.trim().length >= 3) {
      debounceRef.current = setTimeout(() => {
        searchAddress(value);
      }, 600);
    } else {
      setResults([]);
      setShowResults(false);
    }
  };

  const handleManualSearch = () => {
    if (!query.trim()) {
      toast.error('Digite um endereço para buscar');
      return;
    }
    if (query.trim().length < 3) {
      toast.error('Digite pelo menos 3 caracteres');
      return;
    }
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    searchAddress(query);
  };

  // Formata o endereço de forma completa incluindo número
  const formatAddress = (result: NominatimResult): { main: string; secondary: string } => {
    if (!result.address) {
      return { main: result.display_name, secondary: '' };
    }

    const { road, house_number, suburb, neighbourhood, city, town, village, city_district, state, postcode } = result.address;
    
    // Linha principal: Rua com número
    let mainParts: string[] = [];
    if (road) {
      if (house_number) {
        mainParts.push(`${road}, ${house_number}`);
      } else {
        mainParts.push(road);
      }
    }
    
    // Linha secundária: Bairro, Cidade, Estado
    let secondaryParts: string[] = [];
    const bairro = suburb || neighbourhood || city_district;
    if (bairro) secondaryParts.push(bairro);
    
    const cityName = city || town || village;
    if (cityName) secondaryParts.push(cityName);
    if (state) secondaryParts.push(state);
    if (postcode) secondaryParts.push(`CEP: ${postcode}`);

    return {
      main: mainParts.length > 0 ? mainParts.join('') : (bairro || cityName || result.display_name),
      secondary: secondaryParts.join(' - ')
    };
  };

  // Retorna endereço completo para salvar
  const getFullAddress = (result: NominatimResult): string => {
    if (!result.address) return result.display_name;

    const { road, house_number, suburb, neighbourhood, city, town, village, city_district, state } = result.address;
    const parts: string[] = [];

    if (road) {
      parts.push(house_number ? `${road}, ${house_number}` : road);
    }
    
    const bairro = suburb || neighbourhood || city_district;
    if (bairro) parts.push(bairro);
    
    const cityName = city || town || village;
    if (cityName) parts.push(cityName);
    if (state) parts.push(state);

    return parts.length > 0 ? parts.join(' - ') : result.display_name;
  };

  const selectResult = (result: NominatimResult) => {
    const fullAddress = getFullAddress(result);
    onLocationSelect(parseFloat(result.lat), parseFloat(result.lon), fullAddress);
    setQuery(fullAddress);
    setShowResults(false);
    setResults([]);
  };

  return (
    <div className="relative" ref={containerRef}>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Ex: Av. Paulista, 1000, São Paulo"
            className="pl-10"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleManualSearch()}
            onFocus={() => results.length > 0 && setShowResults(true)}
          />
        </div>
        <Button type="button" variant="outline" onClick={handleManualSearch} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Buscar'}
        </Button>
      </div>

      {showResults && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-72 overflow-y-auto">
          {results.map((result, index) => {
            const formatted = formatAddress(result);
            return (
              <button
                key={index}
                type="button"
                className="w-full px-4 py-3 text-left hover:bg-muted flex items-start gap-3 border-b border-border last:border-0 transition-colors"
                onClick={() => selectResult(result)}
              >
                <MapPin className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-medium truncate">{formatted.main}</span>
                  {formatted.secondary && (
                    <span className="text-xs text-muted-foreground truncate">{formatted.secondary}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {loading && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg p-4 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Buscando endereços...</span>
        </div>
      )}
    </div>
  );
}

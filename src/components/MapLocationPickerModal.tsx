import React, { useEffect, useRef, useState, useCallback } from 'react';
import { APIProvider, Map, AdvancedMarker, Pin, useMap } from '@vis.gl/react-google-maps';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { 
  MapPin, 
  Navigation, 
  Check, 
  X, 
  Search, 
  Loader2, 
  ExternalLink, 
  Compass, 
  Layers, 
  Globe,
  Key,
  HelpCircle
} from 'lucide-react';

interface MapLocationPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialLat?: number;
  initialLng?: number;
  initialAddress?: string;
  onConfirm: (data: { address: string; lat: number; lng: number; mapUrl: string }) => void;
}

// Default center: Ipiales, Nariño, Colombia
const DEFAULT_LAT = 0.83028;
const DEFAULT_LNG = -77.64444;

// Smooth map panning helper for Google Maps
const MapController: React.FC<{ lat: number; lng: number }> = ({ lat, lng }) => {
  const map = useMap();
  useEffect(() => {
    if (map && !isNaN(lat) && !isNaN(lng)) {
      map.panTo({ lat, lng });
    }
  }, [map, lat, lng]);
  return null;
};

export const MapLocationPickerModal: React.FC<MapLocationPickerModalProps> = ({
  isOpen,
  onClose,
  initialLat,
  initialLng,
  initialAddress = '',
  onConfirm
}) => {
  const [lat, setLat] = useState<number>(initialLat && !isNaN(initialLat) ? initialLat : DEFAULT_LAT);
  const [lng, setLng] = useState<number>(initialLng && !isNaN(initialLng) ? initialLng : DEFAULT_LNG);
  const [latInput, setLatInput] = useState<string>(String(initialLat && !isNaN(initialLat) ? initialLat : DEFAULT_LAT));
  const [lngInput, setLngInput] = useState<string>(String(initialLng && !isNaN(initialLng) ? initialLng : DEFAULT_LNG));
  const [address, setAddress] = useState<string>(initialAddress);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isGeocoding, setIsGeocoding] = useState<boolean>(false);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [isConfirming, setIsConfirming] = useState<boolean>(false);

  // Google Maps API key state (reads from env, localStorage or fetches from /api/maps/config on Hostinger)
  const [googleMapsApiKey, setGoogleMapsApiKey] = useState<string>(() => {
    const envKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string) || '';
    if (envKey) return envKey;
    try {
      const saved = localStorage.getItem('ryyco_google_maps_key');
      if (saved) return saved;
    } catch (_) {}
    return '';
  });

  const [mapProvider, setMapProvider] = useState<'google' | 'leaflet'>('google');
  const [showKeyConfigModal, setShowKeyConfigModal] = useState<boolean>(false);
  const [manualKeyInput, setManualKeyInput] = useState<string>('');
  const [keySavedNotice, setKeySavedNotice] = useState<string>('');

  // Track latest geocode request to prevent out-of-order race conditions
  const latestGeocodeIdRef = useRef<number>(0);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Leaflet backup map references
  const leafletContainerRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const leafletMarkerRef = useRef<L.Marker | null>(null);

  // Fetch API key dynamically from Hostinger API bridge or Node server if not baked into client build
  useEffect(() => {
    if (isOpen && !googleMapsApiKey) {
      const loadKeyFromApi = async () => {
        try {
          let res = await fetch('/api/maps/config');
          if (!res.ok) {
            res = await fetch('/api/maps-config.php');
          }
          if (res.ok) {
            const data = await res.json();
            if (data && data.apiKey) {
              setGoogleMapsApiKey(data.apiKey);
              try { localStorage.setItem('ryyco_google_maps_key', data.apiKey); } catch (_) {}
              setMapProvider('google');
              return;
            }
          }
        } catch (err) {
          console.warn("Could not retrieve Google Maps key from API:", err);
        }
        setMapProvider('leaflet');
      };
      loadKeyFromApi();
    }
  }, [isOpen, googleMapsApiKey]);

  // Synchronize initial values when modal opens
  useEffect(() => {
    if (isOpen) {
      const validLat = initialLat && !isNaN(initialLat) ? initialLat : DEFAULT_LAT;
      const validLng = initialLng && !isNaN(initialLng) ? initialLng : DEFAULT_LNG;
      setLat(validLat);
      setLng(validLng);
      setLatInput(String(validLat.toFixed(6)));
      setLngInput(String(validLng.toFixed(6)));
      setAddress(initialAddress || '');
      setSearchQuery('');
      setIsGeocoding(false);
      setIsConfirming(false);
    }
  }, [isOpen, initialLat, initialLng, initialAddress]);

  // Multi-tier reverse geocoding with instant fallbacks
  const fetchReverseGeocode = useCallback(async (latitude: number, longitude: number): Promise<string> => {
    // 1. Try Google Maps Client Geocoder if available in browser
    if (typeof window !== 'undefined' && (window as any).google?.maps?.Geocoder) {
      try {
        const geocoder = new (window as any).google.maps.Geocoder();
        const gPromise = new Promise<string | null>((resolve) => {
          const timeout = setTimeout(() => resolve(null), 1500);
          geocoder.geocode({ location: { lat: latitude, lng: longitude } }, (results: any, status: string) => {
            clearTimeout(timeout);
            if (status === 'OK' && results && results[0]?.formatted_address) {
              resolve(results[0].formatted_address);
            } else {
              resolve(null);
            }
          });
        });
        const gAddress = await gPromise;
        if (gAddress) return gAddress;
      } catch (err) {
        console.warn("Client-side google geocoder failed:", err);
      }
    }

    // 2. Call server-side / Hostinger proxy endpoint (handles Google + Photon + Nominatim)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);
      let res = await fetch(`/api/maps/geocode?lat=${latitude}&lng=${longitude}`, { signal: controller.signal });
      if (!res.ok) {
        res = await fetch(`/api/maps-geocode.php?lat=${latitude}&lng=${longitude}`, { signal: controller.signal });
      }
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        if (data?.formatted_address) {
          return data.formatted_address;
        }
      }
    } catch (err) {
      console.warn("Server reverse geocode failed or timed out:", err);
    }

    // 3. Direct client fallback to Photon
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const pRes = await fetch(`https://photon.komoot.io/reverse?lat=${latitude}&lon=${longitude}`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (pRes.ok) {
        const pData = await pRes.json();
        if (pData?.features && pData.features.length > 0) {
          const p = pData.features[0].properties;
          const street = p.street ? (p.housenumber ? `${p.street} #${p.housenumber}` : p.street) : '';
          const parts = [
            p.name && p.name !== p.street ? p.name : null,
            street || null,
            p.locality || p.district || p.suburb || null,
            p.city || p.county || null,
            p.state || null
          ].filter(Boolean);
          if (parts.length > 0) {
            return parts.join(', ');
          }
        }
      }
    } catch (err) {
      console.warn("Direct Photon fallback failed:", err);
    }

    // 4. Direct client fallback to Nominatim
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const nomRes = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
        { 
          signal: controller.signal,
          headers: { 'Accept-Language': 'es' } 
        }
      );
      clearTimeout(timeoutId);
      if (nomRes.ok) {
        const nomData = await nomRes.json();
        if (nomData?.display_name) {
          return nomData.display_name;
        }
      }
    } catch (err) {
      console.warn("Direct Nominatim fallback failed:", err);
    }

    // 5. Ultimate readable fallback with coordinates
    return `Ubicación GPS (${latitude.toFixed(5)}, ${longitude.toFixed(5)})`;
  }, []);

  // Reverse geocode wrapper with request sequencing
  const reverseGeocode = useCallback(async (latitude: number, longitude: number) => {
    const requestId = ++latestGeocodeIdRef.current;
    setIsGeocoding(true);
    try {
      const formatted = await fetchReverseGeocode(latitude, longitude);
      if (requestId === latestGeocodeIdRef.current && formatted) {
        setAddress(formatted);
      }
    } catch (err) {
      console.warn("Reverse geocode failed:", err);
    } finally {
      if (requestId === latestGeocodeIdRef.current) {
        setIsGeocoding(false);
      }
    }
  }, [fetchReverseGeocode]);

  // Forward geocode address search query
  const handleSearchAddress = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = (searchQuery || address).trim();
    if (!query) return;

    setIsSearching(true);
    try {
      let res = await fetch(`/api/maps/geocode?address=${encodeURIComponent(query)}`);
      if (!res.ok) {
        res = await fetch(`/api/maps-geocode.php?address=${encodeURIComponent(query)}`);
      }
      if (res.ok) {
        const data = await res.json();
        if (data.lat && data.lng) {
          const newLat = Number(data.lat);
          const newLng = Number(data.lng);
          setLat(newLat);
          setLng(newLng);
          setLatInput(String(newLat.toFixed(6)));
          setLngInput(String(newLng.toFixed(6)));
          if (data.formatted_address) {
            setAddress(data.formatted_address);
          } else {
            setAddress(query);
          }
          if (leafletMapRef.current && leafletMarkerRef.current) {
            leafletMapRef.current.setView([newLat, newLng], 16);
            leafletMarkerRef.current.setLatLng([newLat, newLng]);
          }
          return;
        }
      }

      // Nominatim search fallback
      const nomRes = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`,
        { headers: { 'Accept-Language': 'es' } }
      );
      if (nomRes.ok) {
        const nomData = await nomRes.json();
        if (Array.isArray(nomData) && nomData.length > 0) {
          const newLat = parseFloat(nomData[0].lat);
          const newLng = parseFloat(nomData[0].lon);
          setLat(newLat);
          setLng(newLng);
          setLatInput(String(newLat.toFixed(6)));
          setLngInput(String(newLng.toFixed(6)));
          setAddress(nomData[0].display_name);
          if (leafletMapRef.current && leafletMarkerRef.current) {
            leafletMapRef.current.setView([newLat, newLng], 16);
            leafletMarkerRef.current.setLatLng([newLat, newLng]);
          }
        } else {
          // If search service couldn't resolve coords, still retain the text for the user
          setAddress(query);
          alert('No encontramos coordenadas exactas para esa búsqueda, pero guardamos la dirección ingresada.');
        }
      }
    } catch (err) {
      console.warn("Address search error:", err);
      setAddress(query);
    } finally {
      setIsSearching(false);
    }
  };

  // Update position callback
  const handleLocationUpdate = useCallback((newLat: number, newLng: number) => {
    setLat(newLat);
    setLng(newLng);
    setLatInput(String(newLat.toFixed(6)));
    setLngInput(String(newLng.toFixed(6)));
    reverseGeocode(newLat, newLng);

    if (leafletMapRef.current && leafletMarkerRef.current) {
      leafletMapRef.current.setView([newLat, newLng], 16);
      leafletMarkerRef.current.setLatLng([newLat, newLng]);
    }
  }, [reverseGeocode]);

  // Leaflet backup initialization (when mapProvider === 'leaflet' or no Google Maps key)
  const isUsingLeaflet = mapProvider === 'leaflet' || !googleMapsApiKey;

  useEffect(() => {
    if (!isOpen || !isUsingLeaflet || !leafletContainerRef.current) return;

    const timer = setTimeout(() => {
      if (!leafletContainerRef.current) return;

      if (!leafletMapRef.current) {
        const map = L.map(leafletContainerRef.current, {
          center: [lat, lng],
          zoom: 15,
          zoomControl: false
        });

        L.control.zoom({ position: 'topright' }).addTo(map);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© OpenStreetMap'
        }).addTo(map);

        const pinIcon = L.divIcon({
          className: 'custom-map-pin',
          html: `
            <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 36px; height: 36px;">
              <div style="position: absolute; width: 36px; height: 36px; background-color: rgba(230, 57, 70, 0.3); border-radius: 50%; animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
              <div style="width: 32px; height: 32px; background-color: #E63946; border: 3px solid #FFFFFF; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); box-shadow: 0 4px 12px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;">
                <div style="width: 10px; height: 10px; background-color: #FFFFFF; border-radius: 50%; transform: rotate(45deg);"></div>
              </div>
            </div>
          `,
          iconSize: [36, 36],
          iconAnchor: [18, 36]
        });

        const marker = L.marker([lat, lng], {
          icon: pinIcon,
          draggable: true
        }).addTo(map);

        marker.on('dragend', () => {
          const newPos = marker.getLatLng();
          handleLocationUpdate(newPos.lat, newPos.lng);
        });

        map.on('click', (e: L.LeafletMouseEvent) => {
          marker.setLatLng(e.latlng);
          handleLocationUpdate(e.latlng.lat, e.latlng.lng);
        });

        leafletMapRef.current = map;
        leafletMarkerRef.current = marker;
      } else {
        leafletMapRef.current.invalidateSize();
        leafletMapRef.current.setView([lat, lng], 15);
        if (leafletMarkerRef.current) {
          leafletMarkerRef.current.setLatLng([lat, lng]);
        }
      }
    }, 150);

    return () => {
      clearTimeout(timer);
    };
  }, [isOpen, isUsingLeaflet, lat, lng, handleLocationUpdate]);

  // Clean up Leaflet on modal close
  useEffect(() => {
    if (!isOpen && leafletMapRef.current) {
      leafletMapRef.current.remove();
      leafletMapRef.current = null;
      leafletMarkerRef.current = null;
    }
  }, [isOpen]);

  // GPS Device Geolocation
  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert("Tu navegador no soporta geolocalización.");
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLocating(false);
        const { latitude, longitude } = position.coords;
        handleLocationUpdate(latitude, longitude);
      },
      () => {
        setIsLocating(false);
        alert("No se pudo obtener tu ubicación actual. Permite el acceso a la ubicación e intenta nuevamente.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Manual Coordinates application
  const handleApplyCustomCoords = (latStr: string, lngStr: string) => {
    const pLat = parseFloat(latStr);
    const pLng = parseFloat(lngStr);
    if (!isNaN(pLat) && !isNaN(pLng)) {
      handleLocationUpdate(pLat, pLng);
    }
  };

  // Final Confirmation with guaranteed address resolution
  const handleConfirm = async () => {
    setIsConfirming(true);
    let finalAddress = (address || '').trim();

    try {
      // If address is currently empty or geocoding was still resolving in the background
      if (!finalAddress || isGeocoding) {
        const resolved = await fetchReverseGeocode(lat, lng);
        if (resolved && resolved.trim()) {
          finalAddress = resolved.trim();
          setAddress(finalAddress);
        }
      }
    } catch (err) {
      console.warn("Could not finish reverse geocode on confirm:", err);
    } finally {
      setIsConfirming(false);
    }

    // Safety fallback if still empty
    if (!finalAddress) {
      if (searchQuery.trim()) {
        finalAddress = searchQuery.trim();
      } else {
        finalAddress = `Ubicación GPS (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
      }
    }

    const mapUrl = `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
    onConfirm({
      address: finalAddress,
      lat,
      lng,
      mapUrl
    });
    onClose();
  };

  // Save manual API key
  const handleSaveManualKey = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanKey = manualKeyInput.trim();
    if (!cleanKey) return;
    setGoogleMapsApiKey(cleanKey);
    try {
      localStorage.setItem('ryyco_google_maps_key', cleanKey);
    } catch (_) {}
    setMapProvider('google');
    setKeySavedNotice('¡Clave guardada con éxito! Activando Google Maps...');
    setTimeout(() => {
      setKeySavedNotice('');
      setShowKeyConfigModal(false);
    }, 1200);
  };

  if (!isOpen) return null;

  const googleMapsWebUrl = `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lng.toFixed(6)}`;
  const googleDirectionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(6)},${lng.toFixed(6)}`;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="bg-gray-950 border border-gray-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between bg-gray-900/70 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-[#E63946] to-[#F4B400] flex items-center justify-center text-white shadow-md shadow-[#E63946]/20 shrink-0">
              <MapPin className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black text-white uppercase tracking-wider">
                Ubicación en Google Maps
              </h3>
              <p className="text-[11px] text-gray-400">
                Arrastra el marcador rojo o toca en el mapa para fijar tu dirección
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white flex items-center justify-center transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
          
          {/* Notice when on Hostinger without Google Maps API Key */}
          {!googleMapsApiKey && (
            <div className="p-3 bg-blue-950/40 border border-blue-800/60 rounded-2xl flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-blue-200">
                <HelpCircle className="w-4 h-4 text-blue-400 shrink-0" />
                <span className="text-[11px]">
                  Mapa activo con OpenStreetMap. Para usar Google Maps oficial en Hostinger, configura tu clave en <code className="bg-blue-900/60 px-1.5 py-0.5 rounded text-blue-300 font-mono text-[10px]">api/keys.php</code>.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowKeyConfigModal(true)}
                className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-[10px] font-bold shrink-0 transition"
              >
                Configurar Clave
              </button>
            </div>
          )}

          {/* Search Bar on Google Maps */}
          <form onSubmit={handleSearchAddress} className="flex gap-2">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar calle, barrio o lugar en Google Maps (ej: Carrera 6 # 14-25, Ipiales)..."
                className="w-full h-11 bg-gray-900 border border-gray-800 focus:border-[#E63946] pl-10 pr-4 rounded-xl text-xs font-semibold outline-none text-white focus:ring-2 focus:ring-[#E63946]/20 transition"
              />
            </div>
            <button
              type="submit"
              disabled={isSearching}
              className="h-11 px-4 bg-[#E63946] hover:bg-[#D62839] text-white rounded-xl text-xs font-black flex items-center gap-1.5 transition active:scale-95 shrink-0 cursor-pointer disabled:opacity-50"
            >
              {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Compass className="w-4 h-4" />}
              <span className="hidden sm:inline">Buscar</span>
            </button>
          </form>

          {/* Action Row: GPS & Direct Google Maps Links */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleUseCurrentLocation}
              disabled={isLocating}
              className="h-9 px-3.5 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 rounded-xl text-xs font-bold flex items-center gap-2 transition active:scale-95 cursor-pointer"
            >
              {isLocating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
                  <span>Obteniendo GPS...</span>
                </>
              ) : (
                <>
                  <Navigation className="w-3.5 h-3.5 text-blue-400" />
                  <span>Mi Ubicación Actual (GPS)</span>
                </>
              )}
            </button>

            <div className="flex items-center gap-2">
              <a
                href={googleMapsWebUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="h-9 px-3 bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/40 text-emerald-400 rounded-xl text-xs font-bold flex items-center gap-1.5 transition"
                title="Abrir este punto directamente en la app o web de Google Maps"
              >
                <Globe className="w-3.5 h-3.5" />
                <span>Abrir en Google Maps</span>
                <ExternalLink className="w-3 h-3 ml-0.5 opacity-70" />
              </a>

              <a
                href={googleDirectionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="h-9 px-3 bg-amber-600/15 hover:bg-amber-600/25 border border-amber-500/40 text-amber-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition hidden sm:flex"
                title="Cómo llegar con Google Maps Domicilios"
              >
                <Compass className="w-3.5 h-3.5" />
                <span>Ruta / Cómo llegar</span>
              </a>
            </div>
          </div>

          {/* Interactive Map View */}
          <div className="relative rounded-2xl border border-gray-800 overflow-hidden bg-gray-900 h-[340px] shadow-inner">
            
            {mapProvider === 'google' && googleMapsApiKey ? (
              <APIProvider apiKey={googleMapsApiKey} libraries={['marker', 'places']}>
                <Map
                  mapId="DEMO_MAP_ID"
                  defaultCenter={{ lat, lng }}
                  center={{ lat, lng }}
                  defaultZoom={15}
                  gestureHandling="greedy"
                  disableDefaultUI={false}
                  internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                  style={{ width: '100%', height: '100%' }}
                  onClick={(e) => {
                    if (e.detail?.latLng) {
                      const clickedLat = typeof e.detail.latLng.lat === 'function' ? e.detail.latLng.lat() : Number(e.detail.latLng.lat);
                      const clickedLng = typeof e.detail.latLng.lng === 'function' ? e.detail.latLng.lng() : Number(e.detail.latLng.lng);
                      if (!isNaN(clickedLat) && !isNaN(clickedLng)) {
                        handleLocationUpdate(clickedLat, clickedLng);
                      }
                    }
                  }}
                >
                  <MapController lat={lat} lng={lng} />
                  <AdvancedMarker
                    position={{ lat, lng }}
                    draggable={true}
                    onDragEnd={(e) => {
                      if (e.latLng) {
                        const newLat = typeof e.latLng.lat === 'function' ? e.latLng.lat() : Number((e.latLng as any).lat);
                        const newLng = typeof e.latLng.lng === 'function' ? e.latLng.lng() : Number((e.latLng as any).lng);
                        if (!isNaN(newLat) && !isNaN(newLng)) {
                          handleLocationUpdate(newLat, newLng);
                        }
                      }
                    }}
                    title="Ubicación de tu Negocio / Restaurante"
                  >
                    <Pin
                      background="#E63946"
                      borderColor="#FFFFFF"
                      glyphColor="#FFFFFF"
                      scale={1.25}
                    />
                  </AdvancedMarker>
                </Map>
              </APIProvider>
            ) : (
              <div ref={leafletContainerRef} className="w-full h-full z-10" />
            )}

            {/* Instruction Overlay Badge */}
            <div className="absolute top-3 left-3 z-[400] bg-gray-950/90 border border-gray-800/90 px-3 py-1.5 rounded-xl text-[10px] font-bold text-gray-200 backdrop-blur-md shadow-lg flex items-center gap-1.5 pointer-events-none">
              <MapPin className="w-3.5 h-3.5 text-[#E63946]" />
              <span>Arrastra el puntero o toca el mapa para reubicar</span>
            </div>

            {/* Geocoding indicator */}
            {isGeocoding && (
              <div className="absolute bottom-3 left-3 z-[400] bg-emerald-950/90 border border-emerald-800/80 px-3 py-1 rounded-xl text-[10px] font-bold text-emerald-300 backdrop-blur-md shadow-lg flex items-center gap-1.5 animate-pulse pointer-events-none">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Identificando dirección en el mapa...</span>
              </div>
            )}
          </div>

          {/* Editable Detected Address */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase text-gray-300 tracking-wider flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                <span>Dirección Detectada / Punto de Entrega y Recogida</span>
              </span>
              <span className="text-[9px] text-gray-500 font-normal">Editable</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={isGeocoding ? "Detectando dirección en el mapa..." : "Ej: Carrera 6 # 14-25, Centro, Ipiales"}
                className={`w-full h-11 bg-gray-900 border ${
                  isGeocoding ? 'border-emerald-500/60 ring-2 ring-emerald-500/10' : 'border-gray-800 focus:border-emerald-500'
                } pl-3.5 pr-10 rounded-xl text-xs font-bold outline-none text-white focus:ring-2 focus:ring-emerald-500/20 transition`}
              />
              {isGeocoding && (
                <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center pointer-events-none">
                  <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
                </div>
              )}
            </div>
            {isGeocoding && (
              <p className="text-[10px] text-emerald-400 font-medium flex items-center gap-1 animate-pulse">
                <Loader2 className="w-3 h-3 animate-spin inline" />
                <span>Actualizando dirección con la nueva ubicación del mapa...</span>
              </p>
            )}
          </div>

          {/* Exact GPS Coordinates Inputs */}
          <div className="p-3 bg-gray-900/60 border border-gray-800/80 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-blue-400" />
                Coordenadas GPS de Precisión
              </span>
              <span className="text-[9px] text-gray-500 font-mono">Ipiales: 0.83028, -77.64444</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[9px] text-gray-500 block mb-0.5">Latitud</label>
                <input
                  type="text"
                  value={latInput}
                  onChange={(e) => {
                    setLatInput(e.target.value);
                    handleApplyCustomCoords(e.target.value, lngInput);
                  }}
                  placeholder="0.83028"
                  className="w-full h-9 bg-gray-950 border border-gray-800 focus:border-blue-500 px-2.5 rounded-lg text-xs font-mono text-blue-300 outline-none"
                />
              </div>
              <div>
                <label className="text-[9px] text-gray-500 block mb-0.5">Longitud</label>
                <input
                  type="text"
                  value={lngInput}
                  onChange={(e) => {
                    setLngInput(e.target.value);
                    handleApplyCustomCoords(latInput, e.target.value);
                  }}
                  placeholder="-77.64444"
                  className="w-full h-9 bg-gray-950 border border-gray-800 focus:border-blue-500 px-2.5 rounded-lg text-xs font-mono text-blue-300 outline-none"
                />
              </div>
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="px-5 py-4 border-t border-gray-800 bg-gray-900/70 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 h-11 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold transition cursor-pointer"
          >
            Cancelar
          </button>
          
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isConfirming}
            className="px-6 h-11 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-gray-950 text-xs font-black flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition active:scale-[0.98] cursor-pointer disabled:opacity-50"
          >
            {isConfirming ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin stroke-[3]" />
                <span>Confirmando...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4 stroke-[3]" />
                <span>Confirmar Ubicación</span>
              </>
            )}
          </button>
        </div>

      </div>

      {/* Hostinger Google Maps Configuration Helper Modal */}
      {showKeyConfigModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fade-in">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-amber-400" />
                <h4 className="text-sm font-black text-white uppercase tracking-wider">
                  Configuración de API para Hostinger
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setShowKeyConfigModal(false)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-gray-300">
              <p>
                Para que el mapa interactivo de <strong className="text-white">Google Maps</strong> funcione en tu dominio de Hostinger, tienes 2 opciones sencillas:
              </p>

              <div className="bg-gray-950 border border-gray-800 rounded-xl p-3 space-y-2 font-mono text-[11px]">
                <div className="text-amber-400 font-bold">Opción 1 (Recomendada en Hostinger):</div>
                <p className="text-gray-400 font-sans">
                  Entra a tu Administrador de Archivos de Hostinger en <code className="text-white bg-gray-900 px-1 py-0.5 rounded">public_html/api/</code> y edita o crea el archivo <code className="text-emerald-400">keys.php</code>:
                </p>
                <pre className="bg-gray-900 p-2 rounded text-emerald-300 text-[10px] overflow-x-auto">
{`<?php
define('RYYCO_HOSTINGER_GOOGLE_MAPS_KEY', 'TU_API_KEY_DE_GOOGLE');`}
                </pre>
              </div>

              <div className="bg-gray-950 border border-gray-800 rounded-xl p-3 space-y-2">
                <div className="text-amber-400 font-bold">Opción 2 (Pruébala ahora mismo):</div>
                <p className="text-gray-400">
                  Pega aquí tu API Key de Google Maps para activarla de inmediato en este navegador:
                </p>
                <form onSubmit={handleSaveManualKey} className="flex gap-2">
                  <input
                    type="text"
                    value={manualKeyInput}
                    onChange={(e) => setManualKeyInput(e.target.value)}
                    placeholder="AIzaSy..."
                    className="flex-1 h-9 bg-gray-900 border border-gray-700 rounded-lg px-3 text-xs font-mono text-white outline-none focus:border-amber-400"
                  />
                  <button
                    type="submit"
                    className="h-9 px-3 bg-amber-500 hover:bg-amber-400 text-gray-950 font-bold rounded-lg text-xs transition"
                  >
                    Guardar
                  </button>
                </form>
                {keySavedNotice && (
                  <p className="text-emerald-400 text-[11px] font-bold">{keySavedNotice}</p>
                )}
              </div>

              <div className="p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-800/40 text-emerald-300 text-[11px]">
                ✓ <strong>Nota:</strong> Si no tienes una clave de Google Maps, el sistema utiliza <strong>OpenStreetMap</strong> automáticamente, el cual funciona al 100% en Hostinger sin costo ni clave.
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowKeyConfigModal(false)}
                className="px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-white text-xs font-bold"
              >
                Entendido / Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};


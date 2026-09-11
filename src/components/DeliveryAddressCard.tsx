import React, { useState, useEffect, useRef, useCallback } from 'react';
import { APIProvider, Map, AdvancedMarker, Pin, useMap } from '@vis.gl/react-google-maps';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { 
  MapPin, 
  Navigation, 
  CheckCircle2, 
  ExternalLink, 
  Plus, 
  Minus, 
  Maximize2, 
  Loader2,
  Map as MapIcon
} from 'lucide-react';

interface DeliveryAddressCardProps {
  address: string;
  onChangeAddress: (value: string) => void;
  coordinates?: { lat: number; lng: number; mapUrl?: string } | null;
  onCoordinatesChange?: (coords: { lat: number; lng: number; mapUrl: string; address?: string }) => void;
  onOpenMapPicker: () => void;
  required?: boolean;
}

// Default center: Ipiales, Nariño, Colombia
const DEFAULT_LAT = 0.83028;
const DEFAULT_LNG = -77.64444;

// Smooth map panning helper for Google Maps inside the card
const CardMapController: React.FC<{ lat: number; lng: number }> = ({ lat, lng }) => {
  const map = useMap();
  useEffect(() => {
    if (map && !isNaN(lat) && !isNaN(lng)) {
      map.panTo({ lat, lng });
    }
  }, [map, lat, lng]);
  return null;
};

// Touch-friendly, high-contrast zoom controls (+ and -) for mobile and desktop
const CardMapZoomControls: React.FC = () => {
  const map = useMap();

  const handleZoomIn = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (map) {
      const zoom = map.getZoom() ?? 15;
      map.setZoom(zoom + 1);
    }
  };

  const handleZoomOut = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (map) {
      const zoom = map.getZoom() ?? 15;
      map.setZoom(Math.max(1, zoom - 1));
    }
  };

  return (
    <div className="absolute right-3 bottom-3 z-30 flex flex-col bg-gray-950/95 border border-white/20 rounded-xl overflow-hidden shadow-2xl backdrop-blur-md">
      <button
        type="button"
        onClick={handleZoomIn}
        onTouchEnd={handleZoomIn}
        className="w-11 h-11 flex items-center justify-center text-white hover:bg-gray-800 active:bg-gray-700 border-b border-white/10 transition cursor-pointer select-none"
        title="Acercar mapa (Zoom in / Sum)"
        aria-label="Acercar mapa"
      >
        <Plus className="w-5 h-5 stroke-[2.5]" />
      </button>
      <button
        type="button"
        onClick={handleZoomOut}
        onTouchEnd={handleZoomOut}
        className="w-11 h-11 flex items-center justify-center text-white hover:bg-gray-800 active:bg-gray-700 transition cursor-pointer select-none"
        title="Alejar mapa (Zoom out)"
        aria-label="Alejar mapa"
      >
        <Minus className="w-5 h-5 stroke-[2.5]" />
      </button>
    </div>
  );
};

export const DeliveryAddressCard: React.FC<DeliveryAddressCardProps> = ({
  address,
  onChangeAddress,
  coordinates,
  onCoordinatesChange,
  onOpenMapPicker,
  required = true,
}) => {
  const currentLat = coordinates?.lat && !isNaN(coordinates.lat) ? coordinates.lat : DEFAULT_LAT;
  const currentLng = coordinates?.lng && !isNaN(coordinates.lng) ? coordinates.lng : DEFAULT_LNG;

  const [lat, setLat] = useState<number>(currentLat);
  const [lng, setLng] = useState<number>(currentLng);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [isGeocoding, setIsGeocoding] = useState<boolean>(false);

  // Synchronize local lat/lng when coordinates prop changes
  useEffect(() => {
    if (coordinates?.lat && !isNaN(coordinates.lat) && coordinates?.lng && !isNaN(coordinates.lng)) {
      setLat(coordinates.lat);
      setLng(coordinates.lng);
    }
  }, [coordinates?.lat, coordinates?.lng]);

  // Google Maps API key state
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

  // Leaflet backup map references
  const leafletContainerRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const leafletMarkerRef = useRef<L.Marker | null>(null);

  // Fetch API key dynamically from server if not baked into client build
  useEffect(() => {
    if (!googleMapsApiKey) {
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
  }, [googleMapsApiKey]);

  // Reverse geocoding helper
  const reverseGeocode = useCallback(async (latitude: number, longitude: number) => {
    setIsGeocoding(true);
    try {
      // 1. Google Maps Geocoder if loaded
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
          if (gAddress) {
            onChangeAddress(gAddress);
            if (onCoordinatesChange) {
              onCoordinatesChange({
                lat: latitude,
                lng: longitude,
                mapUrl: `https://www.google.com/maps?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`,
                address: gAddress
              });
            }
            return;
          }
        } catch (_) {}
      }

      // 2. Server proxy
      try {
        const res = await fetch(`/api/maps/geocode?lat=${latitude}&lng=${longitude}`);
        if (res.ok) {
          const data = await res.json();
          if (data?.formatted_address) {
            onChangeAddress(data.formatted_address);
            if (onCoordinatesChange) {
              onCoordinatesChange({
                lat: latitude,
                lng: longitude,
                mapUrl: `https://www.google.com/maps?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`,
                address: data.formatted_address
              });
            }
            return;
          }
        }
      } catch (_) {}

      // Fallback: Notify coordinates
      if (onCoordinatesChange) {
        onCoordinatesChange({
          lat: latitude,
          lng: longitude,
          mapUrl: `https://www.google.com/maps?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`,
          address: address || `Ubicación GPS (${latitude.toFixed(5)}, ${longitude.toFixed(5)})`
        });
      }
    } finally {
      setIsGeocoding(false);
    }
  }, [onChangeAddress, onCoordinatesChange, address]);

  // Handle location update from map drag or click
  const handleLocationUpdate = useCallback((newLat: number, newLng: number) => {
    setLat(newLat);
    setLng(newLng);
    reverseGeocode(newLat, newLng);

    if (leafletMapRef.current && leafletMarkerRef.current) {
      leafletMapRef.current.setView([newLat, newLng], 16);
      leafletMarkerRef.current.setLatLng([newLat, newLng]);
    }
  }, [reverseGeocode]);

  // GPS Device Geolocation
  const handleUseCurrentLocation = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
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

  // Leaflet fallback setup
  const isUsingLeaflet = mapProvider === 'leaflet' || !googleMapsApiKey;

  useEffect(() => {
    if (!isUsingLeaflet || !leafletContainerRef.current) return;

    const timer = setTimeout(() => {
      if (!leafletContainerRef.current) return;

      if (!leafletMapRef.current) {
        const map = L.map(leafletContainerRef.current, {
          center: [lat, lng],
          zoom: 15,
          zoomControl: false
        });

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
  }, [isUsingLeaflet, lat, lng, handleLocationUpdate]);

  return (
    <div className="w-full rounded-2xl bg-[#090E17] border border-[#1A2333] p-3.5 sm:p-5 shadow-2xl transition-all">
      
      {/* 1. Header: Title & Google Maps Badge */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center shrink-0 shadow-sm shadow-red-500/10">
            <MapPin className="w-4 h-4 text-[#E63946] fill-[#E63946]" />
          </div>
          <span className="text-xs sm:text-sm font-extrabold uppercase tracking-wide text-white">
            Ubicación en Google Maps {required && <span className="text-[#E63946]">*</span>}
          </span>
        </div>

        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-blue-500/40 bg-blue-950/40 text-white shadow-sm shrink-0">
          <MapIcon className="w-3.5 h-3.5 text-[#E63946]" />
          <span className="text-[11px] sm:text-xs font-bold text-gray-100">Google Maps</span>
        </div>
      </div>

      {/* 2. Main Input Row: Address Input + GPS Button */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-2.5 w-full mb-3">
        {/* Address Input Box */}
        <div className="flex-1 min-w-0 h-12 bg-white rounded-2xl px-3.5 sm:px-4 flex items-center gap-2.5 shadow-inner border border-gray-200 focus-within:ring-2 focus-within:ring-[#E63946]/30 transition-all">
          <MapPin className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 shrink-0" />
          <input
            type="text"
            required={required}
            value={address}
            onChange={(e) => onChangeAddress(e.target.value)}
            placeholder="Ej: Carrera 6 # 14-25, Ipiales..."
            className="w-full bg-transparent text-gray-900 placeholder:text-gray-400 font-semibold text-xs sm:text-sm outline-none"
          />
          {isGeocoding && <Loader2 className="w-4 h-4 text-emerald-600 animate-spin shrink-0" />}
        </div>

        {/* Action Buttons: GPS + Ampliar */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleUseCurrentLocation}
            disabled={isLocating}
            className="h-12 px-3.5 sm:px-4 rounded-2xl bg-blue-600/20 hover:bg-blue-600/30 active:scale-95 border border-blue-500/40 text-blue-300 font-bold text-xs sm:text-sm flex items-center gap-1.5 transition cursor-pointer shrink-0"
            title="Usar mi ubicación GPS actual"
          >
            {isLocating ? (
              <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
            ) : (
              <Navigation className="w-4 h-4 text-blue-400" />
            )}
            <span>GPS</span>
          </button>

          <button
            type="button"
            onClick={onOpenMapPicker}
            className="h-12 px-3.5 sm:px-4 rounded-2xl border border-white/20 bg-[#0E1524] hover:bg-[#162036] active:scale-95 text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 transition cursor-pointer shrink-0"
            title="Abrir mapa en pantalla completa"
          >
            <Maximize2 className="w-4 h-4 text-[#E63946]" />
            <span className="hidden sm:inline">Ampliar</span>
          </button>
        </div>
      </div>

      {/* 3. REAL Interactive Google Map with Working Mobile Zoom Buttons */}
      <div className="relative w-full h-48 sm:h-56 rounded-2xl overflow-hidden border border-[#1E283D] bg-gray-900 shadow-inner">
        {mapProvider === 'google' && googleMapsApiKey ? (
          <APIProvider apiKey={googleMapsApiKey} libraries={['marker', 'places']}>
            <Map
              mapId="ORDER_FORM_MAP_ID"
              defaultCenter={{ lat, lng }}
              center={{ lat, lng }}
              defaultZoom={15}
              gestureHandling="greedy"
              zoomControl={true}
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
              <CardMapController lat={lat} lng={lng} />
              
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
                title="Punto de entrega de tu pedido"
              >
                <Pin
                  background="#E63946"
                  borderColor="#FFFFFF"
                  glyphColor="#FFFFFF"
                  scale={1.2}
                />
              </AdvancedMarker>

              {/* Working Mobile & Desktop Zoom In / Zoom Out Controls */}
              <CardMapZoomControls />
            </Map>
          </APIProvider>
        ) : (
          <div className="relative w-full h-full">
            <div ref={leafletContainerRef} className="w-full h-full z-10" />
            <div className="absolute right-3 bottom-3 z-30 flex flex-col bg-gray-950/95 border border-white/20 rounded-xl overflow-hidden shadow-2xl backdrop-blur-md">
              <button
                type="button"
                onClick={() => leafletMapRef.current?.zoomIn()}
                onTouchEnd={(e) => { e.preventDefault(); leafletMapRef.current?.zoomIn(); }}
                className="w-11 h-11 flex items-center justify-center text-white hover:bg-gray-800 active:bg-gray-700 border-b border-white/10 transition cursor-pointer select-none"
                title="Acercar mapa (Zoom in / Sum)"
                aria-label="Acercar mapa"
              >
                <Plus className="w-5 h-5 stroke-[2.5]" />
              </button>
              <button
                type="button"
                onClick={() => leafletMapRef.current?.zoomOut()}
                onTouchEnd={(e) => { e.preventDefault(); leafletMapRef.current?.zoomOut(); }}
                className="w-11 h-11 flex items-center justify-center text-white hover:bg-gray-800 active:bg-gray-700 transition cursor-pointer select-none"
                title="Alejar mapa (Zoom out)"
                aria-label="Alejar mapa"
              >
                <Minus className="w-5 h-5 stroke-[2.5]" />
              </button>
            </div>
          </div>
        )}

        {/* Top Floating Helper Badge */}
        <div className="absolute top-2.5 left-2.5 z-20 bg-gray-950/90 border border-gray-800 px-2.5 py-1 rounded-lg text-[10px] font-bold text-gray-200 backdrop-blur-md shadow-lg flex items-center gap-1.5 pointer-events-none">
          <MapPin className="w-3 h-3 text-[#E63946]" />
          <span>Mueve el marcador o toca el mapa</span>
        </div>

        {/* Top Right Expand Button */}
        <button
          type="button"
          onClick={onOpenMapPicker}
          className="absolute top-2.5 right-2.5 z-20 bg-gray-950/90 hover:bg-gray-800 border border-white/20 px-2.5 py-1 rounded-lg text-[10px] font-bold text-white backdrop-blur-md shadow-lg flex items-center gap-1 transition cursor-pointer active:scale-95"
          title="Ver mapa en pantalla completa"
        >
          <Maximize2 className="w-3 h-3 text-[#E63946]" />
          <span>Pantalla completa</span>
        </button>
      </div>

      {/* 4. Bottom Green Status Banner */}
      <div className="w-full rounded-xl bg-[#081F14] border border-emerald-500/30 px-3 py-2 flex items-center justify-between gap-2 mt-2.5 shadow-inner">
        <div className="flex items-center gap-2 min-w-0">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 fill-emerald-500/20" />
          <span className="text-[11px] text-emerald-300 font-medium truncate">
            {coordinates
              ? `Ubicación fijada (${coordinates.lat.toFixed(5)}, ${coordinates.lng.toFixed(5)})`
              : 'Ubicación fijada en Google Maps'}
          </span>
        </div>

        <a
          href={`https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-emerald-400 hover:text-emerald-300 hover:underline font-bold text-[11px] flex items-center gap-1 shrink-0 ml-1"
        >
          <ExternalLink className="w-3 h-3" />
          <span className="hidden sm:inline">Ver en Maps</span>
        </a>
      </div>

    </div>
  );
};

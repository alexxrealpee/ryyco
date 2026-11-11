/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  MapPin,
  Navigation,
  Compass,
  Check,
  Search,
  Building2,
  Loader2,
  Sparkles,
} from 'lucide-react';

export interface LocationChangeData {
  lat: number;
  lng: number;
  address?: string;
  city?: string;
}

interface WarehouseLocationPickerMapProps {
  lat: number;
  lng: number;
  address?: string;
  city?: string;
  tradeName?: string;
  onChange: (data: LocationChangeData) => void;
  className?: string;
}

// Zonas comerciales y bodegas de referencia en Nariño (Ipiales, Pasto y frontera)
const PRESET_ZONES = [
  { name: 'Zona Industrial Ipiales', lat: 0.835, lng: -77.64, address: 'Zona Industrial, Lote 12, Ipiales', city: 'Ipiales' },
  { name: 'Centro / Plaza Mayorista', lat: 0.8285, lng: -77.6445, address: 'Carrera 6 #14-20, Centro, Ipiales', city: 'Ipiales' },
  { name: 'Vía Panamericana Sur', lat: 0.821, lng: -77.652, address: 'Km 2 Vía Panamericana Sur, Ipiales', city: 'Ipiales' },
  { name: 'Frontera Rumichaca', lat: 0.813, lng: -77.662, address: 'Paso Fronterizo Rumichaca, Bodegas Ipiales', city: 'Ipiales' },
  { name: 'Parque Industrial Pasto', lat: 1.2136, lng: -77.2811, address: 'Av. Panamericana Norte, Parque Industrial, Pasto', city: 'Pasto' },
];

export const WarehouseLocationPickerMap: React.FC<WarehouseLocationPickerMapProps> = ({
  lat,
  lng,
  address,
  city,
  tradeName = 'Bodega del Proveedor',
  onChange,
  className = '',
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  // Fallback si no tiene coordenadas iniciales: Ipiales Centro (0.8305, -77.6462)
  const initialLat = Number(lat) && !isNaN(lat) && lat !== 0 ? Number(lat) : 0.8305;
  const initialLng = Number(lng) && !isNaN(lng) && lng !== 0 ? Number(lng) : -77.6462;

  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lng: number }>({
    lat: initialLat,
    lng: initialLng,
  });
  const [detectedAddress, setDetectedAddress] = useState<string>(address || '');
  const [detectedCity, setDetectedCity] = useState<string>(city || 'Ipiales');
  const [isLocating, setIsLocating] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Crear icono personalizado RYYCO nítido
  const createPinIcon = () => {
    return L.divIcon({
      className: 'ryyco-map-pin',
      html: `
        <div style="position: relative; transform: translate(-50%, -100%);">
          <div style="
            width: 38px;
            height: 38px;
            background: #E52243;
            border: 3px solid #FFFFFF;
            border-radius: 50% 50% 50% 0;
            transform: rotate(-45deg);
            box-shadow: 0 4px 14px rgba(229, 34, 67, 0.45);
            display: flex;
            align-items: center;
            justify-content: center;
          ">
            <div style="
              transform: rotate(45deg);
              color: white;
              font-weight: 900;
              font-size: 11px;
              font-family: sans-serif;
            ">📦</div>
          </div>
          <div style="
            width: 14px;
            height: 4px;
            background: rgba(0,0,0,0.25);
            border-radius: 50%;
            margin: -2px auto 0;
            filter: blur(1px);
          "></div>
        </div>
      `,
      iconSize: [38, 38],
      iconAnchor: [19, 38],
      popupAnchor: [0, -38],
    });
  };

  // Función de geocodificación inversa (coordenadas -> dirección + ciudad)
  const resolveLocationFromCoords = useCallback(
    async (targetLat: number, targetLng: number) => {
      setIsGeocoding(true);
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4500);

        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${targetLat}&lon=${targetLng}&zoom=18&addressdetails=1`,
          {
            signal: controller.signal,
            headers: {
              'Accept-Language': 'es',
            },
          }
        );
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          if (data && data.address) {
            const addr = data.address;

            // Extraer municipio / ciudad con alta precisión
            const resolvedCity =
              addr.town ||
              addr.city ||
              addr.municipality ||
              addr.village ||
              addr.county ||
              'Ipiales';

            // Extraer calle, número y barrio
            const road =
              addr.road ||
              addr.pedestrian ||
              addr.street ||
              addr.neighbourhood ||
              addr.suburb ||
              '';
            const number = addr.house_number || '';
            const neighborhood = addr.neighbourhood || addr.suburb || addr.quarter || '';

            let formattedAddress = '';
            if (road) {
              formattedAddress = number ? `${road} #${number}` : road;
              if (neighborhood && neighborhood !== road) {
                formattedAddress += `, ${neighborhood}`;
              }
              formattedAddress += `, ${resolvedCity}`;
            } else if (data.display_name) {
              formattedAddress = data.display_name
                .split(',')
                .slice(0, 3)
                .map((s: string) => s.trim())
                .join(', ');
            } else {
              formattedAddress = `Sector Bodegas, ${resolvedCity}`;
            }

            setDetectedAddress(formattedAddress);
            setDetectedCity(resolvedCity);
            onChange({
              lat: targetLat,
              lng: targetLng,
              address: formattedAddress,
              city: resolvedCity,
            });
            return;
          }
        }
      } catch (err) {
        console.warn('Geocodificación inversa no completada:', err);
      } finally {
        setIsGeocoding(false);
      }

      // Si no fue posible contactar a Nominatim, emitir coordenadas
      onChange({ lat: targetLat, lng: targetLng });
    },
    [onChange]
  );

  // Inicializar mapa de Leaflet
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(mapContainerRef.current, {
      center: [initialLat, initialLng],
      zoom: 15,
      zoomControl: true,
      scrollWheelZoom: 'center',
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    const marker = L.marker([initialLat, initialLng], {
      icon: createPinIcon(),
      draggable: true,
      title: 'Arrastra el pin para fijar tu bodega o despacho',
    }).addTo(map);

    marker.bindPopup(`
      <div style="font-family: system-ui, sans-serif; font-size: 12px; line-height: 1.4; padding: 2px;">
        <strong style="color: #111827; display: block; margin-bottom: 2px;">${tradeName}</strong>
        <span style="color: #6B7280;">Punto de despacho / Bodega</span>
      </div>
    `);

    // Evento al arrastrar el marcador
    marker.on('dragend', () => {
      const position = marker.getLatLng();
      const updated = {
        lat: Number(position.lat.toFixed(6)),
        lng: Number(position.lng.toFixed(6)),
      };
      setCurrentCoords(updated);
      resolveLocationFromCoords(updated.lat, updated.lng);
    });

    // Evento al hacer clic en el mapa
    map.on('click', (e: L.LeafletMouseEvent) => {
      const { lat: clickLat, lng: clickLng } = e.latlng;
      const updated = {
        lat: Number(clickLat.toFixed(6)),
        lng: Number(clickLng.toFixed(6)),
      };
      marker.setLatLng([clickLat, clickLng]);
      setCurrentCoords(updated);
      map.panTo([clickLat, clickLng], { animate: true });
      resolveLocationFromCoords(updated.lat, updated.lng);
    });

    mapInstanceRef.current = map;
    markerRef.current = marker;

    setTimeout(() => {
      map.invalidateSize();
    }, 250);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Actualizar marcador si cambian las coordenadas externamente
  useEffect(() => {
    if (mapInstanceRef.current && markerRef.current) {
      if (lat && lng && (lat !== currentCoords.lat || lng !== currentCoords.lng)) {
        markerRef.current.setLatLng([lat, lng]);
        mapInstanceRef.current.panTo([lat, lng], { animate: true });
        setCurrentCoords({ lat, lng });
      }
    }
  }, [lat, lng]);

  // Selección de zona preestablecida
  const handleSelectPreset = (zone: (typeof PRESET_ZONES)[0]) => {
    if (mapInstanceRef.current && markerRef.current) {
      markerRef.current.setLatLng([zone.lat, zone.lng]);
      mapInstanceRef.current.flyTo([zone.lat, zone.lng], 16, { animate: true, duration: 1 });
      setCurrentCoords({ lat: zone.lat, lng: zone.lng });
      setDetectedAddress(zone.address);
      setDetectedCity(zone.city);
      onChange({
        lat: zone.lat,
        lng: zone.lng,
        address: zone.address,
        city: zone.city,
      });
    }
  };

  // Búsqueda textual de dirección o barrio
  const handleSearchAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setSearchError(null);

    try {
      const cleanQ = searchQuery.toLowerCase().includes('nariño') || searchQuery.toLowerCase().includes('colombia')
        ? searchQuery
        : `${searchQuery}, Nariño, Colombia`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          cleanQ
        )}&limit=1&addressdetails=1`,
        {
          signal: controller.signal,
          headers: { 'Accept-Language': 'es' },
        }
      );
      clearTimeout(timeoutId);

      if (res.ok) {
        const results = await res.json();
        if (results && results.length > 0) {
          const item = results[0];
          const newLat = Number(parseFloat(item.lat).toFixed(6));
          const newLng = Number(parseFloat(item.lon).toFixed(6));
          const itemAddr = item.address || {};

          const resolvedCity =
            itemAddr.town ||
            itemAddr.city ||
            itemAddr.municipality ||
            itemAddr.village ||
            'Ipiales';

          const road = itemAddr.road || itemAddr.pedestrian || '';
          const number = itemAddr.house_number || '';
          const neighborhood = itemAddr.neighbourhood || itemAddr.suburb || '';

          let formatted = '';
          if (road) {
            formatted = number ? `${road} #${number}` : road;
            if (neighborhood && neighborhood !== road) formatted += `, ${neighborhood}`;
            formatted += `, ${resolvedCity}`;
          } else {
            formatted = item.display_name.split(',').slice(0, 3).join(', ');
          }

          if (mapInstanceRef.current && markerRef.current) {
            markerRef.current.setLatLng([newLat, newLng]);
            mapInstanceRef.current.flyTo([newLat, newLng], 16, { animate: true });
          }

          setCurrentCoords({ lat: newLat, lng: newLng });
          setDetectedAddress(formatted);
          setDetectedCity(resolvedCity);
          onChange({
            lat: newLat,
            lng: newLng,
            address: formatted,
            city: resolvedCity,
          });
          setSearchQuery('');
          return;
        }
      }
      setSearchError('No encontramos el lugar exacto. Puedes hacer clic directo en el mapa.');
    } catch {
      setSearchError('Error al buscar dirección. Por favor selecciona el punto en el mapa.');
    } finally {
      setIsSearching(false);
    }
  };

  // Geolocalización del navegador (GPS en tiempo real)
  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('Tu navegador no soporta geolocalización.');
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        const userLat = Number(pos.coords.latitude.toFixed(6));
        const userLng = Number(pos.coords.longitude.toFixed(6));
        if (mapInstanceRef.current && markerRef.current) {
          markerRef.current.setLatLng([userLat, userLng]);
          mapInstanceRef.current.flyTo([userLat, userLng], 16, { animate: true });
          setCurrentCoords({ lat: userLat, lng: userLng });
          resolveLocationFromCoords(userLat, userLng);
        }
      },
      (err) => {
        setIsLocating(false);
        console.warn('No se pudo obtener la ubicación GPS:', err);
      },
      { timeout: 8000 }
    );
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Barra de búsqueda y botón GPS */}
      <div className="flex flex-col sm:flex-row gap-2">
        <form onSubmit={handleSearchAddress} className="flex-1 flex gap-1.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Escribe barrio o calle para ubicar en el mapa..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-gray-300 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#E52243]"
            />
          </div>
          <button
            type="submit"
            disabled={isSearching}
            className="px-3.5 py-2 bg-gray-900 hover:bg-black text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shrink-0 disabled:opacity-50"
          >
            {isSearching ? 'Buscando...' : 'Ubicar'}
          </button>
        </form>

        <button
          type="button"
          onClick={handleGetCurrentLocation}
          disabled={isLocating}
          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-white hover:bg-gray-50 border border-gray-300 rounded-xl text-xs font-bold text-gray-800 transition-colors shadow-2xs cursor-pointer disabled:opacity-50 shrink-0"
        >
          <Navigation className={`w-3.5 h-3.5 text-[#E52243] ${isLocating ? 'animate-spin' : ''}`} />
          <span>{isLocating ? 'Detectando GPS...' : 'Mi GPS actual'}</span>
        </button>
      </div>

      {searchError && (
        <div className="p-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl">
          {searchError}
        </div>
      )}

      {/* Contenedor del mapa interactivo */}
      <div className="relative w-full h-72 sm:h-80 rounded-2xl overflow-hidden border-2 border-gray-200 shadow-xs z-0">
        <div ref={mapContainerRef} className="w-full h-full" />

        {/* Píldora de instrucción flotante en el mapa */}
        <div className="absolute top-3 left-3 right-3 sm:right-auto z-[400] bg-white/95 backdrop-blur-xs px-3 py-1.5 rounded-xl border border-gray-200 text-[11px] font-semibold text-gray-700 shadow-md flex items-center gap-1.5 pointer-events-none">
          <Compass className="w-3.5 h-3.5 text-[#E52243] shrink-0" />
          <span>Haz clic o arrastra el pin 📦 para ubicar tu bodega</span>
        </div>

        {/* Notificador de geocodificación en vivo */}
        {isGeocoding && (
          <div className="absolute bottom-3 left-3 z-[400] bg-gray-950/90 text-white backdrop-blur-xs px-3 py-1.5 rounded-xl text-[11px] font-bold shadow-lg flex items-center gap-2 animate-in fade-in">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#E52243]" />
            <span>Identificando dirección y ciudad...</span>
          </div>
        )}
      </div>

      {/* Resumen de dirección y ciudad autocompletada */}
      {(detectedAddress || detectedCity) && (
        <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-3 sm:p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-start gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-wider text-emerald-800 flex items-center gap-1">
                <span>Ubicación capturada automáticamente</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              <div className="font-bold text-gray-950 text-xs sm:text-sm mt-0.5">
                {detectedAddress || 'Dirección en el mapa'}
              </div>
              <div className="text-[11px] text-gray-600 font-medium">
                Ciudad identificada: <strong className="text-gray-900">{detectedCity}</strong> · Coordenadas: {currentCoords.lat.toFixed(5)}, {currentCoords.lng.toFixed(5)}
              </div>
            </div>
          </div>
          <span className="self-end sm:self-center px-2 py-0.5 rounded-md bg-emerald-200/80 text-emerald-900 font-bold text-[10px] shrink-0">
            ✓ Aplicada al formulario
          </span>
        </div>
      )}

      {/* Botones de acceso rápido a puntos comunes */}
      <div className="space-y-1.5">
        <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">
          Puntos de referencia comerciales (clic rápido):
        </span>
        <div className="flex flex-wrap gap-1.5">
          {PRESET_ZONES.map((zone) => {
            const isNear =
              Math.abs(zone.lat - currentCoords.lat) < 0.003 &&
              Math.abs(zone.lng - currentCoords.lng) < 0.003;
            return (
              <button
                key={zone.name}
                type="button"
                onClick={() => handleSelectPreset(zone)}
                className={`px-2.5 py-1 text-xs rounded-lg font-bold border transition-all cursor-pointer flex items-center gap-1 ${
                  isNear
                    ? 'bg-red-50 border-[#E52243] text-[#E52243]'
                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span>{zone.name}</span>
                {isNear && <Check className="w-3 h-3 text-[#E52243]" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

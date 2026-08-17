import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Navigation, Check, X, Search, Loader2 } from 'lucide-react';

interface MapLocationPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialLat?: number;
  initialLng?: number;
  initialAddress?: string;
  onConfirm: (data: { address: string; lat: number; lng: number; mapUrl: string }) => void;
}

// Default center: Ipiales, Nariño, Colombia if no lat/lng supplied
const DEFAULT_LAT = 0.83028;
const DEFAULT_LNG = -77.64444;

export const MapLocationPickerModal: React.FC<MapLocationPickerModalProps> = ({
  isOpen,
  onClose,
  initialLat,
  initialLng,
  initialAddress = '',
  onConfirm
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerInstanceRef = useRef<L.Marker | null>(null);

  const [lat, setLat] = useState<number>(initialLat && !isNaN(initialLat) ? initialLat : DEFAULT_LAT);
  const [lng, setLng] = useState<number>(initialLng && !isNaN(initialLng) ? initialLng : DEFAULT_LNG);
  const [latInput, setLatInput] = useState<string>(String(initialLat && !isNaN(initialLat) ? initialLat : DEFAULT_LAT));
  const [lngInput, setLngInput] = useState<string>(String(initialLng && !isNaN(initialLng) ? initialLng : DEFAULT_LNG));
  const [address, setAddress] = useState<string>(initialAddress);
  const [isGeocoding, setIsGeocoding] = useState<boolean>(false);
  const [isLocating, setIsLocating] = useState<boolean>(false);

  // Sync state when props change or modal opens
  useEffect(() => {
    if (isOpen) {
      const validLat = initialLat && !isNaN(initialLat) ? initialLat : DEFAULT_LAT;
      const validLng = initialLng && !isNaN(initialLng) ? initialLng : DEFAULT_LNG;
      setLat(validLat);
      setLng(validLng);
      setLatInput(String(validLat));
      setLngInput(String(validLng));
      setAddress(initialAddress);
    }
  }, [isOpen, initialLat, initialLng, initialAddress]);

  // Function to perform reverse geocoding using Nominatim
  const reverseGeocode = async (latitude: number, longitude: number) => {
    setIsGeocoding(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
        { headers: { 'Accept-Language': 'es' } }
      );
      if (res.ok) {
        const data = await res.json();
        if (data && data.display_name) {
          // Format a clean address string
          const addr = data.address;
          let formattedAddr = '';
          if (addr) {
            const road = addr.road || addr.pedestrian || addr.suburb || addr.neighbourhood || '';
            const houseNumber = addr.house_number ? ` #${addr.house_number}` : '';
            const city = addr.city || addr.town || addr.village || addr.municipality || '';
            if (road) {
              formattedAddr = `${road}${houseNumber}${city ? `, ${city}` : ''}`;
            } else {
              formattedAddr = data.display_name.split(',').slice(0, 3).join(',');
            }
          } else {
            formattedAddr = data.display_name;
          }
          if (formattedAddr.trim()) {
            setAddress(formattedAddr);
          }
        }
      }
    } catch (err) {
      console.warn("Reverse geocode failed:", err);
    } finally {
      setIsGeocoding(false);
    }
  };

  // Initialize Leaflet Map
  useEffect(() => {
    if (!isOpen || !mapContainerRef.current) return;

    // Small delay to ensure modal container has rendered size
    const timer = setTimeout(() => {
      if (!mapContainerRef.current) return;

      if (!mapInstanceRef.current) {
        const map = L.map(mapContainerRef.current, {
          center: [lat, lng],
          zoom: 15,
          zoomControl: false
        });

        // Add zoom control top right
        L.control.zoom({ position: 'topright' }).addTo(map);

        // Add tile layer
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© OpenStreetMap'
        }).addTo(map);

        // Custom Pin Icon
        const pinIcon = L.divIcon({
          className: 'custom-map-pin',
          html: `
            <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 36px; height: 36px;">
              <div style="position: absolute; width: 36px; height: 36px; background-color: rgba(239, 68, 68, 0.25); border-radius: 50%; animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
              <div style="width: 32px; height: 32px; background-color: #EF4444; border: 3px solid #FFFFFF; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); box-shadow: 0 4px 12px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;">
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

        // Handle Marker Drag
        marker.on('dragend', () => {
          const newPos = marker.getLatLng();
          setLat(newPos.lat);
          setLng(newPos.lng);
          setLatInput(String(newPos.lat.toFixed(6)));
          setLngInput(String(newPos.lng.toFixed(6)));
          reverseGeocode(newPos.lat, newPos.lng);
        });

        // Handle Map Click to place pin
        map.on('click', (e: L.LeafletMouseEvent) => {
          marker.setLatLng(e.latlng);
          setLat(e.latlng.lat);
          setLng(e.latlng.lng);
          setLatInput(String(e.latlng.lat.toFixed(6)));
          setLngInput(String(e.latlng.lng.toFixed(6)));
          reverseGeocode(e.latlng.lat, e.latlng.lng);
        });

        mapInstanceRef.current = map;
        markerInstanceRef.current = marker;
      } else {
        mapInstanceRef.current.invalidateSize();
        mapInstanceRef.current.setView([lat, lng], 15);
        if (markerInstanceRef.current) {
          markerInstanceRef.current.setLatLng([lat, lng]);
        }
      }
    }, 150);

    return () => {
      clearTimeout(timer);
    };
  }, [isOpen]);

  // Clean up map instance on modal close
  useEffect(() => {
    if (!isOpen && mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
      markerInstanceRef.current = null;
    }
  }, [isOpen]);

  // Update map view if lat/lng state changes programmatically
  const updateMapPosition = (newLat: number, newLng: number) => {
    setLat(newLat);
    setLng(newLng);
    setLatInput(String(newLat.toFixed(6)));
    setLngInput(String(newLng.toFixed(6)));
    if (mapInstanceRef.current && markerInstanceRef.current) {
      mapInstanceRef.current.setView([newLat, newLng], 16);
      markerInstanceRef.current.setLatLng([newLat, newLng]);
    }
    reverseGeocode(newLat, newLng);
  };

  // Handle manual input of Lat / Lng
  const handleApplyCustomCoords = (latValStr: string, lngValStr: string) => {
    const parsedLat = parseFloat(latValStr);
    const parsedLng = parseFloat(lngValStr);
    if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
      setLat(parsedLat);
      setLng(parsedLng);
      if (mapInstanceRef.current && markerInstanceRef.current) {
        mapInstanceRef.current.setView([parsedLat, parsedLng], 16);
        markerInstanceRef.current.setLatLng([parsedLat, parsedLng]);
      }
      reverseGeocode(parsedLat, parsedLng);
    }
  };

  // Get current browser GPS location
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
        updateMapPosition(latitude, longitude);
      },
      (error) => {
        setIsLocating(false);
        alert("No se pudo obtener tu ubicación actual. Permite el acceso a la ubicación e intenta nuevamente.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleConfirm = () => {
    const mapUrl = `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
    onConfirm({
      address: address.trim(),
      lat,
      lng,
      mapUrl
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-gray-950 border border-gray-800 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between bg-gray-900/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-wider">
                Ubicación en el Mapa
              </h3>
              <p className="text-[11px] text-gray-400">
                Toca o arrastra el puntero para ubicar tu negocio
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Action Row: GPS Location Button */}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleUseCurrentLocation}
              disabled={isLocating}
              className="flex-1 h-10 px-3.5 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
            >
              {isLocating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                  Obteniendo GPS...
                </>
              ) : (
                <>
                  <Navigation className="w-4 h-4 text-indigo-400" />
                  Usar mi ubicación actual (GPS)
                </>
              )}
            </button>
          </div>

          {/* Interactive Map Container */}
          <div className="relative rounded-2xl border border-gray-800 overflow-hidden bg-gray-900 h-[320px] shadow-inner">
            <div ref={mapContainerRef} className="w-full h-full z-10" />

            {/* Instruction Badge overlay */}
            <div className="absolute top-3 left-3 z-[400] bg-gray-950/90 border border-gray-800/80 px-3 py-1.5 rounded-xl text-[10px] font-bold text-gray-300 backdrop-blur-md shadow-lg flex items-center gap-1.5">
              <MapPin className="w-3 h-3 text-red-500" />
              Toca o arrastra el puntero rojo
            </div>
          </div>

          {/* Address Input */}
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider flex items-center justify-between">
              <span>Dirección o Nombre del Lugar</span>
              {isGeocoding && (
                <span className="text-emerald-400 flex items-center gap-1 font-semibold text-[10px]">
                  <Loader2 className="w-3 h-3 animate-spin" /> Obteniendo dirección...
                </span>
              )}
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Ej: Carrera 6 # 14-25, Ipiales"
              className="w-full h-11 bg-gray-900 border border-gray-800 focus:border-emerald-500 px-3.5 rounded-xl text-xs font-semibold outline-none text-white focus:ring-1 focus:ring-emerald-500/20"
            />
          </div>

          {/* Explicit Lat/Lng Coordinate Inputs for precision */}
          <div className="p-3 bg-gray-900/60 border border-gray-800 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">
                Coordenadas Exactas (GPS)
              </span>
              <span className="text-[9px] text-gray-500">Ipiales default: 0.83028, -77.64444</span>
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
                  placeholder="Ej: 0.83028"
                  className="w-full h-9 bg-gray-950 border border-gray-800 focus:border-emerald-500 px-2.5 rounded-lg text-xs font-mono text-emerald-400 outline-none"
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
                  placeholder="Ej: -77.64444"
                  className="w-full h-9 bg-gray-950 border border-gray-800 focus:border-emerald-500 px-2.5 rounded-lg text-xs font-mono text-emerald-400 outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-4 border-t border-gray-800 bg-gray-900/50 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 h-10 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="px-5 h-10 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-gray-950 text-xs font-black flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.98]"
          >
            <Check className="w-4 h-4 stroke-[3]" />
            Confirmar Ubicación
          </button>
        </div>
      </div>
    </div>
  );
};

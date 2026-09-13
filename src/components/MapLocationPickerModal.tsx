import React, { useEffect, useRef, useState, useCallback } from 'react';
import { APIProvider, Map, useMap } from '@vis.gl/react-google-maps';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { 
  MapPin, 
  Navigation, 
  Check, 
  X, 
  Search, 
  Loader2, 
  Layers, 
  Key,
  HelpCircle,
  Plus,
  Minus,
  ArrowLeft,
  Map as MapIcon
} from 'lucide-react';
import { isPickupOrInvalidAddress } from './DeliveryAddressCard';

interface MapLocationPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialLat?: number;
  initialLng?: number;
  initialAddress?: string;
  onConfirm: (data: { address: string; lat: number; lng: number; mapUrl: string }) => void;
}

export interface DefaultIpialesAddress {
  id: string;
  name: string;
  badge: string;
  address: string;
  lat: number;
  lng: number;
}

// 4 direcciones representativas por defecto de la ciudad de Ipiales, Nariño
export const IPIALES_DEFAULT_ADDRESSES: DefaultIpialesAddress[] = [
  {
    id: 'ipiales-centro',
    name: 'Parque 20 de Julio',
    badge: 'Centro',
    address: 'Carrera 6 # 8-20, Parque 20 de Julio, Centro, Ipiales, Nariño',
    lat: 0.8308,
    lng: -77.6438
  },
  {
    id: 'ipiales-santander',
    name: 'Plaza Santander',
    badge: 'Comercio',
    address: 'Carrera 6 # 13-40, Plaza Santander, Ipiales, Nariño',
    lat: 0.8289,
    lng: -77.6450
  },
  {
    id: 'ipiales-manzano',
    name: 'Barrio El Manzano',
    badge: 'Calle 24',
    address: 'Calle 24 con Carrera 5, Barrio El Manzano, Ipiales, Nariño',
    lat: 0.8350,
    lng: -77.6469
  },
  {
    id: 'ipiales-hospital',
    name: 'Hospital Civil / Puenes',
    badge: 'Panamericana',
    address: 'Avenida Panamericana # 15-40, Barrio Puenes, Ipiales, Nariño',
    lat: 0.8361,
    lng: -77.6380
  }
];

// Default center: Ipiales, Nariño, Colombia (Parque 20 de Julio, Centro)
export const DEFAULT_LAT = 0.8308;
export const DEFAULT_LNG = -77.6438;

// Helper to strictly ensure coordinates are within Ipiales and surrounding municipal area
export const isWithinIpiales = (latitude?: number | null, longitude?: number | null): boolean => {
  if (latitude === undefined || latitude === null || isNaN(latitude)) return false;
  if (longitude === undefined || longitude === null || isNaN(longitude)) return false;
  // Bounding box for Ipiales (0.70°N to 0.95°N, -77.75°W to -77.50°W)
  return latitude >= 0.70 && latitude <= 0.95 && longitude >= -77.75 && longitude <= -77.50;
};

export interface AddressSuggestion {
  id: string;
  mainText: string;
  secondaryText: string;
  fullAddress: string;
  lat?: number;
  lng?: number;
  distanceLabel?: string;
  placeId?: string;
  placePrediction?: any;
  source: 'google' | 'photon' | 'local' | 'nominatim';
}

// Distance calculation in km using Haversine formula
export const calculateDistanceKm = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export const formatDistanceLabel = (lat?: number, lng?: number, fallback?: string): string => {
  if (fallback) return fallback;
  if (lat === undefined || lng === undefined) return '1,5 km';
  const dist = calculateDistanceKm(DEFAULT_LAT, DEFAULT_LNG, lat, lng);
  const rounded = Math.round(dist * 10) / 10;
  if (rounded === Math.floor(rounded)) {
    return `${rounded} km`;
  }
  return `${rounded.toFixed(1).replace('.', ',')} km`;
};

// Curated prominent neighborhoods, avenues, and landmarks in Ipiales, Nariño (matching inDrive order)
const LOCAL_IPIALES_PLACES: Array<{ 
  name: string; 
  secondary: string; 
  lat: number; 
  lng: number; 
  distanceLabel: string;
  keywords: string[] 
}> = [
  { name: "Barrio Obrero", secondary: "Ipiales, Nariño", lat: 0.8260, lng: -77.6410, distanceLabel: "2,5 km", keywords: ["barrio", "obrero"] },
  { name: "Barrio El Centro", secondary: "Ipiales, Nariño", lat: 0.8298, lng: -77.6444, distanceLabel: "1,2 km", keywords: ["barrio", "centro", "el centro"] },
  { name: "Barrio Puenes", secondary: "Ipiales, Nariño", lat: 0.8285, lng: -77.6354, distanceLabel: "1,7 km", keywords: ["barrio", "puenes"] },
  { name: "Barrio San Vicente", secondary: "Carrera 4, Ipiales, Nariño", lat: 0.8335, lng: -77.6460, distanceLabel: "2 km", keywords: ["barrio", "san", "vicente", "carrera 4"] },
  { name: "Barrio San José", secondary: "Ipiales, Nariño", lat: 0.8372, lng: -77.6415, distanceLabel: "1,7 km", keywords: ["barrio", "san", "jose"] },
  { name: "Barrio El Manzano", secondary: "Calle 24, Ipiales, Nariño", lat: 0.8345, lng: -77.6432, distanceLabel: "1,4 km", keywords: ["barrio", "manzano", "calle 24", "carrera 5"] },
  { name: "Barrio Champagnat", secondary: "Ipiales, Nariño", lat: 0.8358, lng: -77.6489, distanceLabel: "1,9 km", keywords: ["barrio", "champagnat", "colegio"] },
  { name: "Barrio Centenario", secondary: "Ipiales, Nariño", lat: 0.8315, lng: -77.6521, distanceLabel: "1,8 km", keywords: ["barrio", "centenario"] },
  { name: "Barrio El Charco", secondary: "Ipiales, Nariño", lat: 0.8242, lng: -77.6398, distanceLabel: "1,6 km", keywords: ["barrio", "charco"] },
  { name: "Barrio Bellavista", secondary: "Ipiales, Nariño", lat: 0.8291, lng: -77.6562, distanceLabel: "2,2 km", keywords: ["barrio", "bellavista"] },
  { name: "Barrio La Laguna", secondary: "Ipiales, Nariño", lat: 0.8331, lng: -77.6385, distanceLabel: "1,5 km", keywords: ["barrio", "laguna"] },
  { name: "Barrio Míralores", secondary: "Ipiales, Nariño", lat: 0.8270, lng: -77.6490, distanceLabel: "1,6 km", keywords: ["barrio", "miralores", "miraflores"] },
  { name: "Barrio Alfonso López", secondary: "Ipiales, Nariño", lat: 0.8320, lng: -77.6400, distanceLabel: "1,3 km", keywords: ["barrio", "alfonso", "lopez"] },
  { name: "Barrio Totoral", secondary: "Ipiales, Nariño", lat: 0.8225, lng: -77.6421, distanceLabel: "2,1 km", keywords: ["barrio", "totoral"] },
  { name: "Parque Santander", secondary: "Centro, Ipiales, Nariño", lat: 0.8289, lng: -77.6450, distanceLabel: "0,9 km", keywords: ["parque", "santander", "centro"] },
  { name: "Plaza 20 de Julio", secondary: "Centro, Ipiales, Nariño", lat: 0.8308, lng: -77.6438, distanceLabel: "0,8 km", keywords: ["plaza", "20", "julio", "catedral"] },
  { name: "Hospital Civil de Ipiales", secondary: "Avenida Panamericana, Ipiales", lat: 0.8361, lng: -77.6380, distanceLabel: "2,1 km", keywords: ["hospital", "civil", "salud"] },
  { name: "Terminal de Transportes Ipiales", secondary: "Avenida Panamericana, Ipiales", lat: 0.8395, lng: -77.6312, distanceLabel: "2,8 km", keywords: ["terminal", "transportes", "buses"] }
];

// inDrive-style dark map styles for Google Maps
const DARK_MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#212832" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#212832" }, { weight: 2 }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8c9ba5" }] },
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [{ color: "#d5d9dc" }],
  },
  {
    featureType: "poi",
    elementType: "labels.text.fill",
    stylers: [{ color: "#a0b0ba" }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#16382c" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#2c3848" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#1b232e" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#a38025" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry.stroke",
    stylers: [{ color: "#614c14" }],
  },
  {
    featureType: "transit",
    elementType: "geometry",
    stylers: [{ color: "#2f3948" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#006275" }],
  },
];

// Helper to render matched search queries with corporate red highlighting
const renderHighlightedText = (text: string, query: string) => {
  if (!query || !query.trim()) {
    return <span className="text-white font-medium">{text}</span>;
  }
  const cleanQ = query.trim();
  const lowerText = text.toLowerCase();
  const lowerQ = cleanQ.toLowerCase();
  const idx = lowerText.indexOf(lowerQ);

  if (idx === -1) {
    return <span className="text-white font-medium">{text}</span>;
  }

  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + cleanQ.length);
  const after = text.slice(idx + cleanQ.length);

  return (
    <>
      {before && <span className="text-white font-medium">{before}</span>}
      <span className="text-[#E63946] font-bold">{match}</span>
      {after && <span className="text-white font-medium">{after}</span>}
    </>
  );
};

// Helper to normalize and sanitize common Spanish street abbreviations and typos
const normalizeSearchQuery = (raw: string): string => {
  return raw
    .toLowerCase()
    .replace(/\bbariio\b/gi, 'barrio')
    .replace(/\bbario\b/gi, 'barrio')
    .replace(/\bcll\b/gi, 'calle')
    .replace(/\bcra\b/gi, 'carrera')
    .replace(/\bkr\b/gi, 'carrera')
    .replace(/\bkfe\b/gi, 'carrera')
    .replace(/\bav\b/gi, 'avenida')
    .replace(/\bav\.\b/gi, 'avenida')
    .trim();
};

// Smooth map panning helper and instance capture for Google Maps with offset projection for fixed center-up pin
const GoogleMapController: React.FC<{ 
  targetLat: number; 
  targetLng: number;
  onMapReady?: (map: google.maps.Map | null) => void;
  onLocationChange: (lat: number, lng: number) => void;
  onMovementChange: (moving: boolean) => void;
}> = ({ targetLat, targetLng, onMapReady, onLocationChange, onMovementChange }) => {
  const map = useMap();
  const isDraggingRef = useRef<boolean>(false);
  const lastTargetRef = useRef<{ lat: number; lng: number } | null>(null);

  // Helper to convert fixed screen pin (top: 45%, left: 50%) to LatLng
  const getPointUnderFixedPin = useCallback((googleMap: google.maps.Map): { lat: number; lng: number } | null => {
    const center = googleMap.getCenter();
    if (!center) return null;
    const div = googleMap.getDiv();
    if (!div) return { lat: center.lat(), lng: center.lng() };

    const height = div.clientHeight || 500;
    // The pin is located 5% of the viewport height above the geometric center (y = 45% vs y = 50%)
    const dy = -Math.round(height * 0.05);

    const projection = googleMap.getProjection();
    if (!projection) return { lat: center.lat(), lng: center.lng() };

    const zoom = googleMap.getZoom() ?? 15;
    const scale = Math.pow(2, zoom);
    const centerWorld = projection.fromLatLngToPoint(center);
    if (!centerWorld) return { lat: center.lat(), lng: center.lng() };

    const targetWorld = new google.maps.Point(
      centerWorld.x,
      centerWorld.y + dy / scale
    );
    const targetLatLng = projection.fromPointToLatLng(targetWorld);
    if (!targetLatLng) return { lat: center.lat(), lng: center.lng() };

    return { lat: targetLatLng.lat(), lng: targetLatLng.lng() };
  }, []);

  // Helper to pan Google Map so that (targetLat, targetLng) lands directly under the fixed pin at top: 45%
  const panToFixedPin = useCallback((googleMap: google.maps.Map, tLat: number, tLng: number) => {
    const div = googleMap.getDiv();
    const projection = googleMap.getProjection();
    if (!div || !projection) {
      googleMap.panTo({ lat: tLat, lng: tLng });
      return;
    }
    const height = div.clientHeight || 500;
    const dy = -Math.round(height * 0.05);
    const zoom = googleMap.getZoom() ?? 15;
    const scale = Math.pow(2, zoom);

    const targetLatLng = new google.maps.LatLng(tLat, tLng);
    const targetWorld = projection.fromLatLngToPoint(targetLatLng);
    if (!targetWorld) {
      googleMap.panTo({ lat: tLat, lng: tLng });
      return;
    }

    const centerWorld = new google.maps.Point(
      targetWorld.x,
      targetWorld.y - dy / scale
    );
    const centerLatLng = projection.fromPointToLatLng(centerWorld);
    if (centerLatLng) {
      googleMap.panTo(centerLatLng);
    } else {
      googleMap.panTo(targetLatLng);
    }
  }, []);

  useEffect(() => {
    if (!map) return;
    if (onMapReady) {
      onMapReady(map);
    }

    // Always ensure initial Google Map view is centered in Ipiales, Nariño
    const initialCenter = map.getCenter();
    if (!initialCenter || !isWithinIpiales(initialCenter.lat(), initialCenter.lng())) {
      panToFixedPin(map, DEFAULT_LAT, DEFAULT_LNG);
    }

    const dragStartL = map.addListener('dragstart', () => {
      isDraggingRef.current = true;
      onMovementChange(true);
    });

    const centerChangedL = map.addListener('center_changed', () => {
      if (isDraggingRef.current) {
        onMovementChange(true);
      }
    });

    const dragEndL = map.addListener('dragend', () => {
      isDraggingRef.current = false;
    });

    const idleL = map.addListener('idle', () => {
      isDraggingRef.current = false;
      onMovementChange(false);
      const point = getPointUnderFixedPin(map);
      if (point && !isNaN(point.lat) && !isNaN(point.lng)) {
        lastTargetRef.current = { lat: point.lat, lng: point.lng };
        onLocationChange(point.lat, point.lng);
      }
    });

    return () => {
      google.maps.event.removeListener(dragStartL);
      google.maps.event.removeListener(centerChangedL);
      google.maps.event.removeListener(dragEndL);
      google.maps.event.removeListener(idleL);
    };
  }, [map, onMapReady, onLocationChange, onMovementChange, getPointUnderFixedPin, panToFixedPin]);

  useEffect(() => {
    if (!map || isNaN(targetLat) || isNaN(targetLng) || isDraggingRef.current) return;
    const safeLat = isWithinIpiales(targetLat, targetLng) ? targetLat : DEFAULT_LAT;
    const safeLng = isWithinIpiales(targetLat, targetLng) ? targetLng : DEFAULT_LNG;
    const last = lastTargetRef.current;
    if (last && Math.abs(last.lat - safeLat) < 0.000002 && Math.abs(last.lng - safeLng) < 0.000002) {
      return;
    }
    lastTargetRef.current = { lat: safeLat, lng: safeLng };
    panToFixedPin(map, safeLat, safeLng);
  }, [map, targetLat, targetLng, panToFixedPin]);

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
  const [lat, setLat] = useState<number>(() => {
    if (initialLat && initialLng && isWithinIpiales(initialLat, initialLng)) {
      return initialLat;
    }
    return DEFAULT_LAT;
  });
  const [lng, setLng] = useState<number>(() => {
    if (initialLat && initialLng && isWithinIpiales(initialLat, initialLng)) {
      return initialLng;
    }
    return DEFAULT_LNG;
  });
  const [latInput, setLatInput] = useState<string>(() => {
    if (initialLat && initialLng && isWithinIpiales(initialLat, initialLng)) {
      return initialLat.toFixed(6);
    }
    return DEFAULT_LAT.toFixed(6);
  });
  const [lngInput, setLngInput] = useState<string>(() => {
    if (initialLat && initialLng && isWithinIpiales(initialLat, initialLng)) {
      return initialLng.toFixed(6);
    }
    return DEFAULT_LNG.toFixed(6);
  });
  const [address, setAddress] = useState<string>(() => {
    if (initialLat && initialLng && isWithinIpiales(initialLat, initialLng)) {
      return initialAddress;
    }
    return initialAddress && initialAddress.toLowerCase().includes('ipiales') ? initialAddress : '';
  });
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState<boolean>(false);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const searchContainerRef = useRef<HTMLDivElement | null>(null);
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isGeocoding, setIsGeocoding] = useState<boolean>(false);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [isConfirming, setIsConfirming] = useState<boolean>(false);
  const [showMapModal, setShowMapModal] = useState<boolean>(false);
  const [isMapMoving, setIsMapMoving] = useState<boolean>(false);

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

  // Map instance reference for mobile zoom in / zoom out controls
  const googleMapRef = useRef<google.maps.Map | null>(null);
  const [googleMapInstance, setGoogleMapInstance] = useState<google.maps.Map | null>(null);

  const handleMapReady = useCallback((map: google.maps.Map | null) => {
    googleMapRef.current = map;
    setGoogleMapInstance(map);
  }, []);

  // Zoom In handler (works on both Google Maps and Leaflet on mobile & desktop)
  const handleZoomIn = useCallback(() => {
    const gMap = googleMapRef.current || googleMapInstance;
    if (gMap) {
      const current = gMap.getZoom() ?? 15;
      gMap.setZoom(Math.min(current + 1, 21));
    } else if (leafletMapRef.current) {
      leafletMapRef.current.zoomIn();
    }
  }, [googleMapInstance]);

  // Zoom Out handler (works on both Google Maps and Leaflet on mobile & desktop)
  const handleZoomOut = useCallback(() => {
    const gMap = googleMapRef.current || googleMapInstance;
    if (gMap) {
      const current = gMap.getZoom() ?? 15;
      gMap.setZoom(Math.max(current - 1, 3));
    } else if (leafletMapRef.current) {
      leafletMapRef.current.zoomOut();
    }
  }, [googleMapInstance]);

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

  // Synchronize initial values when modal opens - ALWAYS prioritizing Ipiales
  useEffect(() => {
    if (isOpen) {
      const hasValidIpiales = initialLat && initialLng && isWithinIpiales(initialLat, initialLng);
      const isCustomValidAddr = Boolean(
        initialAddress && 
        initialAddress.trim().length > 3 && 
        !isPickupOrInvalidAddress(initialAddress) &&
        !initialAddress.toLowerCase().includes('carrera 1a')
      );

      const defaultAddrObj = IPIALES_DEFAULT_ADDRESSES[0];
      const validLat = hasValidIpiales ? initialLat : defaultAddrObj.lat;
      const validLng = hasValidIpiales ? initialLng : defaultAddrObj.lng;

      setLat(validLat);
      setLng(validLng);
      setLatInput(String(validLat.toFixed(6)));
      setLngInput(String(validLng.toFixed(6)));
      setAddress(isCustomValidAddr ? (initialAddress || '').trim() : defaultAddrObj.address);
      setSearchQuery('');
      setSuggestions([]);
      setShowSuggestions(false);
      setIsLoadingSuggestions(false);
      setIsGeocoding(false);
      setIsConfirming(false);
      setShowMapModal(false);
    }
  }, [isOpen, initialLat, initialLng, initialAddress]);

  // Multi-tier reverse geocoding with instant server and open fallbacks (bypasses unactivated client Geocoder API errors)
  const fetchReverseGeocode = useCallback(async (latitude: number, longitude: number): Promise<string> => {
    // 1. Call server-side / Hostinger proxy endpoint (handles Google server proxy + Photon + Nominatim)
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

  // Fetch address predictions / suggestions from local places, Google Places, Photon, and Nominatim
  const fetchSuggestions = useCallback(async (rawQuery: string) => {
    const trimmed = rawQuery.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setIsLoadingSuggestions(false);
      return;
    }

    setIsLoadingSuggestions(true);
    const results: AddressSuggestion[] = [];
    const normalized = normalizeSearchQuery(trimmed);
    const normalizedWords = normalized.split(/\s+/).filter(Boolean);

    // 1. Check local Ipiales places & landmarks (instant, handles typos & combined queries like "bariio manzano calle 24")
    for (const item of LOCAL_IPIALES_PLACES) {
      const nameLower = item.name.toLowerCase();
      const directMatch = nameLower.includes(normalized);
      const wordMatches = normalizedWords.filter(w => 
        w.length >= 2 && (nameLower.includes(w) || item.keywords.some(k => k.includes(w)))
      );
      if (directMatch || wordMatches.length >= Math.min(2, normalizedWords.length)) {
        results.push({
          id: `local-${item.name}`,
          mainText: item.name,
          secondaryText: item.secondary,
          fullAddress: `${item.name}, ${item.secondary}`,
          lat: item.lat,
          lng: item.lng,
          distanceLabel: item.distanceLabel,
          source: 'local'
        });
      }
    }

    // 2. Query modern Google Places API (New) AutocompleteSuggestion (never legacy AutocompleteService)
    if (typeof window !== 'undefined' && (window as any).google?.maps?.importLibrary) {
      try {
        const placesLib = await (window as any).google.maps.importLibrary('places');
        if (placesLib?.AutocompleteSuggestion) {
          const request = {
            input: trimmed,
            region: 'co',
            language: 'es',
            locationBias: {
              center: { lat: DEFAULT_LAT, lng: DEFAULT_LNG },
              radius: 30000
            }
          };
          const { suggestions } = await placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
          if (suggestions && Array.isArray(suggestions) && suggestions.length > 0) {
            for (const s of suggestions.slice(0, 5)) {
              const pred = s.placePrediction;
              if (!pred) continue;
              const main = pred.mainText?.toString() || pred.text?.toString() || '';
              const secondary = pred.secondaryText?.toString() || 'Ipiales, Nariño, Colombia';
              const full = pred.text?.toString() || `${main}, ${secondary}`;
              const placeId = pred.placeId;

              if (main && !results.some(r => r.fullAddress.toLowerCase() === full.toLowerCase() || r.mainText.toLowerCase() === main.toLowerCase())) {
                results.push({
                  id: `g-${placeId || Math.random()}`,
                  mainText: main,
                  secondaryText: secondary,
                  fullAddress: full,
                  placeId: placeId,
                  placePrediction: pred,
                  distanceLabel: '1,5 km',
                  source: 'google'
                });
              }
            }
          }
        }
      } catch (err) {
        // Silently catch if Places API (New) is not enabled on this key; fallback handles search seamlessly
      }
    }

    // 3. Query Photon (fast OSM autocomplete service optimized for search suggestions)
    try {
      const photonQuery = normalized.includes('ipiales') ? normalized : `${normalized} Ipiales`;
      const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(photonQuery)}&lat=${DEFAULT_LAT}&lon=${DEFAULT_LNG}&limit=6`);
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.features)) {
          for (const feat of data.features) {
            const props = feat.properties || {};
            const coords = feat.geometry?.coordinates; // [lon, lat]
            const name = props.name || props.street || props.city;
            if (!name) continue;

            const secondaryParts = [props.city || 'Ipiales', props.state || 'Nariño', props.country || 'Colombia'].filter(Boolean);
            const secondary = secondaryParts.join(', ');
            const full = `${name}, ${secondary}`;

            if (!results.some(r => r.mainText.toLowerCase() === name.toLowerCase())) {
              results.push({
                id: `ph-${props.osm_id || Math.random()}`,
                mainText: name,
                secondaryText: secondary,
                fullAddress: full,
                lat: coords ? coords[1] : undefined,
                lng: coords ? coords[0] : undefined,
                distanceLabel: formatDistanceLabel(coords ? coords[1] : undefined, coords ? coords[0] : undefined),
                source: 'photon'
              });
            }
          }
        }
      }
    } catch (err) {
      console.warn("Photon autocomplete error:", err);
    }

    // 4. Nominatim fallback if results are sparse
    if (results.length < 3) {
      try {
        const nomQuery = normalized.includes('ipiales') ? normalized : `${normalized} Ipiales`;
        const nomRes = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(nomQuery)}&countrycodes=co&limit=4&addressdetails=1`,
          { headers: { 'Accept-Language': 'es' } }
        );
        if (nomRes.ok) {
          const nomData = await nomRes.json();
          if (Array.isArray(nomData)) {
            for (const item of nomData) {
              const name = item.name || item.display_name.split(',')[0];
              const secondary = item.display_name.split(',').slice(1, 3).join(',').trim();
              if (!results.some(r => r.mainText.toLowerCase() === name.toLowerCase())) {
                results.push({
                  id: `nom-${item.place_id}`,
                  mainText: name,
                  secondaryText: secondary || 'Ipiales, Nariño',
                  fullAddress: item.display_name,
                  lat: parseFloat(item.lat),
                  lng: parseFloat(item.lon),
                  distanceLabel: formatDistanceLabel(parseFloat(item.lat), parseFloat(item.lon)),
                  source: 'nominatim'
                });
              }
            }
          }
        }
      } catch (err) {
        console.warn("Nominatim autocomplete error:", err);
      }
    }

    setSuggestions(results.slice(0, 8));
    setIsLoadingSuggestions(false);
  }, []);

  // Handle typing in search input with debounce
  const handleSearchInputChange = (text: string) => {
    setSearchQuery(text);
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    const trimmed = text.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setIsLoadingSuggestions(false);
      setShowSuggestions(false);
      return;
    }

    setIsLoadingSuggestions(true);
    setShowSuggestions(true);

    debounceTimeoutRef.current = setTimeout(() => {
      fetchSuggestions(trimmed);
    }, 280);
  };

  // When the client selects a suggested address from the dropdown
  const handleSelectSuggestion = async (suggestion: AddressSuggestion) => {
    setSearchQuery(suggestion.mainText);
    setAddress(suggestion.fullAddress);
    setShowSuggestions(false);

    let targetLat = suggestion.lat;
    let targetLng = suggestion.lng;

    // Resolve Google place coordinates using modern Places API (New) Place.fetchFields() (never legacy PlacesService)
    if ((targetLat === undefined || targetLng === undefined) && suggestion.placePrediction?.toPlace) {
      try {
        const place = suggestion.placePrediction.toPlace();
        await place.fetchFields({
          fields: ['location', 'formattedAddress', 'displayName']
        });
        if (place.location) {
          targetLat = typeof place.location.lat === 'function' ? place.location.lat() : place.location.lat;
          targetLng = typeof place.location.lng === 'function' ? place.location.lng() : place.location.lng;
        }
      } catch (err) {
        // Fall back to server geocoder proxy
      }
    }

    // Secondary fallback: query server geocoder proxy if coordinates still missing
    if (targetLat === undefined || targetLng === undefined) {
      try {
        const sRes = await fetch(`/api/maps/geocode?address=${encodeURIComponent(suggestion.fullAddress)}`);
        if (sRes.ok) {
          const sData = await sRes.json();
          if (sData?.lat && sData?.lng) {
            targetLat = Number(sData.lat);
            targetLng = Number(sData.lng);
          }
        }
      } catch (err) {
        console.warn("Server geocode fallback error:", err);
      }
    }

    // Direct fallback geocode if coordinates still missing
    if (targetLat === undefined || targetLng === undefined) {
      try {
        const nomRes = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(suggestion.fullAddress)}&limit=1`
        );
        if (nomRes.ok) {
          const nomData = await nomRes.json();
          if (nomData && nomData[0]) {
            targetLat = parseFloat(nomData[0].lat);
            targetLng = parseFloat(nomData[0].lon);
          }
        }
      } catch (err) {
        console.warn("Fallback geocode error:", err);
      }
    }

    if (targetLat !== undefined && targetLng !== undefined && !isNaN(targetLat) && !isNaN(targetLng)) {
      handleLocationUpdate(targetLat, targetLng);
    }
  };

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  // Forward geocode address search query and open map modal
  const handleSearchAddress = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setShowSuggestions(false);

    // If suggestions exist and match query, pick the top suggestion
    if (suggestions.length > 0 && searchQuery.trim()) {
      handleSelectSuggestion(suggestions[0]);
      setShowMapModal(true);
      return;
    }

    const rawQuery = (searchQuery || address).trim();
    if (!rawQuery) {
      if (!isWithinIpiales(lat, lng)) {
        handleCenterIpiales();
      }
      setShowMapModal(true);
      return;
    }

    // Always ensure query is searched within Ipiales, Nariño, Colombia
    const query = rawQuery.toLowerCase().includes('ipiales')
      ? rawQuery
      : `${rawQuery}, Ipiales, Nariño, Colombia`;

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
          if (isWithinIpiales(newLat, newLng)) {
            handleLocationUpdate(newLat, newLng);
            setAddress(data.formatted_address || query);
          } else {
            handleCenterIpiales();
          }
          setShowMapModal(true);
          return;
        }
      }

      // Nominatim search fallback restricted to Colombia & Ipiales bounding box
      const nomRes = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=co&viewbox=-77.75,0.95,-77.50,0.70&limit=1`,
        { headers: { 'Accept-Language': 'es' } }
      );
      if (nomRes.ok) {
        const nomData = await nomRes.json();
        if (Array.isArray(nomData) && nomData.length > 0) {
          const newLat = parseFloat(nomData[0].lat);
          const newLng = parseFloat(nomData[0].lon);
          if (isWithinIpiales(newLat, newLng)) {
            handleLocationUpdate(newLat, newLng);
            setAddress(nomData[0].display_name);
          } else {
            handleCenterIpiales();
          }
        } else {
          handleCenterIpiales();
        }
      }
    } catch (err) {
      console.warn("Address search error:", err);
      handleCenterIpiales();
    } finally {
      setIsSearching(false);
      setShowMapModal(true);
    }
  };

  // Update position callback with strict Ipiales boundary check
  const handleLocationUpdate = useCallback((newLat: number, newLng: number) => {
    const effectiveLat = isWithinIpiales(newLat, newLng) ? newLat : DEFAULT_LAT;
    const effectiveLng = isWithinIpiales(newLat, newLng) ? newLng : DEFAULT_LNG;

    setLat(effectiveLat);
    setLng(effectiveLng);
    setLatInput(String(effectiveLat.toFixed(6)));
    setLngInput(String(effectiveLng.toFixed(6)));
    reverseGeocode(effectiveLat, effectiveLng);

    if (googleMapRef.current) {
      googleMapRef.current.panTo({ lat: effectiveLat, lng: effectiveLng });
    }

    if (leafletMapRef.current && leafletContainerRef.current) {
      const H = leafletContainerRef.current.clientHeight || 500;
      const zoom = leafletMapRef.current.getZoom() || 16;
      const targetWorld = leafletMapRef.current.project([effectiveLat, effectiveLng], zoom);
      const centerWorld = L.point(targetWorld.x, targetWorld.y + (H * 0.08));
      leafletMapRef.current.panTo(leafletMapRef.current.unproject(centerWorld, zoom));
    }
  }, [reverseGeocode]);

  // Selection for one of the 4 default Ipiales reference addresses
  const handleSelectDefaultAddress = useCallback((item: DefaultIpialesAddress) => {
    setLat(item.lat);
    setLng(item.lng);
    setLatInput(String(item.lat.toFixed(6)));
    setLngInput(String(item.lng.toFixed(6)));
    setAddress(item.address);
    latestGeocodeIdRef.current++;
    setIsGeocoding(false);

    if (googleMapRef.current) {
      googleMapRef.current.panTo({ lat: item.lat, lng: item.lng });
      googleMapRef.current.setZoom(16);
    }

    if (leafletMapRef.current && leafletContainerRef.current) {
      const H = leafletContainerRef.current.clientHeight || 500;
      const zoom = 16;
      const targetWorld = leafletMapRef.current.project([item.lat, item.lng], zoom);
      const centerWorld = L.point(targetWorld.x, targetWorld.y + (H * 0.08));
      leafletMapRef.current.setView(leafletMapRef.current.unproject(centerWorld, zoom), zoom);
    }
  }, []);

  // Explicit action to immediately snap and center the map on Ipiales
  const handleCenterIpiales = useCallback(() => {
    const defaultCenter = IPIALES_DEFAULT_ADDRESSES[0];
    setLat(defaultCenter.lat);
    setLng(defaultCenter.lng);
    setLatInput(String(defaultCenter.lat.toFixed(6)));
    setLngInput(String(defaultCenter.lng.toFixed(6)));
    setAddress(defaultCenter.address);
    latestGeocodeIdRef.current++;
    setIsGeocoding(false);
    
    if (googleMapRef.current) {
      googleMapRef.current.panTo({ lat: defaultCenter.lat, lng: defaultCenter.lng });
      googleMapRef.current.setZoom(16);
    } else if (leafletMapRef.current && leafletContainerRef.current) {
      const H = leafletContainerRef.current.clientHeight || 500;
      const zoom = 16;
      const targetWorld = leafletMapRef.current.project([defaultCenter.lat, defaultCenter.lng], zoom);
      const centerWorld = L.point(targetWorld.x, targetWorld.y + (H * 0.08));
      leafletMapRef.current.setView(leafletMapRef.current.unproject(centerWorld, zoom), zoom);
    }
  }, []);

  // Leaflet backup initialization (when mapProvider === 'leaflet' or no Google Maps key)
  const isUsingLeaflet = mapProvider === 'leaflet' || !googleMapsApiKey;

  useEffect(() => {
    if (!isOpen || !showMapModal || !isUsingLeaflet || !leafletContainerRef.current) return;

    const timer = setTimeout(() => {
      if (!leafletContainerRef.current) return;

      if (!leafletMapRef.current) {
        const map = L.map(leafletContainerRef.current, {
          zoomControl: false
        });

        // inDrive-style dark map tiles
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
          maxZoom: 19,
          attribution: '© OpenStreetMap, © CARTO',
          subdomains: 'abcd'
        }).addTo(map);

        const H = leafletContainerRef.current.clientHeight || 500;
        const zoom = 16;
        const safeLat = isWithinIpiales(lat, lng) ? lat : DEFAULT_LAT;
        const safeLng = isWithinIpiales(lat, lng) ? lng : DEFAULT_LNG;
        const targetWorld = map.project([safeLat, safeLng], zoom);
        const centerWorld = L.point(targetWorld.x, targetWorld.y + (H * 0.05));
        map.setView(map.unproject(centerWorld, zoom), zoom);

        map.on('movestart', () => {
          setIsMapMoving(true);
        });

        map.on('moveend', () => {
          setIsMapMoving(false);
          if (!leafletContainerRef.current) return;
          const currW = leafletContainerRef.current.clientWidth;
          const currH = leafletContainerRef.current.clientHeight;
          const pinPoint = L.point(currW / 2, currH * 0.45);
          const latlng = map.containerPointToLatLng(pinPoint);
          if (latlng && !isNaN(latlng.lat) && !isNaN(latlng.lng)) {
            setLat(latlng.lat);
            setLng(latlng.lng);
            setLatInput(latlng.lat.toFixed(6));
            setLngInput(latlng.lng.toFixed(6));
            reverseGeocode(latlng.lat, latlng.lng);
          }
        });

        map.on('click', (e: L.LeafletMouseEvent) => {
          if (!leafletContainerRef.current) return;
          const currH = leafletContainerRef.current.clientHeight;
          const currZoom = map.getZoom();
          const clickedWorld = map.project(e.latlng, currZoom);
          const centerWorld = L.point(clickedWorld.x, clickedWorld.y + (currH * 0.05));
          map.panTo(map.unproject(centerWorld, currZoom));
        });

        leafletMapRef.current = map;
      } else {
        leafletMapRef.current.invalidateSize();
        const H = leafletContainerRef.current.clientHeight || 500;
        const zoom = leafletMapRef.current.getZoom() || 16;
        const targetWorld = leafletMapRef.current.project([lat, lng], zoom);
        const centerWorld = L.point(targetWorld.x, targetWorld.y + (H * 0.05));
        leafletMapRef.current.setView(leafletMapRef.current.unproject(centerWorld, zoom), zoom);
      }
    }, 150);

    return () => {
      clearTimeout(timer);
    };
  }, [isOpen, showMapModal, isUsingLeaflet, reverseGeocode]);

  // Clean up Leaflet on modal close or map modal close
  useEffect(() => {
    if ((!isOpen || !showMapModal) && leafletMapRef.current) {
      leafletMapRef.current.remove();
      leafletMapRef.current = null;
      leafletMarkerRef.current = null;
    }
  }, [isOpen, showMapModal]);

  // GPS Device Geolocation with safety check to keep map in Ipiales
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
        if (!isWithinIpiales(latitude, longitude)) {
          // If GPS returns a location outside Ipiales (e.g. roaming, VPN, simulator or remote location)
          handleCenterIpiales();
          alert("Tu señal GPS detectó una ubicación fuera de Ipiales. Hemos mantenido el mapa centrado en Ipiales, Nariño para tu pedido.");
          return;
        }
        handleLocationUpdate(latitude, longitude);
      },
      () => {
        setIsLocating(false);
        handleCenterIpiales();
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

  // Compute suggestions and popular places matching inDrive visual reference
  const displayList: AddressSuggestion[] = suggestions.length > 0 
    ? suggestions 
    : searchQuery.trim().length >= 2 
      ? LOCAL_IPIALES_PLACES
          .filter(item => {
            const normalized = normalizeSearchQuery(searchQuery);
            return item.name.toLowerCase().includes(normalized) || 
                   item.keywords.some(k => k.includes(normalized));
          })
          .map(item => ({
            id: `local-${item.name}`,
            mainText: item.name,
            secondaryText: item.secondary,
            fullAddress: `${item.name}, ${item.secondary}`,
            lat: item.lat,
            lng: item.lng,
            distanceLabel: item.distanceLabel,
            source: 'local' as const
          }))
      : LOCAL_IPIALES_PLACES.map(item => ({
          id: `default-${item.name}`,
          mainText: item.name,
          secondaryText: item.secondary,
          fullAddress: `${item.name}, ${item.secondary}`,
          lat: item.lat,
          lng: item.lng,
          distanceLabel: item.distanceLabel,
          source: 'local' as const
        }));

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="bg-[#141416] border border-neutral-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Modal Header: Centered Title and Round Close Button */}
        <div className="px-5 py-3.5 border-b border-neutral-800/80 flex items-center justify-between bg-[#141416]">
          <div className="w-8" />
          <h3 className="text-base sm:text-lg font-bold text-white text-center">
            Introduce tu dirección
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-neutral-800 hover:bg-neutral-700 text-gray-300 hover:text-white flex items-center justify-center transition active:scale-95 cursor-pointer"
            title="Cerrar"
          >
            <X className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>

        {/* inDrive-Style Search Bar with White Border */}
        <div className="p-3.5 sm:p-4 border-b border-neutral-800/60 bg-[#141416]">
          <div className="rounded-2xl border-2 border-white bg-neutral-900/95 px-3.5 py-2.5 flex items-center gap-3 shadow-md focus-within:ring-2 focus-within:ring-white/30 transition">
            <Search className="w-5 h-5 text-gray-300 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-[11px] text-gray-400 font-medium block leading-none mb-1">
                De
              </span>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchInputChange(e.target.value)}
                placeholder="barrio o calle..."
                className="w-full bg-transparent text-white font-bold text-sm sm:text-base outline-none placeholder:text-gray-500 placeholder:font-normal"
              />
            </div>

            {searchQuery ? (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSuggestions([]);
                }}
                className="w-6 h-6 rounded-full bg-neutral-800 hover:bg-neutral-700 text-gray-400 hover:text-white flex items-center justify-center shrink-0 transition cursor-pointer"
                title="Borrar"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : null}

            {/* Map Tile Button with corporate red accent */}
            <button
              type="button"
              onClick={() => setShowMapModal(true)}
              title="Elegir en el mapa"
              className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 hover:border-[#E63946] flex items-center justify-center shrink-0 cursor-pointer transition active:scale-95 relative overflow-hidden group shadow"
            >
              <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:5px_5px]" />
              <div className="w-6 h-6 rounded-full bg-[#E63946]/20 border border-[#E63946]/60 flex items-center justify-center relative z-10 group-hover:scale-110 transition-transform">
                <MapPin className="w-3.5 h-3.5 text-[#E63946] fill-[#E63946]/40" />
              </div>
            </button>
          </div>
        </div>

        {/* Modal Body: Places & Suggestions List */}
        <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-2 divide-y divide-neutral-800/40">
          
          {/* Quick GPS Option */}
          <button
            type="button"
            onClick={handleUseCurrentLocation}
            disabled={isLocating}
            className="w-full py-3 px-2 rounded-xl flex items-center gap-3 text-[#E63946] hover:text-[#D62839] hover:bg-neutral-800/50 active:bg-neutral-800/80 transition cursor-pointer font-bold text-xs sm:text-sm"
          >
            {isLocating ? (
              <Loader2 className="w-4 h-4 animate-spin text-[#E63946] shrink-0" />
            ) : (
              <Navigation className="w-4 h-4 text-[#E63946] shrink-0" />
            )}
            <span>{isLocating ? 'Obteniendo mi GPS...' : 'Usar mi ubicación actual (GPS)'}</span>
          </button>

          {isLoadingSuggestions ? (
            <div className="py-8 flex items-center justify-center gap-2 text-xs text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin text-[#E63946]" />
              <span>Buscando sugerencias...</span>
            </div>
          ) : displayList.length > 0 ? (
            displayList.map((item) => {
              const isSelected = 
                (address && address.toLowerCase().includes(item.mainText.toLowerCase())) ||
                (item.lat && Math.abs(lat - item.lat) < 0.0002 && Math.abs(lng - item.lng) < 0.0002);

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectSuggestion(item)}
                  className={`w-full py-3.5 px-2.5 rounded-xl flex items-center justify-between gap-3 text-left transition cursor-pointer ${
                    isSelected 
                      ? 'bg-neutral-800/80 text-white' 
                      : 'hover:bg-neutral-800/40 active:bg-neutral-800/60 text-gray-300'
                  }`}
                >
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    <MapPin className={`w-5 h-5 shrink-0 mt-0.5 ${isSelected ? 'text-[#E63946]' : 'text-gray-400'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate leading-snug">
                        {renderHighlightedText(item.mainText, searchQuery)}
                      </p>
                      <p className="text-xs text-gray-400 truncate mt-0.5">
                        {item.secondaryText}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs sm:text-sm text-gray-400 font-normal shrink-0 ml-2">
                    {item.distanceLabel || '1,5 km'}
                  </span>
                </button>
              );
            })
          ) : (
            <div className="py-8 text-center text-xs text-gray-400">
              No se encontraron lugares para esa búsqueda.
            </div>
          )}

        </div>

        {/* Modal Footer: Full Width Confirm Button with corporate color */}
        <div className="p-4 border-t border-neutral-800/80 bg-[#141416] flex items-center justify-center">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isConfirming}
            className="w-full h-12 rounded-2xl bg-[#E63946] hover:bg-[#D62839] active:bg-[#B71C1C] text-white text-sm font-black flex items-center justify-center gap-2 shadow-lg shadow-[#E63946]/30 transition active:scale-[0.98] cursor-pointer disabled:opacity-50"
          >
            {isConfirming ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin stroke-[3] text-white" />
                <span>Confirmando...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4 stroke-[3] text-white" />
                <span>Confirmar Ubicación</span>
              </>
            )}
          </button>
        </div>

      </div>

      {/* Interactive Map Modal - inDrive Design from Screenshot */}
      {showMapModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in select-none">
          <div className="relative w-full h-full sm:max-w-md sm:max-h-[92vh] sm:rounded-3xl overflow-hidden bg-[#141416] flex flex-col shadow-2xl sm:border sm:border-neutral-800">
            
            {/* Top-Left Floating Circular Back Button */}
            <button
              type="button"
              onClick={() => setShowMapModal(false)}
              className="absolute top-4 left-4 z-[500] w-12 h-12 rounded-full bg-black/70 hover:bg-black/90 active:scale-95 text-white flex items-center justify-center shadow-2xl backdrop-blur-md border border-white/10 transition cursor-pointer"
              title="Volver"
            >
              <ArrowLeft className="w-6 h-6 stroke-[2.5]" />
            </button>

            {/* Interactive Map filling 100% of the modal */}
            <div className="relative flex-1 w-full h-full bg-[#18181b] overflow-hidden touch-manipulation">
              {mapProvider === 'google' && googleMapsApiKey ? (
                <APIProvider apiKey={googleMapsApiKey} libraries={['marker']}>
                  <Map
                    defaultCenter={isWithinIpiales(lat, lng) ? { lat, lng } : { lat: DEFAULT_LAT, lng: DEFAULT_LNG }}
                    defaultZoom={16}
                    gestureHandling="greedy"
                    disableDefaultUI={true}
                    zoomControl={false}
                    scrollwheel={true}
                    disableDoubleClickZoom={false}
                    internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                    style={{ width: '100%', height: '100%' }}
                    styles={DARK_MAP_STYLES}
                    onClick={(e) => {
                      if (e.detail?.latLng && googleMapRef.current) {
                        const clickedLat = typeof e.detail.latLng.lat === 'function' ? e.detail.latLng.lat() : Number(e.detail.latLng.lat);
                        const clickedLng = typeof e.detail.latLng.lng === 'function' ? e.detail.latLng.lng() : Number(e.detail.latLng.lng);
                        if (!isNaN(clickedLat) && !isNaN(clickedLng)) {
                          googleMapRef.current.panTo({ lat: clickedLat, lng: clickedLng });
                        }
                      }
                    }}
                  >
                    <GoogleMapController 
                      targetLat={lat} 
                      targetLng={lng} 
                      onMapReady={handleMapReady} 
                      onLocationChange={(newLat, newLng) => {
                        setLat(newLat);
                        setLng(newLng);
                        setLatInput(newLat.toFixed(6));
                        setLngInput(newLng.toFixed(6));
                        reverseGeocode(newLat, newLng);
                      }}
                      onMovementChange={setIsMapMoving}
                    />
                  </Map>
                </APIProvider>
              ) : (
                <div ref={leafletContainerRef} className="w-full h-full z-10" />
              )}

              {/* FIXED CENTER-UP PIN & CALLOUT BUBBLE */}
              <div 
                className="absolute left-1/2 -translate-x-1/2 pointer-events-none z-[450] select-none"
                style={{ top: '45%' }}
              >
                {/* Ground target shadow dot at center */}
                <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none">
                  <div 
                    className={`rounded-full bg-black/60 blur-[1px] transition-all duration-200 ${
                      isMapMoving ? 'w-4 h-1.5 opacity-35' : 'w-5 h-2 opacity-75'
                    }`} 
                  />
                </div>

                {/* Floating Pin & Bubble: moves up by exactly 4px when moving, returns to 0px when stationary */}
                <div 
                  className="absolute left-1/2 -translate-x-1/2 bottom-0 flex flex-col items-center transition-transform duration-200 ease-out origin-bottom drop-shadow-[0_10px_14px_rgba(0,0,0,0.45)]"
                  style={{
                    transform: isMapMoving ? 'translateY(-4px)' : 'translateY(0px)',
                  }}
                >
                  {/* White Address Tooltip Pill from inDrive screenshot */}
                  <div className="mb-2 px-4 py-2 rounded-2xl bg-white text-black font-extrabold text-sm sm:text-base shadow-2xl border border-black/10 flex items-center justify-center max-w-[270px] truncate">
                    {isGeocoding ? (
                      <div className="flex items-center gap-2 text-xs text-gray-700 font-bold py-0.5">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
                        <span>Detectando...</span>
                      </div>
                    ) : (
                      <span className="truncate text-black font-black">
                        {address ? address.split(',')[0].trim() : 'Cl. 24 C # 13-90'}
                      </span>
                    )}
                  </div>

                  {/* inDrive Location Icon (White rounded square with user figure) */}
                  <div className="w-11 h-11 rounded-2xl bg-white text-black shadow-xl flex items-center justify-center border border-gray-200 mb-1">
                    <svg className="w-6 h-6 text-black" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="7" r="3.2" />
                      <path d="M12 12.5c-4.2 0-6.5 2.5-6.5 5.5V20h13v-2c0-3-2.3-5.5-6.5-5.5z" />
                    </svg>
                  </div>

                  {/* Target ring/dot centered exactly on ground coordinate */}
                  <div 
                    className="w-4 h-4 rounded-full border-[3px] border-white bg-black shadow-lg" 
                    style={{ marginBottom: '-8px' }}
                  />
                </div>
              </div>

              {/* Floating Bottom-Right GPS Button from inDrive screenshot */}
              <button
                type="button"
                onClick={handleUseCurrentLocation}
                disabled={isLocating}
                className="absolute bottom-24 right-4 z-[500] w-12 h-12 rounded-full bg-black/75 hover:bg-black/90 active:scale-95 text-white flex items-center justify-center shadow-2xl backdrop-blur-md border border-white/10 transition cursor-pointer disabled:opacity-50"
                title="Mi ubicación (GPS)"
              >
                {isLocating ? (
                  <Loader2 className="w-5 h-5 animate-spin text-[#E63946]" />
                ) : (
                  <Navigation className="w-5 h-5 text-white fill-white -rotate-45" />
                )}
              </button>

              {/* Floating Full-Width "Hecho" Button with corporate color */}
              <div className="absolute bottom-4 inset-x-4 z-[500]">
                <button
                  type="button"
                  onClick={async () => {
                    await handleConfirm();
                    setShowMapModal(false);
                  }}
                  disabled={isConfirming}
                  className="w-full h-14 rounded-2xl bg-[#E63946] hover:bg-[#D62839] active:bg-[#B71C1C] text-white text-lg font-black tracking-wide flex items-center justify-center gap-2 shadow-2xl shadow-[#E63946]/40 transition cursor-pointer disabled:opacity-50"
                >
                  {isConfirming ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin text-white" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <span>Hecho</span>
                  )}
                </button>
              </div>

            </div>

          </div>
        </div>
      )}

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


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
    address: 'Calle 24 # 5-42, Barrio El Manzano, Ipiales, Nariño',
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

// Key for locally storing searched/selected address history
export const HISTORY_STORAGE_KEY = 'ryyco_address_history';

export interface AddressHistoryItem {
  id: string;
  name: string; // nombre o dirección buscada
  secondary?: string; // dirección completa si está disponible
  fullAddress: string;
  lat?: number;
  lng?: number;
  timestamp: number;
}

// Retrieve stored address history ordered from newest to oldest
export const getStoredAddressHistory = (): AddressHistoryItem[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item: any) => item && typeof item === 'object' && (item.name || item.fullAddress))
      .sort((a: AddressHistoryItem, b: AddressHistoryItem) => (b.timestamp || 0) - (a.timestamp || 0));
  } catch {
    return [];
  }
};

// Save a searched or selected address to local storage
export const saveAddressToHistory = (item: {
  name: string;
  secondary?: string;
  fullAddress: string;
  lat?: number;
  lng?: number;
}): AddressHistoryItem[] => {
  if (typeof window === 'undefined') return [];
  try {
    const name = item.name.trim();
    const fullAddress = (item.fullAddress || name).trim();
    if (!name && !fullAddress) return getStoredAddressHistory();

    const currentHistory = getStoredAddressHistory();
    const existingIndex = currentHistory.findIndex(
      h => h.fullAddress.trim().toLowerCase() === fullAddress.toLowerCase() ||
           h.name.trim().toLowerCase() === name.toLowerCase()
    );

    const newItem: AddressHistoryItem = {
      id: existingIndex >= 0 ? currentHistory[existingIndex].id : `hist-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: name,
      secondary: item.secondary?.trim() || (fullAddress !== name ? fullAddress : undefined),
      fullAddress: fullAddress,
      lat: item.lat ?? (existingIndex >= 0 ? currentHistory[existingIndex].lat : undefined),
      lng: item.lng ?? (existingIndex >= 0 ? currentHistory[existingIndex].lng : undefined),
      timestamp: Date.now()
    };

    let updatedHistory: AddressHistoryItem[];
    if (existingIndex >= 0) {
      currentHistory.splice(existingIndex, 1);
      updatedHistory = [newItem, ...currentHistory];
    } else {
      updatedHistory = [newItem, ...currentHistory];
    }

    // Keep up to 30 history records
    updatedHistory = updatedHistory.slice(0, 30);
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updatedHistory));
    return updatedHistory;
  } catch (err) {
    console.warn('Error saving address history:', err);
    return getStoredAddressHistory();
  }
};

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

// Map controller that keeps map center and central pin 100% in sync without offset errors
const GoogleMapController: React.FC<{ 
  targetLat: number; 
  targetLng: number;
  onMapReady?: (map: google.maps.Map | null) => void;
  onLocationChange: (lat: number, lng: number) => void;
  onRealtimeMove?: (lat: number, lng: number) => void;
  onMovementStart: () => void;
}> = ({ targetLat, targetLng, onMapReady, onLocationChange, onRealtimeMove, onMovementStart }) => {
  const map = useMap();
  const isDraggingRef = useRef<boolean>(false);
  const lastReportedCenterRef = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!map) return;
    if (onMapReady) {
      onMapReady(map);
    }

    // Always ensure initial Google Map view is centered in Ipiales, Nariño
    const initialCenter = map.getCenter();
    if (!initialCenter || !isWithinIpiales(initialCenter.lat(), initialCenter.lng())) {
      map.panTo({ lat: DEFAULT_LAT, lng: DEFAULT_LNG });
    }

    const dragStartL = map.addListener('dragstart', () => {
      isDraggingRef.current = true;
      onMovementStart();
    });

    const centerChangedL = map.addListener('center_changed', () => {
      onMovementStart();
      const center = map.getCenter();
      if (center) {
        const cLat = center.lat();
        const cLng = center.lng();
        if (!isNaN(cLat) && !isNaN(cLng)) {
          onRealtimeMove?.(cLat, cLng);
        }
      }
    });

    const dragEndL = map.addListener('dragend', () => {
      isDraggingRef.current = false;
    });

    const idleL = map.addListener('idle', () => {
      isDraggingRef.current = false;
      const center = map.getCenter();
      if (center) {
        const cLat = center.lat();
        const cLng = center.lng();
        if (!isNaN(cLat) && !isNaN(cLng)) {
          lastReportedCenterRef.current = { lat: cLat, lng: cLng };
          onLocationChange(cLat, cLng);
        }
      }
    });

    return () => {
      google.maps.event.removeListener(dragStartL);
      google.maps.event.removeListener(centerChangedL);
      google.maps.event.removeListener(dragEndL);
      google.maps.event.removeListener(idleL);
    };
  }, [map, onMapReady, onLocationChange, onRealtimeMove, onMovementStart]);

  useEffect(() => {
    if (!map || isNaN(targetLat) || isNaN(targetLng) || isDraggingRef.current) return;
    const safeLat = isWithinIpiales(targetLat, targetLng) ? targetLat : DEFAULT_LAT;
    const safeLng = isWithinIpiales(targetLat, targetLng) ? targetLng : DEFAULT_LNG;

    const center = map.getCenter();
    if (center) {
      const dLat = Math.abs(center.lat() - safeLat);
      const dLng = Math.abs(center.lng() - safeLng);
      if (dLat < 0.000005 && dLng < 0.000005) {
        return;
      }
    }
    const last = lastReportedCenterRef.current;
    if (last && Math.abs(last.lat - safeLat) < 0.000005 && Math.abs(last.lng - safeLng) < 0.000005) {
      return;
    }
    lastReportedCenterRef.current = { lat: safeLat, lng: safeLng };
    map.panTo({ lat: safeLat, lng: safeLng });
  }, [map, targetLat, targetLng]);

  return null;
};

// Helper to format or calculate Colombian street name with house number in Ipiales/Colombia
export const formatColombianStreetWithHouseNumber = (
  streetName: string, 
  houseNumber: string | undefined, 
  latitude: number, 
  longitude: number
): string => {
  if (!streetName || !streetName.trim()) {
    streetName = 'Calle';
  }
  const cleanStreet = streetName.trim();

  // If houseNumber already provided (e.g. from Google or OSM), format as "Street #HouseNumber"
  if (houseNumber && houseNumber.trim()) {
    const cleanNum = houseNumber.replace(/^[#№No\.]+\s*/i, '').trim();
    if (cleanNum) {
      return `${cleanStreet} #${cleanNum}`;
    }
  }

  // If streetName already has a house/door number (e.g. "Calle 24 # 13-40" or "Carrera 6 # 8-20")
  if (/#\s*\d+/i.test(cleanStreet) || /\b(n[o°]\.?|num)\s*\d+/i.test(cleanStreet)) {
    return cleanStreet;
  }

  const isCalle = /\b(calle|cll|diagonal|transversal|cl)\b/i.test(cleanStreet);
  const isCarrera = /\b(carrera|cra|kr|kfe|cr)\b/i.test(cleanStreet);

  if (isCalle) {
    // Calles run East-West; Carreras cross them (longitude becomes more negative moving West from -77.6330)
    const baseLng = -77.6330;
    const diff = Math.max(0, baseLng - longitude);
    const carreraCross = Math.max(1, Math.min(26, Math.round(1 + (diff / 0.00135))));
    const fraction = (diff / 0.00135) - Math.floor(diff / 0.00135);
    const rawPlaca = Math.floor(fraction * 82) + 12;
    const isEven = Math.round(Math.abs(latitude) * 100000) % 2 === 0;
    const door = isEven ? rawPlaca - (rawPlaca % 2) : rawPlaca - (rawPlaca % 2) + 1;
    const plateStr = door < 10 ? `0${door}` : `${door}`;
    return `${cleanStreet} #${carreraCross}-${plateStr}`;
  } else if (isCarrera) {
    // Carreras run North-South; Calles cross them (latitude increases moving North from 0.8150)
    const baseLat = 0.8150;
    const diff = Math.max(0, latitude - baseLat);
    const calleCross = Math.max(1, Math.min(36, Math.round(4 + (diff / 0.00092))));
    const fraction = (diff / 0.00092) - Math.floor(diff / 0.00092);
    const rawPlaca = Math.floor(fraction * 82) + 10;
    const isEven = Math.round(Math.abs(longitude) * 100000) % 2 === 0;
    const door = isEven ? rawPlaca - (rawPlaca % 2) : rawPlaca - (rawPlaca % 2) + 1;
    const plateStr = door < 10 ? `0${door}` : `${door}`;
    return `${cleanStreet} #${calleCross}-${plateStr}`;
  } else {
    const baseLng = -77.6330;
    const diff = Math.max(0, baseLng - longitude);
    const crossNum = Math.max(1, Math.min(26, Math.round(1 + (diff / 0.00135))));
    const fraction = (diff / 0.00135) - Math.floor(diff / 0.00135);
    const door = Math.floor(fraction * 80) + 14;
    return `${cleanStreet} #${crossNum}-${door < 10 ? '0' + door : door}`;
  }
};

export const formatBalloonAddress = (addr: string, latitude: number, longitude: number): string => {
  if (!addr || !addr.trim()) {
    return formatColombianStreetWithHouseNumber('Calle', undefined, latitude, longitude);
  }
  return addr.trim();
};

// Helper to ensure any address suggestion or secondary line displays both the street and house number
export const ensureSecondaryHasHouseNumber = (
  secondary: string,
  latitude?: number,
  longitude?: number
): string => {
  const effectiveLat = latitude !== undefined && !isNaN(latitude) ? latitude : DEFAULT_LAT;
  const effectiveLng = longitude !== undefined && !isNaN(longitude) ? longitude : DEFAULT_LNG;

  if (!secondary || !secondary.trim()) {
    const calculated = formatColombianStreetWithHouseNumber('Calle', undefined, effectiveLat, effectiveLng);
    return `${calculated}, Ipiales, Nariño`;
  }

  // If already contains house number (e.g. # 10-24, #10-24, No. 10, N° 10)
  if (/#\s*\d+|no\.?\s*\d+|n°\s*\d+/i.test(secondary)) {
    return secondary;
  }

  const parts = secondary.split(',').map(s => s.trim());
  const first = parts[0];
  const isStreetName = /\b(calle|carrera|cra|cll|kr|diagonal|transversal|avenida|av|cl)\b/i.test(first);

  if (isStreetName) {
    const streetWithNum = formatColombianStreetWithHouseNumber(first, undefined, effectiveLat, effectiveLng);
    const rest = parts.slice(1).join(', ');
    return rest ? `${streetWithNum}, ${rest}` : streetWithNum;
  } else {
    // If the secondary text is just "Ipiales, Nariño" or similar without a street, compute street with house number
    const streetWithNum = formatColombianStreetWithHouseNumber('Calle', undefined, effectiveLat, effectiveLng);
    return `${streetWithNum}, ${secondary}`;
  }
};

export interface ParsedColombianAddress {
  formattedTitle: string;
  secondary: string;
  fullAddress: string;
  lat: number;
  lng: number;
}

// Deterministic Colombian Address Parser & Geocoder for Ipiales
// Resolves queries like "calle 24b # 13-37", "cll 24b # 13-37", "cra 6 # 14-30", "carrera 5 # 10-20", etc.
export const parseColombianAddressToCoords = (query: string): ParsedColombianAddress | null => {
  if (!query || typeof query !== 'string') return null;
  const trimmed = query.trim();
  if (trimmed.length < 2) return null;

  // Clean and normalize query
  const clean = trimmed
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Pattern matching:
  // Main via: Calle, Carrera, Diagonal, Transversal, Avenida (with abbreviations cll, cl, cra, cr, kr, av, diag, tv, etc.)
  // Main number + optional letter: e.g. "24b", "24 b", "24"
  // Cross separator & via: e.g. "# 13", "#13", "no. 13", "n° 13", "con carrera 13", "13"
  // Door/plate number: e.g. "-37", " 37", "- 37"
  const regex = /^(calle|cll|cl|c\.|carrera|cra|cr|kr|k\.|avenida|av|av\.|diagonal|diag|dg|transversal|trans|tv)\s*([0-9]{1,3}\s*[a-zA-Z]?)(?:\s*(?:[#№no\.\s°]+|con\s+(?:carrera|calle|cra|cll|cr|cl)?\s*|\s+)\s*([0-9]{1,3}\s*[a-zA-Z]?)(?:[\s\-\#]+([0-9]{1,4}))?)?/i;

  const match = clean.match(regex);
  if (!match) {
    // Check for "Avenida Panamericana" or "Panamericana" special case
    if (/panamericana/i.test(clean)) {
      const numMatch = clean.match(/([0-9]{1,3})[\s\-\#]+([0-9]{1,3})/);
      const cross = numMatch ? parseInt(numMatch[1], 10) : 15;
      const door = numMatch ? parseInt(numMatch[2], 10) : 40;
      const doorPad = door < 10 ? `0${door}` : `${door}`;
      return {
        formattedTitle: `Avenida Panamericana #${cross}-${doorPad}`,
        secondary: 'Ipiales, Nariño',
        fullAddress: `Avenida Panamericana #${cross}-${doorPad}, Ipiales, Nariño`,
        lat: 0.8380,
        lng: -77.6350
      };
    }
    return null;
  }

  const rawType = match[1].toLowerCase();
  const rawMain = match[2].replace(/\s+/g, '').toUpperCase();
  const rawCross = match[3] ? match[3].replace(/\s+/g, '').toUpperCase() : '';
  const rawDoor = match[4] ? parseInt(match[4], 10) : undefined;

  let mainType = 'Calle';
  let isCalle = true;
  if (/^(carrera|cra|cr|kr|k\.)/i.test(rawType)) {
    mainType = 'Carrera';
    isCalle = false;
  } else if (/^(avenida|av|av\.)/i.test(rawType)) {
    mainType = 'Avenida';
    isCalle = true;
  } else if (/^(diagonal|diag|dg)/i.test(rawType)) {
    mainType = 'Diagonal';
    isCalle = true;
  } else if (/^(transversal|trans|tv)/i.test(rawType)) {
    mainType = 'Transversal';
    isCalle = false;
  }

  // Construct standard Colombian address title (e.g., "Calle 24B # 13-37")
  let formattedTitle = `${mainType} ${rawMain}`;
  if (rawCross) {
    formattedTitle += ` # ${rawCross}`;
    if (rawDoor !== undefined && !isNaN(rawDoor)) {
      const doorPad = rawDoor < 10 ? `0${rawDoor}` : `${rawDoor}`;
      formattedTitle += `-${doorPad}`;
    }
  }

  // Calculate coordinates aligned with Ipiales urban street grid
  // Main number value (e.g., "24B" -> 24.66)
  const mainNumOnly = parseInt(rawMain.replace(/[^0-9]/g, ''), 10) || 10;
  const mainLetter = (rawMain.match(/[A-Z]/i) || [''])[0].toUpperCase();
  const mainLetterBonus = mainLetter === 'A' ? 0.33 : mainLetter === 'B' ? 0.66 : mainLetter === 'C' ? 0.9 : 0;
  const mainEffective = mainNumOnly + mainLetterBonus;

  // Cross street value (e.g., "13" -> 13)
  const crossNumOnly = rawCross ? (parseInt(rawCross.replace(/[^0-9]/g, ''), 10) || 6) : 6;
  const crossLetter = rawCross ? (rawCross.match(/[A-Z]/i) || [''])[0].toUpperCase() : '';
  const crossLetterBonus = crossLetter === 'A' ? 0.33 : crossLetter === 'B' ? 0.66 : crossLetter === 'C' ? 0.9 : 0;
  const crossEffective = crossNumOnly + crossLetterBonus;

  // Door position ratio along the block (0.05 to 0.95)
  const doorFraction = rawDoor !== undefined && !isNaN(rawDoor) 
    ? Math.min(0.95, Math.max(0.05, rawDoor / 100)) 
    : 0.45;

  let lat = DEFAULT_LAT;
  let lng = DEFAULT_LNG;

  if (isCalle) {
    // Calles in Ipiales run East-West; Calle 14 is the city center (lat ~0.8300)
    // Calle numbers increase towards the North (+0.00055 per Calle)
    const calleDelta = (mainEffective - 14) * 0.00055;
    lat = 0.8300 + calleDelta;

    // Crossing Carreras run North-South; Carrera 6 is center (lng ~-77.6450)
    // Carrera numbers increase towards the West (more negative: -0.00095 per Carrera)
    const craDelta = (crossEffective - 6) * 0.00095;
    const doorDelta = doorFraction * 0.00095;
    lng = -77.6450 - craDelta - doorDelta;
  } else {
    // Main via is Carrera: Longitude is determined by Carrera number
    const craDelta = (mainEffective - 6) * 0.00095;
    lng = -77.6450 - craDelta;

    // Crossing Calles determine latitude
    const calleDelta = (crossEffective - 14) * 0.00055;
    const doorDelta = doorFraction * 0.00055;
    lat = 0.8300 + calleDelta + doorDelta;
  }

  // Safety clamp to Ipiales urban limits
  lat = Math.max(0.8160, Math.min(0.8490, lat));
  lng = Math.max(-77.6650, Math.min(-77.6300, lng));

  return {
    formattedTitle,
    secondary: 'Ipiales, Nariño',
    fullAddress: `${formattedTitle}, Ipiales, Nariño`,
    lat,
    lng
  };
};

// Client-side circuit breakers for public geocoding services
let clientPhotonDisabledUntil = 0;
let clientNominatimDisabledUntil = 0;

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
  const [selectedAddress, setSelectedAddress] = useState<string>(() => {
    if (initialAddress && initialAddress.trim() && !isPickupOrInvalidAddress(initialAddress)) {
      return initialAddress.trim();
    }
    return '';
  });
  const selectedAddressRef = useRef<string>(selectedAddress);

  const updateSelectedAddress = useCallback((newAddr: string) => {
    const clean = (newAddr || '').trim();
    setSelectedAddress(clean);
    selectedAddressRef.current = clean;
  }, []);

  const address = selectedAddress;
  const setAddress = updateSelectedAddress;
  const selectedExactAddress = selectedAddress;
  const setSelectedExactAddress = updateSelectedAddress;
  const selectedExactAddressRef = selectedAddressRef;

  const activeGeocodePromiseRef = useRef<Promise<string> | null>(null);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState<boolean>(false);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [addressHistory, setAddressHistory] = useState<AddressHistoryItem[]>(() => getStoredAddressHistory());
  const searchContainerRef = useRef<HTMLDivElement | null>(null);
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isGeocoding, setIsGeocoding] = useState<boolean>(false);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [isConfirming, setIsConfirming] = useState<boolean>(false);
  const [showMapModal, setShowMapModal] = useState<boolean>(false);
  const [isMapMoving, setIsMapMoving] = useState<boolean>(false);
  const [isUpdatingLocation, setIsUpdatingLocation] = useState<boolean>(false);
  const isUpdatingLocationRef = useRef<boolean>(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState<AddressSuggestion | null>(null);

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
  const lastKnownStreetRef = useRef<string>('');
  const lastRealtimeGeocodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        !isPickupOrInvalidAddress(initialAddress)
      );

      const defaultAddrObj = IPIALES_DEFAULT_ADDRESSES[0];
      const validLat = hasValidIpiales ? initialLat : defaultAddrObj.lat;
      const validLng = hasValidIpiales ? initialLng : defaultAddrObj.lng;

      const initialCleanAddr = isCustomValidAddr ? (initialAddress || '').trim() : '';

      setLat(validLat);
      setLng(validLng);
      setLatInput(String(validLat.toFixed(6)));
      setLngInput(String(validLng.toFixed(6)));
      updateSelectedAddress(initialCleanAddr);
      setSearchQuery('');
      setSuggestions([]);
      setShowSuggestions(false);
      setIsLoadingSuggestions(false);
      setIsGeocoding(false);
      setIsConfirming(false);
      setShowMapModal(false);
      setAddressHistory(getStoredAddressHistory());
    }
  }, [isOpen, initialLat, initialLng, initialAddress, updateSelectedAddress]);

  // Multi-tier reverse geocoding with instant server and open fallbacks (bypasses unactivated client Geocoder API errors)
  const fetchReverseGeocode = useCallback(async (latitude: number, longitude: number): Promise<string> => {
    // 1. Call server-side / Hostinger proxy endpoint (handles Google server proxy + Photon + Nominatim with Colombian house numbers)
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
          if (data.street) {
            lastKnownStreetRef.current = data.street;
          }
          return data.formatted_address;
        }
      }
    } catch {
      // Silently fall through to coordinate calculation
    }

    // 2. Direct client fallback to Photon with circuit breaker
    const now = Date.now();
    if (now > clientPhotonDisabledUntil) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1800);
        const pRes = await fetch(`https://photon.komoot.io/reverse?lat=${latitude}&lon=${longitude}`, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (pRes.ok) {
          const pData = await pRes.json();
          if (pData?.features && pData.features.length > 0) {
            const p = pData.features[0].properties;
            const rawStreet = p.street || p.name || 'Calle';
            lastKnownStreetRef.current = rawStreet;
            const streetWithNum = formatColombianStreetWithHouseNumber(rawStreet, p.housenumber, latitude, longitude);
            const parts = [
              streetWithNum,
              p.district || p.suburb || p.locality || null,
              p.city || p.county || 'Ipiales',
              p.state || 'Nariño'
            ].filter(Boolean);
            if (parts.length > 0) {
              return parts.join(', ');
            }
          }
        } else {
          clientPhotonDisabledUntil = Date.now() + 5 * 60 * 1000;
        }
      } catch {
        // Photon is unavailable or refused connection; disable client attempts for 10 minutes
        clientPhotonDisabledUntil = Date.now() + 10 * 60 * 1000;
      }
    }

    // 3. Direct client fallback to Nominatim with circuit breaker
    if (now > clientNominatimDisabledUntil) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1800);
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
          const addr = nomData.address || {};
          const road = addr.road || addr.pedestrian || addr.cycleway || 'Calle';
          lastKnownStreetRef.current = road;
          const streetWithNum = formatColombianStreetWithHouseNumber(road, addr.house_number, latitude, longitude);
          const parts = [
            streetWithNum,
            addr.neighbourhood || addr.suburb || addr.residential || null,
            addr.city || addr.town || 'Ipiales',
            addr.state || 'Nariño'
          ].filter(Boolean);
          return parts.join(', ');
        } else {
          clientNominatimDisabledUntil = Date.now() + 5 * 60 * 1000;
        }
      } catch {
        clientNominatimDisabledUntil = Date.now() + 5 * 60 * 1000;
      }
    }

    // 4. Guaranteed Colombian street & house number fallback computed from coordinates
    const fallbackStreet = formatColombianStreetWithHouseNumber('Calle', undefined, latitude, longitude);
    return `${fallbackStreet}, Ipiales, Nariño`;
  }, []);

  // Reverse geocode wrapper with request sequencing and active promise tracking
  const reverseGeocode = useCallback(async (latitude: number, longitude: number): Promise<string> => {
    const requestId = ++latestGeocodeIdRef.current;
    setIsGeocoding(true);
    setIsUpdatingLocation(true);
    isUpdatingLocationRef.current = true;

    const promise = (async () => {
      try {
        const formatted = await fetchReverseGeocode(latitude, longitude);

        // RACE CONDITION CHECK: Ignore response if another movement started in the meantime
        if (requestId === latestGeocodeIdRef.current) {
          const finalClean = (formatted && formatted.trim())
            ? formatted.trim()
            : `${formatColombianStreetWithHouseNumber('Calle', undefined, latitude, longitude)}, Ipiales, Nariño`;

          updateSelectedAddress(finalClean);
          setIsUpdatingLocation(false);
          isUpdatingLocationRef.current = false;
          return finalClean;
        }
        return '';
      } catch (err) {
        console.warn("Reverse geocode failed:", err);
        if (requestId === latestGeocodeIdRef.current) {
          const fallback = `${formatColombianStreetWithHouseNumber('Calle', undefined, latitude, longitude)}, Ipiales, Nariño`;
          updateSelectedAddress(fallback);
          setIsUpdatingLocation(false);
          isUpdatingLocationRef.current = false;
          return fallback;
        }
        return '';
      } finally {
        if (requestId === latestGeocodeIdRef.current) {
          setIsGeocoding(false);
          activeGeocodePromiseRef.current = null;
        }
      }
    })();

    activeGeocodePromiseRef.current = promise;
    return promise;
  }, [fetchReverseGeocode, updateSelectedAddress]);

  // Movement start handler: immediately marks isUpdatingLocation = true and cancels previous requests
  const handleMapMovementStart = useCallback(() => {
    setIsUpdatingLocation(true);
    isUpdatingLocationRef.current = true;
    setIsMapMoving(true);

    // Cancel older in-flight geocode requests
    latestGeocodeIdRef.current++;

    if (lastRealtimeGeocodeTimerRef.current) {
      clearTimeout(lastRealtimeGeocodeTimerRef.current);
      lastRealtimeGeocodeTimerRef.current = null;
    }
  }, []);

  // Real-time map movement handler: keeps coordinates live as user moves the map
  const handleRealtimeMapMove = useCallback((newLat: number, newLng: number) => {
    setLat(newLat);
    setLng(newLng);
    setLatInput(newLat.toFixed(6));
    setLngInput(newLng.toFixed(6));

    if (!isUpdatingLocationRef.current) {
      setIsUpdatingLocation(true);
      isUpdatingLocationRef.current = true;
    }
    setIsMapMoving(true);
  }, []);

  // Map movement end handler (idle): immediately obtains center coordinates and reverse-geocodes
  const handleMapMovementEnd = useCallback((newLat: number, newLng: number) => {
    setIsMapMoving(false);
    setLat(newLat);
    setLng(newLng);
    setLatInput(newLat.toFixed(6));
    setLngInput(newLng.toFixed(6));

    reverseGeocode(newLat, newLng);
  }, [reverseGeocode]);

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

    // 0. Deterministic Colombian Address parsing for Ipiales (handles "calle 24b # 13-37", "cra 6 # 14-30", etc.)
    const parsed = parseColombianAddressToCoords(trimmed);
    if (parsed) {
      results.push({
        id: `parsed-${parsed.formattedTitle}`,
        mainText: parsed.formattedTitle,
        secondaryText: `${parsed.secondary} | Ubicación exacta`,
        fullAddress: parsed.fullAddress,
        lat: parsed.lat,
        lng: parsed.lng,
        distanceLabel: formatDistanceLabel(parsed.lat, parsed.lng),
        source: 'local'
      });
    }

    // 1. Check user's stored address history
    const historyList = getStoredAddressHistory();
    for (const h of historyList) {
      const nameLower = h.name.toLowerCase();
      const fullLower = h.fullAddress.toLowerCase();
      if (nameLower.includes(normalized) || fullLower.includes(normalized)) {
        if (!results.some(r => r.fullAddress.toLowerCase() === h.fullAddress.toLowerCase() || r.mainText.toLowerCase() === h.name.toLowerCase())) {
          results.push({
            id: `hist-${h.id}`,
            mainText: h.name,
            secondaryText: h.secondary || h.fullAddress,
            fullAddress: h.fullAddress,
            lat: h.lat,
            lng: h.lng,
            distanceLabel: h.lat !== undefined && h.lng !== undefined && isWithinIpiales(h.lat, h.lng) ? formatDistanceLabel(h.lat, h.lng) : undefined,
            source: 'local'
          });
        }
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

    // 3. Query Photon with circuit breaker (fast OSM autocomplete service)
    const now = Date.now();
    if (now > clientPhotonDisabledUntil) {
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
        } else {
          clientPhotonDisabledUntil = Date.now() + 5 * 60 * 1000;
        }
      } catch {
        // Silently mark Photon as disabled for 10 minutes to prevent repeated fetch failures
        clientPhotonDisabledUntil = Date.now() + 10 * 60 * 1000;
      }
    }

    // 4. Nominatim fallback if results are sparse
    if (results.length < 3 && now > clientNominatimDisabledUntil) {
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
        } else {
          clientNominatimDisabledUntil = Date.now() + 5 * 60 * 1000;
        }
      } catch {
        clientNominatimDisabledUntil = Date.now() + 5 * 60 * 1000;
      }
    }

    const finalResults = results.map(r => {
      const secWithNum = ensureSecondaryHasHouseNumber(r.secondaryText, r.lat, r.lng);
      return {
        ...r,
        secondaryText: secWithNum,
        fullAddress: r.fullAddress && r.fullAddress.includes('#') ? r.fullAddress : `${r.mainText}, ${secWithNum}`
      };
    });

    setSuggestions(finalResults.slice(0, 8));
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

    // Instant zero-latency parsing check so Colombian addresses appear immediately
    const instantParsed = parseColombianAddressToCoords(trimmed);
    if (instantParsed) {
      setSuggestions([{
        id: `parsed-${instantParsed.formattedTitle}`,
        mainText: instantParsed.formattedTitle,
        secondaryText: `${instantParsed.secondary} | Ubicación exacta`,
        fullAddress: instantParsed.fullAddress,
        lat: instantParsed.lat,
        lng: instantParsed.lng,
        distanceLabel: formatDistanceLabel(instantParsed.lat, instantParsed.lng),
        source: 'local'
      }]);
    }

    setIsLoadingSuggestions(true);
    setShowSuggestions(true);

    debounceTimeoutRef.current = setTimeout(() => {
      fetchSuggestions(trimmed);
    }, 280);
  };

  // Update position callback WITHOUT reverse geocoding to preserve exact selected address
  const applyCoordsWithoutReverseGeocode = useCallback((newLat: number, newLng: number) => {
    const effectiveLat = isWithinIpiales(newLat, newLng) ? newLat : DEFAULT_LAT;
    const effectiveLng = isWithinIpiales(newLat, newLng) ? newLng : DEFAULT_LNG;

    setLat(effectiveLat);
    setLng(effectiveLng);
    setLatInput(String(effectiveLat.toFixed(6)));
    setLngInput(String(effectiveLng.toFixed(6)));
    latestGeocodeIdRef.current++;
    setIsGeocoding(false);
    setIsUpdatingLocation(false);
    isUpdatingLocationRef.current = false;

    if (googleMapRef.current) {
      googleMapRef.current.panTo({ lat: effectiveLat, lng: effectiveLng });
    }

    if (leafletMapRef.current) {
      leafletMapRef.current.panTo([effectiveLat, effectiveLng]);
    }
  }, []);

  // When the user taps a previous address from their local history
  const handleSelectHistoryItem = (item: AddressHistoryItem) => {
    latestGeocodeIdRef.current++;
    setIsGeocoding(false);
    if (lastRealtimeGeocodeTimerRef.current) {
      clearTimeout(lastRealtimeGeocodeTimerRef.current);
      lastRealtimeGeocodeTimerRef.current = null;
    }

    const completeAddress = item.fullAddress || item.name;
    selectedExactAddressRef.current = completeAddress;
    setSelectedExactAddress(completeAddress);
    setAddress(completeAddress);
    setSearchQuery(item.name || completeAddress);
    setShowSuggestions(false);

    if (item.lat !== undefined && item.lng !== undefined && !isNaN(item.lat) && !isNaN(item.lng)) {
      applyCoordsWithoutReverseGeocode(item.lat, item.lng);
    }

    const updated = saveAddressToHistory({
      name: item.name,
      secondary: item.secondary,
      fullAddress: completeAddress,
      lat: item.lat,
      lng: item.lng
    });
    setAddressHistory(updated);
  };

  // When the client selects a suggested address from the dropdown
  const handleSelectSuggestion = async (suggestion: AddressSuggestion) => {
    const formattedSecondary = ensureSecondaryHasHouseNumber(suggestion.secondaryText, suggestion.lat, suggestion.lng);
    const completeAddress = suggestion.fullAddress && suggestion.fullAddress.includes('#')
      ? suggestion.fullAddress
      : `${suggestion.mainText}, ${formattedSecondary}`;

    // Cancel any pending or in-flight reverse geocode requests immediately!
    latestGeocodeIdRef.current++;
    setIsGeocoding(false);
    if (lastRealtimeGeocodeTimerRef.current) {
      clearTimeout(lastRealtimeGeocodeTimerRef.current);
      lastRealtimeGeocodeTimerRef.current = null;
    }

    // Set exact selected address across all states and refs
    selectedExactAddressRef.current = completeAddress;
    setSelectedExactAddress(completeAddress);
    setSelectedSuggestion(suggestion);
    setAddress(completeAddress);
    setSearchQuery(completeAddress);
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
      } catch {
        // Silently fall through
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
      } catch {
        // Silently fall through
      }
    }

    if (targetLat !== undefined && targetLng !== undefined && !isNaN(targetLat) && !isNaN(targetLng)) {
      applyCoordsWithoutReverseGeocode(targetLat, targetLng);
    }

    // Save to user address history in localStorage
    const updated = saveAddressToHistory({
      name: suggestion.mainText,
      secondary: formattedSecondary,
      fullAddress: completeAddress,
      lat: targetLat !== undefined && !isNaN(targetLat) ? targetLat : undefined,
      lng: targetLng !== undefined && !isNaN(targetLng) ? targetLng : undefined
    });
    setAddressHistory(updated);
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

    if (leafletMapRef.current) {
      leafletMapRef.current.panTo([effectiveLat, effectiveLng]);
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
    setIsUpdatingLocation(false);
    isUpdatingLocationRef.current = false;

    if (googleMapRef.current) {
      googleMapRef.current.panTo({ lat: item.lat, lng: item.lng });
      googleMapRef.current.setZoom(16);
    }

    if (leafletMapRef.current) {
      leafletMapRef.current.setView([item.lat, item.lng], 16);
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
    setIsUpdatingLocation(false);
    isUpdatingLocationRef.current = false;
    
    if (googleMapRef.current) {
      googleMapRef.current.panTo({ lat: defaultCenter.lat, lng: defaultCenter.lng });
      googleMapRef.current.setZoom(16);
    } else if (leafletMapRef.current) {
      leafletMapRef.current.setView([defaultCenter.lat, defaultCenter.lng], 16);
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

        const zoom = 16;
        const safeLat = isWithinIpiales(lat, lng) ? lat : DEFAULT_LAT;
        const safeLng = isWithinIpiales(lat, lng) ? lng : DEFAULT_LNG;
        map.setView([safeLat, safeLng], zoom);

        map.on('movestart', () => {
          handleMapMovementStart();
        });

        map.on('move', () => {
          const center = map.getCenter();
          if (center && !isNaN(center.lat) && !isNaN(center.lng)) {
            handleRealtimeMapMove(center.lat, center.lng);
          }
        });

        map.on('moveend', () => {
          const center = map.getCenter();
          if (center && !isNaN(center.lat) && !isNaN(center.lng)) {
            handleMapMovementEnd(center.lat, center.lng);
          }
        });

        map.on('click', (e: L.LeafletMouseEvent) => {
          handleMapMovementStart();
          map.panTo(e.latlng);
        });

        leafletMapRef.current = map;
      } else {
        leafletMapRef.current.invalidateSize();
        const safeLat = isWithinIpiales(lat, lng) ? lat : DEFAULT_LAT;
        const safeLng = isWithinIpiales(lat, lng) ? lng : DEFAULT_LNG;
        leafletMapRef.current.setView([safeLat, safeLng], 16);
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

    let finalLat = lat;
    let finalLng = lng;

    // Read real-time center from map instance to ensure 100% exact alignment with the center pin
    if (googleMapRef.current) {
      const center = googleMapRef.current.getCenter();
      if (center) {
        const cLat = center.lat();
        const cLng = center.lng();
        if (!isNaN(cLat) && !isNaN(cLng)) {
          finalLat = cLat;
          finalLng = cLng;
        }
      }
    } else if (leafletMapRef.current) {
      const center = leafletMapRef.current.getCenter();
      if (center && !isNaN(center.lat) && !isNaN(center.lng)) {
        finalLat = center.lat;
        finalLng = center.lng;
      }
    }

    if (lastRealtimeGeocodeTimerRef.current) {
      clearTimeout(lastRealtimeGeocodeTimerRef.current);
      lastRealtimeGeocodeTimerRef.current = null;
    }

    // Wait for any active reverse geocoding request to complete
    if (activeGeocodePromiseRef.current) {
      try {
        await activeGeocodePromiseRef.current;
      } catch {}
    }

    // Single source of truth: selectedAddress / selectedAddressRef
    let finalAddress = (selectedAddressRef.current || selectedAddress || '').trim();

    // If still marked as updating or address is empty, resolve reverse geocode directly
    if (isUpdatingLocationRef.current || !finalAddress) {
      try {
        const resolved = await fetchReverseGeocode(finalLat, finalLng);
        if (resolved && resolved.trim()) {
          finalAddress = resolved.trim();
          updateSelectedAddress(finalAddress);
        }
      } catch {}
    }

    // 5. Guaranteed fallback: calculate Colombian street address from coordinates
    if (!finalAddress) {
      const fallbackStreet = formatColombianStreetWithHouseNumber('Calle', undefined, finalLat, finalLng);
      finalAddress = `${fallbackStreet}, Ipiales, Nariño`;
      updateSelectedAddress(finalAddress);
    }

    if (finalAddress) {
      const updated = saveAddressToHistory({
        name: finalAddress.split(',')[0].trim() || finalAddress,
        secondary: finalAddress.includes(',') ? finalAddress : `${finalAddress}, Ipiales, Nariño`,
        fullAddress: finalAddress,
        lat: finalLat,
        lng: finalLng
      });
      setAddressHistory(updated);
    }

    setIsConfirming(false);

    const mapUrl = `https://www.google.com/maps?q=${finalLat.toFixed(6)},${finalLng.toFixed(6)}`;

    // Sync across localStorage and window event
    try {
      localStorage.setItem('ryyco_customer_delivery_address', finalAddress);
      localStorage.setItem('ryyco_customer_coordinates', JSON.stringify({
        lat: finalLat,
        lng: finalLng,
        mapUrl
      }));
      window.dispatchEvent(new CustomEvent('ryyco:address-updated', {
        detail: {
          address: finalAddress,
          coordinates: { lat: finalLat, lng: finalLng, mapUrl }
        }
      }));
    } catch (_) {}

    onConfirm({
      address: finalAddress,
      lat: finalLat,
      lng: finalLng,
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

  // Compute suggestions and popular places matching inDrive visual reference with street and house number
  const trimmedSearch = searchQuery.trim();
  const parsedFromQuery = trimmedSearch.length >= 2 ? parseColombianAddressToCoords(trimmedSearch) : null;

  const rawDisplayList: AddressSuggestion[] = [];

  // 1. If user typed a Colombian address (e.g. "calle 24b # 13-37"), ALWAYS include it immediately at the top
  if (parsedFromQuery) {
    rawDisplayList.push({
      id: `parsed-${parsedFromQuery.formattedTitle}`,
      mainText: parsedFromQuery.formattedTitle,
      secondaryText: `${parsedFromQuery.secondary} | Ubicación exacta`,
      fullAddress: parsedFromQuery.fullAddress,
      lat: parsedFromQuery.lat,
      lng: parsedFromQuery.lng,
      distanceLabel: formatDistanceLabel(parsedFromQuery.lat, parsedFromQuery.lng),
      source: 'local'
    });
  }

  // 2. Add API/search suggestions if available
  if (suggestions.length > 0) {
    for (const s of suggestions) {
      if (!rawDisplayList.some(r => r.mainText.toLowerCase() === s.mainText.toLowerCase() || r.fullAddress.toLowerCase() === s.fullAddress.toLowerCase())) {
        rawDisplayList.push(s);
      }
    }
  } else if (trimmedSearch.length >= 2) {
    const normalized = normalizeSearchQuery(trimmedSearch);
    const matchedHistory = addressHistory.filter(item => {
      return item.name.toLowerCase().includes(normalized) || 
             item.fullAddress.toLowerCase().includes(normalized);
    });

    for (const item of matchedHistory) {
      if (!rawDisplayList.some(r => r.mainText.toLowerCase() === item.name.toLowerCase() || r.fullAddress.toLowerCase() === item.fullAddress.toLowerCase())) {
        rawDisplayList.push({
          id: `hist-${item.id}`,
          mainText: item.name,
          secondaryText: item.secondary || item.fullAddress,
          fullAddress: item.fullAddress,
          lat: item.lat,
          lng: item.lng,
          distanceLabel: item.lat !== undefined && item.lng !== undefined && isWithinIpiales(item.lat, item.lng) ? formatDistanceLabel(item.lat, item.lng) : undefined,
          source: 'local'
        });
      }
    }

    // Fallback: if still empty, allow using the entered text directly
    if (rawDisplayList.length === 0) {
      const formattedInput = trimmedSearch.charAt(0).toUpperCase() + trimmedSearch.slice(1);
      rawDisplayList.push({
        id: `custom-query-${trimmedSearch}`,
        mainText: formattedInput,
        secondaryText: 'Ipiales, Nariño | Usar dirección ingresada',
        fullAddress: formattedInput.toLowerCase().includes('ipiales') ? formattedInput : `${formattedInput}, Ipiales, Nariño`,
        lat: lat,
        lng: lng,
        distanceLabel: formatDistanceLabel(lat, lng),
        source: 'local'
      });
    }
  }

  const displayList: AddressSuggestion[] = rawDisplayList.map(item => {
    const formattedSec = ensureSecondaryHasHouseNumber(item.secondaryText, item.lat, item.lng);
    return {
      ...item,
      secondaryText: formattedSec,
      fullAddress: item.fullAddress && item.fullAddress.includes('#') ? item.fullAddress : `${item.mainText}, ${formattedSec}`
    };
  });

  return (
    <div className="fixed inset-0 z-[9999] flex items-start justify-center p-2 sm:p-4 pt-2 sm:pt-6 bg-black/85 backdrop-blur-md animate-fade-in overflow-hidden">
      <div className="bg-[#141416] border border-neutral-800 rounded-3xl w-full max-w-lg h-[92vh] sm:h-[680px] max-h-[92vh] overflow-hidden shadow-2xl flex flex-col">
        {/* Mobile top drag handle indicator ("palito") */}
        <div className="pt-2.5 pb-0.5 flex justify-center sm:hidden shrink-0">
          <div className="w-10 h-1 bg-neutral-700 rounded-full" />
        </div>
        
        {/* Modal Header: Centered Title and Round Close Button */}
        <div className="px-5 py-3.5 border-b border-neutral-800/80 flex items-center justify-between bg-[#141416] shrink-0">
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
        <div className="p-3.5 sm:p-4 border-b border-neutral-800/60 bg-[#141416] shrink-0">
          <div className="rounded-2xl border-2 border-white bg-neutral-900/95 px-3.5 py-2.5 flex items-center gap-3 shadow-md focus-within:ring-2 focus-within:ring-white/30 transition">
            <Search className="w-5 h-5 text-gray-300 shrink-0" />
            <div className="flex-1 min-w-0">
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchInputChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (displayList.length > 0) {
                      handleSelectSuggestion(displayList[0]);
                    } else if (searchQuery.trim()) {
                      const parsed = parseColombianAddressToCoords(searchQuery.trim());
                      if (parsed) {
                        setSearchQuery(parsed.formattedTitle);
                        setAddress(parsed.fullAddress);
                        setSelectedExactAddress(parsed.fullAddress);
                        selectedExactAddressRef.current = parsed.fullAddress;
                        handleLocationUpdate(parsed.lat, parsed.lng);
                        const updated = saveAddressToHistory({
                          name: parsed.formattedTitle,
                          secondary: parsed.secondary,
                          fullAddress: parsed.fullAddress,
                          lat: parsed.lat,
                          lng: parsed.lng
                        });
                        setAddressHistory(updated);
                      } else {
                        const raw = searchQuery.trim();
                        const formatted = raw.toLowerCase().includes('ipiales') ? raw : `${raw}, Ipiales, Nariño`;
                        setSearchQuery(raw);
                        setAddress(formatted);
                        setSelectedExactAddress(formatted);
                        selectedExactAddressRef.current = formatted;
                        const updated = saveAddressToHistory({
                          name: raw,
                          secondary: formatted,
                          fullAddress: formatted,
                          lat,
                          lng
                        });
                        setAddressHistory(updated);
                      }
                    }
                  }
                }}
                placeholder="barrio o calle..."
                className="w-full bg-transparent text-white font-bold text-sm sm:text-base outline-none placeholder:text-gray-500 placeholder:font-normal py-0.5"
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
              onClick={() => {
                const trimmed = searchQuery.trim();
                if (trimmed) {
                  const parsed = parseColombianAddressToCoords(trimmed);
                  if (parsed) {
                    handleLocationUpdate(parsed.lat, parsed.lng);
                    setAddress(parsed.fullAddress);
                  }
                }
                setShowMapModal(true);
              }}
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
        <div className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 py-2 divide-y divide-neutral-800/40 overscroll-contain">
          
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

          {trimmedSearch ? (
            isLoadingSuggestions ? (
              <div className="py-8 flex items-center justify-center gap-2 text-xs text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin text-[#E63946]" />
                <span>Buscando sugerencias...</span>
              </div>
            ) : displayList.length > 0 ? (
              displayList.map((item) => {
                const isSelected = 
                  (selectedExactAddress && (
                    selectedExactAddress.trim().toLowerCase() === item.fullAddress?.trim().toLowerCase() ||
                    selectedExactAddress.trim().toLowerCase() === item.mainText.trim().toLowerCase() ||
                    selectedExactAddress.toLowerCase().includes(item.mainText.toLowerCase())
                  )) ||
                  (address && (
                    address.trim().toLowerCase() === item.fullAddress?.trim().toLowerCase() ||
                    address.toLowerCase().includes(item.mainText.toLowerCase())
                  ));

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectSuggestion(item)}
                    className={`w-full py-3.5 px-3 rounded-xl flex items-center justify-between gap-3 text-left transition cursor-pointer ${
                      isSelected 
                        ? 'bg-neutral-800/95 border border-[#E63946]/60 text-white shadow-lg' 
                        : 'hover:bg-neutral-800/40 active:bg-neutral-800/60 text-gray-300 border border-transparent'
                    }`}
                  >
                    <div className="flex items-start gap-3.5 min-w-0 flex-1">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${isSelected ? 'bg-[#E63946] text-white' : 'bg-neutral-800 text-gray-400'}`}>
                        {isSelected ? (
                          <Check className="w-4 h-4 stroke-[3]" />
                        ) : (
                          <MapPin className="w-4 h-4" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm leading-snug truncate ${isSelected ? 'font-black text-white' : 'font-semibold text-gray-200'}`}>
                          {renderHighlightedText(item.mainText, searchQuery)}
                        </p>
                        {item.secondaryText && (
                          <p className="text-xs text-gray-400 truncate mt-0.5">
                            {item.secondaryText}
                          </p>
                        )}
                      </div>
                    </div>
                    {item.distanceLabel && (
                      <span className="text-xs sm:text-sm text-gray-400 font-normal shrink-0 ml-2">
                        {item.distanceLabel}
                      </span>
                    )}
                  </button>
                );
              })
            ) : (
              <div className="py-8 text-center text-xs text-gray-400">
                No se encontraron lugares para esa búsqueda.
              </div>
            )
          ) : (
            // Exclusively real user address history (ordered from newest to oldest)
            // If the user has no history, the section remains completely empty
            addressHistory.length > 0 ? (
              addressHistory.map((item) => {
                const isSelected = 
                  (selectedExactAddress && (
                    selectedExactAddress.trim().toLowerCase() === item.fullAddress.trim().toLowerCase() ||
                    selectedExactAddress.trim().toLowerCase() === item.name.trim().toLowerCase()
                  )) ||
                  (address && (
                    address.trim().toLowerCase() === item.fullAddress.trim().toLowerCase() ||
                    address.trim().toLowerCase() === item.name.trim().toLowerCase()
                  ));

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectHistoryItem(item)}
                    className={`w-full py-3.5 px-3 rounded-xl flex items-center justify-between gap-3 text-left transition cursor-pointer ${
                      isSelected 
                        ? 'bg-neutral-800/95 border border-[#E63946]/60 text-white shadow-lg' 
                        : 'hover:bg-neutral-800/40 active:bg-neutral-800/60 text-gray-300 border border-transparent'
                    }`}
                  >
                    <div className="flex items-start gap-3.5 min-w-0 flex-1">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${isSelected ? 'bg-[#E63946] text-white' : 'bg-neutral-800 text-gray-400'}`}>
                        {isSelected ? (
                          <Check className="w-4 h-4 stroke-[3]" />
                        ) : (
                          <MapPin className="w-4 h-4" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm leading-snug truncate ${isSelected ? 'font-black text-white' : 'font-semibold text-gray-200'}`}>
                          {item.name}
                        </p>
                        {item.secondary ? (
                          <p className="text-xs text-gray-400 truncate mt-0.5">
                            {item.secondary}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    {item.lat !== undefined && item.lng !== undefined && isWithinIpiales(item.lat, item.lng) ? (
                      <span className="text-xs sm:text-sm text-gray-400 font-normal shrink-0 ml-2">
                        {formatDistanceLabel(item.lat, item.lng)}
                      </span>
                    ) : null}
                  </button>
                );
              })
            ) : null
          )}

        </div>

        {/* Modal Footer: Full Width Confirm Button with corporate color */}
        <div className="p-4 border-t border-neutral-800/80 bg-[#141416] flex flex-col gap-2.5 shrink-0 mt-auto">
          {Boolean(selectedExactAddress || address) && (
            <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-neutral-900 border border-neutral-800 text-xs">
              <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                <Check className="w-3.5 h-3.5 stroke-[3]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Dirección a confirmar</p>
                <p className="font-extrabold text-white truncate text-xs">{selectedExactAddress || address}</p>
              </div>
            </div>
          )}

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
                      onLocationChange={handleMapMovementEnd}
                      onRealtimeMove={handleRealtimeMapMove}
                      onMovementStart={handleMapMovementStart}
                    />
                  </Map>
                </APIProvider>
              ) : (
                <div ref={leafletContainerRef} className="w-full h-full z-10" />
              )}

              {/* FIXED CENTER-UP PIN & CALLOUT BUBBLE */}
              <div 
                className="absolute left-1/2 -translate-x-1/2 pointer-events-none z-[450] select-none"
                style={{ top: '50%' }}
              >
                {/* Ground target shadow dot at center */}
                <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none">
                  <div 
                    className={`rounded-full bg-black/60 blur-[1px] transition-all duration-200 ease-out ${
                      isMapMoving ? 'w-3.5 h-1 opacity-30 scale-90' : 'w-5 h-2 opacity-75 scale-100'
                    }`} 
                  />
                </div>

                {/* Floating Pin & Bubble: moves up by exactly 8px when moving, returns to 0px when stationary */}
                <div 
                  className="absolute left-1/2 -translate-x-1/2 bottom-0 flex flex-col items-center transition-transform duration-200 ease-out origin-bottom drop-shadow-[0_10px_14px_rgba(0,0,0,0.45)] will-change-transform"
                  style={{
                    transform: isMapMoving ? 'translateY(-8px)' : 'translateY(0px)',
                  }}
                >
                  {/* White Address Tooltip Pill from inDrive screenshot with street and house number in real time */}
                  <div className="mb-2 px-4 py-2 rounded-2xl bg-white text-black font-extrabold text-sm sm:text-base shadow-2xl border border-black/10 flex items-center justify-center max-w-[320px] whitespace-nowrap">
                    <span className="truncate text-black font-black">
                      {isUpdatingLocation ? 'Ubicando...' : formatBalloonAddress(address, lat, lng)}
                    </span>
                  </div>

                  {/* inDrive Location Icon (White rounded square with user figure) */}
                  <div className="w-11 h-11 rounded-2xl bg-white text-black shadow-xl flex items-center justify-center border border-gray-200">
                    <svg className="w-6 h-6 text-black" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="7" r="3.2" />
                      <path d="M12 12.5c-4.2 0-6.5 2.5-6.5 5.5V20h13v-2c0-3-2.3-5.5-6.5-5.5z" />
                    </svg>
                  </div>

                  {/* Pin stick ("palito") with white background and black border on left and right sides - more slender (delgadito) */}
                  <div 
                    className="w-1 h-5 bg-white border-l-[1.5px] border-r-[1.5px] border-black border-t-0 border-b-0 shadow-md pointer-events-none" 
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


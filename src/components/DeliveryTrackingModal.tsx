import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  X, 
  ArrowLeft,
  MapPin, 
  Phone, 
  CheckCircle2, 
  Key,
  Copy,
  Check,
  MessageSquare,
  Share2
} from 'lucide-react';
import { APIProvider, Map, AdvancedMarker, Pin, useMap } from '@vis.gl/react-google-maps';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { OrderItem, DeliveryTrackingData } from '../types';
import { listenToDeliveryTracking, db, getOrderDeliveryCode } from '../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { isValidGoogleMapsKey, getGoogleMapsApiKey, clearGoogleMapsApiKey } from '../lib/mapsConfig';

// inDrive / Uber Eats styled dark map styles for Google Maps
const DARK_MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#1a1f2c" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a1f2c" }, { weight: 2 }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8c9ba5" }] },
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [{ color: "#d5d9dc" }]
  },
  {
    featureType: "poi",
    elementType: "labels.text.fill",
    stylers: [{ color: "#6c7a89" }]
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#162b24" }]
  },
  {
    featureType: "poi.park",
    elementType: "labels.text.fill",
    stylers: [{ color: "#4e7d69" }]
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#283344" }]
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#1d2532" }]
  },
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [{ color: "#9aa7b5" }]
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#36455b" }]
  },
  {
    featureType: "road.highway",
    elementType: "geometry.stroke",
    stylers: [{ color: "#232e3d" }]
  },
  {
    featureType: "road.highway",
    elementType: "labels.text.fill",
    stylers: [{ color: "#e2e8f0" }]
  },
  {
    featureType: "transit",
    elementType: "geometry",
    stylers: [{ color: "#232e3d" }]
  },
  {
    featureType: "transit.station",
    elementType: "labels.text.fill",
    stylers: [{ color: "#8c9ba5" }]
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#0e1626" }]
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#4e627d" }]
  },
  {
    featureType: "water",
    elementType: "labels.text.stroke",
    stylers: [{ color: "#0e1626" }]
  }
];

interface DeliveryTrackingModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: OrderItem | null;
  driverLiveCoords?: { latitude: number; longitude: number } | null;
  storeLocationCoords?: { lat?: number; lng?: number; address?: string } | null;
}

/**
 * Google Maps Route Polylines renderer component
 */
function GoogleMapRouteLayer({
  driverLat,
  driverLng,
  storeLat,
  storeLng,
  destLat,
  destLng,
  isPickedUp
}: {
  driverLat: number;
  driverLng: number;
  storeLat: number;
  storeLng: number;
  destLat: number;
  destLng: number;
  isPickedUp: boolean;
}) {
  const map = useMap();
  const polyline1Ref = useRef<google.maps.Polyline | null>(null);
  const polyline2Ref = useRef<google.maps.Polyline | null>(null);

  useEffect(() => {
    if (!map) return;

    // Etapa 1: Domiciliario -> Tienda
    const stage1Path = [
      { lat: driverLat, lng: driverLng },
      { lat: storeLat, lng: storeLng }
    ];

    if (!polyline1Ref.current) {
      polyline1Ref.current = new google.maps.Polyline({
        path: stage1Path,
        strokeColor: isPickedUp ? '#10B981' : '#F59E0B',
        strokeOpacity: isPickedUp ? 0.4 : 0.9,
        strokeWeight: isPickedUp ? 3 : 5,
        map
      });
    } else {
      polyline1Ref.current.setPath(stage1Path);
      polyline1Ref.current.setOptions({
        strokeColor: isPickedUp ? '#10B981' : '#F59E0B',
        strokeOpacity: isPickedUp ? 0.4 : 0.9,
        strokeWeight: isPickedUp ? 3 : 5
      });
    }

    // Etapa 2: Tienda -> Cliente (o Domiciliario directo si ya recogió)
    const stage2Path = isPickedUp
      ? [{ lat: driverLat, lng: driverLng }, { lat: destLat, lng: destLng }]
      : [{ lat: storeLat, lng: storeLng }, { lat: destLat, lng: destLng }];

    if (!polyline2Ref.current) {
      polyline2Ref.current = new google.maps.Polyline({
        path: stage2Path,
        strokeColor: isPickedUp ? '#E63946' : '#10B981',
        strokeOpacity: isPickedUp ? 0.95 : 0.75,
        strokeWeight: isPickedUp ? 5 : 4,
        map
      });
    } else {
      polyline2Ref.current.setPath(stage2Path);
      polyline2Ref.current.setOptions({
        strokeColor: isPickedUp ? '#E63946' : '#10B981',
        strokeOpacity: isPickedUp ? 0.95 : 0.75,
        strokeWeight: isPickedUp ? 5 : 4
      });
    }

    return () => {
      if (polyline1Ref.current) {
        polyline1Ref.current.setMap(null);
        polyline1Ref.current = null;
      }
      if (polyline2Ref.current) {
        polyline2Ref.current.setMap(null);
        polyline2Ref.current = null;
      }
    };
  }, [map, driverLat, driverLng, storeLat, storeLng, destLat, destLng, isPickedUp]);

  return null;
}

/**
 * Google Maps Camera and Centering controller
 */
function GoogleMapCameraController({
  driverLat,
  driverLng,
  storeLat,
  storeLng,
  destLat,
  destLng,
  isPickedUp,
  centerModeTrigger
}: {
  driverLat: number;
  driverLng: number;
  storeLat: number;
  storeLng: number;
  destLat: number;
  destLng: number;
  isPickedUp: boolean;
  centerModeTrigger: { mode: 'all' | 'driver'; id: number };
}) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    if (centerModeTrigger.mode === 'driver') {
      map.panTo({ lat: driverLat, lng: driverLng });
      map.setZoom(16);
    } else {
      // Fit bounds including padding for top HUD and bottom card
      const bounds = new google.maps.LatLngBounds();
      bounds.extend({ lat: driverLat, lng: driverLng });
      if (!isPickedUp) {
        bounds.extend({ lat: storeLat, lng: storeLng });
      }
      bounds.extend({ lat: destLat, lng: destLng });

      // In mobile, bottom sheet occupies roughly 240px
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
      map.fitBounds(bounds, {
        top: isMobile ? 120 : 100,
        bottom: isMobile ? 270 : 250,
        left: 40,
        right: 40
      });
    }
  }, [map, centerModeTrigger.id, centerModeTrigger.mode]);

  return null;
}

export const isValidMapsKey = (k?: string | null): boolean => {
  return isValidGoogleMapsKey(k);
};

export default function DeliveryTrackingModal({
  isOpen,
  onClose,
  order,
  driverLiveCoords,
  storeLocationCoords
}: DeliveryTrackingModalProps) {
  const [liveOrder, setLiveOrder] = useState<OrderItem | null>(order);
  const [tracking, setTracking] = useState<DeliveryTrackingData | null>(null);
  const [googleMapsApiKey, setGoogleMapsApiKey] = useState<string>(() => {
    return getGoogleMapsApiKey();
  });
  const [mapProvider, setMapProvider] = useState<'google' | 'leaflet'>(() => {
    const key = getGoogleMapsApiKey();
    return isValidGoogleMapsKey(key) ? 'google' : 'leaflet';
  });
  const [mapType, setMapType] = useState<'roadmap' | 'hybrid'>('roadmap');
  const [secondsAgo, setSecondsAgo] = useState<number>(0);
  const [copiedPin, setCopiedPin] = useState<boolean>(false);
  const [centerTrigger, setCenterTrigger] = useState<{ mode: 'all' | 'driver'; id: number }>({
    mode: 'all',
    id: 1
  });

  // Listen for Google Maps auth failure (e.g. InvalidKeyMapError) and fall back smoothly
  useEffect(() => {
    const handleAuthFailure = () => {
      console.warn('[Google Maps] gm_authFailure detected (invalid key or restriction). Switching to interactive map fallback.');
      clearGoogleMapsApiKey();
      setGoogleMapsApiKey('');
      setMapProvider('leaflet');
    };

    (window as any).gm_authFailure = handleAuthFailure;
    window.addEventListener('gm_authFailure', handleAuthFailure);
    return () => {
      window.removeEventListener('gm_authFailure', handleAuthFailure);
    };
  }, []);

  // Synchronize base order when prop changes
  useEffect(() => {
    setLiveOrder(order);
  }, [order]);

  // Real-time Firestore order subscription to track status / driver assignment instantaneously
  useEffect(() => {
    if (!isOpen || !order?.id) return;
    const docRef = doc(db, 'orders', order.id);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        setLiveOrder({ ...docSnap.data(), id: docSnap.id } as OrderItem);
      }
    }, (err) => {
      console.warn("DeliveryTrackingModal live order subscription warning:", err);
    });

    return () => {
      unsubscribe();
    };
  }, [isOpen, order?.id]);

  // Leaflet references (for seamless fallback)
  const leafletContainerRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const driverMarkerRef = useRef<L.Marker | null>(null);
  const destMarkerRef = useRef<L.Marker | null>(null);
  const storeMarkerRef = useRef<L.Marker | null>(null);
  const stage1PolylineRef = useRef<L.Polyline | null>(null);
  const stage2PolylineRef = useRef<L.Polyline | null>(null);

  // Fetch Hostinger / Server Google Maps configuration if not already set
  useEffect(() => {
    let isMounted = true;
    const loadKey = async () => {
      try {
        let res = await fetch('/api/maps/config');
        if (!res.ok) {
          res = await fetch('/api/maps-config.php');
        }
        if (res.ok) {
          const data = await res.json();
          if (data.configured && isValidMapsKey(data.apiKey) && isMounted) {
            setGoogleMapsApiKey(data.apiKey);
            try {
              sessionStorage.setItem('ryyco_gmaps_api_key', data.apiKey);
            } catch (_) {}
            setMapProvider('google');
          } else if (isMounted) {
            setMapProvider('leaflet');
          }
        }
      } catch (_) {
        // Fallback silently
      }
    };
    if (!isValidMapsKey(googleMapsApiKey)) {
      loadKey();
    }
    return () => { isMounted = false; };
  }, [googleMapsApiKey]);

  // Real-time tracking subscription
  useEffect(() => {
    if (!isOpen || !order?.id) {
      setTracking(null);
      return;
    }

    const unsubscribe = listenToDeliveryTracking(order.id, (data) => {
      if (data) {
        setTracking(data);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [isOpen, order?.id]);

  // Seconds ago timer for fresh GPS indicator
  useEffect(() => {
    if (!tracking?.updatedAt) return;
    const interval = setInterval(() => {
      const diffSec = Math.max(0, Math.floor((Date.now() - new Date(tracking.updatedAt).getTime()) / 1000));
      setSecondsAgo(diffSec);
    }, 1000);
    return () => clearInterval(interval);
  }, [tracking?.updatedAt]);

  // Current order authoritative instance
  const activeOrder = liveOrder || order;

  // Delivery status step resolution
  const currentStep = tracking?.status || activeOrder?.deliveryStep || (
    activeOrder?.status === 'delivered' ? 'delivered' :
    activeOrder?.status === 'delivering' ? 'to_client' :
    activeOrder?.status === 'picked_up' ? 'picked_up' :
    activeOrder?.status === 'ready' ? 'ready' :
    activeOrder?.status === 'shipped' ? 'to_client' :
    (activeOrder?.status === 'preparing' || activeOrder?.status === 'processing') ? 'kitchen' :
    activeOrder?.status === 'confirmed' ? (activeOrder?.deliveryType === 'restaurant' ? 'restaurant_confirmed' : 'accepted') :
    activeOrder?.status === 'cancelled' ? 'cancelled' : 'pending'
  );
  const isPickedUp = currentStep === 'to_client' || currentStep === 'at_destination' || currentStep === 'delivered';

  // Determine positions
  // Destination: customer coordinates or fallback (Ipiales defaults)
  const destLat = activeOrder?.customerLat || tracking?.customerLat || 0.83028;
  const destLng = activeOrder?.customerLng || tracking?.customerLng || -77.64444;

  // Store coordinates
  const storeLat = storeLocationCoords?.lat || activeOrder?.storeLat || tracking?.storeLat || (destLat - 0.004);
  const storeLng = storeLocationCoords?.lng || activeOrder?.storeLng || tracking?.storeLng || (destLng + 0.003);

  // Courier live position (prefer instant device live coords from portal, then tracking telemetry, then default offset)
  const driverLat = driverLiveCoords?.latitude || tracking?.lat || (storeLat - 0.002);
  const driverLng = driverLiveCoords?.longitude || tracking?.lng || (storeLng - 0.002);
  const hasLiveGps = (!!driverLiveCoords?.latitude && !!driverLiveCoords?.longitude) || (!!tracking?.lat && !!tracking?.lng);

  // Courier vehicle type
  const vehicleType = tracking?.vehicleType || activeOrder?.deliveryVehicle || 'moto';
  const isBike = vehicleType.toLowerCase().includes('bici') || vehicleType.toLowerCase().includes('bicicleta');

  // Leaflet map setup for fallback mode
  const isUsingLeaflet = mapProvider === 'leaflet' || !googleMapsApiKey;

  useEffect(() => {
    if (!isOpen || !isUsingLeaflet || !leafletContainerRef.current) return;

    const timer = setTimeout(() => {
      if (!leafletContainerRef.current) return;

      if (!leafletMapRef.current) {
        const map = L.map(leafletContainerRef.current, {
          center: [driverLat, driverLng],
          zoom: 15,
          zoomControl: false
        });

        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© OpenStreetMap'
        }).addTo(map);

        // Driver Marker (Moving Courier)
        const driverIcon = L.divIcon({
          className: 'courier-live-pin',
          html: `
            <div style="position: relative; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center;">
              <div style="position: absolute; width: 46px; height: 46px; background: rgba(230, 57, 70, 0.4); border-radius: 50%; animation: ping 1.8s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
              <div style="width: 40px; height: 40px; background: #E63946; border: 3px solid #FFFFFF; border-radius: 50%; box-shadow: 0 4px 16px rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; transform: rotate(${tracking?.heading || 0}deg); transition: transform 0.4s ease;">
                <span style="font-size: 20px; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.5));">${isBike ? '🚲' : '🛵'}</span>
              </div>
            </div>
          `,
          iconSize: [48, 48],
          iconAnchor: [24, 24]
        });

        // Destination Marker (Customer Home)
        const destIcon = L.divIcon({
          className: 'dest-live-pin',
          html: `
            <div style="width: 38px; height: 38px; background: #10B981; border: 3px solid #FFFFFF; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); box-shadow: 0 4px 14px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;">
              <div style="transform: rotate(45deg); font-size: 16px;">🏠</div>
            </div>
          `,
          iconSize: [38, 38],
          iconAnchor: [19, 38]
        });

        // Store Marker
        const storeIcon = L.divIcon({
          className: 'store-live-pin',
          html: `
            <div style="width: 36px; height: 36px; background: ${isPickedUp ? '#059669' : '#F59E0B'}; border: 2px solid #FFFFFF; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); box-shadow: 0 4px 12px rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center;">
              <div style="transform: rotate(45deg); font-size: 15px;">${isPickedUp ? '✓' : '🍽️'}</div>
            </div>
          `,
          iconSize: [36, 36],
          iconAnchor: [18, 36]
        });

        const dMarker = L.marker([driverLat, driverLng], { icon: driverIcon, zIndexOffset: 1000 }).addTo(map);
        const cMarker = L.marker([destLat, destLng], { icon: destIcon }).addTo(map);
        const sMarker = L.marker([storeLat, storeLng], { icon: storeIcon }).addTo(map);

        const poly1 = L.polyline(
          [[driverLat, driverLng], [storeLat, storeLng]],
          {
            color: isPickedUp ? '#059669' : '#F59E0B',
            weight: isPickedUp ? 3 : 5,
            dashArray: isPickedUp ? '4, 4' : '6, 6',
            opacity: isPickedUp ? 0.4 : 0.95
          }
        ).addTo(map);

        const poly2 = L.polyline(
          isPickedUp ? [[driverLat, driverLng], [destLat, destLng]] : [[storeLat, storeLng], [destLat, destLng]],
          {
            color: isPickedUp ? '#E63946' : '#10B981',
            weight: isPickedUp ? 5 : 4,
            dashArray: '8, 8',
            opacity: isPickedUp ? 0.95 : 0.75
          }
        ).addTo(map);

        driverMarkerRef.current = dMarker;
        destMarkerRef.current = cMarker;
        storeMarkerRef.current = sMarker;
        stage1PolylineRef.current = poly1;
        stage2PolylineRef.current = poly2;
        leafletMapRef.current = map;

        const bounds = isPickedUp
          ? L.latLngBounds([[driverLat, driverLng], [destLat, destLng]])
          : L.latLngBounds([[driverLat, driverLng], [storeLat, storeLng], [destLat, destLng]]);
        map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
      } else {
        if (driverMarkerRef.current) driverMarkerRef.current.setLatLng([driverLat, driverLng]);
        if (destMarkerRef.current) destMarkerRef.current.setLatLng([destLat, destLng]);
        if (storeMarkerRef.current) storeMarkerRef.current.setLatLng([storeLat, storeLng]);
        if (stage1PolylineRef.current) {
          stage1PolylineRef.current.setLatLngs([[driverLat, driverLng], [storeLat, storeLng]]);
        }
        if (stage2PolylineRef.current) {
          stage2PolylineRef.current.setLatLngs(
            isPickedUp ? [[driverLat, driverLng], [destLat, destLng]] : [[storeLat, storeLng], [destLat, destLng]]
          );
        }
      }
    }, 120);

    return () => clearTimeout(timer);
  }, [isOpen, isUsingLeaflet, driverLat, driverLng, destLat, destLng, storeLat, storeLng, tracking?.heading, isBike, isPickedUp]);

  // Clean up leaflet when closing modal
  useEffect(() => {
    if (!isOpen && leafletMapRef.current) {
      leafletMapRef.current.remove();
      leafletMapRef.current = null;
      driverMarkerRef.current = null;
      destMarkerRef.current = null;
      storeMarkerRef.current = null;
      stage1PolylineRef.current = null;
      stage2PolylineRef.current = null;
    }
  }, [isOpen]);

  if (!isOpen || !activeOrder) return null;

  // Status mapping
  const getStatusInfo = (step: string) => {
    switch (step) {
      case 'pending':
        return {
          label: 'Pedido Recibido',
          desc: 'Esperando confirmación del restaurante',
          badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
          stepIndex: 0
        };
      case 'kitchen':
      case 'restaurant_confirmed':
        return {
          label: 'En Preparación / Cocina',
          desc: 'El restaurante está cocinando y empacando tus productos',
          badgeColor: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
          stepIndex: 1
        };
      case 'ready':
      case 'picked_up':
      case 'to_store':
      case 'at_store':
        return {
          label: 'Recogiendo en Restaurante',
          desc: 'El repartidor está en la tienda alistando y recibiendo el pedido',
          badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
          stepIndex: 1
        };
      case 'to_client':
        return {
          label: '¡En camino a tu dirección!',
          desc: 'El repartidor lleva tu pedido caliente y en ruta en tiempo real',
          badgeColor: 'bg-[#E63946]/25 text-white border-[#E63946]/60 animate-pulse',
          stepIndex: 2
        };
      case 'at_destination':
        return {
          label: '¡Llegando a tu ubicación!',
          desc: 'El domiciliario está afuera o a pocos metros de tu puerta',
          badgeColor: 'bg-teal-500/25 text-teal-200 border-teal-500/50 animate-pulse',
          stepIndex: 2
        };
      case 'delivered':
        return {
          label: '¡Pedido Entregado!',
          desc: 'Entrega finalizada con éxito. ¡Que disfrutes tu comida!',
          badgeColor: 'bg-emerald-500/25 text-emerald-300 border-emerald-500/50',
          stepIndex: 3
        };
      case 'cancelled':
        return {
          label: 'Pedido Cancelado',
          desc: 'Este pedido ha sido cancelado',
          badgeColor: 'bg-red-500/20 text-red-300 border-red-500/40',
          stepIndex: -1
        };
      default:
        return {
          label: activeOrder.deliveryDriverName ? 'Domiciliario Asignado' : 'En Gestión',
          desc: activeOrder.deliveryDriverName ? `${activeOrder.deliveryDriverName} está gestionando tu entrega` : 'Tu pedido se está procesando',
          badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
          stepIndex: 1
        };
    }
  };

  const statusInfo = getStatusInfo(currentStep);
  const driverName = tracking?.driverName || activeOrder.deliveryDriverName || 'Domiciliario Ryyco';
  const driverPhone = tracking?.driverPhone || activeOrder.deliveryDriverPhone;
  const vehiclePlate = tracking?.vehiclePlate || activeOrder.deliveryVehiclePlate;
  const deliveryCode = getOrderDeliveryCode(activeOrder);

  const handleCopyDeliveryPin = () => {
    if (deliveryCode && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(deliveryCode);
      setCopiedPin(true);
      setTimeout(() => setCopiedPin(false), 2500);
    }
  };

  const handleShareTracking = () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({
        title: `Rastreo Pedido #${activeOrder.orderNumber} - RYYCO`,
        text: `Sigue en tiempo real mi pedido #${activeOrder.orderNumber} en Ryyco`,
        url: window.location.href
      }).catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setCopiedPin(true);
      setTimeout(() => setCopiedPin(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-[99999] w-screen h-screen bg-[#070A12] flex flex-col overflow-hidden select-none animate-fade-in font-sans">
      
      {/* MAP VIEWPORT FILLING 100% OF THE FULLSCREEN */}
      <div className="absolute inset-0 w-full h-full z-0 overflow-hidden">
        {mapProvider === 'google' && isValidMapsKey(googleMapsApiKey) ? (
          <APIProvider
            apiKey={googleMapsApiKey}
            libraries={['marker']}
            onError={(err) => {
              console.warn('[DeliveryTrackingModal] Google Maps API failure, gracefully switching to Leaflet:', err);
              clearGoogleMapsApiKey();
              setGoogleMapsApiKey('');
              setMapProvider('leaflet');
            }}
          >
            <Map
              mapId="DELIVERY_TRACKING_MAP"
              defaultCenter={{ lat: driverLat, lng: driverLng }}
              defaultZoom={15}
              mapTypeId={mapType}
              gestureHandling="greedy"
              disableDefaultUI={true}
              zoomControl={false}
              scrollwheel={true}
              disableDoubleClickZoom={false}
              internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              style={{ width: '100%', height: '100%' }}
              styles={mapType === 'roadmap' ? DARK_MAP_STYLES : undefined}
            >
              {/* Route Path Polylines */}
              <GoogleMapRouteLayer
                driverLat={driverLat}
                driverLng={driverLng}
                storeLat={storeLat}
                storeLng={storeLng}
                destLat={destLat}
                destLng={destLng}
                isPickedUp={isPickedUp}
              />

              {/* Camera centering manager */}
              <GoogleMapCameraController
                driverLat={driverLat}
                driverLng={driverLng}
                storeLat={storeLat}
                storeLng={storeLng}
                destLat={destLat}
                destLng={destLng}
                isPickedUp={isPickedUp}
                centerModeTrigger={centerTrigger}
              />

              {/* COURIER ADVANCED MARKER */}
              <AdvancedMarker
                position={{ lat: driverLat, lng: driverLng }}
                title={`Domiciliario: ${driverName}`}
                zIndex={100}
              >
                <div className="relative flex flex-col items-center justify-center cursor-pointer">
                  {/* Courier Callout Chip */}
                  <div className="mb-1 px-2 py-0.5 rounded-full bg-black/85 border border-[#E63946]/60 backdrop-blur-md text-[10px] font-black text-white whitespace-nowrap shadow-xl flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>{driverName.split(' ')[0]}</span>
                    {tracking?.speed ? (
                      <span className="text-gray-400 font-mono text-[9px]">{Math.round(tracking.speed)} km/h</span>
                    ) : null}
                  </div>

                  {/* Pulsing ring and icon badge */}
                  <div className="relative w-12 h-12 flex items-center justify-center">
                    <div className="absolute inset-0 bg-[#E63946]/40 rounded-full animate-ping opacity-75" />
                    <div 
                      className="w-11 h-11 bg-gradient-to-tr from-[#E63946] to-[#b71c1c] border-2 border-white rounded-full shadow-2xl flex items-center justify-center text-xl transition-transform duration-300"
                      style={{
                        transform: `rotate(${tracking?.heading || 0}deg)`
                      }}
                    >
                      <span className="drop-shadow-md">{isBike ? '🚲' : '🛵'}</span>
                    </div>
                  </div>
                </div>
              </AdvancedMarker>

              {/* CUSTOMER DESTINATION MARKER */}
              <AdvancedMarker
                position={{ lat: destLat, lng: destLng }}
                title={`Punto de entrega: ${activeOrder.customerAddress}`}
                zIndex={60}
              >
                <div className="flex flex-col items-center justify-center cursor-pointer">
                  <div className="mb-1 px-2 py-0.5 rounded-full bg-black/85 border border-emerald-500/60 backdrop-blur-md text-[10px] font-black text-emerald-300 whitespace-nowrap shadow-xl flex items-center gap-1">
                    <span>Mi Ubicación</span>
                  </div>
                  <div className="w-10 h-10 bg-emerald-500 border-2 border-white rounded-2xl rotate-45 shadow-2xl flex items-center justify-center text-base">
                    <span className="-rotate-45">🏠</span>
                  </div>
                </div>
              </AdvancedMarker>

              {/* STORE / RESTAURANT MARKER */}
              <AdvancedMarker
                position={{ lat: storeLat, lng: storeLng }}
                title={`Tienda: ${activeOrder.storeName || 'Restaurante'}`}
                zIndex={50}
              >
                <div className="flex flex-col items-center justify-center cursor-pointer">
                  <div className="mb-1 px-2 py-0.5 rounded-full bg-black/85 border border-amber-500/60 backdrop-blur-md text-[10px] font-black text-amber-300 whitespace-nowrap shadow-xl truncate max-w-[140px]">
                    {activeOrder.storeName || 'Restaurante'}
                  </div>
                  <div className="w-9 h-9 bg-amber-500 border-2 border-white rounded-2xl rotate-45 shadow-xl flex items-center justify-center text-sm">
                    <span className="-rotate-45">{isPickedUp ? '✓' : '🍽️'}</span>
                  </div>
                </div>
              </AdvancedMarker>
            </Map>
          </APIProvider>
        ) : (
          <div ref={leafletContainerRef} className="w-full h-full leaflet-dark-tiles" />
        )}
      </div>

      {/* FLOATING HUD CONTROLS OVER THE MAP (POINTER-EVENTS-NONE WITH INTERACTIVE CHILDREN) */}
      <div className="relative z-10 w-full h-full flex flex-col justify-between p-3 sm:p-5 pointer-events-none">
        
        {/* TOP BAR HUD: BACK BUTTON, LIVE STATUS BADGE, & QUICK TOOLS */}
        <div className="w-full flex items-start justify-between gap-2.5">
          
          {/* Back button */}
          <div className="pointer-events-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-11 px-3.5 sm:px-4 rounded-2xl bg-black/75 hover:bg-black/90 active:scale-95 text-white text-xs font-black shadow-2xl backdrop-blur-xl border border-white/15 flex items-center gap-2 transition cursor-pointer group"
              title="Volver"
            >
              <ArrowLeft className="w-4 h-4 text-[#E63946] group-hover:-translate-x-0.5 transition-transform" />
              <span className="font-extrabold tracking-wide">Volver</span>
            </button>
          </div>

          {/* Center GPS Telemetry Badge */}
          <div className="pointer-events-auto flex items-center justify-center">
            <div className="px-3 py-1 rounded-full bg-black/75 border border-white/15 backdrop-blur-md text-[10px] sm:text-xs font-bold text-gray-200 flex items-center gap-1.5 shadow-2xl">
              <span className={`w-2 h-2 rounded-full shrink-0 ${hasLiveGps ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span className="truncate">
                {hasLiveGps ? `GPS en vivo (${secondsAgo}s)` : 'Esperando GPS del repartidor...'}
              </span>
            </div>
          </div>

          {/* Top Right Tool Buttons */}
          <div className="pointer-events-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleShareTracking}
              className="w-11 h-11 rounded-2xl bg-black/75 hover:bg-black/90 active:scale-95 text-gray-200 hover:text-white flex items-center justify-center shadow-2xl backdrop-blur-xl border border-white/15 transition cursor-pointer"
              title="Compartir enlace de rastreo"
            >
              <Share2 className="w-4 h-4 text-white" />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-11 h-11 rounded-2xl bg-black/75 hover:bg-black/90 active:scale-95 text-gray-200 hover:text-white flex items-center justify-center shadow-2xl backdrop-blur-xl border border-white/15 transition cursor-pointer"
              title="Cerrar mapa"
            >
              <X className="w-5 h-5 text-gray-400 hover:text-white" />
            </button>
          </div>
        </div>


        {/* BOTTOM HUD CARD: DRIVER INFO, PIN & CONTACT BUTTONS */}
        <div className="pointer-events-auto w-full max-w-xl mx-auto">
          <div className="bg-[#090D16]/95 border border-gray-800/90 rounded-3xl p-4 sm:p-5 shadow-[0_20px_50px_rgba(0,0,0,0.85)] backdrop-blur-2xl text-white space-y-3.5 transition-all">

            {/* SECURITY PIN BANNER (CRITICAL FOR CUSTOMER) */}
            {currentStep !== 'delivered' ? (
              <div className="p-3 sm:p-3.5 bg-gradient-to-r from-emerald-950/70 via-[#0A161E] to-emerald-950/50 border border-emerald-500/40 rounded-2xl flex items-center justify-between gap-3 shadow-lg">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
                    <Key className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] uppercase font-black tracking-wider text-emerald-400 block">
                      Código de Entrega (PIN)
                    </span>
                    <p className="text-[11px] text-gray-300 truncate">
                      Dile este código al domiciliario para recibir tu pedido:
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <div className="px-3.5 py-1.5 bg-emerald-500/20 border border-emerald-500/60 rounded-xl font-mono text-2xl font-black text-emerald-300 tracking-[0.25em] shadow-inner">
                    {deliveryCode}
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyDeliveryPin}
                    className="w-9 h-9 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 flex items-center justify-center transition active:scale-95 cursor-pointer"
                    title="Copiar código"
                  >
                    {copiedPin ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl flex items-center justify-between text-xs text-emerald-300 font-bold">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Pedido entregado con éxito
                </span>
                <span className="font-mono bg-emerald-500/20 px-2.5 py-0.5 rounded-lg border border-emerald-500/30">
                  PIN: {deliveryCode}
                </span>
              </div>
            )}

            {/* COURIER PROFILE & DIRECT ACTION BUTTONS */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-0.5">
              
              {/* Courier Identity */}
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#E63946] to-amber-500 p-0.5 flex items-center justify-center shadow-lg shadow-[#E63946]/25 shrink-0">
                  <div className="w-full h-full bg-[#0D121F] rounded-[14px] flex items-center justify-center text-xl">
                    {isBike ? '🚲' : '🛵'}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-black text-white truncate">
                      {driverName}
                    </h4>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                      Ryyco Driver
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400 flex items-center gap-2 mt-0.5 truncate">
                    <span>{isBike ? 'Bicicleta' : 'Motocicleta'}</span>
                    {vehiclePlate && (
                      <>
                        <span>•</span>
                        <span className="font-mono font-bold text-gray-300 uppercase bg-black/40 px-1.5 py-0.2 rounded border border-gray-800">
                          {vehiclePlate}
                        </span>
                      </>
                    )}
                  </p>
                </div>
              </div>

              {/* Action Buttons: CALL & WHATSAPP */}
              <div className="flex items-center gap-2 shrink-0">
                {driverPhone ? (
                  <>
                    <a
                      href={`tel:${driverPhone}`}
                      className="flex-1 sm:flex-initial h-10 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-95 text-white rounded-xl text-xs font-black shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 transition"
                    >
                      <Phone className="w-3.5 h-3.5 fill-current" />
                      <span>Llamar</span>
                    </a>

                    <a
                      href={`https://wa.me/57${driverPhone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${driverName}, soy el cliente del pedido #${activeOrder.orderNumber} en Ryyco.`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="h-10 px-3 bg-[#25D366]/20 hover:bg-[#25D366]/30 text-[#25D366] border border-[#25D366]/40 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition active:scale-95"
                      title="Escribir por WhatsApp"
                    >
                      <MessageSquare className="w-4 h-4 fill-current" />
                      <span className="hidden sm:inline">WhatsApp</span>
                    </a>
                  </>
                ) : (
                  <span className="text-[11px] text-gray-500 italic">
                    Sin teléfono registrado
                  </span>
                )}
              </div>
            </div>



          </div>
        </div>

      </div>

    </div>
  );
}

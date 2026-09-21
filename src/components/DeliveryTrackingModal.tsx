import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  MapPin, 
  Navigation, 
  Bike, 
  Phone, 
  Clock, 
  ExternalLink, 
  CheckCircle2, 
  AlertCircle,
  Compass,
  Layers,
  Sparkles,
  ArrowRight,
  Store
} from 'lucide-react';
import { APIProvider, Map, AdvancedMarker, Pin } from '@vis.gl/react-google-maps';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { OrderItem, DeliveryTrackingData } from '../types';
import { listenToDeliveryTracking, db } from '../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { buildGoogleFullRouteUrl } from '../lib/coordinateUtils';

interface DeliveryTrackingModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: OrderItem | null;
  driverLiveCoords?: { latitude: number; longitude: number } | null;
  storeLocationCoords?: { lat?: number; lng?: number; address?: string } | null;
}

export default function DeliveryTrackingModal({
  isOpen,
  onClose,
  order,
  driverLiveCoords,
  storeLocationCoords
}: DeliveryTrackingModalProps) {
  const [liveOrder, setLiveOrder] = useState<OrderItem | null>(order);
  const [tracking, setTracking] = useState<DeliveryTrackingData | null>(null);
  const [googleMapsApiKey, setGoogleMapsApiKey] = useState<string>(
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
  );
  const [mapProvider, setMapProvider] = useState<'google' | 'leaflet'>('leaflet');
  const [secondsAgo, setSecondsAgo] = useState<number>(0);

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

  // Leaflet references
  const leafletContainerRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const driverMarkerRef = useRef<L.Marker | null>(null);
  const destMarkerRef = useRef<L.Marker | null>(null);
  const storeMarkerRef = useRef<L.Marker | null>(null);
  const stage1PolylineRef = useRef<L.Polyline | null>(null);
  const stage2PolylineRef = useRef<L.Polyline | null>(null);

  // Fetch Hostinger Google Maps configuration if not already configured
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
          if (data.configured && data.apiKey && isMounted) {
            setGoogleMapsApiKey(data.apiKey);
          }
        }
      } catch (_) {
        // Fallback silently
      }
    };
    if (!googleMapsApiKey) {
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
  const isPreparationStage = currentStep === 'pending' || currentStep === 'kitchen' || currentStep === 'restaurant_confirmed' || currentStep === 'ready' || currentStep === 'accepted' || currentStep === 'picked_up';

  // Determine positions
  // Destination: customer coordinates or fallback
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

  // Leaflet map setup and live marker animation
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

        L.control.zoom({ position: 'topright' }).addTo(map);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© OpenStreetMap'
        }).addTo(map);

        // Driver Marker (Moving Courier)
        const driverIcon = L.divIcon({
          className: 'courier-live-pin',
          html: `
            <div style="position: relative; width: 46px; height: 46px; display: flex; align-items: center; justify-content: center;">
              <div style="position: absolute; width: 44px; height: 44px; background: rgba(230, 57, 70, 0.35); border-radius: 50%; animation: ping 1.8s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
              <div style="width: 38px; height: 38px; background: #E63946; border: 3px solid #FFFFFF; border-radius: 50%; box-shadow: 0 4px 14px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; transform: rotate(${tracking?.heading || 0}deg); transition: transform 0.4s ease;">
                <span style="font-size: 18px; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.5));">${isBike ? '🚲' : '🛵'}</span>
              </div>
            </div>
          `,
          iconSize: [46, 46],
          iconAnchor: [23, 23]
        });

        // Destination Marker (Customer Home)
        const destIcon = L.divIcon({
          className: 'dest-live-pin',
          html: `
            <div style="width: 36px; height: 36px; background: #10B981; border: 3px solid #FFFFFF; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); box-shadow: 0 4px 12px rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center;">
              <div style="transform: rotate(45deg); font-size: 15px;">🏠</div>
            </div>
          `,
          iconSize: [36, 36],
          iconAnchor: [18, 36]
        });

        // Store Marker
        const storeIcon = L.divIcon({
          className: 'store-live-pin',
          html: `
            <div style="width: 34px; height: 34px; background: ${isPickedUp ? '#059669' : '#F59E0B'}; border: 2px solid #FFFFFF; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); box-shadow: 0 4px 10px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;">
              <div style="transform: rotate(45deg); font-size: 14px;">${isPickedUp ? '✓' : '🍽️'}</div>
            </div>
          `,
          iconSize: [34, 34],
          iconAnchor: [17, 34]
        });

        const dMarker = L.marker([driverLat, driverLng], { icon: driverIcon, zIndexOffset: 1000 }).addTo(map);
        const cMarker = L.marker([destLat, destLng], { icon: destIcon }).addTo(map);
        const sMarker = L.marker([storeLat, storeLng], { icon: storeIcon }).addTo(map);

        // ETAPA 1: Domiciliario (Ubicación en tiempo real) ➔ Restaurante
        const poly1 = L.polyline(
          [[driverLat, driverLng], [storeLat, storeLng]],
          {
            color: isPickedUp ? '#059669' : '#F59E0B',
            weight: isPickedUp ? 3 : 5,
            dashArray: isPickedUp ? '4, 4' : '6, 6',
            opacity: isPickedUp ? 0.4 : 0.95
          }
        ).addTo(map);

        // ETAPA 2: Restaurante ➔ Cliente (o Domiciliario directo al Cliente si ya recogió)
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

        // Fit bounds for the entire 2-stage route: Domiciliario -> Restaurante -> Cliente
        const bounds = isPickedUp
          ? L.latLngBounds([[driverLat, driverLng], [destLat, destLng]])
          : L.latLngBounds([[driverLat, driverLng], [storeLat, storeLng], [destLat, destLng]]);
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
      } else {
        // Update marker position smoothly
        if (driverMarkerRef.current) {
          driverMarkerRef.current.setLatLng([driverLat, driverLng]);
        }
        if (destMarkerRef.current) {
          destMarkerRef.current.setLatLng([destLat, destLng]);
        }
        if (storeMarkerRef.current) {
          storeMarkerRef.current.setLatLng([storeLat, storeLng]);
        }
        if (stage1PolylineRef.current) {
          stage1PolylineRef.current.setLatLngs([[driverLat, driverLng], [storeLat, storeLng]]);
          stage1PolylineRef.current.setStyle({
            color: isPickedUp ? '#059669' : '#F59E0B',
            weight: isPickedUp ? 3 : 5,
            opacity: isPickedUp ? 0.4 : 0.95
          });
        }
        if (stage2PolylineRef.current) {
          stage2PolylineRef.current.setLatLngs(
            isPickedUp ? [[driverLat, driverLng], [destLat, destLng]] : [[storeLat, storeLng], [destLat, destLng]]
          );
          stage2PolylineRef.current.setStyle({
            color: isPickedUp ? '#E63946' : '#10B981',
            weight: isPickedUp ? 5 : 4,
            opacity: isPickedUp ? 0.95 : 0.75
          });
        }
      }
    }, 150);

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

  // Status mapping with real-time restaurant & driver status
  const getStatusInfo = (step: string) => {
    switch (step) {
      case 'pending':
        return {
          label: 'Pedido Recibido',
          desc: 'Esperando confirmación del restaurante o domiciliario',
          color: 'bg-amber-500/20 text-amber-400 border-amber-500/30'
        };
      case 'restaurant_confirmed':
        return {
          label: 'Domicilio Propio Confirmado',
          desc: 'El restaurante confirmó el pedido y realizará la entrega con su propio domiciliario',
          color: 'bg-blue-500/20 text-blue-400 border-blue-500/30'
        };
      case 'kitchen':
        return {
          label: 'En Preparación / Cocina',
          desc: 'El restaurante está preparando y empacando tu pedido',
          color: 'bg-orange-500/20 text-orange-400 border-orange-500/30'
        };
      case 'ready':
        return {
          label: 'Pedido Listo para Despacho',
          desc: 'Tu pedido está empacado y listo para ser entregado',
          color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
        };
      case 'cancelled':
        return {
          label: 'Pedido Cancelado',
          desc: 'Este pedido ha sido cancelado',
          color: 'bg-red-500/20 text-red-400 border-red-500/30'
        };
      case 'to_store':
        return {
          label: 'Domiciliario hacia la tienda',
          desc: 'El repartidor se desplaza a recoger tu pedido',
          color: 'bg-amber-500/20 text-amber-400 border-amber-500/30'
        };
      case 'at_store':
        return {
          label: 'En la tienda recogiendo',
          desc: 'Tu pedido está siendo empacado y verificado',
          color: 'bg-amber-500/20 text-amber-400 border-amber-500/30'
        };
      case 'picked_up':
        return {
          label: 'En Cocina / Recogiendo en Tienda',
          desc: 'El repartidor está en la tienda alistando y recogiendo tu pedido',
          color: 'bg-orange-500/20 text-orange-400 border-orange-500/30'
        };
      case 'to_client':
        return {
          label: '¡En camino a tu dirección!',
          desc: 'El repartidor lleva tu pedido caliente y en ruta',
          color: 'bg-[#E63946]/20 text-[#E63946] border-[#E63946]/40 animate-pulse'
        };
      case 'at_destination':
        return {
          label: '¡Llegando a tu ubicación!',
          desc: 'El domiciliario está afuera o a pocos metros',
          color: 'bg-teal-500/20 text-teal-300 border-teal-500/40 animate-pulse'
        };
      case 'delivered':
        return {
          label: '¡Pedido Entregado!',
          desc: 'Entrega finalizada con éxito. ¡Buen provecho!',
          color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
        };
      case 'confirmed':
      case 'accepted':
        return {
          label: activeOrder.deliveryDriverName ? `Confirmado • Domiciliario: ${activeOrder.deliveryDriverName}` : 'Pedido Confirmado',
          desc: activeOrder.deliveryDriverName ? `${activeOrder.deliveryDriverName} aceptó tu pedido y se encuentra en gestión` : 'Tu pedido ha sido confirmado',
          color: 'bg-blue-500/20 text-blue-400 border-blue-500/30'
        };
      default:
        return {
          label: activeOrder.deliveryDriverName ? 'Domiciliario Asignado' : 'En Gestión',
          desc: activeOrder.deliveryDriverName ? 'Preparando ruta para iniciar la entrega' : 'Tu pedido se está gestionando en tiempo real',
          color: 'bg-blue-500/20 text-blue-400 border-blue-500/30'
        };
    }
  };

  const statusInfo = getStatusInfo(currentStep);

  const driverName = tracking?.driverName || activeOrder.deliveryDriverName || 'Domiciliario Ryyco';
  const driverPhone = tracking?.driverPhone || activeOrder.deliveryDriverPhone;
  const vehiclePlate = tracking?.vehiclePlate || activeOrder.deliveryVehiclePlate;

  const googleMapsUrl = buildGoogleFullRouteUrl({
    driverLat,
    driverLng,
    storeLat,
    storeLng,
    storeAddress: activeOrder.storeAddress,
    destLat,
    destLng,
    destAddress: activeOrder.customerAddress,
    isPickedUp
  });

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="bg-[#0D121F] border border-gray-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between bg-[#090D16]/90 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#E63946] to-amber-500 flex items-center justify-center text-white shadow-lg shadow-[#E63946]/20">
              <Navigation className="w-5 h-5 text-white animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-black text-white">
                  Ruta en Tiempo Real
                </h3>
                <span className="font-mono text-xs font-black text-[#E63946] bg-[#E63946]/15 px-2 py-0.5 rounded-md border border-[#E63946]/30">
                  #{activeOrder.orderNumber}
                </span>
              </div>
              <p className="text-[11px] text-gray-400">
                {activeOrder.storeName || 'Restaurante'} ➔ {activeOrder.customerAddress || 'Cliente'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Toggle Engine */}
            <button
              type="button"
              onClick={() => setMapProvider(p => p === 'google' ? 'leaflet' : 'google')}
              className="px-2.5 py-1.5 rounded-xl bg-gray-900 hover:bg-gray-800 text-[10px] font-bold text-gray-300 flex items-center gap-1.5 transition border border-gray-800 cursor-pointer"
              title="Cambiar capa de mapa"
            >
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">
                {mapProvider === 'google' && googleMapsApiKey ? 'Google Maps' : 'OpenStreetMap'}
              </span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-gray-900 hover:bg-gray-800 text-gray-400 hover:text-white flex items-center justify-center transition cursor-pointer border border-gray-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 space-y-3.5 overflow-y-auto flex-1">
          
          {/* Status Banner */}
          <div className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${statusInfo.color}`}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-black/30 flex items-center justify-center shrink-0">
                {currentStep === 'delivered' ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : (
                  <Bike className="w-5 h-5 text-[#E63946] animate-bounce" />
                )}
              </div>
              <div>
                <span className="text-xs font-black uppercase tracking-wider block">
                  {statusInfo.label}
                </span>
                <span className="text-[11px] opacity-90 block">
                  {statusInfo.desc}
                </span>
              </div>
            </div>

            {hasLiveGps && (
              <div className="text-right shrink-0">
                <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  GPS Vivo ({secondsAgo}s)
                </span>
              </div>
            )}
          </div>

          {/* Two Stages Indicator Banner */}
          <div className="bg-[#090D16] border border-[#232B3A] p-2 sm:p-2.5 rounded-2xl shadow-inner">
            <div className="flex items-center justify-between gap-1.5 sm:gap-2 text-xs">
              {/* Etapa 1 */}
              <div className={`flex items-center gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-xl flex-1 min-w-0 transition ${
                isPreparationStage
                  ? (currentStep === 'pending' ? 'bg-amber-500/15 border border-amber-500/35 text-amber-300 ring-1 ring-amber-500/30' : 'bg-orange-500/15 border border-orange-500/35 text-orange-300 ring-1 ring-orange-500/30')
                  : (!isPickedUp 
                      ? 'bg-amber-500/15 border border-amber-500/35 text-amber-300 ring-1 ring-amber-500/30' 
                      : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400')
              }`}>
                <span className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-black shrink-0 ${
                  isPreparationStage || !isPickedUp ? 'bg-amber-500 text-gray-950 font-black' : 'bg-emerald-500/30 text-emerald-300'
                }`}>
                  {isPreparationStage || !isPickedUp ? '1' : '✓'}
                </span>
                <div className="min-w-0 flex-1">
                  <span className="text-[8.5px] sm:text-[9.5px] font-black uppercase tracking-wider block opacity-90 truncate">
                    {isPreparationStage ? (
                      currentStep === 'pending' ? 'Etapa 1 • Recepción' :
                      currentStep === 'restaurant_confirmed' ? 'Etapa 1 • Domicilio Propio' :
                      (currentStep === 'accepted' || currentStep === 'confirmed') ? 'Etapa 1 • Confirmado' :
                      currentStep === 'ready' ? 'Etapa 1 • Listo' : 'Etapa 1 • En Cocina'
                    ) : (
                      <>
                        <span className="sm:hidden">Etapa 1 {!isPickedUp ? '• En curso' : '• Lista'}</span>
                        <span className="hidden sm:inline">Etapa 1 {!isPickedUp ? '(En curso)' : '(Completada)'}</span>
                      </>
                    )}
                  </span>
                  <span className="text-[10px] sm:text-[11.5px] font-bold truncate block text-white mt-0.5">
                    {isPreparationStage ? (
                      currentStep === 'pending' ? 'Confirmando Pedido' :
                      currentStep === 'restaurant_confirmed' ? 'Confirmado por Restaurante' :
                      (currentStep === 'accepted' || currentStep === 'confirmed') ? (activeOrder.deliveryDriverName ? `Confirmado • ${activeOrder.deliveryDriverName}` : 'Confirmado • Domiciliario Asignado') :
                      currentStep === 'ready' ? 'Listo para Despacho' : 'Preparando Alimentos'
                    ) : (
                      <>
                        <span className="sm:hidden">Hacia Tienda</span>
                        <span className="hidden sm:inline">Domiciliario ➔ Restaurante</span>
                      </>
                    )}
                  </span>
                </div>
              </div>

              <ArrowRight className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-gray-500 shrink-0 mx-0.5" />

              {/* Etapa 2 */}
              <div className={`flex items-center gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-xl flex-1 min-w-0 transition ${
                isPickedUp 
                  ? 'bg-[#E63946]/15 border border-[#E63946]/35 text-[#E63946] ring-1 ring-[#E63946]/30 animate-pulse' 
                  : 'bg-gray-900/60 border border-gray-800 text-gray-400'
              }`}>
                <span className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-black shrink-0 ${
                  isPickedUp ? 'bg-[#E63946] text-white font-black' : 'bg-gray-800 text-gray-400'
                }`}>
                  2
                </span>
                <div className="min-w-0 flex-1">
                  <span className="text-[8.5px] sm:text-[9.5px] font-black uppercase tracking-wider block opacity-90 truncate">
                    {isPreparationStage ? (
                      'Etapa 2 • Despacho'
                    ) : (
                      <>
                        <span className="sm:hidden">Etapa 2 {isPickedUp ? '• En curso' : '• Pendiente'}</span>
                        <span className="hidden sm:inline">Etapa 2 {isPickedUp ? '(En curso)' : '(Siguiente etapa)'}</span>
                      </>
                    )}
                  </span>
                  <span className="text-[10px] sm:text-[11.5px] font-bold truncate block text-white mt-0.5">
                    {isPreparationStage ? (
                      'Entrega a Domicilio'
                    ) : (
                      <>
                        <span className="sm:hidden">Hacia Cliente</span>
                        <span className="hidden sm:inline">Restaurante ➔ Cliente</span>
                      </>
                    )}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Map */}
          <div className="relative rounded-2xl border border-gray-800 overflow-hidden bg-gray-950 h-[340px] shadow-inner">
            {mapProvider === 'google' && googleMapsApiKey ? (
              <APIProvider apiKey={googleMapsApiKey} libraries={['marker']}>
                <Map
                  mapId="DELIVERY_TRACKING_MAP"
                  defaultCenter={{ lat: driverLat, lng: driverLng }}
                  center={{ lat: driverLat, lng: driverLng }}
                  defaultZoom={15}
                  gestureHandling="greedy"
                  disableDefaultUI={false}
                  internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                  style={{ width: '100%', height: '100%' }}
                >
                  {/* Courier Marker */}
                  <AdvancedMarker
                    position={{ lat: driverLat, lng: driverLng }}
                    title={`Domiciliario: ${driverName}`}
                  >
                    <div className="relative flex items-center justify-center">
                      <div className="absolute w-11 h-11 bg-[#E63946]/30 rounded-full animate-ping" />
                      <div className="w-10 h-10 bg-[#E63946] border-2 border-white rounded-full shadow-2xl flex items-center justify-center text-lg">
                        {isBike ? '🚲' : '🛵'}
                      </div>
                    </div>
                  </AdvancedMarker>

                  {/* Customer Destination Marker */}
                  <AdvancedMarker
                    position={{ lat: destLat, lng: destLng }}
                    title={`Punto de entrega: ${activeOrder.customerAddress}`}
                  >
                    <Pin
                      background="#10B981"
                      borderColor="#FFFFFF"
                      glyphColor="#FFFFFF"
                      scale={1.2}
                    />
                  </AdvancedMarker>

                  {/* Store Marker */}
                  <AdvancedMarker
                    position={{ lat: storeLat, lng: storeLng }}
                    title={`Tienda: ${activeOrder.storeName}`}
                  >
                    <Pin
                      background="#F59E0B"
                      borderColor="#FFFFFF"
                      glyphColor="#FFFFFF"
                      scale={1.0}
                    />
                  </AdvancedMarker>
                </Map>
              </APIProvider>
            ) : (
              <div ref={leafletContainerRef} className="w-full h-full z-10" />
            )}

            {/* GPS Telemetry badge overlay */}
            <div className="absolute bottom-3 left-3 z-[400] bg-gray-950/90 border border-gray-800/90 px-3 py-1.5 rounded-xl text-[10px] font-bold text-gray-300 backdrop-blur-md shadow-lg flex items-center gap-2 pointer-events-none">
              <span className={`w-2 h-2 rounded-full ${hasLiveGps ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span>
                {hasLiveGps 
                  ? `Transmitiendo: Lat ${driverLat.toFixed(4)}, Lng ${driverLng.toFixed(4)}`
                  : 'Esperando señal GPS en vivo del domiciliario...'}
              </span>
            </div>

            {/* External Google Maps Button overlay */}
            <div className="absolute top-3 right-3 z-[400]">
              <a
                href={googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 bg-gray-950/90 hover:bg-gray-900 border border-gray-800 text-white rounded-xl text-[11px] font-black flex items-center gap-1.5 shadow-lg backdrop-blur-md transition"
              >
                <span>Ver en Google Maps</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>


          {/* Delivery Address Details */}
          <div className="bg-[#090D16] border border-gray-800 p-3.5 rounded-2xl flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
              <MapPin className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider block">
                Dirección de Entrega
              </span>
              <p className="text-xs font-bold text-white truncate">
                {activeOrder.customerAddress || 'Dirección registrada en el pedido'}
              </p>
              {activeOrder.customerName && (
                <p className="text-[11px] text-gray-400">
                  Cliente: <strong className="text-gray-300">{activeOrder.customerName}</strong>
                </p>
              )}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-gray-800 bg-[#090D16]/90 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
            <Sparkles className="w-3.5 h-3.5 text-[#E63946]" />
            <span>RYYCO Domicilios en Tiempo Real</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-5 h-9 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-xs font-bold transition cursor-pointer"
          >
            Cerrar
          </button>
        </div>

      </div>
    </div>
  );
}

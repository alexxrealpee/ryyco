import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  MapPin, 
  Navigation, 
  Bike, 
  Truck, 
  Phone, 
  MessageCircle, 
  Clock, 
  ExternalLink, 
  CheckCircle2, 
  AlertCircle,
  Compass,
  Layers,
  Sparkles
} from 'lucide-react';
import { APIProvider, Map, AdvancedMarker, Pin } from '@vis.gl/react-google-maps';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { OrderItem, DeliveryTrackingData } from '../types';
import { listenToDeliveryTracking } from '../lib/firebase';

interface DeliveryTrackingModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: OrderItem | null;
}

export default function DeliveryTrackingModal({
  isOpen,
  onClose,
  order
}: DeliveryTrackingModalProps) {
  const [tracking, setTracking] = useState<DeliveryTrackingData | null>(null);
  const [googleMapsApiKey, setGoogleMapsApiKey] = useState<string>(
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
  );
  const [mapProvider, setMapProvider] = useState<'google' | 'leaflet'>('google');
  const [secondsAgo, setSecondsAgo] = useState<number>(0);

  // Leaflet references
  const leafletContainerRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const driverMarkerRef = useRef<L.Marker | null>(null);
  const destMarkerRef = useRef<L.Marker | null>(null);
  const storeMarkerRef = useRef<L.Marker | null>(null);
  const routePolylineRef = useRef<L.Polyline | null>(null);

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

  // Determine positions
  // Destination: customer coordinates or fallback
  const destLat = order?.customerLat || tracking?.customerLat || 0.83028;
  const destLng = order?.customerLng || tracking?.customerLng || -77.64444;

  // Courier live position (if available) or default near store/destination
  const driverLat = tracking?.lat || destLat + 0.0035;
  const driverLng = tracking?.lng || destLng - 0.0035;
  const hasLiveGps = !!tracking?.lat && !!tracking?.lng;

  // Store coordinates fallback
  const storeLat = tracking?.storeLat || destLat - 0.004;
  const storeLng = tracking?.storeLng || destLng + 0.003;

  // Courier vehicle type
  const vehicleType = tracking?.vehicleType || order?.deliveryVehicle || 'moto';
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
            <div style="width: 32px; height: 32px; background: #F59E0B; border: 2px solid #FFFFFF; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); box-shadow: 0 4px 10px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;">
              <div style="transform: rotate(45deg); font-size: 13px;">🍽️</div>
            </div>
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 32]
        });

        const dMarker = L.marker([driverLat, driverLng], { icon: driverIcon, zIndexOffset: 1000 }).addTo(map);
        const cMarker = L.marker([destLat, destLng], { icon: destIcon }).addTo(map);
        const sMarker = L.marker([storeLat, storeLng], { icon: storeIcon }).addTo(map);

        // Connective dash line between courier and destination
        const poly = L.polyline([[driverLat, driverLng], [destLat, destLng]], {
          color: '#E63946',
          weight: 4,
          dashArray: '8, 8',
          opacity: 0.75
        }).addTo(map);

        driverMarkerRef.current = dMarker;
        destMarkerRef.current = cMarker;
        storeMarkerRef.current = sMarker;
        routePolylineRef.current = poly;
        leafletMapRef.current = map;

        // Auto fit bounds to see both
        const bounds = L.latLngBounds([[driverLat, driverLng], [destLat, destLng]]);
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
      } else {
        // Update marker position smoothly
        if (driverMarkerRef.current) {
          driverMarkerRef.current.setLatLng([driverLat, driverLng]);
        }
        if (destMarkerRef.current) {
          destMarkerRef.current.setLatLng([destLat, destLng]);
        }
        if (routePolylineRef.current) {
          routePolylineRef.current.setLatLngs([[driverLat, driverLng], [destLat, destLng]]);
        }
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [isOpen, isUsingLeaflet, driverLat, driverLng, destLat, destLng, storeLat, storeLng, tracking?.heading, isBike]);

  // Clean up leaflet when closing modal
  useEffect(() => {
    if (!isOpen && leafletMapRef.current) {
      leafletMapRef.current.remove();
      leafletMapRef.current = null;
      driverMarkerRef.current = null;
      destMarkerRef.current = null;
      storeMarkerRef.current = null;
      routePolylineRef.current = null;
    }
  }, [isOpen]);

  if (!isOpen || !order) return null;

  // Status mapping
  const currentStep = tracking?.status || order.deliveryStep || 'accepted';

  const getStatusInfo = (step: string) => {
    switch (step) {
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
      case 'accepted':
      default:
        return {
          label: 'Domiciliario Asignado',
          desc: 'Preparando ruta para iniciar la entrega',
          color: 'bg-blue-500/20 text-blue-400 border-blue-500/30'
        };
    }
  };

  const statusInfo = getStatusInfo(currentStep);

  const driverName = tracking?.driverName || order.deliveryDriverName || 'Domiciliario Ryyco';
  const driverPhone = tracking?.driverPhone || order.deliveryDriverPhone;
  const vehiclePlate = tracking?.vehiclePlate || order.deliveryVehiclePlate;

  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${driverLat.toFixed(6)},${driverLng.toFixed(6)}&destination=${destLat.toFixed(6)},${destLng.toFixed(6)}`;

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
                  Seguimiento de mi Pedido
                </h3>
                <span className="font-mono text-xs font-black text-[#E63946] bg-[#E63946]/15 px-2 py-0.5 rounded-md border border-[#E63946]/30">
                  #{order.orderNumber}
                </span>
              </div>
              <p className="text-[11px] text-gray-400">
                {order.storeName || 'Tienda Aliada'} • Actualización satelital en vivo
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
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
          
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

          {/* Interactive Map */}
          <div className="relative rounded-2xl border border-gray-800 overflow-hidden bg-gray-950 h-[340px] shadow-inner">
            {mapProvider === 'google' && googleMapsApiKey ? (
              <APIProvider apiKey={googleMapsApiKey} libraries={['marker', 'places']}>
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
                    title={`Punto de entrega: ${order.customerAddress}`}
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
                    title={`Tienda: ${order.storeName}`}
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

          {/* Courier Card & Contact Details */}
          <div className="bg-[#111827] border border-[#232B3A] p-4 rounded-2xl space-y-3 shadow-lg">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase text-[#E63946] tracking-wider flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5 text-[#E63946]" />
                Datos del Domiciliario Asignado
              </span>
              <span className="text-[10px] text-gray-400 font-mono">
                {vehiclePlate ? `Placa: ${vehiclePlate}` : vehicleType.toUpperCase()}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-[#E63946]/30 to-[#F4B400]/30 border border-[#E63946]/40 flex items-center justify-center text-xl shrink-0">
                  {tracking?.driverPhoto ? (
                    <img 
                      src={tracking.driverPhoto} 
                      alt={driverName} 
                      className="w-full h-full object-cover rounded-2xl" 
                    />
                  ) : (
                    <span>{isBike ? '🚲' : '🛵'}</span>
                  )}
                </div>
                <div>
                  <h4 className="text-sm font-black text-white">{driverName}</h4>
                  <p className="text-xs text-gray-400">
                    {vehicleType.toUpperCase()} {vehiclePlate ? `• ${vehiclePlate}` : ''}
                  </p>
                </div>
              </div>

              {/* Action Buttons: WhatsApp & Call */}
              <div className="flex items-center gap-2">
                {driverPhone && (
                  <>
                    <a
                      href={`https://wa.me/57${driverPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hola ${driverName}, estoy siguiendo mi pedido #${order.orderNumber} en RYYCO. ¿Todo en orden?`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 sm:flex-none h-9 px-3 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-400 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition active:scale-95"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>WhatsApp</span>
                    </a>

                    <a
                      href={`tel:${driverPhone}`}
                      className="flex-1 sm:flex-none h-9 px-3 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition active:scale-95"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>Llamar</span>
                    </a>
                  </>
                )}
              </div>
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
                {order.customerAddress || 'Dirección registrada en el pedido'}
              </p>
              {order.customerName && (
                <p className="text-[11px] text-gray-400">
                  Cliente: <strong className="text-gray-300">{order.customerName}</strong>
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

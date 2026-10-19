import { useState, useEffect, useRef, useCallback } from 'react';
import type { OrderItem, DriverProfile, DeliveryTrackingData } from '../types';
import { updateDeliveryLiveLocation, stopDeliveryTracking } from '../lib/firebase';
import { acceptGpsPosition, shouldSendGps, GPS_HEARTBEAT_MS, GPS_FRESH_MS, type GpsPoint } from '../lib/deliveryTracking';

interface Props { activeDelivery: OrderItem | null; driver: DriverProfile | null }
type DevicePoint = GpsPoint & { latitude: number; longitude: number };

export function useDriverLiveTracking({ activeDelivery, driver }: Props) {
  const [isTracking, setIsTracking] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentCoords, setCurrentCoords] = useState<DevicePoint | null>(null);
  const latest = useRef({ activeDelivery, driver });
  latest.current = { activeDelivery, driver };
  const controls = useRef<{ start: () => void; stop: () => void; sync: () => void } | null>(null);
  const eligible = !!activeDelivery && !!driver && !['delivered', 'cancelled'].includes(activeDelivery.status) &&
    !['delivered', 'cancelled'].includes(activeDelivery.deliveryStep);

  useEffect(() => {
    setCurrentCoords(null);
    setLastUpdate(null);
    setError(null);
    if (!eligible || !activeDelivery || !driver) { setIsTracking(false); return; }
    const orderId = activeDelivery.id;
    let running = false, watch: number | null = null, timer: ReturnType<typeof setInterval> | undefined;
    let sample: GpsPoint | null = null, acknowledged: GpsPoint | null = null;
    let inFlight = false, lastAck = 0, lastAttempt = 0, retryAt = 0, failures = 0, force = false;
    let lastStatus = '', wrote = false, blocked = false, watchGeneration = 0;
    const flush = async () => {
      if (!running || inFlight || blocked || !sample || navigator.onLine === false || Date.now() < retryAt) return;
      const { activeDelivery: order, driver: courier } = latest.current;
      if (!order || !courier || order.id !== orderId || ['delivered', 'cancelled'].includes(order.status) ||
          ['delivered', 'cancelled'].includes(order.deliveryStep)) return;
      const now = Date.now(), elapsed = now - lastAck;
      if (lastAttempt && now - lastAttempt < 3_000) return;
      const fresh = now - sample.timestamp <= 15_000;
      const gpsDue = fresh && shouldSendGps(sample, acknowledged, elapsed);
      const heartbeatDue = wrote && elapsed >= GPS_HEARTBEAT_MS;
      const status = order.deliveryStep || 'accepted';
      if (!gpsDue && !heartbeatDue && !(fresh && (force || status !== lastStatus))) return;
      const sent = sample;
      inFlight = true;
      lastAttempt = now;
      force = false;
      const data: Partial<DeliveryTrackingData> & { orderId: string; driverId: string } = {
        orderId, driverId: courier.id || courier.uid,
        orderNumber: order.orderNumber,
        driverName: [courier.firstName, courier.lastName].filter(Boolean).join(' ') || courier.name || 'Domiciliario',
        driverPhone: courier.phone, driverPhoto: courier.photoURL || '',
        vehicleType: courier.vehicleType, vehiclePlate: courier.vehiclePlate || '',
        status, storeName: order.storeName, storeAddress: order.storeAddress, storeReference: order.storeReference,
        storeLat: order.storeLat, storeLng: order.storeLng,
        customerEmail: order.customerEmail?.trim().toLowerCase(),
        customerName: order.customerName, customerAddress: order.customerAddress,
        customerReference: order.customerReference, customerPhone: order.customerPhone,
        customerLat: order.customerLat, customerLng: order.customerLng, isTrackingActive: true,
        ...(fresh ? { lat: sent.lat, lng: sent.lng, accuracy: sent.accuracy,
          heading: sent.heading, speed: sent.speed ?? 0, gpsTimestamp: sent.timestamp } : {}),
      };
      try {
        await updateDeliveryLiveLocation(data);
        wrote = true;
        lastAck = Date.now();
        lastStatus = status;
        if (fresh) acknowledged = sent;
        failures = 0;
        if (running) {
          setLastUpdate(new Date(lastAck));
          setError(Date.now() - sample!.timestamp > GPS_FRESH_MS ? 'GPS sin señal reciente. La última posición no es actual.' : null);
        }
      } catch (err) {
        failures++;
        blocked = (err as { code?: string }).code === 'permission-denied';
        retryAt = Date.now() + Math.min(30_000, 3_000 * 2 ** (failures - 1));
        if (running) setError(blocked ? 'El GPS requiere una sesión válida de Firebase Authentication. Revisa tu acceso y reintenta.'
          : 'No se pudo transmitir el GPS. Se reintentará al recuperar la conexión.');
      } finally { inFlight = false; }
    };
    const stop = () => {
      running = false;
      watchGeneration++;
      if (watch !== null) navigator.geolocation.clearWatch(watch);
      watch = null;
      clearInterval(timer);
      setIsTracking(false);
      if (wrote || inFlight) {
        const order = latest.current.activeDelivery;
        const status = order?.id === orderId &&
          (order.status === 'cancelled' || order.deliveryStep === 'cancelled') ? 'cancelled'
          : order?.id === orderId && (order.status === 'delivered' || order.deliveryStep === 'delivered') ? 'delivered' : undefined;
        void stopDeliveryTracking(orderId, status).catch(() => {});
      }
    };
    const start = () => {
      if (running) return;
      if (!navigator.geolocation) { setError('Tu navegador no soporta GPS.'); return; }
      running = true;
      const generation = ++watchGeneration;
      setError(null);
      setIsTracking(true);
      watch = navigator.geolocation.watchPosition(position => {
        if (!running || generation !== watchGeneration) return;
        const point = acceptGpsPosition(position, sample);
        if (!point) { setError('Esperando una posición GPS reciente y precisa.'); return; }
        sample = point;
        setCurrentCoords({ ...point, latitude: point.lat, longitude: point.lng });
        if (!failures && navigator.onLine !== false) setError(null);
        void flush();
      }, err => {
        if (!running || generation !== watchGeneration) return;
        setError(err.code === 1 ? 'Permiso GPS denegado. Habilítalo y reintenta.' : 'Se perdió la señal GPS. Esperando una nueva posición.');
        if (err.code === 1) stop();
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 });
      timer = setInterval(() => {
        if (sample && Date.now() - sample.timestamp > GPS_FRESH_MS) setError('GPS sin señal reciente. La última posición no es actual.');
        else if (inFlight && Date.now() - lastAttempt > 15_000) setError('Esperando confirmación de la transmisión GPS.');
        void flush();
      }, 1_000);
    };
    const restartWatch = () => {
      if (watch !== null) navigator.geolocation.clearWatch(watch);
      clearInterval(timer);
      running = false;
      start();
    };
    const sync = () => {
      blocked = false; retryAt = 0; force = true;
      if (running && (!sample || Date.now() - sample.timestamp > 15_000)) restartWatch();
      else if (!running) start();
      void flush();
    };
    controls.current = { start, stop, sync };
    const online = () => { retryAt = 0; void flush(); };
    const offline = () => setError('Sin conexión. La ubicación no se está transmitiendo.');
    const resume = () => {
      if (document.visibilityState !== 'visible' || !running || (sample && Date.now() - sample.timestamp < 15_000)) return;
      restartWatch(); // Replace a suspended watch; never add a second observer.
    };
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    document.addEventListener('visibilitychange', resume);
    start();
    return () => {
      stop(); window.removeEventListener('online', online); window.removeEventListener('offline', offline);
      document.removeEventListener('visibilitychange', resume); controls.current = null;
    };
  }, [activeDelivery?.id, driver?.id, eligible]);

  return { isTracking, lastUpdate, error, currentCoords,
    startTracking: useCallback(() => controls.current?.start(), []),
    stopTracking: useCallback(() => controls.current?.stop(), []),
    manualForceSync: useCallback(() => controls.current?.sync(), []),
  };
}

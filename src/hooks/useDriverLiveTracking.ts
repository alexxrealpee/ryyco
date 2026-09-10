import { useState, useEffect, useRef, useCallback } from 'react';
import { OrderItem, DriverProfile, DeliveryTrackingData } from '../types';
import { updateDeliveryLiveLocation, stopDeliveryTracking } from '../lib/firebase';

interface UseDriverLiveTrackingProps {
  activeDelivery: OrderItem | null;
  driver: DriverProfile | null;
}

// Calculate distance between two coordinates in meters (Haversine formula)
function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function useDriverLiveTracking({ activeDelivery, driver }: UseDriverLiveTrackingProps) {
  const [isTracking, setIsTracking] = useState<boolean>(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lng: number; heading?: number; speed?: number } | null>(null);

  // References to prevent duplicate/unnecessary writes
  const lastWriteTimeRef = useRef<number>(0);
  const lastWriteCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const activeDeliveryIdRef = useRef<string | null>(null);

  // Keep track of active delivery ID
  useEffect(() => {
    activeDeliveryIdRef.current = activeDelivery?.id || null;
  }, [activeDelivery?.id]);

  // Synchronize location update to Firestore with rate-limiting and distance thresholds
  const pushLocationUpdate = useCallback(async (
    coords: GeolocationCoordinates, 
    force: boolean = false
  ) => {
    if (!activeDelivery || !driver) return;

    const now = Date.now();
    const lat = coords.latitude;
    const lng = coords.longitude;
    const heading = typeof coords.heading === 'number' && !isNaN(coords.heading) ? coords.heading : undefined;
    const speedKmh = typeof coords.speed === 'number' && !isNaN(coords.speed) && coords.speed > 0
      ? Math.round(coords.speed * 3.6) 
      : undefined;
    const accuracy = coords.accuracy || undefined;

    setCurrentCoords({ lat, lng, heading, speed: speedKmh });

    const timeSinceLastWrite = now - lastWriteTimeRef.current;
    let distanceMoved = 0;

    if (lastWriteCoordsRef.current) {
      distanceMoved = getDistanceMeters(
        lastWriteCoordsRef.current.lat,
        lastWriteCoordsRef.current.lng,
        lat,
        lng
      );
    }

    // Optimization rules:
    // 1. Minimum 3000ms (3 seconds) between writes to avoid spamming
    // 2. Write if:
    //    - Force is true (first launch or manual step advance)
    //    - Distance moved is significant (>= 10 meters)
    //    - Time elapsed is >= 4500ms (4.5s) AND distance is >= 2.5 meters
    // 3. If stationary (distance < 2.5 meters), send heartbeat only every 35 seconds
    const isFirstWrite = lastWriteTimeRef.current === 0;
    const isSignificantMove = distanceMoved >= 10 && timeSinceLastWrite >= 3000;
    const isStandardInterval = timeSinceLastWrite >= 4500 && distanceMoved >= 2.5;
    const isStationaryHeartbeat = timeSinceLastWrite >= 35000;

    if (force || isFirstWrite || isSignificantMove || isStandardInterval || isStationaryHeartbeat) {
      lastWriteTimeRef.current = now;
      lastWriteCoordsRef.current = { lat, lng };
      setLastUpdate(new Date());

      const trackingPayload: Partial<DeliveryTrackingData> & { orderId: string; driverId: string } = {
        orderId: activeDelivery.id,
        orderNumber: activeDelivery.orderNumber,
        driverId: driver.id,
        driverName: `${driver.firstName} ${driver.lastName}`.trim(),
        driverPhone: driver.phone,
        driverPhoto: driver.photoURL || '',
        vehicleType: driver.vehicleType,
        vehiclePlate: driver.vehiclePlate || '',
        lat,
        lng,
        heading,
        speed: speedKmh,
        accuracy,
        status: activeDelivery.deliveryStep || 'accepted',
        storeName: activeDelivery.storeName,
        storeAddress: activeDelivery.storeAddress,
        customerName: activeDelivery.customerName,
        customerAddress: activeDelivery.customerAddress,
        customerPhone: activeDelivery.customerPhone,
        customerLat: activeDelivery.customerLat,
        customerLng: activeDelivery.customerLng,
        isTrackingActive: true,
        updatedAt: new Date().toISOString()
      };

      await updateDeliveryLiveLocation(trackingPayload);
    }
  }, [activeDelivery, driver]);

  // Start tracking
  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setError("Tu navegador no soporta geolocalización GPS.");
      return;
    }

    setError(null);
    setIsTracking(true);

    // Initial position fetch
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        pushLocationUpdate(pos.coords, true);
      },
      (err) => {
        console.warn("Error getting initial GPS position:", err);
        setError("Por favor permite el acceso al GPS para transmitir tu ubicación.");
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 3000 }
    );

    // Continuous watch
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        pushLocationUpdate(pos.coords, false);
      },
      (err) => {
        console.warn("GPS watch error:", err);
        if (err.code === 1) {
          setError("Permiso de GPS denegado. Habilítalo en tu navegador.");
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 3000,
        timeout: 10000
      }
    );

    watchIdRef.current = watchId;
  }, [pushLocationUpdate]);

  // Stop tracking
  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsTracking(false);

    if (activeDeliveryIdRef.current) {
      stopDeliveryTracking(activeDeliveryIdRef.current);
    }
    lastWriteTimeRef.current = 0;
    lastWriteCoordsRef.current = null;
  }, []);

  // Force one immediate location sync (e.g. when advancing delivery status)
  const manualForceSync = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => pushLocationUpdate(pos.coords, true),
      () => {},
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 1000 }
    );
  }, [pushLocationUpdate]);

  // Auto start/stop tracking based on active delivery lifecycle
  useEffect(() => {
    // If active delivery exists and status is not 'delivered' or 'cancelled'
    const isDeliveryInProgress = 
      activeDelivery && 
      activeDelivery.status !== 'delivered' && 
      activeDelivery.status !== 'cancelled' &&
      activeDelivery.deliveryStep !== 'delivered';

    if (isDeliveryInProgress && driver) {
      startTracking();
    } else {
      stopTracking();
    }

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [activeDelivery?.id, activeDelivery?.deliveryStep, activeDelivery?.status, driver?.id]);

  return {
    isTracking,
    lastUpdate,
    error,
    currentCoords,
    startTracking,
    stopTracking,
    manualForceSync
  };
}

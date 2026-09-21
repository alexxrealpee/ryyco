/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Bike, 
  Car, 
  Power, 
  Bell, 
  CheckCircle2, 
  Clock, 
  MapPin, 
  Phone, 
  DollarSign, 
  Star, 
  AlertTriangle, 
  XCircle, 
  User, 
  LogOut, 
  RefreshCw, 
  ChevronRight, 
  Navigation, 
  ShoppingBag, 
  Lock, 
  Edit3, 
  Save, 
  Sparkles, 
  FileText, 
  Check, 
  MessageSquare,
  ArrowRight,
  ShieldAlert,
  Wifi,
  Lightbulb,
  ShieldCheck,
  Eye,
  EyeOff,
  Compass,
  ExternalLink,
  CreditCard,
  Banknote,
  Receipt,
  HelpCircle,
  Volume2,
  VolumeX,
  Radio,
  ChevronDown,
  ChevronUp,
  AlertCircle
} from 'lucide-react';
import { 
  fetchDriverProfileByUid, 
  fetchProfileByUid,
  updateDriverAvailability, 
  listenToUnassignedOrders, 
  acceptDeliveryOrderTransaction, 
  updateOrderDeliveryStep, 
  updateOrderDriverPaymentInfo,
  fetchDriverOrdersHistory, 
  fetchDriverRatings, 
  updateDriverProfile,
  registerDriverProfile,
  fetchSystemSettings,
  listenToSystemSettings
} from '../lib/firebase';
import { DriverProfile, OrderItem, VehicleType, DriverRating } from '../types';
import { useDriverLiveTracking } from '../hooks/useDriverLiveTracking';
import DeliveryTrackingModal from './DeliveryTrackingModal';
import { safeGetItem, safeSetItem, safeRemoveItem } from '../lib/safeStorage';
import { 
  extractCoordinates, 
  buildGoogleNavigationUrl, 
  buildWazeNavigationUrl, 
  buildGoogleMapSearchUrl,
  buildGoogleFullRouteUrl,
  calculateDistanceKm,
  formatDistanceKm,
  getOrderRouteDistance
} from '../lib/coordinateUtils';
import {
  playDriverOrderAlertChime,
  speakDriverVoiceAlert,
  requestDriverFCMPermission,
  getDriverFCMStatus,
  connectFCMStream,
  triggerDriverDeliveryPush
} from '../lib/fcmNotifications';

export const DRIVER_SESSION_STORAGE_KEY = 'ryyco_driver_session';

export function getStoredDriverSession(): DriverProfile | null {
  try {
    const raw = safeGetItem(DRIVER_SESSION_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && (parsed.id || parsed.uid)) {
        return parsed as DriverProfile;
      }
    }
  } catch (e) {
    console.warn("Could not retrieve driver session from storage:", e);
  }
  return null;
}

export function saveDriverSessionToStorage(driverProfile: DriverProfile): void {
  try {
    safeSetItem(DRIVER_SESSION_STORAGE_KEY, JSON.stringify(driverProfile));
    safeSetItem('ryyco_auth_mode', 'driver');
  } catch (e) {
    console.warn("Could not save driver session to storage:", e);
  }
}

export function clearDriverSessionStorage(): void {
  try {
    safeRemoveItem(DRIVER_SESSION_STORAGE_KEY);
    if (safeGetItem('ryyco_auth_mode') === 'driver') {
      safeRemoveItem('ryyco_auth_mode');
    }
  } catch (e) {
    console.warn("Could not clear driver session from storage:", e);
  }
}

interface DriverPortalProps {
  onNavigateHome: () => void;
  onNavigateRegister: () => void;
  initialDriver?: DriverProfile | null;
  onDriverSessionChange?: (driver: DriverProfile | null) => void;
}

export default function DriverPortal({ onNavigateHome, onNavigateRegister, initialDriver, onDriverSessionChange }: DriverPortalProps) {
  // Auth & Driver Session State - Initialized synchronously from props or localStorage
  const [driver, setDriver] = useState<DriverProfile | null>(() => {
    if (initialDriver) {
      saveDriverSessionToStorage(initialDriver);
      return initialDriver;
    }
    return getStoredDriverSession();
  });
  const [loginEmail, setLoginEmail] = useState<string>('');
  const [loginDocNumber, setLoginDocNumber] = useState<string>('');
  const [loginPassword, setLoginPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string>('');
  const [authLoading, setAuthLoading] = useState<boolean>(false);

  // Active view tab inside portal
  const [activeTab, setActiveTab] = useState<'deliveries' | 'history' | 'profile'>('deliveries');

  // Real-time Availability & Orders
  const [isAvailable, setIsAvailable] = useState<boolean>(() => {
    const init = initialDriver || getStoredDriverSession();
    return Boolean(init?.isAvailable);
  });
  const [availableOrders, setAvailableOrders] = useState<OrderItem[]>([]);
  const [activeDelivery, setActiveDelivery] = useState<OrderItem | null>(null);
  const [trackingPreviewOpen, setTrackingPreviewOpen] = useState<boolean>(false);
  const [showActiveOrderDetails, setShowActiveOrderDetails] = useState<boolean>(true);

  // Active store exact location and navigation data (resolved live from order or store profile)
  const [activeStoreLocation, setActiveStoreLocation] = useState<{
    lat?: number;
    lng?: number;
    mapUrl?: string;
    address?: string;
    reference?: string;
    phone?: string;
  } | null>(null);

  useEffect(() => {
    if (!activeDelivery) {
      setActiveStoreLocation(null);
      return;
    }

    let lat = activeDelivery.storeLat;
    let lng = activeDelivery.storeLng;
    let mapUrl = activeDelivery.storeMapUrl;
    let reference = activeDelivery.storeReference || (activeDelivery as any).restaurantReference;
    let phone = activeDelivery.storePhone;

    if (lat && lng && reference && phone) {
      setActiveStoreLocation({ lat, lng, mapUrl, address: activeDelivery.storeAddress, reference, phone });
      return;
    }

    if (mapUrl && reference && phone) {
      const parsed = extractCoordinates(mapUrl);
      if (parsed) {
        setActiveStoreLocation({ lat: parsed.lat, lng: parsed.lng, mapUrl, address: activeDelivery.storeAddress, reference, phone });
        return;
      }
    }

    // Attempt to fetch live store profile to get the most updated coordinates, reference and phone
    if (activeDelivery.storeOwnerId && activeDelivery.storeOwnerId !== 'store_general') {
      fetchProfileByUid(activeDelivery.storeOwnerId).then((storeProf) => {
        if (storeProf) {
          let sLat = storeProf.lat;
          let sLng = storeProf.lng;
          const sMap = (storeProf as any).mapUrl;
          const sRef = storeProf.restaurantReference || (storeProf as any).storeReference || reference;
          const sPhone = storeProf.customerServiceWhatsapp || storeProf.whatsapp || storeProf.ownerWhatsapp || storeProf.phone || phone;
          if ((!sLat || !sLng) && sMap) {
            const parsed = extractCoordinates(sMap);
            if (parsed) {
              sLat = parsed.lat;
              sLng = parsed.lng;
            }
          }
          setActiveStoreLocation({
            lat: sLat || lat,
            lng: sLng || lng,
            mapUrl: sMap || mapUrl,
            address: storeProf.restaurantAddress || storeProf.address || activeDelivery.storeAddress,
            reference: sRef,
            phone: sPhone
          });
        }
      }).catch(() => {});
    } else {
      setActiveStoreLocation({
        lat,
        lng,
        mapUrl,
        address: activeDelivery.storeAddress,
        reference,
        phone
      });
    }
  }, [activeDelivery?.id, activeDelivery?.storeOwnerId, activeDelivery?.storeLat, activeDelivery?.storeLng, activeDelivery?.storeMapUrl, activeDelivery?.storeReference, activeDelivery?.storePhone]);

  // Real-time GPS Geolocation Tracking Engine for Domiciliario
  const {
    isTracking: isGpsTracking,
    lastUpdate: lastGpsUpdate,
    error: gpsError,
    currentCoords,
    manualForceSync
  } = useDriverLiveTracking({
    activeDelivery,
    driver
  });

  // Incoming Order Modal Alert Popup
  const [selectedIncomingOrder, setSelectedIncomingOrder] = useState<OrderItem | null>(null);
  const selectedIncomingOrderRef = useRef<OrderItem | null>(null);
  selectedIncomingOrderRef.current = selectedIncomingOrder;
  const [incomingStoreRef, setIncomingStoreRef] = useState<string>('');
  const [systemDeliveryFee, setSystemDeliveryFee] = useState<number>(7000);
  const [claimingLoading, setClaimingLoading] = useState<boolean>(false);
  const [claimStatusMsg, setClaimStatusMsg] = useState<string>('');

  // Resolve store reference for incoming order popup modal
  useEffect(() => {
    if (!selectedIncomingOrder) {
      setIncomingStoreRef('');
      return;
    }

    const directRef = selectedIncomingOrder.storeReference || (selectedIncomingOrder as any).restaurantReference;
    if (directRef) {
      setIncomingStoreRef(directRef);
      return;
    }

    if (selectedIncomingOrder.storeOwnerId && selectedIncomingOrder.storeOwnerId !== 'store_general') {
      fetchProfileByUid(selectedIncomingOrder.storeOwnerId).then((storeProf) => {
        if (storeProf) {
          const sRef = storeProf.restaurantReference || (storeProf as any).storeReference || '';
          setIncomingStoreRef(sRef);
        }
      }).catch(() => {});
    } else {
      setIncomingStoreRef('');
    }
  }, [selectedIncomingOrder?.id, selectedIncomingOrder?.storeOwnerId, selectedIncomingOrder?.storeReference]);

  // History & Ratings
  const [orderHistory, setOrderHistory] = useState<OrderItem[]>([]);
  const [driverRatings, setDriverRatings] = useState<DriverRating[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  // Edit Profile Form State
  const [editPhone, setEditPhone] = useState<string>('');
  const [editAddress, setEditAddress] = useState<string>('');
  const [editCity, setEditCity] = useState<string>('');
  const [editVehicleType, setEditVehicleType] = useState<VehicleType>('moto');
  const [editVehicleBrand, setEditVehicleBrand] = useState<string>('');
  const [editVehiclePlate, setEditVehiclePlate] = useState<string>('');
  const [savingProfile, setSavingProfile] = useState<boolean>(false);
  const [profileSuccessMsg, setProfileSuccessMsg] = useState<string>('');

  // Sound chime synthesizer ref to play audio alert on new incoming request
  const audioCtxRef = useRef<AudioContext | null>(null);

  const playNotificationChime = () => {
    try {
      playDriverOrderAlertChime();
    } catch (e) {
      // Audio autoplay restrictions fallback
    }
  };

  // Push Notifications (FCM) State for Domiciliario
  const [fcmStatus, setFcmStatus] = useState(() => getDriverFCMStatus(driver?.id));
  const [activatingPush, setActivatingPush] = useState(false);
  const [pushNotificationFeedback, setPushNotificationFeedback] = useState<string>('');

  // Request & register FCM Push Notification token for this driver
  const handleEnablePushNotifications = async () => {
    if (!driver) return;
    setActivatingPush(true);
    setPushNotificationFeedback('');
    try {
      const res = await requestDriverFCMPermission(driver);
      if (res.success) {
        setFcmStatus(getDriverFCMStatus(driver.id));
        setPushNotificationFeedback('¡Notificaciones PUSH activadas con éxito en este dispositivo!');
        playDriverOrderAlertChime();
        speakDriverVoiceAlert('¡Notificaciones PUSH activadas para domiciliarios RYYCO!');
      } else {
        setPushNotificationFeedback(res.error || 'No se pudieron activar las notificaciones push.');
      }
    } catch (e: any) {
      setPushNotificationFeedback(e?.message || 'Error al solicitar permisos de notificación.');
    } finally {
      setActivatingPush(false);
      setTimeout(() => setPushNotificationFeedback(''), 5000);
    }
  };

  // Test push notification sound & voice alert
  const handleTestDriverAudioAlert = () => {
    playDriverOrderAlertChime();
    speakDriverVoiceAlert('¡Prueba de alerta sonora y de voz para domiciliarios RYYCO! Notificaciones activas.');
    setPushNotificationFeedback('Sonando alerta de domiciliario RYYCO...');
    setTimeout(() => setPushNotificationFeedback(''), 4000);
  };

  // Sync global system settings (default delivery fee) in real-time
  useEffect(() => {
    const unsubscribe = listenToSystemSettings((st) => {
      if (st?.defaultDeliveryFee) {
        setSystemDeliveryFee(st.defaultDeliveryFee);
      }
    });
    return () => unsubscribe();
  }, []);

  // Sync with initialDriver prop changes if provided from parent
  useEffect(() => {
    if (initialDriver) {
      setDriver(initialDriver);
      saveDriverSessionToStorage(initialDriver);
    }
  }, [initialDriver]);

  // Keep driver record updated with fresh Firestore data in the background on mount / refresh
  useEffect(() => {
    if (!driver?.id) return;
    let isCancelled = false;

    fetchDriverProfileByUid(driver.id)
      .then((fresh) => {
        if (isCancelled) return;
        if (fresh) {
          setDriver(fresh);
          saveDriverSessionToStorage(fresh);
          if (onDriverSessionChange) onDriverSessionChange(fresh);
        }
      })
      .catch((err) => {
        console.warn("Silent fallback: could not fetch latest driver record from Firestore:", err);
      });

    return () => {
      isCancelled = true;
    };
  }, [driver?.id]);

  useEffect(() => {
    if (driver) {
      setIsAvailable(driver.isAvailable || false);
      setEditPhone(driver.phone || '');
      setEditAddress(driver.address || '');
      setEditCity(driver.city || '');
      setEditVehicleType(driver.vehicleType || 'moto');
      setEditVehicleBrand(driver.vehicleBrand || '');
      setEditVehiclePlate(driver.vehiclePlate || '');
      loadHistoryAndRatings(driver.id);
      setFcmStatus(getDriverFCMStatus(driver.id));

      // Auto-register device FCM token with backend server so push notifications reach driver with browser closed
      try {
        const storedToken = localStorage.getItem(`ryyco_fcm_driver_token_${driver.id}`) || localStorage.getItem('ryyco_fcm_token');
        if (storedToken) {
          fetch('/api/fcm/register-driver-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token: storedToken,
              driverId: driver.id,
              driverName: (driver.firstName ? `${driver.firstName} ${driver.lastName || ''}` : driver.name || 'Domiciliario').trim(),
              phone: driver.phone || '',
              vehicleType: driver.vehicleType || 'moto'
            })
          }).catch(() => {});
        }
      } catch (err) {}
    }
  }, [driver?.id]);

  // Real-time Push Stream (FCM / SSE) and custom events listener
  useEffect(() => {
    if (!driver?.id || driver.status !== 'approved') return;

    // Disconnect handler
    const disconnectStream = connectFCMStream('driver', driver.id, (data) => {
      if (data.type === 'DRIVER_REQUEST_PUSH' && isAvailable && !activeDelivery) {
        playDriverOrderAlertChime();
        const sName = data.storeName || 'Restaurante';
        speakDriverVoiceAlert(`¡Nueva solicitud de domicilio en ${sName}!`);
      }
    });

    // Custom browser event when foreground push arrives
    const handleNewDriverRequest = (e: any) => {
      if (isAvailable && !activeDelivery) {
        playDriverOrderAlertChime();
        const store = e.detail?.storeName || 'Restaurante';
        speakDriverVoiceAlert(`¡Nueva solicitud de entrega en ${store}!`);
      }
    };

    // Service Worker message event when driver clicks push notification
    const handleSwMessage = (e: MessageEvent) => {
      if (e.data?.type === 'RYYCO_DRIVER_NOTIFICATION_CLICK') {
        playDriverOrderAlertChime();
      }
    };

    window.addEventListener('ryyco:new-driver-request', handleNewDriverRequest);
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSwMessage);
    }

    return () => {
      disconnectStream();
      window.removeEventListener('ryyco:new-driver-request', handleNewDriverRequest);
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleSwMessage);
      }
    };
  }, [driver?.id, driver?.status, isAvailable, activeDelivery]);

  // Real-time unassigned orders listener when available
  useEffect(() => {
    if (!driver || driver.status !== 'approved' || !isAvailable) {
      setAvailableOrders([]);
      return;
    }

    const unsubscribe = listenToUnassignedOrders((unassignedOrders) => {
      // Filter strictly for delivery orders in 'pending' status (excluding table orders and pickup orders)
      const pendingOrders = unassignedOrders.filter(o => {
        const isTableOrPickup = o.orderType === 'table' || o.orderType === 'pickup' || o.isTableOrder || o.customerName?.toLowerCase().startsWith('mesa ') || o.customerAddress?.toLowerCase().includes('mesa') || o.customerAddress?.toLowerCase().includes('recoger');
        return o.status === 'pending' && !isTableOrPickup;
      });
      setAvailableOrders(pendingOrders);

      // Auto-close popup modal if currently selected order is no longer available/pending
      setSelectedIncomingOrder(prev => {
        if (prev && !pendingOrders.some(o => o.id === prev.id)) {
          return null;
        }
        return prev;
      });

      // If new order arrived and modal not open, automatically pop up highest priority order
      if (pendingOrders.length > 0 && !activeDelivery) {
        const newest = pendingOrders[0];
        // If it's a new order id we haven't popped yet
        if (!selectedIncomingOrderRef.current || selectedIncomingOrderRef.current.id !== newest.id) {
          setSelectedIncomingOrder(newest);
          playDriverOrderAlertChime();
          const sName = newest.storeName || 'Restaurante';
          speakDriverVoiceAlert(`¡Nueva solicitud de entrega en ${sName}!`);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [driver, isAvailable, activeDelivery]);

  // Load order history and ratings for logged driver
  const loadHistoryAndRatings = async (driverId: string) => {
    setLoadingHistory(true);
    try {
      const history = await fetchDriverOrdersHistory(driverId);
      setOrderHistory(history);

      // Check if driver currently has an active in-progress delivery
      const active = history.find(o => 
        o.deliveryDriverId === driverId && 
        o.status !== 'delivered' && 
        o.status !== 'cancelled' &&
        o.deliveryStep !== 'delivered'
      );
      if (active) {
        setActiveDelivery(active);
      } else {
        setActiveDelivery(null);
      }

      const ratings = await fetchDriverRatings(driverId);
      setDriverRatings(ratings);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Login Handler
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    if (!loginEmail.trim() || !loginDocNumber.trim() || !loginPassword.trim()) {
      setLoginError('Por favor ingresa tu correo, número de documento y contraseña.');
      return;
    }

    setAuthLoading(true);
    try {
      const driverUid = `driver_${loginEmail.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      const found = await fetchDriverProfileByUid(driverUid);

      if (found) {
        // Verify doc match
        if (found.docNumber.trim() !== loginDocNumber.trim()) {
          setLoginError('El número de documento no coincide con el correo ingresado.');
          return;
        }

        // Verify password if set on account
        if (found.password && found.password.trim()) {
          if (found.password.trim() !== loginPassword.trim()) {
            setLoginError('La contraseña ingresada es incorrecta.');
            return;
          }
        } else {
          // If no password set yet in legacy profile, save the new password for future logins
          try {
            await updateDriverProfile(found.id, { password: loginPassword.trim() });
            found.password = loginPassword.trim();
          } catch (passErr) {
            console.warn('Could not update driver password:', passErr);
          }
        }

        setDriver(found);
        setIsAvailable(Boolean(found.isAvailable));
        saveDriverSessionToStorage(found);
        if (onDriverSessionChange) {
          onDriverSessionChange(found);
        }
      } else {
        setLoginError('No se encontró ninguna cuenta de domiciliario con esos datos. Por favor regístrate.');
      }
    } catch (err: any) {
      console.error(err);
      setLoginError('Error al iniciar sesión. Verifica tus datos.');
    } finally {
      setAuthLoading(false);
    }
  };

  // Logout Handler - Clears persistent storage and offline status
  const handleLogout = async () => {
    if (driver) {
      try {
        await updateDriverAvailability(driver.id, false);
      } catch (e) {
        console.error(e);
      }
    }
    clearDriverSessionStorage();
    setDriver(null);
    setIsAvailable(false);
    setActiveDelivery(null);
    setSelectedIncomingOrder(null);
    if (onDriverSessionChange) {
      onDriverSessionChange(null);
    }
  };

  // Toggle Availability Switch
  const handleToggleAvailability = async () => {
    if (!driver) return;
    if (driver.status !== 'approved') return;

    const nextState = !isAvailable;
    setIsAvailable(nextState);

    // If driver is turning on availability, request / refresh FCM push notification token if not granted
    if (nextState && typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default' || !fcmStatus.hasToken) {
        handleEnablePushNotifications();
      }
    }

    try {
      await updateDriverAvailability(driver.id, nextState);
      const updated: DriverProfile = { ...driver, isAvailable: nextState, isOnline: nextState };
      setDriver(updated);
      saveDriverSessionToStorage(updated);
      if (onDriverSessionChange) onDriverSessionChange(updated);
    } catch (e) {
      console.error("Error toggling availability:", e);
      setIsAvailable(!nextState);
    }
  };

  // Claim order transaction execution
  const handleAcceptOrder = async (orderToClaim: OrderItem) => {
    if (!driver) return;
    setClaimingLoading(true);
    setClaimStatusMsg('');

    try {
      const res = await acceptDeliveryOrderTransaction(orderToClaim.id, driver, systemDeliveryFee);
      if (res.success) {
        // Order assigned to this driver!
        setActiveDelivery({
          ...orderToClaim,
          storeReference: incomingStoreRef || orderToClaim.storeReference || (orderToClaim as any).restaurantReference,
          deliveryFee: systemDeliveryFee || orderToClaim.deliveryFee || 7000,
          deliveryDriverId: driver.id,
          deliveryDriverName: driver.name,
          deliveryDriverPhone: driver.phone,
          deliveryType: 'ryyco_driver',
          status: 'processing',
          deliveryStep: 'accepted'
        });
        setSelectedIncomingOrder(null);
        // Refresh history
        loadHistoryAndRatings(driver.id);
      } else {
        setClaimStatusMsg(res.message);
        setTimeout(() => {
          setSelectedIncomingOrder(null);
          setClaimStatusMsg('');
        }, 2500);
      }
    } catch (e: any) {
      setClaimStatusMsg(e.message || 'No se pudo reclamar el pedido.');
    } finally {
      setClaimingLoading(false);
    }
  };

  // Advance delivery step (4 simplified steps)
  const handleAdvanceStep = async (nextStep: OrderItem['deliveryStep']) => {
    if (!activeDelivery || !driver) return;
    try {
      await updateOrderDeliveryStep(activeDelivery.id, nextStep, driver.id, systemDeliveryFee || activeDelivery.deliveryFee || 7000);
      const computedStatus: OrderItem['status'] = 
        nextStep === 'delivered' ? 'delivered' : 
        (nextStep === 'to_client' || nextStep === 'at_destination') ? 'shipped' : 
        nextStep === 'picked_up' ? 'shipped' : 
        (nextStep === 'accepted' || nextStep === 'to_store' || nextStep === 'at_store') ? 'processing' :
        activeDelivery.status;

      const updated = {
        ...activeDelivery,
        deliveryStep: nextStep,
        status: computedStatus
      };
      setActiveDelivery(updated);

      // Force instant GPS telemetry refresh with new status
      manualForceSync();

      if (nextStep === 'delivered') {
        // Delivery completed!
        setActiveDelivery(null);
        // Refresh driver stats & order history
        const updatedDriver = await fetchDriverProfileByUid(driver.id);
        if (updatedDriver) {
          setDriver(updatedDriver);
          saveDriverSessionToStorage(updatedDriver);
          if (onDriverSessionChange) onDriverSessionChange(updatedDriver);
        }
        loadHistoryAndRatings(driver.id);
      }
    } catch (e) {
      console.error("Error updating delivery step:", e);
    }
  };

  // State & Handler for Restaurant and Customer COD payment verification (Etapa 1)
  const [paymentFeedbackMsg, setPaymentFeedbackMsg] = useState<string>('');

  const handleUpdatePaymentStatus = async (
    status: 'already_paid' | 'not_paid' | 'unconfirmed',
    codConfirmed?: boolean,
    paidToStore?: boolean
  ) => {
    if (!activeDelivery) return;
    const fee = systemDeliveryFee || activeDelivery.deliveryFee || 7000;
    const foodAmount = Math.max(0, (activeDelivery.totalAmount || 0) - fee);

    const updates: Partial<OrderItem> = {
      restaurantPaymentStatus: status,
      customerCodConfirmed: codConfirmed !== undefined ? codConfirmed : (status === 'already_paid' ? false : activeDelivery.customerCodConfirmed),
      driverPaidToRestaurant: paidToStore !== undefined ? paidToStore : (status === 'already_paid' ? false : activeDelivery.driverPaidToRestaurant),
      driverPaidAmount: paidToStore ? foodAmount : (paidToStore === false ? undefined : activeDelivery.driverPaidAmount),
      driverPaidAt: paidToStore ? new Date().toISOString() : (paidToStore === false ? undefined : activeDelivery.driverPaidAt)
    };

    const updated = {
      ...activeDelivery,
      ...updates
    };
    setActiveDelivery(updated);

    if (status === 'already_paid') {
      setPaymentFeedbackMsg('✓ Registrado: Pedido ya pagado al restaurante por el cliente.');
    } else if (status === 'not_paid' && !codConfirmed) {
      setPaymentFeedbackMsg('⚠️ Registrado: Pedido no pagado. Pregunta al cliente si paga contra entrega.');
    } else if (codConfirmed && !paidToStore) {
      setPaymentFeedbackMsg('✓ Cliente confirmó pago contra entrega. Procede a pagar al restaurante.');
    } else if (paidToStore) {
      setPaymentFeedbackMsg(`✓ ¡Pago de $${foodAmount.toLocaleString('es-CO')} registrado al restaurante! Recuerda recaudar $${(activeDelivery.totalAmount || 0).toLocaleString('es-CO')} al cliente.`);
    }
    setTimeout(() => setPaymentFeedbackMsg(''), 4500);

    try {
      await updateOrderDriverPaymentInfo(activeDelivery.id, updates);
    } catch (err) {
      console.error("Error updating driver payment info:", err);
    }
  };

  // Save Driver Profile Updates
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!driver) return;
    setSavingProfile(true);
    setProfileSuccessMsg('');

    try {
      const updates = {
        phone: editPhone.trim(),
        address: editAddress.trim(),
        city: editCity.trim(),
        vehicleType: editVehicleType,
        vehicleBrand: editVehicleBrand.trim(),
        vehiclePlate: editVehiclePlate.trim().toUpperCase()
      };

      await updateDriverProfile(driver.id, updates);

      const updated: DriverProfile = {
        ...driver,
        ...updates
      };

      setDriver(updated);
      saveDriverSessionToStorage(updated);
      if (onDriverSessionChange) onDriverSessionChange(updated);

      setProfileSuccessMsg('¡Perfil de domiciliario actualizado correctamente!');
      setTimeout(() => setProfileSuccessMsg(''), 3000);
    } catch (e) {
      console.error(e);
    } finally {
      setSavingProfile(false);
    }
  };

  // Helper to get step index (0-3)
  const getStepIndex = (step?: OrderItem['deliveryStep']) => {
    switch (step) {
      case 'accepted':
      case 'to_store':
      case 'at_store':
        return 0;
      case 'picked_up':
        return 1;
      case 'to_client':
      case 'at_destination':
        return 2;
      case 'delivered':
        return 3;
      default:
        return 0;
    }
  };

  // Helper to map delivery step labels
  const getStepLabel = (step?: OrderItem['deliveryStep']) => {
    switch (step) {
      case 'accepted':
      case 'to_store':
      case 'at_store':
        return '1. Pedido Aceptado';
      case 'picked_up':
        return '2. Recogiendo en Tienda';
      case 'to_client':
      case 'at_destination':
        return '3. En Camino al Cliente';
      case 'delivered':
        return '4. Pedido Entregado ✓';
      default:
        return '1. Pedido Aceptado';
    }
  };

  // Delivery Stepper Array (Simplified 4 steps)
  const deliverySteps: { key: OrderItem['deliveryStep']; label: string }[] = [
    { key: 'accepted', label: '1. Aceptado' },
    { key: 'picked_up', label: '2. Recogiendo en tienda' },
    { key: 'to_client', label: '3. En Camino' },
    { key: 'delivered', label: '4. Entregado ✓' }
  ];

  /* ==========================================================================
     UNAUTHENTICATED LOGIN SCREEN
     ========================================================================== */
  if (!driver) {
    return (
      <div className="min-h-screen bg-[#090B12] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 text-gray-100">
        <div className="max-w-md w-full mx-auto space-y-8">
          <div className="text-center">
            <div className="w-16 h-16 bg-[#E63946]/10 border border-[#E63946]/30 text-[#E63946] rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl shadow-[#E63946]/10">
              <Bike className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight">
              Portal de Domiciliarios
            </h2>
            <p className="text-xs text-[#A9B2C3] mt-2">
              Ingresa tus credenciales de repartidor independiente para recibir y gestionar entregas en tiempo real.
            </p>
          </div>

          <div className="bg-[#111827] border border-[#232B3A] rounded-2xl p-6 sm:p-8 shadow-2xl">
            {loginError && (
              <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-semibold rounded-xl flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#A9B2C3] mb-1.5">Correo Electrónico Registrado</label>
                <input
                  type="email"
                  required
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="ejemplo@correo.com"
                  className="w-full bg-[#090B12] border border-[#232B3A] rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-[#A9B2C3]/60 focus:outline-none focus:border-[#E63946] transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#A9B2C3] mb-1.5">Número de Documento (Cédula/NIT)</label>
                <input
                  type="text"
                  required
                  value={loginDocNumber}
                  onChange={(e) => setLoginDocNumber(e.target.value)}
                  placeholder="Ej. 1020304050"
                  className="w-full bg-[#090B12] border border-[#232B3A] rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-[#A9B2C3]/60 focus:outline-none focus:border-[#E63946] transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#A9B2C3] mb-1.5">Contraseña</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Ingresa tu contraseña"
                    className="w-full bg-[#090B12] border border-[#232B3A] rounded-xl pl-3.5 pr-11 py-2.5 text-sm text-white placeholder-[#A9B2C3]/60 focus:outline-none focus:border-[#E63946] transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A9B2C3] hover:text-white transition p-1 cursor-pointer"
                    title={showPassword ? "Ocultar contraseña" : "Ver contraseña"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-3 bg-[#E63946] hover:bg-[#D62839] text-white font-black text-sm rounded-xl transition cursor-pointer shadow-lg shadow-[#E63946]/20 flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
              >
                {authLoading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent animate-spin rounded-full" />
                ) : (
                  <>
                    <Bike className="w-4 h-4" />
                    <span>Ingresar al Portal</span>
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 pt-6 border-t border-[#232B3A] text-center space-y-3">
              <p className="text-xs text-[#A9B2C3]">
                ¿Aún no estás registrado como domiciliario?
              </p>
              <button
                type="button"
                onClick={onNavigateRegister}
                className="w-full py-2.5 bg-[#090B12] hover:bg-[#232B3A] text-[#E63946] font-bold text-xs rounded-xl border border-[#232B3A] transition cursor-pointer flex items-center justify-center gap-2"
              >
                <span>Registrarse como Domiciliario</span>
                <ChevronRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={onNavigateHome}
                className="text-xs text-[#A9B2C3] hover:text-white transition block mx-auto pt-2 cursor-pointer"
              >
                ← Volver al sitio principal
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ==========================================================================
     MAIN LOGGED-IN DRIVER DASHBOARD & STATUS CHECKS
     ========================================================================== */
  const effectiveStorePhone = activeDelivery ? (activeDelivery.storePhone || activeStoreLocation?.phone) : undefined;

  return (
    <div className="min-h-screen bg-[#090B12] text-gray-100 flex flex-col">
      {/* Top Portal Navbar */}
      <header className="bg-[#111827]/95 backdrop-blur-md border-b border-[#232B3A] px-4 py-3 sticky top-0 z-30 shadow-lg">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              <img
                src={driver.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(driver.firstName)}`}
                alt="Foto de Perfil"
                className="w-11 h-11 rounded-2xl object-cover border border-[#E63946]/30 bg-[#090B12] shadow-md"
              />
              <span 
                className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#111827] ${
                  isAvailable ? 'bg-[#E63946] ring-2 ring-[#E63946]/40 animate-pulse' : 'bg-gray-600'
                }`} 
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-extrabold text-white tracking-tight">{driver.firstName} {driver.lastName}</h1>
                <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-[#E63946]/10 text-[#E63946] border border-[#E63946]/20">
                  {driver.vehicleType}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-[#A9B2C3]">
                <span className="flex items-center gap-1 text-[#F4B400] font-extrabold">
                  <Star className="w-3.5 h-3.5 fill-[#F4B400] text-[#F4B400]" /> {driver.rating?.toFixed(1) || '5.0'}
                </span>
                <span>•</span>
                <span>{driver.completedDeliveriesCount || 0} entregas</span>
              </div>
            </div>
          </div>

          {/* Right Action Controls */}
          <div className="flex items-center gap-2">
            {/* FCM Push Notification Control */}
            {driver.status === 'approved' && (
              <>
                {fcmStatus.hasToken ? (
                  <button
                    onClick={handleTestDriverAudioAlert}
                    title="Probar sonido y voz de alerta de pedido (Notificaciones PUSH Activas)"
                    className="px-2.5 py-2 bg-[#090B12] hover:bg-emerald-500/15 text-emerald-400 hover:text-emerald-300 rounded-2xl border border-emerald-500/30 transition cursor-pointer flex items-center gap-1.5 text-xs font-bold shadow-sm active:scale-95"
                  >
                    <Volume2 className="w-4 h-4 text-emerald-400" />
                    <span className="hidden md:inline">Alerta PUSH OK</span>
                  </button>
                ) : (
                  <button
                    onClick={handleEnablePushNotifications}
                    disabled={activatingPush}
                    title="Activar notificaciones PUSH con Firebase para recibir pedidos en tiempo real"
                    className="px-3 py-2 bg-gradient-to-r from-amber-500 via-[#E63946] to-[#D62839] hover:brightness-110 text-white rounded-2xl font-black text-xs flex items-center gap-1.5 transition cursor-pointer shadow-md active:scale-95 animate-pulse"
                  >
                    <Bell className="w-4 h-4" />
                    <span className="hidden sm:inline">{activatingPush ? 'Activando...' : 'Activar PUSH'}</span>
                  </button>
                )}
              </>
            )}

            {/* Availability Switch */}
            {driver.status === 'approved' && (
              <button
                onClick={handleToggleAvailability}
                className={`px-3.5 py-2 rounded-2xl font-black text-xs flex items-center gap-2 transition cursor-pointer shadow-md active:scale-95 ${
                  isAvailable 
                    ? 'bg-gradient-to-r from-[#E63946] to-[#D62839] text-white shadow-[#E63946]/20 hover:brightness-110' 
                    : 'bg-[#090B12] text-[#A9B2C3] hover:bg-[#232B3A] border border-[#232B3A]'
                }`}
              >
                <Power className={`w-4 h-4 ${isAvailable ? 'animate-pulse' : ''}`} />
                <span className="hidden sm:inline">{isAvailable ? 'Disponible' : 'No disponible'}</span>
                <span className="sm:hidden">{isAvailable ? 'On' : 'Off'}</span>
              </button>
            )}

            <button
              onClick={handleLogout}
              title="Cerrar sesión / Salir"
              aria-label="Cerrar sesión y salir del portal de domiciliarios"
              className="px-3 py-2 bg-[#090B12] hover:bg-rose-500/10 text-[#A9B2C3] hover:text-rose-400 hover:border-rose-500/30 rounded-2xl border border-[#232B3A] transition cursor-pointer flex items-center gap-1.5 shadow-sm active:scale-95 group"
            >
              <LogOut className="w-4 h-4 group-hover:text-rose-400 transition-colors" />
              <span className="text-xs font-bold hidden sm:inline group-hover:text-rose-400 transition-colors">Salir</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto w-full p-4 sm:p-6 flex-1 space-y-6 pb-28 sm:pb-12">

        {/* ------------------------------------------------------------------
            STATUS 1: PENDING APPROVAL
           ------------------------------------------------------------------ */}
        {driver.status === 'pending' && (
          <div className="bg-[#111827] border border-[#F4B400]/30 rounded-2xl p-6 sm:p-8 text-center space-y-4 shadow-xl">
            <div className="w-16 h-16 bg-[#F4B400]/10 border border-[#F4B400]/30 text-[#F4B400] rounded-2xl flex items-center justify-center mx-auto shadow-md">
              <Clock className="w-8 h-8 animate-spin" />
            </div>

            <h2 className="text-xl sm:text-2xl font-black text-white">
              Cuenta Pendiente de Aprobación
            </h2>

            {/* Banner Message */}
            <div className="bg-[#090B12] border border-[#F4B400]/30 rounded-xl p-5 max-w-2xl mx-auto text-left shadow-inner">
              <p className="text-sm text-[#F4B400] leading-relaxed font-medium">
                "Su solicitud fue enviada correctamente. Nuestro equipo revisará la información registrada. Una vez sea aprobada, recibirá una notificación y podrá comenzar a recibir pedidos."
              </p>
            </div>

            <p className="text-xs text-[#A9B2C3] max-w-lg mx-auto">
              Mientras tu cuenta esté en revisión no podrás activar tu disponibilidad ni recibir solicitudes de pedidos.
            </p>

            <div className="pt-2">
              <button
                onClick={() => {
                  fetchDriverProfileByUid(driver.id).then(d => {
                    if (d) {
                      setDriver(d);
                      saveDriverSessionToStorage(d);
                      if (onDriverSessionChange) onDriverSessionChange(d);
                    }
                  });
                }}
                className="px-5 py-2.5 bg-[#090B12] hover:bg-[#232B3A] text-white font-bold text-xs rounded-xl border border-[#232B3A] transition cursor-pointer inline-flex items-center gap-2"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Verificar Estado de Aprobación</span>
              </button>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------
            STATUS 2: REJECTED
           ------------------------------------------------------------------ */}
        {driver.status === 'rejected' && (
          <div className="bg-[#111827] border border-[#E63946]/30 rounded-2xl p-6 sm:p-8 text-center space-y-4 shadow-xl">
            <div className="w-16 h-16 bg-[#E63946]/10 border border-[#E63946]/30 text-[#E63946] rounded-2xl flex items-center justify-center mx-auto">
              <XCircle className="w-8 h-8" />
            </div>

            <h2 className="text-xl sm:text-2xl font-black text-white">
              Solicitud de Registro Rechazada
            </h2>

            <div className="bg-[#090B12] border border-[#E63946]/30 rounded-xl p-4 max-w-xl mx-auto text-left">
              <span className="text-[10px] font-extrabold uppercase text-[#E63946] block mb-1">Motivo del rechazo:</span>
              <p className="text-sm text-rose-200 font-medium">
                {driver.rejectionReason || 'La información ingresada requiere corrección por parte del administrador.'}
              </p>
            </div>

            <p className="text-xs text-[#A9B2C3] max-w-lg mx-auto">
              Puedes corregir la información de tu vehículo o perfil a continuación y volver a enviar tu solicitud de aprobación.
            </p>

            <button
              onClick={() => setActiveTab('profile')}
              className="px-6 py-2.5 bg-[#E63946] hover:bg-[#D62839] text-white font-black text-xs rounded-xl transition cursor-pointer inline-flex items-center gap-2 shadow-lg shadow-[#E63946]/20"
            >
              <Edit3 className="w-4 h-4" />
              <span>Corregir Información y Volver a Solicitar</span>
            </button>
          </div>
        )}

        {/* ------------------------------------------------------------------
            STATUS 3: SUSPENDED
           ------------------------------------------------------------------ */}
        {driver.status === 'suspended' && (
          <div className="bg-[#111827] border border-[#E63946]/30 rounded-2xl p-6 sm:p-8 text-center space-y-4 shadow-xl">
            <div className="w-16 h-16 bg-[#E63946]/10 border border-[#E63946]/30 text-[#E63946] rounded-2xl flex items-center justify-center mx-auto">
              <ShieldAlert className="w-8 h-8" />
            </div>

            <h2 className="text-xl font-black text-white">
              Cuenta Suspendida Temporalmente
            </h2>

            <p className="text-sm text-[#A9B2C3] max-w-xl mx-auto leading-relaxed">
              Tu cuenta de domiciliario ha sido suspendida por el administrador del sistema. No podrás activar tu disponibilidad ni recibir pedidos hasta que el administrador reactive tu cuenta.
            </p>
          </div>
        )}

        {/* ------------------------------------------------------------------
            STATUS 4: APPROVED DRIVER WORKSPACE
           ------------------------------------------------------------------ */}
        {driver.status === 'approved' && (
          <div className="space-y-6">

            {/* FCM Feedback Toast Message */}
            {pushNotificationFeedback && (
              <div className="bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 text-xs font-bold rounded-2xl p-3.5 flex items-center justify-between gap-3 shadow-lg animate-fade-in">
                <div className="flex items-center gap-2.5">
                  <Bell className="w-4 h-4 text-emerald-400 shrink-0 animate-bounce" />
                  <span>{pushNotificationFeedback}</span>
                </div>
                <button
                  onClick={() => setPushNotificationFeedback('')}
                  className="text-emerald-400 hover:text-emerald-200 text-xs font-extrabold cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Push Notifications Activation Card (If not yet enabled) */}
            {!fcmStatus.hasToken && (
              <div className="bg-gradient-to-r from-amber-500/10 via-[#E63946]/10 to-[#111827] border border-[#E63946]/30 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl">
                <div className="flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-2xl bg-[#E63946]/20 border border-[#E63946]/30 text-[#E63946] flex items-center justify-center shrink-0 mt-0.5">
                    <Bell className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-white flex items-center gap-2">
                      <span>Notificaciones PUSH con Firebase Cloud Messaging (FCM)</span>
                      <span className="text-[10px] bg-[#E63946]/20 text-[#E63946] px-2 py-0.5 rounded-full font-bold">Recomendado</span>
                    </h3>
                    <p className="text-xs text-[#A9B2C3] mt-1 max-w-xl leading-relaxed">
                      Activa las alertas PUSH para recibir solicitudes de entrega al instante con timbre sonoro y voz en segundo plano, incluso si tu teléfono está bloqueado o tienes otra app abierta.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                  <button
                    onClick={handleTestDriverAudioAlert}
                    className="flex-1 sm:flex-none px-3.5 py-2.5 bg-[#090B12] hover:bg-[#232B3A] text-gray-200 border border-[#232B3A] rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                  >
                    <Volume2 className="w-4 h-4 text-emerald-400" />
                    <span>Probar Alerta</span>
                  </button>
                  <button
                    onClick={handleEnablePushNotifications}
                    disabled={activatingPush}
                    className="flex-1 sm:flex-none px-4 py-2.5 bg-gradient-to-r from-[#E63946] to-[#D62839] hover:brightness-110 text-white rounded-xl text-xs font-black transition flex items-center justify-center gap-2 shadow-lg shadow-[#E63946]/25 cursor-pointer active:scale-95"
                  >
                    <Bell className="w-4 h-4" />
                    <span>{activatingPush ? 'Activando...' : 'Activar PUSH Ahora'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Availability Alert Header */}
            {!isAvailable && !activeDelivery && (
              <div className="bg-[#F4B400]/10 border border-[#F4B400]/20 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-3 text-[#F4B400] text-xs">
                  <Power className="w-5 h-5 text-[#F4B400] shrink-0" />
                  <span>
                    <strong>Actualmente estás No Disponible.</strong> Para comenzar a recibir solicitudes de entregas en tiempo real, activa tu disponibilidad.
                  </span>
                </div>
                <button
                  onClick={handleToggleAvailability}
                  className="px-4 py-2 bg-[#E63946] hover:bg-[#D62839] text-white font-black text-xs rounded-xl transition cursor-pointer shrink-0 shadow-md"
                >
                  Activar Disponibilidad
                </button>
              </div>
            )}



            {/* TAB 1: DELIVERIES WORKSPACE */}
            {activeTab === 'deliveries' && (
              <div className="space-y-6">

                {/* ACTIVE DELIVERY IN PROGRESS TRACKER */}
                {activeDelivery ? (
                  <div className="bg-[#111827] border-2 border-[#E63946]/40 rounded-2xl p-6 shadow-2xl space-y-6">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-[#232B3A] pb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black uppercase tracking-wider bg-[#E63946]/20 text-[#E63946] px-2.5 py-0.5 rounded-full border border-[#E63946]/30">
                            Entrega en Curso
                          </span>
                          <span className="text-xs font-mono text-[#A9B2C3]">Pedido #{activeDelivery.orderNumber}</span>
                        </div>
                        <h2 className="text-lg font-black text-white mt-1">
                          {activeDelivery.storeName || 'Tienda Aliada'}
                        </h2>
                      </div>

                      <div className="text-right">
                        <span className="text-xs text-[#A9B2C3] block">Valor del Domicilio</span>
                        <span className="text-xl font-black text-[#E63946]">
                          ${(systemDeliveryFee || activeDelivery.deliveryFee || 7000).toLocaleString('es-CO')}
                        </span>
                      </div>
                    </div>

                    {/* Progressive Stepper Display */}
                    <div className="bg-[#090B12] border border-[#232B3A] p-3 sm:p-4 rounded-2xl space-y-3.5 shadow-inner">
                      {(() => {
                        const currentIdx = getStepIndex(activeDelivery.deliveryStep);
                        const currentStepObj = deliverySteps[currentIdx] || deliverySteps[0];
                        const currentLabel = currentStepObj.label.split('.')[1]?.trim() || 'En Proceso';

                        return (
                          <>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] sm:text-xs font-black text-[#A9B2C3] uppercase tracking-wider">
                                Paso {currentIdx + 1} de {deliverySteps.length}
                              </span>
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#E63946]/15 border border-[#E63946]/35 text-[#E63946] text-[10px] sm:text-xs font-black">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#E63946] animate-pulse" />
                                <span>{currentLabel}</span>
                              </span>
                            </div>

                            <div className="relative pt-1 px-1 sm:px-2">
                              {/* Background track */}
                              <div className="absolute top-4 sm:top-5 left-6 right-6 h-0.5 bg-[#1F2937] -translate-y-1/2 z-0" />
                              
                              {/* Active progress bar */}
                              <div
                                className={`absolute top-4 sm:top-5 left-6 h-0.5 bg-gradient-to-r from-[#E63946] to-[#ff5d6c] -translate-y-1/2 z-0 transition-all duration-300 ${
                                  currentIdx === 0 ? 'w-0' :
                                  currentIdx === 1 ? 'w-[33%]' :
                                  currentIdx === 2 ? 'w-[66%]' :
                                  'w-[calc(100%-3rem)]'
                                }`}
                              />

                              <div className="relative z-10 flex items-start justify-between">
                                {deliverySteps.map((s, idx) => {
                                  const isDone = idx < currentIdx;
                                  const isCurrent = idx === currentIdx;

                                  const shortLabel = idx === 0 ? 'Aceptado' : idx === 1 ? 'En Tienda' : idx === 2 ? 'En Camino' : 'Entregado';
                                  const fullLabel = s.label.split('.')[1]?.trim();

                                  return (
                                    <div key={s.key} className="flex flex-col items-center flex-1">
                                      <div
                                        className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[11px] sm:text-xs font-black transition-all duration-200 shadow-md ${
                                          isCurrent
                                            ? 'bg-[#E63946] text-white ring-4 ring-[#E63946]/25 scale-110'
                                            : isDone
                                            ? 'bg-[#E63946] text-white'
                                            : 'bg-[#111827] text-gray-500 border-2 border-[#232B3A]'
                                        }`}
                                      >
                                        {isDone ? (
                                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                                        ) : (
                                          <span>{idx + 1}</span>
                                        )}
                                      </div>
                                      <div className="mt-1.5 text-center px-0.5">
                                        <span
                                          className={`block text-[10px] sm:text-xs leading-tight font-extrabold transition-colors ${
                                            isCurrent
                                              ? 'text-[#E63946]'
                                              : isDone
                                              ? 'text-gray-200'
                                              : 'text-gray-500'
                                          }`}
                                        >
                                          <span className="sm:hidden">{shortLabel}</span>
                                          <span className="hidden sm:inline">{fullLabel}</span>
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </>
                        );
                      })()}
                    </div>

                    {/* DETALLES COMPLETOS DEL PEDIDO EN CURSO (PRODUCTOS, NOTAS Y VALORES) */}
                    {(() => {
                      const deliveryFeeVal = systemDeliveryFee || activeDelivery.deliveryFee || 7000;
                      const totalOrderAmount = activeDelivery.totalAmount || 0;
                      const foodCost = Math.max(0, totalOrderAmount - deliveryFeeVal);
                      const itemsCount = activeDelivery.items?.length || 0;
                      const totalUnits = activeDelivery.items?.reduce((acc, it) => acc + (it.quantity || 1), 0) || 0;
                      const isCashOrCod = activeDelivery.paymentMethod === 'whatsapp' || 
                                          activeDelivery.paymentMethod === 'cod' || 
                                          activeDelivery.paymentMethod === 'delivery_cash';

                      return (
                        <div className="bg-[#090D16] border border-[#232B3A] rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-xl">
                          <div className="flex items-center justify-between border-b border-[#1C2433] pb-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center border border-amber-500/30">
                                <ShoppingBag className="w-4 h-4" />
                              </div>
                              <div>
                                <h3 className="text-sm font-black text-white flex items-center gap-2 flex-wrap">
                                  <span>Detalles del Pedido</span>
                                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/25">
                                    {itemsCount} {itemsCount === 1 ? 'producto' : 'productos'} • {totalUnits} {totalUnits === 1 ? 'unidad' : 'unidades'}
                                  </span>
                                </h3>
                                <p className="text-[11px] text-gray-400">
                                  Productos a reclamar en tienda y entregar al cliente
                                </p>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => setShowActiveOrderDetails(!showActiveOrderDetails)}
                              className="text-xs text-gray-300 hover:text-white px-2.5 py-1.5 rounded-lg bg-[#111827] hover:bg-[#1C2433] border border-[#232B3A] flex items-center gap-1.5 transition cursor-pointer shrink-0"
                            >
                              <span>{showActiveOrderDetails ? 'Ocultar' : 'Ver detalle'}</span>
                              {showActiveOrderDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5 text-amber-400" />}
                            </button>
                          </div>

                          {showActiveOrderDetails && (
                            <div className="space-y-3 pt-1">
                              {/* Lista de productos */}
                              {activeDelivery.items && activeDelivery.items.length > 0 ? (
                                <div className="space-y-2 bg-[#05070D] border border-[#1C2433] p-3 rounded-xl max-h-60 overflow-y-auto divide-y divide-[#1C2433]/70">
                                  {activeDelivery.items.map((item, idx) => (
                                    <div key={idx} className="pt-2.5 first:pt-0 flex items-start justify-between gap-3 text-xs">
                                      <div className="flex items-start gap-2.5 flex-1 min-w-0">
                                        <span className="bg-[#E63946]/20 text-[#E63946] font-black text-xs px-2 py-0.5 rounded-md border border-[#E63946]/35 shrink-0">
                                          {item.quantity}x
                                        </span>
                                        <div className="min-w-0 flex-1">
                                          <span className="font-bold text-white block text-sm leading-tight">
                                            {item.name}
                                          </span>
                                          {item.selectedVariant && (
                                            <span className="text-[11px] text-amber-300/90 block mt-0.5">
                                              Opción / Sabor: <strong>{item.selectedVariant}</strong>
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                      <span className="text-gray-300 font-mono font-bold text-xs shrink-0 text-right">
                                        ${((item.price || 0) * (item.quantity || 1)).toLocaleString('es-CO')}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="p-3 bg-[#05070D] border border-[#1C2433] rounded-xl text-xs text-gray-400 italic">
                                  No hay desglose de productos individuales disponible para este pedido.
                                </div>
                              )}

                              {/* Observaciones o Notas del cliente */}
                              {activeDelivery.notes && (
                                <div className="p-3 bg-amber-500/10 border border-amber-500/25 rounded-xl text-xs text-amber-200 flex items-start gap-2">
                                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                  <div>
                                    <strong className="text-amber-300 block text-xs">Notas / Observaciones del Cliente:</strong>
                                    <p className="mt-0.5 text-[11px] leading-relaxed">{activeDelivery.notes}</p>
                                  </div>
                                </div>
                              )}

                              {/* Resumen Financiero y Cobro */}
                              <div className="bg-[#05070D] border border-[#1C2433] p-3.5 rounded-xl space-y-2.5 text-xs">
                                <div className="flex items-center justify-between border-b border-[#1C2433] pb-2">
                                  <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                                    <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                                    <span>Resumen Financiero del Pedido</span>
                                  </span>
                                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-[#111827] text-gray-300 border border-[#232B3A]">
                                    Pago: {activeDelivery.paymentMethod}
                                  </span>
                                </div>

                                <div className="space-y-1.5 pt-0.5">
                                  <div className="flex justify-between text-gray-300">
                                    <span>Valor Comida / Productos:</span>
                                    <strong className="text-white font-mono">${foodCost.toLocaleString('es-CO')} COP</strong>
                                  </div>
                                  <div className="flex justify-between text-gray-300">
                                    <span className="text-emerald-300 font-bold">Ganancia Domicilio (Tu Pago):</span>
                                    <strong className="text-emerald-400 font-mono font-bold">${deliveryFeeVal.toLocaleString('es-CO')} COP</strong>
                                  </div>
                                  <div className="flex justify-between items-center pt-2 border-t border-[#1C2433]">
                                    <div>
                                      <span className="text-white font-bold block text-sm">Valor Total del Pedido:</span>
                                      <span className="text-[10px] text-gray-400 block">
                                        {isCashOrCod ? 'Monto a cobrar en efectivo al cliente' : 'Total cancelado por el cliente'}
                                      </span>
                                    </div>
                                    <span className="text-lg font-black text-[#E63946] font-mono">
                                      ${totalOrderAmount.toLocaleString('es-CO')} COP
                                    </span>
                                  </div>
                                </div>

                                {isCashOrCod ? (
                                  <div className="mt-2 p-2.5 bg-emerald-500/10 border border-emerald-500/25 rounded-lg text-[11px] text-emerald-300 flex items-start gap-2">
                                    <Banknote className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                                    <div>
                                      <strong className="block text-emerald-300">Cobro en Efectivo Contra Entrega:</strong>
                                      <span>Debes recaudar exactamente <strong>${totalOrderAmount.toLocaleString('es-CO')} COP</strong> al entregar al cliente.</span>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="mt-2 p-2.5 bg-sky-500/10 border border-sky-500/25 rounded-lg text-[11px] text-sky-300 flex items-start gap-2">
                                    <Receipt className="w-4 h-4 shrink-0 text-sky-400 mt-0.5" />
                                    <div>
                                      <strong className="block text-sky-300">Pago Digital Confirmado:</strong>
                                      <span>El cliente ya transfirió el valor del pedido. Solo entrega los productos.</span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Panel de Ruta Completa en 2 Etapas: Domiciliario -> Restaurante -> Cliente */}
                    {(() => {
                      const currentStepIdx = getStepIndex(activeDelivery.deliveryStep);
                      const isPickedUp = currentStepIdx >= 2;
                      const driverHasGps = !!currentCoords?.latitude && !!currentCoords?.longitude;

                      const deliveryFeeVal = systemDeliveryFee || activeDelivery.deliveryFee || 7000;
                      const totalOrderAmount = activeDelivery.totalAmount || 0;
                      const foodCost = Math.max(0, totalOrderAmount - deliveryFeeVal);
                      const restPaymentStatus = activeDelivery.restaurantPaymentStatus || 'unconfirmed';
                      const codConfirmed = !!activeDelivery.customerCodConfirmed;
                      const driverPaid = !!activeDelivery.driverPaidToRestaurant;
                      const paidAmount = activeDelivery.driverPaidAmount || foodCost;

                      return (
                        <div className="bg-[#090D16] border border-[#232B3A] rounded-2xl p-4 sm:p-5 space-y-4 shadow-xl">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#1C2433] pb-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-xl bg-cyan-500/15 text-cyan-400 flex items-center justify-center border border-cyan-500/30">
                                <Compass className="w-4 h-4" />
                              </div>
                              <div>
                                <h3 className="text-sm font-black text-white flex items-center gap-2">
                                  <span>Ruta Completa del Domiciliario</span>
                                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/25">
                                    2 Etapas
                                  </span>
                                </h3>
                                <p className="text-[11px] text-gray-400">
                                  Navegación secuencial con origen en tu GPS en tiempo real
                                </p>
                              </div>
                            </div>

                            {/* GPS Live Status pill */}
                            <div className="flex items-center gap-1.5 self-start sm:self-center">
                              {driverHasGps ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[11px] font-bold">
                                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                                  GPS en Vivo ({currentCoords?.latitude?.toFixed(4)}, {currentCoords?.longitude?.toFixed(4)})
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[11px] font-bold">
                                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                                  Obteniendo GPS en tiempo real...
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Visual Sequence: Domiciliario -> Restaurante -> Cliente */}
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
                            {/* Etapa 1 Card: Restaurante & Gestión de Pago */}
                            <div className={`p-4 rounded-xl border transition flex flex-col justify-between ${
                              !isPickedUp
                                ? 'bg-gradient-to-b from-amber-500/10 via-[#0E1524] to-[#0A0E18] border-amber-500/40 text-white ring-1 ring-amber-500/30 shadow-lg'
                                : 'bg-[#121824] border-[#232B3A] text-gray-400 opacity-80'
                            }`}>
                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-md ${
                                    !isPickedUp ? 'bg-amber-500 text-black font-black' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                  }`}>
                                    {!isPickedUp ? 'Etapa 1 (Activa)' : 'Etapa 1 (Completada ✓)'}
                                  </span>
                                  <span className="text-xs font-bold text-gray-400">Paso 1 de 2</span>
                                </div>

                                <div className="space-y-1 mt-2">
                                  <div className="text-xs font-black text-white flex items-center gap-1.5">
                                    <span>📍 Domiciliario</span>
                                    <span className="text-amber-400 font-bold">➔</span>
                                    <span className="text-amber-300">🍽️ {activeDelivery.storeName || 'Restaurante'}</span>
                                  </div>
                                  <p className="text-[11px] text-gray-300">
                                    {!isPickedUp 
                                      ? 'Dirígete primero a la ubicación del restaurante a reclamar el pedido.' 
                                      : 'Pedido reclamado en el restaurante.'}
                                  </p>
                                  <p className="text-[10px] text-gray-400 truncate flex items-center gap-1">
                                    <MapPin className="w-3 h-3 text-amber-400 shrink-0" />
                                    <span>{activeDelivery.storeAddress}</span>
                                  </p>

                                  {/* Compact preview of items to claim in store */}
                                  {activeDelivery.items && activeDelivery.items.length > 0 && (
                                    <div className="mt-2 p-2 bg-[#05070D] border border-[#232B3A] rounded-lg text-[11px] space-y-1">
                                      <div className="flex items-center justify-between text-amber-300 font-bold">
                                        <span className="flex items-center gap-1">
                                          <ShoppingBag className="w-3 h-3 text-amber-400" />
                                          <span>Productos a reclamar:</span>
                                        </span>
                                        <span className="text-[10px] text-gray-400 font-normal">
                                          {activeDelivery.items.length} {activeDelivery.items.length === 1 ? 'ítem' : 'ítems'}
                                        </span>
                                      </div>
                                      <div className="space-y-1 max-h-24 overflow-y-auto divide-y divide-[#1C2433]/60">
                                        {activeDelivery.items.map((item, idx) => (
                                          <div key={idx} className="pt-1 first:pt-0 flex justify-between items-center text-[11px]">
                                            <span className="text-white truncate">
                                              <strong className="text-amber-400 font-mono">{item.quantity}x</strong> {item.name}
                                              {item.selectedVariant ? ` (${item.selectedVariant})` : ''}
                                            </span>
                                            <span className="text-gray-400 font-mono shrink-0 ml-2 text-[10px]">
                                              ${((item.price || 0) * (item.quantity || 1)).toLocaleString('es-CO')}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* Flow when Etapa 1 is active: Payment Verification & COD confirmation */}
                                {!isPickedUp && (
                                  <div className="mt-3 pt-3 border-t border-amber-500/20 space-y-2.5">
                                    {paymentFeedbackMsg && (
                                      <div className="p-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-[11px] font-bold animate-fadeIn flex items-center gap-1.5">
                                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                                        <span>{paymentFeedbackMsg}</span>
                                      </div>
                                    )}

                                    {/* PASO 1: Preguntar al restaurante si el cliente ya pagó */}
                                    <div className="bg-[#090D16] border border-[#232B3A] rounded-xl p-3 space-y-2">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-black uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                                          <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
                                          1. ¿Cliente ya pagó al restaurante?
                                        </span>
                                        {restPaymentStatus !== 'unconfirmed' && (
                                          <button
                                            type="button"
                                            onClick={() => handleUpdatePaymentStatus('unconfirmed')}
                                            className="text-[10px] text-gray-400 hover:text-white underline cursor-pointer"
                                          >
                                            Cambiar
                                          </button>
                                        )}
                                      </div>

                                      {restPaymentStatus === 'unconfirmed' ? (
                                        <div className="space-y-2">
                                          <p className="text-[11px] text-gray-300">
                                            Pregunta al restaurante si el pedido #{activeDelivery.orderNumber} ya fue pagado por el cliente o si está pendiente de pago.
                                          </p>

                                          <div className="flex gap-2">
                                            {effectiveStorePhone && (
                                              <a
                                                href={`https://wa.me/${effectiveStorePhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hola! 👋 Soy el domiciliario asignado al pedido #${activeDelivery.orderNumber || ''}. Por favor me confirmas: ¿el cliente ya pagó el pedido o está pendiente de pago? Gracias.`)}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-sm"
                                              >
                                                <MessageSquare className="w-3.5 h-3.5 fill-current" />
                                                <span>Preguntar por WhatsApp</span>
                                              </a>
                                            )}
                                            {effectiveStorePhone && (
                                              <a
                                                href={`tel:${effectiveStorePhone}`}
                                                className="py-2 px-3 bg-[#1C2433] hover:bg-[#2A364A] text-gray-200 border border-gray-700 rounded-lg text-xs font-bold flex items-center justify-center gap-1"
                                                title="Llamar a restaurante"
                                              >
                                                <Phone className="w-3.5 h-3.5" />
                                              </a>
                                            )}
                                          </div>

                                          <div className="grid grid-cols-2 gap-2 pt-1">
                                            <button
                                              type="button"
                                              onClick={() => handleUpdatePaymentStatus('already_paid', false, false)}
                                              className="py-2 px-2 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 rounded-lg text-xs font-black transition flex items-center justify-center gap-1 cursor-pointer active:scale-95"
                                            >
                                              <Check className="w-3.5 h-3.5" />
                                              <span>✓ Sí, ya pagó</span>
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleUpdatePaymentStatus('not_paid', false, false)}
                                              className="py-2 px-2 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 rounded-lg text-xs font-black transition flex items-center justify-center gap-1 cursor-pointer active:scale-95"
                                            >
                                              <AlertTriangle className="w-3.5 h-3.5" />
                                              <span>✗ No ha pagado</span>
                                            </button>
                                          </div>
                                        </div>
                                      ) : restPaymentStatus === 'already_paid' ? (
                                        <div className="p-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-start gap-2">
                                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                                          <div className="leading-snug">
                                            <p className="text-white font-black">✓ Pedido Pagado al Restaurante</p>
                                            <p className="text-[11px] text-emerald-200 mt-0.5">El cliente ya pagó al restaurante. No debes pagar ni cobrar el pedido. Solo reclamar y entregar.</p>
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="p-2.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold flex items-start gap-2">
                                          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                          <div className="leading-snug">
                                            <p className="text-white font-black">Restaurante confirmó: Pedido NO pagado</p>
                                            <p className="text-[11px] text-amber-200 mt-0.5">Debes preguntar al cliente si pagará contra entrega.</p>
                                          </div>
                                        </div>
                                      )}
                                    </div>

                                    {/* PASO 2: Si no ha pagado -> Preguntar al cliente si paga contra entrega */}
                                    {restPaymentStatus === 'not_paid' && (
                                      <div className="bg-[#090D16] border border-amber-500/40 rounded-xl p-3 space-y-2">
                                        <div className="flex items-center justify-between">
                                          <span className="text-[10px] font-black uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                                            <Phone className="w-3.5 h-3.5 text-amber-400" />
                                            2. Confirmar Contra Entrega con Cliente
                                          </span>
                                          {codConfirmed && (
                                            <button
                                              type="button"
                                              onClick={() => handleUpdatePaymentStatus('not_paid', false, false)}
                                              className="text-[10px] text-gray-400 hover:text-white underline cursor-pointer"
                                            >
                                              Cambiar
                                            </button>
                                          )}
                                        </div>

                                        {!codConfirmed ? (
                                          <div className="space-y-2">
                                            <p className="text-[11px] text-gray-300">
                                              Pregunta a <strong>{activeDelivery.customerName}</strong> si pagará contra entrega al recibir el pedido (Total: <strong>${totalOrderAmount.toLocaleString('es-CO')}</strong>).
                                            </p>

                                            <div className="flex gap-2">
                                              {activeDelivery.customerPhone && (
                                                <a
                                                  href={`https://wa.me/${activeDelivery.customerPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hola ${activeDelivery.customerName}! 👋 Te habla tu domiciliario del pedido #${activeDelivery.orderNumber || ''}. El restaurante me indica que el pedido aún no está pagado. ¿Confirmas que vas a pagar contra entrega al recibirlo en tu dirección ($${totalOrderAmount.toLocaleString('es-CO')})? Quedo atento para pagar en la tienda y llevártelo inmediatamente.`)}`}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-sm"
                                                >
                                                  <MessageSquare className="w-3.5 h-3.5 fill-current" />
                                                  <span>Preguntar por WhatsApp al Cliente</span>
                                                </a>
                                              )}
                                              {activeDelivery.customerPhone && (
                                                <a
                                                  href={`tel:${activeDelivery.customerPhone}`}
                                                  className="py-2 px-3 bg-[#1C2433] hover:bg-[#2A364A] text-gray-200 border border-gray-700 rounded-lg text-xs font-bold flex items-center justify-center gap-1"
                                                  title="Llamar al cliente"
                                                >
                                                  <Phone className="w-3.5 h-3.5" />
                                                </a>
                                              )}
                                            </div>

                                            <button
                                              type="button"
                                              onClick={() => handleUpdatePaymentStatus('not_paid', true, false)}
                                              className="w-full py-2.5 px-3 bg-gradient-to-r from-blue-600 via-cyan-600 to-teal-600 hover:from-blue-500 hover:to-cyan-500 text-white rounded-lg text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer shadow-md active:scale-95"
                                            >
                                              <Banknote className="w-4 h-4" />
                                              <span>✓ Cliente confirma: Paga Contra Entrega (${totalOrderAmount.toLocaleString('es-CO')})</span>
                                            </button>
                                          </div>
                                        ) : (
                                          <div className="p-2.5 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-xs font-bold flex items-start gap-2">
                                            <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                                            <div className="leading-snug">
                                              <p className="text-white font-black">✓ Cliente Confirmó Pago Contra Entrega</p>
                                              <p className="text-[11px] text-cyan-200 mt-0.5">El cliente pagará <strong>${totalOrderAmount.toLocaleString('es-CO')}</strong> en efectivo o transferencia al recibir.</p>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {/* PASO 3: Pagar el pedido en el restaurante */}
                                    {restPaymentStatus === 'not_paid' && codConfirmed && (
                                      <div className="bg-[#090D16] border border-emerald-500/40 rounded-xl p-3 space-y-2.5">
                                        <div className="flex items-center justify-between">
                                          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                                            <CreditCard className="w-3.5 h-3.5 text-emerald-400" />
                                            3. Pagar Pedido en el Restaurante
                                          </span>
                                          {driverPaid && (
                                            <button
                                              type="button"
                                              onClick={() => handleUpdatePaymentStatus('not_paid', true, false)}
                                              className="text-[10px] text-gray-400 hover:text-white underline cursor-pointer"
                                            >
                                              Corregir
                                            </button>
                                          )}
                                        </div>

                                        {/* Liquidación clara */}
                                        <div className="grid grid-cols-2 gap-2 text-[11px] bg-[#141B2D] p-2.5 rounded-lg border border-[#232B3A]">
                                          <div>
                                            <span className="text-gray-400 block text-[10px]">Pagas en Restaurante (Comida):</span>
                                            <strong className="text-amber-300 text-sm font-mono font-black">${foodCost.toLocaleString('es-CO')}</strong>
                                          </div>
                                          <div>
                                            <span className="text-gray-400 block text-[10px]">Cobras al Cliente al Entregar:</span>
                                            <strong className="text-emerald-400 text-sm font-mono font-black">${totalOrderAmount.toLocaleString('es-CO')}</strong>
                                          </div>
                                        </div>

                                        {!driverPaid ? (
                                          <button
                                            type="button"
                                            onClick={() => handleUpdatePaymentStatus('not_paid', true, true)}
                                            className="w-full py-3 px-3 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-400 text-gray-950 rounded-xl text-xs font-black transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-500/20 active:scale-95"
                                          >
                                            <CreditCard className="w-4 h-4" />
                                            <span>Pagar Pedido en Restaurante (${foodCost.toLocaleString('es-CO')})</span>
                                          </button>
                                        ) : (
                                          <div className="space-y-2">
                                            <div className="p-2.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-start gap-2">
                                              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                                              <div className="leading-snug">
                                                <p className="font-black text-white">✓ ¡Pedido Pagado en Restaurante (${paidAmount.toLocaleString('es-CO')})!</p>
                                                <p className="text-[11px] text-emerald-200 mt-0.5">Recuerda cobrar <strong>${totalOrderAmount.toLocaleString('es-CO')}</strong> al cliente al entregar.</p>
                                              </div>
                                            </div>

                                            <button
                                              type="button"
                                              onClick={() => handleAdvanceStep('picked_up')}
                                              className="w-full py-2.5 px-3 bg-[#F4B400] hover:bg-[#F4B400]/90 text-gray-950 rounded-xl text-xs font-black transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-[#F4B400]/20 active:scale-95"
                                            >
                                              <ShoppingBag className="w-4 h-4" />
                                              <span>2. Marcar Recogido en Tienda (Pasa a Enviado) ➔</span>
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Compact summary when Etapa 1 is completed */}
                                {isPickedUp && (
                                  <div className="mt-2.5 pt-2 border-t border-[#232B3A]">
                                    {restPaymentStatus === 'already_paid' ? (
                                      <div className="text-[11px] text-emerald-400 font-bold flex items-center gap-1.5">
                                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                        <span>Pedido pagado directamente al restaurante por el cliente</span>
                                      </div>
                                    ) : driverPaid ? (
                                      <div className="text-[11px] text-amber-300 font-bold flex items-center gap-1.5">
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                        <span>Pagaste ${paidAmount.toLocaleString('es-CO')} en restaurante • Cobrar ${totalOrderAmount.toLocaleString('es-CO')} al cliente</span>
                                      </div>
                                    ) : null}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Etapa 2 Card */}
                            <div className={`p-4 rounded-xl border transition flex flex-col justify-between ${
                              isPickedUp
                                ? 'bg-[#E63946]/10 border-[#E63946]/40 text-white ring-1 ring-[#E63946]/30'
                                : 'bg-[#121824] border-[#232B3A] text-gray-400'
                            }`}>
                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-md ${
                                    isPickedUp ? 'bg-[#E63946] text-white font-black' : 'bg-gray-800 text-gray-400'
                                  }`}>
                                    {isPickedUp ? 'Etapa 2 (Activa)' : 'Etapa 2 (Siguiente)'}
                                  </span>
                                  <span className="text-xs font-bold text-gray-400">Paso 2 de 2</span>
                                </div>

                                <div className="space-y-1 mt-2">
                                  <div className="text-xs font-black text-white flex items-center gap-1.5">
                                    <span>🍽️ Restaurante</span>
                                    <span className="text-[#E63946] font-bold">➔</span>
                                    <span className="text-emerald-400">🏠 {activeDelivery.customerName || 'Cliente'}</span>
                                  </div>
                                  <p className="text-[11px] text-gray-300">
                                    {isPickedUp 
                                      ? 'Continúa desde el restaurante hasta la dirección de entrega del cliente.' 
                                      : 'Se activará automáticamente al marcar el pedido como recogido.'}
                                  </p>
                                  <p className="text-[10px] text-gray-400 truncate flex items-center gap-1">
                                    <MapPin className="w-3 h-3 text-[#E63946] shrink-0" />
                                    <span>{activeDelivery.customerAddress}</span>
                                  </p>
                                </div>

                                {/* Highlight COD collection on active Etapa 2 */}
                                {isPickedUp && driverPaid && (
                                  <div className="mt-3 p-3 rounded-xl bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-500/40 text-emerald-100 text-xs font-bold space-y-1">
                                    <div className="flex items-center gap-1.5 text-emerald-300 font-black">
                                      <Banknote className="w-4 h-4" />
                                      <span>RECAUDAR AL CLIENTE CONTRA ENTREGA:</span>
                                    </div>
                                    <div className="text-base font-black text-white font-mono">
                                      ${totalOrderAmount.toLocaleString('es-CO')}
                                    </div>
                                    <p className="text-[10px] text-emerald-200">
                                      Recuperas ${paidAmount.toLocaleString('es-CO')} pagados en restaurante + ${deliveryFeeVal.toLocaleString('es-CO')} tu tarifa de domicilio.
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-1">
                            <button
                              type="button"
                              onClick={() => setTrackingPreviewOpen(true)}
                              className="flex-1 py-3 px-4 bg-gradient-to-r from-[#161F30] via-[#1E293B] to-[#161F30] hover:from-[#1E293B] hover:to-[#2B384E] text-white font-bold text-xs sm:text-sm rounded-xl border border-[#2B384E] hover:border-cyan-500/50 transition shadow-lg shadow-black/40 flex items-center justify-center gap-2.5 active:scale-[0.99] cursor-pointer group"
                            >
                              <div className="w-6 h-6 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center group-hover:scale-110 transition">
                                <Compass className="w-4 h-4 text-cyan-400" />
                              </div>
                              <span>Mirar Ruta Completa (Mapa en Vivo)</span>
                              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/25">
                                {!isPickedUp ? 'Domiciliario ➔ Restaurante ➔ Cliente' : 'Domiciliario ➔ Cliente'}
                              </span>
                            </button>

                            <a
                              href={buildGoogleFullRouteUrl({
                                driverLat: currentCoords?.latitude,
                                driverLng: currentCoords?.longitude,
                                storeLat: activeStoreLocation?.lat || activeDelivery.storeLat,
                                storeLng: activeStoreLocation?.lng || activeDelivery.storeLng,
                                storeAddress: activeDelivery.storeAddress,
                                storeMapUrl: activeStoreLocation?.mapUrl || activeDelivery.storeMapUrl,
                                destLat: activeDelivery.customerLat,
                                destLng: activeDelivery.customerLng,
                                destAddress: activeDelivery.customerAddress,
                                destMapUrl: activeDelivery.customerMapUrl,
                                isPickedUp
                              })}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="py-3 px-4 bg-[#E63946] hover:bg-[#D62839] text-white font-black text-xs sm:text-sm rounded-xl border border-[#E63946]/50 transition shadow-lg shadow-[#E63946]/25 flex items-center justify-center gap-2 shrink-0 active:scale-[0.99] cursor-pointer"
                              title="Navegar ruta completa en Google Maps"
                            >
                              <Navigation className="w-4 h-4 text-white" />
                              <span>Navegar en Google Maps</span>
                              <ExternalLink className="w-3.5 h-3.5 text-white/80" />
                            </a>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Locations & Contact Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Store Pickup Location */}
                      <div className="bg-[#090B12] border border-[#232B3A] p-4 rounded-xl space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-extrabold uppercase text-[#F4B400] block">
                            1. Punto de Recogida (Tienda)
                          </span>
                        </div>

                        <div>
                          <p className="text-base font-black text-white">
                            {activeDelivery.storeName || 'Tienda en la plataforma'}
                          </p>
                          <p className="text-xs text-[#A9B2C3] flex items-center gap-1.5 mt-1">
                            <MapPin className="w-3.5 h-3.5 text-[#F4B400] shrink-0" />
                            <span>{activeDelivery.storeAddress || 'Dirección de la Tienda'}</span>
                          </p>

                          {/* Punto de Referencia para Domiciliarios (Tienda) */}
                          {(activeStoreLocation?.reference || activeDelivery.storeReference || (activeDelivery as any).restaurantReference) && (
                            <div className="bg-amber-500/10 border border-amber-500/25 p-2.5 rounded-xl flex items-start gap-2 mt-2">
                              <Navigation className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                              <div>
                                <span className="text-[10px] font-black uppercase text-amber-400 tracking-wider block">
                                  Punto de Referencia para Domiciliarios:
                                </span>
                                <p className="text-xs font-semibold text-amber-100 mt-0.5">
                                  {activeStoreLocation?.reference || activeDelivery.storeReference || (activeDelivery as any).restaurantReference}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>



                        {/* Nota para comunicarse por WhatsApp con el restaurante */}
                        <div className="bg-emerald-950/40 border border-emerald-500/35 p-3 rounded-xl flex items-start gap-2.5 shadow-sm">
                          <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0 mt-0.5">
                            <MessageSquare className="w-4 h-4 text-emerald-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] font-black uppercase text-emerald-400 tracking-wider">
                                Nota Importante:
                              </span>
                            </div>
                            <p className="text-xs font-bold text-emerald-100 mt-0.5 leading-snug">
                              Comunicarse por WhatsApp con el restaurante para que preparen el pedido.
                            </p>
                            {effectiveStorePhone && (
                              <a
                                href={`https://wa.me/${effectiveStorePhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hola! 👋 Soy el domiciliario asignado al pedido #${activeDelivery.orderNumber || ''}. Por favor tenerlo en preparación, ya voy en camino a recogerlo.`)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-gray-950 text-xs font-black rounded-lg transition active:scale-95 shadow-md shadow-emerald-500/20"
                              >
                                <MessageSquare className="w-3.5 h-3.5 fill-current" />
                                <span>Escribir por WhatsApp al Restaurante</span>
                              </a>
                            )}
                          </div>
                        </div>

                        {/* Navigation Button to Store */}
                        <div className="pt-1">
                          <a
                            href={buildGoogleNavigationUrl({
                              lat: activeStoreLocation?.lat || activeDelivery.storeLat,
                              lng: activeStoreLocation?.lng || activeDelivery.storeLng,
                              mapUrl: activeStoreLocation?.mapUrl || activeDelivery.storeMapUrl,
                              address: activeDelivery.storeAddress,
                              storeName: activeDelivery.storeName
                            })}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full py-2.5 px-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-gray-950 font-black text-xs rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 active:scale-95"
                          >
                            <Navigation className="w-4 h-4 fill-current" />
                            <span>¿Cómo llegar al Restaurante?</span>
                          </a>
                        </div>

                        {effectiveStorePhone && (
                          <div className="pt-1.5 border-t border-[#232B3A]/60 flex items-center justify-between">
                            <a
                              href={`tel:${effectiveStorePhone}`}
                              className="inline-flex items-center gap-1.5 text-xs text-[#F4B400] hover:underline font-semibold"
                            >
                              <Phone className="w-3.5 h-3.5" />
                              <span>Llamar Tienda</span>
                            </a>
                            <a
                              href={`https://wa.me/${effectiveStorePhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hola! 👋 Soy el domiciliario asignado al pedido #${activeDelivery.orderNumber || ''}. Por favor tenerlo en preparación, ya voy en camino a recogerlo.`)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-lg border border-emerald-500/20 hover:bg-emerald-500/20 transition font-bold"
                            >
                              <MessageSquare className="w-3 h-3" />
                              <span>WhatsApp</span>
                            </a>
                          </div>
                        )}
                      </div>

                      {/* Customer Delivery Destination */}
                      <div className="bg-[#090B12] border border-[#232B3A] p-4 rounded-xl space-y-3">
                        <span className="text-[10px] font-extrabold uppercase text-[#E63946] block">
                          2. Punto de Entrega (Cliente)
                        </span>
                        <div>
                          <p className="text-base font-black text-white">
                            {activeDelivery.customerName}
                          </p>
                          <p className="text-xs text-[#A9B2C3] flex items-center gap-1.5 mt-1">
                            <MapPin className="w-3.5 h-3.5 text-[#E63946] shrink-0" />
                            <span>{activeDelivery.customerAddress}</span>
                          </p>

                          {/* Punto de Referencia Entrega (Cliente) */}
                          {(activeDelivery.customerReference || activeDelivery.notes) && (
                            <div className="bg-sky-500/10 border border-sky-500/25 p-2.5 rounded-xl flex items-start gap-2 mt-2">
                              <Navigation className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                              <div>
                                <span className="text-[10px] font-black uppercase text-sky-400 tracking-wider block">
                                  Punto de Referencia Entrega (Cliente):
                                </span>
                                <p className="text-xs font-semibold text-sky-100 mt-0.5">
                                  {activeDelivery.customerReference || activeDelivery.notes}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Direct navigation to customer button */}
                        <div className="pt-1">
                          <a
                            href={buildGoogleNavigationUrl({
                              lat: activeDelivery.customerLat,
                              lng: activeDelivery.customerLng,
                              mapUrl: activeDelivery.customerMapUrl,
                              address: activeDelivery.customerAddress
                            })}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full py-2.5 px-3 bg-[#E63946]/15 hover:bg-[#E63946]/25 border border-[#E63946]/40 text-[#E63946] hover:text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 active:scale-95"
                          >
                            <Navigation className="w-4 h-4" />
                            <span>¿Cómo llegar al Cliente? (GPS)</span>
                          </a>
                        </div>

                        <div className="flex items-center gap-3 pt-1 border-t border-[#232B3A]/60">
                          <a
                            href={`tel:${activeDelivery.customerPhone}`}
                            className="inline-flex items-center gap-1.5 text-xs text-[#E63946] hover:underline font-semibold"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            <span>{activeDelivery.customerPhone}</span>
                          </a>
                          <a
                            href={`https://wa.me/${activeDelivery.customerPhone.replace(/[^0-9]/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] bg-[#E63946]/10 text-[#E63946] px-2 py-0.5 rounded-md border border-[#E63946]/20 hover:bg-[#E63946]/20 transition"
                          >
                            <MessageSquare className="w-3 h-3" />
                            <span>WhatsApp</span>
                          </a>
                        </div>
                      </div>
                    </div>

                    {/* Order Details & Items */}
                    <div className="bg-[#090B12] border border-[#232B3A] p-4 rounded-xl space-y-2">
                      <div className="flex justify-between text-xs text-[#A9B2C3] border-b border-[#232B3A] pb-2">
                        <span>Método de Pago: <strong className="text-white uppercase">{activeDelivery.paymentMethod}</strong></span>
                        <span>Total Pedido: <strong className="text-white">${activeDelivery.totalAmount?.toLocaleString('es-CO')}</strong></span>
                      </div>
                      {activeDelivery.restaurantPaymentStatus === 'already_paid' ? (
                        <div className="p-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-300 font-bold flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            Pago en Restaurante:
                          </span>
                          <span className="text-white">Pagado previamente por el cliente ($0 a cobrar comida)</span>
                        </div>
                      ) : activeDelivery.driverPaidToRestaurant ? (
                        <div className="p-2.5 rounded-lg bg-gradient-to-r from-emerald-500/20 to-amber-500/20 border border-emerald-500/35 text-xs text-emerald-200 font-bold flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <Banknote className="w-4 h-4 text-emerald-400" />
                            Cobrar al Cliente Contra Entrega:
                          </span>
                          <span className="text-white font-black text-sm">${activeDelivery.totalAmount?.toLocaleString('es-CO')}</span>
                        </div>
                      ) : null}
                      {activeDelivery.notes && (
                        <p className="text-xs text-[#F4B400] bg-[#F4B400]/10 p-2 rounded-lg border border-[#F4B400]/20">
                          <strong>Observaciones:</strong> {activeDelivery.notes}
                        </p>
                      )}
                    </div>

                    {/* Action Step Buttons */}
                    <div className="pt-2 border-t border-[#232B3A] flex flex-wrap gap-3">
                      {(activeDelivery.deliveryStep === 'accepted' || activeDelivery.deliveryStep === 'to_store' || activeDelivery.deliveryStep === 'at_store') && (
                        <button
                          onClick={() => handleAdvanceStep('picked_up')}
                          className="flex-1 py-3.5 bg-[#F4B400] hover:bg-[#F4B400]/90 text-gray-950 font-black text-xs rounded-xl transition cursor-pointer shadow-lg shadow-[#F4B400]/20 flex items-center justify-center gap-2"
                        >
                          <ShoppingBag className="w-4 h-4" />
                          <span>2. Marcar Recogido en Tienda (Enviado)</span>
                        </button>
                      )}

                      {activeDelivery.deliveryStep === 'picked_up' && (
                        <button
                          onClick={() => handleAdvanceStep('to_client')}
                          className="flex-1 py-3.5 bg-[#E63946] hover:bg-[#D62839] text-white font-black text-xs rounded-xl transition cursor-pointer shadow-lg shadow-[#E63946]/20 flex items-center justify-center gap-2"
                        >
                          <Bike className="w-4 h-4" />
                          <span>3. Marcar En Camino al Cliente</span>
                        </button>
                      )}

                      {(activeDelivery.deliveryStep === 'to_client' || activeDelivery.deliveryStep === 'at_destination') && (
                        <div className="w-full space-y-2">
                          {activeDelivery.driverPaidToRestaurant && (
                            <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-emerald-100 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Banknote className="w-5 h-5 text-emerald-400 shrink-0" />
                                <div>
                                  <span className="text-[10px] uppercase font-black tracking-wider text-emerald-300 block">Recaudar al Cliente Contra Entrega:</span>
                                  <span className="text-xs text-gray-200">Recupera lo pagado en tienda + tu domicilio</span>
                                </div>
                              </div>
                              <span className="text-base font-black text-white font-mono shrink-0 ml-2">
                                ${(activeDelivery.totalAmount || 0).toLocaleString('es-CO')}
                              </span>
                            </div>
                          )}
                          <button
                            onClick={() => handleAdvanceStep('delivered')}
                            className="w-full py-3.5 bg-[#E63946] hover:bg-[#D62839] text-white font-black text-sm rounded-xl transition cursor-pointer shadow-xl shadow-[#E63946]/30 flex items-center justify-center gap-2"
                          >
                            <CheckCircle2 className="w-5 h-5" />
                            <span>4. Confirmar Pedido Entregado ✓</span>
                          </button>
                        </div>
                      )}

                    </div>
                  </div>
                ) : (
                  /* AVAILABLE REAL-TIME REQUESTS LIST */
                  <div className="space-y-4">
                    {/* Status Summary Row */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div className="bg-[#111827] border border-[#232B3A] rounded-2xl p-3.5 flex items-center justify-between gap-3 shadow-md">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-[#E63946]/10 border border-[#E63946]/20 text-[#E63946] flex items-center justify-center shrink-0">
                            <Bell className="w-5 h-5" />
                          </div>
                          <div>
                            <span className="text-xs font-bold text-[#A9B2C3] block">Solicitudes</span>
                            <span className="text-sm font-black text-white">
                              Disponibles <span className="text-[#E63946]">({availableOrders.length})</span>
                            </span>
                          </div>
                        </div>
                        {availableOrders.length > 0 && (
                          <span className="w-2.5 h-2.5 rounded-full bg-[#E63946] animate-ping shrink-0" />
                        )}
                      </div>

                      <div className="bg-[#111827] border border-[#232B3A] rounded-2xl p-3.5 flex items-center justify-between gap-3 shadow-md">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-[#E63946]/10 border border-[#E63946]/20 text-[#E63946] flex items-center justify-center shrink-0">
                            <Clock className="w-5 h-5" />
                          </div>
                          <div>
                            <span className="text-xs font-bold text-[#A9B2C3] block">Estado GPS & Radar</span>
                            <span className="text-xs font-bold text-[#E63946] flex items-center gap-1.5">
                              {isAvailable ? 'Buscando pedidos en tiempo real...' : 'Modo no disponible'}
                            </span>
                          </div>
                        </div>
                        {isAvailable && (
                          <div className="flex gap-1 shrink-0">
                            <span className="w-1.5 h-1.5 bg-[#E63946] rounded-full animate-ping" />
                            <span className="w-1.5 h-1.5 bg-[#E63946] rounded-full animate-ping [animation-delay:0.2s]" />
                            <span className="w-1.5 h-1.5 bg-[#E63946] rounded-full animate-ping [animation-delay:0.4s]" />
                          </div>
                        )}
                      </div>
                    </div>

                    {availableOrders.length === 0 ? (
                      <div className="bg-[#111827] border border-[#232B3A] rounded-3xl p-6 sm:p-10 text-center shadow-xl space-y-6">
                        {/* Night Skyline & Bike Illustration */}
                        <div className="w-full max-w-md mx-auto h-48 relative flex items-center justify-center my-1">
                          <svg viewBox="0 0 400 180" className="w-full h-full text-[#E63946]" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="200" cy="90" r="70" fill="url(#moonGlow)" opacity="0.3" />
                            <circle cx="200" cy="90" r="45" fill="#1e293b" opacity="0.6" />
                            <path d="M40 140 H360 V130 H340 V110 H320 V120 H290 V90 H260 V120 H230 V80 H200 V120 H170 V100 H140 V130 H110 V95 H80 V120 H50 V140 Z" fill="#090B12" opacity="0.8"/>
                            <path d="M70 140 H330 V125 H310 V115 H280 V95 H250 V115 H220 V88 H190 V115 H160 V105 H130 V125 H100 V108 H70 Z" fill="#111827" opacity="0.5"/>
                            <path d="M125 140 L115 110 L105 140 Z M125 140 L120 100 L115 140 Z" fill="#E63946" opacity="0.8"/>
                            <path d="M285 140 L275 110 L265 140 Z M285 140 L280 100 L275 140 Z" fill="#E63946" opacity="0.8"/>
                            <g transform="translate(145, 75) scale(0.95)" stroke="#E63946" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="25" cy="50" r="18" stroke="#E63946" strokeWidth="3" fill="none"/>
                              <circle cx="85" cy="50" r="18" stroke="#E63946" strokeWidth="3" fill="none"/>
                              <path d="M25 50 L45 50 L60 25 L85 50 M45 50 L38 25 L58 25 M60 25 L53 10 M85 50 L80 15 L90 15" fill="none"/>
                              <path d="M33 23 H43" stroke="#E63946" strokeWidth="3"/>
                            </g>
                            <line x1="20" y1="140" x2="380" y2="140" stroke="#232B3A" strokeWidth="2"/>
                            <defs>
                              <radialGradient id="moonGlow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(200 90) rotate(90) scale(70)">
                                <stop stopColor="#E63946" stopOpacity="0.4"/>
                                <stop offset="1" stopColor="#E63946" stopOpacity="0"/>
                              </radialGradient>
                            </defs>
                          </svg>
                        </div>

                        <div className="space-y-2 max-w-lg mx-auto">
                          <h4 className="text-lg sm:text-xl font-black text-white tracking-tight">
                            No hay pedidos disponibles <span className="text-[#E63946]">por el momento</span>
                          </h4>
                          <p className="text-xs sm:text-sm text-[#A9B2C3] leading-relaxed">
                            Mantente disponible. Cuando un cliente realice un pedido con domicilio en cualquiera de las tiendas, te notificaremos instantáneamente.
                          </p>
                        </div>

                        {/* Tips Box */}
                        <div className="bg-[#090B12] border border-[#232B3A] rounded-2xl p-4 sm:p-5 max-w-xl mx-auto space-y-3 text-left">
                          <div className="flex items-center gap-2 text-xs font-bold text-[#E63946]">
                            <div className="w-6 h-6 rounded-lg bg-[#E63946]/10 border border-[#E63946]/20 flex items-center justify-center shrink-0">
                              <Lightbulb className="w-3.5 h-3.5 text-[#E63946]" />
                            </div>
                            <span>Consejos para recibir pedidos</span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 text-center">
                            <div className="bg-[#111827] border border-[#232B3A] p-3 rounded-xl space-y-1.5 flex flex-col items-center justify-center">
                              <Wifi className="w-4 h-4 text-[#E63946]" />
                              <span className="text-[11px] text-[#A9B2C3] font-semibold leading-tight">Mantente conectado a internet</span>
                            </div>

                            <div className="bg-[#111827] border border-[#232B3A] p-3 rounded-xl space-y-1.5 flex flex-col items-center justify-center">
                              <MapPin className="w-4 h-4 text-[#E63946]" />
                              <span className="text-[11px] text-[#A9B2C3] font-semibold leading-tight">Activa tu ubicación GPS</span>
                            </div>

                            <div className="bg-[#111827] border border-[#232B3A] p-3 rounded-xl space-y-1.5 flex flex-col items-center justify-center">
                              <Bell className="w-4 h-4 text-[#E63946]" />
                              <span className="text-[11px] text-[#A9B2C3] font-semibold leading-tight">Activa las notificaciones</span>
                            </div>
                          </div>
                        </div>

                        {/* Safety Note */}
                        <div className="pt-1 flex items-center justify-center gap-2 text-xs text-[#A9B2C3]">
                          <ShieldCheck className="w-4 h-4 text-[#E63946] shrink-0" />
                          <span><strong>Tu seguridad es nuestra prioridad:</strong> Conduce seguro y disfruta tu ruta</span>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {availableOrders.map((order) => {
                          const cardDist = getOrderRouteDistance({
                            driverLat: currentCoords?.latitude,
                            driverLng: currentCoords?.longitude,
                            storeLat: order.storeLat,
                            storeLng: order.storeLng,
                            storeMapUrl: order.storeMapUrl,
                            customerLat: order.customerLat,
                            customerLng: order.customerLng,
                            customerMapUrl: order.customerMapUrl,
                          });
                          const cardDeliveryFee = systemDeliveryFee || order.deliveryFee || 7000;
                          const cardTotalAmount = order.totalAmount || 0;
                          const cardItemsCount = order.items?.length || 0;
                          const cardTotalUnits = order.items?.reduce((acc, it) => acc + (it.quantity || 1), 0) || 0;

                          return (
                            <div
                              key={order.id}
                              className="bg-[#111827] border border-[#232B3A] hover:border-[#E63946]/40 rounded-2xl p-5 shadow-lg space-y-3.5 transition"
                            >
                              <div className="flex justify-between items-start">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold text-[#A9B2C3] uppercase block">Tienda</span>
                                    {order.orderNumber && (
                                      <span className="text-[9px] font-mono font-bold bg-[#E63946]/20 text-[#E63946] px-1.5 py-0.5 rounded">
                                        #{order.orderNumber}
                                      </span>
                                    )}
                                  </div>
                                  <h4 className="text-sm font-black text-white">{order.storeName || 'Tienda Aliada'}</h4>
                                </div>
                                <div className="text-right">
                                  <span className="text-[10px] font-bold text-[#A9B2C3] uppercase block">Ganancia Domicilio</span>
                                  <span className="text-base font-black text-[#E63946]">
                                    ${cardDeliveryFee.toLocaleString('es-CO')}
                                  </span>
                                </div>
                              </div>

                              <div className="space-y-2 text-xs text-gray-300 border-t border-b border-[#232B3A] py-3">
                                <div className="flex items-center gap-2">
                                  <MapPin className="w-3.5 h-3.5 text-[#F4B400] shrink-0" />
                                  <span className="truncate">Recogida: <strong>{order.storeAddress || 'Dirección de la Tienda'}</strong></span>
                                </div>
                                {(order.storeReference || (order as any).restaurantReference) && (
                                  <div className="flex items-center gap-2 pl-5 text-[11px] text-amber-300">
                                    <Navigation className="w-3 h-3 text-amber-400 shrink-0" />
                                    <span className="truncate">Punto Ref: <strong>{order.storeReference || (order as any).restaurantReference}</strong></span>
                                  </div>
                                )}
                                <div className="flex items-center gap-2">
                                  <MapPin className="w-3.5 h-3.5 text-[#E63946] shrink-0" />
                                  <span className="truncate">Entrega: <strong>{order.customerAddress}</strong></span>
                                </div>

                                {/* Distancia y Valor del Pedido */}
                                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[#232B3A]/60 text-[11px]">
                                  <div className="bg-[#090B12] p-2 rounded-lg border border-[#232B3A] flex items-center gap-1.5">
                                    <Navigation className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                                    <div className="truncate">
                                      <span className="text-[10px] text-[#A9B2C3] block">Distancia:</span>
                                      <strong className="text-sky-400">
                                        {cardDist.totalEstimatedKm !== null ? `~${formatDistanceKm(cardDist.totalEstimatedKm)}` : 'Por calcular'}
                                      </strong>
                                    </div>
                                  </div>

                                  <div className="bg-[#090B12] p-2 rounded-lg border border-[#232B3A] flex items-center gap-1.5">
                                    <DollarSign className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                    <div className="truncate">
                                      <span className="text-[10px] text-[#A9B2C3] block">Valor Pedido:</span>
                                      <strong className="text-white">
                                        ${cardTotalAmount.toLocaleString('es-CO')}
                                      </strong>
                                    </div>
                                  </div>
                                </div>

                                {/* Resumen del Pedido (Items) */}
                                {order.items && order.items.length > 0 && (
                                  <div className="bg-[#090B12] p-2 rounded-lg border border-[#232B3A] text-[11px] space-y-1">
                                    <div className="flex items-center justify-between text-amber-400 font-bold">
                                      <span className="flex items-center gap-1">
                                        <ShoppingBag className="w-3 h-3" />
                                        <span>Detalles del Pedido:</span>
                                      </span>
                                      <span className="text-[10px] text-gray-400 font-normal">
                                        {cardItemsCount} items ({cardTotalUnits} uds)
                                      </span>
                                    </div>
                                    <p className="text-gray-300 truncate">
                                      {order.items.map(it => `${it.quantity}x ${it.name}`).join(' • ')}
                                    </p>
                                  </div>
                                )}

                                <div className="flex justify-between pt-0.5 text-[11px] text-[#A9B2C3]">
                                  <span>Cliente: <strong className="text-white">{order.customerName}</strong></span>
                                  <span>Pago: <strong className="text-white uppercase">{order.paymentMethod}</strong></span>
                                </div>
                              </div>

                              <button
                                onClick={() => setSelectedIncomingOrder(order)}
                                className="w-full py-2.5 bg-[#E63946] hover:bg-[#D62839] text-white font-black text-xs rounded-xl transition cursor-pointer shadow-md flex items-center justify-center gap-2"
                              >
                                <Bike className="w-4 h-4" />
                                <span>Ver Detalles y Aceptar</span>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: HISTORY AND EARNINGS */}
            {activeTab === 'history' && (
              <div className="space-y-6">
                {/* Stats Summary */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-[#111827] border border-[#232B3A] p-5 rounded-2xl">
                    <span className="text-xs font-bold text-[#A9B2C3] uppercase block">Total Entregas</span>
                    <span className="text-2xl font-black text-white mt-1 block">{driver.completedDeliveriesCount || 0}</span>
                  </div>

                  <div className="bg-[#111827] border border-[#232B3A] p-5 rounded-2xl">
                    <span className="text-xs font-bold text-[#A9B2C3] uppercase block">Ganancias Totales</span>
                    <span className="text-2xl font-black text-[#E63946] mt-1 block">
                      ${(driver.totalEarnings || 0).toLocaleString('es-CO')} COP
                    </span>
                  </div>

                  <div className="bg-[#111827] border border-[#232B3A] p-5 rounded-2xl">
                    <span className="text-xs font-bold text-[#A9B2C3] uppercase block">Calificación Promedio</span>
                    <div className="flex items-center gap-2 mt-1">
                      <Star className="w-6 h-6 fill-[#F4B400] text-[#F4B400]" />
                      <span className="text-2xl font-black text-white">{driver.rating?.toFixed(1) || '5.0'}</span>
                      <span className="text-xs text-[#A9B2C3]">({driver.ratingCount || 0} opiniones)</span>
                    </div>
                  </div>
                </div>

                {/* History List */}
                <div className="bg-[#111827] border border-[#232B3A] rounded-2xl p-6 space-y-4">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#E63946]" />
                    <span>Historial de Entregas Realizadas</span>
                  </h3>

                  {orderHistory.length === 0 ? (
                    <p className="text-xs text-[#A9B2C3] py-6 text-center">Aún no has completado entregas.</p>
                  ) : (
                    <div className="divide-y divide-[#232B3A]">
                      {orderHistory.map((histOrder) => (
                        <div key={histOrder.id} className="py-3 flex flex-col sm:flex-row justify-between sm:items-center gap-2 text-xs">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white">Pedido #{histOrder.orderNumber}</span>
                              <span className="text-[10px] bg-[#E63946]/10 text-[#E63946] px-2 py-0.5 rounded font-mono">
                                Entregado
                              </span>
                            </div>
                            <span className="text-[#A9B2C3]">{histOrder.storeName} → {histOrder.customerName}</span>
                          </div>

                          <div className="text-right">
                            <span className="font-bold text-[#E63946] block">${(systemDeliveryFee || histOrder.deliveryFee || 7000).toLocaleString('es-CO')}</span>
                            <span className="text-[10px] text-[#A9B2C3]">{new Date(histOrder.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Customer Ratings Section */}
                {driverRatings.length > 0 && (
                  <div className="bg-[#111827] border border-[#232B3A] rounded-2xl p-6 space-y-4">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Star className="w-4 h-4 text-[#F4B400] fill-[#F4B400]" />
                      <span>Calificaciones y Comentarios de Clientes</span>
                    </h3>

                    <div className="space-y-3">
                      {driverRatings.map((rating) => (
                        <div key={rating.id} className="bg-[#090B12] border border-[#232B3A] p-4 rounded-xl space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-white">{rating.customerName || 'Cliente'}</span>
                            <div className="flex items-center gap-1">
                              {[...Array(5)].map((_, i) => (
                                <Star
                                  key={i}
                                  className={`w-3.5 h-3.5 ${
                                    i < rating.stars ? 'text-[#F4B400] fill-[#F4B400]' : 'text-gray-700'
                                  }`}
                                />
                              ))}
                            </div>
                          </div>
                          {rating.comment && (
                            <p className="text-xs text-[#A9B2C3] italic">"{rating.comment}"</p>
                          )}
                          <span className="text-[10px] text-[#A9B2C3] block">{new Date(rating.createdAt).toLocaleDateString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: EDIT PROFILE */}
            {activeTab === 'profile' && (
              <div className="bg-[#111827] border border-[#232B3A] rounded-2xl p-6 space-y-6">
                <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-[#232B3A] pb-3">
                  <User className="w-4 h-4 text-[#E63946]" />
                  <span>Editar Datos del Domiciliario</span>
                </h3>

                {profileSuccessMsg && (
                  <div className="p-3 bg-[#E63946]/10 border border-[#E63946]/20 text-[#E63946] text-xs font-semibold rounded-xl flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#E63946] shrink-0" />
                    <span>{profileSuccessMsg}</span>
                  </div>
                )}

                <form onSubmit={handleSaveProfile} className="space-y-4 max-w-xl">
                  <div>
                    <label className="block text-xs font-bold text-[#A9B2C3] mb-1">Teléfono Celular</label>
                    <input
                      type="tel"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      className="w-full bg-[#090B12] border border-[#232B3A] rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-[#E63946]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-[#A9B2C3] mb-1">Dirección</label>
                      <input
                        type="text"
                        value={editAddress}
                        onChange={(e) => setEditAddress(e.target.value)}
                        className="w-full bg-[#090B12] border border-[#232B3A] rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-[#E63946]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#A9B2C3] mb-1">Ciudad</label>
                      <input
                        type="text"
                        value={editCity}
                        onChange={(e) => setEditCity(e.target.value)}
                        className="w-full bg-[#090B12] border border-[#232B3A] rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-[#E63946]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-[#A9B2C3] mb-1">Vehículo</label>
                      <select
                        value={editVehicleType}
                        onChange={(e) => setEditVehicleType(e.target.value as VehicleType)}
                        className="w-full bg-[#090B12] border border-[#232B3A] rounded-xl px-2.5 py-2 text-sm text-white focus:outline-none focus:border-[#E63946]"
                      >
                        <option value="moto">Moto</option>
                        <option value="carro">Carro</option>
                        <option value="bicicleta">Bicicleta</option>
                        <option value="otro">Otro</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#A9B2C3] mb-1">Marca</label>
                      <input
                        type="text"
                        value={editVehicleBrand}
                        onChange={(e) => setEditVehicleBrand(e.target.value)}
                        className="w-full bg-[#090B12] border border-[#232B3A] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#E63946]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#A9B2C3] mb-1">Placa</label>
                      <input
                        type="text"
                        value={editVehiclePlate}
                        onChange={(e) => setEditVehiclePlate(e.target.value)}
                        className="w-full bg-[#090B12] border border-[#232B3A] rounded-xl px-3 py-2 text-sm text-white uppercase focus:outline-none focus:border-[#E63946]"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="px-6 py-2.5 bg-[#E63946] hover:bg-[#D62839] text-white font-black text-xs rounded-xl transition cursor-pointer flex items-center gap-2 shadow-md"
                  >
                    <Save className="w-4 h-4" />
                    <span>Guardar Cambios</span>
                  </button>
                </form>

                {/* Session Persistence & Explicit Logout Section */}
                <div className="pt-6 border-t border-[#232B3A] max-w-xl">
                  <div className="bg-[#090B12] border border-[#232B3A] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h4 className="text-xs font-bold text-white flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-emerald-400" />
                        <span>Sesión Segura de Domiciliario</span>
                      </h4>
                      <p className="text-[11px] text-[#A9B2C3] mt-0.5">
                        Tu sesión permanece activa en este navegador aunque refresques la pantalla.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-2 shrink-0 active:scale-95"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Cerrar Sesión</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}
      </main>

      {/* Bottom Sticky Mobile Navigation Bar */}
      {driver.status === 'approved' && (
        <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#111827]/95 backdrop-blur-xl border-t border-[#232B3A] shadow-2xl px-6 py-2">
          <div className="max-w-md mx-auto flex items-center justify-between">
            <button
              onClick={() => setActiveTab('deliveries')}
              className={`flex flex-col items-center gap-1 transition cursor-pointer relative py-1 px-3 ${
                activeTab === 'deliveries' 
                  ? 'text-[#E63946] font-extrabold' 
                  : 'text-[#A9B2C3] hover:text-white font-medium'
              }`}
            >
              <div className="relative">
                <Bike className={`w-5 h-5 ${activeTab === 'deliveries' ? 'scale-110 text-[#E63946]' : ''}`} />
                {(availableOrders.length > 0 || activeDelivery) && (
                  <span className="absolute -top-1 -right-2 bg-[#E63946] text-white font-black text-[9px] w-4 h-4 rounded-full flex items-center justify-center shadow-sm">
                    {activeDelivery ? '1' : availableOrders.length}
                  </span>
                )}
              </div>
              <span className="text-[11px]">Entregas</span>
              {activeTab === 'deliveries' && (
                <span className="absolute bottom-0 w-8 h-0.5 bg-[#E63946] rounded-full" />
              )}
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`flex flex-col items-center gap-1 transition cursor-pointer relative py-1 px-3 ${
                activeTab === 'history' 
                  ? 'text-[#E63946] font-extrabold' 
                  : 'text-[#A9B2C3] hover:text-white font-medium'
              }`}
            >
              <FileText className={`w-5 h-5 ${activeTab === 'history' ? 'scale-110 text-[#E63946]' : ''}`} />
              <span className="text-[11px]">Historial y Ganancias</span>
              {activeTab === 'history' && (
                <span className="absolute bottom-0 w-8 h-0.5 bg-[#E63946] rounded-full" />
              )}
            </button>

            <button
              onClick={() => setActiveTab('profile')}
              className={`flex flex-col items-center gap-1 transition cursor-pointer relative py-1 px-3 ${
                activeTab === 'profile' 
                  ? 'text-[#E63946] font-extrabold' 
                  : 'text-[#A9B2C3] hover:text-white font-medium'
              }`}
            >
              <User className={`w-5 h-5 ${activeTab === 'profile' ? 'scale-110 text-[#E63946]' : ''}`} />
              <span className="text-[11px]">Mi Perfil</span>
              {activeTab === 'profile' && (
                <span className="absolute bottom-0 w-8 h-0.5 bg-[#E63946] rounded-full" />
              )}
            </button>
          </div>
        </nav>
      )}

      {/* ------------------------------------------------------------------
          INCOMING ORDER REAL-TIME POPUP MODAL
         ------------------------------------------------------------------ */}
      {selectedIncomingOrder && (() => {
        const routeDist = getOrderRouteDistance({
          driverLat: currentCoords?.latitude,
          driverLng: currentCoords?.longitude,
          storeLat: selectedIncomingOrder.storeLat,
          storeLng: selectedIncomingOrder.storeLng,
          storeMapUrl: selectedIncomingOrder.storeMapUrl,
          customerLat: selectedIncomingOrder.customerLat,
          customerLng: selectedIncomingOrder.customerLng,
          customerMapUrl: selectedIncomingOrder.customerMapUrl,
        });

        const deliveryFeeVal = systemDeliveryFee || selectedIncomingOrder.deliveryFee || 7000;
        const totalOrderAmount = selectedIncomingOrder.totalAmount || 0;
        const foodCost = Math.max(0, totalOrderAmount - deliveryFeeVal);
        const itemsCount = selectedIncomingOrder.items?.length || 0;
        const totalUnits = selectedIncomingOrder.items?.reduce((acc, it) => acc + (it.quantity || 1), 0) || 0;
        const isCashOrCod = selectedIncomingOrder.paymentMethod === 'whatsapp' || 
                            selectedIncomingOrder.paymentMethod === 'cod' || 
                            selectedIncomingOrder.paymentMethod === 'delivery_cash';

        return (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-[#111827] border-2 border-[#E63946]/50 rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-4 relative animate-scaleUp max-h-[92vh] overflow-y-auto">
              <button
                onClick={() => setSelectedIncomingOrder(null)}
                className="absolute top-4 right-4 text-[#A9B2C3] hover:text-white p-1 rounded-lg hover:bg-[#232B3A] cursor-pointer"
              >
                ✕
              </button>

              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-[#E63946]/10 border border-[#E63946]/30 text-[#E63946] rounded-xl flex items-center justify-center shrink-0">
                  <Bike className="w-6 h-6 animate-bounce" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase text-[#E63946] tracking-wider">¡Nuevo Pedido Recibido!</span>
                    {selectedIncomingOrder.orderNumber && (
                      <span className="text-[10px] font-mono font-bold bg-[#E63946]/20 text-[#E63946] px-1.5 py-0.5 rounded">
                        #{selectedIncomingOrder.orderNumber}
                      </span>
                    )}
                  </div>
                  <h3 className="text-lg font-black text-white">{selectedIncomingOrder.storeName || 'Tienda Aliada'}</h3>
                </div>
              </div>

              {claimStatusMsg && (
                <div className="p-3 bg-[#F4B400]/10 border border-[#F4B400]/20 text-[#F4B400] text-xs font-semibold rounded-xl flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{claimStatusMsg}</span>
                </div>
              )}

              {/* SECTION 1: UBICACIONES Y DISTANCIA */}
              <div className="space-y-3 bg-[#090B12] border border-[#232B3A] p-4 rounded-xl text-xs">
                <div className="flex justify-between border-b border-[#232B3A] pb-2 items-start">
                  <span className="text-[#A9B2C3] shrink-0 font-medium">Punto de Recogida:</span>
                  <div className="text-right">
                    <strong className="text-white block">{selectedIncomingOrder.storeAddress || 'Tienda en la plataforma'}</strong>
                    {((selectedIncomingOrder.storeLat && selectedIncomingOrder.storeLng) || selectedIncomingOrder.storeMapUrl) && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-mono font-bold mt-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        GPS Exacto Configurado
                      </span>
                    )}
                  </div>
                </div>

                {/* Punto de Referencia para Domiciliarios (Tienda) */}
                {(incomingStoreRef || selectedIncomingOrder.storeReference || (selectedIncomingOrder as any).restaurantReference) && (
                  <div className="flex justify-between border-b border-[#232B3A] pb-2 items-start bg-amber-500/10 -mx-1 px-2.5 py-2 rounded-xl border border-amber-500/25">
                    <span className="text-amber-400 font-bold shrink-0 flex items-center gap-1.5 text-xs">
                      <Navigation className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      Punto Ref. Tienda:
                    </span>
                    <div className="text-right ml-2">
                      <strong className="text-amber-200 text-xs font-bold block">
                        {incomingStoreRef || selectedIncomingOrder.storeReference || (selectedIncomingOrder as any).restaurantReference}
                      </strong>
                    </div>
                  </div>
                )}

                <div className="flex justify-between border-b border-[#232B3A] pb-2 items-start">
                  <span className="text-[#A9B2C3] shrink-0 font-medium">Cliente y Destino:</span>
                  <strong className="text-[#E63946] text-right ml-2">{selectedIncomingOrder.customerName} ({selectedIncomingOrder.customerAddress})</strong>
                </div>

                {/* Punto de Referencia Entrega (Cliente) */}
                {selectedIncomingOrder.customerReference && (
                  <div className="flex justify-between border-b border-[#232B3A] pb-2 items-start text-xs bg-sky-500/10 -mx-1 px-2.5 py-2 rounded-xl border border-sky-500/20">
                    <span className="text-sky-300 font-bold shrink-0 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      Punto Ref. Entrega:
                    </span>
                    <div className="text-right ml-2">
                      <strong className="text-sky-100 text-xs font-semibold block">
                        {selectedIncomingOrder.customerReference}
                      </strong>
                    </div>
                  </div>
                )}

                {/* DISTANCIA DEL PEDIDO */}
                <div className="pt-1">
                  <div className="bg-[#111827] border border-sky-500/30 p-2.5 rounded-xl space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sky-300 text-xs font-bold flex items-center gap-1.5">
                        <Navigation className="w-3.5 h-3.5 text-sky-400" />
                        Distancia Estimada:
                      </span>
                      {routeDist.totalEstimatedKm !== null ? (
                        <span className="text-xs font-black text-sky-300 bg-sky-500/20 px-2.5 py-0.5 rounded-full border border-sky-500/30">
                          ~{formatDistanceKm(routeDist.totalEstimatedKm)}
                        </span>
                      ) : (
                        <span className="text-[11px] text-gray-400">A verificar en mapa</span>
                      )}
                    </div>

                    {routeDist.storeToCustomerKm !== null && (
                      <div className="flex flex-wrap items-center justify-between text-[11px] text-gray-400 gap-1 pt-1 border-t border-[#232B3A]">
                        <span>Tienda ➔ Cliente: <strong className="text-gray-200">~{formatDistanceKm(routeDist.storeToCustomerKm)}</strong></span>
                        {routeDist.driverToStoreKm !== null && (
                          <span>Hasta la tienda: <strong className="text-amber-300">~{formatDistanceKm(routeDist.driverToStoreKm)}</strong></span>
                        )}
                      </div>
                    )}

                    <div className="flex justify-end pt-1">
                      <a
                        href={buildGoogleFullRouteUrl({
                          driverLat: currentCoords?.latitude,
                          driverLng: currentCoords?.longitude,
                          storeLat: selectedIncomingOrder.storeLat,
                          storeLng: selectedIncomingOrder.storeLng,
                          storeAddress: selectedIncomingOrder.storeAddress,
                          storeMapUrl: selectedIncomingOrder.storeMapUrl,
                          destLat: selectedIncomingOrder.customerLat,
                          destLng: selectedIncomingOrder.customerLng,
                          destAddress: selectedIncomingOrder.customerAddress,
                          destMapUrl: selectedIncomingOrder.customerMapUrl,
                        })}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-sky-400 hover:text-sky-300 underline font-bold flex items-center gap-1"
                      >
                        <Compass className="w-3.5 h-3.5" />
                        <span>Ver ruta en Google Maps</span>
                      </a>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 2: DETALLES DEL PEDIDO (PRODUCTOS) */}
              <div className="bg-[#090B12] border border-[#232B3A] p-3.5 rounded-xl space-y-2 text-xs">
                <div className="flex items-center justify-between border-b border-[#232B3A] pb-2">
                  <span className="text-amber-400 font-bold flex items-center gap-1.5">
                    <ShoppingBag className="w-4 h-4 text-amber-400" />
                    Detalles del Pedido:
                  </span>
                  <span className="text-[11px] font-bold text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/25">
                    {itemsCount} {itemsCount === 1 ? 'producto' : 'productos'} ({totalUnits} {totalUnits === 1 ? 'unidad' : 'unidades'})
                  </span>
                </div>

                {selectedIncomingOrder.items && selectedIncomingOrder.items.length > 0 ? (
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1 divide-y divide-[#232B3A]/50">
                    {selectedIncomingOrder.items.map((item, idx) => (
                      <div key={idx} className="pt-1.5 first:pt-0 flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 flex-1 min-w-0">
                          <span className="bg-[#E63946]/20 text-[#E63946] font-black text-[11px] px-1.5 py-0.5 rounded border border-[#E63946]/30 shrink-0">
                            {item.quantity}x
                          </span>
                          <div className="min-w-0 flex-1">
                            <span className="font-bold text-white block truncate">{item.name}</span>
                            {item.selectedVariant && (
                              <span className="text-[10px] text-gray-400 block truncate">
                                Opción: {item.selectedVariant}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="text-gray-300 font-mono font-semibold shrink-0 text-right">
                          ${((item.price || 0) * (item.quantity || 1)).toLocaleString('es-CO')}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">No hay desglose de productos individuales.</p>
                )}

                {selectedIncomingOrder.notes && (
                  <div className="pt-2 border-t border-[#232B3A] text-[11px] bg-amber-500/10 -mx-1 px-2.5 py-1.5 rounded-lg border border-amber-500/20 text-amber-200">
                    <strong className="text-amber-300 block mb-0.5">Observaciones / Notas del Cliente:</strong>
                    <span>{selectedIncomingOrder.notes}</span>
                  </div>
                )}
              </div>

              {/* SECTION 3: EL VALOR Y GANANCIA */}
              <div className="bg-[#090B12] border border-[#232B3A] p-3.5 rounded-xl space-y-2 text-xs">
                <div className="flex items-center justify-between border-b border-[#232B3A] pb-2">
                  <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                    <DollarSign className="w-4 h-4 text-emerald-400" />
                    Valor del Pedido y Ganancia:
                  </span>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-[#111827] text-gray-200 border border-[#232B3A]">
                    {selectedIncomingOrder.paymentMethod}
                  </span>
                </div>

                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between text-gray-300">
                    <span>Valor Productos / Comida:</span>
                    <strong className="text-white font-mono">${foodCost.toLocaleString('es-CO')} COP</strong>
                  </div>

                  <div className="flex justify-between text-gray-300">
                    <span className="text-emerald-300 font-bold">Ganancia Domicilio (Tu Pago):</span>
                    <strong className="text-emerald-400 font-mono font-bold">${deliveryFeeVal.toLocaleString('es-CO')} COP</strong>
                  </div>

                  <div className="flex justify-between items-center pt-2 border-t border-[#232B3A]">
                    <div>
                      <span className="text-white font-bold block text-xs">Valor Total del Pedido:</span>
                      <span className="text-[10px] text-gray-400 block">
                        {isCashOrCod ? 'Monto a recaudar al cliente' : 'Total facturado'}
                      </span>
                    </div>
                    <span className="text-xl font-black text-[#E63946] font-mono">
                      ${totalOrderAmount.toLocaleString('es-CO')} COP
                    </span>
                  </div>
                </div>

                {isCashOrCod ? (
                  <div className="mt-2 p-2 bg-emerald-500/10 border border-emerald-500/25 rounded-lg text-[11px] text-emerald-300 flex items-center gap-1.5">
                    <Banknote className="w-4 h-4 shrink-0 text-emerald-400" />
                    <span><strong>Cobro en Efectivo:</strong> Debes cobrar <strong>${totalOrderAmount.toLocaleString('es-CO')} COP</strong> al entregar al cliente.</span>
                  </div>
                ) : (
                  <div className="mt-2 p-2 bg-sky-500/10 border border-sky-500/25 rounded-lg text-[11px] text-sky-300 flex items-center gap-1.5">
                    <Receipt className="w-4 h-4 shrink-0 text-sky-400" />
                    <span><strong>Pago por Transferencia:</strong> El cliente ya transfirió el monto del pedido.</span>
                  </div>
                )}
              </div>

              {/* ACTION BUTTONS */}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => handleAcceptOrder(selectedIncomingOrder)}
                  disabled={claimingLoading}
                  className="flex-1 py-3.5 bg-[#E63946] hover:bg-[#D62839] text-white font-black text-sm rounded-xl transition cursor-pointer shadow-xl shadow-[#E63946]/30 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {claimingLoading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent animate-spin rounded-full" />
                  ) : (
                    <>
                      <Bike className="w-5 h-5" />
                      <span>Aceptar Pedido 🚀</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => setSelectedIncomingOrder(null)}
                  className="px-4 py-3 bg-[#090B12] hover:bg-[#232B3A] text-[#A9B2C3] font-bold text-xs rounded-xl border border-[#232B3A] transition cursor-pointer"
                >
                  Ignorar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Customer Tracking Live Map Preview Modal */}
      {activeDelivery && (
        <DeliveryTrackingModal
          isOpen={trackingPreviewOpen}
          onClose={() => setTrackingPreviewOpen(false)}
          order={activeDelivery}
          driverLiveCoords={currentCoords ? { latitude: currentCoords.latitude, longitude: currentCoords.longitude } : null}
          storeLocationCoords={activeStoreLocation}
        />
      )}
    </div>
  );
}

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
  ShieldCheck
} from 'lucide-react';
import { 
  fetchDriverProfileByUid, 
  updateDriverAvailability, 
  listenToUnassignedOrders, 
  acceptDeliveryOrderTransaction, 
  updateOrderDeliveryStep, 
  fetchDriverOrdersHistory, 
  fetchDriverRatings, 
  updateDriverProfile,
  registerDriverProfile,
  fetchSystemSettings,
  listenToSystemSettings
} from '../lib/firebase';
import { DriverProfile, OrderItem, VehicleType, DriverRating } from '../types';

interface DriverPortalProps {
  onNavigateHome: () => void;
  onNavigateRegister: () => void;
  initialDriver?: DriverProfile | null;
}

export default function DriverPortal({ onNavigateHome, onNavigateRegister, initialDriver }: DriverPortalProps) {
  // Auth & Driver Session State
  const [driver, setDriver] = useState<DriverProfile | null>(initialDriver || null);
  const [loginEmail, setLoginEmail] = useState<string>('');
  const [loginDocNumber, setLoginDocNumber] = useState<string>('');
  const [loginError, setLoginError] = useState<string>('');
  const [authLoading, setAuthLoading] = useState<boolean>(false);

  // Active view tab inside portal
  const [activeTab, setActiveTab] = useState<'deliveries' | 'history' | 'profile'>('deliveries');

  // Real-time Availability & Orders
  const [isAvailable, setIsAvailable] = useState<boolean>(false);
  const [availableOrders, setAvailableOrders] = useState<OrderItem[]>([]);
  const [activeDelivery, setActiveDelivery] = useState<OrderItem | null>(null);

  // Incoming Order Modal Alert Popup
  const [selectedIncomingOrder, setSelectedIncomingOrder] = useState<OrderItem | null>(null);
  const selectedIncomingOrderRef = useRef<OrderItem | null>(null);
  selectedIncomingOrderRef.current = selectedIncomingOrder;
  const [systemDeliveryFee, setSystemDeliveryFee] = useState<number>(7000);
  const [claimingLoading, setClaimingLoading] = useState<boolean>(false);
  const [claimStatusMsg, setClaimStatusMsg] = useState<string>('');

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
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } catch (e) {
      // Audio autoplay restrictions silent fallback
    }
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
    }
  }, [driver]);

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
          playNotificationChime();
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
    if (!loginEmail.trim() || !loginDocNumber.trim()) {
      setLoginError('Por favor ingresa tu correo y número de documento.');
      return;
    }

    setAuthLoading(true);
    try {
      const driverUid = `driver_${loginEmail.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      const found = await fetchDriverProfileByUid(driverUid);

      if (found) {
        // Verify doc match
        if (found.docNumber.trim() === loginDocNumber.trim()) {
          setDriver(found);
        } else {
          setLoginError('El número de documento no coincide con el correo ingresado.');
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

  // Logout Handler
  const handleLogout = async () => {
    if (driver) {
      try {
        await updateDriverAvailability(driver.id, false);
      } catch (e) {
        console.error(e);
      }
    }
    setDriver(null);
    setIsAvailable(false);
    setActiveDelivery(null);
    setSelectedIncomingOrder(null);
  };

  // Toggle Availability Switch
  const handleToggleAvailability = async () => {
    if (!driver) return;
    if (driver.status !== 'approved') return;

    const nextState = !isAvailable;
    setIsAvailable(nextState);
    try {
      await updateDriverAvailability(driver.id, nextState);
      setDriver(prev => prev ? { ...prev, isAvailable: nextState, isOnline: nextState } : null);
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
          deliveryFee: systemDeliveryFee || orderToClaim.deliveryFee || 7000,
          deliveryDriverId: driver.id,
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
        (nextStep === 'picked_up' || nextStep === 'to_client') ? 'shipped' : 
        activeDelivery.status;

      const updated = {
        ...activeDelivery,
        deliveryStep: nextStep,
        status: computedStatus
      };
      setActiveDelivery(updated);

      if (nextStep === 'delivered') {
        // Delivery completed!
        setActiveDelivery(null);
        // Refresh driver stats & order history
        const updatedDriver = await fetchDriverProfileByUid(driver.id);
        if (updatedDriver) setDriver(updatedDriver);
        loadHistoryAndRatings(driver.id);
      }
    } catch (e) {
      console.error("Error updating delivery step:", e);
    }
  };

  // Save Driver Profile Updates
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!driver) return;
    setSavingProfile(true);
    setProfileSuccessMsg('');

    try {
      await updateDriverProfile(driver.id, {
        phone: editPhone.trim(),
        address: editAddress.trim(),
        city: editCity.trim(),
        vehicleType: editVehicleType,
        vehicleBrand: editVehicleBrand.trim(),
        vehiclePlate: editVehiclePlate.trim().toUpperCase()
      });

      setDriver(prev => prev ? {
        ...prev,
        phone: editPhone.trim(),
        address: editAddress.trim(),
        city: editCity.trim(),
        vehicleType: editVehicleType,
        vehicleBrand: editVehicleBrand.trim(),
        vehiclePlate: editVehiclePlate.trim().toUpperCase()
      } : null);

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
          <div className="flex items-center gap-2.5">
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
              title="Cerrar sesión"
              className="p-2.5 bg-[#090B12] hover:bg-[#232B3A] text-[#A9B2C3] hover:text-white rounded-2xl border border-[#232B3A] transition cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
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
                onClick={() => fetchDriverProfileByUid(driver.id).then(d => d && setDriver(d))}
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
                    <div className="bg-[#090B12] border border-[#232B3A] p-4 rounded-xl space-y-3">
                      <span className="text-xs font-bold text-[#A9B2C3] uppercase tracking-wider block">
                        Estado Actual de la Entrega:
                      </span>
                      <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1">
                        {deliverySteps.map((s, idx) => {
                          const currentIdx = getStepIndex(activeDelivery.deliveryStep);
                          const isDone = idx <= currentIdx;
                          const isCurrent = idx === currentIdx;

                          return (
                            <div key={s.key} className="flex flex-col items-center flex-1 min-w-[75px]">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition ${
                                isCurrent 
                                  ? 'bg-[#E63946] text-white ring-4 ring-[#E63946]/20 font-black' 
                                  : isDone 
                                  ? 'bg-[#E63946]/20 text-[#E63946] border border-[#E63946]/40 font-bold' 
                                  : 'bg-[#090B12] text-gray-600 border border-[#232B3A]'
                              }`}>
                                {isDone ? '✓' : idx + 1}
                              </div>
                              <span className={`text-[11px] mt-1.5 text-center font-bold leading-tight ${
                                isCurrent ? 'text-[#E63946]' : isDone ? 'text-gray-200' : 'text-gray-600'
                              }`}>
                                {s.label.split('.')[1]?.trim()}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Locations & Contact Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Store Pickup Location */}
                      <div className="bg-[#090B12] border border-[#232B3A] p-4 rounded-xl space-y-2">
                        <span className="text-[10px] font-extrabold uppercase text-[#F4B400] block">
                          1. Punto de Recogida (Tienda)
                        </span>
                        <p className="text-sm font-bold text-white">
                          {activeDelivery.storeName || 'Tienda en la plataforma'}
                        </p>
                        <p className="text-xs text-[#A9B2C3] flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-[#F4B400] shrink-0" />
                          <span>{activeDelivery.storeAddress || 'Dirección de la Tienda'}</span>
                        </p>
                        {activeDelivery.storePhone && (
                          <a
                            href={`tel:${activeDelivery.storePhone}`}
                            className="inline-flex items-center gap-1.5 text-xs text-[#F4B400] hover:underline font-semibold pt-1"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            <span>Llamar a la Tienda</span>
                          </a>
                        )}
                      </div>

                      {/* Customer Delivery Destination */}
                      <div className="bg-[#090B12] border border-[#232B3A] p-4 rounded-xl space-y-2">
                        <span className="text-[10px] font-extrabold uppercase text-[#E63946] block">
                          2. Punto de Entrega (Cliente)
                        </span>
                        <p className="text-sm font-bold text-white">
                          {activeDelivery.customerName}
                        </p>
                        <p className="text-xs text-[#A9B2C3] flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-[#E63946] shrink-0" />
                          <span>{activeDelivery.customerAddress}</span>
                        </p>
                        <div className="flex items-center gap-3 pt-1">
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
                          <span>2. Marcar Recogiendo en Tienda</span>
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
                        <button
                          onClick={() => handleAdvanceStep('delivered')}
                          className="flex-1 py-3.5 bg-[#E63946] hover:bg-[#D62839] text-white font-black text-sm rounded-xl transition cursor-pointer shadow-xl shadow-[#E63946]/30 flex items-center justify-center gap-2"
                        >
                          <CheckCircle2 className="w-5 h-5" />
                          <span>4. Confirmar Pedido Entregado ✓</span>
                        </button>
                      )}

                      {/* Map Location Helper */}
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                          activeDelivery.deliveryStep === 'accepted' || activeDelivery.deliveryStep === 'to_store' || activeDelivery.deliveryStep === 'at_store'
                            ? activeDelivery.storeAddress || activeDelivery.storeName || ''
                            : activeDelivery.customerAddress
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-3 bg-[#090B12] hover:bg-[#232B3A] text-white font-bold text-xs rounded-xl border border-[#232B3A] transition flex items-center gap-2 cursor-pointer"
                      >
                        <Navigation className="w-4 h-4 text-[#E63946]" />
                        <span>Abrir GPS / Mapa</span>
                      </a>
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
                        {availableOrders.map((order) => (
                          <div
                            key={order.id}
                            className="bg-[#111827] border border-[#232B3A] hover:border-[#E63946]/40 rounded-2xl p-5 shadow-lg space-y-4 transition"
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <span className="text-[10px] font-bold text-[#A9B2C3] uppercase block">Tienda</span>
                                <h4 className="text-sm font-black text-white">{order.storeName || 'Tienda Aliada'}</h4>
                              </div>
                              <div className="text-right">
                                <span className="text-[10px] font-bold text-[#A9B2C3] uppercase block">Domicilio</span>
                                <span className="text-base font-black text-[#E63946]">
                                  ${(systemDeliveryFee || order.deliveryFee || 7000).toLocaleString('es-CO')}
                                </span>
                              </div>
                            </div>

                            <div className="space-y-1.5 text-xs text-gray-300 border-t border-b border-[#232B3A] py-3">
                              <div className="flex items-center gap-2">
                                <MapPin className="w-3.5 h-3.5 text-[#F4B400] shrink-0" />
                                <span>Recogida: <strong>{order.storeAddress || 'Dirección de la Tienda'}</strong></span>
                              </div>
                              <div className="flex items-center gap-2">
                                <MapPin className="w-3.5 h-3.5 text-[#E63946] shrink-0" />
                                <span>Entrega: <strong>{order.customerAddress}</strong></span>
                              </div>
                              <div className="flex justify-between pt-1 text-[11px] text-[#A9B2C3]">
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
                        ))}
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
      {selectedIncomingOrder && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-[#111827] border-2 border-[#E63946]/50 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-6 relative animate-scaleUp">
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
                <span className="text-[10px] font-black uppercase text-[#E63946] tracking-wider">¡Nuevo Pedido Recibido!</span>
                <h3 className="text-lg font-black text-white">{selectedIncomingOrder.storeName || 'Tienda Aliada'}</h3>
              </div>
            </div>

            {claimStatusMsg && (
              <div className="p-3 bg-[#F4B400]/10 border border-[#F4B400]/20 text-[#F4B400] text-xs font-semibold rounded-xl flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{claimStatusMsg}</span>
              </div>
            )}

            <div className="space-y-3 bg-[#090B12] border border-[#232B3A] p-4 rounded-xl text-xs">
              <div className="flex justify-between border-b border-[#232B3A] pb-2">
                <span className="text-[#A9B2C3]">Punto de Recogida:</span>
                <strong className="text-white text-right">{selectedIncomingOrder.storeAddress || 'Tienda en la plataforma'}</strong>
              </div>

              <div className="flex justify-between border-b border-[#232B3A] pb-2">
                <span className="text-[#A9B2C3]">Cliente y Destino:</span>
                <strong className="text-[#E63946] text-right">{selectedIncomingOrder.customerName} ({selectedIncomingOrder.customerAddress})</strong>
              </div>

              <div className="flex justify-between border-b border-[#232B3A] pb-2">
                <span className="text-[#A9B2C3]">Método de Pago:</span>
                <strong className="text-white uppercase">{selectedIncomingOrder.paymentMethod}</strong>
              </div>

              <div className="flex justify-between items-center pt-1">
                <span className="text-gray-300 font-bold">Ganancia Domicilio:</span>
                <span className="text-xl font-black text-[#E63946]">
                  ${(systemDeliveryFee || selectedIncomingOrder.deliveryFee || 7000).toLocaleString('es-CO')} COP
                </span>
              </div>
            </div>

            <div className="flex gap-3">
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
      )}
    </div>
  );
}

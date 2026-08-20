/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, User, Phone, MapPin, Gift, Trophy, Sparkles, 
  ShoppingBag, Clock, CheckCircle2, Truck, ChevronRight, 
  Star, Copy, Check, Utensils, Award, RefreshCw, 
  MessageCircle, ShieldCheck, Ticket, LogOut, ArrowRight,
  Flame, Crown, GlassWater, UtensilsCrossed, Cake, Sandwich,
  Mail, FileText, CheckCircle, Lock, Eye, EyeOff, AlertCircle
} from 'lucide-react';
import { signInWithPopup, signOut } from 'firebase/auth';
import { 
  CustomerProfile, CustomerPrize, OrderItem, RedeemableFoodReward, PrizeCategory 
} from '../types';
import { 
  fetchCustomerProfileByPhone, 
  fetchCustomerProfileByEmail,
  saveCustomerProfile, 
  fetchCustomerOrders, 
  addCustomerWonPrize, 
  redeemCustomerPrize, 
  exchangePointsForReward, 
  REDEEMABLE_FOOD_REWARDS,
  sanitizeCustomerPhone,
  auth,
  googleProvider
} from '../lib/firebase';

const GoogleIcon = () => (
  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
    <path
      fill="#4285F4"
      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
    />
    <path
      fill="#FBBC05"
      d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
    />
    <path
      fill="#EA4335"
      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
    />
  </svg>
);

interface CustomerPortalModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPhone?: string;
  initialTab?: 'orders' | 'wheel' | 'rewards' | 'profile';
  storeCurrency?: string;
  onSelectRewardCode?: (code: string, discount?: number) => void;
}

// Roulette Wheel items definition
interface WheelSlice {
  title: string;
  category: PrizeCategory;
  description: string;
  discountAmount?: number;
  color: string;
  textColor: string;
  icon: string;
}

const WHEEL_SLICES: WheelSlice[] = [
  { title: '¡Plato Fuerte Gratis!', category: 'dish', description: 'Vale para 1 Plato o Hamburguesa del Menú ($20.000 COP)', discountAmount: 20000, color: '#E63946', textColor: '#ffffff', icon: '🍔' },
  { title: '+1.000 Puntos ($1.000 COP)', category: 'points', description: '1.000 Puntos ($1.000 COP) sumados a tu billetera', discountAmount: 1000, color: '#4361EE', textColor: '#ffffff', icon: '⭐' },
  { title: '¡Bebida Gratis!', category: 'drink', description: 'Gaseosa o jugo refrescante gratis ($4.000 COP)', discountAmount: 4000, color: '#10B981', textColor: '#ffffff', icon: '🥤' },
  { title: 'Bono $10.000 COP', category: 'discount', description: 'Bono de descuento para tu próximo pedido', discountAmount: 10000, color: '#F72585', textColor: '#ffffff', icon: '🎟️' },
  { title: '¡Postre de la Casa!', category: 'dessert', description: 'Postre artesanal delicioso gratis ($8.000 COP)', discountAmount: 8000, color: '#7209B7', textColor: '#ffffff', icon: '🍨' },
  { title: '+3.000 Puntos VIP ($3.000 COP)', category: 'points', description: '3.000 Puntos ($3.000 COP) adicionales para comida', discountAmount: 3000, color: '#F59E0B', textColor: '#ffffff', icon: '👑' },
  { title: 'Papas Francesas', category: 'dish', description: 'Porción de papas crujientes gratis ($7.000 COP)', discountAmount: 7000, color: '#06D6A0', textColor: '#ffffff', icon: '🍟' },
  { title: '+2.000 Puntos Suerte ($2.000 COP)', category: 'points', description: '2.000 Puntos ($2.000 COP) acumulados en tu billetera', discountAmount: 2000, color: '#3A0CA3', textColor: '#ffffff', icon: '✨' },
];

export default function CustomerPortalModal({
  isOpen,
  onClose,
  initialPhone = '',
  initialTab = 'orders',
  storeCurrency = '$',
  onSelectRewardCode
}: CustomerPortalModalProps) {
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'orders' | 'wheel' | 'rewards' | 'profile'>(initialTab);

  // Login / Register form state
  const [phoneInput, setPhoneInput] = useState(initialPhone);
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [addressInput, setAddressInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [notesInput, setNotesInput] = useState('');
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [authError, setAuthError] = useState('');
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  // Wheel animation state
  const [isSpinning, setIsSpinning] = useState(false);
  const [wheelRotation, setWheelRotation] = useState(0);
  const [wonPrizeModal, setWonPrizeModal] = useState<CustomerPrize | null>(null);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);

  // Reward redeeming action
  const [redeemingRewardId, setRedeemingRewardId] = useState<string | null>(null);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  // Google Onboarding / Complete Data Modal state
  const [showGoogleCompleteModal, setShowGoogleCompleteModal] = useState(false);
  const [googleTempUser, setGoogleTempUser] = useState<{
    uid: string;
    email: string;
    name: string;
    avatarUrl: string;
  } | null>(null);

  // Auto load active session on mount
  useEffect(() => {
    if (isOpen) {
      const savedPhone = localStorage.getItem('ryyco_active_customer_phone') || initialPhone;
      if (savedPhone) {
        setPhoneInput(savedPhone);
        loadCustomerData(savedPhone);
      }
      setActiveTab(initialTab);
    }
  }, [isOpen, initialPhone, initialTab]);

  const loadCustomerData = async (phoneToLoad: string) => {
    const cleaned = sanitizeCustomerPhone(phoneToLoad);
    if (!cleaned) return;
    setLoading(true);
    setAuthError('');
    try {
      const profile = await fetchCustomerProfileByPhone(cleaned);
      if (profile) {
        setCustomer(profile);
        setNameInput(profile.name || '');
        setAddressInput(profile.address || '');
        setEmailInput(profile.email || '');
        setNotesInput(profile.notes || '');
        localStorage.setItem('ryyco_active_customer_phone', cleaned);
        loadCustomerOrders(cleaned);
      } else {
        setIsRegisterMode(true);
      }
    } catch (err: any) {
      console.warn("Failed fetching customer profile:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadCustomerOrders = async (phone: string) => {
    setOrdersLoading(true);
    try {
      const orderList = await fetchCustomerOrders(phone);
      setOrders(orderList);
    } catch (e) {
      console.warn("Error loading customer orders:", e);
    } finally {
      setOrdersLoading(false);
    }
  };

  // Google / Gmail OAuth Sign-In & Registration
  const handleGoogleSignIn = async () => {
    setAuthError('');
    setIsGoogleLoading(true);
    try {
      localStorage.setItem('ryyco_auth_mode', 'customer');
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      if (!user) {
        throw new Error("No se pudo obtener la información de Google.");
      }

      localStorage.setItem('ryyco_auth_mode', 'customer');
      const gEmail = (user.email || '').toLowerCase().trim();
      const gName = user.displayName || 'Cliente Ryyco';
      const gAvatar = user.photoURL || '';
      const gPhone = user.phoneNumber ? sanitizeCustomerPhone(user.phoneNumber) : '';

      setGoogleTempUser({
        uid: user.uid,
        email: gEmail,
        name: gName,
        avatarUrl: gAvatar
      });

      // 1. Try finding existing customer by email
      let existingProfile: CustomerProfile | null = null;
      if (gEmail) {
        existingProfile = await fetchCustomerProfileByEmail(gEmail);
      }
      // 2. Or by user's phone if attached to Google account
      if (!existingProfile && gPhone) {
        existingProfile = await fetchCustomerProfileByPhone(gPhone);
      }
      // 3. Or by input phone if user already typed it
      if (!existingProfile && phoneInput) {
        const pClean = sanitizeCustomerPhone(phoneInput);
        if (pClean && pClean.length >= 7) {
          existingProfile = await fetchCustomerProfileByPhone(pClean);
        }
      }

      if (existingProfile && existingProfile.phone) {
        // Automatically sync and load customer profile
        const updated = await saveCustomerProfile({
          ...existingProfile,
          email: existingProfile.email || gEmail,
          avatarUrl: existingProfile.avatarUrl || gAvatar,
          authUid: user.uid,
          name: existingProfile.name || gName
        });
        setCustomer(updated);
        setNameInput(updated.name);
        setPhoneInput(updated.phone);
        setEmailInput(updated.email || gEmail);
        setAddressInput(updated.address || '');
        setNotesInput(updated.notes || '');
        localStorage.setItem('ryyco_active_customer_phone', updated.phone);
        localStorage.setItem('ryyco_auth_mode', 'customer');
        loadCustomerOrders(updated.phone);

        // If existing profile was missing address or name, open quick window to complete it, else welcome
        if (!updated.address) {
          setShowGoogleCompleteModal(true);
        } else {
          setActionSuccessMsg(`¡Bienvenido de vuelta, ${updated.name}! Perfil de Cliente cargado con Google 🎉`);
          setTimeout(() => setActionSuccessMsg(null), 4000);
        }
      } else {
        // New Google user: prefill details and immediately open the "Completa tus datos" window
        setNameInput(gName);
        setEmailInput(gEmail);
        if (gPhone) setPhoneInput(gPhone);
        setShowGoogleCompleteModal(true);
      }
    } catch (err: any) {
      console.warn("Google sign in error:", err);
      if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
        setAuthError(err.message || "Error al iniciar sesión con Google / Gmail");
      }
    } finally {
      setIsGoogleLoading(false);
    }
  };

  // Save data from Google Onboarding modal
  const handleSaveGoogleOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = sanitizeCustomerPhone(phoneInput);
    if (!cleanPhone || cleanPhone.length < 7) {
      setAuthError("Por favor ingresa un número de WhatsApp / celular válido (ej: 3123456789).");
      return;
    }
    if (!nameInput.trim()) {
      setAuthError("Por favor ingresa tu nombre completo.");
      return;
    }
    if (!addressInput.trim()) {
      setAuthError("Por favor ingresa tu dirección de entrega / domicilio.");
      return;
    }

    setLoading(true);
    setAuthError('');
    try {
      localStorage.setItem('ryyco_auth_mode', 'customer');
      const created = await saveCustomerProfile({
        phone: cleanPhone,
        name: nameInput.trim(),
        email: emailInput.trim() || googleTempUser?.email || '',
        avatarUrl: googleTempUser?.avatarUrl || customer?.avatarUrl || '',
        authUid: googleTempUser?.uid || customer?.authUid || '',
        address: addressInput.trim(),
        notes: notesInput.trim(),
        points: customer?.points || 1000,
        spinsAvailable: customer?.spinsAvailable !== undefined ? customer.spinsAvailable : 1
      });

      setCustomer(created);
      localStorage.setItem('ryyco_active_customer_phone', cleanPhone);
      localStorage.setItem('ryyco_auth_mode', 'customer');
      setShowGoogleCompleteModal(false);
      loadCustomerOrders(cleanPhone);
      setActionSuccessMsg(`¡Bienvenido al Club Ryyco, ${created.name}! Perfil activado con 1.000 Puntos ($1.000 COP) y 1 Giro gratis 🎁`);
      setTimeout(() => setActionSuccessMsg(null), 5000);
    } catch (err: any) {
      setAuthError(err.message || "Error al guardar tus datos de entrega.");
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = sanitizeCustomerPhone(phoneInput);
    if (!cleaned || cleaned.length < 7) {
      setAuthError("Por favor ingresa un número de celular válido (ej: 3123456789)");
      return;
    }
    if (!passwordInput.trim()) {
      setAuthError("Por favor ingresa tu contraseña de acceso.");
      return;
    }

    setLoading(true);
    setAuthError('');
    try {
      const existing = await fetchCustomerProfileByPhone(cleaned);
      if (existing) {
        // Verify password if already configured on the profile
        if (existing.password && existing.password.trim().length > 0) {
          if (existing.password !== passwordInput.trim()) {
            setAuthError("Contraseña incorrecta. Por favor verifica tu clave o ingresa con Google.");
            setLoading(false);
            return;
          }
        } else {
          // If customer existed from previous orders or Google, set this password for their phone access
          await saveCustomerProfile({
            ...existing,
            password: passwordInput.trim()
          });
        }

        setCustomer(existing);
        setNameInput(existing.name || '');
        setAddressInput(existing.address || '');
        setEmailInput(existing.email || '');
        setNotesInput(existing.notes || '');
        localStorage.setItem('ryyco_active_customer_phone', cleaned);
        loadCustomerOrders(cleaned);
        setActionSuccessMsg(`¡Bienvenido de vuelta, ${existing.name}! 👋`);
        setTimeout(() => setActionSuccessMsg(null), 3500);
      } else {
        // Automatically switch to registration with a message
        setIsRegisterMode(true);
        setAuthError("El número no está registrado. Completa tu registro para ganar 1.000 puntos ($1.000 COP) y 1 tiro en la ruleta.");
      }
    } catch (err: any) {
      setAuthError(err.message || "Error al buscar tu cuenta");
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = sanitizeCustomerPhone(phoneInput);
    if (!cleaned || cleaned.length < 7) {
      setAuthError("Por favor ingresa un número de celular válido.");
      return;
    }
    if (!nameInput.trim()) {
      setAuthError("Por favor ingresa tu nombre completo.");
      return;
    }
    if (!passwordInput.trim() || passwordInput.trim().length < 4) {
      setAuthError("Por favor crea una contraseña de al menos 4 caracteres.");
      return;
    }

    setLoading(true);
    setAuthError('');
    try {
      const newCust = await saveCustomerProfile({
        phone: cleaned,
        name: nameInput.trim(),
        password: passwordInput.trim(),
        address: addressInput.trim(),
        email: emailInput.trim(),
        notes: notesInput.trim(),
        points: 1000, // Welcome bonus (1.000 Pts = $1.000 COP)!
        spinsAvailable: 1
      });
      setCustomer(newCust);
      localStorage.setItem('ryyco_active_customer_phone', cleaned);
      setActionSuccessMsg("¡Cuenta creada con éxito! Ganaste 1.000 Puntos ($1.000 COP) y 1 Giro Gratis en la Ruleta 🎁");
      setTimeout(() => setActionSuccessMsg(null), 5000);
      loadCustomerOrders(cleaned);
    } catch (err: any) {
      setAuthError(err.message || "No se pudo registrar la cuenta");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer) return;
    setLoading(true);
    try {
      const updated = await saveCustomerProfile({
        ...customer,
        name: nameInput.trim() || customer.name,
        password: newPasswordInput.trim() ? newPasswordInput.trim() : (customer.password || ''),
        address: addressInput.trim(),
        email: emailInput.trim(),
        notes: notesInput.trim(),
      });
      setCustomer(updated);
      setNewPasswordInput('');
      setActionSuccessMsg("Datos y contraseña actualizados correctamente ✅");
      setTimeout(() => setActionSuccessMsg(null), 4000);
    } catch (err) {
      alert("Error al actualizar datos.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    localStorage.removeItem('ryyco_active_customer_phone');
    localStorage.removeItem('ryyco_auth_mode');
    try {
      await signOut(auth);
    } catch (e) {}
    setCustomer(null);
    setOrders([]);
    setIsRegisterMode(false);
    setPasswordInput('');
    setNewPasswordInput('');
    setActionSuccessMsg("Has cerrado la sesión de cliente. Puedes volver a ingresar como cliente o entrar a tu panel de vendedor.");
    setTimeout(() => setActionSuccessMsg(null), 4000);
  };

  // Spin the Free Dish Roulette Wheel
  const handleSpinWheel = async () => {
    if (!customer || isSpinning) return;
    if ((customer.spinsAvailable || 0) <= 0) {
      alert("No tienes giros disponibles. ¡Haz un nuevo pedido para ganar más giros!");
      return;
    }

    setIsSpinning(true);

    // Pick random winning slice
    const sliceCount = WHEEL_SLICES.length;
    const sliceAngle = 360 / sliceCount;
    const randomIndex = Math.floor(Math.random() * sliceCount);
    const winningSlice = WHEEL_SLICES[randomIndex];

    // Extra spins (5 to 8 full rotations) + target slice angle
    const extraRotations = 360 * (5 + Math.floor(Math.random() * 3));
    // Calculate final rotation to align winning slice with top indicator
    const targetAngle = extraRotations + (360 - (randomIndex * sliceAngle + sliceAngle / 2));
    
    setWheelRotation(prev => prev + targetAngle);

    // Wait for wheel animation (4 seconds)
    setTimeout(async () => {
      try {
        const prize = await addCustomerWonPrize(customer.phone, {
          title: winningSlice.title,
          category: winningSlice.category,
          description: winningSlice.description,
          discountAmount: winningSlice.discountAmount
        });

        setWonPrizeModal(prize);
        // Refresh customer profile
        const fresh = await fetchCustomerProfileByPhone(customer.phone);
        if (fresh) setCustomer(fresh);
      } catch (err) {
        console.warn("Failed recording prize:", err);
      } finally {
        setIsSpinning(false);
      }
    }, 4200);
  };

  // Exchange Points for Food Reward
  const handleExchangeReward = async (reward: RedeemableFoodReward) => {
    if (!customer) return;
    if ((customer.points || 0) < reward.pointsCost) {
      alert(`Te faltan ${reward.pointsCost - customer.points} puntos para canjear este premio.`);
      return;
    }

    const confirm = window.confirm(`¿Deseas canjear ${reward.pointsCost} Puntos por "${reward.title}"?`);
    if (!confirm) return;

    setRedeemingRewardId(reward.id);
    try {
      const prize = await exchangePointsForReward(customer.phone, reward);
      const fresh = await fetchCustomerProfileByPhone(customer.phone);
      if (fresh) setCustomer(fresh);
      setWonPrizeModal(prize);
      setActionSuccessMsg(`¡Canje exitoso! Se ha generado tu cupón de ${reward.title}.`);
      setTimeout(() => setActionSuccessMsg(null), 5000);
    } catch (err: any) {
      alert(err.message || "Error al canjear puntos.");
    } finally {
      setRedeemingRewardId(null);
    }
  };

  const handleCopyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCodeId(id);
    setTimeout(() => setCopiedCodeId(null), 2500);
  };

  // Status mapping for order tracking
  const getOrderStatusStep = (status: string) => {
    switch (status) {
      case 'pending': return 1;
      case 'processing': return 2;
      case 'shipped': return 3;
      case 'delivered': return 4;
      case 'cancelled': return 0;
      default: return 1;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-500/10 text-amber-400 border border-amber-500/20">⏳ Recibido / Pendiente</span>;
      case 'processing':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-blue-500/10 text-blue-400 border border-blue-500/20">👨‍🍳 En Preparación</span>;
      case 'shipped':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-purple-500/10 text-purple-400 border border-purple-500/20">🛵 En Camino</span>;
      case 'delivered':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">✅ Entregado</span>;
      case 'cancelled':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-red-500/10 text-red-400 border border-red-500/20">❌ Cancelado</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-gray-800 text-gray-300">En Proceso</span>;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-[#0b0f19] border border-gray-800 rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl relative overflow-hidden text-gray-100 animate-fade-in my-auto">
        
        {/* Glow ambient decoration */}
        <div className="absolute top-0 right-1/4 w-72 h-72 bg-[#E63946]/10 rounded-full blur-[90px] pointer-events-none" />
        <div className="absolute bottom-0 left-10 w-72 h-72 bg-amber-500/10 rounded-full blur-[90px] pointer-events-none" />

        {/* HEADER */}
        <div className="p-4 sm:p-5 border-b border-gray-800 flex items-center justify-between relative z-10 bg-[#0d1322]/90 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-[#E63946] p-0.5 flex items-center justify-center shadow-lg shadow-[#E63946]/10">
              <div className="w-full h-full bg-[#0b0f19] rounded-[14px] flex items-center justify-center">
                <Crown className="w-5 h-5 text-amber-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-white tracking-tight">Club de Clientes Ryyco</h3>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-[#E63946]/20 text-[#E63946] border border-[#E63946]/30 uppercase tracking-wider">
                  MODO CLIENTE
                </span>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-amber-400/10 text-amber-400 border border-amber-400/20 uppercase tracking-wider">VIP</span>
              </div>
              <p className="text-[11px] text-gray-400 font-medium">
                {customer ? `Hola, ${customer.name}` : 'Rastreo de pedidos, platos gratis y puntos'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {customer && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 font-black text-xs font-mono shadow-sm">
                <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                <span>{customer.points || 0} Pts</span>
              </div>
            )}
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-gray-900 border border-gray-800 hover:border-gray-700 hover:bg-gray-800 flex items-center justify-center text-gray-400 hover:text-white transition cursor-pointer"
              title="Cerrar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* NOT LOGGED IN SCREEN */}
        {!customer ? (
          <div className="p-5 sm:p-8 overflow-y-auto flex-1 space-y-6">
            {/* Promo banner */}
            <div className="bg-gradient-to-br from-[#1E293B] via-[#121827] to-[#0B0F19] border border-[#E63946]/30 rounded-2xl p-5 relative overflow-hidden shadow-xl">
              <div className="flex items-start gap-3.5 relative z-10">
                <div className="p-3 bg-[#E63946]/15 border border-[#E63946]/30 rounded-xl text-[#E63946] shrink-0 shadow-md shadow-[#E63946]/10">
                  <Gift className="w-6 h-6 animate-bounce" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-white mb-1">¡Gana Platos Gratis y Acumula Puntos!</h4>
                  <p className="text-xs text-gray-300 leading-relaxed">
                    Crea tu cuenta de cliente en 30 segundos y recibe <strong className="text-amber-400 font-black">1.000 Puntos de Bienvenida ($1.000 COP)</strong> + <strong className="text-[#E63946] font-black">1 Giro en la Ruleta de Premios</strong>.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4 pt-4 border-t border-white/10 text-center">
                <div className="bg-black/40 rounded-xl p-2 border border-white/5">
                  <span className="text-base block">🛵</span>
                  <span className="text-[10px] font-bold text-gray-300">Rastreo en Vivo</span>
                </div>
                <div className="bg-black/40 rounded-xl p-2 border border-white/5">
                  <span className="text-base block">🎡</span>
                  <span className="text-[10px] font-bold text-gray-300">Ruleta de Comida</span>
                </div>
                <div className="bg-black/40 rounded-xl p-2 border border-white/5">
                  <span className="text-base block">⭐</span>
                  <span className="text-[10px] font-bold text-gray-300">1 Punto = $1 COP</span>
                </div>
                <div className="bg-black/40 rounded-xl p-2 border border-white/5">
                  <span className="text-base block">🍔</span>
                  <span className="text-[10px] font-bold text-gray-300">Platos Gratis</span>
                </div>
              </div>
            </div>

            {/* Error prompt */}
            {authError && (
              <div className="p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs font-semibold">
                ⚠️ {authError}
              </div>
            )}

            {/* Login / Register Tab toggle */}
            <div className="flex bg-[#090D16] p-1.5 rounded-xl border border-gray-800">
              <button
                type="button"
                onClick={() => setIsRegisterMode(false)}
                className={`flex-1 py-2.5 rounded-lg text-xs font-black transition cursor-pointer ${
                  !isRegisterMode ? 'bg-[#E63946] text-white shadow-md shadow-[#E63946]/25' : 'text-gray-400 hover:text-white'
                }`}
              >
                Ya tengo cuenta (Ingresar)
              </button>
              <button
                type="button"
                onClick={() => setIsRegisterMode(true)}
                className={`flex-1 py-2.5 rounded-lg text-xs font-black transition cursor-pointer ${
                  isRegisterMode ? 'bg-[#E63946] text-white shadow-md shadow-[#E63946]/25' : 'text-gray-400 hover:text-white'
                }`}
              >
                Crear Cuenta Nueva (¡+1.000 Pts!)
              </button>
            </div>

            {/* GOOGLE / GMAIL SIGN IN & REGISTER BUTTON */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isGoogleLoading || loading}
                className="w-full min-h-[52px] py-3 px-4 rounded-2xl bg-white hover:bg-slate-100 active:scale-[0.99] text-gray-900 font-black text-xs transition flex items-center gap-3 shadow-lg shadow-white/5 border border-white/20 cursor-pointer"
              >
                {isGoogleLoading ? (
                  <div className="w-full flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-gray-700" />
                    <span className="text-gray-700">Conectando con Google...</span>
                  </div>
                ) : (
                  <>
                    <GoogleIcon />
                    <div className="text-left flex-1">
                      <div className="text-xs sm:text-sm font-black text-slate-900">
                        {isRegisterMode ? 'Registrarme como Cliente con Google' : 'Ingresar como Cliente con Google'}
                      </div>
                      <div className="text-[10px] text-slate-500 font-semibold">
                        Acceso a puntos, ruleta de premios y pedidos
                      </div>
                    </div>
                  </>
                )}
              </button>

              {/* Multi-role notice for clarity */}
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-2.5 text-[11px] text-amber-300 flex items-start gap-2">
                <span className="text-sm shrink-0">💡</span>
                <p className="leading-snug">
                  <strong>¿Eres vendedor de una tienda?</strong> Puedes usar tu mismo correo de Google para comprar aquí como cliente. Este botón te identificará en <strong>Modo Cliente Comprador</strong>.
                </p>
              </div>

              {/* DIVIDER */}
              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-gray-800"></div>
                <span className="flex-shrink mx-3 text-[10px] uppercase font-black tracking-wider text-gray-500">
                  {isRegisterMode ? 'O llena tus datos con número celular' : 'O ingresa con tu celular y clave'}
                </span>
                <div className="flex-grow border-t border-gray-800"></div>
              </div>
            </div>

            {/* FORM */}
            <form onSubmit={isRegisterMode ? handleRegisterSubmit : handleLoginSubmit} className="space-y-3.5">
              <div>
                <label className="text-[11px] font-black uppercase text-gray-400 block mb-1">
                  Número de Celular o WhatsApp *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500 font-mono text-xs">
                    <Phone className="w-4 h-4 mr-1 text-[#E63946]" />
                  </div>
                  <input
                    type="tel"
                    required
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    placeholder="Ej: 3123456789"
                    className="w-full h-11 bg-[#090D16] border border-[#232E42] focus:border-[#E63946] rounded-xl pl-9 pr-3 text-xs font-semibold text-white placeholder:text-gray-500 outline-none transition"
                  />
                </div>
                <span className="text-[9.5px] text-gray-500 mt-1 block">Tu número celular es tu usuario de acceso para rastrear pedidos.</span>
              </div>

              {!isRegisterMode && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-black uppercase text-gray-400">
                      Contraseña de Acceso *
                    </label>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500">
                      <Lock className="w-4 h-4 text-[#E63946]" />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      placeholder="Ingresa tu contraseña"
                      className="w-full h-11 bg-[#090D16] border border-[#232E42] focus:border-[#E63946] rounded-xl pl-9 pr-10 text-xs font-semibold text-white placeholder:text-gray-500 outline-none transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-white cursor-pointer"
                      title={showPassword ? "Ocultar contraseña" : "Ver contraseña"}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <span className="text-[9.5px] text-gray-500 mt-1 block">Nota: Con el botón superior de Google no necesitas contraseña.</span>
                </div>
              )}

              {isRegisterMode && (
                <>
                  <div>
                    <label className="text-[11px] font-black uppercase text-gray-400 block mb-1">
                      Nombre Completo *
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500">
                        <User className="w-4 h-4 text-[#E63946]" />
                      </div>
                      <input
                        type="text"
                        required
                        value={nameInput}
                        onChange={(e) => setNameInput(e.target.value)}
                        placeholder="Ej: Carlos Gómez"
                        className="w-full h-11 bg-[#090D16] border border-[#232E42] focus:border-[#E63946] rounded-xl pl-9 pr-3 text-xs font-semibold text-white placeholder:text-gray-500 outline-none transition"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-black uppercase text-gray-400 block mb-1">
                      Crear Contraseña de Acceso *
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500">
                        <Lock className="w-4 h-4 text-[#E63946]" />
                      </div>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={passwordInput}
                        onChange={(e) => setPasswordInput(e.target.value)}
                        placeholder="Crea una clave (mínimo 4 caracteres)"
                        className="w-full h-11 bg-[#090D16] border border-[#232E42] focus:border-[#E63946] rounded-xl pl-9 pr-10 text-xs font-semibold text-white placeholder:text-gray-500 outline-none transition"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-white cursor-pointer"
                        title={showPassword ? "Ocultar contraseña" : "Ver contraseña"}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <span className="text-[9.5px] text-gray-500 mt-1 block">Esta será tu clave para ingresar cuando uses tu número de celular.</span>
                  </div>

                  <div>
                    <label className="text-[11px] font-black uppercase text-gray-400 block mb-1 flex items-center justify-between">
                      <span>Correo Electrónico / Gmail</span>
                      <span className="text-[9px] text-[#E63946] font-bold normal-case">Recomendado</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500">
                        <Mail className="w-4 h-4 text-[#E63946]" />
                      </div>
                      <input
                        type="email"
                        value={emailInput}
                        onChange={(e) => setEmailInput(e.target.value)}
                        placeholder="Ej: tuemail@gmail.com"
                        className="w-full h-11 bg-[#090D16] border border-[#232E42] focus:border-[#E63946] rounded-xl pl-9 pr-3 text-xs font-semibold text-white placeholder:text-gray-500 outline-none transition"
                      />
                    </div>
                    <span className="text-[9.5px] text-gray-500 mt-1 block">Recibe confirmaciones de despacho y respalda tus puntos de comida.</span>
                  </div>

                  <div>
                    <label className="text-[11px] font-black uppercase text-gray-400 block mb-1">
                      Dirección de Despacho Habitual (Opcional)
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500">
                        <MapPin className="w-4 h-4 text-[#E63946]" />
                      </div>
                      <input
                        type="text"
                        value={addressInput}
                        onChange={(e) => setAddressInput(e.target.value)}
                        placeholder="Ej: Calle 45 #23-12, Apto 302"
                        className="w-full h-11 bg-[#090D16] border border-[#232E42] focus:border-[#E63946] rounded-xl pl-9 pr-3 text-xs font-semibold text-white placeholder:text-gray-500 outline-none transition"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-black uppercase text-gray-400 block mb-1">
                      Punto de Referencia o Notas para Domicilios (Opcional)
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500">
                        <FileText className="w-4 h-4 text-[#E63946]" />
                      </div>
                      <input
                        type="text"
                        value={notesInput}
                        onChange={(e) => setNotesInput(e.target.value)}
                        placeholder="Ej: Dejar en portería, casa esquinera de dos pisos"
                        className="w-full h-11 bg-[#090D16] border border-[#232E42] focus:border-[#E63946] rounded-xl pl-9 pr-3 text-xs font-semibold text-white placeholder:text-gray-500 outline-none transition"
                      />
                    </div>
                  </div>
                </>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-xl font-black text-xs uppercase tracking-wider transition flex items-center justify-center gap-2 cursor-pointer shadow-lg mt-2 bg-[#E63946] hover:bg-[#D62839] text-white shadow-[#E63946]/25 active:scale-[0.99]"
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : isRegisterMode ? (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Crear Cuenta y Ganar 1.000 Puntos ($1.000 COP) 🎁
                  </>
                ) : (
                  <>
                    <ArrowRight className="w-4 h-4" />
                    Ingresar a Mi Cuenta
                  </>
                )}
              </button>
            </form>
          </div>
        ) : (
          /* LOGGED IN CUSTOMER PORTAL */
          <div className="flex flex-col flex-1 overflow-hidden">
            
            {/* Top Navigation Tabs */}
            <div className="grid grid-cols-4 bg-[#090D16] border-b border-gray-800 p-1.5 gap-1 shrink-0 text-center">
              <button
                type="button"
                onClick={() => setActiveTab('orders')}
                className={`py-2.5 px-2 rounded-xl text-xs font-extrabold flex flex-col sm:flex-row items-center justify-center gap-1.5 transition cursor-pointer ${
                  activeTab === 'orders'
                    ? 'bg-[#E63946] text-white shadow-md shadow-[#E63946]/25'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-900/50'
                }`}
              >
                <ShoppingBag className="w-4 h-4 shrink-0" />
                <span className="truncate">Mis Pedidos</span>
                {orders.length > 0 && (
                  <span className="hidden sm:inline-block px-1.5 py-0.2 rounded-full text-[9px] bg-black/40 text-white font-mono">
                    {orders.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('wheel')}
                className={`py-2.5 px-2 rounded-xl text-xs font-extrabold flex flex-col sm:flex-row items-center justify-center gap-1.5 transition relative cursor-pointer ${
                  activeTab === 'wheel'
                    ? 'bg-gradient-to-r from-amber-500 to-[#E63946] text-white shadow-md shadow-amber-500/20'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-900/50'
                }`}
              >
                <Trophy className="w-4 h-4 shrink-0 text-amber-300 animate-pulse" />
                <span className="truncate">Platos Gratis</span>
                {(customer.spinsAvailable || 0) > 0 && (
                  <span className="absolute -top-1 -right-1 sm:static px-1.5 py-0.5 rounded-full text-[9px] font-black bg-amber-400 text-black animate-bounce">
                    {customer.spinsAvailable} Giro
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('rewards')}
                className={`py-2.5 px-2 rounded-xl text-xs font-extrabold flex flex-col sm:flex-row items-center justify-center gap-1.5 transition cursor-pointer ${
                  activeTab === 'rewards'
                    ? 'bg-amber-500 text-black shadow font-black'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-900/50'
                }`}
              >
                <Gift className="w-4 h-4 shrink-0" />
                <span className="truncate">Canjear Comida</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('profile')}
                className={`py-2.5 px-2 rounded-xl text-xs font-extrabold flex flex-col sm:flex-row items-center justify-center gap-1.5 transition cursor-pointer ${
                  activeTab === 'profile'
                    ? 'bg-[#1E293B] text-white shadow'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-900/50'
                }`}
              >
                <User className="w-4 h-4 shrink-0" />
                <span className="truncate">Mis Datos</span>
              </button>
            </div>

            {/* Notification message */}
            {actionSuccessMsg && (
              <div className="mx-4 mt-3 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{actionSuccessMsg}</span>
              </div>
            )}

            {/* TAB CONTENT AREA */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-6">

              {/* TAB 1: MIS PEDIDOS (REAL-TIME STATUS TRACKER) */}
              {activeTab === 'orders' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-black text-white">Estado de tus Pedidos</h4>
                      <p className="text-[11px] text-gray-400">Rastreo en vivo de despachos y preparación</p>
                    </div>
                    <button
                      onClick={() => loadCustomerOrders(customer.phone)}
                      disabled={ordersLoading}
                      className="px-2.5 py-1.5 bg-gray-900 hover:bg-gray-800 border border-gray-800 text-gray-300 hover:text-white rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${ordersLoading ? 'animate-spin' : ''}`} />
                      <span>Actualizar</span>
                    </button>
                  </div>

                  {ordersLoading ? (
                    <div className="py-12 flex flex-col items-center justify-center gap-3">
                      <RefreshCw className="w-7 h-7 text-[#E63946] animate-spin" />
                      <p className="text-xs text-gray-400 font-bold">Consultando tus pedidos...</p>
                    </div>
                  ) : orders.length === 0 ? (
                    <div className="py-12 text-center bg-[#090D16] border border-[#232E42] rounded-2xl p-6 space-y-3">
                      <div className="w-12 h-12 rounded-full bg-gray-900 flex items-center justify-center mx-auto text-gray-500">
                        <ShoppingBag className="w-6 h-6" />
                      </div>
                      <h5 className="text-sm font-bold text-white">Aún no tienes pedidos registrados</h5>
                      <p className="text-xs text-gray-400 max-w-sm mx-auto">
                        Cuando realices compras en nuestras tiendas con tu número <strong className="text-white font-mono">{customer.phone}</strong>, podrás ver aquí el estado en tiempo real.
                      </p>
                      <button
                        onClick={onClose}
                        className="px-4 py-2 bg-[#E63946] hover:bg-[#D62839] text-white rounded-xl text-xs font-black transition cursor-pointer shadow-md shadow-[#E63946]/20"
                      >
                        Explorar Menú y Pedir Ahora
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {orders.map((order) => {
                        const step = getOrderStatusStep(order.status);
                        const isCancelled = order.status === 'cancelled';

                        return (
                          <div
                            key={order.id}
                            className="bg-[#090D16] border border-[#232E42] rounded-2xl p-4 sm:p-5 space-y-4 hover:border-gray-700 transition shadow-lg"
                          >
                            {/* Order top line */}
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-800 pb-3">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-black text-[#E63946] bg-[#E63946]/10 px-2 py-0.5 rounded-md border border-[#E63946]/20">
                                  #{order.orderNumber}
                                </span>
                                <h5 className="text-xs font-bold text-white">
                                  {order.storeName || 'Pedido Ryyco'}
                                </h5>
                              </div>
                              <div className="flex items-center gap-2">
                                {getStatusBadge(order.status)}
                                <span className="text-[10px] text-gray-500 font-mono">
                                  {order.createdAt ? new Date(order.createdAt).toLocaleDateString('es-CO', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                                </span>
                              </div>
                            </div>

                            {/* STEPPER PROGRESS BAR */}
                            {!isCancelled && (
                              <div className="space-y-2 py-1">
                                <div className="grid grid-cols-4 gap-1 relative">
                                  {/* Connective background track */}
                                  <div className="absolute top-1/2 left-0 right-0 h-1 bg-gray-800 -translate-y-1/2 z-0" />
                                  <div 
                                    className="absolute top-1/2 left-0 h-1 bg-gradient-to-r from-amber-400 via-[#E63946] to-emerald-400 -translate-y-1/2 z-0 transition-all duration-500" 
                                    style={{ width: `${Math.min(100, Math.max(10, ((step - 1) / 3) * 100))}%` }}
                                  />

                                  {/* Step 1: Received */}
                                  <div className="relative z-10 flex flex-col items-center text-center">
                                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black transition ${
                                      step >= 1 ? 'bg-amber-400 text-black shadow-md shadow-amber-400/20' : 'bg-gray-800 text-gray-500'
                                    }`}>
                                      1
                                    </div>
                                    <span className={`text-[9px] font-bold mt-1 ${step >= 1 ? 'text-amber-400' : 'text-gray-500'}`}>
                                      Recibido
                                    </span>
                                  </div>

                                  {/* Step 2: Preparing */}
                                  <div className="relative z-10 flex flex-col items-center text-center">
                                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black transition ${
                                      step >= 2 ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20' : 'bg-gray-800 text-gray-500'
                                    }`}>
                                      2
                                    </div>
                                    <span className={`text-[9px] font-bold mt-1 ${step >= 2 ? 'text-orange-400' : 'text-gray-500'}`}>
                                      En Cocina
                                    </span>
                                  </div>

                                  {/* Step 3: Shipped / Delivery */}
                                  <div className="relative z-10 flex flex-col items-center text-center">
                                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black transition ${
                                      step >= 3 ? 'bg-[#E63946] text-white shadow-md shadow-[#E63946]/20' : 'bg-gray-800 text-gray-500'
                                    }`}>
                                      3
                                    </div>
                                    <span className={`text-[9px] font-bold mt-1 ${step >= 3 ? 'text-[#E63946]' : 'text-gray-500'}`}>
                                      En Camino
                                    </span>
                                  </div>

                                  {/* Step 4: Delivered */}
                                  <div className="relative z-10 flex flex-col items-center text-center">
                                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black transition ${
                                      step >= 4 ? 'bg-emerald-400 text-black shadow-md shadow-emerald-400/20' : 'bg-gray-800 text-gray-500'
                                    }`}>
                                      ✓
                                    </div>
                                    <span className={`text-[9px] font-bold mt-1 ${step >= 4 ? 'text-emerald-400' : 'text-gray-500'}`}>
                                      Entregado
                                    </span>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Driver info if assigned */}
                            {order.deliveryDriverName && (
                              <div className="p-3 bg-[#161F30] border border-[#232E42] rounded-xl flex items-center justify-between gap-3 text-xs">
                                <div className="flex items-center gap-2.5">
                                  <div className="w-8 h-8 rounded-full bg-[#E63946]/15 flex items-center justify-center text-[#E63946]">
                                    <Truck className="w-4 h-4" />
                                  </div>
                                  <div>
                                    <span className="text-[10px] text-[#E63946] font-black uppercase tracking-wider block">Domiciliario Asignado</span>
                                    <span className="font-bold text-white">{order.deliveryDriverName}</span>
                                    {order.deliveryVehiclePlate && (
                                      <span className="text-gray-400 ml-1 font-mono">({order.deliveryVehiclePlate})</span>
                                    )}
                                  </div>
                                </div>
                                {order.deliveryDriverPhone && (
                                  <a
                                    href={`https://wa.me/57${order.deliveryDriverPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hola ${order.deliveryDriverName}, estoy pendiente de mi pedido #${order.orderNumber}.`)}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="px-2.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-lg text-[10px] font-bold transition flex items-center gap-1"
                                  >
                                    <MessageCircle className="w-3.5 h-3.5" />
                                    WhatsApp
                                  </a>
                                )}
                              </div>
                            )}

                            {/* Items list */}
                            <div className="space-y-1 bg-black/40 p-3 rounded-xl border border-white/5 text-xs">
                              {order.items.map((it, idx) => (
                                <div key={idx} className="flex justify-between items-center text-gray-300">
                                  <span>{it.quantity}x {it.name} {it.selectedVariant ? `(${it.selectedVariant})` : ''}</span>
                                  <span className="font-mono text-gray-400">{storeCurrency}{(it.price * it.quantity).toLocaleString('es-CO')}</span>
                                </div>
                              ))}
                              <div className="pt-2 mt-1 border-t border-gray-800 flex justify-between items-center font-black text-white text-xs">
                                <span>Total a Pagar:</span>
                                <span className="font-mono text-emerald-400 text-sm">
                                  {storeCurrency}{(order.totalAmount || 0).toLocaleString('es-CO')}
                                </span>
                              </div>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2">
                              {order.storePhone && (
                                <a
                                  href={`https://wa.me/57${order.storePhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hola, consulto sobre el estado de mi pedido #${order.orderNumber} a nombre de ${customer.name}.`)}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flex-1 py-2 bg-gray-900 hover:bg-gray-800 text-gray-300 hover:text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 border border-gray-800"
                                >
                                  <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                                  Chat con la Tienda
                                </a>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: RULETA DE PLATOS GRATIS */}
              {activeTab === 'wheel' && (
                <div className="space-y-5">
                  <div className="text-center space-y-1">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-amber-500/10 to-pink-500/10 border border-amber-500/20 text-amber-400 text-xs font-black uppercase tracking-wider">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Ruleta de la Suerte Ryyco</span>
                    </div>
                    <h4 className="text-lg font-black text-white">¡Gira y Gana Platos Gratis!</h4>
                    <p className="text-xs text-gray-400 max-w-md mx-auto">
                      Cada compra o registro te otorga giros para ganar platos fuertes, bebidas, postres y bonos de descuento.
                    </p>
                  </div>

                  {/* WHEEL VISUAL CANVAS / SVG CONTAINER */}
                  <div className="relative flex flex-col items-center justify-center py-4">
                    {/* Top Pointer Indicator */}
                    <div className="absolute top-1 z-30 flex flex-col items-center pointer-events-none drop-shadow-xl">
                      <div className="w-0 h-0 border-l-[12px] border-l-transparent border-r-[12px] border-r-transparent border-t-[20px] border-t-amber-400" />
                    </div>

                    {/* Wheel Circle */}
                    <div className="relative w-64 h-64 sm:w-72 sm:h-72 rounded-full border-4 border-amber-400/80 shadow-2xl shadow-amber-500/20 overflow-hidden bg-[#0a0e1a]">
                      <div
                        className="w-full h-full relative transition-transform duration-[4000ms] ease-out"
                        style={{
                          transform: `rotate(${wheelRotation}deg)`,
                        }}
                      >
                        {WHEEL_SLICES.map((slice, idx) => {
                          const angle = 360 / WHEEL_SLICES.length;
                          const rotate = idx * angle;
                          return (
                            <div
                              key={idx}
                              className="absolute w-full h-full top-0 left-0 flex justify-center origin-center"
                              style={{
                                transform: `rotate(${rotate}deg)`,
                              }}
                            >
                              {/* Slice wedge label */}
                              <div className="pt-2 flex flex-col items-center text-center select-none">
                                <span className="text-xl mb-0.5">{slice.icon}</span>
                                <span 
                                  className="text-[9px] font-black uppercase tracking-tight max-w-[85px] leading-tight drop-shadow-md"
                                  style={{ color: slice.color }}
                                >
                                  {slice.title}
                                </span>
                              </div>
                            </div>
                          );
                        })}

                        {/* Radial divider lines */}
                        {WHEEL_SLICES.map((_, idx) => (
                          <div
                            key={`div-${idx}`}
                            className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-gray-900/60 origin-center"
                            style={{
                              transform: `rotate(${idx * (360 / WHEEL_SLICES.length)}deg)`,
                            }}
                          />
                        ))}
                      </div>

                      {/* Center Hub */}
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-gradient-to-tr from-amber-500 to-[#E63946] p-1 shadow-2xl flex items-center justify-center z-20">
                        <div className="w-full h-full rounded-full bg-[#0b0f19] flex items-center justify-center text-amber-400 font-black text-xs font-mono">
                          ★
                        </div>
                      </div>
                    </div>

                    {/* Spins Available Counter & Spin Button */}
                    <div className="mt-6 flex flex-col items-center gap-3 w-full max-w-xs">
                      <div className="flex items-center gap-2 text-xs font-black text-gray-300">
                        <span>Giros Disponibles:</span>
                        <span className="px-2.5 py-0.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-full font-mono text-sm">
                          {customer.spinsAvailable || 0}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={handleSpinWheel}
                        disabled={isSpinning || (customer.spinsAvailable || 0) <= 0}
                        className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-wider transition flex items-center justify-center gap-2 shadow-xl cursor-pointer ${
                          (customer.spinsAvailable || 0) > 0 && !isSpinning
                            ? 'bg-gradient-to-r from-amber-500 via-[#E63946] to-[#C1121F] hover:opacity-95 text-white shadow-amber-500/25 active:scale-95'
                            : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                        }`}
                      >
                        {isSpinning ? (
                          <>
                            <RefreshCw className="w-5 h-5 animate-spin" />
                            ¡Girando la Ruleta...!
                          </>
                        ) : (customer.spinsAvailable || 0) > 0 ? (
                          <>
                            <Trophy className="w-5 h-5" />
                            ¡Girar Ruleta Ahora! 🚀
                          </>
                        ) : (
                          'Haz un Pedido para Ganar Giros'
                        )}
                      </button>
                    </div>
                  </div>

                  {/* WON PRIZES HISTORY */}
                  <div className="border-t border-gray-850 pt-5 space-y-3">
                    <h5 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                      <Award className="w-4 h-4 text-amber-400" />
                      <span>Tus Premios y Platos Ganados ({customer.wonPrizes?.length || 0})</span>
                    </h5>

                    {!customer.wonPrizes || customer.wonPrizes.length === 0 ? (
                      <p className="text-xs text-gray-500 text-center py-4 bg-gray-900/40 rounded-xl">
                        Aún no has ganado premios en la ruleta. ¡Gira ahora!
                      </p>
                    ) : (
                      <div className="space-y-2.5">
                        {customer.wonPrizes.map((prz) => (
                          <div
                            key={prz.id}
                            className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs transition ${
                              prz.isRedeemed 
                                ? 'bg-gray-950/50 border-gray-900 text-gray-500 opacity-60' 
                                : 'bg-[#0f1422] border-amber-500/30 text-white'
                            }`}
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-black text-amber-400">{prz.title}</span>
                                {prz.isRedeemed ? (
                                  <span className="text-[9px] bg-gray-800 text-gray-400 px-1.5 py-0.2 rounded font-bold">Canjeado</span>
                                ) : (
                                  <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.2 rounded font-black">Disponible</span>
                                )}
                              </div>
                              <p className="text-[10px] text-gray-400">{prz.description}</p>
                            </div>

                            {!prz.isRedeemed && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (onSelectRewardCode) {
                                    onSelectRewardCode(prz.code, prz.discountAmount);
                                    onClose();
                                  } else {
                                    handleCopyCode(prz.code, prz.id);
                                  }
                                }}
                                className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-black rounded-lg font-black text-[11px] flex items-center gap-1 font-mono transition shrink-0 cursor-pointer"
                              >
                                {copiedCodeId === prz.id ? (
                                  <>
                                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                                    ¡Copiado!
                                  </>
                                ) : onSelectRewardCode ? (
                                  'Usar en Pedido'
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3" />
                                    {prz.code}
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: CANJEAR PUNTOS POR COMIDA */}
              {activeTab === 'rewards' && (
                <div className="space-y-5">
                  {/* VIP POINTS CARD */}
                  <div className="bg-gradient-to-r from-amber-600 via-yellow-500 to-amber-700 p-5 rounded-2xl text-black shadow-xl shadow-amber-500/10 flex flex-col justify-between relative overflow-hidden">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-black/70">Billetera de Puntos Ryyco</span>
                        <h3 className="text-3xl font-black font-mono tracking-tight">
                          {customer.points || 0} <span className="text-sm font-sans font-bold">Puntos</span>
                        </h3>
                        <p className="text-xs font-black text-black/80 mt-0.5">
                          = ${(customer.points || 0).toLocaleString('es-CO')} COP disponibles para comida
                        </p>
                      </div>
                      <div className="p-2 bg-black/10 rounded-xl">
                        <Crown className="w-6 h-6 text-black" />
                      </div>
                    </div>

                    <div className="mt-3 bg-black/10 rounded-xl px-3 py-1.5 flex items-center justify-between text-[11px] font-bold">
                      <span>💡 1 Punto = $1 COP</span>
                      <span>1.000 pts = $1.000 COP</span>
                    </div>

                    <div className="mt-3 pt-3 border-t border-black/10 flex justify-between items-center text-xs font-bold">
                      <span>Titular: {customer.name}</span>
                      <span className="text-[10px] font-mono uppercase bg-black/20 px-2 py-0.5 rounded-full text-black">
                        {customer.points >= 25000 ? '👑 Cliente Diamante' : customer.points >= 10000 ? '⭐ Cliente Oro' : '🌱 Cliente Bronce'}
                      </span>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-black text-white mb-1">Catálogo de Comida para Redimir</h4>
                    <p className="text-xs text-gray-400">Canjea tus puntos acumulados por bebidas, postres y platos completos sin pagar nada (1 Punto = $1 COP).</p>
                  </div>

                  {/* REWARDS GRID */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {REDEEMABLE_FOOD_REWARDS.map((reward) => {
                      const canAfford = (customer.points || 0) >= reward.pointsCost;

                      return (
                        <div
                          key={reward.id}
                          className={`bg-[#090D16] border rounded-2xl p-4 flex flex-col justify-between gap-3 transition ${
                            canAfford 
                              ? 'border-amber-400/40 hover:border-amber-400 shadow-md' 
                              : 'border-[#232E42] opacity-75'
                          }`}
                        >
                          <div className="space-y-1.5">
                            <div className="flex justify-between items-start gap-2">
                              <h5 className="text-xs font-black text-white">{reward.title}</h5>
                              <span className="px-2 py-0.5 rounded-md font-mono text-[11px] font-black bg-amber-400/10 text-amber-400 border border-amber-400/20 shrink-0">
                                {reward.pointsCost} pts
                              </span>
                            </div>
                            <p className="text-[11px] text-gray-400 leading-relaxed">{reward.description}</p>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleExchangeReward(reward)}
                            disabled={!canAfford || redeemingRewardId === reward.id}
                            className={`w-full py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition flex items-center justify-center gap-1.5 cursor-pointer ${
                              canAfford
                                ? 'bg-[#E63946] hover:bg-[#D62839] text-white shadow-md shadow-[#E63946]/20'
                                : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                            }`}
                          >
                            {redeemingRewardId === reward.id ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : canAfford ? (
                              <>
                                <Gift className="w-3.5 h-3.5" />
                                Canjear Ahora
                              </>
                            ) : (
                              `Faltan ${reward.pointsCost - (customer.points || 0)} pts`
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB 4: MIS DATOS Y DIRECCIÓN */}
              {activeTab === 'profile' && (
                <div className="space-y-4">
                  {/* USER SUMMARY CARD WITH AVATAR & GOOGLE STATUS */}
                  <div className="bg-[#090D16] border border-[#232E42] rounded-2xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3.5">
                      <div className="relative">
                        {customer.avatarUrl ? (
                          <img
                            src={customer.avatarUrl}
                            alt={customer.name}
                            className="w-12 h-12 rounded-2xl object-cover border-2 border-amber-400/40 shadow"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#E63946] to-amber-500 flex items-center justify-center text-white font-black text-lg shadow">
                            {customer.name?.charAt(0)?.toUpperCase() || 'C'}
                          </div>
                        )}
                        <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-[#0b0f19]" />
                      </div>

                      <div>
                        <h4 className="text-sm font-black text-white">{customer.name}</h4>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {customer.email ? (
                            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md font-medium border border-emerald-500/20">
                              <CheckCircle className="w-3 h-3 text-emerald-400" />
                              {customer.email}
                            </span>
                          ) : (
                            <span className="text-[10px] text-gray-400 font-mono">{customer.phone}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleLogout}
                      className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Cerrar Sesión
                    </button>
                  </div>

                  <form onSubmit={handleUpdateProfile} className="space-y-3.5">
                    <div>
                      <label className="text-[11px] font-black uppercase text-gray-400 block mb-1">Nombre Completo</label>
                      <input
                        type="text"
                        required
                        value={nameInput}
                        onChange={(e) => setNameInput(e.target.value)}
                        className="w-full h-11 bg-[#090D16] border border-[#232E42] focus:border-[#E63946] rounded-xl px-3.5 text-xs font-semibold text-white outline-none transition"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-black uppercase text-gray-400 block mb-1">Celular / WhatsApp (Fijo)</label>
                        <input
                          type="tel"
                          disabled
                          value={customer.phone}
                          className="w-full h-11 bg-gray-900 border border-gray-800 rounded-xl px-3.5 text-xs font-mono text-gray-400 cursor-not-allowed outline-none"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-black uppercase text-gray-400 block mb-1">Correo Electrónico / Gmail</label>
                        <input
                          type="email"
                          value={emailInput}
                          onChange={(e) => setEmailInput(e.target.value)}
                          placeholder="tuemail@gmail.com"
                          className="w-full h-11 bg-[#090D16] border border-[#232E42] focus:border-[#E63946] rounded-xl px-3.5 text-xs font-semibold text-white outline-none transition"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] font-black uppercase text-gray-400 block mb-1">Dirección Completa de Entrega</label>
                      <input
                        type="text"
                        value={addressInput}
                        onChange={(e) => setAddressInput(e.target.value)}
                        placeholder="Ej: Calle 45 #23-12, Apto 302"
                        className="w-full h-11 bg-[#090D16] border border-[#232E42] focus:border-[#E63946] rounded-xl px-3.5 text-xs font-semibold text-white outline-none transition"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-black uppercase text-gray-400 block mb-1">Indicaciones o Notas de Entrega</label>
                      <textarea
                        rows={2}
                        value={notesInput}
                        onChange={(e) => setNotesInput(e.target.value)}
                        placeholder="Ej: Dejar en portería o tocar el timbre verde."
                        className="w-full bg-[#090D16] border border-[#232E42] focus:border-[#E63946] rounded-xl p-3 text-xs font-semibold text-white outline-none resize-none transition"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-black uppercase text-gray-400 block mb-1">
                        Cambiar Contraseña de Acceso (Opcional)
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500">
                          <Lock className="w-4 h-4 text-[#E63946]" />
                        </div>
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={newPasswordInput}
                          onChange={(e) => setNewPasswordInput(e.target.value)}
                          placeholder="Dejar en blanco para conservar tu clave actual"
                          className="w-full h-11 bg-[#090D16] border border-[#232E42] focus:border-[#E63946] rounded-xl pl-9 pr-10 text-xs font-semibold text-white placeholder:text-gray-500 outline-none transition"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-white cursor-pointer"
                          title={showPassword ? "Ocultar contraseña" : "Ver contraseña"}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <span className="text-[9.5px] text-gray-500 mt-1 block">Si inicias con el botón de Google / Gmail, no requieres digitar tu contraseña.</span>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3.5 bg-[#E63946] hover:bg-[#D62839] text-white rounded-xl text-xs font-black uppercase tracking-wider transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-[#E63946]/25"
                    >
                      {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Guardar Mis Datos'}
                    </button>
                  </form>
                </div>
              )}

            </div>
          </div>
        )}

      </div>

      {/* GOOGLE ONBOARDING / COMPLETE CRITICAL DATA MODAL */}
      {showGoogleCompleteModal && (
        <div className="fixed inset-0 z-60 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0b0f19] border border-gray-700 rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl relative animate-fade-in text-gray-100 overflow-hidden">
            {/* Ambient decorative glow */}
            <div className="absolute top-0 right-0 w-48 h-48 bg-[#E63946]/15 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

            {/* Header info */}
            <div className="flex items-start gap-4 mb-5 relative z-10">
              {googleTempUser?.avatarUrl ? (
                <img
                  src={googleTempUser.avatarUrl}
                  alt={googleTempUser.name}
                  className="w-12 h-12 rounded-2xl border-2 border-white/20 object-cover shadow shrink-0"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#E63946] to-amber-500 flex items-center justify-center text-white font-black text-lg shadow shrink-0">
                  <User className="w-6 h-6" />
                </div>
              )}
              <div className="flex-1">
                <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-bold mb-0.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Google / Gmail Conectado</span>
                </div>
                <h3 className="text-lg font-black text-white leading-tight">Completa tus datos de entrega</h3>
                <p className="text-[11.5px] text-gray-400 mt-0.5">
                  Ingresa tu WhatsApp y dirección para rastrear tus pedidos y activar tus <strong className="text-amber-400 font-black">1.000 Puntos de Bienvenida ($1.000 COP)</strong>.
                </p>
              </div>
            </div>

            {authError && (
              <div className="p-3 bg-red-500/15 border border-red-500/30 rounded-xl text-xs text-red-300 font-bold mb-4 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{authError}</span>
              </div>
            )}

            <form onSubmit={handleSaveGoogleOnboarding} className="space-y-3.5 relative z-10">
              {/* WhatsApp / Celular */}
              <div>
                <label className="text-[11px] font-black uppercase text-gray-300 block mb-1">
                  Número de WhatsApp / Celular <span className="text-[#E63946]">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500">
                    <Phone className="w-4 h-4 text-[#E63946]" />
                  </div>
                  <input
                    type="tel"
                    required
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    placeholder="Ej: 3123456789"
                    className="w-full h-11 bg-[#090D16] border border-[#232E42] focus:border-[#E63946] rounded-xl pl-9 pr-3 text-xs font-semibold text-white placeholder:text-gray-500 outline-none transition"
                  />
                </div>
                <span className="text-[9.5px] text-gray-400 mt-0.5 block">Para enviarte confirmaciones de despacho y ubicación del domiciliario.</span>
              </div>

              {/* Nombre Completo */}
              <div>
                <label className="text-[11px] font-black uppercase text-gray-300 block mb-1">
                  Nombre Completo <span className="text-[#E63946]">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500">
                    <User className="w-4 h-4 text-[#E63946]" />
                  </div>
                  <input
                    type="text"
                    required
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="Ej: Carlos Gómez"
                    className="w-full h-11 bg-[#090D16] border border-[#232E42] focus:border-[#E63946] rounded-xl pl-9 pr-3 text-xs font-semibold text-white placeholder:text-gray-500 outline-none transition"
                  />
                </div>
              </div>

              {/* Dirección de Domicilio */}
              <div>
                <label className="text-[11px] font-black uppercase text-gray-300 block mb-1">
                  Dirección de Domicilio / Entrega <span className="text-[#E63946]">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500">
                    <MapPin className="w-4 h-4 text-[#E63946]" />
                  </div>
                  <input
                    type="text"
                    required
                    value={addressInput}
                    onChange={(e) => setAddressInput(e.target.value)}
                    placeholder="Ej: Calle 45 #23-12, Apto 302, Barrio Modelo"
                    className="w-full h-11 bg-[#090D16] border border-[#232E42] focus:border-[#E63946] rounded-xl pl-9 pr-3 text-xs font-semibold text-white placeholder:text-gray-500 outline-none transition"
                  />
                </div>
              </div>

              {/* Indicaciones opcionales */}
              <div>
                <label className="text-[11px] font-black uppercase text-gray-400 block mb-1">
                  Indicaciones adicionales (Opcional)
                </label>
                <input
                  type="text"
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  placeholder="Ej: Casa esquinera, timbre blanco o dejar en portería"
                  className="w-full h-10 bg-[#090D16] border border-[#232E42] focus:border-[#E63946] rounded-xl px-3 text-xs font-semibold text-white placeholder:text-gray-500 outline-none transition"
                />
              </div>

              <div className="pt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowGoogleCompleteModal(false)}
                  className="py-3 px-4 rounded-xl border border-gray-800 bg-gray-900 hover:bg-gray-800 text-xs font-bold text-gray-400 hover:text-white transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-3.5 bg-[#E63946] hover:bg-[#D62839] text-white rounded-xl font-black text-xs uppercase tracking-wider transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-[#E63946]/25 active:scale-[0.99]"
                >
                  {loading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Guardar y Activar Cuenta 🎁
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PRIZE WON CELEBRATION MODAL */}
      {wonPrizeModal && (
        <div className="fixed inset-0 z-60 bg-black/90 backdrop-blur-lg flex items-center justify-center p-4">
          <div className="bg-[#0e1322] border border-amber-500/40 rounded-3xl max-w-sm w-full p-6 text-center space-y-4 shadow-2xl relative animate-fade-in">
            <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-amber-400 to-pink-500 p-1 mx-auto flex items-center justify-center shadow-lg shadow-amber-500/20">
              <div className="w-full h-full rounded-full bg-black flex items-center justify-center text-amber-300">
                <Trophy className="w-8 h-8 animate-bounce" />
              </div>
            </div>

            <h3 className="text-xl font-black text-white">¡Felicidades, Ganaste! 🎉</h3>
            
            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl space-y-1">
              <h4 className="text-base font-black text-amber-400">{wonPrizeModal.title}</h4>
              <p className="text-xs text-gray-300">{wonPrizeModal.description}</p>
            </div>

            <div className="space-y-1">
              <span className="text-[10px] text-gray-400 uppercase font-black tracking-wider block">Tu Código de Canje:</span>
              <div className="p-3 bg-black/60 border border-dashed border-gray-700 rounded-xl font-mono text-sm font-black text-emerald-400 flex items-center justify-between">
                <span>{wonPrizeModal.code}</span>
                <button
                  type="button"
                  onClick={() => handleCopyCode(wonPrizeModal.code, wonPrizeModal.id)}
                  className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-white rounded text-[10px] font-sans font-bold transition flex items-center gap-1"
                >
                  {copiedCodeId === wonPrizeModal.id ? '¡Copiado!' : 'Copiar'}
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                if (onSelectRewardCode) {
                  onSelectRewardCode(wonPrizeModal.code, wonPrizeModal.discountAmount);
                  setWonPrizeModal(null);
                  onClose();
                } else {
                  setWonPrizeModal(null);
                }
              }}
              className="w-full py-3.5 bg-emerald-400 hover:bg-emerald-300 text-black font-black text-xs uppercase tracking-wider rounded-xl transition cursor-pointer shadow-lg shadow-emerald-500/20"
            >
              {onSelectRewardCode ? 'Aplicar a mi Pedido 🚀' : 'Continuar'}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

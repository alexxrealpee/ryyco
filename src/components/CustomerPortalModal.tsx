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
  Mail, FileText, CheckCircle, Lock, Eye, EyeOff, AlertCircle, Scale,
  Navigation, Send, ArrowUpRight, ArrowDownLeft, History, Share2, Wallet, CheckCheck, Coins
} from 'lucide-react';
import BuyerTermsModal from './BuyerTermsModal';
import { MapLocationPickerModal } from './MapLocationPickerModal';
import { isPickupOrInvalidAddress } from './DeliveryAddressCard';
import DeliveryTrackingModal from './DeliveryTrackingModal';
import { signInWithPopup, signOut } from 'firebase/auth';
import { 
  CustomerProfile, CustomerPrize, OrderItem, RedeemableFoodReward, PrizeCategory, RyycoMovement 
} from '../types';
import { 
  fetchCustomerProfileByPhone, 
  fetchCustomerProfileByEmail,
  saveCustomerProfile, 
  fetchCustomerOrders, 
  listenToCustomerOrders,
  addCustomerWonPrize, 
  consumeCustomerSpin,
  redeemCustomerPrize, 
  exchangePointsForReward, 
  REDEEMABLE_FOOD_REWARDS,
  sanitizeCustomerPhone,
  searchCustomerByPhone,
  transferRyycosByPhone,
  listenToCustomerProfile,
  setActiveCustomerSession,
  logoutCustomerSession,
  RyycoTransferReceipt,
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
  onCustomerUpdate?: (customer: CustomerProfile | null) => void;
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
  isLose?: boolean;
}

const WHEEL_SLICES: WheelSlice[] = [
  { title: '¡Plato Fuerte Gratis!', category: 'dish', description: 'Vale para 1 Plato o Hamburguesa del Menú ($20.000 COP)', discountAmount: 20000, color: '#E63946', textColor: '#ffffff', icon: '🍔', isLose: false },
  { title: '¡Sigue Intentando!', category: 'dish', description: '¡Casi! Tienes otra oportunidad en tu próximo pedido', discountAmount: 0, color: '#3B82F6', textColor: '#ffffff', icon: '🍀', isLose: true },
  { title: '¡Bebida Gratis!', category: 'drink', description: 'Gaseosa o jugo refrescante gratis ($4.000 COP)', discountAmount: 4000, color: '#10B981', textColor: '#ffffff', icon: '🥤', isLose: false },
  { title: '¡Casi! Intenta de Nuevo', category: 'dish', description: '¡Estuviste a milímetros! Sigue acumulando pedidos', discountAmount: 0, color: '#8B5CF6', textColor: '#ffffff', icon: '🎯', isLose: true },
  { title: 'Bono $10.000 COP', category: 'discount', description: 'Bono de descuento para tu próximo pedido', discountAmount: 10000, color: '#F72585', textColor: '#ffffff', icon: '🎟️', isLose: false },
  { title: '¡Sigue Intentando!', category: 'dish', description: '¡No te rindas! Acumula más giros con tus compras', discountAmount: 0, color: '#F59E0B', textColor: '#ffffff', icon: '💫', isLose: true },
  { title: '¡Postre de la Casa!', category: 'dessert', description: 'Postre artesanal delicioso gratis ($8.000 COP)', discountAmount: 8000, color: '#7209B7', textColor: '#ffffff', icon: '🍨', isLose: false },
  { title: '¡Casi! Sigue Intentando', category: 'dish', description: '¡Estuvo a punto! Sigue ordenando en Ryyco', discountAmount: 0, color: '#06D6A0', textColor: '#ffffff', icon: '✨', isLose: true },
];

export default function CustomerPortalModal({
  isOpen,
  onClose,
  initialPhone = '',
  initialTab = 'orders',
  storeCurrency = '$',
  onSelectRewardCode,
  onCustomerUpdate
}: CustomerPortalModalProps) {
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [trackingOrder, setTrackingOrder] = useState<OrderItem | null>(null);
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
  const [isMapPickerOpen, setIsMapPickerOpen] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [notesInput, setNotesInput] = useState('');
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [authError, setAuthError] = useState('');
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [acceptedBuyerTerms, setAcceptedBuyerTerms] = useState(false);
  const [isBuyerTermsModalOpen, setIsBuyerTermsModalOpen] = useState(false);
  const [showForgotPasswordInfo, setShowForgotPasswordInfo] = useState(false);

  // Wheel animation state
  const [isSpinning, setIsSpinning] = useState(false);
  const [wheelRotation, setWheelRotation] = useState(0);
  const [wonPrizeModal, setWonPrizeModal] = useState<CustomerPrize | null>(null);
  const [tryAgainModal, setTryAgainModal] = useState<{ title: string; description: string; icon: string } | null>(null);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);

  // Reward redeeming action
  const [redeemingRewardId, setRedeemingRewardId] = useState<string | null>(null);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  // RYYCOS Wallet Sub-Tab: 'catalog' | 'transfer' | 'history'
  const [ryycosView, setRyycosView] = useState<'catalog' | 'transfer' | 'history'>('catalog');

  // Transfer form state (Nequi-style: Phone identifier only)
  const [transferPhone, setTransferPhone] = useState('');
  const [transferAmount, setTransferAmount] = useState<string>('');
  const [isSearchingRecipient, setIsSearchingRecipient] = useState(false);
  const [recipientResult, setRecipientResult] = useState<{ found: boolean; name?: string; phone?: string; error?: string } | null>(null);
  const [showTransferConfirmModal, setShowTransferConfirmModal] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferReceipt, setTransferReceipt] = useState<RyycoTransferReceipt | null>(null);

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
      const activeSessionPhone = localStorage.getItem('ryyco_active_customer_phone');
      if (activeSessionPhone) {
        setPhoneInput(activeSessionPhone);
        loadCustomerData(activeSessionPhone);
      } else {
        setCustomer(null);
        setOrders([]);
        if (initialPhone) {
          setPhoneInput(initialPhone);
        }
      }
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

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
        setAddressInput(profile.address && !isPickupOrInvalidAddress(profile.address) ? profile.address : '');
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
      const orderList = await fetchCustomerOrders(phone, customer?.email);
      setOrders(orderList);
    } catch (e) {
      console.warn("Error loading customer orders:", e);
    } finally {
      setOrdersLoading(false);
    }
  };

  // Real-time live orders subscription for active customer
  useEffect(() => {
    if (!isOpen || !customer?.phone) return;

    setOrdersLoading(true);
    const unsubscribe = listenToCustomerOrders(
      customer.phone,
      (realtimeOrders) => {
        setOrders(realtimeOrders);
        setOrdersLoading(false);
      },
      customer?.email
    );

    return () => {
      unsubscribe();
    };
  }, [isOpen, customer?.phone, customer?.email]);

  // Real-time live customer profile & RYYCOS balance listener
  // Automatically synchronizes when transfers are received, without reloading the page
  useEffect(() => {
    // Only listen if there is an active logged-in customer in this modal
    const targetPhone = customer?.phone;
    if (!isOpen || !targetPhone) return;

    const cleaned = sanitizeCustomerPhone(targetPhone);
    if (!cleaned || cleaned.length < 7) return;

    const unsubscribe = listenToCustomerProfile(cleaned, (updatedProfile) => {
      if (updatedProfile) {
        setCustomer(prev => {
          if (!prev) return null; // Prevent resurrecting customer if already logged out
          // If we received new RYYCOS in real-time
          if (prev && prev.phone === updatedProfile.phone && (updatedProfile.points || 0) > (prev.points || 0)) {
            const diff = (updatedProfile.points || 0) - (prev.points || 0);
            const latestMov = updatedProfile.movements?.[0];
            const senderInfo = latestMov?.senderName ? ` de ${latestMov.senderName}` : '';
            setActionSuccessMsg(`🎉 ¡Recibiste +${diff.toLocaleString('es-CO')} RYYCOS${senderInfo}! Tu saldo se ha actualizado automáticamente en tiempo real.`);
            setTimeout(() => setActionSuccessMsg(null), 6000);
          }
          return updatedProfile;
        });
        onCustomerUpdate?.(updatedProfile);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [isOpen, customer?.phone, onCustomerUpdate]);

  // Keep trackingOrder synchronized in real time whenever orders list updates
  useEffect(() => {
    if (trackingOrder) {
      const live = orders.find(o => o.id === trackingOrder.id);
      if (live) {
        if (live.status === 'delivered' || live.deliveryStep === 'delivered') {
          setTrackingOrder(null);
        } else {
          setTrackingOrder(live);
        }
      }
    }
  }, [orders]);

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
        setAddressInput(updated.address && !isPickupOrInvalidAddress(updated.address) ? updated.address : '');
        setNotesInput(updated.notes || '');
        
        // Synchronize globally across mobile & desktop
        setActiveCustomerSession(updated);
        onCustomerUpdate?.(updated);
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
      if (err.code === 'auth/popup-blocked') {
        setAuthError("Tu navegador o dispositivo bloqueó la ventana emergente de Google. Permite las ventanas emergentes en tu navegador o ingresa con tu número celular y contraseña abajo.");
      } else if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
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
    if (!acceptedBuyerTerms) {
      setAuthError("Debes aceptar los Términos y Condiciones para Usuarios y Compradores para registrarte.");
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
      setActiveCustomerSession(created);
      onCustomerUpdate?.(created);
      setShowGoogleCompleteModal(false);
      loadCustomerOrders(cleanPhone);
      setActionSuccessMsg(`¡Bienvenido al Club Ryyco, ${created.name}! Perfil activado con 1.000 RYYCOS ($1.000 COP) y 1 Giro gratis 🎁`);
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
        setAddressInput(existing.address && !isPickupOrInvalidAddress(existing.address) ? existing.address : '');
        setEmailInput(existing.email || '');
        setNotesInput(existing.notes || '');
        
        // Synchronize globally
        setActiveCustomerSession(existing);
        onCustomerUpdate?.(existing);
        loadCustomerOrders(cleaned);
        setActionSuccessMsg(`¡Bienvenido de vuelta, ${existing.name}! 👋`);
        setTimeout(() => setActionSuccessMsg(null), 3500);
      } else {
        // Automatically switch to registration with a friendly message
        setIsRegisterMode(true);
        setAuthError("Este número celular aún no está registrado. Completa tu registro para ganar 1.000 RYYCOS ($1.000 COP) de bienvenida y 1 giro en la ruleta.");
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
    if (!acceptedBuyerTerms) {
      setAuthError("Debes aceptar los Términos y Condiciones para Usuarios y Compradores para registrarte.");
      return;
    }

    setLoading(true);
    setAuthError('');
    try {
      // Safeguard: Check if phone is already registered to avoid accidental overwrites
      const existing = await fetchCustomerProfileByPhone(cleaned);
      if (existing) {
        setAuthError("Este número de celular ya tiene una cuenta registrada. Por favor ingresa tu contraseña o usa tu cuenta de Google.");
        setIsRegisterMode(false);
        setLoading(false);
        return;
      }

      const newCust = await saveCustomerProfile({
        phone: cleaned,
        name: nameInput.trim(),
        password: passwordInput.trim(),
        address: addressInput.trim(),
        email: emailInput.trim(),
        notes: notesInput.trim(),
        points: 1000, // Welcome bonus (1.000 RYYCOS = $1.000 COP)!
        spinsAvailable: 1
      });
      setCustomer(newCust);
      setActiveCustomerSession(newCust);
      onCustomerUpdate?.(newCust);
      setActionSuccessMsg("¡Cuenta creada con éxito! Ganaste 1.000 RYYCOS ($1.000 COP) y 1 Giro Gratis en la Ruleta 🎁");
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
      setActiveCustomerSession(updated);
      onCustomerUpdate?.(updated);
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
    setLoading(true);
    try {
      await logoutCustomerSession();
    } catch (e) {
      console.warn("Error logging out customer:", e);
    }
    setCustomer(null);
    setOrders([]);
    setIsRegisterMode(false);
    setPhoneInput('');
    setNameInput('');
    setAddressInput('');
    setEmailInput('');
    setNotesInput('');
    setPasswordInput('');
    setNewPasswordInput('');
    setLoading(false);
    onCustomerUpdate?.(null);
    setActionSuccessMsg("Has cerrado la sesión de cliente con éxito ✅");
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

    // Pick random slice strictly from losing slices ("Sigue intentando") so nobody wins a prize
    const sliceCount = WHEEL_SLICES.length;
    const sliceAngle = 360 / sliceCount;
    const loseIndices = WHEEL_SLICES.map((s, idx) => s.isLose ? idx : -1).filter(idx => idx !== -1);
    const chosenIndex = loseIndices.length > 0
      ? loseIndices[Math.floor(Math.random() * loseIndices.length)]
      : 1;
    const targetSlice = WHEEL_SLICES[chosenIndex];

    // Extra spins (5 to 8 full rotations) + target slice angle so it stops precisely on Sigue intentando
    const extraRotations = 360 * (5 + Math.floor(Math.random() * 3));
    const targetAngle = extraRotations + (360 - (chosenIndex * sliceAngle));
    
    setWheelRotation(prev => prev + targetAngle);

    // Wait for wheel animation (4.2 seconds)
    setTimeout(async () => {
      try {
        await consumeCustomerSpin(customer.phone);
        // Refresh customer profile
        const fresh = await fetchCustomerProfileByPhone(customer.phone);
        if (fresh) setCustomer(fresh);

        // Show Try Again modal
        setTryAgainModal({
          title: targetSlice.title,
          description: "¡Estuviste muy cerca de ganar un plato gratis! Recuerda que con cada compra que realices acumulas nuevos giros y RYYCOS en RYYCO. ¡Sigue intentando!",
          icon: targetSlice.icon
        });
      } catch (err) {
        console.warn("Error consumiendo giro:", err);
      } finally {
        setIsSpinning(false);
      }
    }, 4200);
  };

  // Debounced search for transfer recipient exclusively by phone number
  useEffect(() => {
    const raw = transferPhone.trim();
    const cleaned = sanitizeCustomerPhone(raw);
    if (!cleaned || cleaned.length < 10) {
      setRecipientResult(null);
      return;
    }

    let isCurrent = true;
    const delayTimer = setTimeout(async () => {
      setIsSearchingRecipient(true);
      try {
        const res = await searchCustomerByPhone(cleaned, customer?.phone);
        if (!isCurrent) return;
        if (res.success && res.customer) {
          setRecipientResult({ found: true, name: res.customer.name, phone: res.customer.phone });
        } else {
          setRecipientResult({ found: false, error: res.error || 'No se encontró el destinatario' });
        }
      } catch (err: any) {
        if (!isCurrent) return;
        setRecipientResult({ found: false, error: err.message || 'Error al buscar destinatario' });
      } finally {
        if (isCurrent) setIsSearchingRecipient(false);
      }
    }, 400);

    return () => {
      isCurrent = false;
      clearTimeout(delayTimer);
    };
  }, [transferPhone, customer?.phone]);

  // Execute RYYCOS Transfer
  const handleExecuteTransfer = async () => {
    if (!customer || !recipientResult?.phone) return;
    const numAmount = parseInt(transferAmount, 10);
    if (isNaN(numAmount) || numAmount <= 0) {
      alert("Por favor ingresa una cantidad válida y mayor a 0 de RYYCOS a transferir.");
      return;
    }
    const currentBal = customer.points !== undefined ? customer.points : (customer.ryycos !== undefined ? customer.ryycos : 0);
    if (numAmount > currentBal) {
      alert(`Saldo insuficiente. Tienes ${currentBal.toLocaleString('es-CO')} RYYCOS disponibles y deseas transferir ${numAmount.toLocaleString('es-CO')} RYYCOS.`);
      return;
    }

    setIsTransferring(true);
    try {
      const receipt = await transferRyycosByPhone(customer.phone, recipientResult.phone, numAmount);
      
      // Update local state with exact new balance and new outgoing movement
      const newBalance = receipt.senderBalanceAfter;
      const newMovement: RyycoMovement = {
        id: 'mov_tx_' + receipt.referenceId + '_out',
        customerId: customer.phone,
        type: 'transfer_sent',
        amount: -receipt.amount,
        balanceAfter: newBalance,
        description: `Envío de RYYCOS a ${receipt.recipientName} (${receipt.recipientPhone})`,
        referenceId: receipt.referenceId,
        targetPhone: receipt.recipientPhone,
        targetName: receipt.recipientName,
        createdAt: receipt.createdAt
      };

      const updatedCustomer: CustomerProfile = {
        ...customer,
        points: newBalance,
        ryycos: newBalance,
        movements: [newMovement, ...(customer.movements || [])]
      };

      setCustomer(updatedCustomer);
      setActiveCustomerSession(updatedCustomer);
      onCustomerUpdate?.(updatedCustomer);

      setShowTransferConfirmModal(false);
      setTransferReceipt(receipt);
      setTransferPhone('');
      setTransferAmount('');
      setRecipientResult(null);
      setActionSuccessMsg(`¡Transferencia exitosa! Se enviaron exactamente ${receipt.amount.toLocaleString('es-CO')} RYYCOS a ${receipt.recipientName}. Tu nuevo saldo es de ${newBalance.toLocaleString('es-CO')} RYYCOS.`);
      setTimeout(() => setActionSuccessMsg(null), 6000);
    } catch (err: any) {
      alert(err.message || "Error al realizar la transferencia.");
    } finally {
      setIsTransferring(false);
    }
  };

  const handleShareTransferWhatsApp = (receipt: RyycoTransferReceipt) => {
    const text = `🚀 *Comprobante de Envío de RYYCOS*\n\n` +
      `¡Hola ${receipt.recipientName}! Te acabo de enviar *${receipt.amount.toLocaleString('es-CO')} RYYCOS* ($${receipt.amount.toLocaleString('es-CO')} COP) a tu número de celular ${receipt.recipientPhone} para disfrutar comida y compras en la app RYYCO.\n\n` +
      `📌 *Referencia:* ${receipt.referenceId}\n` +
      `👤 *Remitente:* ${receipt.senderName}\n` +
      `📅 *Fecha:* ${new Date(receipt.createdAt).toLocaleString('es-CO')}\n\n` +
      `¡Revisa tu Billetera de RYYCOS en la app para ver tu saldo acumulado!`;
    window.open(`https://wa.me/57${receipt.recipientPhone}?text=${encodeURIComponent(text)}`, '_blank');
  };

  // Exchange RYYCOS for Food Reward
  const handleExchangeReward = async (reward: RedeemableFoodReward) => {
    if (!customer) return;
    if ((customer.points || 0) < reward.pointsCost) {
      alert(`Te faltan ${reward.pointsCost - customer.points} RYYCOS para canjear este premio.`);
      return;
    }

    const confirm = window.confirm(`¿Deseas canjear ${reward.pointsCost.toLocaleString('es-CO')} RYYCOS por "${reward.title}"?`);
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
      alert(err.message || "Error al canjear RYYCOS.");
    } finally {
      setRedeemingRewardId(null);
    }
  };

  const handleCopyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCodeId(id);
    setTimeout(() => setCopiedCodeId(null), 2500);
  };

  // Status mapping for order tracking (5 distinct stages: 1. Recibido, 2. Confirmado, 3. En Cocina/Listo, 4. En Camino, 5. Entregado)
  const getOrderStatusStep = (ord: OrderItem) => {
    if (ord.status === 'cancelled') return 0;
    if (ord.status === 'delivered' || ord.deliveryStep === 'delivered') return 5;
    if (
      ord.status === 'delivering' ||
      ord.status === 'shipped' || 
      ord.deliveryStep === 'to_client' || 
      ord.deliveryStep === 'at_destination'
    ) return 4;
    if (
      ord.status === 'ready' ||
      ord.status === 'preparing' || 
      ord.status === 'processing' || 
      ord.status === 'picked_up' || 
      ord.deliveryStep === 'picked_up' || 
      ord.deliveryStep === 'to_store' || 
      ord.deliveryStep === 'at_store'
    ) return 3;
    if (
      ord.status === 'confirmed' ||
      ord.deliveryType === 'restaurant' ||
      Boolean(ord.deliveryDriverId) ||
      Boolean(ord.deliveryDriverName)
    ) return 2;
    return 1;
  };

  // Detailed status descriptor for Customer Stepper Tracker
  const getOrderStepperInfo = (ord: OrderItem, step: number) => {
    switch (step) {
      case 1:
        return {
          stageTitle: 'Paso 1 de 5 • Recepción',
          headline: 'Pedido Recibido en Ryyco',
          description: 'Tu pedido ha sido recibido y se encuentra en espera de confirmación por la tienda o domiciliario.',
          percentageLabel: '15%',
          icon: <Clock className="w-4 h-4 text-amber-400" />,
          iconBadge: 'bg-amber-400/20 text-amber-400 border border-amber-400/30',
          bannerBg: 'bg-amber-500/10 border-amber-500/25',
          tagBadge: 'bg-amber-500/20 text-amber-300 border-amber-500/30'
        };
      case 2:
        const isStoreOwn = ord.deliveryType === 'restaurant';
        const driverName = ord.deliveryDriverName;
        return {
          stageTitle: 'Paso 2 de 5 • Confirmación',
          headline: isStoreOwn 
            ? 'Confirmado por Restaurante (Entrega Propia)' 
            : (driverName ? `Domiciliario Asignado: ${driverName}` : 'Pedido Confirmado'),
          description: isStoreOwn 
            ? 'El restaurante confirmó tu orden y realizará la entrega con su propio domiciliario.'
            : (driverName ? `${driverName} aceptó la entrega y se prepara para recoger en el restaurante.` : 'El pedido ya tiene responsable de despacho asignado.'),
          percentageLabel: '35%',
          icon: <CheckCircle2 className="w-4 h-4 text-blue-400" />,
          iconBadge: 'bg-blue-400/20 text-blue-400 border border-blue-400/30',
          bannerBg: 'bg-blue-500/10 border-blue-500/25',
          tagBadge: 'bg-blue-500/20 text-blue-300 border-blue-500/30'
        };
      case 3:
        const isReady = ord.status === 'ready';
        const isPickedUpAtStore = ord.deliveryStep === 'picked_up' || ord.status === 'picked_up';
        return {
          stageTitle: isReady 
            ? 'Paso 3 de 5 • Empacado y Listo' 
            : (isPickedUpAtStore ? 'Paso 3 de 5 • En Cocina (Recogido en Tienda)' : 'Paso 3 de 5 • En Cocina'),
          headline: isReady 
            ? '¡Pedido Listo y Empacado!' 
            : (isPickedUpAtStore 
                ? (ord.deliveryDriverName ? `${ord.deliveryDriverName} en tienda alistando pedido` : 'En Cocina / Recogido en Tienda') 
                : 'En Preparación / Cocina'),
          description: isReady 
            ? 'Tu pedido está listo y empacado, esperando salida para entrega.'
            : (isPickedUpAtStore 
                ? (ord.deliveryDriverName ? `${ord.deliveryDriverName} está en el restaurante esperando la entrega de tus platos recién cocinados.` : 'Tu pedido se encuentra en cocina y siendo alistado por el domiciliario en la tienda.')
                : 'El restaurante está cocinando tus platos con los mejores ingredientes.'),
          percentageLabel: isReady ? '65%' : (isPickedUpAtStore ? '60%' : '50%'),
          icon: <Utensils className="w-4 h-4 text-orange-400" />,
          iconBadge: 'bg-orange-400/20 text-orange-400 border border-orange-400/30',
          bannerBg: 'bg-orange-500/10 border-orange-500/25',
          tagBadge: 'bg-orange-500/20 text-orange-300 border-orange-500/30'
        };
      case 4:
        return {
          stageTitle: 'Paso 4 de 5 • En Ruta',
          headline: '¡En camino a tu ubicación!',
          description: ord.deliveryDriverName 
            ? `${ord.deliveryDriverName} lleva tu pedido caliente directamente a tu dirección.`
            : 'Tu pedido ya salió de la tienda y va en camino hacia tu puerta.',
          percentageLabel: '85%',
          icon: <Truck className="w-4 h-4 text-[#E63946] animate-pulse" />,
          iconBadge: 'bg-[#E63946]/20 text-[#E63946] border border-[#E63946]/30',
          bannerBg: 'bg-[#E63946]/10 border-[#E63946]/25',
          tagBadge: 'bg-[#E63946]/20 text-[#E63946] border-[#E63946]/30'
        };
      case 5:
        return {
          stageTitle: 'Paso 5 de 5 • Entregado',
          headline: '¡Pedido Entregado con Éxito!',
          description: 'Tu pedido fue completado satisfactoriamente. ¡Esperamos que disfrutes tu comida!',
          percentageLabel: '100%',
          icon: <Check className="w-4 h-4 text-emerald-400" />,
          iconBadge: 'bg-emerald-400/20 text-emerald-400 border border-emerald-400/30',
          bannerBg: 'bg-emerald-500/10 border-emerald-500/25',
          tagBadge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
        };
      default:
        return {
          stageTitle: 'Cancelado',
          headline: 'Pedido Cancelado',
          description: ord.cancellationReason || 'Este pedido fue cancelado.',
          percentageLabel: '0%',
          icon: <AlertCircle className="w-4 h-4 text-red-400" />,
          iconBadge: 'bg-red-400/20 text-red-400 border border-red-400/30',
          bannerBg: 'bg-red-500/10 border-red-500/25',
          tagBadge: 'bg-red-500/20 text-red-300 border-red-500/30'
        };
    }
  };

  const getStatusBadge = (ord: OrderItem) => {
    if (ord.status === 'cancelled') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-red-500/10 text-red-400 border border-red-500/20">
          ❌ Cancelado {ord.cancelledBy ? `(${ord.cancelledBy === 'restaurant' ? 'por tienda' : ord.cancelledBy === 'customer' ? 'por cliente' : 'por repartidor'})` : ''}
        </span>
      );
    }
    if (ord.status === 'delivered' || ord.deliveryStep === 'delivered') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
          Entregado
        </span>
      );
    }
    if (
      ord.status === 'delivering' || 
      ord.status === 'shipped' || 
      ord.deliveryStep === 'to_client' || 
      ord.deliveryStep === 'at_destination'
    ) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black bg-purple-500/15 text-purple-300 border border-purple-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-ping" />
          🛵 En Camino
        </span>
      );
    }
    if (ord.status === 'picked_up' || ord.deliveryStep === 'picked_up') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black bg-orange-500/15 text-orange-400 border border-orange-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
          👨‍🍳 En Cocina
        </span>
      );
    }
    if (ord.status === 'ready') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
          📦 Listo para Entrega
        </span>
      );
    }
    if (ord.deliveryStep === 'to_store' || ord.deliveryStep === 'at_store') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black bg-sky-500/15 text-sky-300 border border-sky-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
          🛵 Repartidor en Tienda
        </span>
      );
    }
    if (ord.status === 'preparing' || ord.status === 'processing') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black bg-orange-500/15 text-orange-400 border border-orange-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
          👨‍🍳 En Cocina / Preparación
        </span>
      );
    }
    if (ord.status === 'confirmed') {
      if (ord.deliveryType === 'restaurant') {
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black bg-blue-500/15 text-blue-300 border border-blue-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            🛵 Domicilio Propio Confirmado
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black bg-blue-500/15 text-blue-300 border border-blue-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
          🛵 Domiciliario Asignado
        </span>
      );
    }
    if (ord.deliveryStep === 'accepted' || (ord.deliveryDriverName && !ord.deliveryStep)) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black bg-blue-500/15 text-blue-300 border border-blue-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
          🛵 Domiciliario Asignado
        </span>
      );
    }
    // Default: pending
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-500/15 text-amber-400 border border-amber-500/30">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
        ⏳ Esperando Asignación
      </span>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-[#0b0f19] border border-gray-800 rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl relative overflow-hidden text-gray-100 animate-fade-in my-auto">
        
        {/* Glow ambient decoration */}
        <div className="absolute top-0 right-1/4 w-72 h-72 bg-[#E63946]/10 rounded-full blur-[90px] pointer-events-none" />
        <div className="absolute bottom-0 left-10 w-72 h-72 bg-amber-500/10 rounded-full blur-[90px] pointer-events-none" />

        {/* HEADER (shown when logged in, or clean close button when not logged in) */}
        {customer ? (
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
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-amber-400/10 text-amber-400 border border-amber-400/20 uppercase tracking-wider">VIP</span>
                </div>
                <p className="text-[11px] text-gray-400 font-medium">
                  Hola, {customer.name}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 font-black text-xs font-mono shadow-sm">
                <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                <span>{(customer.points || 0).toLocaleString('es-CO')} RYYCOS</span>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="h-9 px-2.5 rounded-xl bg-slate-800/80 hover:bg-red-500/20 text-slate-300 hover:text-red-300 border border-slate-700 hover:border-red-500/40 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer active:scale-95 shadow-sm"
                title="Cerrar sesión de cliente"
              >
                <LogOut className="w-3.5 h-3.5 text-red-400" />
                <span className="hidden sm:inline">Cerrar Sesión</span>
              </button>
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-xl bg-[#E63946] hover:bg-red-600 border border-red-500/60 flex items-center justify-center text-white shadow-md shadow-[#E63946]/20 transition cursor-pointer active:scale-95"
                title="Cerrar"
              >
                <X className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>
          </div>
        ) : (
          <div className="p-5 sm:p-6 pb-2 flex items-start justify-between relative z-20">
            <div className="pr-3 text-left">
              <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight">Bienvenido a RYYCO</h3>
              <p className="text-xs sm:text-sm text-gray-400 mt-1 font-medium leading-relaxed">
                Inicia sesión para ver tus pedidos, ganar premios y acumular RYYCOS.
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-[#E63946] hover:bg-red-600 border border-red-500/60 flex items-center justify-center text-white shadow-md shadow-[#E63946]/20 transition cursor-pointer active:scale-95 shrink-0"
              title="Cerrar"
            >
              <X className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>
        )}

        {/* NOT LOGGED IN SCREEN */}
        {!customer ? (
          <div className="p-5 sm:p-8 pt-2 sm:pt-3 overflow-y-auto flex-1 space-y-6">
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
                Crear Cuenta Nueva (¡+1.000 RYYCOS!)
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
                        Acceso a RYYCOS, ruleta de premios y pedidos
                      </div>
                    </div>
                  </>
                )}
              </button>

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
                    placeholder="Ej: 3106502043"
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
                    <button
                      type="button"
                      onClick={() => setShowForgotPasswordInfo(!showForgotPasswordInfo)}
                      className="text-[10px] text-[#E63946] hover:underline font-bold cursor-pointer"
                    >
                      ¿Olvidaste tu contraseña?
                    </button>
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
                  <div className="flex items-center justify-between text-[9.5px] text-gray-500 mt-1">
                    <span>O usa el botón de Google arriba para entrar sin clave.</span>
                  </div>

                  {showForgotPasswordInfo && (
                    <div className="mt-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[11px] text-amber-300 space-y-2">
                      <p className="font-bold flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        ¿No recuerdas tu contraseña de cliente?
                      </p>
                      <p className="text-[10.5px] text-gray-300 leading-relaxed">
                        Puedes ingresar de inmediato con 1 clic usando el botón blanco <strong>"Ingresar como Cliente con Google"</strong> arriba, o escribir a soporte para recuperar tu acceso.
                      </p>
                      <a
                        href="https://wa.me/573106502043?text=Hola%20soporte%20Ryyco,%20necesito%20ayuda%20para%20restablecer%20mi%20contrase%C3%B1a%20de%20cliente"
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-black transition"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        Pedir Ayuda a Soporte por WhatsApp
                      </a>
                    </div>
                  )}
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
                        placeholder="Ej: Alex Realpe"
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
                    <span className="text-[9.5px] text-gray-500 mt-1 block">Recibe confirmaciones de despacho y respalda tus RYYCOS de comida.</span>
                  </div>

                  <div>
                    <label className="text-[11px] font-black uppercase text-gray-400 block mb-1">
                      Dirección de Despacho Habitual (Opcional)
                    </label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
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
                      <button
                        type="button"
                        onClick={() => setIsMapPickerOpen(true)}
                        className="h-11 px-3 bg-[#E63946]/10 hover:bg-[#E63946]/20 border border-[#E63946]/40 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition shrink-0 cursor-pointer"
                        title="Fijar con Google Maps"
                      >
                        <MapPin className="w-4 h-4 text-[#E63946]" />
                        <span className="hidden sm:inline">Google Maps</span>
                      </button>
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

                  {/* Términos y Condiciones para Compradores */}
                  <div className="pt-1">
                    <label className="flex items-start gap-2.5 cursor-pointer select-none bg-[#090D16] p-3 rounded-xl border border-[#232E42] hover:border-[#E63946]/50 transition">
                      <input
                        type="checkbox"
                        checked={acceptedBuyerTerms}
                        onChange={(e) => {
                          setAcceptedBuyerTerms(e.target.checked);
                          if (authError && authError.includes('Términos')) setAuthError('');
                        }}
                        className="w-4 h-4 mt-0.5 accent-[#E63946] rounded cursor-pointer shrink-0"
                      />
                      <span className="text-[11px] text-gray-300 leading-snug">
                        He leído y acepto los{' '}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsBuyerTermsModalOpen(true);
                          }}
                          className="text-[#E63946] hover:underline font-bold inline cursor-pointer"
                        >
                          Términos y Condiciones para Usuarios y Compradores
                        </button>
                        {' '}y la Política de Tratamiento de Datos Personales de Ryyco.
                      </span>
                    </label>
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
                    Crear Cuenta y Ganar 1.000 RYYCOS ($1.000 COP) 🎁
                  </>
                ) : (
                  <>
                    <ArrowRight className="w-4 h-4" />
                    Ingresar a Mi Cuenta
                  </>
                )}
              </button>

              {/* Botón para consultar términos */}
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => setIsBuyerTermsModalOpen(true)}
                  className="inline-flex items-center gap-1.5 text-[10.5px] font-bold text-gray-400 hover:text-white transition cursor-pointer"
                >
                  <Scale className="w-3.5 h-3.5 text-[#F4B400]" />
                  <span>Consultar Términos y Condiciones para Usuarios y Compradores</span>
                </button>
              </div>
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
                <Coins className="w-4 h-4 shrink-0" />
                <span className="truncate">Mis ryycos</span>
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
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-black text-white">Estado de tus Pedidos</h4>
                        <span className="inline-flex items-center gap-1 text-[9.5px] font-black px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                          En tiempo real
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-400">Rastreo en vivo de despachos y preparación</p>
                    </div>
                    <button
                      onClick={() => customer?.phone && loadCustomerOrders(customer.phone)}
                      disabled={ordersLoading}
                      className="px-2.5 py-1.5 bg-gray-900 hover:bg-gray-800 border border-gray-800 text-gray-300 hover:text-white rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${ordersLoading ? 'animate-spin' : ''}`} />
                      <span className="hidden sm:inline">Actualizar</span>
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
                        const step = getOrderStatusStep(order);
                        const isCancelled = order.status === 'cancelled';
                        const isDelivered = order.status === 'delivered' || order.deliveryStep === 'delivered' || step >= 5;

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
                                {getStatusBadge(order)}
                                <span className="text-[10px] text-gray-500 font-mono">
                                  {order.createdAt ? new Date(order.createdAt).toLocaleDateString('es-CO', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                                </span>
                              </div>
                            </div>

                            {/* STEPPER PROGRESS BAR / ORDER STATUS TRACKER (5 PHASES) */}
                            {!isCancelled && (() => {
                              const stepperInfo = getOrderStepperInfo(order, step);
                              return (
                                <div className="space-y-3 py-1 bg-[#05070D] p-3 sm:p-4 rounded-2xl border border-[#1E2638] shadow-inner">
                                  {/* Dynamic Status Callout Banner */}
                                  <div className={`p-2.5 sm:p-3 rounded-xl border flex items-center justify-between gap-2.5 transition ${stepperInfo.bannerBg}`}>
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${stepperInfo.iconBadge}`}>
                                        {stepperInfo.icon}
                                      </div>
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-gray-300 truncate">
                                            {stepperInfo.stageTitle}
                                          </span>
                                          {step < 5 && (
                                            <span className="w-1.5 h-1.5 rounded-full bg-current animate-ping shrink-0" />
                                          )}
                                        </div>
                                        <p className="text-[11.5px] sm:text-xs font-bold text-white truncate mt-0.5">
                                          {stepperInfo.headline}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${stepperInfo.tagBadge}`}>
                                        {stepperInfo.percentageLabel}
                                      </span>
                                    </div>
                                  </div>

                                  {/* 5-Node Stepper Track */}
                                  <div className="relative pt-2 pb-1">
                                    {/* Connective background track */}
                                    <div className="absolute top-[17px] sm:top-[20px] left-[10%] right-[10%] h-1 bg-gray-800 -translate-y-1/2 z-0 rounded-full" />
                                    {/* Active colored gradient fill */}
                                    <div 
                                      className="absolute top-[17px] sm:top-[20px] left-[10%] h-1 bg-gradient-to-r from-amber-400 via-blue-500 via-orange-500 via-[#E63946] to-emerald-400 -translate-y-1/2 z-0 rounded-full transition-all duration-500" 
                                      style={{ width: `${Math.min(80, Math.max(0, ((step - 1) / 4) * 80))}%` }}
                                    />

                                    <div className="grid grid-cols-5 gap-0.5 relative z-10">
                                      {/* Node 1: Recibido */}
                                      <div className="flex flex-col items-center text-center">
                                        <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-black transition ${
                                          step > 1 
                                            ? 'bg-amber-400 text-black shadow-sm' 
                                            : step === 1 
                                              ? 'bg-amber-400 text-black ring-4 ring-amber-400/25 ring-offset-2 ring-offset-[#090D16] animate-pulse font-black' 
                                              : 'bg-gray-800 text-gray-500'
                                        }`}>
                                          {step > 1 ? <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5 stroke-[3]" /> : '1'}
                                        </div>
                                        <span className={`text-[8px] sm:text-[9.5px] font-bold mt-1 leading-tight truncate max-w-full px-0.5 ${
                                          step >= 1 ? 'text-amber-400' : 'text-gray-500'
                                        }`}>
                                          Recibido
                                        </span>
                                      </div>

                                      {/* Node 2: Confirmado */}
                                      <div className="flex flex-col items-center text-center">
                                        <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-black transition ${
                                          step > 2 
                                            ? 'bg-blue-500 text-white shadow-sm' 
                                            : step === 2 
                                              ? 'bg-blue-500 text-white ring-4 ring-blue-500/25 ring-offset-2 ring-offset-[#090D16] animate-pulse font-black' 
                                              : 'bg-gray-800 text-gray-500'
                                        }`}>
                                          {step > 2 ? <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5 stroke-[3]" /> : '2'}
                                        </div>
                                        <span className={`text-[8px] sm:text-[9.5px] font-bold mt-1 leading-tight truncate max-w-full px-0.5 ${
                                          step >= 2 ? 'text-blue-400' : 'text-gray-500'
                                        }`}>
                                          Confirmado
                                        </span>
                                      </div>

                                      {/* Node 3: En Cocina / Listo */}
                                      <div className="flex flex-col items-center text-center">
                                        <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-black transition ${
                                          step > 3 
                                            ? 'bg-orange-500 text-white shadow-sm' 
                                            : step === 3 
                                              ? 'bg-orange-500 text-white ring-4 ring-orange-500/25 ring-offset-2 ring-offset-[#090D16] animate-pulse font-black' 
                                              : 'bg-gray-800 text-gray-500'
                                        }`}>
                                          {step > 3 ? <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5 stroke-[3]" /> : '3'}
                                        </div>
                                        <span className={`text-[8px] sm:text-[9.5px] font-bold mt-1 leading-tight truncate max-w-full px-0.5 ${
                                          step >= 3 ? 'text-orange-400' : 'text-gray-500'
                                        }`}>
                                          {order.status === 'ready' ? 'Listo' : 'En Cocina'}
                                        </span>
                                      </div>

                                      {/* Node 4: En Camino */}
                                      <div className="flex flex-col items-center text-center">
                                        <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-black transition ${
                                          step > 4 
                                            ? 'bg-[#E63946] text-white shadow-sm' 
                                            : step === 4 
                                              ? 'bg-[#E63946] text-white ring-4 ring-[#E63946]/25 ring-offset-2 ring-offset-[#090D16] animate-pulse font-black' 
                                              : 'bg-gray-800 text-gray-500'
                                        }`}>
                                          {step > 4 ? <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5 stroke-[3]" /> : '4'}
                                        </div>
                                        <span className={`text-[8px] sm:text-[9.5px] font-bold mt-1 leading-tight truncate max-w-full px-0.5 ${
                                          step >= 4 ? 'text-[#E63946]' : 'text-gray-500'
                                        }`}>
                                          En Camino
                                        </span>
                                      </div>

                                      {/* Node 5: Entregado */}
                                      <div className="flex flex-col items-center text-center">
                                        <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-black transition ${
                                          step >= 5 
                                            ? 'bg-emerald-400 text-black ring-4 ring-emerald-400/25 ring-offset-2 ring-offset-[#090D16] shadow-sm font-black' 
                                            : 'bg-gray-800 text-gray-500'
                                        }`}>
                                          {step >= 5 ? <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5 stroke-[3]" /> : '5'}
                                        </div>
                                        <span className={`text-[8px] sm:text-[9.5px] font-bold mt-1 leading-tight truncate max-w-full px-0.5 ${
                                          step >= 5 ? 'text-emerald-400' : 'text-gray-500'
                                        }`}>
                                          Entregado
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Helpful stage description note */}
                                  <p className="text-[10.5px] sm:text-[11px] text-gray-400 px-1 pt-0.5">
                                    {stepperInfo.description}
                                  </p>
                                </div>
                              );
                            })()}

                            {/* Cancellation alert if cancelled */}
                            {isCancelled && (
                              <div className="p-3 bg-red-500/10 border border-red-500/25 rounded-xl text-xs space-y-1">
                                <div className="flex items-center gap-1.5 text-red-400 font-bold">
                                  <AlertCircle className="w-4 h-4 shrink-0" />
                                  <span>Pedido cancelado {order.cancelledBy ? `por ${order.cancelledBy === 'restaurant' ? 'el restaurante' : order.cancelledBy === 'customer' ? 'el cliente' : 'el domiciliario'}` : ''}</span>
                                </div>
                                {order.cancellationReason && (
                                  <p className="text-[11px] text-gray-300 pl-5.5">Motivo: "{order.cancellationReason}"</p>
                                )}
                              </div>
                            )}

                            {/* Restaurant own delivery info if confirmed by store */}
                            {!isDelivered && order.deliveryType === 'restaurant' && (
                              <div className="p-3 bg-blue-950/30 border border-blue-800/40 rounded-xl flex items-center justify-between gap-3 text-xs">
                                <div className="flex items-center gap-2.5">
                                  <div className="w-8 h-8 rounded-full bg-blue-500/15 flex items-center justify-center text-blue-400">
                                    <Truck className="w-4 h-4" />
                                  </div>
                                  <div>
                                    <span className="text-[10px] text-blue-400 font-black uppercase tracking-wider block">Entrega por el Restaurante</span>
                                    <span className="font-bold text-white">Domiciliario propio de la tienda asignado</span>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Driver info if assigned (only while delivery is active, removed when delivered) */}
                            {!isDelivered && order.deliveryDriverName && (
                              <div className="p-3 bg-[#161F30] border border-[#232E42] rounded-xl flex items-center justify-between gap-3 text-xs">
                                <div className="flex items-center gap-2.5">
                                  <div className="w-8 h-8 rounded-full bg-[#E63946]/15 flex items-center justify-center text-[#E63946]">
                                    <Truck className="w-4 h-4" />
                                  </div>
                                  <div>
                                    <span className="text-[10px] text-[#E63946] font-black uppercase tracking-wider block">Domiciliario RYYCO Asignado</span>
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

                            {/* Real-time status history timeline */}
                            {order.statusHistory && order.statusHistory.length > 0 && (
                              <div className="bg-[#090D16] p-3 rounded-xl border border-gray-800/80 text-xs space-y-1.5">
                                <div className="flex items-center justify-between text-[10px] text-gray-400 font-bold uppercase tracking-wider border-b border-gray-800/80 pb-1">
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3 text-amber-400" /> Historial de Estado en Vivo
                                  </span>
                                  <span className="text-emerald-400 font-mono text-[9px] flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Tiempo Real
                                  </span>
                                </div>
                                <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
                                  {order.statusHistory.map((h, hIdx) => (
                                    <div key={hIdx} className="flex items-start justify-between gap-2 text-[11px] text-gray-300">
                                      <span className="flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-[#E63946] shrink-0" />
                                        <span>{h.note || h.status}</span>
                                      </span>
                                      <span className="text-gray-500 font-mono text-[9px] shrink-0">
                                        {new Date(h.timestamp).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\./g, '').toUpperCase()}
                                      </span>
                                    </div>
                                  ))}
                                </div>
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

                            {/* Actions - driver tracking & Soporte Ryyco */}
                            <div className="flex flex-col sm:flex-row gap-2">
                              {!isDelivered && (
                                <button
                                  type="button"
                                  onClick={() => setTrackingOrder(order)}
                                  className="flex-1 py-2.5 bg-gradient-to-r from-[#E63946] to-[#D62839] hover:from-[#d62839] hover:to-[#b71c1c] text-white rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 shadow-md shadow-[#E63946]/20 active:scale-[0.98] cursor-pointer"
                                >
                                  <Navigation className="w-3.5 h-3.5 text-white animate-pulse" />
                                  <span>Seguir mi pedido</span>
                                </button>
                              )}

                              <a
                                href={`https://wa.me/573106502043?text=${encodeURIComponent(`Hola Soporte Ryyco, necesito ayuda con mi pedido #${order.orderNumber} a nombre de ${customer.name}.`)}`}
                                target="_blank"
                                rel="noreferrer"
                                className={`${!isDelivered ? 'flex-1' : 'w-full'} py-2.5 bg-gray-900 hover:bg-gray-800 text-gray-300 hover:text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 border border-gray-800`}
                              >
                                <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                                Soporte Ryyco
                              </a>
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

              {/* TAB 3: BILLETERA Y SISTEMA DE RYYCOS */}
              {activeTab === 'rewards' && (
                <div className="space-y-5">
                  {/* VIP RYYCOS WALLET CARD */}
                  <div className="bg-gradient-to-r from-amber-600 via-yellow-500 to-amber-700 p-5 rounded-2xl text-black shadow-xl shadow-amber-500/10 flex flex-col justify-between relative overflow-hidden">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-black/70">Billetera de RYYCOS</span>
                        <h3 className="text-3xl font-black font-mono tracking-tight">
                          {(customer.points || 0).toLocaleString('es-CO')} <span className="text-sm font-sans font-bold">RYYCOS</span>
                        </h3>
                        <p className="text-xs font-black text-black/80 mt-0.5">
                          = ${(customer.points || 0).toLocaleString('es-CO')} COP disponibles para comida y compras
                        </p>
                      </div>
                      <div className="p-2 bg-black/10 rounded-xl">
                        <Crown className="w-6 h-6 text-black" />
                      </div>
                    </div>

                    <div className="mt-3 bg-black/15 rounded-xl p-2.5 flex flex-col gap-1 text-[11px] font-bold">
                      <div className="flex items-center justify-between">
                        <span>⭐ Ganas 500 RYYCOS ($500 COP) por cada compra</span>
                        <span>1 RYYCO = $1 COP</span>
                      </div>
                      <span className="text-[10px] text-black/70 font-semibold">Tus RYYCOS se acumulan automáticamente, los puedes transferir a otros clientes o canjear por comida.</span>
                    </div>

                    <div className="mt-3 pt-3 border-t border-black/15 flex justify-between items-center text-xs font-bold text-black/90">
                      <span className="truncate">Titular: {customer.name} (📱 {customer.phone})</span>
                      <span className="text-[10px] font-mono uppercase bg-black/20 px-2.5 py-0.5 rounded-full text-black font-extrabold shrink-0 ml-2">
                        {customer.points >= 25000 ? '👑 Cliente Diamante' : customer.points >= 10000 ? '⭐ Cliente Oro' : '🌱 Cliente Bronce'}
                      </span>
                    </div>
                  </div>

                  {/* Action Navigation Tabs below Wallet Card */}
                  <div className="grid grid-cols-3 gap-2 p-1.5 bg-[#090D16] border border-[#232E42] rounded-2xl shadow-sm">
                    <button
                      id="wallet-tab-catalog-btn"
                      type="button"
                      onClick={() => setRyycosView('catalog')}
                      className={`py-2.5 px-2 sm:px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 sm:gap-2 transition cursor-pointer ${
                        ryycosView === 'catalog'
                          ? 'bg-gradient-to-r from-amber-400 to-orange-500 text-black shadow-md shadow-amber-500/20'
                          : 'text-gray-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <Gift className="w-4 h-4 shrink-0" />
                      <span>Canjear</span>
                    </button>

                    <button
                      id="wallet-tab-transfer-btn"
                      type="button"
                      onClick={() => setRyycosView('transfer')}
                      className={`py-2.5 px-2 sm:px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 sm:gap-2 transition cursor-pointer ${
                        ryycosView === 'transfer'
                          ? 'bg-gradient-to-r from-amber-400 to-orange-500 text-black shadow-md shadow-amber-500/20'
                          : 'text-gray-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <Send className="w-4 h-4 shrink-0" />
                      <span>Transferir</span>
                    </button>

                    <button
                      id="wallet-tab-history-btn"
                      type="button"
                      onClick={() => setRyycosView('history')}
                      className={`py-2.5 px-2 sm:px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 sm:gap-2 transition cursor-pointer ${
                        ryycosView === 'history'
                          ? 'bg-gradient-to-r from-amber-400 to-orange-500 text-black shadow-md shadow-amber-500/20'
                          : 'text-gray-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <History className="w-4 h-4 shrink-0" />
                      <span>Historial</span>
                    </button>
                  </div>

                  {/* SUB-VIEW 1: CANJEAR COMIDA POR RYYCOS */}
                  {ryycosView === 'catalog' && (
                    <div className="space-y-4 animate-fade-in">
                      <div>
                        <h4 className="text-sm font-black text-white mb-1">Catálogo de Comida para Redimir</h4>
                        <p className="text-xs text-gray-400">Canjea tus RYYCOS acumulados por bebidas, postres y platos completos sin pagar nada (1 RYYCO = $1 COP).</p>
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
                                    {reward.pointsCost.toLocaleString('es-CO')} RYYCOS
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
                                  `Faltan ${(reward.pointsCost - (customer.points || 0)).toLocaleString('es-CO')} RYYCOS`
                                )}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* SUB-VIEW 2: TRANSFERIR RYYCOS */}
                  {ryycosView === 'transfer' && (
                    <div className="space-y-4 animate-fade-in bg-[#090D16] border border-[#232E42] rounded-2xl p-4 sm:p-5">
                      <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                            <Send className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="text-sm font-black text-white">Transferir RYYCOS</h4>
                            <p className="text-[11px] text-gray-400">Envía RYYCOS a otro cliente al instante</p>
                          </div>
                        </div>
                        <span className="text-[10px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full font-bold">
                          Sin Comisiones
                        </span>
                      </div>

                      {/* Explicit Requirement Notice */}
                      <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-start gap-2.5 text-[11px] text-blue-300">
                        <ShieldCheck className="w-4 h-4 shrink-0 text-blue-400 mt-0.5" />
                        <div className="leading-snug">
                          <strong>Identificador Único Oficial:</strong> El cliente puede enviar RYYCOS exclusivamente utilizando el <strong>número de celular</strong> registrado en RYYCO. No se admiten transferencias por correo, usuario ni enlaces.
                        </div>
                      </div>

                      {/* Recipient Phone Field */}
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-black uppercase text-gray-400 flex items-center justify-between">
                          <span>Número de Celular del Destinatario</span>
                          <span className="text-gray-500 text-[10px] lowercase">solo números colombianos</span>
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500">
                            <Phone className="w-4 h-4 text-amber-400" />
                          </div>
                          <input
                            type="tel"
                            value={transferPhone}
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                              setTransferPhone(val);
                            }}
                            placeholder="Ej: 3106502043"
                            maxLength={10}
                            className="w-full h-11 bg-[#0d1322] border border-[#232E42] focus:border-amber-400 rounded-xl pl-9 pr-10 font-mono text-sm font-bold text-white placeholder:text-gray-600 outline-none transition"
                          />
                          {isSearchingRecipient && (
                            <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                              <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                            </div>
                          )}
                        </div>

                        {/* Recipient Verification Feedback */}
                        {recipientResult && (
                          <div className="mt-2">
                            {recipientResult.found ? (
                              <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-between animate-fade-in">
                                <div className="flex items-center gap-2.5">
                                  <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                                    <Check className="w-4 h-4 stroke-[3]" />
                                  </div>
                                  <div>
                                    <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-400 block">Destinatario Verificado</span>
                                    <h5 className="text-xs font-black text-white">{recipientResult.name}</h5>
                                  </div>
                                </div>
                                <span className="font-mono text-xs font-bold text-emerald-300">
                                  📱 {recipientResult.phone}
                                </span>
                              </div>
                            ) : (
                              <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold flex items-center gap-2 animate-fade-in">
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                <span>{recipientResult.error}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Amount Field */}
                      <div className="space-y-1.5 pt-1">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-black uppercase text-gray-400">
                            Cantidad de RYYCOS a Transferir
                          </label>
                          <span className="text-[11px] font-mono text-amber-400 font-bold">
                            Disponible: {(customer.points || 0).toLocaleString('es-CO')} RYYCOS
                          </span>
                        </div>

                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none font-bold text-xs text-amber-400">
                            RYYCOS
                          </div>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={transferAmount}
                            onChange={(e) => {
                              const cleaned = e.target.value.replace(/[^0-9]/g, '');
                              if (cleaned === '') {
                                setTransferAmount('');
                                return;
                              }
                              const num = parseInt(cleaned, 10);
                              const max = customer.points !== undefined ? customer.points : (customer.ryycos !== undefined ? customer.ryycos : 0);
                              if (!isNaN(num)) {
                                if (num > max) {
                                  setTransferAmount(max.toString());
                                } else {
                                  setTransferAmount(num.toString());
                                }
                              }
                            }}
                            placeholder="0"
                            className="w-full h-11 bg-[#0d1322] border border-[#232E42] focus:border-amber-400 rounded-xl pl-20 pr-3 font-mono text-sm font-black text-white placeholder:text-gray-600 outline-none transition"
                          />
                        </div>

                        {/* Quick Amount Suggestion Chips */}
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {[1000, 2000, 5000, 10000].map((amt) => {
                            const max = customer.points !== undefined ? customer.points : (customer.ryycos !== undefined ? customer.ryycos : 0);
                            const isAffordable = amt <= max;
                            return (
                              <button
                                key={amt}
                                type="button"
                                onClick={() => {
                                  if (isAffordable) {
                                    setTransferAmount(amt.toString());
                                  }
                                }}
                                disabled={!isAffordable}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold transition cursor-pointer ${
                                  isAffordable
                                    ? 'bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white'
                                    : 'bg-gray-900/60 text-gray-600 cursor-not-allowed border border-gray-800/40'
                                }`}
                              >
                                +{amt.toLocaleString('es-CO')}
                              </button>
                            );
                          })}
                          <button
                            type="button"
                            onClick={() => {
                              const max = customer.points !== undefined ? customer.points : (customer.ryycos !== undefined ? customer.ryycos : 0);
                              setTransferAmount(Math.max(0, max).toString());
                            }}
                            disabled={(customer.points || 0) <= 0}
                            className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-[11px] font-mono font-bold transition cursor-pointer border border-amber-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            Todo mi saldo
                          </button>
                        </div>
                      </div>

                      {/* Transfer Summary Preview */}
                      {parseInt(transferAmount, 10) > 0 && (
                        <div className="p-3 bg-black/40 border border-gray-800 rounded-xl space-y-1.5 text-xs">
                          <div className="flex justify-between text-gray-400">
                            <span>Valor en dinero real:</span>
                            <span className="font-mono font-bold text-white">${(parseInt(transferAmount, 10) || 0).toLocaleString('es-CO')} COP</span>
                          </div>
                          <div className="flex justify-between text-gray-400">
                            <span>Tu saldo después del envío:</span>
                            <span className={`font-mono font-bold ${
                              (customer.points || 0) - (parseInt(transferAmount, 10) || 0) < 0 ? 'text-red-400' : 'text-emerald-400'
                            }`}>
                              {Math.max(0, (customer.points || 0) - (parseInt(transferAmount, 10) || 0)).toLocaleString('es-CO')} RYYCOS
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Submit Action */}
                      <button
                        type="button"
                        disabled={
                          !recipientResult?.found || 
                          !transferAmount || 
                          parseInt(transferAmount, 10) <= 0 || 
                          parseInt(transferAmount, 10) > (customer.points || 0)
                        }
                        onClick={() => setShowTransferConfirmModal(true)}
                        className="w-full py-3.5 rounded-xl font-black text-xs uppercase tracking-wider transition flex items-center justify-center gap-2 cursor-pointer shadow-lg mt-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black shadow-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99]"
                      >
                        <Send className="w-4 h-4" />
                        <span>Revisar y Enviar RYYCOS</span>
                      </button>
                    </div>
                  )}

                  {/* SUB-VIEW 3: HISTORIAL DE MOVIMIENTOS */}
                  {ryycosView === 'history' && (
                    <div className="space-y-3 animate-fade-in">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-black text-white">Historial de RYYCOS</h4>
                          <p className="text-xs text-gray-400">Tus ingresos, consumos y transferencias</p>
                        </div>
                        <span className="text-[10px] font-mono text-gray-400 font-bold bg-gray-900 border border-gray-800 px-2 py-0.5 rounded-full">
                          {customer.movements?.length || 0} movimientos
                        </span>
                      </div>

                      {customer.movements && customer.movements.length > 0 ? (
                        <div className="space-y-2">
                          {[...customer.movements].reverse().map((mov) => {
                            const isPositive = mov.amount > 0;
                            return (
                              <div
                                key={mov.id}
                                className="bg-[#090D16] border border-[#232E42] rounded-2xl p-3 sm:p-3.5 flex items-center justify-between gap-3 hover:border-gray-700 transition"
                              >
                                <div className="flex items-center gap-3">
                                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                                    mov.type === 'transfer_received'
                                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                                      : mov.type === 'transfer_sent'
                                      ? 'bg-orange-500/15 text-orange-400 border border-orange-500/20'
                                      : mov.type === 'earned_purchase'
                                      ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                                      : mov.type === 'spin_prize'
                                      ? 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/20'
                                      : mov.type === 'welcome_bonus'
                                      ? 'bg-purple-500/15 text-purple-400 border border-purple-500/20'
                                      : 'bg-red-500/15 text-red-400 border border-red-500/20'
                                  }`}>
                                    {mov.type === 'transfer_received' ? (
                                      <ArrowDownLeft className="w-4 h-4" />
                                    ) : mov.type === 'transfer_sent' ? (
                                      <ArrowUpRight className="w-4 h-4" />
                                    ) : mov.type === 'earned_purchase' ? (
                                      <ShoppingBag className="w-4 h-4" />
                                    ) : mov.type === 'spin_prize' ? (
                                      <Crown className="w-4 h-4" />
                                    ) : mov.type === 'welcome_bonus' ? (
                                      <Gift className="w-4 h-4" />
                                    ) : (
                                      <UtensilsCrossed className="w-4 h-4" />
                                    )}
                                  </div>

                                  <div>
                                    <h5 className="text-xs font-black text-white leading-snug">
                                      {mov.title}
                                    </h5>
                                    <p className="text-[11px] text-gray-400 leading-tight mt-0.5">
                                      {mov.description}
                                    </p>
                                    <span className="text-[9.5px] text-gray-500 font-mono mt-1 block">
                                      {new Date(mov.createdAt).toLocaleString('es-CO', {
                                        month: 'short',
                                        day: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit'
                                      })}
                                    </span>
                                  </div>
                                </div>

                                <div className="text-right shrink-0">
                                  <span className={`font-mono text-xs font-black block ${
                                    isPositive ? 'text-emerald-400' : 'text-red-400'
                                  }`}>
                                    {isPositive ? `+${mov.amount.toLocaleString('es-CO')}` : mov.amount.toLocaleString('es-CO')} RYYCOS
                                  </span>
                                  <span className="text-[10px] text-gray-500 font-mono block mt-0.5">
                                    Saldo: {mov.balanceAfter.toLocaleString('es-CO')}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="p-8 text-center bg-[#090D16] border border-[#232E42] rounded-2xl space-y-2 text-gray-400">
                          <Wallet className="w-8 h-8 mx-auto text-gray-600" />
                          <p className="text-xs font-semibold">Aún no tienes movimientos registrados.</p>
                          <p className="text-[11px] text-gray-500">Realiza compras en la tienda para acumular RYYCOS o transfiérelos a tus amigos.</p>
                        </div>
                      )}
                    </div>
                  )}
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
                  Ingresa tu WhatsApp y dirección para rastrear tus pedidos y activar tus <strong className="text-amber-400 font-black">1.000 RYYCOS de Bienvenida ($1.000 COP)</strong>.
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
                    placeholder="Ej: 3106502043"
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
                    placeholder="Ej: Alex Realpe"
                    className="w-full h-11 bg-[#090D16] border border-[#232E42] focus:border-[#E63946] rounded-xl pl-9 pr-3 text-xs font-semibold text-white placeholder:text-gray-500 outline-none transition"
                  />
                </div>
              </div>

              {/* Dirección de Domicilio */}
              <div>
                <label className="text-[11px] font-black uppercase text-gray-300 block mb-1">
                  Dirección de Domicilio / Entrega <span className="text-[#E63946]">*</span>
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
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
                  <button
                    type="button"
                    onClick={() => setIsMapPickerOpen(true)}
                    className="h-11 px-3 bg-[#E63946]/10 hover:bg-[#E63946]/20 border border-[#E63946]/40 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition shrink-0 cursor-pointer"
                    title="Fijar con Google Maps"
                  >
                    <MapPin className="w-4 h-4 text-[#E63946]" />
                    <span className="hidden sm:inline">Google Maps</span>
                  </button>
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

              {/* Aceptación de Términos para Comprador */}
              <div className="pt-1">
                <label className="flex items-start gap-2.5 cursor-pointer select-none bg-[#090D16] p-3 rounded-xl border border-[#232E42] hover:border-[#E63946]/50 transition">
                  <input
                    type="checkbox"
                    checked={acceptedBuyerTerms}
                    onChange={(e) => {
                      setAcceptedBuyerTerms(e.target.checked);
                      if (authError && authError.includes('Términos')) setAuthError('');
                    }}
                    className="w-4 h-4 mt-0.5 accent-[#E63946] rounded cursor-pointer shrink-0"
                  />
                  <span className="text-[11px] text-gray-300 leading-snug">
                    He leído y acepto los{' '}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsBuyerTermsModalOpen(true);
                      }}
                      className="text-[#E63946] hover:underline font-bold inline cursor-pointer"
                    >
                      Términos y Condiciones para Usuarios y Compradores
                    </button>
                    {' '}y la Política de Tratamiento de Datos Personales de Ryyco.
                  </span>
                </label>
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

      {/* TRY AGAIN MODAL (CUANDO CAE EN SIGUE INTENTANDO) */}
      {tryAgainModal && (
        <div className="fixed inset-0 z-60 bg-black/90 backdrop-blur-lg flex items-center justify-center p-4">
          <div className="bg-[#0e1322] border border-blue-500/40 rounded-3xl max-w-sm w-full p-6 text-center space-y-4 shadow-2xl relative animate-fade-in">
            <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-600 p-1 mx-auto flex items-center justify-center shadow-lg shadow-blue-500/20">
              <div className="w-full h-full rounded-full bg-black flex items-center justify-center text-3xl select-none">
                {tryAgainModal.icon || '🍀'}
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-[10px] uppercase font-black tracking-wider text-blue-400">Ruleta de la Suerte</span>
              <h3 className="text-xl font-black text-white">{tryAgainModal.title}</h3>
            </div>
            
            <div className="p-4 bg-gray-900/80 border border-gray-800 rounded-2xl space-y-2 text-left">
              <p className="text-xs text-gray-300 leading-relaxed">
                {tryAgainModal.description}
              </p>
              <div className="flex items-center gap-2 pt-1 text-[11px] font-bold text-amber-400 border-t border-gray-800">
                <Sparkles className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                <span>¡Cada pedido te da nuevos giros automáticos!</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setTryAgainModal(null)}
              className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:opacity-95 text-white font-black text-xs uppercase tracking-wider rounded-xl transition cursor-pointer shadow-lg shadow-blue-500/20"
            >
              ¡Entendido, Seguir Intentando! 🚀
            </button>
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

      {/* MODAL DE TÉRMINOS Y CONDICIONES PARA USUARIOS Y COMPRADORES */}
      <BuyerTermsModal
        isOpen={isBuyerTermsModalOpen}
        onClose={() => setIsBuyerTermsModalOpen(false)}
        onAccept={() => {
          setAcceptedBuyerTerms(true);
          setIsBuyerTermsModalOpen(false);
          if (authError && authError.includes('Términos')) {
            setAuthError('');
          }
        }}
        showAcceptButton={true}
      />

      {/* GOOGLE MAPS LOCATION PICKER MODAL */}
      <MapLocationPickerModal
        isOpen={isMapPickerOpen}
        onClose={() => setIsMapPickerOpen(false)}
        initialAddress={addressInput}
        onConfirm={(data) => {
          setAddressInput(data.address || addressInput);
        }}
      />

      {/* REAL-TIME DELIVERY TRACKING MODAL */}
      <DeliveryTrackingModal
        isOpen={!!trackingOrder}
        onClose={() => setTrackingOrder(null)}
        order={trackingOrder}
      />

      {/* MODAL DE CONFIRMACIÓN DE TRANSFERENCIA DE RYYCOS */}
      {showTransferConfirmModal && recipientResult?.found && (
        <div className="fixed inset-0 z-60 bg-black/90 backdrop-blur-lg flex items-center justify-center p-4">
          <div className="bg-[#0e1322] border border-amber-500/40 rounded-3xl max-w-sm w-full p-6 text-center space-y-4 shadow-2xl relative animate-fade-in">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/30 mx-auto flex items-center justify-center text-amber-400 shadow-lg shadow-amber-500/20">
              <Send className="w-7 h-7" />
            </div>

            <div className="space-y-1">
              <span className="text-[10px] uppercase font-black tracking-widest text-amber-400">Verifica los Datos</span>
              <h3 className="text-xl font-black text-white">¿Confirmas la Transferencia?</h3>
            </div>

            {/* Transfer breakdown card */}
            <div className="bg-black/50 border border-gray-800 rounded-2xl p-4 text-left space-y-3">
              <div className="flex items-center justify-between border-b border-gray-800/80 pb-2.5">
                <span className="text-xs text-gray-400">Destinatario</span>
                <span className="text-xs font-black text-white">{recipientResult.name}</span>
              </div>
              <div className="flex items-center justify-between border-b border-gray-800/80 pb-2.5">
                <span className="text-xs text-gray-400">Celular Destino</span>
                <span className="text-xs font-mono font-bold text-amber-400">📱 {recipientResult.phone}</span>
              </div>
              <div className="flex items-center justify-between border-b border-gray-800/80 pb-2.5">
                <span className="text-xs text-gray-400">RYYCOS a Enviar</span>
                <div className="text-right">
                  <span className="text-sm font-mono font-black text-emerald-400 block">
                    {(parseInt(transferAmount, 10) || 0).toLocaleString('es-CO')} RYYCOS
                  </span>
                  <span className="text-[10px] text-gray-500 font-mono">
                    = ${(parseInt(transferAmount, 10) || 0).toLocaleString('es-CO')} COP
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between pt-0.5">
                <span className="text-xs text-gray-400">Tu Saldo Posterior</span>
                <span className="text-xs font-mono font-bold text-gray-300">
                  {Math.max(0, (customer?.points || 0) - (parseInt(transferAmount, 10) || 0)).toLocaleString('es-CO')} RYYCOS
                </span>
              </div>
            </div>

            <p className="text-[11px] text-amber-300/80 bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/20 text-left leading-relaxed">
              ⚠️ <strong>Importante:</strong> Esta transacción es inmediata e irreversible. Los RYYCOS quedarán disponibles al instante para el destinatario.
            </p>

            <div className="pt-2 flex items-center gap-3">
              <button
                type="button"
                disabled={isTransferring}
                onClick={() => setShowTransferConfirmModal(false)}
                className="flex-1 py-3 px-4 rounded-xl border border-gray-800 bg-gray-900 hover:bg-gray-800 text-xs font-bold text-gray-400 hover:text-white transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isTransferring}
                onClick={handleExecuteTransfer}
                className="flex-1 py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-black text-xs uppercase tracking-wider rounded-xl transition cursor-pointer shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 active:scale-[0.99]"
              >
                {isTransferring ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Confirmar y Enviar</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DIGITAL RECEIPT / COMPROBANTE DE TRANSFERENCIA RYYCOS */}
      {transferReceipt && (
        <div className="fixed inset-0 z-60 bg-black/90 backdrop-blur-lg flex items-center justify-center p-4">
          <div className="bg-[#0e1322] border border-emerald-500/40 rounded-3xl max-w-sm w-full p-6 text-center space-y-4 shadow-2xl relative animate-fade-in">
            {/* Success Icon */}
            <div className="w-16 h-16 rounded-full bg-emerald-500/15 border-2 border-emerald-500/40 mx-auto flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/20">
              <Check className="w-8 h-8 stroke-[3]" />
            </div>

            <div className="space-y-1">
              <span className="text-[10px] uppercase font-black tracking-widest text-emerald-400">Comprobante Oficial</span>
              <h3 className="text-xl font-black text-white">¡Transferencia Exitosa!</h3>
            </div>

            {/* Big Amount Badge */}
            <div className="py-3 px-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
              <span className="text-2xl font-black font-mono text-emerald-400 block">
                {transferReceipt.amount.toLocaleString('es-CO')} RYYCOS
              </span>
              <span className="text-xs text-gray-400 font-mono">
                = ${transferReceipt.amount.toLocaleString('es-CO')} COP transferidos
              </span>
            </div>

            {/* Receipt details */}
            <div className="bg-black/50 border border-gray-800 rounded-2xl p-4 text-left space-y-2.5 text-xs">
              <div className="flex items-center justify-between border-b border-gray-800/80 pb-2">
                <span className="text-gray-400">Referencia</span>
                <span className="font-mono font-bold text-white text-[11px]">{transferReceipt.referenceId}</span>
              </div>
              <div className="flex items-center justify-between border-b border-gray-800/80 pb-2">
                <span className="text-gray-400">Destinatario</span>
                <span className="font-bold text-white">{transferReceipt.recipientName}</span>
              </div>
              <div className="flex items-center justify-between border-b border-gray-800/80 pb-2">
                <span className="text-gray-400">Celular Destino</span>
                <span className="font-mono font-bold text-amber-400">📱 {transferReceipt.recipientPhone}</span>
              </div>
              <div className="flex items-center justify-between border-b border-gray-800/80 pb-2">
                <span className="text-gray-400">Fecha y Hora</span>
                <span className="font-mono text-gray-300 text-[11px]">
                  {new Date(transferReceipt.createdAt).toLocaleString('es-CO')}
                </span>
              </div>
              <div className="flex items-center justify-between pt-0.5">
                <span className="text-gray-400">Tu Nuevo Saldo</span>
                <span className="font-mono font-black text-emerald-400">
                  {transferReceipt.senderBalanceAfter.toLocaleString('es-CO')} RYYCOS
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => handleShareTransferWhatsApp(transferReceipt)}
                className="w-full py-3 bg-[#25D366] hover:bg-[#20bd5a] text-black font-black text-xs uppercase tracking-wider rounded-xl transition cursor-pointer shadow-lg shadow-[#25D366]/20 flex items-center justify-center gap-2"
              >
                <Phone className="w-4 h-4" />
                <span>Compartir por WhatsApp</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setTransferReceipt(null);
                  setRyycosView('history');
                }}
                className="w-full py-2.5 rounded-xl border border-gray-800 bg-gray-900 hover:bg-gray-800 text-xs font-bold text-gray-400 hover:text-white transition cursor-pointer"
              >
                Ver en Mi Historial
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

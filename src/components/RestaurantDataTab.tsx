import React, { useState, useEffect } from 'react';
import { 
  Utensils, 
  ChefHat, 
  Clock, 
  MapPin, 
  Bike, 
  Check, 
  CheckCircle2, 
  Wifi, 
  Save, 
  Sparkles, 
  ExternalLink, 
  Phone, 
  MessageCircle, 
  Coffee, 
  ShieldCheck, 
  Headphones,
  Instagram,
  Facebook,
  Youtube,
  Twitter,
  Store, 
  ShoppingBag,
  CreditCard,
  Calendar,
  AlertCircle,
  Copy
} from 'lucide-react';
import { UserProfile, WeeklySchedule, DaySchedule } from '../types';
import { isUsernameAvailable } from '../lib/firebase';

// Custom Tiktok Icon component to match lucide-react styling
const Tiktok = ({ className = "w-4 h-4", ...props }: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
    <polyline points="15 8 15 2 19 2" />
  </svg>
);

interface RestaurantDataTabProps {
  profile: UserProfile;
  setProfile: React.Dispatch<React.SetStateAction<UserProfile>>;
  onSave: (updatedProfile: UserProfile) => Promise<void>;
  toggleStoreStatus: () => Promise<void>;
  updatingStatus: boolean;
  setIsMapPickerOpen: (open: boolean) => void;
}

const CUISINE_PRESETS = [
  '🍔 Comida Rápida & Hamburguesas',
  '🍕 Pizzería & Pastas',
  '🍗 Pollo Broaster & Asado',
  '🥩 Carnes, Parrilla & Asados',
  '🌮 Comida Mexicana & Tacos',
  '🍣 Sushi & Asiática',
  '🍛 Comida Típica & Tradicional',
  '🥪 Sandwiches, Arepas & Empanadas',
  '☕ Cafetería, Bakery & Desayunos',
  '🍦 Heladería & Postres',
  '🥗 Saludable & Fit',
  '🍹 Bar & Coctelería'
];

const PREPARATION_TIME_PRESETS = [
  '15 - 25 min',
  '20 - 35 min',
  '30 - 45 min',
  '40 - 55 min',
  '45 - 60 min'
];

const DAYS_OF_WEEK = [
  { id: 'lunes', label: 'Lunes' },
  { id: 'martes', label: 'Martes' },
  { id: 'miercoles', label: 'Miércoles' },
  { id: 'jueves', label: 'Jueves' },
  { id: 'viernes', label: 'Viernes' },
  { id: 'sabado', label: 'Sábado' },
  { id: 'domingo', label: 'Domingo' }
];

const PAYMENT_METHODS_OPTIONS = [
  'Efectivo contra entrega / en mesa',
  'Nequi',
  'Daviplata',
  'Transferencia Bancolombia',
  'Datáfono / Tarjetas crédito y débito',
  'Código QR bancario'
];

export const RestaurantDataTab: React.FC<RestaurantDataTabProps> = ({
  profile,
  setProfile,
  onSave,
  toggleStoreStatus,
  updatingStatus,
  setIsMapPickerOpen
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Form local states initialized from profile
  const [usernameField, setUsernameField] = useState(profile.username || '');
  const [usernameError, setUsernameError] = useState('');
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [coverTitle, setCoverTitle] = useState(profile.coverTitle || '');
  const [currency, setCurrency] = useState(profile.currency || '$');

  const [restaurantName, setRestaurantName] = useState(profile.displayName || profile.storeName || '');
  const [cuisine, setCuisine] = useState(profile.restaurantCuisine || profile.category || '🍔 Comida Rápida & Hamburguesas');
  const [deliveryTime, setDeliveryTime] = useState(profile.restaurantDeliveryTime || '25 - 40 min');
  const [averagePrice, setAveragePrice] = useState(profile.restaurantAveragePrice || '$15.000 - $35.000 COP');
  const [bio, setBio] = useState(profile.bio || '');
  const [chefNote, setChefNote] = useState(profile.restaurantChefNote || '');
  
  // Modalities
  const [acceptsDelivery, setAcceptsDelivery] = useState(profile.restaurantAcceptsDelivery ?? true);
  const [acceptsTakeaway, setAcceptsTakeaway] = useState(profile.restaurantAcceptsTakeaway ?? true);
  const [acceptsTableOrders, setAcceptsTableOrders] = useState(profile.restaurantAcceptsTableOrders ?? true);
  const [tableCount, setTableCount] = useState<number | string>(profile.restaurantTableCount || 10);
  const [wifiPass, setWifiPass] = useState(profile.restaurantWifiPass || '');

  // Address and contacts
  const [restaurantAddress, setRestaurantAddress] = useState(profile.restaurantAddress || profile.address || profile.location || '');
  const [restaurantCity, setRestaurantCity] = useState(profile.restaurantCity || '');
  const [restaurantReference, setRestaurantReference] = useState(profile.restaurantReference || '');
  const [restaurantPhone, setRestaurantPhone] = useState(profile.restaurantPhone || profile.phone || '');
  const [ownerWhatsapp, setOwnerWhatsapp] = useState(profile.ownerWhatsapp || profile.whatsapp || profile.phone || '');
  const [customerServiceWhatsapp, setCustomerServiceWhatsapp] = useState(profile.customerServiceWhatsapp || '');

  // Social networks
  const [instagram, setInstagram] = useState(profile.instagram || '');
  const [facebook, setFacebook] = useState(profile.facebook || '');
  const [tiktok, setTiktok] = useState(profile.tiktok || '');
  const [youtube, setYoutube] = useState(profile.youtube || '');
  const [twitter, setTwitter] = useState(profile.twitter || '');

  // Keep address in sync when updated externally (e.g. from Map Picker Modal)
  useEffect(() => {
    const updatedAddr = profile.restaurantAddress || profile.address || profile.location;
    if (updatedAddr && updatedAddr !== restaurantAddress) {
      setRestaurantAddress(updatedAddr);
    }
  }, [profile.restaurantAddress, profile.address, profile.location]);

  // Schedule state: supports custom, independent open and close times for each day of the week
  const [scheduleEnabled, setScheduleEnabled] = useState(profile.scheduleEnabled ?? true);
  const [copyFeedbackDay, setCopyFeedbackDay] = useState<string | null>(null);

  const buildInitialWeeklySchedule = (): WeeklySchedule => {
    const base: WeeklySchedule = {};
    const legacyDays = profile.restaurantDaysOpen || ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
    const defOpen = profile.openTime || '11:00';
    const defClose = profile.closeTime || '23:00';

    DAYS_OF_WEEK.forEach(day => {
      if (profile.weeklySchedule && profile.weeklySchedule[day.id]) {
        base[day.id] = {
          isOpen: profile.weeklySchedule[day.id].isOpen ?? true,
          openTime: profile.weeklySchedule[day.id].openTime || defOpen,
          closeTime: profile.weeklySchedule[day.id].closeTime || defClose
        };
      } else {
        base[day.id] = {
          isOpen: legacyDays.includes(day.id),
          openTime: defOpen,
          closeTime: defClose
        };
      }
    });
    return base;
  };

  const [weeklySchedule, setWeeklySchedule] = useState<WeeklySchedule>(buildInitialWeeklySchedule);

  const toggleDayStatus = (dayId: string) => {
    setWeeklySchedule(prev => ({
      ...prev,
      [dayId]: {
        ...prev[dayId],
        isOpen: !prev[dayId]?.isOpen
      }
    }));
  };

  const updateDayTime = (dayId: string, field: 'openTime' | 'closeTime', val: string) => {
    setWeeklySchedule(prev => ({
      ...prev,
      [dayId]: {
        ...prev[dayId],
        [field]: val
      }
    }));
  };

  const copyDayScheduleToAll = (sourceDayId: string) => {
    const source = weeklySchedule[sourceDayId];
    if (!source) return;
    setWeeklySchedule(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(dayId => {
        next[dayId] = {
          ...next[dayId],
          openTime: source.openTime,
          closeTime: source.closeTime
        };
      });
      return next;
    });
    setCopyFeedbackDay(sourceDayId);
    setTimeout(() => setCopyFeedbackDay(null), 2500);
  };

  const applyQuickPreset = (preset: 'all_open' | 'weekdays_only' | 'weekend_only' | 'all_closed') => {
    setWeeklySchedule(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(dayId => {
        let isOpen = true;
        if (preset === 'all_closed') isOpen = false;
        if (preset === 'weekdays_only') {
          isOpen = dayId !== 'sabado' && dayId !== 'domingo';
        }
        if (preset === 'weekend_only') {
          isOpen = dayId === 'sabado' || dayId === 'domingo';
        }
        next[dayId] = {
          ...next[dayId],
          isOpen
        };
      });
      return next;
    });
  };

  // Payment methods
  const [selectedPayments, setSelectedPayments] = useState<string[]>(
    profile.restaurantPaymentMethods || [
      'Efectivo contra entrega / en mesa',
      'Nequi',
      'Daviplata',
      'Transferencia Bancolombia'
    ]
  );

  const togglePaymentMethod = (method: string) => {
    setSelectedPayments(prev => 
      prev.includes(method) ? prev.filter(m => m !== method) : [...prev, method]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUsernameError('');
    setIsSaving(true);
    try {
      const cleanUsername = usernameField.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
      if (cleanUsername.length < 3) {
        setUsernameError('El enlace / nombre de usuario debe tener al menos 3 caracteres.');
        setIsSaving(false);
        return;
      }

      if (cleanUsername !== profile.username) {
        setCheckingUsername(true);
        try {
          const available = await isUsernameAvailable(cleanUsername);
          if (!available) {
            setUsernameError('Este enlace de la tienda ya está ocupado por otro usuario.');
            setCheckingUsername(false);
            setIsSaving(false);
            return;
          }
        } catch (err) {
          console.error("Error verificando nombre de usuario:", err);
        } finally {
          setCheckingUsername(false);
        }
      }

      const updated: UserProfile = {
        ...profile,
        username: cleanUsername,
        displayName: restaurantName.trim() || profile.displayName,
        storeName: restaurantName.trim() || profile.storeName,
        bio: bio.trim(),
        coverTitle: coverTitle.trim(),
        currency: currency,
        restaurantCuisine: cuisine,
        restaurantDeliveryTime: deliveryTime,
        restaurantAveragePrice: averagePrice,
        restaurantChefNote: chefNote.trim(),
        restaurantAcceptsDelivery: acceptsDelivery,
        restaurantAcceptsTakeaway: acceptsTakeaway,
        restaurantAcceptsTableOrders: acceptsTableOrders,
        restaurantTableCount: Number(tableCount) || 0,
        restaurantWifiPass: wifiPass.trim(),
        restaurantAddress: restaurantAddress.trim(),
        address: restaurantAddress.trim() || profile.address,
        location: restaurantAddress.trim() || profile.location,
        restaurantCity: restaurantCity.trim(),
        restaurantReference: restaurantReference.trim(),
        restaurantPhone: restaurantPhone.trim() || ownerWhatsapp.trim(),
        phone: ownerWhatsapp.trim() || restaurantPhone.trim() || profile.phone,
        ownerWhatsapp: ownerWhatsapp.trim(),
        customerServiceWhatsapp: customerServiceWhatsapp.trim(),
        whatsapp: customerServiceWhatsapp.trim() || ownerWhatsapp.trim() || profile.whatsapp,
        instagram: instagram.trim(),
        facebook: facebook.trim(),
        tiktok: tiktok.trim(),
        youtube: youtube.trim(),
        twitter: twitter.trim(),
        scheduleEnabled,
        weeklySchedule,
        // Calculate legacy fields for compatibility
        restaurantDaysOpen: (Object.entries(weeklySchedule) as [string, DaySchedule][])
          .filter(([_, s]) => s.isOpen)
          .map(([dayId]) => dayId),
        openTime: (Object.values(weeklySchedule) as DaySchedule[]).find(s => s.isOpen)?.openTime || profile.openTime || '11:00',
        closeTime: (Object.values(weeklySchedule) as DaySchedule[]).find(s => s.isOpen)?.closeTime || profile.closeTime || '23:00',
        restaurantPaymentMethods: selectedPayments,
        layout: 'food' // Ensures layout is set to food/restaurant
      };

      await onSave(updated);
      setProfile(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err) {
      console.error("Error saving restaurant profile:", err);
      alert("Error al guardar los datos del restaurante.");
    } finally {
      setIsSaving(false);
    }
  };

  const isClosed = Boolean(profile.isClosed);

  return (
    <div className="space-y-6 w-full min-w-0 max-w-full">
      {/* HEADER WITH STATUS BADGE */}
      <div className="border-b border-gray-900 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4 w-full min-w-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 mb-1 flex-wrap">
            <h2 className="text-lg sm:text-xl font-black text-white flex items-center gap-2 truncate">
              <Utensils className="w-5 h-5 text-amber-400 shrink-0" />
              <span>Datos del Restaurante</span>
            </h2>
            <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
              <ChefHat className="w-3 h-3" />
              Gastronomía & Cocina
            </span>
          </div>
          <p className="text-xs text-gray-400 font-medium">
            Configura la información operativa de tu restaurante, especialidades gastronómicas, atención en mesa, domicilios y horarios de cocina.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Real-time kitchen toggle */}
          <button
            type="button"
            onClick={toggleStoreStatus}
            disabled={updatingStatus}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black border transition-all shadow-sm cursor-pointer ${
              !isClosed 
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/25' 
                : 'bg-rose-500/15 text-rose-400 border-rose-500/40 hover:bg-rose-500/25'
            }`}
            title="Cambiar estado de atención inmediata de cocina"
          >
            <span className={`w-2.5 h-2.5 rounded-full ${!isClosed ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`}></span>
            <span>{!isClosed ? 'Cocina Abierta' : 'Cocina Cerrada'}</span>
          </button>

          {/* View live store */}
          {profile.username && (
            <a
              href={`/${profile.username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3.5 py-2 bg-gray-900 hover:bg-gray-850 text-gray-300 border border-gray-800 rounded-xl text-xs font-bold transition shrink-0"
            >
              <span>Ver Menú Digital</span>
              <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
            </a>
          )}
        </div>
      </div>

      {saveSuccess && (
        <div className="bg-emerald-950/40 border border-emerald-500/50 p-3.5 rounded-2xl flex items-center justify-between gap-3 text-emerald-300 text-xs font-bold shadow-lg animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>¡Datos del restaurante actualizados y sincronizados con éxito!</span>
          </div>
          <span className="text-[10px] uppercase font-mono text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded">En vivo</span>
        </div>
      )}

      {/* FORM */}
      <form id="restaurant-profile-form" onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* LEFT COLUMN: IDENTITY & SERVICES */}
          <div className="lg:col-span-7 space-y-6">

            {/* CARD: DATOS DEL ESCAPARATE */}
            <div className="bg-gray-950 border border-gray-900 p-4 sm:p-6 rounded-2xl sm:rounded-3xl space-y-5 shadow-sm">
              <div className="border-b border-gray-900 pb-3 flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-indigo-400 block">
                  Datos del escaparate
                </span>
                <span className="text-[9px] text-gray-500 font-mono">Básico</span>
              </div>
              
              {/* Enlace / Nombre de Usuario */}
              <div className="w-full min-w-0">
                <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1">
                  Enlace / Nombre de Usuario de tu Tienda
                </label>
                <div className="flex rounded-xl overflow-hidden bg-gray-900 border border-gray-800 focus-within:border-emerald-500 w-full min-w-0">
                  <span className="bg-gray-950 text-gray-400 px-2.5 sm:px-3 py-2 flex items-center text-xs font-bold border-r border-gray-850 select-none shrink-0">
                    ryyco.com/
                  </span>
                  <input
                    type="text"
                    required
                    value={usernameField}
                    onChange={(e) => {
                      setUsernameField(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''));
                      setUsernameError('');
                    }}
                    className="flex-1 min-w-0 w-full h-11 bg-transparent px-3 text-xs font-semibold outline-none text-white focus:ring-0 placeholder:text-gray-700"
                    placeholder="mi-tienda"
                  />
                </div>
                {checkingUsername && <p className="text-[10px] text-indigo-400 mt-1 font-semibold">Verificando disponibilidad...</p>}
                {usernameError && <p className="text-[10px] text-red-400 mt-1 font-semibold">{usernameError}</p>}
                <p className="text-[9px] text-gray-500 mt-1 font-semibold">
                  Este enlace define la URL pública de tu negocio (ej. ryyco.com/compratuuco).
                </p>
              </div>

              {/* Nombre de la tienda */}
              <div className="w-full min-w-0">
                <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1">
                  Nombre de la tienda
                </label>
                <input
                  type="text"
                  required
                  value={restaurantName}
                  onChange={(e) => {
                    setRestaurantName(e.target.value);
                    setProfile(p => ({ ...p, displayName: e.target.value, storeName: e.target.value }));
                  }}
                  className="w-full h-11 bg-gray-900 border border-gray-800 focus:border-emerald-500 px-3.5 rounded-xl text-xs font-semibold outline-none text-white focus:ring-1 focus:ring-emerald-500/20"
                />
              </div>

              {/* Descripción corta o Slogan */}
              <div className="w-full min-w-0">
                <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1">
                  Descripción corta o Slogan comercial
                </label>
                <textarea
                  rows={2}
                  value={bio}
                  onChange={(e) => {
                    setBio(e.target.value);
                    setProfile(p => ({ ...p, bio: e.target.value }));
                  }}
                  placeholder="¡Hola! Te doy la bienvenida a mi restaurante."
                  className="w-full bg-gray-900 border border-gray-800 focus:border-emerald-500 p-3 sm:p-3.5 rounded-xl text-xs font-semibold outline-none text-white focus:ring-1 focus:ring-emerald-500/20 resize-none"
                />
              </div>

              {/* Título de Portada o Banner */}
              <div className="w-full min-w-0">
                <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1">
                  Título de Portada o Banner de tu Tienda
                </label>
                <input
                  type="text"
                  value={coverTitle}
                  onChange={(e) => {
                    setCoverTitle(e.target.value);
                    setProfile(p => ({ ...p, coverTitle: e.target.value }));
                  }}
                  placeholder="Ej: El Sabor en tus Manos, La Mejor Experiencia Culinaria, etc."
                  className="w-full h-11 bg-gray-900 border border-gray-800 focus:border-emerald-500 px-3.5 rounded-xl text-xs font-semibold outline-none text-white focus:ring-1 focus:ring-emerald-500/20"
                />
                <p className="text-[9px] text-gray-500 mt-1 font-semibold">
                  Si se deja vacío, se mostrará el título predeterminado de la plantilla de diseño seleccionada.
                </p>
              </div>

              {/* Símbolo de Moneda */}
              <div>
                <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider block mb-1">
                  Símbolo de Moneda
                </label>
                <div className="relative">
                  <select
                    value={currency}
                    onChange={(e) => {
                      setCurrency(e.target.value);
                      setProfile(p => ({ ...p, currency: e.target.value }));
                    }}
                    className="w-full h-11 bg-gray-900 border border-gray-800 focus:border-emerald-500 px-3.5 pr-8 rounded-xl text-xs font-extrabold outline-none text-emerald-400 focus:ring-1 focus:ring-emerald-500/20 cursor-pointer appearance-none transition-all"
                  >
                    <option value="$" className="bg-gray-900 text-white">$ - Pesos / Dólar ($)</option>
                    <option value="COP" className="bg-gray-900 text-white">COP - Peso Colombiano (COP)</option>
                    <option value="USD" className="bg-gray-900 text-white">USD - Dólar Estadounidense (USD $)</option>
                    <option value="€" className="bg-gray-900 text-white">€ - Euro (€)</option>
                    <option value="MXN" className="bg-gray-900 text-white">MXN - Peso Mexicano (MXN $)</option>
                    <option value="S/" className="bg-gray-900 text-white">S/ - Sol Peruano (S/)</option>
                    <option value="CLP" className="bg-gray-900 text-white">CLP - Peso Chileno (CLP $)</option>
                    <option value="ARS" className="bg-gray-900 text-white">ARS - Peso Argentino (ARS $)</option>
                    <option value="Bs." className="bg-gray-900 text-white">Bs. - Boliviano (Bs.)</option>
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-gray-400">
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
                      <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                    </svg>
                  </div>
                </div>
                <p className="text-[9px] text-gray-500 mt-1 font-semibold">
                  Selecciona la moneda principal que verán tus clientes.
                </p>
              </div>
            </div>

            {/* CARD 1: IDENTIDAD GASTRONÓMICA */}
            <div className="bg-gray-950 border border-gray-900 p-4 sm:p-6 rounded-2xl sm:rounded-3xl space-y-5 shadow-sm">
              <div className="flex items-center justify-between border-b border-gray-900 pb-3">
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <ChefHat className="w-3.5 h-3.5 text-amber-400" />
                  Especialidad Gastronómica & Operativa
                </span>
                <span className="text-[9px] text-gray-500 font-mono">Paso 1</span>
              </div>

              {/* Tipo de Cocina / Especialidad */}
              <div className="w-full min-w-0 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block">
                    Tipo de Cocina o Especialidad Gastronómica
                  </label>
                  <span className="text-[9px] text-amber-400 font-bold">Selecciona o personaliza</span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {CUISINE_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setCuisine(preset)}
                      className={`text-[10.5px] font-bold px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                        cuisine === preset
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm'
                          : 'bg-gray-900/80 text-gray-400 border-gray-800 hover:text-white hover:border-gray-700'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>

                <input
                  type="text"
                  value={cuisine}
                  onChange={(e) => setCuisine(e.target.value)}
                  placeholder="O escribe otra especialidad (ej: Carnes maduradas, Cevichería)"
                  className="w-full h-10 bg-gray-900 border border-gray-800 focus:border-amber-500 px-3 rounded-xl text-xs font-semibold outline-none text-white"
                />
              </div>

              {/* Tiempos de cocina & Rango de precio */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="w-full min-w-0 space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider flex items-center gap-1">
                    <Clock className="w-3 h-3 text-amber-400" />
                    Tiempo Promedio de Cocina
                  </label>
                  <select
                    value={deliveryTime}
                    onChange={(e) => setDeliveryTime(e.target.value)}
                    className="w-full h-10 bg-gray-900 border border-gray-800 focus:border-amber-500 px-3 rounded-xl text-xs font-bold text-amber-400 outline-none cursor-pointer"
                  >
                    {PREPARATION_TIME_PRESETS.map((t) => (
                      <option key={t} value={t} className="bg-gray-950 text-white">{t}</option>
                    ))}
                  </select>
                </div>

                <div className="w-full min-w-0 space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider flex items-center gap-1">
                    <span>💵</span>
                    Ticket Promedio por Comensal
                  </label>
                  <input
                    type="text"
                    value={averagePrice}
                    onChange={(e) => setAveragePrice(e.target.value)}
                    placeholder="Ej: $15.000 - $35.000 COP"
                    className="w-full h-10 bg-gray-900 border border-gray-800 focus:border-amber-500 px-3 rounded-xl text-xs font-semibold outline-none text-white"
                  />
                </div>
              </div>
            </div>

            {/* CARD 2: MODALIDADES DE SERVICIO */}
            <div className="bg-gray-950 border border-gray-900 p-4 sm:p-6 rounded-2xl sm:rounded-3xl space-y-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-gray-900 pb-3">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <Store className="w-3.5 h-3.5 text-emerald-400" />
                  Modalidades de Atención y Salón
                </span>
                <span className="text-[9px] text-gray-500 font-mono">Paso 2</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Domicilio */}
                <div 
                  onClick={() => setAcceptsDelivery(!acceptsDelivery)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer select-none ${
                    acceptsDelivery 
                      ? 'bg-emerald-950/20 border-emerald-500/40 text-white' 
                      : 'bg-gray-900/50 border-gray-850 text-gray-500'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <Bike className={`w-5 h-5 ${acceptsDelivery ? 'text-emerald-400' : 'text-gray-600'}`} />
                    <input 
                      type="checkbox" 
                      checked={acceptsDelivery} 
                      onChange={() => {}} 
                      className="accent-emerald-500 rounded" 
                    />
                  </div>
                  <h4 className="text-xs font-black">Domicilio</h4>
                  <p className="text-[10px] text-gray-400 mt-0.5">Envío a la dirección del cliente</p>
                </div>

                {/* Para Llevar */}
                <div 
                  onClick={() => setAcceptsTakeaway(!acceptsTakeaway)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer select-none ${
                    acceptsTakeaway 
                      ? 'bg-amber-950/20 border-amber-500/40 text-white' 
                      : 'bg-gray-900/50 border-gray-850 text-gray-500'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <ShoppingBag className={`w-5 h-5 ${acceptsTakeaway ? 'text-amber-400' : 'text-gray-600'}`} />
                    <input 
                      type="checkbox" 
                      checked={acceptsTakeaway} 
                      onChange={() => {}} 
                      className="accent-amber-500 rounded" 
                    />
                  </div>
                  <h4 className="text-xs font-black">Para Llevar</h4>
                  <p className="text-[10px] text-gray-400 mt-0.5">Retiro en barra o caja del local</p>
                </div>

                {/* Pedido en Mesa */}
                <div 
                  onClick={() => setAcceptsTableOrders(!acceptsTableOrders)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer select-none ${
                    acceptsTableOrders 
                      ? 'bg-indigo-950/20 border-indigo-500/40 text-white' 
                      : 'bg-gray-900/50 border-gray-850 text-gray-500'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <Utensils className={`w-5 h-5 ${acceptsTableOrders ? 'text-indigo-400' : 'text-gray-600'}`} />
                    <input 
                      type="checkbox" 
                      checked={acceptsTableOrders} 
                      onChange={() => {}} 
                      className="accent-indigo-500 rounded" 
                    />
                  </div>
                  <h4 className="text-xs font-black">En Mesa (Salón)</h4>
                  <p className="text-[10px] text-gray-400 mt-0.5">Comandas con número de mesa</p>
                </div>
              </div>

              {/* Table details & Wi-Fi */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1">
                    Número de Mesas en Salón
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="200"
                    value={tableCount}
                    onChange={(e) => setTableCount(e.target.value)}
                    placeholder="Ej: 12"
                    className="w-full h-10 bg-gray-900 border border-gray-800 focus:border-indigo-500 px-3 rounded-xl text-xs font-bold text-white outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider flex items-center gap-1.5 block mb-1">
                    <Wifi className="w-3 h-3 text-sky-400" />
                    Wi-Fi para Comensales (Opcional)
                  </label>
                  <input
                    type="text"
                    value={wifiPass}
                    onChange={(e) => setWifiPass(e.target.value)}
                    placeholder="Ej: Clave: RicoBurger2026"
                    className="w-full h-10 bg-gray-900 border border-gray-800 focus:border-sky-500 px-3 rounded-xl text-xs font-semibold text-white outline-none"
                  />
                </div>
              </div>

              {/* Chef note */}
              <div className="pt-2">
                <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1">
                  Nota o Aviso Especial de Cocina para Clientes
                </label>
                <input
                  type="text"
                  value={chefNote}
                  onChange={(e) => setChefNote(e.target.value)}
                  placeholder="Ej: Nuestros cortes se asan en el momento. Pedidos grandes toman 10 min adicionales."
                  className="w-full h-10 bg-gray-900 border border-gray-800 focus:border-amber-500 px-3 rounded-xl text-xs font-semibold text-white outline-none"
                />
              </div>
            </div>

            {/* CARD: REDES SOCIALES DE LA TIENDA */}
            <div className="bg-gray-950 border border-gray-900 p-4 sm:p-6 rounded-2xl sm:rounded-3xl space-y-4 shadow-sm">
              <div className="border-b border-gray-900 pb-3">
                <h3 className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                  REDES SOCIALES DE LA TIENDA
                </h3>
                <p className="text-[10px] text-gray-400 mt-1 font-medium">
                  Ingresa tu usuario o enlace de tus redes sociales para que tus clientes puedan seguirte y contactarte.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase text-gray-300 tracking-wider flex items-center gap-1.5 block mb-1">
                    <Instagram className="w-3.5 h-3.5 text-pink-500" /> INSTAGRAM
                  </label>
                  <input
                    type="text"
                    value={instagram}
                    placeholder="https://linnkpro.site/admin"
                    onChange={(e) => {
                      const val = e.target.value;
                      setInstagram(val);
                      setProfile(p => ({ ...p, instagram: val }));
                    }}
                    className="w-full h-11 bg-gray-900 border border-gray-800 focus:border-emerald-500 px-3.5 rounded-xl text-xs font-semibold outline-none text-white focus:ring-1 focus:ring-emerald-500/20"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-gray-300 tracking-wider flex items-center gap-1.5 block mb-1">
                    <Facebook className="w-3.5 h-3.5 text-blue-500" /> FACEBOOK
                  </label>
                  <input
                    type="text"
                    value={facebook}
                    placeholder="https://linnkpro.site/admin"
                    onChange={(e) => {
                      const val = e.target.value;
                      setFacebook(val);
                      setProfile(p => ({ ...p, facebook: val }));
                    }}
                    className="w-full h-11 bg-gray-900 border border-gray-800 focus:border-emerald-500 px-3.5 rounded-xl text-xs font-semibold outline-none text-white focus:ring-1 focus:ring-emerald-500/20"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-gray-300 tracking-wider flex items-center gap-1.5 block mb-1">
                    <Tiktok className="w-3.5 h-3.5 text-teal-400" /> TIKTOK
                  </label>
                  <input
                    type="text"
                    value={tiktok}
                    placeholder="Ej: @mitienda o link"
                    onChange={(e) => {
                      const val = e.target.value;
                      setTiktok(val);
                      setProfile(p => ({ ...p, tiktok: val }));
                    }}
                    className="w-full h-11 bg-gray-900 border border-gray-800 focus:border-emerald-500 px-3.5 rounded-xl text-xs font-semibold outline-none text-white focus:ring-1 focus:ring-emerald-500/20"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-gray-300 tracking-wider flex items-center gap-1.5 block mb-1">
                    <Youtube className="w-3.5 h-3.5 text-red-500" /> YOUTUBE
                  </label>
                  <input
                    type="text"
                    value={youtube}
                    placeholder="Ej: canal o link completo"
                    onChange={(e) => {
                      const val = e.target.value;
                      setYoutube(val);
                      setProfile(p => ({ ...p, youtube: val }));
                    }}
                    className="w-full h-11 bg-gray-900 border border-gray-800 focus:border-emerald-500 px-3.5 rounded-xl text-xs font-semibold outline-none text-white focus:ring-1 focus:ring-emerald-500/20"
                  />
                </div>

                <div className="sm:col-span-2 sm:max-w-[calc(50%-0.5rem)]">
                  <label className="text-[10px] font-black uppercase text-gray-300 tracking-wider flex items-center gap-1.5 block mb-1">
                    <Twitter className="w-3.5 h-3.5 text-gray-400" /> TWITTER / X
                  </label>
                  <input
                    type="text"
                    value={twitter}
                    placeholder="Ej: mitienda"
                    onChange={(e) => {
                      const val = e.target.value;
                      setTwitter(val);
                      setProfile(p => ({ ...p, twitter: val }));
                    }}
                    className="w-full h-11 bg-gray-900 border border-gray-800 focus:border-emerald-500 px-3.5 rounded-xl text-xs font-semibold outline-none text-white focus:ring-1 focus:ring-emerald-500/20"
                  />
                </div>
              </div>
            </div>

          </div>

          {/* RIGHT COLUMN: LOCATION, SCHEDULE & PAYMENTS */}
          <div className="lg:col-span-5 space-y-6">

            {/* CARD 3: UBICACIÓN Y DESPACHO */}
            <div className="bg-gray-950 border border-gray-900 p-4 sm:p-6 rounded-2xl sm:rounded-3xl space-y-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-gray-900 pb-3">
                <span className="text-[10px] font-black uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-rose-400" />
                  Ubicación del Restaurante
                </span>
                <span className="text-[9px] text-gray-500 font-mono">Paso 3</span>
              </div>

              <div className="space-y-3">
                {/* DIRECCIÓN DEL NEGOCIO / PUNTO DE RECOGIDA */}
                <div className="w-full min-w-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[10px] font-black uppercase text-emerald-400 tracking-wider flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Dirección del Negocio / Punto de Recogida</span>
                    </label>
                    <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 uppercase tracking-wider">
                      Google Maps
                    </span>
                  </div>
                  <div className="flex gap-2 w-full min-w-0">
                    <input
                      type="text"
                      required
                      value={restaurantAddress}
                      onChange={(e) => {
                        const val = e.target.value;
                        setRestaurantAddress(val);
                        setProfile(p => ({ ...p, address: val, location: val, restaurantAddress: val }));
                      }}
                      placeholder="Ej: Carrera 6 # 14-25, Ipiales"
                      className="flex-1 min-w-0 w-full h-11 bg-gray-900 border border-gray-800 focus:border-emerald-500 px-3 sm:px-3.5 rounded-xl text-xs font-bold outline-none text-white focus:ring-1 focus:ring-emerald-500/20"
                    />
                    <button
                      type="button"
                      onClick={() => setIsMapPickerOpen(true)}
                      className="h-11 px-3 sm:px-4 bg-gradient-to-r from-emerald-500/20 via-teal-500/20 to-blue-500/20 hover:from-emerald-500/30 hover:to-blue-500/30 border border-emerald-500/40 text-emerald-300 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all whitespace-nowrap active:scale-[0.98] shrink-0 cursor-pointer shadow-sm"
                      title="Abrir selector interactivo de Google Maps"
                    >
                      <MapPin className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Fijar en Google Maps</span>
                    </button>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mt-1.5 text-[9px] text-gray-500 font-semibold">
                    <span>Fija el marcador en Google Maps para que los domiciliarios y clientes encuentren la ubicación exacta.</span>
                    {(profile.mapUrl || (profile.lat && profile.lng) || restaurantAddress) && (
                      <a
                        href={profile.mapUrl || (profile.lat && profile.lng ? `https://www.google.com/maps/search/?api=1&query=${profile.lat},${profile.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(restaurantAddress)}`)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1 font-bold text-[10px] shrink-0"
                      >
                        <ExternalLink className="w-3 h-3" /> Ver en Google Maps
                      </a>
                    )}
                  </div>
                  {profile.lat && profile.lng && (
                    <div className="mt-1 flex items-center gap-1.5 text-[9px] text-emerald-400/90 font-mono">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      <span>Coordenadas fijadas: {profile.lat.toFixed(5)}, {profile.lng.toFixed(5)}</span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1">
                      Ciudad / Municipio
                    </label>
                    <input
                      type="text"
                      value={restaurantCity}
                      onChange={(e) => setRestaurantCity(e.target.value)}
                      placeholder="Ej: Pasto, Ipiales"
                      className="w-full h-10 bg-gray-900 border border-gray-800 focus:border-rose-500 px-3 rounded-xl text-xs font-semibold text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1">
                      Teléfono del Local
                    </label>
                    <input
                      type="tel"
                      value={restaurantPhone}
                      onChange={(e) => setRestaurantPhone(e.target.value)}
                      placeholder="Ej: 3106502043"
                      className="w-full h-10 bg-gray-900 border border-gray-800 focus:border-rose-500 px-3 rounded-xl text-xs font-semibold text-white outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1">
                    Punto de Referencia para Domiciliarios
                  </label>
                  <input
                    type="text"
                    value={restaurantReference}
                    onChange={(e) => setRestaurantReference(e.target.value)}
                    placeholder="Ej: Frente al parque infantil, local esquinero color verde"
                    className="w-full h-10 bg-gray-900 border border-gray-800 focus:border-rose-500 px-3 rounded-xl text-xs font-semibold text-white outline-none"
                  />
                </div>
              </div>
            </div>

            {/* CARD: LÍNEAS DE WHATSAPP DEL RESTAURANTE */}
            <div className="bg-gray-950 border border-gray-900 p-4 sm:p-6 rounded-2xl sm:rounded-3xl space-y-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-gray-900 pb-3">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                  Líneas de WhatsApp del Restaurante
                </span>
                <span className="text-[9px] text-gray-500 font-mono">Seguridad & Pedidos</span>
              </div>

              {/* 1. WHATSAPP PROPIETARIO / ADMIN - OBLIGATORIO */}
              <div className="p-3.5 sm:p-4 bg-emerald-950/25 border-2 border-emerald-500/50 rounded-2xl space-y-2.5 shadow-lg shadow-emerald-950/30 w-full min-w-0">
                <div className="flex items-center justify-between flex-wrap gap-1.5">
                  <label className="text-[11px] font-black uppercase text-emerald-400 tracking-wider flex items-center gap-1.5 min-w-0">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="truncate">WHATSAPP PROPIETARIO / ADMIN</span>
                  </label>
                  <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 text-[9px] font-black uppercase tracking-wider rounded-md border border-emerald-500/30 shrink-0">
                    ★ OBLIGATORIO
                  </span>
                </div>

                <div className="flex rounded-xl overflow-hidden bg-gray-900 border border-gray-800 focus-within:border-emerald-400 focus-within:ring-1 focus-within:ring-emerald-400/30 w-full min-w-0">
                  <div className="bg-gray-950 text-emerald-400 px-2.5 sm:px-3 py-2.5 flex items-center gap-1 text-xs font-black border-r border-gray-850 select-none shrink-0">
                    <span>co +57</span>
                  </div>
                  <input
                    type="tel"
                    required
                    value={ownerWhatsapp}
                    placeholder="3219730865"
                    onChange={(e) => {
                      let val = e.target.value.replace(/\D/g, '');
                      if (val.startsWith('57') && val.length >= 12) val = val.slice(2);
                      val = val.slice(0, 10);
                      setOwnerWhatsapp(val);
                    }}
                    className="flex-1 min-w-0 w-full h-11 bg-transparent px-2.5 sm:px-3 text-xs font-bold outline-none text-white focus:ring-0 placeholder:text-gray-600"
                  />
                  {ownerWhatsapp && ownerWhatsapp.length >= 10 && (
                    <a
                      href={`https://wa.me/57${ownerWhatsapp.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 sm:px-3.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 flex items-center gap-1 text-[11px] font-bold border-l border-emerald-500/30 transition-all whitespace-nowrap shrink-0"
                      title="Verificar chat de WhatsApp del propietario"
                    >
                      <span className="hidden sm:inline">Probar Chat</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>

                <p className="text-[10px] text-gray-400 leading-relaxed font-medium">
                  Número privado del dueño o administrador. Utilizado para la seguridad de tu cuenta, comprobantes de pago de suscripción y soporte directo de la plataforma.
                </p>
              </div>

              {/* 2. WHATSAPP ATENCIÓN / PEDIDOS - OPCIONAL */}
              <div className="p-3.5 sm:p-4 bg-slate-900/50 border border-slate-700/60 rounded-2xl space-y-2.5 w-full min-w-0">
                <div className="flex items-center justify-between flex-wrap gap-1.5">
                  <label className="text-[11px] font-black uppercase text-gray-300 tracking-wider flex items-center gap-1.5 min-w-0">
                    <Headphones className="w-4 h-4 text-sky-400 shrink-0" />
                    <span className="truncate">WHATSAPP ATENCIÓN / PEDIDOS</span>
                  </label>
                  <span className="px-2 py-0.5 bg-slate-800 text-gray-400 text-[9px] font-black uppercase tracking-wider rounded-md border border-slate-700 shrink-0">
                    💬 OPCIONAL
                  </span>
                </div>

                <div className="flex rounded-xl overflow-hidden bg-gray-900 border border-gray-800 focus-within:border-sky-400 focus-within:ring-1 focus-within:ring-sky-400/30 w-full min-w-0">
                  <div className="bg-gray-950 text-gray-400 px-2.5 sm:px-3 py-2.5 flex items-center gap-1 text-xs font-black border-r border-gray-850 select-none shrink-0">
                    <span>co +57</span>
                  </div>
                  <input
                    type="tel"
                    value={customerServiceWhatsapp}
                    placeholder="Ej: 3101234567 (Opcional)"
                    onChange={(e) => {
                      let val = e.target.value.replace(/\D/g, '');
                      if (val.startsWith('57') && val.length >= 12) val = val.slice(2);
                      val = val.slice(0, 10);
                      setCustomerServiceWhatsapp(val);
                    }}
                    className="flex-1 min-w-0 w-full h-11 bg-transparent px-2.5 sm:px-3 text-xs font-bold outline-none text-white focus:ring-0 placeholder:text-gray-600"
                  />
                  {customerServiceWhatsapp && customerServiceWhatsapp.length >= 10 && (
                    <a
                      href={`https://wa.me/57${customerServiceWhatsapp.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 sm:px-3.5 bg-sky-500/15 hover:bg-sky-500/25 text-sky-400 flex items-center gap-1 text-[11px] font-bold border-l border-sky-500/30 transition-all whitespace-nowrap shrink-0"
                      title="Verificar chat de atención al cliente"
                    >
                      <span className="hidden sm:inline">Probar Chat</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>

                <p className="text-[10px] text-gray-400 leading-relaxed font-medium">
                  Línea pública donde tus clientes enviarán sus <strong className="text-gray-300">pedidos y consultas</strong> desde la tienda online. Si lo dejas vacío, se usará automáticamente el WhatsApp del propietario.
                </p>
              </div>
            </div>

            {/* CARD 4: HORARIOS DE COCINA Y SERVICIO (INDEPENDIENTES POR DÍA) */}
            <div className="bg-gray-950 border border-gray-900 p-4 sm:p-6 rounded-2xl sm:rounded-3xl space-y-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-gray-900 pb-3">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-indigo-400" />
                    Horario de Cocina y Servicio
                  </span>
                  <p className="text-[10px] text-gray-500 font-medium mt-0.5">
                    Configura aperturas y cierres independientes para cada día
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={scheduleEnabled}
                    onChange={(e) => setScheduleEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-8 h-4 bg-gray-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-indigo-500"></div>
                </label>
              </div>

              {scheduleEnabled ? (
                <div className="space-y-3.5 animate-fade-in">
                  {/* Atajos Rápidos */}
                  <div className="flex flex-wrap items-center justify-between gap-1.5 bg-gray-900/60 p-2 rounded-xl border border-gray-850">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider pl-1">
                      Atajos Rápidos:
                    </span>
                    <div className="flex flex-wrap items-center gap-1">
                      <button
                        type="button"
                        onClick={() => applyQuickPreset('all_open')}
                        className="text-[10px] font-bold px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg border border-gray-700 transition cursor-pointer"
                      >
                        Todos Abiertos
                      </button>
                      <button
                        type="button"
                        onClick={() => applyQuickPreset('weekdays_only')}
                        className="text-[10px] font-bold px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg border border-gray-700 transition cursor-pointer"
                      >
                        Lun a Vie
                      </button>
                      <button
                        type="button"
                        onClick={() => applyQuickPreset('weekend_only')}
                        className="text-[10px] font-bold px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg border border-gray-700 transition cursor-pointer"
                      >
                        Solo Fin de Semana
                      </button>
                    </div>
                  </div>

                  {/* Lista de días con horarios independientes */}
                  <div className="space-y-2">
                    {DAYS_OF_WEEK.map((d) => {
                      const daySched = weeklySchedule[d.id] || { isOpen: true, openTime: '11:00', closeTime: '23:00' };
                      const isOpen = Boolean(daySched.isOpen);
                      const isCopied = copyFeedbackDay === d.id;

                      return (
                        <div
                          key={d.id}
                          className={`p-3 rounded-xl border transition-all ${
                            isOpen 
                              ? 'bg-gray-900/70 border-gray-800 shadow-sm' 
                              : 'bg-gray-950/60 border-gray-900 opacity-60'
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                            {/* Día y botón Abierto/Cerrado */}
                            <div className="flex items-center justify-between sm:justify-start gap-2.5 min-w-[140px]">
                              <span className="text-xs font-bold text-white tracking-wide">
                                {d.label}
                              </span>
                              <button
                                type="button"
                                onClick={() => toggleDayStatus(d.id)}
                                className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-lg border transition cursor-pointer flex items-center gap-1.5 ${
                                  isOpen
                                    ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-400 hover:bg-emerald-500/25'
                                    : 'bg-gray-850 border-gray-750 text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                                }`}
                              >
                                {isOpen ? (
                                  <>
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                    <span>Abierto</span>
                                  </>
                                ) : (
                                  <>
                                    <span className="w-1.5 h-1.5 rounded-full bg-gray-500"></span>
                                    <span>Cerrado</span>
                                  </>
                                )}
                              </button>
                            </div>

                            {/* Horarios del día o mensaje de descanso */}
                            {isOpen ? (
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="flex items-center gap-1.5 bg-gray-950 px-2 py-1 rounded-lg border border-gray-800">
                                  <span className="text-[9px] font-black uppercase text-gray-500">Abre:</span>
                                  <input
                                    type="time"
                                    value={daySched.openTime || '11:00'}
                                    onChange={(e) => updateDayTime(d.id, 'openTime', e.target.value)}
                                    className="bg-transparent text-xs font-bold text-white font-mono focus:outline-none cursor-pointer"
                                  />
                                </div>
                                <span className="text-gray-600 text-xs font-bold">-</span>
                                <div className="flex items-center gap-1.5 bg-gray-950 px-2 py-1 rounded-lg border border-gray-800">
                                  <span className="text-[9px] font-black uppercase text-gray-500">Cierra:</span>
                                  <input
                                    type="time"
                                    value={daySched.closeTime || '23:00'}
                                    onChange={(e) => updateDayTime(d.id, 'closeTime', e.target.value)}
                                    className="bg-transparent text-xs font-bold text-white font-mono focus:outline-none cursor-pointer"
                                  />
                                </div>

                                <button
                                  type="button"
                                  onClick={() => copyDayScheduleToAll(d.id)}
                                  title="Copiar este horario de apertura y cierre a todos los días de la semana"
                                  className={`text-[9.5px] font-bold px-2 py-1 rounded-lg border transition cursor-pointer flex items-center gap-1 ${
                                    isCopied
                                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                                      : 'bg-gray-800/80 hover:bg-gray-750 text-gray-400 hover:text-gray-200 border-gray-700'
                                  }`}
                                >
                                  {isCopied ? (
                                    <>
                                      <Check className="w-3 h-3 text-emerald-400" />
                                      <span>¡Copiado a la semana!</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3 h-3" />
                                      <span className="hidden sm:inline">Copiar a todos</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
                                <span className="text-[10px] text-gray-500 italic">
                                  Sin servicio / Cocina cerrada
                                </span>
                                <button
                                  type="button"
                                  onClick={() => toggleDayStatus(d.id)}
                                  className="text-[9.5px] font-bold text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
                                >
                                  Habilitar horario
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Resumen al pie */}
                  <div className="flex items-center justify-between text-[10px] text-gray-400 pt-1 px-1">
                    <span>
                      Días activos con atención:{' '}
                      <strong className="text-white font-bold">
                        {(Object.values(weeklySchedule) as DaySchedule[]).filter((s) => s.isOpen).length} de 7 días
                      </strong>
                    </span>
                    <span className="text-gray-500">
                      Zona horaria: Colombia (UTC-5)
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-gray-900/40 rounded-xl border border-gray-900 text-center">
                  <p className="text-[11px] text-gray-400">
                    El control automático por horario está <strong className="text-gray-300">desactivado</strong>.
                    Tu tienda permanecerá abierta continuamente a menos que actives el cierre manual con el interruptor principal.
                  </p>
                </div>
              )}
            </div>

            {/* CARD 5: MEDIOS DE PAGO */}
            <div className="bg-gray-950 border border-gray-900 p-4 sm:p-6 rounded-2xl sm:rounded-3xl space-y-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-gray-900 pb-3">
                <span className="text-[10px] font-black uppercase tracking-wider text-teal-400 flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-teal-400" />
                  Medios de Pago en Restaurante
                </span>
                <span className="text-[9px] text-gray-500 font-mono">Paso 5</span>
              </div>

              <div className="space-y-1.5">
                {PAYMENT_METHODS_OPTIONS.map((method) => {
                  const checked = selectedPayments.includes(method);
                  return (
                    <label
                      key={method}
                      onClick={() => togglePaymentMethod(method)}
                      className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-xs font-semibold cursor-pointer transition select-none ${
                        checked 
                          ? 'bg-teal-950/20 border-teal-500/40 text-teal-200' 
                          : 'bg-gray-900/40 border-gray-850 text-gray-400 hover:text-gray-300'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded flex items-center justify-center border ${
                        checked ? 'bg-teal-500 border-teal-400 text-black' : 'border-gray-700 bg-gray-900'
                      }`}>
                        {checked && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                      <span>{method}</span>
                    </label>
                  );
                })}
              </div>
            </div>

          </div>
        </div>

        {/* BOTTOM SAVE BUTTON */}
        <div className="bg-gray-950 border border-gray-900 p-4 rounded-2xl sm:rounded-3xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xl">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Los datos guardados se aplicarán instantáneamente al menú digital y comensales.</span>
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 hover:from-amber-300 hover:to-amber-500 text-black font-black text-xs uppercase tracking-wider rounded-xl shadow-lg transition flex items-center justify-center gap-2 active:scale-95 cursor-pointer disabled:opacity-50"
          >
            {isSaving ? (
              <div className="w-4 h-4 border-2 border-black border-t-transparent animate-spin rounded-full" />
            ) : (
              <Save className="w-4 h-4 stroke-[2.5]" />
            )}
            <span>Guardar Datos del Restaurante</span>
          </button>
        </div>
      </form>
    </div>
  );
};

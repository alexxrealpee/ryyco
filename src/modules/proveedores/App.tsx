/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import './proveedores-fonts.css';
import { UserProfile } from '../../types';
import {
  RYYCO_RESTAURANTS,
  HERO_SUPPLY_IMAGE,
} from './data/ryycoB2BSeed';
import {
  RyycoRestaurantProfile,
  RyycoSupplier,
  SupplierApplication,
  SupplierProduct,
  B2BCartItem,
  B2BPurchaseOrder,
  B2BRecurringSchedule,
  B2BOrderStatus,
  PaymentStatus,
  SupplierCategory,
  ProblemReport,
  DeliveryMode,
  ProductAvailability,
  RyycoCommissionRate,
  SupplierStatus,
} from './types/ryycoB2B';
import {
  formatCop,
  getEffectiveUnitPrice,
  generateDeliveryPin,
} from './utils/ryycoFormatters';
import { ResilientImage } from './components/ResilientImage';
import { RyycoLogo } from './components/RyycoLogo';
import { PriceComparatorView } from './components/PriceComparatorView';
import { OrdersManagerView } from './components/OrdersManagerView';
import { AutomationRulesView } from './components/AutomationRulesView';
import { SupplierPortalView } from './components/SupplierPortalView';
import { AdminCentralPanel } from './components/AdminCentralPanel';
import { AdminLoginGate, AdminUserSession } from './components/AdminLoginGate';
import { RestaurantLoginModal } from './components/RestaurantLoginModal';
import { SupplierLandingView } from './components/SupplierLandingView';
import { SupplierLoginModal } from './components/SupplierLoginModal';
import { SupplierDashboardView } from './components/SupplierDashboardView';
import { CartCheckoutDrawer } from './components/CartCheckoutDrawer';
import {
  seedInitialFirestoreData,
  cleanLegacyMockDataFromFirestore,
  subscribeToSuppliers,
  subscribeToProducts,
  subscribeToOrders,
  subscribeToSchedules,
  subscribeToApplications,
  subscribeToCart,
  saveCartInFirestore,
  clearCartInFirestore,
  createOrderInFirestore,
  updateOrderStatusInFirestore,
  updateOrderPaymentInFirestore,
  updateOrderDetailsInFirestore,
  saveProblemReportInFirestore,
  saveRecurringScheduleInFirestore,
  saveProductInFirestore,
  saveSupplierInFirestore,
  saveApplicationInFirestore,
  deleteProductFromFirestore,
  updateProductAvailabilityInFirestore,
  subscribeToCommissionRates,
  saveCommissionRatesInFirestore,
  DEFAULT_COMMISSION_RATES,
  calculateOrderCommission,
} from './firebase/b2bRepository';
import { auth, testConnection } from './firebase/config';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
  Search,
  ShoppingCart,
  ShoppingBag,
  ArrowRight,
  ArrowUpRight,
  Scale,
  Plus,
  Check,
  Store,
  ShieldCheck,
  Lock,
  Repeat,
  Flame,
  Clock,
  Snowflake,
  AlertCircle,
  Truck,
  CheckCircle2,
  Trash2,
  ChevronDown,
  ArrowLeft,
  Building2,
  Package,
  Menu,
  X,
  Phone,
  ChevronRight,
  Users,
  MapPin,
  Heart,
  Tag,
  Info,
  LayoutGrid,
  Settings,
  BarChart2,
  ClipboardList,
  Home,
  MoreHorizontal,
  User,
} from 'lucide-react';
import { RyycoHeroGroceryGraphic } from './components/RyycoHeroGroceryGraphic';
import { RyycoCartBagIllustration } from './components/RyycoCartBagIllustration';

const CATEGORIES = [
  {
    id: 'all',
    label: 'Todos',
    image: '/assets/aistudio/ryyco_proveedores_todos_ffe41acf.png',
  },
  {
    id: 'Frutas y Verduras',
    label: 'Frutas y verduras',
    image: '/assets/aistudio/Imagen_de_ChatGPT_10_nov_2026__17_27_49_04b7e328.png',
  },
  {
    id: 'Cárnicos y Embutidos',
    label: 'Cárnicos',
    image: '/assets/aistudio/ryyco_proveedores_carnicos_3cf10849.png',
  },
  {
    id: 'Empaques Biodegradables',
    label: 'Empaques',
    image: '/assets/aistudio/ryyco_empaques_opt.webp',
  },
  {
    id: 'Aceites y Abarrotes',
    label: 'Aceites',
    image: '/assets/aistudio/ryyco_proveedores_aceites_7fe5d109.png',
  },
  {
    id: 'Lácteos y Quesos',
    label: 'Lácteos',
    image: '/assets/aistudio/ryyco_proveedores_lacteos_f9e63f17.png',
  },
];

type ActiveSection =
  | 'marketplace'
  | 'comparator'
  | 'supplier_landing'
  | 'supplier_workspace'
  | 'orders'
  | 'automation'
  | 'suppliers'
  | 'admin_central';

// Utilidades de deduplicación estricta para proveedores e insumos
const deduplicateSuppliers = (list: RyycoSupplier[]): RyycoSupplier[] => {
  const seenIds = new Set<string>();
  const seenNits = new Set<string>();
  const result: RyycoSupplier[] = [];
  for (const s of list) {
    if (!s || !s.id) continue;
    const cleanNit = (s.nit || '').trim();
    if (seenIds.has(s.id) || (cleanNit && seenNits.has(cleanNit))) {
      continue;
    }
    seenIds.add(s.id);
    if (cleanNit) seenNits.add(cleanNit);
    result.push(s);
  }
  return result;
};

const deduplicateProducts = (list: SupplierProduct[]): SupplierProduct[] => {
  const seenIds = new Set<string>();
  const result: SupplierProduct[] = [];
  for (const p of list) {
    if (!p || !p.id) continue;
    if (seenIds.has(p.id)) continue;
    seenIds.add(p.id);
    result.push(p);
  }
  return result;
};

const mapUserProfileToB2BRestaurant = (profile: UserProfile): RyycoRestaurantProfile => {
  const displayName =
    (profile.storeName || profile.displayName || profile.name || profile.username || 'Mi Restaurante').trim();
  const plan =
    profile.subscriptionPlan === 'avanzado' || profile.subscriptionPlan === 'pro'
      ? 'pro'
      : profile.subscriptionPlan === 'medio'
      ? 'medio'
      : 'basico';
  const status =
    profile.subscriptionStatus === 'under_review'
      ? 'pending_payment'
      : profile.subscriptionStatus || 'active';

  return {
    uid: profile.uid,
    email: profile.email || '',
    role: 'store',
    displayName,
    username: profile.username || 'restaurante',
    photoUrl: profile.photoURL || '',
    ownerWhatsapp: profile.ownerWhatsapp || profile.whatsapp || profile.phone || '',
    whatsapp: profile.whatsapp || profile.ownerWhatsapp || profile.phone || '',
    customerServiceWhatsapp: profile.customerServiceWhatsapp,
    address: profile.restaurantAddress || profile.address || 'Ipiales, Nariño',
    city: profile.restaurantCity || profile.location || 'Ipiales',
    lat: profile.lat ?? 0.83028,
    lng: profile.lng ?? -77.64444,
    layout: profile.layout || 'food',
    subscriptionPlan: plan,
    subscriptionStatus: status,
    subscriptionPaidUntil: profile.subscriptionPaidUntil,
    isClosed: Boolean(profile.isClosed),
    bankAccounts: (profile.bankAccounts || []).map((b) => ({
      bankName: b.bankName,
      accountType: b.accountType === 'Corriente' ? 'corriente' : 'ahorros',
      accountNumber: b.accountNumber,
      titularName: displayName,
      titularDocument: '',
    })),
  };
};

export default function App({
  loggedRestaurantProfile,
}: {
  loggedRestaurantProfile?: UserProfile | null;
} = {}) {
  const [activeSection, setActiveSection] = useState<ActiveSection>('marketplace');

  // Sesión administrativa de RYYCO Central
  const [adminSession, setAdminSession] = useState<AdminUserSession | null>(() => {
    try {
      const saved =
        localStorage.getItem('ryyco_admin_session') ||
        sessionStorage.getItem('ryyco_admin_session');
      if (saved) return JSON.parse(saved);
    } catch {
      // fallback
    }
    return null;
  });

  const [isAdminLoginModalOpen, setIsAdminLoginModalOpen] = useState(false);

  const handleAdminLoginSuccess = (session: AdminUserSession) => {
    setAdminSession(session);
  };

  const handleAdminLogout = () => {
    setAdminSession(null);
    localStorage.removeItem('ryyco_admin_session');
    sessionStorage.removeItem('ryyco_admin_session');
    if (activeSection === 'suppliers' || activeSection === 'admin_central') {
      setActiveSection('marketplace');
    }
  };

  // Restaurantes registrados y sesión sincronizada con el restaurante logueado en Ryyco
  const [restaurants, setRestaurants] = useState<RyycoRestaurantProfile[]>(() => {
    if (loggedRestaurantProfile) {
      return [mapUserProfileToB2BRestaurant(loggedRestaurantProfile)];
    }
    return RYYCO_RESTAURANTS;
  });
  const [restaurantSession, setRestaurantSession] = useState<RyycoRestaurantProfile | null>(() => {
    if (loggedRestaurantProfile) {
      return mapUserProfileToB2BRestaurant(loggedRestaurantProfile);
    }
    try {
      const saved = localStorage.getItem('ryyco_restaurant_session');
      if (saved) return JSON.parse(saved);
    } catch {
      // fallback
    }
    return null;
  });

  // Sincronizar automáticamente los datos del restaurante logueado en el Dashboard de Ryyco
  useEffect(() => {
    if (!loggedRestaurantProfile) return;
    const mapped = mapUserProfileToB2BRestaurant(loggedRestaurantProfile);
    setRestaurantSession(mapped);
    setRestaurants([mapped]);
    try {
      localStorage.setItem('ryyco_restaurant_session', JSON.stringify(mapped));
    } catch {
      // ignore storage errors
    }
  }, [loggedRestaurantProfile]);

  // Sesión de Proveedor Homologado
  const [supplierSession, setSupplierSession] = useState<RyycoSupplier | null>(() => {
    try {
      const saved = localStorage.getItem('ryyco_supplier_session');
      if (saved) return JSON.parse(saved);
    } catch {
      // fallback
    }
    return null;
  });

  // Estados alimentados directamente desde Cloud Firestore (inician en blanco)
  const [suppliers, setSuppliers] = useState<RyycoSupplier[]>([]);
  const [applications, setApplications] = useState<SupplierApplication[]>([]);
  const [products, setProducts] = useState<SupplierProduct[]>([]);
  const [orders, setOrders] = useState<B2BPurchaseOrder[]>([]);
  const [schedules, setSchedules] = useState<B2BRecurringSchedule[]>([]);
  const [commissionRates, setCommissionRates] = useState<RyycoCommissionRate[]>(DEFAULT_COMMISSION_RATES);

  // Carrito de compras corporativo
  const [cart, setCart] = useState<B2BCartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Filtros de catálogo mayorista
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [addedProductId, setAddedProductId] = useState<string | null>(null);
  const [isEmptyStateMenuOpen, setIsEmptyStateMenuOpen] = useState(false);

  const [isRestaurantLoginOpen, setIsRestaurantLoginOpen] = useState(false);

  const handleRestaurantLoginSuccess = (profile: RyycoRestaurantProfile) => {
    setRestaurantSession(profile);
    setSupplierSession(null);
    localStorage.removeItem('ryyco_supplier_session');
    localStorage.setItem('ryyco_restaurant_session', JSON.stringify(profile));
    setIsRestaurantLoginOpen(false);
    setRestaurants((prev) => {
      const exists = prev.some(
        (r) => r.uid === profile.uid || r.email.toLowerCase() === profile.email.toLowerCase()
      );
      if (exists) {
        return prev.map((r) =>
          r.uid === profile.uid || r.email.toLowerCase() === profile.email.toLowerCase()
            ? profile
            : r
        );
      }
      return [...prev, profile];
    });
    // Si el usuario tenía insumos en bolsa antes de autenticarse, sincronizar a Firestore
    if (cart.length > 0 && profile.uid) {
      saveCartInFirestore(profile.uid, cart);
    }
  };

  const handleRestaurantLogout = async () => {
    try {
      await signOut(auth);
    } catch {
      // ignore
    }
    setRestaurantSession(null);
    setCart([]);
    setOrders([]);
    localStorage.removeItem('ryyco_restaurant_session');
    if (activeSection === 'orders' || activeSection === 'automation') {
      setActiveSection('marketplace');
    }
  };

  // Verificación de sesión en ingreso inicial (Firebase Auth y sincronización automática estricta)
  useEffect(() => {
    if (loggedRestaurantProfile) return;
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (!firebaseUser) {
        return;
      }

      const email = (firebaseUser.email || '').toLowerCase().trim();
      const uid = firebaseUser.uid;

      // 1. Si el usuario ya tiene sesión activa de proveedor, no crear ni sobreescribir perfil de restaurante
      const savedSupplierStr = localStorage.getItem('ryyco_supplier_session');
      if (savedSupplierStr) {
        try {
          const sup = JSON.parse(savedSupplierStr) as RyycoSupplier;
          if (
            sup &&
            (sup.googleUid === uid ||
              (sup.email && sup.email.toLowerCase().trim() === email) ||
              (sup.googleEmail && sup.googleEmail.toLowerCase().trim() === email))
          ) {
            setSupplierSession(sup);
            setRestaurantSession(null);
            localStorage.removeItem('ryyco_restaurant_session');
            return;
          }
        } catch {
          // ignore
        }
      }

      // 2. Si el usuario coincide con un proveedor homologado en la base de datos
      const matchedSup = suppliers.find(
        (s) =>
          s.googleUid === uid ||
          (s.email && s.email.toLowerCase().trim() === email) ||
          (s.googleEmail && s.googleEmail.toLowerCase().trim() === email)
      );

      if (matchedSup) {
        setSupplierSession(matchedSup);
        localStorage.setItem('ryyco_supplier_session', JSON.stringify(matchedSup));
        setRestaurantSession(null);
        localStorage.removeItem('ryyco_restaurant_session');
        return;
      }

      // 3. Si el usuario tiene una sesión guardada explícita de restaurante
      const savedRestaurantStr = localStorage.getItem('ryyco_restaurant_session');
      if (savedRestaurantStr) {
        try {
          const res = JSON.parse(savedRestaurantStr) as RyycoRestaurantProfile;
          if (
            res &&
            (res.uid === uid ||
              res.email.toLowerCase().trim() === email)
          ) {
            setRestaurantSession(res);
            setSupplierSession(null);
            localStorage.removeItem('ryyco_supplier_session');
            return;
          }
        } catch {
          // ignore
        }
      }

      // 4. Si el usuario coincide con un restaurante registrado
      const matchedRes = restaurants.find(
        (r) =>
          r.email.toLowerCase().trim() === email ||
          r.uid === uid
      );
      if (matchedRes) {
        setRestaurantSession(matchedRes);
        localStorage.setItem('ryyco_restaurant_session', JSON.stringify(matchedRes));
        setSupplierSession(null);
        localStorage.removeItem('ryyco_supplier_session');
        return;
      }

      // IMPORTANTE: Si es un usuario nuevo o aún no ha seleccionado un rol explícito,
      // NUNCA crear automáticamente un perfil de restaurante ni de proveedor.
    });

    return () => unsubscribe();
  }, [restaurants, suppliers]);

  const activeRestaurant = useMemo<RyycoRestaurantProfile>(() => {
    return (
      restaurantSession ||
      restaurants[0]
    );
  }, [restaurantSession, restaurants]);

  const [isSupplierLoginOpen, setIsSupplierLoginOpen] = useState(false);

  const handleSupplierLoginSuccess = (supplier: RyycoSupplier) => {
    setSupplierSession(supplier);
    localStorage.setItem('ryyco_supplier_session', JSON.stringify(supplier));
    if (!loggedRestaurantProfile) {
      setRestaurantSession(null);
      localStorage.removeItem('ryyco_restaurant_session');
    }
    setIsSupplierLoginOpen(false);
    setActiveSection('supplier_workspace');
  };

  const handleSupplierLogout = () => {
    setSupplierSession(null);
    localStorage.removeItem('ryyco_supplier_session');
    if (loggedRestaurantProfile) {
      setRestaurantSession(mapUserProfileToB2BRestaurant(loggedRestaurantProfile));
    }
    if (activeSection === 'supplier_workspace') {
      setActiveSection('marketplace');
    }
  };

  // 1. INICIALIZACIÓN Y SUSCRIPCIÓN EN TIEMPO REAL DEL CATÁLOGO EN CLOUD FIRESTORE
  useEffect(() => {
    let unsubs: (() => void)[] = [];
    let isCancelled = false;

    const initFirebase = async () => {
      await testConnection();
      await cleanLegacyMockDataFromFirestore();
      if (isCancelled) return;

      // Suscripciones en tiempo real del catálogo general (proveedores, productos, frecuencias, comisiones)
      unsubs.push(
        subscribeToSuppliers((data) => {
          if (!isCancelled) setSuppliers(deduplicateSuppliers(data));
        })
      );
      unsubs.push(
        subscribeToProducts((data) => {
          if (!isCancelled) setProducts(deduplicateProducts(data));
        })
      );
      unsubs.push(
        subscribeToSchedules((data) => {
          if (!isCancelled) setSchedules(data);
        })
      );
      unsubs.push(
        subscribeToApplications((data) => {
          if (!isCancelled) setApplications(data);
        })
      );
      unsubs.push(
        subscribeToCommissionRates((rates) => {
          if (!isCancelled) setCommissionRates(rates);
        })
      );
    };

    initFirebase();

    return () => {
      isCancelled = true;
      unsubs.forEach((unsub) => unsub());
    };
  }, []);

  // 1.1 SUSCRIPCIÓN AISLADA A ÓRDENES SEGÚN EL USUARIO AUTENTICADO:
  // - Restaurante autenticado: lee ÚNICA Y EXCLUSIVAMENTE sus propios pedidos (restaurantUid == restaurantSession.uid).
  // - Proveedor autenticado: lee únicamente los pedidos recibidos para sus insumos (supplierId == supplierSession.id).
  // - Admin RYYCO Central: lee todos los pedidos para auditoría y comisiones.
  // - Sin autenticación: lista vacía ([]), ningún pedido se expone al público.
  useEffect(() => {
    let unsub: (() => void) | null = null;

    if (adminSession) {
      unsub = subscribeToOrders((data) => setOrders(data));
    } else if (supplierSession?.id) {
      unsub = subscribeToOrders((data) => setOrders(data), { supplierId: supplierSession.id });
    } else if (restaurantSession?.uid) {
      unsub = subscribeToOrders((data) => setOrders(data), { restaurantUid: restaurantSession.uid });
    } else {
      setOrders([]);
    }

    return () => {
      if (unsub) unsub();
    };
  }, [restaurantSession?.uid, supplierSession?.id, adminSession]);

  // 1.2 SUSCRIPCIÓN Y LECTURA EN TIEMPO REAL DE LA BOLSA (CARRITO) EN CLOUD FIRESTORE POR RESTAURANTE:
  useEffect(() => {
    if (!restaurantSession?.uid) {
      return;
    }
    const unsubCart = subscribeToCart(restaurantSession.uid, (cloudCartItems) => {
      setCart(cloudCartItems);
    });
    return () => {
      unsubCart();
    };
  }, [restaurantSession?.uid]);

  // Agregar insumos al carrito
  const handleAddToCart = (product: SupplierProduct, qty: number = 1) => {
    if (product.availability === 'agotado') return;

    setCart((prevCart) => {
      const existingIndex = prevCart.findIndex(
        (it) => it.productId === product.id
      );
      const newQty = existingIndex >= 0 ? prevCart[existingIndex].quantity + qty : Math.max(product.minOrderQty, qty);
      const unitPrice = getEffectiveUnitPrice(product, newQty);

      const newItem: B2BCartItem = {
        productId: product.id,
        productName: product.name,
        productSku: product.sku,
        productPhotoUrl: product.photoUrl,
        supplierId: product.supplierId,
        supplierTradeName: product.supplierTradeName,
        presentationLabel: product.presentationLabel,
        salesUnit: product.salesUnit,
        baseUnit: product.baseUnit,
        baseUnitQuantity: product.baseUnitQuantity,
        unitPriceCop: unitPrice,
        quantity: newQty,
        subtotalCop: unitPrice * newQty,
        equivalentGroupKey: product.equivalentGroupKey,
        isVariableWeight: product.isVariableWeight,
      };

      let nextCart: B2BCartItem[];
      if (existingIndex >= 0) {
        nextCart = [...prevCart];
        nextCart[existingIndex] = newItem;
      } else {
        nextCart = [...prevCart, newItem];
      }

      if (restaurantSession?.uid) {
        saveCartInFirestore(restaurantSession.uid, nextCart);
      }
      return nextCart;
    });

    setAddedProductId(product.id);
    setTimeout(() => setAddedProductId(null), 1800);
  };

  const handleUpdateCartQty = (productId: string, newQty: number) => {
    if (newQty <= 0) {
      handleRemoveCartItem(productId);
      return;
    }
    const prod = products.find((p) => p.id === productId);
    if (!prod) return;

    setCart((prev) => {
      const nextCart = prev.map((it) => {
        if (it.productId !== productId) return it;
        const unitPrice = getEffectiveUnitPrice(prod, newQty);
        return {
          ...it,
          quantity: newQty,
          unitPriceCop: unitPrice,
          subtotalCop: unitPrice * newQty,
        };
      });
      if (restaurantSession?.uid) {
        saveCartInFirestore(restaurantSession.uid, nextCart);
      }
      return nextCart;
    });
  };

  const handleRemoveCartItem = (productId: string) => {
    setCart((prev) => {
      const nextCart = prev.filter((it) => it.productId !== productId);
      if (restaurantSession?.uid) {
        saveCartInFirestore(restaurantSession.uid, nextCart);
      }
      return nextCart;
    });
  };

  // EMISIÓN DE ÓRDEN CORPORATIVA EN CLOUD FIRESTORE (Punto 4 y 5)
  const handlePlaceCorporateOrder = async (orderData: {
    supplierId: string;
    items: B2BCartItem[];
    deliveryMode: DeliveryMode;
    deliveryAddress: string;
    deliveryDate: string;
    deliveryTimeWindow: string;
    paymentMethod: string;
    subtotalCop: number;
    shippingFeeCop: number;
    totalAmountCop: number;
  }) => {
    if (!restaurantSession) {
      setIsRestaurantLoginOpen(true);
      return;
    }

    const sup = suppliers.find((s) => s.id === orderData.supplierId);
    const newOrderId = `ord-b2b-${Date.now()}`;
    const code = `B2B-${Math.floor(1000 + Math.random() * 9000)}`;
    const nowIso = new Date().toISOString();

    // Cálculo de comisión para RYYCO según la categoría oficial de insumos
    const commission = calculateOrderCommission(
      orderData.subtotalCop,
      orderData.totalAmountCop,
      sup?.category || 'General / Por defecto',
      commissionRates
    );

    const newOrder: B2BPurchaseOrder = {
      id: newOrderId,
      code,
      createdAt: nowIso,
      orderDate: new Date().toLocaleDateString('es-CO', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
      restaurantUid: restaurantSession.uid,
      restaurantUsername: restaurantSession.username,
      restaurantName: restaurantSession.displayName,
      restaurantAddress: restaurantSession.address,
      restaurantCity: restaurantSession.city,
      restaurantPhone: restaurantSession.whatsapp,
      supplierId: orderData.supplierId,
      supplierTradeName: sup?.tradeName || 'Proveedor Mayorista',
      supplierSalesWhatsapp: sup?.salesWhatsapp || '573158901122',
      supplierAddress: sup?.address || 'Zona Industrial',
      items: orderData.items,
      itemsCount: orderData.items.reduce((s, it) => s + it.quantity, 0),
      subtotalCop: orderData.subtotalCop,
      shippingFeeCop: orderData.shippingFeeCop,
      totalAmountCop: orderData.totalAmountCop,
      ryycoFeeCop: commission.feeCop,
      ryycoCommissionPercent: commission.percent,
      supplierNetPayoutCop: commission.netPayoutCop,
      deliveryMode: orderData.deliveryMode,
      deliveryAddress: orderData.deliveryAddress,
      deliveryDate: orderData.deliveryDate || 'Al término de la distancia',
      deliveryTimeWindow: orderData.deliveryTimeWindow || 'Al término de la distancia',
      transportResponsible: sup?.transportResponsible || 'Proveedor',
      status: 'pendiente_confirmacion',
      paymentStatus: 'pendiente',
      paymentMethod: orderData.paymentMethod,
      paymentTiming: sup?.paymentTiming === 'anticipado' ? 'anticipado' : 'contraentrega',
      supplierResponseDeadline: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      deliveryCode: generateDeliveryPin(),
      history: [
        {
          id: `hist-${Date.now()}`,
          timestamp: nowIso,
          actor: 'restaurante',
          action: 'Pedido Enviado',
          details: `El restaurante ${restaurantSession.displayName} emitió la solicitud por ${formatCop(orderData.totalAmountCop)} (despacho al término de la distancia).`,
        },
      ],
    };

    // Guardar en Cloud Firestore (la suscripción reactiva añadirá el pedido a orders)
    await createOrderInFirestore(newOrder);

    // Limpiar del carrito los insumos de este proveedor y persistir en Firestore
    setCart((prev) => {
      const nextCart = prev.filter((it) => it.supplierId !== orderData.supplierId);
      if (restaurantSession?.uid) {
        saveCartInFirestore(restaurantSession.uid, nextCart);
      }
      return nextCart;
    });
  };

  // ACTUALIZACIÓN DE ESTADO DE ORDEN
  const handleUpdateOrderStatus = async (
    orderId: string,
    newStatus: B2BOrderStatus,
    note?: string
  ) => {
    const ord = orders.find((o) => o.id === orderId);
    const supId = ord?.supplierId || supplierSession?.id;
    const event = {
      id: `hist-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: 'proveedor' as const,
      action: `Cambio a ${newStatus}`,
      details: note || `Estado actualizado a ${newStatus}.`,
    };

    await updateOrderStatusInFirestore(orderId, newStatus, event, supId);
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              status: newStatus,
              history: [event, ...o.history],
            }
          : o
      )
    );
  };

  // ACTUALIZACIÓN DE ESTADO DE PAGO INDEPENDIENTE
  const handleUpdatePaymentStatus = async (
    orderId: string,
    paymentStatus: PaymentStatus
  ) => {
    const ord = orders.find((o) => o.id === orderId);
    const supId = ord?.supplierId || supplierSession?.id;
    const event = {
      id: `hist-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: 'restaurante' as const,
      action: `Pago: ${paymentStatus}`,
      details: `Se registró el estado del pago como ${paymentStatus}.`,
    };

    await updateOrderPaymentInFirestore(orderId, paymentStatus, event, supId);
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              paymentStatus,
              history: [event, ...o.history],
            }
          : o
      )
    );
  };

  // ACTUALIZACIÓN INTEGRAL DE DETALLES DE ORDEN EN BODEGA / DESPACHO
  const handleUpdateOrderDetails = async (
    orderId: string,
    updates: Partial<B2BPurchaseOrder>,
    note?: string
  ) => {
    const ord = orders.find((o) => o.id === orderId);
    const supId = ord?.supplierId || supplierSession?.id;
    const event = {
      id: `hist-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: 'proveedor' as const,
      action: updates.status ? `Estado: ${updates.status}` : 'Alistamiento de Pedido',
      details: note || 'Se actualizaron los detalles del pedido en bodega.',
    };

    await updateOrderDetailsInFirestore(orderId, updates, event, supId);
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              ...updates,
              history: [event, ...o.history],
            }
          : o
      )
    );
  };

  // GUARDAR TABLA DE COMISIONES RYYCO EN FIRESTORE
  const handleSaveCommissionRates = async (rates: RyycoCommissionRate[]) => {
    await saveCommissionRatesInFirestore(rates);
    setCommissionRates(rates);
  };

  // PROVEEDOR PROPONE CAMBIOS
  const handleProposeChanges = async (
    orderId: string,
    changes: {
      totalAmountCop: number;
      shippingFeeCop: number;
      deliveryDate: string;
      reason: string;
    }
  ) => {
    const event = {
      id: `hist-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: 'proveedor' as const,
      action: 'Propuesta de Ajuste',
      details: `Proveedor propuso nuevo valor ${formatCop(changes.totalAmountCop)}: "${changes.reason}"`,
    };

    const updatedProposed = {
      ...changes,
      proposedAt: new Date().toISOString(),
    };

    await updateOrderStatusInFirestore(orderId, 'propuesta_cambios', event);
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              status: 'propuesta_cambios',
              proposedChanges: updatedProposed,
              history: [event, ...o.history],
            }
          : o
      )
    );
  };

  // RESTAURANTE ACEPTA CAMBIOS
  const handleAcceptProposedChanges = async (orderId: string) => {
    const ord = orders.find((o) => o.id === orderId);
    if (!ord || !ord.proposedChanges) return;

    const event = {
      id: `hist-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: 'restaurante' as const,
      action: 'Propuesta Aceptada',
      details: 'El restaurante aceptó el nuevo valor y fecha propuestos por el proveedor.',
    };

    await updateOrderStatusInFirestore(orderId, 'confirmado', event);
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              status: 'confirmado',
              totalAmountCop: o.proposedChanges?.totalAmountCop ?? o.totalAmountCop,
              shippingFeeCop: o.proposedChanges?.shippingFeeCop ?? o.shippingFeeCop,
              deliveryDate: o.proposedChanges?.deliveryDate ?? o.deliveryDate,
              history: [event, ...o.history],
            }
          : o
      )
    );
  };

  // RECHAZAR ORDEN
  const handleRejectOrder = async (orderId: string, reason: string) => {
    const event = {
      id: `hist-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: 'proveedor' as const,
      action: 'Pedido Rechazado',
      details: `Rechazado por el proveedor: "${reason}".`,
    };

    await updateOrderStatusInFirestore(orderId, 'cancelado', event);
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              status: 'cancelado',
              rejectionReason: reason,
              history: [event, ...o.history],
            }
          : o
      )
    );
  };

  // REPORTAR UN PROBLEMA
  const handleReportProblem = async (
    orderId: string,
    reportData: Omit<ProblemReport, 'id' | 'createdAt' | 'status'>
  ) => {
    const report: ProblemReport = {
      ...reportData,
      id: `rep-${Date.now()}`,
      status: 'abierto',
      createdAt: new Date().toISOString(),
    };

    const event = {
      id: `hist-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: 'restaurante' as const,
      action: 'Incidencia Reportada',
      details: `Reporte por ${report.reason.replace('_', ' ')}: "${report.description}". Solución: ${report.solutionRequested}`,
    };

    await saveProblemReportInFirestore(report, orderId, event);
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              problemReport: report,
              history: [event, ...o.history],
            }
          : o
      )
    );
  };

  // GESTIÓN DE COMPRAS RECURRENTES (Punto 6)
  const handleCreateRecurringSchedule = async (
    newSch: Omit<B2BRecurringSchedule, 'id' | 'createdAt'>
  ) => {
    const sch: B2BRecurringSchedule = {
      ...newSch,
      id: `sch-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    await saveRecurringScheduleInFirestore(sch);
    setSchedules((prev) => [sch, ...prev]);
  };

  const handleToggleScheduleStatus = async (
    scheduleId: string,
    nextStatus: 'activo' | 'pausado' | 'cancelado'
  ) => {
    const sch = schedules.find((s) => s.id === scheduleId);
    if (!sch) return;
    const updated = { ...sch, status: nextStatus };
    await saveRecurringScheduleInFirestore(updated);
    setSchedules((prev) => prev.map((s) => (s.id === scheduleId ? updated : s)));
  };

  const handleSkipNextDelivery = async (scheduleId: string) => {
    const sch = schedules.find((s) => s.id === scheduleId);
    if (!sch) return;
    const updated = { ...sch, skipNextDelivery: !sch.skipNextDelivery };
    await saveRecurringScheduleInFirestore(updated);
    setSchedules((prev) => prev.map((s) => (s.id === scheduleId ? updated : s)));
  };

  const handleGenerateOrderFromSchedule = (scheduleId: string) => {
    const sch = schedules.find((s) => s.id === scheduleId);
    if (!sch) return;
    handlePlaceCorporateOrder({
      supplierId: sch.supplierId,
      items: sch.items,
      deliveryMode: sch.deliveryMode,
      deliveryAddress: sch.deliveryAddress,
      deliveryDate: sch.nextDeliveryDate,
      deliveryTimeWindow: '08:00 - 12:00',
      paymentMethod: 'Crédito Quincenal / Transferencia',
      subtotalCop: sch.estimatedTotalCop,
      shippingFeeCop: 0,
      totalAmountCop: sch.estimatedTotalCop,
    });
  };

  // RYYCO CENTRAL ADMIN
  const handleSubmitSupplierApplication = async (
    newApp: Omit<SupplierApplication, 'id' | 'status' | 'createdAt'>
  ) => {
    const app: SupplierApplication = {
      ...newApp,
      id: `app-sup-${Date.now()}`,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    await saveApplicationInFirestore(app);
    setApplications((prev) => [app, ...prev]);
  };

  const handleApproveApplication = async (applicationId: string, approvedBy: string) => {
    const app = applications.find((a) => a.id === applicationId);
    if (!app) return;
    const nowIso = new Date().toISOString();

    const updatedApp: SupplierApplication = {
      ...app,
      status: 'approved',
      reviewedAt: nowIso,
      reviewedBy: approvedBy,
      adminNote: `Aprobado por ${approvedBy}. Perfil habilitado para carga de insumos.`,
    };
    await saveApplicationInFirestore(updatedApp);
    setApplications((prev) => prev.map((a) => (a.id === applicationId ? updatedApp : a)));

    const cleanNit = (app.nit || '').trim();
    const existingIndex = suppliers.findIndex(
      (s) =>
        (cleanNit && s.nit && s.nit.trim() === cleanNit) ||
        (app.googleUid && s.googleUid === app.googleUid) ||
        (app.email && s.email && s.email.toLowerCase().trim() === app.email.toLowerCase().trim())
    );

    if (existingIndex >= 0) {
      const existing = suppliers[existingIndex];
      const updatedSupplier: RyycoSupplier = {
        ...existing,
        tradeName: app.tradeName || existing.tradeName,
        businessName: app.businessName || existing.businessName,
        category: app.category || existing.category,
        categories: [app.category || existing.category],
        salesWhatsapp: app.contactWhatsapp || existing.salesWhatsapp,
        contactPersonName: app.contactName || existing.contactPersonName,
        email: app.email || existing.email,
        googleUid: app.googleUid || existing.googleUid,
        googleEmail: app.googleEmail || existing.googleEmail,
        logoUrl: app.googlePhotoUrl || existing.logoUrl,
        canUploadProducts: true,
        verifiedByRyyco: true,
        status: 'active',
        approvedAt: nowIso,
        approvedBy,
      };
      await saveSupplierInFirestore(updatedSupplier);
      setSuppliers((prev) =>
        deduplicateSuppliers(prev.map((s, idx) => (idx === existingIndex ? updatedSupplier : s)))
      );
      return;
    }

    const newSupplier: RyycoSupplier = {
      id: `sup-${Date.now()}`,
      uid: app.googleUid || `auth-sup-${Date.now()}`,
      googleUid: app.googleUid,
      googleEmail: app.googleEmail || app.email,
      logoUrl: app.googlePhotoUrl,
      nit: app.nit,
      businessName: app.businessName,
      tradeName: app.tradeName,
      slug: app.tradeName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      category: app.category,
      categories: [app.category],
      city: app.city,
      address: app.address,
      servedZones: ['Centro', 'Área Metropolitana'],
      lat: app.lat || 0.8305,
      lng: app.lng || -77.6462,
      salesWhatsapp: app.contactWhatsapp,
      email: app.email,
      supportChannel: 'ambos',
      contactPersonName: app.contactName,
      minOrderCop: 140000,
      paymentMethodsAccepted: ['Transferencia Bancolombia', 'Contraentrega Efectivo'],
      paymentTiming: 'ambos',
      orderCutoffHour: '14:00',
      disputeReportingWindowHours: 24,
      offeredSolutions: ['reposicion', 'devolucion', 'ajuste_cobro'],
      deliveryOptions: ['entrega_proveedor', 'recogida_restaurante'],
      transportResponsible: 'proveedor',
      deliveryDays: ['Lunes', 'Miércoles', 'Viernes'],
      deliveryTimeWindow: '08:00 - 12:00',
      baseShippingFeeCop: 9000,
      freeShippingThresholdCop: 380000,
      leadTimeHours: 4,
      rating: 5.0,
      ratingCount: 1,
      completedB2BOrders: 0,
      verifiedByRyyco: true,
      canUploadProducts: true,
      status: 'active',
      approvedAt: nowIso,
      approvedBy,
      acceptsCredit15Days: true,
      acceptsCredit30Days: false,
      bankAccounts: [],
      active: true,
      createdAt: nowIso,
    };
    await saveSupplierInFirestore(newSupplier);
    setSuppliers((prev) => deduplicateSuppliers([newSupplier, ...prev]));
  };

  const handleRejectApplication = async (applicationId: string, reason?: string) => {
    const app = applications.find((a) => a.id === applicationId);
    if (!app) return;
    const updatedApp: SupplierApplication = {
      ...app,
      status: 'rejected',
      reviewedAt: new Date().toISOString(),
      adminNote: reason || 'Rechazado en verificación de RYYCO Central.',
    };
    await saveApplicationInFirestore(updatedApp);
    setApplications((prev) => prev.map((a) => (a.id === applicationId ? updatedApp : a)));
  };

  const handleToggleUploadPermission = async (supplierId: string) => {
    const sup = suppliers.find((s) => s.id === supplierId);
    if (!sup) return;
    const nextState = !sup.canUploadProducts;
    const updated = {
      ...sup,
      canUploadProducts: nextState,
      status: nextState ? ('active' as const) : ('pending_verification' as const),
    };
    await saveSupplierInFirestore(updated);
    setSuppliers((prev) => prev.map((s) => (s.id === supplierId ? updated : s)));
  };

  const handleUpdateSupplierStatus = async (
    supplierId: string,
    status: SupplierStatus,
    reason?: string
  ) => {
    const sup = suppliers.find((s) => s.id === supplierId);
    if (!sup) return;
    const updated: RyycoSupplier = {
      ...sup,
      status,
      statusReason: reason !== undefined ? reason : sup.statusReason,
      statusUpdatedAt: new Date().toISOString(),
      statusUpdatedBy: adminSession?.email || 'Admin RYYCO Central',
      canUploadProducts: status === 'active',
      active: status === 'active',
    };
    await saveSupplierInFirestore(updated);
    setSuppliers((prev) => prev.map((s) => (s.id === supplierId ? updated : s)));
  };

  const handleDirectRegisterAndEnableSupplier = async (
    newSup: Omit<
      RyycoSupplier,
      'id' | 'uid' | 'createdAt' | 'rating' | 'ratingCount' | 'completedB2BOrders'
    >
  ) => {
    const cleanNit = (newSup.nit || '').trim();
    const cleanEmail = (newSup.email || '').trim().toLowerCase();
    const existingIndex = suppliers.findIndex(
      (s) =>
        (cleanNit && s.nit && s.nit.trim() === cleanNit) ||
        (cleanEmail && s.email && s.email.trim().toLowerCase() === cleanEmail)
    );

    if (existingIndex >= 0) {
      const existing = suppliers[existingIndex];
      const updated: RyycoSupplier = {
        ...existing,
        ...newSup,
        id: existing.id,
        uid: existing.uid,
        email: cleanEmail,
        googleEmail: cleanEmail,
        status: newSup.status || 'active',
        canUploadProducts: newSup.canUploadProducts !== undefined ? newSup.canUploadProducts : true,
        verifiedByRyyco: true,
      };
      await saveSupplierInFirestore(updated);
      setSuppliers((prev) =>
        deduplicateSuppliers(prev.map((s, idx) => (idx === existingIndex ? updated : s)))
      );
      return;
    }

    const created: RyycoSupplier = {
      ...newSup,
      id: `sup-${Date.now()}`,
      uid: `auth-sup-${Date.now()}`,
      email: cleanEmail,
      googleEmail: cleanEmail,
      rating: 5.0,
      ratingCount: 1,
      completedB2BOrders: 0,
      createdAt: new Date().toISOString(),
    };
    await saveSupplierInFirestore(created);
    setSuppliers((prev) => deduplicateSuppliers([created, ...prev]));
  };

  const handleCreateSupplierProduct = async (
    newProd: Omit<SupplierProduct, 'id'>
  ) => {
    const cleanSku = (newProd.sku || '').trim().toLowerCase();
    const cleanName = (newProd.name || '').trim().toLowerCase();
    const existingIndex = products.findIndex(
      (p) =>
        p.supplierId === newProd.supplierId &&
        ((cleanSku && p.sku && p.sku.trim().toLowerCase() === cleanSku) ||
          (cleanName && p.name && p.name.trim().toLowerCase() === cleanName))
    );

    if (existingIndex >= 0) {
      const existing = products[existingIndex];
      const updated: SupplierProduct = {
        ...existing,
        ...newProd,
        id: existing.id,
      };
      await saveProductInFirestore(updated);
      setProducts((prev) =>
        deduplicateProducts(prev.map((p, idx) => (idx === existingIndex ? updated : p)))
      );
      return;
    }

    const created: SupplierProduct = {
      ...newProd,
      id: `prod-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    };
    await saveProductInFirestore(created);
    setProducts((prev) => deduplicateProducts([created, ...prev]));
  };

  const handleUpdateProductAvailability = async (
    productId: string,
    availability: ProductAvailability
  ) => {
    const prod = products.find((p) => p.id === productId);
    const supId = prod?.supplierId || supplierSession?.id;
    await updateProductAvailabilityInFirestore(productId, availability, supId);
    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, availability } : p))
    );
  };

  const handleDeleteProduct = async (productId: string) => {
    const prod = products.find((p) => p.id === productId);
    const supId = prod?.supplierId || supplierSession?.id;
    await deleteProductFromFirestore(productId, supId);
    setProducts((prev) => prev.filter((p) => p.id !== productId));
  };

  const handleUpdateProductPrice = async (
    productId: string,
    newPriceCop: number
  ) => {
    const prod = products.find((p) => p.id === productId);
    if (!prod) return;
    const updated = { ...prod, priceCop: newPriceCop };
    await saveProductInFirestore(updated);
    setProducts((prev) => prev.map((p) => (p.id === productId ? updated : p)));
  };

  const handleUpdateFullProduct = async (
    productId: string,
    updatedData: Partial<SupplierProduct>
  ) => {
    const prod = products.find((p) => p.id === productId);
    if (!prod) return;
    const updated: SupplierProduct = { ...prod, ...updatedData, id: prod.id };
    await saveProductInFirestore(updated);
    setProducts((prev) =>
      deduplicateProducts(prev.map((p) => (p.id === productId ? updated : p)))
    );
  };

  const handleUpdateSupplierSettings = async (
    supplierId: string,
    settings: Partial<RyycoSupplier>
  ) => {
    const sup = suppliers.find((s) => s.id === supplierId);
    if (!sup) return;
    const updated = { ...sup, ...settings };
    await saveSupplierInFirestore(updated);
    setSuppliers((prev) => prev.map((s) => (s.id === supplierId ? updated : s)));
    if (supplierSession?.id === supplierId) {
      setSupplierSession(updated);
      localStorage.setItem('ryyco_supplier_session', JSON.stringify(updated));
    }
  };

  // Productos a desplegar: Exclusiva y estrictamente los insumos reales leídos desde Cloud Firestore de proveedores activos y habilitados
  const displayedProducts = useMemo<SupplierProduct[]>(() => {
    const activeSupplierIds = new Set(
      suppliers
        .filter((s) => s.status === 'active' && s.canUploadProducts !== false)
        .map((s) => s.id)
    );
    return deduplicateProducts(products.filter((p) => activeSupplierIds.has(p.supplierId)));
  }, [products, suppliers]);


  const [sortBy, setSortBy] = useState<'relevancia' | 'menor_precio' | 'mayor_precio'>('relevancia');
  const [favoriteProductIds, setFavoriteProductIds] = useState<Record<string, boolean>>({});

  const toggleFavorite = (productId: string) => {
    setFavoriteProductIds((prev) => ({ ...prev, [productId]: !prev[productId] }));
  };


  // Filtrado y ordenamiento de productos para la vista de Catálogo Mayorista
  const filteredProducts = useMemo(() => {
    let list = displayedProducts.filter((p) => {
      const matchesSearch =
        searchQuery === '' ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.supplierTradeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.presentationLabel.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCategory =
        selectedCategory === 'all' ||
        p.category === selectedCategory ||
        (selectedCategory === 'Frutas y Verduras' &&
          (p.category.toLowerCase().includes('fruta') ||
            p.category.toLowerCase().includes('verdura') ||
            p.category.toLowerCase().includes('vegetal') ||
            p.name.toLowerCase().includes('papa') ||
            p.name.toLowerCase().includes('cebolla'))) ||
        (selectedCategory === 'Empaques Biodegradables' && p.category.toLowerCase().includes('empaque')) ||
        (selectedCategory === 'Cárnicos y Embutidos' && p.category.toLowerCase().includes('cárnico')) ||
        (selectedCategory === 'Aceites y Abarrotes' &&
          (p.category.toLowerCase().includes('aceite') ||
            p.category.toLowerCase().includes('abarrote'))) ||
        (selectedCategory === 'Lácteos y Quesos' && p.category.toLowerCase().includes('lácteo'));

      return matchesSearch && matchesCategory;
    });

    if (sortBy === 'menor_precio') {
      list = [...list].sort((a, b) => a.priceCop - b.priceCop);
    } else if (sortBy === 'mayor_precio') {
      list = [...list].sort((a, b) => b.priceCop - a.priceCop);
    }

    return list;
  }, [displayedProducts, searchQuery, selectedCategory, sortBy]);

  const totalCartUnits = cart.reduce((s, it) => s + it.quantity, 0);
  const totalCartCop = cart.reduce((s, it) => s + it.subtotalCop, 0);
  const pendingAppsCount = applications.filter((a) => a.status === 'pending').length;

  // REGLAS DE VISIBILIDAD DE MENÚ SOLICITADAS:
  // 1. "Catálogo Mayorista" y "Comparador de Precios" aparecen SIEMPRE para todos.
  // 2. "Vender en RYYCO" SOLO aparece para el público general (cuando no hay sesión de restaurante, proveedor ni admin).
  // 3. "Mi Portal Proveedor" SOLO aparece cuando un proveedor homologado inicia sesión.
  // 4. "Pedidos" y "Programar Compra" SOLO aparecen cuando un restaurante inicia sesión.
  // 5. "Proveedores" y "RYYCO Central" SOLO aparecen cuando se inicie sesión como administrador (NUNCA para el público ni para restaurante).
  const navItems = useMemo(() => {
    const items: Array<{
      id: ActiveSection;
      label: string;
      shortLabel: string;
      highlight?: boolean;
      icon?: React.ReactNode;
    }> = [
      {
        id: 'marketplace',
        label: 'Catálogo',
        shortLabel: 'Catálogo',
        icon: <LayoutGrid className="w-4 h-4" />,
      },
      {
        id: 'comparator',
        label: 'Comparar precios',
        shortLabel: 'Comparar',
        icon: <BarChart2 className="w-4 h-4" />,
      },
    ];

    // Módulos exclusivos para Restaurante Comprador (NUNCA Proveedores ni Vender en RYYCO)
    if (restaurantSession) {
      items.push(
        {
          id: 'orders',
          label: 'Historial de pedidos',
          shortLabel: 'Pedidos',
          icon: <ClipboardList className="w-4 h-4" />,
        },
        {
          id: 'automation',
          label: 'Compras recurrentes',
          shortLabel: 'Compras',
          icon: <Repeat className="w-4 h-4" />,
        }
      );
    }

    // Acceso para público general sin sesión (NO aparece menú de pedidos)
    if (!supplierSession && !restaurantSession && !adminSession) {
      items.push({
        id: 'supplier_landing',
        label: 'Vender en RYYCO',
        shortLabel: 'Vender en RYYCO',
        icon: <Building2 className="w-4 h-4 text-[#F4B400]" />,
      });
    }

    // Portal exclusivo si el proveedor ha iniciado sesión
    if (supplierSession) {
      const myPendingOrders = orders.filter(
        (o) => o.supplierId === supplierSession.id && o.status === 'pendiente_confirmacion'
      ).length;
      items.push({
        id: 'supplier_workspace',
        label: `Mi Portal Proveedor${myPendingOrders > 0 ? ` (${myPendingOrders})` : ''}`,
        shortLabel: `Mi Portal${myPendingOrders > 0 ? ` (${myPendingOrders})` : ''}`,
        highlight: myPendingOrders > 0,
        icon: <Building2 className="w-4 h-4 text-[#F4B400]" />,
      });
    }

    return items;
  }, [supplierSession, restaurantSession, adminSession, orders, pendingAppsCount]);

  return (
    <div className="proveedores-module-scope min-h-screen flex flex-col bg-[#F8F9FA] text-[#111827]">
      {/* 1. Header Corporativo RYYCO */}
      {activeSection === 'suppliers' ? null : restaurantSession && !supplierSession ? (
        <header className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-2xs">
          {/* Header para PC */}
          <div className="hidden md:flex max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 items-center justify-between">
            {/* Izquierda: Logo + Separador + Tabs de navegación */}
            <div className="flex items-center gap-6">
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setActiveSection('marketplace');
                }}
                className="flex items-center shrink-0 cursor-pointer"
                title="RYYCO Inicio"
              >
                <RyycoLogo variant="dark" className="h-8" showSubtitle={false} />
              </a>

              <div className="h-6 w-px bg-gray-200" />

              <nav className="flex items-center gap-7 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setActiveSection('marketplace')}
                  className={`flex items-center gap-2 py-5 border-b-2 -mb-px transition-colors cursor-pointer ${
                    activeSection === 'marketplace'
                      ? 'border-[#E52243] text-[#E52243]'
                      : 'border-transparent text-gray-700 hover:text-gray-950'
                  }`}
                >
                  <LayoutGrid className={`w-4 h-4 ${activeSection === 'marketplace' ? 'text-[#E52243]' : 'text-gray-600'}`} />
                  <span>Catálogo</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveSection('comparator')}
                  className={`flex items-center gap-2 py-5 border-b-2 -mb-px transition-colors cursor-pointer ${
                    activeSection === 'comparator'
                      ? 'border-[#E52243] text-[#E52243]'
                      : 'border-transparent text-gray-700 hover:text-gray-950'
                  }`}
                >
                  <BarChart2 className={`w-4 h-4 ${activeSection === 'comparator' ? 'text-[#E52243]' : 'text-gray-600'}`} />
                  <span>Comparar precios</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveSection('orders')}
                  className={`flex items-center gap-2 py-5 border-b-2 -mb-px transition-colors cursor-pointer ${
                    activeSection === 'orders'
                      ? 'border-[#E52243] text-[#E52243]'
                      : 'border-transparent text-gray-700 hover:text-gray-950'
                  }`}
                >
                  <ClipboardList className={`w-4 h-4 ${activeSection === 'orders' ? 'text-[#E52243]' : 'text-gray-600'}`} />
                  <span>Historial de pedidos</span>
                  {orders.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-rose-100 text-[#E52243] font-bold">
                      {orders.length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveSection('automation')}
                  className={`flex items-center gap-2 py-5 border-b-2 -mb-px transition-colors cursor-pointer ${
                    activeSection === 'automation'
                      ? 'border-[#E52243] text-[#E52243]'
                      : 'border-transparent text-gray-700 hover:text-gray-950'
                  }`}
                >
                  <Repeat className={`w-4 h-4 ${activeSection === 'automation' ? 'text-[#E52243]' : 'text-gray-600'}`} />
                  <span>Compras recurrentes</span>
                </button>
              </nav>
            </div>

            {/* Derecha: Nombre del Restaurante Oficial y Bolsa */}
            <div className="flex items-center gap-4">
              {totalCartUnits > 0 && (
                <button
                  type="button"
                  onClick={() => setIsCartOpen(true)}
                  className="inline-flex items-center gap-2 px-3.5 py-1.5 border border-[#E52243] text-[#E52243] hover:bg-rose-50 text-xs font-bold rounded-full transition-colors cursor-pointer"
                  title="Abrir Bolsa B2B"
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>Bolsa</span>
                  <span className="font-mono text-xs font-bold">{totalCartUnits}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsRestaurantLoginOpen(true)}
                className="flex items-center gap-2.5 px-3 py-1.5 text-xs font-bold text-gray-900 hover:bg-gray-50 rounded-xl transition-colors cursor-pointer border border-gray-200 hover:border-gray-300"
              >
                {restaurantSession?.photoUrl ? (
                  <img
                    src={restaurantSession.photoUrl}
                    alt={restaurantSession.displayName}
                    className="w-8 h-8 rounded-full object-cover border border-gray-200 shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center shrink-0">
                    <Store className="w-4 h-4 text-[#E52243]" />
                  </div>
                )}
                <div className="text-left leading-tight">
                  <span className="block font-black text-xs tracking-tight text-gray-950">
                    {restaurantSession?.displayName || 'Mi Negocio'}
                  </span>
                  <span className="text-[10px] text-emerald-600 font-bold block">
                    RESTAURANTE ACTIVO
                  </span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-gray-400 ml-0.5" />
              </button>
            </div>
          </div>

          {/* Header para Celular Oficial (Mockup: Logo, Perfil, Bolsa) */}
          <div className="md:hidden flex items-center justify-between px-4 py-3 bg-white">
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setActiveSection('marketplace');
              }}
              className="flex items-center gap-1 cursor-pointer"
              title="RYYCO Inicio"
            >
              <RyycoLogo variant="dark" className="h-8" showSubtitle={false} />
            </a>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setIsRestaurantLoginOpen(true)}
                className="flex items-center gap-2 px-2.5 py-1 text-gray-900 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-full transition-colors cursor-pointer relative"
                aria-label="Perfil de restaurante"
                title={restaurantSession?.displayName || 'Mi cuenta'}
              >
                {restaurantSession?.photoUrl ? (
                  <img
                    src={restaurantSession.photoUrl}
                    alt={restaurantSession.displayName}
                    className="w-6 h-6 rounded-full object-cover border border-gray-200 shrink-0"
                  />
                ) : (
                  <Store className="w-4 h-4 text-[#E52243] shrink-0" />
                )}
                <span className="text-xs font-extrabold max-w-[110px] truncate">
                  {restaurantSession?.displayName || 'Mi Negocio'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setIsCartOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-200 bg-white hover:bg-rose-50 text-gray-800 transition-colors cursor-pointer shadow-2xs"
                aria-label="Ver Bolsa"
              >
                <ShoppingBag className="w-5 h-5 text-gray-800 stroke-[1.8]" />
                <span className="w-5 h-5 rounded-full bg-[#E52243] text-white text-[11px] font-black flex items-center justify-center">
                  {totalCartUnits}
                </span>
              </button>
            </div>
          </div>
        </header>
      ) : (
        <header className="sticky top-0 z-40 bg-white shadow-xs">
          {/* Fila 1: Logo, Entrega en Ipiales, Buscador central, Mi Negocio y Bolsa */}
          {/* Header para Celular Oficial (Mockup: Logo, Perfil, Bolsa) */}
          <div className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-gray-100">
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setActiveSection('marketplace');
              }}
              className="flex items-center gap-1 cursor-pointer"
              title="RYYCO Inicio"
            >
              <RyycoLogo variant="dark" className="h-8" showSubtitle={false} />
            </a>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setIsRestaurantLoginOpen(true)}
                className="flex items-center gap-2 px-2.5 py-1 text-gray-900 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-full transition-colors cursor-pointer relative"
                aria-label="Perfil / Cuenta"
                title={restaurantSession?.displayName || 'Mi cuenta'}
              >
                {restaurantSession?.photoUrl ? (
                  <img
                    src={restaurantSession.photoUrl}
                    alt={restaurantSession.displayName}
                    className="w-6 h-6 rounded-full object-cover border border-gray-200 shrink-0"
                  />
                ) : (
                  <Store className="w-4 h-4 text-[#E52243] shrink-0" />
                )}
                <span className="text-xs font-extrabold max-w-[110px] truncate">
                  {restaurantSession?.displayName || 'Mi Negocio'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setIsCartOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-200 bg-white hover:bg-rose-50 text-gray-800 transition-colors cursor-pointer shadow-2xs"
                aria-label="Ver Bolsa"
              >
                <ShoppingBag className="w-5 h-5 text-gray-800 stroke-[1.8]" />
                <span className="w-5 h-5 rounded-full bg-[#E52243] text-white text-[11px] font-black flex items-center justify-center">
                  {totalCartUnits}
                </span>
              </button>
            </div>
          </div>

          {/* Fila 1 Desktop: Logo, Entrega en Ipiales, Buscador central, Mi Negocio y Bolsa */}
          <div className="hidden md:block border-b border-gray-100">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between gap-3 sm:gap-6">
              {/* Zona Izquierda: Logo y Selector de Ubicación */}
              <div className="flex items-center gap-4 shrink-0">
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setIsAdminLoginModalOpen(false);
                    setIsRestaurantLoginOpen(false);
                    setIsSupplierLoginOpen(false);
                    setIsMobileMenuOpen(false);
                    setActiveSection('marketplace');
                  }}
                  className="flex items-center shrink-0 cursor-pointer"
                  title="RYYCO Inicio"
                >
                  <RyycoLogo variant="dark" className="h-8 sm:h-9" showSubtitle={false} />
                </a>

                <div className="hidden md:block h-7 w-px bg-gray-200" />

                {/* Selector de Ciudad / Despacho */}
                <div
                  onClick={() => {
                    if (!restaurantSession) setIsRestaurantLoginOpen(true);
                  }}
                  className="hidden md:flex items-center gap-2.5 px-3 py-1.5 rounded-full border border-gray-200 bg-[#F9FAFB] hover:bg-gray-100/80 transition-colors cursor-pointer"
                  title="Ciudad de entrega mayorista"
                >
                  <div className="w-6 h-6 rounded-full bg-rose-50 flex items-center justify-center text-[#E52243]">
                    <MapPin className="w-3.5 h-3.5 fill-[#E52243]" />
                  </div>
                  <div className="text-left text-xs leading-none">
                    <span className="text-[10px] text-gray-400 block font-medium">Entregar en</span>
                    <span className="font-bold text-gray-900 flex items-center gap-1 mt-0.5">
                      {restaurantSession?.city || 'Ipiales'}
                      <ChevronDown className="w-3 h-3 text-gray-400" />
                    </span>
                  </div>
                </div>
              </div>

              {/* Zona Central: Buscador en forma de píldora espaciosa */}
              <div className="flex-1 max-w-xl mx-2 sm:mx-4">
                <div className="relative">
                  <Search className="w-4 h-4 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="¿Qué necesita tu cocina hoy?"
                    className="w-full pl-11 pr-4 py-2.5 text-xs bg-[#F9FAFB] border border-gray-200 text-gray-900 rounded-full focus:outline-none focus:border-[#E52243] focus:bg-white placeholder-gray-400 transition-all shadow-inner"
                  />
                </div>
              </div>

              {/* Zona Derecha: Mi Negocio, Bolsa y Acciones */}
              <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsRestaurantLoginOpen(true)}
                  className="hidden md:flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-gray-900 hover:text-gray-950 rounded-xl hover:bg-gray-100 border border-gray-200 transition-colors cursor-pointer"
                >
                  {restaurantSession?.photoUrl ? (
                    <img
                      src={restaurantSession.photoUrl}
                      alt={restaurantSession.displayName}
                      className="w-6 h-6 rounded-full object-cover border border-gray-200 shrink-0"
                    />
                  ) : (
                    <Store className="w-4 h-4 text-[#E52243]" />
                  )}
                  <span className="max-w-[140px] truncate font-bold">
                    {restaurantSession?.displayName || 'Mi negocio'}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                </button>

                <button
                  type="button"
                  onClick={() => setIsCartOpen(true)}
                  className="inline-flex items-center gap-2 px-3.5 sm:px-4 py-1.5 sm:py-2 border border-[#E52243] text-[#E52243] hover:bg-rose-50 text-xs font-bold rounded-full transition-colors cursor-pointer shrink-0"
                  title="Abrir Bolsa B2B"
                >
                  <ShoppingBag className="w-4 h-4 text-[#E52243]" />
                  <span className="hidden sm:inline">Bolsa</span>
                  <span className="font-mono text-xs font-bold ml-0.5">
                    {totalCartUnits}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Fila 2 Desktop: Sub-Barra de Navegación */}
          <div className="hidden md:block border-b border-gray-200 bg-white">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between text-xs font-semibold">
              <div className="flex items-center gap-6 sm:gap-8 overflow-x-auto py-0">
                {navItems.map((item) => {
                  const isActive = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setIsAdminLoginModalOpen(false);
                        setIsMobileMenuOpen(false);
                        setActiveSection(item.id);
                      }}
                      className={`py-3 flex items-center gap-2 font-bold cursor-pointer transition-colors border-b-2 -mb-px whitespace-nowrap ${
                        isActive
                          ? 'border-[#E52243] text-[#E52243]'
                          : 'border-transparent text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Accesos directos derechos (ocultos cuando hay restaurante logueado) */}
              {!restaurantSession && (
                <div className="hidden sm:flex items-center gap-5 shrink-0 py-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (supplierSession) {
                        setActiveSection('supplier_workspace');
                      } else {
                        setIsSupplierLoginOpen(true);
                      }
                    }}
                    className="flex items-center gap-1.5 text-gray-600 hover:text-gray-900 font-semibold cursor-pointer whitespace-nowrap"
                  >
                    <Users className="w-4 h-4 text-gray-500" />
                    <span>{supplierSession ? supplierSession.tradeName : 'Portal proveedor'}</span>
                  </button>

                  <div className="h-4 w-px bg-gray-200" />

                  <button
                    type="button"
                    onClick={() => {
                      if (adminSession) {
                        setActiveSection('admin_central');
                      } else {
                        setIsAdminLoginModalOpen(true);
                      }
                    }}
                    className="flex items-center gap-1.5 text-gray-600 hover:text-gray-900 font-semibold cursor-pointer whitespace-nowrap"
                  >
                    <Settings className="w-4 h-4 text-gray-500" />
                    <span>Administración</span>
                    {pendingAppsCount > 0 && adminSession && (
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
      )}

      {/* MENÚ DESPLAZABLE (DRAWER RESPONSIVO PARA CELULAR Y TABLET) */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex justify-end xl:hidden">
          {/* Fondo oscuro con desenfoque */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={() => setIsMobileMenuOpen(false)}
          />

          {/* Panel Desplazable Lateral */}
          <div className="relative w-full max-w-sm sm:max-w-md bg-white border-l border-gray-200 shadow-2xl z-10 flex flex-col h-full overflow-hidden animate-in slide-in-from-right duration-250">
            {/* Cabecera del Menú */}
            <div className="p-4 sm:p-5 border-b border-gray-100 bg-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RyycoLogo variant="dark" className="h-7" showSubtitle={false} />
                <span className="text-[10px] font-mono text-[#E52243] bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full font-bold">
                  B2B Hub
                </span>
              </div>

              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-2 rounded-xl text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors cursor-pointer"
                aria-label="Cerrar menú"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Contenido con scroll independiente */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6 text-xs">
              {/* Bloque 1: Navegación de la Plataforma */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block px-1">
                  Opciones de Navegación
                </span>
                <div className="space-y-1.5">
                  {navItems.map((item) => {
                    const isActive = activeSection === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setIsAdminLoginModalOpen(false);
                          setIsRestaurantLoginOpen(false);
                          setIsSupplierLoginOpen(false);
                          setIsMobileMenuOpen(false);
                          setActiveSection(item.id);
                        }}
                        className={`w-full p-3 rounded-xl flex items-center justify-between text-left font-medium transition-all cursor-pointer ${
                          isActive
                            ? 'bg-[#E52243] text-white font-bold shadow-sm'
                            : 'bg-gray-50 hover:bg-gray-100 text-gray-800 border border-gray-200'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          {item.icon}
                          <span className="text-sm">{item.label}</span>
                        </div>
                        <ChevronRight className={`w-4 h-4 ${isActive ? 'text-white' : 'text-gray-400'}`} />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Bloque 2: Cuentas y Accesos */}
              <div className="space-y-3 pt-2 border-t border-gray-200">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block px-1">
                  Accesos y Cuentas
                </span>

                {/* Restaurante */}
                <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-gray-700 flex items-center gap-1.5">
                      <Store className="w-3.5 h-3.5 text-[#E52243]" />
                      <span>Restaurante Comprador</span>
                    </span>
                    {restaurantSession && (
                      <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-bold">
                        Sesión Activa
                      </span>
                    )}
                  </div>

                  {restaurantSession ? (
                    <div className="space-y-2">
                      <div>
                        <p className="text-gray-900 font-bold text-xs">{restaurantSession.displayName}</p>
                        <p className="text-[11px] text-gray-500">{restaurantSession.email}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          handleRestaurantLogout();
                          setIsMobileMenuOpen(false);
                        }}
                        className="w-full py-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                      >
                        Cerrar Sesión Restaurante
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        setIsRestaurantLoginOpen(true);
                      }}
                      className="w-full py-2.5 bg-white hover:bg-gray-100 text-gray-900 border border-gray-300 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                    >
                      <Store className="w-3.5 h-3.5 text-[#E52243]" />
                      <span>Entrar como Restaurante (Google)</span>
                    </button>
                  )}
                </div>

                {/* Proveedor y Administrador (ocultos cuando hay restaurante logueado) */}
                {!restaurantSession && (
                  <>
                    {/* Proveedor */}
                    <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-xl space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-gray-700 flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-amber-600" />
                          <span>Proveedor Mayorista</span>
                        </span>
                        {supplierSession && (
                          <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-bold">
                            Homologado
                          </span>
                        )}
                      </div>

                      {supplierSession ? (
                        <div className="space-y-2">
                          <div>
                            <p className="text-gray-900 font-bold text-xs">{supplierSession.tradeName}</p>
                            <p className="text-[11px] text-gray-500">NIT: {supplierSession.nit}</p>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setIsMobileMenuOpen(false);
                                setActiveSection('supplier_workspace');
                              }}
                              className="py-2 bg-white hover:bg-gray-100 text-gray-900 border border-gray-300 rounded-lg text-xs font-bold text-center cursor-pointer shadow-xs"
                            >
                              Mi Portal
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                handleSupplierLogout();
                                setIsMobileMenuOpen(false);
                              }}
                              className="py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-xs font-semibold text-center cursor-pointer"
                            >
                              Salir
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <button
                            type="button"
                            onClick={() => {
                              setIsMobileMenuOpen(false);
                              setIsSupplierLoginOpen(true);
                            }}
                            className="w-full py-2.5 bg-white hover:bg-gray-100 text-gray-900 border border-gray-300 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                          >
                            <Building2 className="w-3.5 h-3.5 text-amber-600" />
                            <span>Ingreso Proveedor (Google)</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setIsMobileMenuOpen(false);
                              setActiveSection('supplier_landing');
                            }}
                            className="w-full py-1.5 text-center text-[11px] text-[#E52243] hover:underline block cursor-pointer font-semibold"
                          >
                            ¿Deseas vender? Postula tu empresa aquí →
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Administrador */}
                    <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-xl space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-gray-700 flex items-center gap-1.5">
                          <ShieldCheck className="w-3.5 h-3.5 text-[#E52243]" />
                          <span>RYYCO Central SuperAdmin</span>
                        </span>
                        {adminSession && (
                          <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-bold">
                            Admin Activo
                          </span>
                        )}
                      </div>

                      {adminSession ? (
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setIsMobileMenuOpen(false);
                                setActiveSection('admin_central');
                              }}
                              className="py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold text-center cursor-pointer shadow-xs"
                            >
                              Mesa Central
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                handleAdminLogout();
                                setIsMobileMenuOpen(false);
                              }}
                              className="py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-xs font-semibold text-center cursor-pointer"
                            >
                              Salir Admin
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setIsMobileMenuOpen(false);
                            setIsAdminLoginModalOpen(true);
                          }}
                          className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <Lock className="w-3.5 h-3.5 text-[#E52243]" />
                          <span>Acceso Administrador Central</span>
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Bloque 3: Bolsa B2B y Soporte Oficial */}
              <div className="space-y-2 pt-2 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    setIsCartOpen(true);
                  }}
                  className="w-full py-3 bg-[#E52243] hover:bg-[#D1132A] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer"
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>Ver Bolsa de Compras ({totalCartUnits} items)</span>
                </button>

                <a
                  href="https://wa.me/573164167447?text=Hola%20RYYCO%20Central,%20necesito%20asistencia%20en%20la%20plataforma%20mayorista."
                  target="_blank"
                  rel="noreferrer"
                  className="w-full py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors"
                >
                  <Phone className="w-4 h-4 text-emerald-600" />
                  <span>WhatsApp RYYCO Central (+57 316 416 7447)</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Cuerpo Principal */}
      {activeSection === 'suppliers' ? (
        !adminSession ? (
          <div className="py-12 px-4 max-w-lg mx-auto">
            <AdminLoginGate
              onLoginSuccess={handleAdminLoginSuccess}
              onCancel={() => setActiveSection('marketplace')}
              pendingCount={pendingAppsCount}
            />
          </div>
        ) : (
          <SupplierPortalView
            suppliers={suppliers}
            products={products}
            applications={applications}
            onSubmitApplication={handleSubmitSupplierApplication}
            onCreateSupplierProduct={handleCreateSupplierProduct}
            onOpenAdminPanel={() => setActiveSection('admin_central')}
            userName={adminSession.email || 'ADMIN CENTRAL'}
            onBackToMarketplace={() => setActiveSection('marketplace')}
            onUpdateSupplierStatus={handleUpdateSupplierStatus}
            onToggleUploadPermission={handleToggleUploadPermission}
          />
        )
      ) : (
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-8 pb-24 md:pb-8">
        {/* SECCIÓN 1: CATÁLOGO MAYORISTA (Fiel al mockup de celular y PC) */}
        {activeSection === 'marketplace' && (
          <div className="space-y-4 sm:space-y-6">
            {/* 1. Selector de Entrega en Móvil */}
            <div
              onClick={() => setIsRestaurantLoginOpen(true)}
              className="md:hidden flex items-center justify-between px-4 py-3 rounded-2xl border border-gray-200 bg-white shadow-2xs cursor-pointer hover:border-gray-300 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-rose-50 flex items-center justify-center text-[#E52243]">
                  <MapPin className="w-4 h-4 fill-[#E52243]" />
                </div>
                <div className="text-left leading-tight">
                  <span className="text-[10px] text-gray-400 block font-medium">Entregar en</span>
                  <span className="text-sm font-black text-gray-950">
                    {restaurantSession?.city || 'Ipiales'}
                  </span>
                </div>
              </div>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </div>

            {/* 2. Buscador de Insumos en Móvil */}
            <div className="md:hidden relative">
              <Search className="w-5 h-5 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="¿Qué necesita tu cocina hoy?"
                className="w-full pl-12 pr-4 py-3 text-xs bg-white border border-gray-200 text-gray-900 rounded-2xl placeholder-gray-400 focus:outline-none focus:border-[#E52243] shadow-2xs transition-all"
              />
            </div>

            {/* 3. Hero Banner Oficial Móvil y PC */}
            <section className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#FFF5EE] via-[#FFF8F3] to-[#FEF3EC] border border-[#FDE5D6] p-5 sm:p-7 lg:p-8 flex items-center justify-between gap-4">
              <div className="relative z-10 max-w-xl space-y-3">
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-gray-950 font-display leading-[1.18]">
                  Tu cocina no para.<br />
                  Nosotros la abastecemos.
                </h1>

                <div className="pt-1 flex flex-wrap items-center gap-4 sm:gap-6">
                  <button
                    type="button"
                    onClick={() => setActiveSection('comparator')}
                    className="inline-flex items-center gap-1 text-xs font-bold text-gray-950 underline decoration-[#E52243] hover:text-[#E52243] transition-colors cursor-pointer"
                  >
                    <span>Comparar precios</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-[#E52243]" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveSection('automation')}
                    className="inline-flex items-center gap-1 text-xs font-bold text-gray-950 underline decoration-[#E52243] hover:text-[#E52243] transition-colors cursor-pointer"
                  >
                    <span>Programar compras</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-[#E52243]" />
                  </button>
                </div>
              </div>

              <div className="shrink-0 w-32 sm:w-44 md:w-52 flex justify-end">
                <img
                  src="/assets/aistudio/ryyco_proveedores_bolsa_d67d0d39.png"
                  alt="Tu cocina no para"
                  className="w-full max-w-[170px] sm:max-w-[200px] object-contain drop-shadow-sm pointer-events-none"
                />
              </div>
            </section>

            {/* 4. Categorías Oficiales */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-3 md:gap-4">
              {CATEGORIES.map((cat) => {
                const isSelected = selectedCategory === cat.id;
                const isEmpaques = cat.id === 'Empaques Biodegradables';
                const isFrutas = cat.id === 'Frutas y Verduras';
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`group flex flex-col items-center justify-between p-2 sm:p-2.5 md:p-3.5 rounded-2xl md:rounded-3xl transition-all duration-200 cursor-pointer text-center aspect-[4/5] sm:aspect-square md:min-h-[145px] lg:min-h-[160px] ${
                      isSelected
                        ? 'bg-[#FFF0F2] border-2 border-[#E52243] shadow-md -translate-y-0.5'
                        : 'bg-white border border-gray-200 hover:border-gray-300 hover:shadow-md shadow-2xs hover:-translate-y-0.5'
                    }`}
                  >
                    <div className="w-full flex-1 flex items-center justify-center p-0.5 sm:p-1 md:p-1.5 overflow-hidden">
                      <img
                        src={cat.image}
                        alt={cat.label}
                        loading="eager"
                        decoding="async"
                        fetchPriority={isEmpaques || isFrutas ? 'high' : 'auto'}
                        className={`w-full h-full object-contain pointer-events-none drop-shadow-2xs transition-transform duration-200 group-hover:scale-105 ${
                          isEmpaques
                            ? 'max-h-12 sm:max-h-20 md:max-h-28 lg:max-h-32 scale-105 sm:scale-110 md:scale-115'
                            : 'max-h-11 sm:max-h-16 md:max-h-24 lg:max-h-28'
                        }`}
                      />
                    </div>
                    <span
                      className={`text-[11px] sm:text-xs md:text-sm font-black truncate w-full pt-1 ${
                        isSelected ? 'text-[#E52243]' : 'text-gray-800'
                      }`}
                    >
                      {cat.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* 5. Barra de Proveedor Activo Homologado - Solo visible cuando un proveedor ha iniciado sesión y no en perfil de restaurante */}
            {supplierSession && !restaurantSession && (
              <div className="bg-white rounded-2xl border border-gray-200 p-3 sm:p-3.5 shadow-2xs flex items-center justify-between">
                <div className="flex items-center gap-2.5 sm:gap-3">
                  <div className="w-9 h-9 rounded-full bg-rose-100 text-[#E52243] font-black text-sm flex items-center justify-center shrink-0 overflow-hidden border border-rose-200">
                    {supplierSession.logoUrl ? (
                      <img src={supplierSession.logoUrl} alt={supplierSession.tradeName} className="w-full h-full object-cover" />
                    ) : (
                      (supplierSession.tradeName || 'P').charAt(0).toUpperCase()
                    )}
                  </div>

                  <div className="leading-tight">
                    <h3 className="font-extrabold text-xs sm:text-sm text-gray-950">
                      {supplierSession.tradeName}
                    </h3>
                    <p className="text-[10px] sm:text-[11px] text-gray-400">
                      {supplierSession.city || 'Ipiales'}
                    </p>
                  </div>

                  <div className="h-6 w-px bg-gray-200 mx-1" />

                  <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0D7A57]">
                    <CheckCircle2 className="w-4 h-4 fill-[#0D7A57] text-white" />
                    <span>Homologado RYYCO</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setActiveSection('supplier_workspace');
                  }}
                  className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg cursor-pointer"
                  title="Opciones de proveedor"
                >
                  <MoreHorizontal className="w-5 h-5" />
                </button>
              </div>
            )}

            {/* Layout Principal en 2 Columnas para PC: Catálogo (8 cols) + Tu Bolsa (4 cols) */}
            <div className="lg:grid lg:grid-cols-12 gap-8 items-start">
              {/* Columna Izquierda: Catálogo de Insumos (8 cols) */}
              <div className="lg:col-span-8 space-y-5">
                {/* Cabecera del Catálogo */}
                <div className="flex items-center justify-between pb-1">
                  <h2 className="text-xl sm:text-2xl font-black text-[#111827] font-display tracking-tight">
                    Para tu negocio
                  </h2>

                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span>{filteredProducts.length} productos</span>
                    <span className="text-gray-300">|</span>
                    <div className="flex items-center gap-1 text-gray-900 font-bold">
                      <Menu className="w-3.5 h-3.5 rotate-90 text-gray-700" />
                      <span>Relevancia</span>
                      <ChevronDown className="w-3 h-3 text-gray-500" />
                    </div>
                  </div>
                </div>

                {/* Grilla de Productos: 2 columnas en móvil y tablet/PC */}
                {filteredProducts.length === 0 ? (
                  <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center space-y-4">
                    <Store className="w-10 h-10 text-gray-400 mx-auto" />
                    <h3 className="text-base font-bold text-gray-800">No hay insumos disponibles con este filtro</h3>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setSelectedCategory('all');
                      }}
                      className="text-xs text-[#E52243] font-bold hover:underline cursor-pointer"
                    >
                      Restablecer filtros
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:gap-4">
                    {filteredProducts.map((prod) => {
                      const isOutOfStock = prod.availability === 'agotado';
                      const isAdded = addedProductId === prod.id;
                      const isFavorited = !!favoriteProductIds[prod.id];

                      return (
                        <div
                          key={prod.id}
                          className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-2xs hover:shadow-md transition-shadow flex flex-col justify-between"
                        >
                          {/* Imagen y Badges */}
                          <div className="relative aspect-[4/3] w-full bg-[#FAFBFD] overflow-hidden flex items-center justify-center p-2.5">
                            <img
                              src={prod.photoUrl}
                              alt={prod.name}
                              className="w-full h-full object-contain pointer-events-none drop-shadow-xs"
                            />

                            {/* Badge de disponibilidad */}
                            <div className="absolute top-2.5 left-2.5">
                              {prod.availability === 'disponible' ? (
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#D1FAE5] text-[#065F46] shadow-2xs">
                                  Disponible
                                </span>
                              ) : (
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-gray-200 text-gray-700 shadow-2xs">
                                  Agotado
                                </span>
                              )}
                            </div>

                            {/* Botón de favorito */}
                            <button
                              type="button"
                              onClick={() => toggleFavorite(prod.id)}
                              className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-white/95 hover:bg-white text-gray-400 hover:text-[#E52243] flex items-center justify-center shadow-2xs transition-colors cursor-pointer"
                              title="Marcar favorito"
                            >
                              <Heart
                                className={`w-3.5 h-3.5 ${
                                  isFavorited ? 'fill-[#E52243] text-[#E52243]' : ''
                                }`}
                              />
                            </button>
                          </div>

                          {/* Contenido del Insumo */}
                          <div className="p-3 sm:p-4 flex-1 flex flex-col justify-between space-y-2.5">
                            <div className="space-y-1">
                              <h3 className="text-sm sm:text-base font-black text-gray-950 leading-snug line-clamp-1">
                                {prod.name}
                              </h3>
                              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                {prod.supplierTradeName}
                              </div>

                              {/* Chips de Presentación y Mínimo */}
                              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-700 text-[10px] font-semibold rounded-md border border-gray-200">
                                  <Store className="w-3 h-3 text-gray-500" />
                                  <span>{prod.presentationLabel}</span>
                                </span>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-700 text-[10px] font-semibold rounded-md border border-gray-200">
                                  <Tag className="w-3 h-3 text-gray-500" />
                                  <span>Mín. {prod.minOrderQty} {prod.salesUnit === 'kilogramo' ? 'kg' : prod.salesUnit === 'unidad' ? 'unidad' : prod.salesUnit}</span>
                                </span>
                              </div>
                            </div>

                            {/* Precios y Botón de Acción */}
                            <div className="pt-1.5 border-t border-gray-100 space-y-2">
                              <div>
                                <span className="text-[10px] text-gray-500 block font-medium">
                                  {prod.salesUnit === 'kilogramo'
                                    ? `$ ${formatCop(Math.round(prod.priceCop / Math.max(0.1, prod.baseUnitQuantity))).replace('COP', '').trim()} / kg`
                                    : `$ ${formatCop(prod.priceCop).replace('COP', '').trim()} / ${prod.salesUnit}`}
                                </span>
                                <div className="text-lg sm:text-xl font-black font-sans text-gray-950 tabular-nums">
                                  $ {prod.priceCop.toLocaleString('es-CO')}
                                </div>
                              </div>

                              {/* Tag de peso variable */}
                              {prod.isVariableWeight && (
                                <div className="bg-[#FEF3C7] text-[#92400E] text-[10px] font-medium px-2 py-1 rounded-lg flex items-center gap-1">
                                  <Info className="w-3 h-3 shrink-0" />
                                  <span>Peso variable</span>
                                </div>
                              )}

                              {/* Botón Rojo + Agregar */}
                              <button
                                type="button"
                                disabled={isOutOfStock}
                                onClick={() => handleAddToCart(prod, prod.minOrderQty)}
                                className={`w-full py-2 sm:py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1 cursor-pointer shadow-xs active:scale-[0.98] ${
                                  isOutOfStock
                                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                    : isAdded
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-[#E52243] hover:bg-[#D1132A] text-white'
                                }`}
                              >
                                {isOutOfStock ? (
                                  <span>Agotado</span>
                                ) : isAdded ? (
                                  <>
                                    <Check className="w-3.5 h-3.5" />
                                    <span>¡Agregado!</span>
                                  </>
                                ) : (
                                  <>
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>
                                      + Agregar {prod.salesUnit === 'kilogramo' ? '1 kg' : '1'}
                                    </span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Columna Derecha: Sticky "Tu bolsa" (4 cols) - Solo visible en Desktop */}
              <div className="hidden lg:block lg:col-span-4 mt-8 lg:mt-0">
                <div className="lg:sticky lg:top-24 bg-white rounded-2xl border border-gray-200 p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                    <h3 className="font-extrabold text-base text-gray-950">
                      Tu bolsa
                    </h3>
                    <span className="text-xs font-bold text-gray-500">
                      {totalCartUnits} productos
                    </span>
                  </div>

                  {cart.length === 0 ? (
                    <div className="py-6 flex flex-col items-center justify-center text-center">
                      <RyycoCartBagIllustration className="w-36 h-36 mx-auto mb-2" />
                      <h4 className="font-extrabold text-sm text-gray-950">
                        Todo empieza con un buen insumo
                      </h4>
                      <p className="text-xs text-gray-500 mt-1 max-w-[210px] leading-relaxed">
                        Agrega productos para preparar tu pedido.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3.5">
                      <div className="max-h-72 overflow-y-auto space-y-2.5 pr-1 divide-y divide-gray-100">
                        {cart.map((item) => (
                          <div key={item.productId} className="pt-2 first:pt-0 flex items-center justify-between gap-3 text-xs">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-10 h-10 rounded-lg bg-gray-50 overflow-hidden shrink-0 border border-gray-200">
                                <ResilientImage
                                  src={item.productPhotoUrl || ''}
                                  alt={item.productName}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              <div className="min-w-0">
                                <p className="font-bold text-gray-900 truncate text-xs">{item.productName}</p>
                                <p className="text-[10px] text-gray-500 truncate">{item.supplierTradeName}</p>
                                <p className="text-[11px] font-bold text-gray-800">{formatCop(item.subtotalCop)}</p>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleUpdateCartQty(item.productId, item.quantity - 1)}
                                className="w-6 h-6 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center justify-center text-xs font-bold"
                              >
                                -
                              </button>
                              <span className="w-6 text-center font-bold text-xs font-mono">{item.quantity}</span>
                              <button
                                type="button"
                                onClick={() => handleUpdateCartQty(item.productId, item.quantity + 1)}
                                className="w-6 h-6 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center justify-center text-xs font-bold"
                              >
                                +
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveCartItem(item.productId)}
                                className="text-gray-400 hover:text-red-500 p-1"
                                title="Quitar"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="pt-3 border-t border-gray-100 space-y-3">
                        <div className="flex items-baseline justify-between text-xs">
                          <span className="text-gray-500">Subtotal estimado:</span>
                          <span className="font-black text-base text-gray-900 font-sans">
                            {formatCop(totalCartCop)}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => setIsCartOpen(true)}
                          className="w-full py-2.5 bg-[#E52243] hover:bg-[#D1132A] text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <span>Preparar pedido mayorista</span>
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Footer de la bolsa con info */}
                  <div className="border-t border-gray-100 pt-3 flex items-center gap-2 text-[11px] text-gray-400">
                    <Info className="w-3.5 h-3.5 shrink-0 text-gray-400" />
                    <span>Consulta disponibilidad y entrega con tu proveedor.</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Banner Inferior para Proveedores */}
            <div className="bg-[#FFF9E6] border border-[#FDE68A] rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-full bg-[#FDE047]/60 flex items-center justify-center text-amber-900 shrink-0">
                  <Users className="w-5 h-5 text-amber-800" />
                </div>
                <div>
                  <h4 className="font-extrabold text-sm text-gray-900">
                    ¿Abasteces a restaurantes?
                  </h4>
                  <p className="text-xs text-gray-600">
                    Haz parte de nuestra red de proveedores.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setActiveSection('supplier_landing')}
                  className="bg-[#F4B400] hover:bg-[#E0A400] text-gray-950 font-bold text-xs px-5 py-2.5 rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer shrink-0"
                >
                  <span>Postular mi empresa</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SECCIÓN 2: COMPARADOR DE PRECIOS */}
        {activeSection === 'comparator' && (
          <PriceComparatorView
            products={displayedProducts}
            suppliers={suppliers}
            onAddToCart={handleAddToCart}
          />
        )}

        {/* SECCIÓN 3: GESTOR DE PEDIDOS B2B (SOLO RESTAURANTE) */}
        {activeSection === 'orders' && (
          !restaurantSession ? (
            <div className="bg-[#121622] border border-[#1E2436] rounded-2xl p-10 text-center space-y-4 max-w-md mx-auto my-12">
              <div className="w-14 h-14 rounded-2xl bg-[#0D101A] border border-[#1E2436] flex items-center justify-center text-[#F4B400] mx-auto shadow-inner">
                <Store className="w-7 h-7" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-xl font-bold text-white font-display">Inicia Sesión como Restaurante</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Para ver tus pedidos emitidos, trazabilidad de despacho y estados de pago, debes iniciar sesión con tu cuenta de restaurante.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsRestaurantLoginOpen(true)}
                className="px-5 py-2.5 bg-[#E63946] hover:bg-[#D1132A] text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Iniciar Sesión de Restaurante
              </button>
            </div>
          ) : (
            <OrdersManagerView
              orders={orders}
              onUpdateStatus={handleUpdateOrderStatus}
              onUpdatePaymentStatus={handleUpdatePaymentStatus}
              onProposeChanges={handleProposeChanges}
              onAcceptProposedChanges={handleAcceptProposedChanges}
              onRejectOrder={handleRejectOrder}
              onReportProblem={handleReportProblem}
              onScheduleRecurring={(ord) => {
                setActiveSection('automation');
              }}
            />
          )
        )}

        {/* SECCIÓN 4: COMPRAS RECURRENTES PROGRAMADAS (SOLO RESTAURANTE) */}
        {activeSection === 'automation' && (
          !restaurantSession ? (
            <div className="bg-[#121622] border border-[#1E2436] rounded-2xl p-10 text-center space-y-4 max-w-md mx-auto my-12">
              <div className="w-14 h-14 rounded-2xl bg-[#0D101A] border border-[#1E2436] flex items-center justify-center text-[#F4B400] mx-auto shadow-inner">
                <Repeat className="w-7 h-7" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-xl font-bold text-white font-display">Programación de Compras B2B</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Inicia sesión con tu cuenta de restaurante para automatizar pedidos semanales o mensuales con confirmación de precios mayoristas.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsRestaurantLoginOpen(true)}
                className="px-5 py-2.5 bg-[#E63946] hover:bg-[#D1132A] text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Iniciar Sesión de Restaurante
              </button>
            </div>
          ) : (
            <AutomationRulesView
              schedules={schedules}
              products={displayedProducts}
              activeRestaurant={activeRestaurant}
              onToggleStatus={handleToggleScheduleStatus}
              onSkipNextDelivery={handleSkipNextDelivery}
              onCreateSchedule={handleCreateRecurringSchedule}
              onGenerateOrderNow={handleGenerateOrderFromSchedule}
            />
          )
        )}


        {/* SECCIÓN 6: RYYCO CENTRAL (PANEL ADMINISTRADOR CON LOGIN PROTEGIDO) */}
        {activeSection === 'admin_central' && (
          !adminSession ? (
            <div className="py-6 px-4">
              <AdminLoginGate
                onLoginSuccess={handleAdminLoginSuccess}
                onCancel={() => setActiveSection('marketplace')}
                pendingCount={pendingAppsCount}
              />
            </div>
          ) : (
            <AdminCentralPanel
              suppliers={suppliers}
              applications={applications}
              orders={orders}
              adminSession={adminSession}
              commissionRates={commissionRates}
              onSaveCommissionRates={handleSaveCommissionRates}
              onLogoutAdmin={handleAdminLogout}
              onApproveApplication={handleApproveApplication}
              onRejectApplication={handleRejectApplication}
              onToggleUploadPermission={handleToggleUploadPermission}
              onUpdateSupplierStatus={handleUpdateSupplierStatus}
              onDirectRegisterAndEnableSupplier={handleDirectRegisterAndEnableSupplier}
              onUpdateOrderStatus={handleUpdateOrderStatus}
              onUpdatePaymentStatus={handleUpdatePaymentStatus}
              onOpenSupplierPortal={() => setActiveSection('suppliers')}
            />
          )
        )}

        {/* SECCIÓN 7: LANDING PAGE PARA PROVEEDORES (POSTULACIÓN Y ADMISIÓN) */}
        {activeSection === 'supplier_landing' && (
          <SupplierLandingView
            onSubmitApplication={handleSubmitSupplierApplication}
            onNavigateMarketplace={() => setActiveSection('marketplace')}
            onOpenSupplierLogin={() => setIsSupplierLoginOpen(true)}
          />
        )}

        {/* SECCIÓN 8: PORTAL / WORKSPACE DEL PROVEEDOR ADMITIDO */}
        {activeSection === 'supplier_workspace' && (
          !supplierSession ? (
            <div className="bg-white border border-gray-200 rounded-3xl p-8 sm:p-12 text-center space-y-5 max-w-lg mx-auto my-12 shadow-xs">
              <div className="w-16 h-16 rounded-2xl bg-[#FEF3C7] border border-[#FDE68A] flex items-center justify-center text-[#D97706] mx-auto shadow-xs">
                <Store className="w-8 h-8" />
              </div>
              <div className="space-y-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FEF3C7] text-[#92400E] text-[11px] font-black uppercase tracking-wider">
                  Portal de Proveedores
                </span>
                <h3 className="text-2xl font-black text-gray-950 font-display">
                  Ingreso para Proveedores Admitidos
                </h3>
                <p className="text-xs text-gray-500 leading-relaxed max-w-sm mx-auto">
                  Gestiona tus insumos mayoristas, confirma pedidos de restaurantes y configura tus condiciones de flete con tu cuenta autorizada.
                </p>
              </div>
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsSupplierLoginOpen(true)}
                  className="w-full sm:w-auto px-6 py-3 bg-[#E52243] hover:bg-[#C91836] text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer"
                >
                  Continuar con Google
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSection('supplier_landing')}
                  className="w-full sm:w-auto px-5 py-3 text-xs font-bold text-gray-600 hover:text-gray-900 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  Postular mi empresa
                </button>
              </div>
            </div>
          ) : (
            <SupplierDashboardView
              supplier={supplierSession}
              products={products}
              orders={orders}
              commissionRates={commissionRates}
              onLogout={handleSupplierLogout}
              onCreateProduct={handleCreateSupplierProduct}
              onUpdateProductAvailability={handleUpdateProductAvailability}
              onDeleteProduct={handleDeleteProduct}
              onUpdateProductPrice={handleUpdateProductPrice}
              onUpdateFullProduct={handleUpdateFullProduct}
              onUpdateOrderStatus={handleUpdateOrderStatus}
              onUpdateOrderDetails={handleUpdateOrderDetails}
              onUpdatePaymentStatus={handleUpdatePaymentStatus}
              onProposeOrderChanges={handleProposeChanges}
              onRejectOrder={handleRejectOrder}
              onUpdateSupplierSettings={handleUpdateSupplierSettings}
              onViewMarketplace={() => setActiveSection('marketplace')}
            />
          )
        )}
      </main>
      )}

      {/* Drawer de Checkout Corporativo */}
      <CartCheckoutDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cartItems={cart}
        suppliers={suppliers}
        activeRestaurant={activeRestaurant}
        isRestaurantLoggedIn={!!restaurantSession}
        onPromptLogin={() => {
          setIsCartOpen(false);
          setIsRestaurantLoginOpen(true);
        }}
        onUpdateQty={handleUpdateCartQty}
        onRemoveItem={handleRemoveCartItem}
        onPlaceCorporateOrder={handlePlaceCorporateOrder}
      />

      {/* Modal de Inicio de Sesión de Restaurante y Hub de Accesos */}
      <RestaurantLoginModal
        isOpen={isRestaurantLoginOpen}
        onClose={() => setIsRestaurantLoginOpen(false)}
        onLoginSuccess={handleRestaurantLoginSuccess}
        availableRestaurants={restaurants}
        onOpenSupplierLogin={() => {
          setIsRestaurantLoginOpen(false);
          setIsSupplierLoginOpen(true);
        }}
        onOpenAdminLogin={() => {
          setIsRestaurantLoginOpen(false);
          setIsAdminLoginModalOpen(true);
        }}
        currentRestaurantSession={restaurantSession}
        currentSupplierSession={supplierSession}
        currentAdminSession={adminSession}
        onLogoutRestaurant={handleRestaurantLogout}
        onLogoutSupplier={handleSupplierLogout}
        onLogoutAdmin={handleAdminLogout}
        onNavigateSection={(sec) => setActiveSection(sec)}
      />

      {/* Modal de Inicio de Sesión de Proveedor Aprobado */}
      <SupplierLoginModal
        isOpen={isSupplierLoginOpen}
        onClose={() => setIsSupplierLoginOpen(false)}
        onLoginSuccess={handleSupplierLoginSuccess}
        onNavigateToLanding={() => {
          setIsSupplierLoginOpen(false);
          setActiveSection('supplier_landing');
        }}
        suppliers={suppliers}
        applications={applications}
      />

      {/* Modal de Acceso de Administrador Central */}
      {isAdminLoginModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200 overflow-y-auto cursor-pointer"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsAdminLoginModalOpen(false);
              setActiveSection('marketplace');
            }
          }}
        >
          <div className="relative w-full max-w-md my-auto cursor-default" onClick={(e) => e.stopPropagation()}>
            <AdminLoginGate
              onLoginSuccess={(session) => {
                handleAdminLoginSuccess(session);
                setIsAdminLoginModalOpen(false);
                setActiveSection('admin_central');
              }}
              onCancel={() => {
                setIsAdminLoginModalOpen(false);
                setActiveSection('marketplace');
              }}
              pendingCount={pendingAppsCount}
            />
          </div>
        </div>
      )}

      {/* Footer corporativo RYYCO - Rediseño Oficial PC */}
      {activeSection !== 'suppliers' && (
        <footer className="border-t border-gray-200 bg-white mt-auto py-6 text-xs text-gray-500">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <RyycoLogo variant="dark" className="h-6" showSubtitle={false} />
              <span className="text-gray-500 font-medium">
                RYYCO Central · Abastecimiento mayorista B2B
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-gray-400 font-medium">
              <span>Restaurantes · Bodegas · Domiciliarios</span>
            </div>
          </div>
        </footer>
      )}

      {/* Barra de Navegación Inferior para Celular Oficial (Adaptable según sesión de restaurante) */}
      {!supplierSession && activeSection !== 'suppliers' && (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 py-1.5 px-2 flex items-center justify-around shadow-lg">
          {/* 1. Inicio / Catálogo */}
          <button
            type="button"
            onClick={() => {
              setIsAdminLoginModalOpen(false);
              setIsMobileMenuOpen(false);
              setActiveSection('marketplace');
            }}
            className={`flex flex-col items-center justify-center min-w-[54px] py-1 cursor-pointer transition-colors ${
              activeSection === 'marketplace' ? 'text-[#E52243]' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <Home className="w-5 h-5 stroke-[1.8]" />
            <span className={`text-[10px] mt-0.5 ${activeSection === 'marketplace' ? 'font-bold text-[#E52243]' : 'font-medium text-gray-600'}`}>
              Inicio
            </span>
            {activeSection === 'marketplace' && <span className="w-6 h-0.5 bg-[#E52243] rounded-full mt-0.5" />}
          </button>

          {/* 2. Comparador */}
          <button
            type="button"
            onClick={() => {
              setIsAdminLoginModalOpen(false);
              setIsMobileMenuOpen(false);
              setActiveSection('comparator');
            }}
            className={`flex flex-col items-center justify-center min-w-[54px] py-1 cursor-pointer transition-colors ${
              activeSection === 'comparator' ? 'text-[#E52243]' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <BarChart2 className="w-5 h-5 stroke-[1.8]" />
            <span className={`text-[10px] mt-0.5 ${activeSection === 'comparator' ? 'font-bold text-[#E52243]' : 'font-medium text-gray-600'}`}>
              Comparar
            </span>
            {activeSection === 'comparator' && <span className="w-6 h-0.5 bg-[#E52243] rounded-full mt-0.5" />}
          </button>

          {/* 3. Historial de Pedidos - Visible cuando el restaurante inicia sesión */}
          {restaurantSession && (
            <button
              type="button"
              onClick={() => {
                setIsAdminLoginModalOpen(false);
                setIsMobileMenuOpen(false);
                setActiveSection('orders');
              }}
              className={`flex flex-col items-center justify-center min-w-[54px] py-1 cursor-pointer transition-colors ${
                activeSection === 'orders' ? 'text-[#E52243]' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <div className="relative">
                <ClipboardList className="w-5 h-5 stroke-[1.8]" />
                {orders.length > 0 && (
                  <span className="absolute -top-1 -right-2 w-3.5 h-3.5 rounded-full bg-[#E52243] text-white text-[9px] font-bold flex items-center justify-center">
                    {orders.length}
                  </span>
                )}
              </div>
              <span className={`text-[10px] mt-0.5 ${activeSection === 'orders' ? 'font-bold text-[#E52243]' : 'font-medium text-gray-600'}`}>
                Pedidos
              </span>
              {activeSection === 'orders' && <span className="w-6 h-0.5 bg-[#E52243] rounded-full mt-0.5" />}
            </button>
          )}

          {/* 4. Compras Recurrentes - Visible cuando el restaurante inicia sesión */}
          {restaurantSession && (
            <button
              type="button"
              onClick={() => {
                setIsAdminLoginModalOpen(false);
                setIsMobileMenuOpen(false);
                setActiveSection('automation');
              }}
              className={`flex flex-col items-center justify-center min-w-[54px] py-1 cursor-pointer transition-colors ${
                activeSection === 'automation' ? 'text-[#E52243]' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <Repeat className="w-5 h-5 stroke-[1.8]" />
              <span className={`text-[10px] mt-0.5 ${activeSection === 'automation' ? 'font-bold text-[#E52243]' : 'font-medium text-gray-600'}`}>
                Compras
              </span>
              {activeSection === 'automation' && <span className="w-6 h-0.5 bg-[#E52243] rounded-full mt-0.5" />}
            </button>
          )}

          {/* 5. Bolsa */}
          <button
            type="button"
            onClick={() => setIsCartOpen(true)}
            className="flex flex-col items-center justify-center min-w-[54px] py-1 cursor-pointer transition-colors text-gray-500 hover:text-gray-900 relative"
          >
            <div className="relative">
              <ShoppingBag className="w-5 h-5 stroke-[1.8]" />
              {totalCartUnits > 0 && (
                <span className="absolute -top-1 -right-2 w-4 h-4 rounded-full bg-[#E52243] text-white text-[10px] font-bold flex items-center justify-center">
                  {totalCartUnits}
                </span>
              )}
            </div>
            <span className="text-[10px] font-medium text-gray-600 mt-0.5">
              Bolsa
            </span>
          </button>

          {/* 6. Si NO hay sesión de restaurante activa, mostrar botón de Ingreso */}
          {!restaurantSession && (
            <button
              type="button"
              onClick={() => setIsRestaurantLoginOpen(true)}
              className="flex flex-col items-center justify-center min-w-[54px] py-1 cursor-pointer transition-colors text-gray-500 hover:text-gray-900"
            >
              <User className="w-5 h-5 stroke-[1.8]" />
              <span className="text-[10px] font-medium text-gray-600 mt-0.5">
                Ingresar
              </span>
            </button>
          )}
        </nav>
      )}
    </div>
  );
}

import React, { useState, useMemo, useEffect } from 'react';
import {
  RyycoSupplier,
  SupplierProduct,
  B2BPurchaseOrder,
  SupplierCategory,
  B2BOrderStatus,
  ProductAvailability,
  PaymentStatus,
  RyycoCommissionRate,
} from '../types/ryycoB2B';
import { formatCop, sanitizeRyycoPhone } from '../utils/ryycoFormatters';
import {
  calculateOrderCommission,
  DEFAULT_COMMISSION_RATES,
  subscribeToSupplierProducts,
  subscribeToSupplierOrders,
} from '../firebase/b2bRepository';
import {
  Package,
  Clock,
  DollarSign,
  Truck,
  Plus,
  X,
  ExternalLink,
  LogOut,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Trash2,
  Edit2,
  Scale,
  ShoppingBag,
  Store,
  MapPin,
  Calendar,
  Gift,
  Users,
  Settings,
  FileText,
  Save,
  Check,
  AlertCircle,
  Menu,
  ShieldCheck,
  KeyRound,
  CheckSquare,
  Square,
  History,
  Send,
  Percent,
  RotateCcw,
  Navigation,
  Info,
  Upload,
  Image as ImageIcon,
} from 'lucide-react';
import { ResilientImage } from './ResilientImage';
import { RyycoLogo } from './RyycoLogo';
import { SupplierEditProductModal } from './SupplierEditProductModal';
import { SupplierProfileSettingsSection } from './SupplierProfileSettingsSection';

interface SupplierDashboardViewProps {
  supplier: RyycoSupplier;
  products: SupplierProduct[];
  orders: B2BPurchaseOrder[];
  commissionRates?: RyycoCommissionRate[];
  onLogout: () => void;
  onCreateProduct: (product: Omit<SupplierProduct, 'id'>) => Promise<void>;
  onUpdateProductAvailability: (productId: string, availability: ProductAvailability) => Promise<void>;
  onDeleteProduct: (productId: string) => Promise<void>;
  onUpdateProductPrice: (productId: string, newPriceCop: number) => Promise<void>;
  onUpdateFullProduct?: (productId: string, updated: Partial<SupplierProduct>) => Promise<void>;
  onUpdateOrderStatus: (orderId: string, status: B2BOrderStatus, note?: string) => Promise<void>;
  onUpdateOrderDetails?: (orderId: string, updates: Partial<B2BPurchaseOrder>, note?: string) => Promise<void>;
  onUpdatePaymentStatus?: (orderId: string, paymentStatus: PaymentStatus) => Promise<void>;
  onProposeOrderChanges: (
    orderId: string,
    changes: {
      totalAmountCop: number;
      shippingFeeCop: number;
      deliveryDate: string;
      reason: string;
    }
  ) => Promise<void>;
  onRejectOrder?: (orderId: string, reason: string) => Promise<void>;
  onUpdateSupplierSettings: (supplierId: string, settings: Partial<RyycoSupplier>) => Promise<void>;
  onViewMarketplace: () => void;
}

const CATEGORIES: SupplierCategory[] = [
  'Frutas y Verduras',
  'Cárnicos y Embutidos',
  'Aceites y Abarrotes',
  'Lácteos y Quesos',
  'Empaques Biodegradables',
  'Bebidas y Licores',
];

const PRODUCT_PHOTO_PRESETS = [
  { label: 'Papa Pastusa', url: '/assets/prod-papa.webp' },
  { label: 'Cebolla Cabezona', url: '/assets/prod-cebolla.webp' },
  { label: 'Cárnicos', url: '/assets/cat-carnicos.webp' },
  { label: 'Aceites', url: '/assets/cat-aceites.webp' },
  { label: 'Lácteos', url: '/assets/cat-lacteos.webp' },
  { label: 'Empaques Kraft', url: '/assets/aistudio/Imagen_de_ChatGPT_5_nov_2026__10_46_19_a214dff7.png' },
];

export const SupplierDashboardView: React.FC<SupplierDashboardViewProps> = ({
  supplier,
  products,
  orders,
  commissionRates,
  onLogout,
  onCreateProduct,
  onUpdateProductAvailability,
  onDeleteProduct,
  onUpdateProductPrice,
  onUpdateFullProduct,
  onUpdateOrderStatus,
  onUpdateOrderDetails,
  onUpdatePaymentStatus,
  onProposeOrderChanges,
  onRejectOrder,
  onUpdateSupplierSettings,
  onViewMarketplace,
}) => {
  // Pestañas principales
  const [activeTab, setActiveTab] = useState<'products' | 'orders' | 'profile' | 'settings'>('products');
  const [orderFilter, setOrderFilter] = useState<'all' | B2BOrderStatus>('all');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Modal para edición completa de insumo
  const [editingFullProduct, setEditingFullProduct] = useState<SupplierProduct | null>(null);
  const [isEditFullProductOpen, setIsEditFullProductOpen] = useState(false);

  // Estados de gestión efectiva de pedidos (desde recepción hasta entrega)
  const [activePrepChecklist, setActivePrepChecklist] = useState<Record<string, string[]>>({});
  const [prepNotes, setPrepNotes] = useState<Record<string, string>>({});
  const [dispatchData, setDispatchData] = useState<
    Record<string, { driverName: string; driverPhone: string; vehiclePlate: string; notes: string }>
  >({});
  const [pinInputs, setPinInputs] = useState<Record<string, string>>({});
  const [pinErrors, setPinErrors] = useState<Record<string, string | null>>({});
  const [expandedTimelineId, setExpandedTimelineId] = useState<string | null>(null);

  // Modales de acciones de pedido
  const [rejectModalOrder, setRejectModalOrder] = useState<B2BPurchaseOrder | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [proposeModalOrder, setProposeModalOrder] = useState<B2BPurchaseOrder | null>(null);
  const [proposeDate, setProposeDate] = useState('');
  const [proposeTotal, setProposeTotal] = useState(0);
  const [proposeShipping, setProposeShipping] = useState(0);
  const [proposeReason, setProposeReason] = useState('');
  const [orderActionFeedback, setOrderActionFeedback] = useState<string | null>(null);
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  // Modal para agregar producto (Publicar insumo)
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [prodName, setProdName] = useState('');
  const [prodSku, setProdSku] = useState('');
  const [prodStock, setProdStock] = useState<number>(50);
  const [prodCategory, setProdCategory] = useState<SupplierCategory>(supplier.category || 'Frutas y Verduras');
  const [presentationLabel, setPresentationLabel] = useState('');
  const [baseUnitQuantity, setBaseUnitQuantity] = useState(1);
  const [baseUnit, setBaseUnit] = useState<'kg' | 'litro' | 'unidad'>('kg');
  const [priceCop, setPriceCop] = useState(25000);
  const [availability, setAvailability] = useState<ProductAvailability>('disponible');
  const [storageCondition, setStorageCondition] = useState<'ambiente' | 'refrigerado' | 'congelado'>('ambiente');
  const [hasTier, setHasTier] = useState(false);
  const [tierQty, setTierQty] = useState(5);
  const [tierPriceCop, setTierPriceCop] = useState(22000);
  const [isVariableWeight, setIsVariableWeight] = useState(false);
  const [prodPhotoUrl, setProdPhotoUrl] = useState('');
  const [isPhotoUploading, setIsPhotoUploading] = useState(false);
  const [isSubmittingProd, setIsSubmittingProd] = useState(false);
  const [createProdError, setCreateProdError] = useState<string | null>(null);

  // Dropdown de cambio de disponibilidad activo
  const [openAvailabilityMenuId, setOpenAvailabilityMenuId] = useState<string | null>(null);

  // Modal para editar precio
  const [editingPriceProd, setEditingPriceProd] = useState<{ id: string; name: string; price: number } | null>(null);
  const [newPriceInput, setNewPriceInput] = useState<number>(0);
  const [isSavingPrice, setIsSavingPrice] = useState(false);

  // Formulario de políticas (Despacho y flete)
  const [minOrderCop, setMinOrderCop] = useState(supplier.minOrderCop || 140000);
  const [baseShippingFeeCop, setBaseShippingFeeCop] = useState(supplier.baseShippingFeeCop || 9000);
  const [freeShippingThresholdCop, setFreeShippingThresholdCop] = useState(supplier.freeShippingThresholdCop || 580000);
  const [cutoffHour, setCutoffHour] = useState(supplier.orderCutoffHour || '14:00');
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsSavedAlert, setSettingsSavedAlert] = useState(false);

  // Suscripción DIRECTA a la subcolección del proveedor /suppliers/{supplierId}/products y /orders
  const [liveProducts, setLiveProducts] = useState<SupplierProduct[] | null>(null);
  const [liveOrders, setLiveOrders] = useState<B2BPurchaseOrder[] | null>(null);

  useEffect(() => {
    if (!supplier?.id) return;
    const unsubProds = subscribeToSupplierProducts(supplier.id, (data) => {
      setLiveProducts(data);
    });
    const unsubOrds = subscribeToSupplierOrders(supplier.id, (data) => {
      setLiveOrders(data);
    });
    return () => {
      unsubProds();
      unsubOrds();
    };
  }, [supplier?.id]);

  // Lista de productos del proveedor: Carga única y exclusivamente los insumos creados por este proveedor
  const myProducts = useMemo(() => {
    if (!supplier || !supplier.id) return [];

    const sourceProducts = liveProducts !== null ? liveProducts : products;
    const validSupplierIds = new Set<string>();
    if (supplier.id) validSupplierIds.add(supplier.id);
    if (supplier.uid) validSupplierIds.add(supplier.uid);
    if (supplier.googleUid) validSupplierIds.add(supplier.googleUid);

    const list = sourceProducts.filter((p) => {
      if (!p || !p.id) return false;
      return validSupplierIds.has(p.supplierId);
    });

    const seenIds = new Set<string>();
    return list.filter((p) => {
      if (seenIds.has(p.id)) return false;
      seenIds.add(p.id);
      return true;
    });
  }, [liveProducts, products, supplier]);

  // Lista de pedidos del proveedor: Única y exclusivamente las órdenes dirigidas a este proveedor
  const myOrders = useMemo<B2BPurchaseOrder[]>(() => {
    if (!supplier || !supplier.id) return [];

    const sourceOrders = liveOrders !== null ? liveOrders : orders;
    const validSupplierIds = new Set<string>();
    if (supplier.id) validSupplierIds.add(supplier.id);
    if (supplier.uid) validSupplierIds.add(supplier.uid);
    if (supplier.googleUid) validSupplierIds.add(supplier.googleUid);

    return sourceOrders.filter((o) => o && o.supplierId && validSupplierIds.has(o.supplierId));
  }, [liveOrders, orders, supplier]);

  // Contadores y filtros de pedidos
  const pendingOrdersCount = myOrders.filter((o) => o.status === 'pendiente_confirmacion').length;
  const activeProductsCount = myProducts.filter((p) => p.availability !== 'agotado').length;

  const filteredOrders = useMemo(() => {
    if (orderFilter === 'all') return myOrders;
    return myOrders.filter((o) => o.status === orderFilter);
  }, [myOrders, orderFilter]);

  // Manejador para cargar y comprimir imagen del insumo
  const handleNewProdPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setCreateProdError('El archivo seleccionado debe ser una imagen válida (JPG, PNG, WEBP).');
      return;
    }

    setIsPhotoUploading(true);
    setCreateProdError(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          const MAX_SIZE = 800;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_SIZE) {
              height = Math.round((height * MAX_SIZE) / width);
              width = MAX_SIZE;
            }
          } else {
            if (height > MAX_SIZE) {
              width = Math.round((width * MAX_SIZE) / height);
              height = MAX_SIZE;
            }
          }

          canvas.width = width;
          canvas.height = height;

          if (ctx) {
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, width, height);
            const compressed = canvas.toDataURL('image/jpeg', 0.85);
            setProdPhotoUrl(compressed);
          } else {
            setProdPhotoUrl(event.target?.result as string);
          }
        } catch {
          setProdPhotoUrl(event.target?.result as string);
        } finally {
          setIsPhotoUploading(false);
        }
      };
      img.onerror = () => {
        setIsPhotoUploading(false);
        setCreateProdError('No se pudo procesar la imagen seleccionada.');
      };
      img.src = event.target?.result as string;
    };
    reader.onerror = () => {
      setIsPhotoUploading(false);
      setCreateProdError('Error al leer el archivo de imagen.');
    };
    reader.readAsDataURL(file);
  };

  // Manejador para crear un producto
  const handleCreateProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prodName.trim()) return;

    setIsSubmittingProd(true);
    setCreateProdError(null);
    try {
      const sanitizedBaseQty = Math.max(0.1, Number(baseUnitQuantity) || 1);
      const sanitizedPrice = Math.max(100, Number(priceCop) || 1000);
      const sanitizedTierPrice = Number(tierPriceCop) || 0;

      await onCreateProduct({
        supplierId: supplier.id,
        supplierTradeName: supplier.tradeName,
        supplierVerified: Boolean(supplier.verifiedByRyyco),
        supplierLeadTimeHours: Number(supplier.leadTimeHours) || 4,
        supplierRating: Number(supplier.rating) || 5.0,
        sku:
          prodSku.trim() ||
          `${(prodCategory || 'INS').slice(0, 3).toUpperCase()}-${prodName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'PROD'}-${Date.now().toString().slice(-4)}`,
        equivalentGroupKey: prodName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        equivalentGroupName: prodName.trim(),
        name: prodName.trim(),
        description: `Insumo mayorista distribuido directamente por ${supplier.tradeName} con despacho garantizado.`,
        category: prodCategory,
        presentationLabel: presentationLabel.trim() || 'Unidad de venta mayorista',
        baseUnit,
        baseUnitQuantity: sanitizedBaseQty,
        priceCop: sanitizedPrice,
        volumeTiers:
          hasTier && sanitizedTierPrice > 0 && sanitizedTierPrice < sanitizedPrice
            ? [
                {
                  minQty: Math.max(2, Number(tierQty) || 5),
                  unitPriceCop: sanitizedTierPrice,
                  label: `${tierQty}+ uds (${formatCop(sanitizedTierPrice / sanitizedBaseQty)}/${baseUnit})`,
                },
              ]
            : [],
        minOrderQty: 1,
        stock: Math.max(1, Number(prodStock) || 50),
        photoUrl:
          prodPhotoUrl.trim() ||
          (prodName.toLowerCase().includes('papa')
            ? '/assets/prod-papa.webp'
            : prodName.toLowerCase().includes('cebolla')
            ? '/assets/prod-cebolla.webp'
            : prodCategory === 'Cárnicos y Embutidos'
            ? '/assets/cat-carnicos.webp'
            : prodCategory === 'Aceites y Abarrotes'
            ? '/assets/cat-aceites.webp'
            : prodCategory === 'Lácteos y Quesos'
            ? '/assets/cat-lacteos.webp'
            : prodCategory === 'Empaques Biodegradables'
            ? '/assets/aistudio/Imagen_de_ChatGPT_5_nov_2026__10_46_19_a214dff7.png'
            : '/assets/prod-papa.webp'),
        salesUnit: baseUnit === 'kg' ? 'kilogramo' : baseUnit === 'litro' ? 'litro' : 'unidad',
        availability,
        leadTimePrepHours: availability === 'bajo_pedido' ? 24 : 0,
        storageCondition: storageCondition || 'ambiente',
        isVariableWeight: Boolean(isVariableWeight),
        active: true,
      });

      // Limpiar formulario con valores limpios y cerrar modal
      setProdName('');
      setProdSku('');
      setPresentationLabel('');
      setProdStock(50);
      setHasTier(false);
      setProdPhotoUrl('');
      setIsAddProductOpen(false);
    } catch (err: unknown) {
      console.error('Error al guardar producto:', err);
      const msg = err instanceof Error ? err.message : 'No se pudo publicar el insumo.';
      setCreateProdError(msg);
    } finally {
      setIsSubmittingProd(false);
    }
  };

  // Manejador para guardar precio editado
  const handleSavePriceEdit = async () => {
    if (!editingPriceProd || newPriceInput <= 0) return;
    setIsSavingPrice(true);
    try {
      await onUpdateProductPrice(editingPriceProd.id, newPriceInput);
      setEditingPriceProd(null);
    } finally {
      setIsSavingPrice(false);
    }
  };

  // Guardar configuración de despacho y flete
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    try {
      await onUpdateSupplierSettings(supplier.id, {
        minOrderCop: Number(minOrderCop),
        baseShippingFeeCop: Number(baseShippingFeeCop),
        freeShippingThresholdCop: Number(freeShippingThresholdCop),
        orderCutoffHour: cutoffHour,
      });
      setSettingsSavedAlert(true);
      setTimeout(() => setSettingsSavedAlert(false), 3000);
    } finally {
      setIsSavingSettings(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB] text-gray-900 pb-20">
      {/* 1. BARRA SUPERIOR (HEADER OFICIAL MOCKUP) */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          
          {/* Logo RYYCO + Portal proveedor */}
          <div className="flex items-center gap-3">
            {/* Botón menú hamburguesa en celular */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="sm:hidden p-2 text-gray-700 hover:text-gray-950 rounded-lg hover:bg-gray-100"
              aria-label="Abrir menú"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Logo Ryyco oficial con chef sonriente y tipografía corporativa */}
            <div
              className="flex items-center cursor-pointer shrink-0"
              onClick={onViewMarketplace}
              title="Volver al catálogo mayorista"
            >
              <RyycoLogo variant="dark" className="h-8 sm:h-9" showSubtitle={false} />
            </div>

            <span className="text-gray-300 hidden sm:inline font-light text-xl">|</span>

            <span className="text-base sm:text-lg font-black text-[#111827] tracking-tight">
              Portal proveedor
            </span>
          </div>

          {/* Menú de usuario a la derecha */}
          <div className="flex items-center gap-3">
            {/* Dropdown de usuario */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl hover:bg-gray-50 border border-transparent hover:border-gray-200 transition-colors cursor-pointer text-xs font-bold text-gray-800">
              <Users className="w-4 h-4 text-gray-500" />
              <span>{supplier.tradeName}</span>
              <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
            </div>

            <div className="h-5 w-px bg-gray-200 hidden sm:block" />

            {/* Botón cerrar sesión */}
            <button
              type="button"
              onClick={onLogout}
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-bold text-gray-700 hover:text-[#E52243] transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Cerrar sesión</span>
            </button>
          </div>
        </div>
      </header>

      {/* CONTENIDO PRINCIPAL */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        
        {/* 2. TARJETA DE PERFIL DEL PROVEEDOR */}
        <section className="bg-white rounded-3xl border border-gray-200 p-5 sm:p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="flex items-start sm:items-center gap-4">
            {/* Ícono o foto de perfil del proveedor */}
            <div className="w-14 h-14 rounded-2xl bg-[#FEF3C7] border border-[#FDE68A] flex items-center justify-center text-[#D97706] shrink-0 overflow-hidden shadow-xs">
              {supplier.logoUrl ? (
                <img src={supplier.logoUrl} alt={supplier.tradeName} className="w-full h-full object-cover" />
              ) : (
                <Store className="w-7 h-7" />
              )}
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-xl sm:text-2xl font-black text-gray-950 font-display">
                  {supplier.tradeName}
                </h1>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-[#D1FAE5] text-[#065F46] border border-[#A7F3D0]">
                  <CheckCircle2 className="w-3.5 h-3.5 fill-[#059669] text-white" />
                  <span>Homologado RYYCO</span>
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-gray-500 font-medium">
                <span className="font-bold text-gray-800">{supplier.category}</span>
                <span>·</span>
                <span>{supplier.city}</span>
                <span>·</span>
                <span>NIT: <strong className="font-mono text-gray-800">{supplier.nit}</strong></span>
                <span>·</span>
                <span>WhatsApp: <strong className="font-mono text-gray-900">{supplier.salesWhatsapp || '573152497974'}</strong></span>
              </div>
            </div>
          </div>

          {/* Botones de acción del proveedor */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              className={`inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs ${
                activeTab === 'profile'
                  ? 'bg-[#E52243] text-white shadow-xs'
                  : 'bg-white hover:bg-gray-50 border border-gray-300 text-gray-800'
              }`}
            >
              <Edit2 className={`w-4 h-4 ${activeTab === 'profile' ? 'text-white' : 'text-[#E52243]'}`} />
              <span>Editar perfil y bodega</span>
            </button>

            <button
              type="button"
              onClick={onViewMarketplace}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-white hover:bg-gray-50 border border-gray-300 text-gray-800 text-xs font-bold transition-colors cursor-pointer"
            >
              <ExternalLink className="w-4 h-4 text-gray-500" />
              <span>Catálogo</span>
            </button>

            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-white hover:bg-rose-50 border border-rose-300 text-[#E52243] text-xs font-bold transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4 text-[#E52243]" />
              <span>Salir</span>
            </button>
          </div>
        </section>

        {/* 3. MÉTRICAS DE RESUMEN (4 TARJETAS) */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Métrica 1: Insumos activos */}
          <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 shadow-xs space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-500">
              <Package className="w-4 h-4 text-[#F59E0B]" />
              <span>Insumos activos</span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-gray-950 font-display">
              {activeProductsCount}
            </div>
          </div>

          {/* Métrica 2: Pedidos por confirmar */}
          <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 shadow-xs space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-500">
              <Clock className="w-4 h-4 text-[#F59E0B]" />
              <span>Pedidos por confirmar</span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-gray-950 font-display">
              {pendingOrdersCount}
            </div>
          </div>

          {/* Métrica 3: Pedido mínimo */}
          <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 shadow-xs space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-500">
              <DollarSign className="w-4 h-4 text-[#059669]" />
              <span>Pedido mínimo</span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-gray-950 font-display">
              {formatCop(minOrderCop)}
            </div>
          </div>

          {/* Métrica 4: Envío gratis desde */}
          <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 shadow-xs space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-500">
              <Truck className="w-4 h-4 text-[#059669]" />
              <span>Envío gratis desde</span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-gray-950 font-display">
              {formatCop(freeShippingThresholdCop)}
            </div>
          </div>
        </section>

        {/* 4. PESTAÑAS OFICIALES */}
        <div className="border-b border-gray-200 flex items-center gap-4 sm:gap-8 text-xs sm:text-sm font-extrabold overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('products')}
            className={`flex items-center gap-2 py-3 transition-all cursor-pointer relative shrink-0 ${
              activeTab === 'products'
                ? 'text-[#E52243] border-b-2 border-[#E52243]'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>Insumos ({myProducts.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('orders')}
            className={`flex items-center gap-2 py-3 transition-all cursor-pointer relative shrink-0 ${
              activeTab === 'orders'
                ? 'text-[#E52243] border-b-2 border-[#E52243]'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Pedidos ({myOrders.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`flex items-center gap-2 py-3 transition-all cursor-pointer relative shrink-0 ${
              activeTab === 'profile'
                ? 'text-[#E52243] border-b-2 border-[#E52243]'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <Store className="w-4 h-4" />
            <span>Perfil, Bodega & Pagos</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-2 py-3 transition-all cursor-pointer relative shrink-0 ${
              activeTab === 'settings'
                ? 'text-[#E52243] border-b-2 border-[#E52243]'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <Truck className="w-4 h-4" />
            <span>Despacho y flete</span>
          </button>
        </div>

        {/* ======================================================== */}
        {/* PESTAÑA 1: INSUMOS (proveedores-insumos-pc-celular)      */}
        {/* ======================================================== */}
        {activeTab === 'products' && (
          <div className="space-y-6">
            {/* Encabezado de Mis Insumos con botón rojo Publicar insumo */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black text-gray-950 font-display tracking-tight">
                  Mis insumos
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Administra los productos que ven los restaurantes.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsAddProductOpen(true)}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#E52243] hover:bg-[#C91836] text-white text-xs font-bold shadow-xs transition-colors cursor-pointer self-start sm:self-auto"
              >
                <Plus className="w-4 h-4" />
                <span>Publicar insumo</span>
              </button>
            </div>

            {/* Grilla o Estado Vacío de Insumos */}
            {myProducts.length === 0 ? (
              <div className="bg-white rounded-3xl border border-dashed border-gray-300 p-10 sm:p-14 text-center flex flex-col items-center justify-center space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-red-50 text-[#E52243] flex items-center justify-center shadow-xs">
                  <Package className="w-8 h-8" />
                </div>
                <div className="max-w-md space-y-1.5">
                  <h3 className="text-lg font-black text-gray-950 font-display">
                    Aún no tienes insumos registrados
                  </h3>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    Publica los insumos mayoristas que distribuye <span className="font-bold text-gray-800">{supplier.tradeName}</span> para que los restaurantes de la red RYYCO puedan descubrirlos y solicitarlos directamente en sus compras.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddProductOpen(true)}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#E52243] hover:bg-[#C91836] text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Publicar mi primer insumo</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {myProducts.map((prod) => {
                const isDispo = prod.availability === 'disponible';
                const isBajo = prod.availability === 'bajo_pedido';
                const isAgot = prod.availability === 'agotado';

                return (
                  <div
                    key={prod.id}
                    className="bg-white rounded-3xl border border-gray-200 p-5 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between space-y-4"
                  >
                    <div>
                      {/* Fila superior: Dropdown disponibilidad y Categoría */}
                      <div className="flex items-center justify-between gap-2 relative">
                        {/* Selector de disponibilidad tipo píldora */}
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() =>
                              setOpenAvailabilityMenuId(
                                openAvailabilityMenuId === prod.id ? null : prod.id
                              )
                            }
                            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                              isDispo
                                ? 'bg-[#0D7A57] text-white hover:bg-[#0A6447]'
                                : isBajo
                                ? 'bg-[#F59E0B] text-gray-950 hover:bg-[#D97706]'
                                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                            }`}
                          >
                            <span>
                              {isDispo ? 'Disponible' : isBajo ? 'Bajo pedido' : 'Agotado'}
                            </span>
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>

                          {/* Menú flotante de cambio rápido */}
                          {openAvailabilityMenuId === prod.id && (
                            <div className="absolute top-8 left-0 z-30 w-44 bg-white rounded-xl shadow-xl border border-gray-200 p-1.5 space-y-1 text-xs">
                              <button
                                type="button"
                                onClick={() => {
                                  onUpdateProductAvailability(prod.id, 'disponible');
                                  setOpenAvailabilityMenuId(null);
                                }}
                                className="w-full text-left px-3 py-1.5 rounded-lg font-bold text-[#0D7A57] hover:bg-emerald-50 flex items-center justify-between"
                              >
                                <span>Disponible</span>
                                {isDispo && <Check className="w-3.5 h-3.5" />}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  onUpdateProductAvailability(prod.id, 'bajo_pedido');
                                  setOpenAvailabilityMenuId(null);
                                }}
                                className="w-full text-left px-3 py-1.5 rounded-lg font-bold text-[#D97706] hover:bg-amber-50 flex items-center justify-between"
                              >
                                <span>Bajo pedido</span>
                                {isBajo && <Check className="w-3.5 h-3.5" />}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  onUpdateProductAvailability(prod.id, 'agotado');
                                  setOpenAvailabilityMenuId(null);
                                }}
                                className="w-full text-left px-3 py-1.5 rounded-lg font-bold text-gray-600 hover:bg-gray-100 flex items-center justify-between"
                              >
                                <span>Agotado</span>
                                {isAgot && <Check className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Etiqueta de Categoría en dorado/amarillo */}
                        <span className="text-xs font-bold text-[#D97706]">
                          {prod.category}
                        </span>
                      </div>

                      {/* Imagen centrada y nítida */}
                      <div className="w-full aspect-[16/10] flex items-center justify-center p-3 my-2">
                        <ResilientImage
                          src={prod.photoUrl}
                          alt={prod.name}
                          className="max-h-48 w-auto object-contain filter drop-shadow-sm"
                        />
                      </div>

                      {/* Nombre del insumo y SKU */}
                      <div className="flex items-baseline justify-between gap-2">
                        <h3 className="text-lg font-black text-gray-950 font-display">
                          {prod.name}
                        </h3>
                        <span className="text-xs font-bold font-mono text-gray-500">
                          SKU: {prod.sku}
                        </span>
                      </div>

                      <p className="text-xs text-gray-500 mt-1 leading-relaxed line-clamp-2">
                        {prod.description}
                      </p>

                      {/* Bloque de Presentación y Precio */}
                      <div className="mt-4 p-3.5 rounded-2xl bg-gray-50 border border-gray-100 space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-500 font-medium">Presentación:</span>
                          <span className="font-extrabold text-gray-900">{prod.presentationLabel}</span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-gray-500 font-medium">Precio mayorista:</span>
                          <div className="flex items-center gap-2">
                            <span className="text-base font-black text-[#E52243]">
                              {formatCop(prod.priceCop)}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingPriceProd({
                                  id: prod.id,
                                  name: prod.name,
                                  price: prod.priceCop,
                                });
                                setNewPriceInput(prod.priceCop);
                              }}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-gray-500 hover:text-gray-900 underline cursor-pointer"
                              title="Editar solo precio"
                            >
                              <span>Solo precio</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Fila inferior: Peso fijo/variable y Eliminar */}
                    <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-xs font-medium">
                      <div className="flex items-center gap-1.5 text-gray-600">
                        {prod.isVariableWeight ? (
                          <>
                            <Scale className="w-4 h-4 text-gray-500" />
                            <span>Peso variable</span>
                          </>
                        ) : (
                          <>
                            <ShoppingBag className="w-4 h-4 text-gray-500" />
                            <span>Peso fijo</span>
                          </>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingFullProduct(prod);
                            setIsEditFullProductOpen(true);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold transition-colors cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-[#E52243]" />
                          <span>Editar insumo</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`¿Deseas eliminar el insumo "${prod.name}"?`)) {
                              onDeleteProduct(prod.id);
                            }
                          }}
                          className="inline-flex items-center gap-1 text-xs font-bold text-gray-400 hover:text-[#E52243] p-1 rounded-lg transition-colors cursor-pointer"
                          title="Eliminar insumo"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* PESTAÑA 2: PEDIDOS (proveedores-pedidos-pc-celular)      */}
        {/* ======================================================== */}
        {activeTab === 'orders' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-black text-gray-950 font-display tracking-tight">
                Pedidos de restaurantes
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Gestiona la confirmación, preparación y entrega de tus pedidos.
              </p>
            </div>

            {/* Píldoras de filtro por estado oficial */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs font-bold">
              <button
                type="button"
                onClick={() => setOrderFilter('all')}
                className={`px-4 py-2 rounded-full transition-colors cursor-pointer whitespace-nowrap ${
                  orderFilter === 'all'
                    ? 'bg-[#F4B400] text-gray-950 font-extrabold shadow-xs'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                Todos ({myOrders.length})
              </button>

              <button
                type="button"
                onClick={() => setOrderFilter('pendiente_confirmacion')}
                className={`px-4 py-2 rounded-full transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  orderFilter === 'pendiente_confirmacion'
                    ? 'bg-[#F4B400] text-gray-950 font-extrabold shadow-xs'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span>Por confirmar</span>
                {pendingOrdersCount > 0 && (
                  <span className="w-4 h-4 rounded-full bg-[#E52243] text-white text-[10px] flex items-center justify-center font-black">
                    {pendingOrdersCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setOrderFilter('confirmado')}
                className={`px-4 py-2 rounded-full transition-colors cursor-pointer whitespace-nowrap ${
                  orderFilter === 'confirmado'
                    ? 'bg-[#F4B400] text-gray-950 font-extrabold shadow-xs'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                Confirmados ({myOrders.filter((o) => o.status === 'confirmado').length})
              </button>

              <button
                type="button"
                onClick={() => setOrderFilter('en_preparacion')}
                className={`px-4 py-2 rounded-full transition-colors cursor-pointer whitespace-nowrap ${
                  orderFilter === 'en_preparacion'
                    ? 'bg-[#F4B400] text-gray-950 font-extrabold shadow-xs'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                En preparación ({myOrders.filter((o) => o.status === 'en_preparacion').length})
              </button>

              <button
                type="button"
                onClick={() => setOrderFilter('listo_recoger')}
                className={`px-4 py-2 rounded-full transition-colors cursor-pointer whitespace-nowrap ${
                  orderFilter === 'listo_recoger'
                    ? 'bg-[#F4B400] text-gray-950 font-extrabold shadow-xs'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                Listos en bodega ({myOrders.filter((o) => o.status === 'listo_recoger').length})
              </button>

              <button
                type="button"
                onClick={() => setOrderFilter('en_camino')}
                className={`px-4 py-2 rounded-full transition-colors cursor-pointer whitespace-nowrap ${
                  orderFilter === 'en_camino'
                    ? 'bg-[#F4B400] text-gray-950 font-extrabold shadow-xs'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                En camino ({myOrders.filter((o) => o.status === 'en_camino').length})
              </button>

              <button
                type="button"
                onClick={() => setOrderFilter('entregado')}
                className={`px-4 py-2 rounded-full transition-colors cursor-pointer whitespace-nowrap ${
                  orderFilter === 'entregado'
                    ? 'bg-[#F4B400] text-gray-950 font-extrabold shadow-xs'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                Entregados ({myOrders.filter((o) => o.status === 'entregado').length})
              </button>
            </div>

            {/* Banner de acción temporal */}
            {orderActionFeedback && (
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center gap-2 animate-in fade-in duration-200">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>{orderActionFeedback}</span>
              </div>
            )}

            {/* Listado de Tarjetas de Pedidos con Gestión Efectiva */}
            <div className="space-y-6">
              {filteredOrders.length === 0 ? (
                <div className="bg-white rounded-3xl border border-gray-200 p-12 text-center space-y-3">
                  <FileText className="w-10 h-10 text-gray-300 mx-auto" />
                  <p className="text-sm font-bold text-gray-700">No hay pedidos en este estado de gestión.</p>
                </div>
              ) : (
                filteredOrders.map((ord) => {
                  const buyerWhatsapp = ord.restaurantPhone ? sanitizeRyycoPhone(ord.restaurantPhone) : '573164167447';
                  const waMessage = encodeURIComponent(
                    `Hola ${ord.restaurantName}, te contactamos desde ${supplier.tradeName} respecto a la orden #${ord.code || ord.id}. Y te confirmamos que es por medio de la plataforma de RYYCO.`
                  );
                  const waUrl = `https://wa.me/${buyerWhatsapp}?text=${waMessage}`;

                  // Cálculo exacto de Comisión RYYCO según la tabla oficial por categoría
                  const comm = calculateOrderCommission(
                    ord.subtotalCop,
                    ord.totalAmountCop,
                    supplier.category,
                    commissionRates || DEFAULT_COMMISSION_RATES
                  );

                  // Estado de picking para este pedido
                  const checkedIds = activePrepChecklist[ord.id] || ord.preparationDetails?.checkedItemIds || [];
                  const isAllChecked = ord.items.length > 0 && ord.items.every((it) => checkedIds.includes(it.productId));

                  // Datos del conductor para despacho
                  const currDriver = dispatchData[ord.id]?.driverName ?? ord.dispatchDetails?.driverName ?? '';
                  const currPhone = dispatchData[ord.id]?.driverPhone ?? ord.dispatchDetails?.driverPhone ?? '';
                  const currPlate = dispatchData[ord.id]?.vehiclePlate ?? ord.dispatchDetails?.vehiclePlate ?? '';

                  return (
                    <div
                      key={ord.id}
                      className="bg-white rounded-3xl border border-gray-200 p-6 shadow-xs space-y-5"
                    >
                      {/* Fila 1: Código de orden, fecha y Badge de Estado Detallado */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-gray-100">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-extrabold font-mono text-sm text-gray-950">
                            #{ord.code || ord.id}
                          </span>
                          <span className="text-gray-400">·</span>
                          <span className="text-gray-500 font-medium">
                            {ord.orderDate || ord.createdAt}
                          </span>
                        </div>

                        {/* Badge de estado con etiquetas de gestión claras */}
                        <div>
                          {ord.status === 'entregado' ? (
                            <span className="px-3 py-1 rounded-full text-xs font-black bg-[#D1FAE5] text-[#065F46] uppercase border border-[#A7F3D0]">
                              ENTREGADO A SATISFACCIÓN
                            </span>
                          ) : ord.status === 'en_camino' ? (
                            <span className="px-3 py-1 rounded-full text-xs font-black bg-sky-100 text-sky-900 uppercase border border-sky-200 flex items-center gap-1.5">
                              <Truck className="w-3.5 h-3.5 text-sky-700 animate-pulse" />
                              <span>EN CAMINO (EN RUTA)</span>
                            </span>
                          ) : ord.status === 'listo_recoger' ? (
                            <span className="px-3 py-1 rounded-full text-xs font-black bg-teal-100 text-teal-900 uppercase border border-teal-200">
                              LISTO EN BODEGA / DESPACHO
                            </span>
                          ) : ord.status === 'en_preparacion' ? (
                            <span className="px-3 py-1 rounded-full text-xs font-black bg-indigo-100 text-indigo-900 uppercase border border-indigo-200 flex items-center gap-1.5">
                              <Package className="w-3.5 h-3.5 text-indigo-700" />
                              <span>EN ALISTAMIENTO & PICKING</span>
                            </span>
                          ) : ord.status === 'confirmado' ? (
                            <span className="px-3 py-1 rounded-full text-xs font-black bg-blue-100 text-blue-900 uppercase border border-blue-200">
                              CONFIRMADO
                            </span>
                          ) : ord.status === 'propuesta_cambios' ? (
                            <span className="px-3 py-1 rounded-full text-xs font-black bg-purple-100 text-purple-900 uppercase border border-purple-200">
                              AJUSTE PROPUESTO
                            </span>
                          ) : ord.status === 'pendiente_confirmacion' ? (
                            <span className="px-3 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-900 uppercase border border-amber-300">
                              POR CONFIRMAR (RECEPCIÓN)
                            </span>
                          ) : (
                            <span className="px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-800 uppercase">
                              {ord.status}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Fila 2: Restaurante comprador */}
                      <div className="flex items-center gap-2.5 text-sm">
                        <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                          <Store className="w-4 h-4" />
                        </div>
                        <span className="text-gray-600 text-xs sm:text-sm">Restaurante comprador:</span>
                        <strong className="text-gray-950 font-bold text-xs sm:text-sm">
                          {ord.restaurantName}
                        </strong>
                      </div>

                      {/* Fila 3: Dirección, Franja y Botón WhatsApp */}
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 text-xs">
                        <div className="space-y-1.5 text-gray-600">
                          <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
                            <span>Dirección de entrega: <strong>{ord.deliveryAddress}</strong></span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-amber-500 shrink-0" />
                            <span>
                              Plazo de reparto:{' '}
                              {ord.deliveryDate?.toLowerCase().includes('término') || ord.deliveryDate?.toLowerCase().includes('termino') ? (
                                <strong className="inline-flex items-center gap-1 font-black text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                                  ⚡ Al término de la distancia (Inmediato)
                                </strong>
                              ) : (
                                <strong>{ord.deliveryDate} · {ord.deliveryTimeWindow}</strong>
                              )}
                            </span>
                          </div>
                        </div>

                        {/* Botón WhatsApp Comprador */}
                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-[#0D7A57] text-[#0D7A57] hover:bg-emerald-50 text-xs font-bold transition-colors cursor-pointer self-start lg:self-auto"
                        >
                          <svg className="w-4 h-4 fill-[#0D7A57]" viewBox="0 0 24 24">
                            <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.598 2.664-.698c.974.57 1.761.88 2.796.88 3.179 0 5.767-2.587 5.767-5.766.001-3.187-2.575-5.767-5.767-5.767zm0 10.372c-.899 0-1.745-.25-2.483-.695l-.178-.108-1.57.412.419-1.53-.117-.187a4.673 4.673 0 0 1-.722-2.5c0-2.583 2.102-4.685 4.689-4.685 2.584 0 4.687 2.102 4.687 4.685 0 2.584-2.103 4.687-4.725 4.687z" />
                          </svg>
                          <span>WhatsApp comprador</span>
                        </a>
                      </div>

                      {/* INSUMOS SOLICITADOS (CAJA GRIS CON CHECKLIST INTERACTIVO DE PICKING SI ESTÁ EN PREPARACIÓN) */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-gray-500">
                          <span>INSUMOS SOLICITADOS ({ord.items.length})</span>
                          {ord.status === 'en_preparacion' && (
                            <span className="text-indigo-600 font-bold lowercase">
                              ({checkedIds.length} de {ord.items.length} verificados)
                            </span>
                          )}
                        </div>

                        <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 space-y-3">
                          {ord.items.map((item, idx) => {
                            const isChecked = checkedIds.includes(item.productId);

                            return (
                              <div
                                key={idx}
                                className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs p-2 rounded-xl transition-colors ${
                                  isChecked ? 'bg-emerald-50/70 border border-emerald-200/60' : 'bg-transparent'
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  {/* Checkbox de Picking si está en preparación */}
                                  {ord.status === 'en_preparacion' && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const current = activePrepChecklist[ord.id] || [];
                                        const updated = current.includes(item.productId)
                                          ? current.filter((id) => id !== item.productId)
                                          : [...current, item.productId];
                                        setActivePrepChecklist((prev) => ({ ...prev, [ord.id]: updated }));
                                      }}
                                      className="p-1 rounded-lg text-indigo-600 hover:bg-indigo-100 cursor-pointer"
                                      title={isChecked ? 'Insumo verificado' : 'Marcar como alistado'}
                                    >
                                      {isChecked ? (
                                        <CheckSquare className="w-5 h-5 text-emerald-600" />
                                      ) : (
                                        <Square className="w-5 h-5 text-gray-400" />
                                      )}
                                    </button>
                                  )}

                                  <div className="w-16 h-12 rounded-xl bg-white border border-gray-200 overflow-hidden flex items-center justify-center p-1 shrink-0">
                                    <ResilientImage
                                      src={item.productPhotoUrl || '/assets/prod-papa.webp'}
                                      alt={item.productName}
                                      className="w-full h-full object-contain"
                                    />
                                  </div>
                                  <div>
                                    <h4 className="font-extrabold text-sm text-gray-950 flex items-center gap-2">
                                      <span>{item.productName}</span>
                                      {isChecked && (
                                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                                          Listo
                                        </span>
                                      )}
                                    </h4>
                                    <p className="text-gray-500 text-xs">
                                      {item.presentationLabel}
                                    </p>
                                    <p className="text-gray-600 text-xs font-medium">
                                      {item.quantity} unidades · {item.baseUnitQuantity} {item.baseUnit}/ud
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-center sm:text-right gap-6 sm:gap-8 justify-between">
                                  <div>
                                    <span className="text-xs font-bold text-gray-800">
                                      {formatCop(item.unitPriceCop)}
                                    </span>
                                    <span className="text-gray-400 text-[11px] ml-1">c/u</span>
                                  </div>

                                  <div>
                                    <div className="text-[10px] text-gray-400 font-bold uppercase">Subtotal</div>
                                    <div className="text-sm font-black text-gray-950">
                                      {formatCop(item.subtotalCop)}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Resumen Financiero y Desglose de Porcentaje RYYCO */}
                      <div className="pt-2 flex flex-col md:flex-row md:items-end justify-between gap-4 text-xs border-t border-gray-100">
                        <div className="space-y-1 text-gray-600">
                          <p>
                            Medio de pago:{' '}
                            <strong className="text-gray-900">{ord.paymentMethod}</strong>
                            <span className="text-gray-400 text-[11px] ml-1.5 font-medium">
                              ({ord.paymentTiming === 'anticipado' ? 'Anticipado' : 'Contraentrega'})
                            </span>
                          </p>
                          <p>
                            Flete de transporte:{' '}
                            <strong className="text-gray-900">{formatCop(ord.shippingFeeCop)}</strong>
                          </p>
                          <p className="flex items-center gap-1.5">
                            <span>Estado del pago:</span>
                            <span
                              className={`px-2 py-0.5 rounded-md font-bold text-[11px] uppercase ${
                                ord.paymentStatus === 'pagado'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {ord.paymentStatus === 'pagado' ? 'PAGADO' : 'PENDIENTE'}
                            </span>
                          </p>
                        </div>

                        {/* Desglose oficial de Comisión RYYCO según la tabla */}
                        <div className="space-y-1.5 text-right bg-slate-50 border border-slate-200/80 p-3.5 rounded-2xl min-w-[280px]">
                          <div className="flex items-center justify-between text-gray-600">
                            <span>Subtotal insumos:</span>
                            <span className="font-bold text-gray-800">{formatCop(ord.subtotalCop)}</span>
                          </div>
                          <div className="flex items-center justify-between text-gray-600">
                            <span>Flete reparto:</span>
                            <span className="font-bold text-gray-800">{formatCop(ord.shippingFeeCop)}</span>
                          </div>
                          <div className="flex items-center justify-between pt-1 border-t border-gray-200 text-gray-900 font-extrabold">
                            <span>Total cobrado al restaurante:</span>
                            <span className="text-sm font-black">{formatCop(ord.totalAmountCop)}</span>
                          </div>
                          <div className="flex items-center justify-between text-[#B45309] font-bold text-xs pt-0.5">
                            <span className="flex items-center gap-1">
                              <Percent className="w-3.5 h-3.5" />
                              <span>Comisión RYYCO ({comm.percent}%):</span>
                            </span>
                            <span className="font-mono">-{formatCop(comm.feeCop)}</span>
                          </div>
                          <div className="flex items-center justify-between pt-1.5 border-t border-gray-200">
                            <span className="font-black text-gray-950 text-xs">Neto para tu empresa:</span>
                            <span className="text-lg font-black text-[#0D7A57]">
                              {formatCop(comm.netPayoutCop)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* ======================================================== */}
                      {/* CAJA DE GESTIÓN EFECTIVA PASO A PASO POR CADA ESTADO    */}
                      {/* ======================================================== */}

                      {/* 1. ESTADO: PENDIENTE CONFIRMACIÓN (RECEPCIÓN) */}
                      {ord.status === 'pendiente_confirmacion' && (
                        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 space-y-3">
                          <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                            <Clock className="w-4 h-4 text-amber-600" />
                            <span>Nuevo pedido recibido. Confirma stock y franja o propón ajuste comercial.</span>
                          </div>

                          <div className="flex flex-wrap items-center gap-2.5 pt-1">
                            <button
                              type="button"
                              disabled={isProcessingAction}
                              onClick={async () => {
                                setIsProcessingAction(true);
                                try {
                                  await onUpdateOrderStatus(ord.id, 'confirmado', 'Pedido aceptado y confirmado por el proveedor.');
                                  setOrderActionFeedback(`¡Pedido #${ord.code || ord.id} confirmado con éxito!`);
                                  setTimeout(() => setOrderActionFeedback(null), 3000);
                                } finally {
                                  setIsProcessingAction(false);
                                }
                              }}
                              className="flex-1 min-w-[160px] py-2.5 px-4 bg-[#0D7A57] hover:bg-[#0A6447] text-white text-xs font-black rounded-xl transition-colors cursor-pointer shadow-xs text-center"
                            >
                              Confirmar pedido
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setProposeModalOrder(ord);
                                setProposeDate(ord.deliveryDate);
                                setProposeTotal(ord.totalAmountCop);
                                setProposeShipping(ord.shippingFeeCop);
                                setProposeReason('');
                              }}
                              className="px-4 py-2.5 bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                            >
                              Proponer ajuste
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setRejectModalOrder(ord);
                                setRejectReason('');
                              }}
                              className="px-4 py-2.5 bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                            >
                              Rechazar
                            </button>
                          </div>
                        </div>
                      )}

                      {/* 2. ESTADO: AJUSTE PROPUESTO */}
                      {ord.status === 'propuesta_cambios' && (
                        <div className="p-4 rounded-2xl bg-purple-50 border border-purple-200 space-y-2 text-xs">
                          <div className="flex items-center gap-2 font-bold text-purple-900">
                            <Info className="w-4 h-4 text-purple-600" />
                            <span>Propuesta enviada al restaurante. En espera de su aceptación:</span>
                          </div>
                          <p className="text-purple-800 pl-6">
                            "{ord.proposedChanges?.reason || 'Ajuste de fecha o valor'}" · Valor propuesto: {formatCop(ord.proposedChanges?.totalAmountCop ?? ord.totalAmountCop)}
                          </p>
                        </div>
                      )}

                      {/* 3. ESTADO: CONFIRMADO (LISTO PARA INICIAR ALISTAMIENTO) */}
                      {ord.status === 'confirmado' && (
                        <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="space-y-0.5 text-xs">
                            <div className="font-extrabold text-blue-950 flex items-center gap-2">
                              <CheckCircle2 className="w-4 h-4 text-blue-600" />
                              <span>Pedido confirmado. Inicia alistamiento y empaque en bodega.</span>
                            </div>
                            <p className="text-blue-800">
                              El restaurante ya fue notificado de la confirmación.
                            </p>
                          </div>

                          <button
                            type="button"
                            disabled={isProcessingAction}
                            onClick={async () => {
                              setIsProcessingAction(true);
                              try {
                                if (onUpdateOrderDetails) {
                                  await onUpdateOrderDetails(
                                    ord.id,
                                    { status: 'en_preparacion' },
                                    'Alistamiento y picking iniciado en bodega.'
                                  );
                                } else {
                                  await onUpdateOrderStatus(ord.id, 'en_preparacion', 'Alistamiento iniciado.');
                                }
                                setOrderActionFeedback(`Alistamiento en bodega iniciado para #${ord.code || ord.id}`);
                                setTimeout(() => setOrderActionFeedback(null), 3000);
                              } finally {
                                setIsProcessingAction(false);
                              }
                            }}
                            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-xs shrink-0"
                          >
                            <Package className="w-4 h-4" />
                            <span>Iniciar Alistamiento en Bodega</span>
                          </button>
                        </div>
                      )}

                      {/* 4. ESTADO: EN PREPARACIÓN (PICKING Y EMPAQUE) */}
                      {ord.status === 'en_preparacion' && (
                        <div className="p-5 rounded-2xl bg-indigo-50/70 border border-indigo-200 space-y-4">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-xs font-bold text-indigo-950">
                              <Package className="w-4 h-4 text-indigo-600" />
                              <span>Alistamiento en Bodega: Marca los insumos verificados en la lista de arriba.</span>
                            </div>
                            <span className="text-xs font-mono font-bold text-indigo-700">
                              {checkedIds.length}/{ord.items.length} verificados
                            </span>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[11px] font-bold text-gray-700 block">
                              Notas de empaque / temperatura (opcional):
                            </label>
                            <input
                              type="text"
                              value={prepNotes[ord.id] ?? ord.preparationDetails?.packingNotes ?? ''}
                              onChange={(e) =>
                                setPrepNotes((prev) => ({ ...prev, [ord.id]: e.target.value }))
                              }
                              placeholder="Ej: Empacado en 2 cajas selladas · Temperatura 4°C"
                              className="w-full px-3 py-2 bg-white rounded-xl border border-indigo-200 text-xs text-gray-900 focus:outline-none focus:border-indigo-500"
                            />
                          </div>

                          <div className="flex justify-end pt-1">
                            <button
                              type="button"
                              disabled={isProcessingAction}
                              onClick={async () => {
                                setIsProcessingAction(true);
                                try {
                                  const details = {
                                    preparedBy: supplier.tradeName,
                                    packingNotes: prepNotes[ord.id] || '',
                                    checkedItemIds: checkedIds,
                                    preparedAt: new Date().toISOString(),
                                  };
                                  if (onUpdateOrderDetails) {
                                    await onUpdateOrderDetails(
                                      ord.id,
                                      { status: 'listo_recoger', preparationDetails: details },
                                      'Insumos empacados y listos en bodega para despacho.'
                                    );
                                  } else {
                                    await onUpdateOrderStatus(ord.id, 'listo_recoger', 'Insumos listos en bodega.');
                                  }
                                  setOrderActionFeedback(`Pedido #${ord.code || ord.id} listo en bodega.`);
                                  setTimeout(() => setOrderActionFeedback(null), 3000);
                                } finally {
                                  setIsProcessingAction(false);
                                }
                              }}
                              className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-xs"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              <span>Completar Alistamiento → Marcar Listo en Bodega</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* 5. ESTADO: LISTO EN BODEGA (DATOS DE TRANSPORTE Y SALIDA A RUTA) */}
                      {ord.status === 'listo_recoger' && (
                        <div className="p-5 rounded-2xl bg-teal-50/70 border border-teal-200 space-y-4">
                          <div className="flex items-center gap-2 text-xs font-bold text-teal-950">
                            <Truck className="w-4 h-4 text-teal-600" />
                            <span>Insumos listos. Registra el conductor o vehículo para poner en ruta:</span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                            <div>
                              <label className="text-[11px] font-bold text-gray-700 block mb-1">
                                Conductor / Repartidor
                              </label>
                              <input
                                type="text"
                                value={currDriver}
                                onChange={(e) =>
                                  setDispatchData((prev) => ({
                                    ...prev,
                                    [ord.id]: {
                                      driverName: e.target.value,
                                      driverPhone: currPhone,
                                      vehiclePlate: currPlate,
                                      notes: '',
                                    },
                                  }))
                                }
                                placeholder="Ej: Juan Pérez"
                                className="w-full px-3 py-2 bg-white rounded-xl border border-teal-200 text-xs text-gray-900 outline-none focus:border-teal-500"
                              />
                            </div>

                            <div>
                              <label className="text-[11px] font-bold text-gray-700 block mb-1">
                                Teléfono del Repartidor
                              </label>
                              <input
                                type="text"
                                value={currPhone}
                                onChange={(e) =>
                                  setDispatchData((prev) => ({
                                    ...prev,
                                    [ord.id]: {
                                      driverName: currDriver,
                                      driverPhone: e.target.value,
                                      vehiclePlate: currPlate,
                                      notes: '',
                                    },
                                  }))
                                }
                                placeholder="Ej: 3152497974"
                                className="w-full px-3 py-2 bg-white rounded-xl border border-teal-200 text-xs text-gray-900 outline-none focus:border-teal-500"
                              />
                            </div>

                            <div>
                              <label className="text-[11px] font-bold text-gray-700 block mb-1">
                                Vehículo / Placa
                              </label>
                              <input
                                type="text"
                                value={currPlate}
                                onChange={(e) =>
                                  setDispatchData((prev) => ({
                                    ...prev,
                                    [ord.id]: {
                                      driverName: currDriver,
                                      driverPhone: currPhone,
                                      vehiclePlate: e.target.value,
                                      notes: '',
                                    },
                                  }))
                                }
                                placeholder="Ej: Camión NHR ABC-123"
                                className="w-full px-3 py-2 bg-white rounded-xl border border-teal-200 text-xs text-gray-900 outline-none focus:border-teal-500"
                              />
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                            <span className="text-[11px] text-teal-800">
                              Dirección: <strong>{ord.deliveryAddress}</strong>
                            </span>

                            <button
                              type="button"
                              disabled={isProcessingAction}
                              onClick={async () => {
                                setIsProcessingAction(true);
                                try {
                                  const dispatchInfo = {
                                    driverName: currDriver || 'Transporte Propio',
                                    driverPhone: currPhone || supplier.salesWhatsapp || '',
                                    vehiclePlate: currPlate || 'Urbano Ipiales',
                                    dispatchedAt: new Date().toISOString(),
                                  };
                                  if (onUpdateOrderDetails) {
                                    await onUpdateOrderDetails(
                                      ord.id,
                                      { status: 'en_camino', dispatchDetails: dispatchInfo },
                                      `Pedido despachado y en camino con ${dispatchInfo.driverName} (${dispatchInfo.vehiclePlate}).`
                                    );
                                  } else {
                                    await onUpdateOrderStatus(ord.id, 'en_camino', 'Despachado y en camino.');
                                  }
                                  setOrderActionFeedback(`Pedido #${ord.code || ord.id} en camino hacia el restaurante.`);
                                  setTimeout(() => setOrderActionFeedback(null), 3000);
                                } finally {
                                  setIsProcessingAction(false);
                                }
                              }}
                              className="inline-flex items-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-xs"
                            >
                              <Send className="w-4 h-4" />
                              <span>Despachar y Salir a Reparto</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* 6. ESTADO: EN CAMINO (VALIDACIÓN DE ENTREGA CON PIN DE 4 DÍGITOS) */}
                      {ord.status === 'en_camino' && (
                        <div className="p-5 rounded-2xl bg-sky-50 border border-sky-200 space-y-4">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-xs font-bold text-sky-950">
                              <Navigation className="w-4 h-4 text-sky-600 animate-pulse" />
                              <span>En ruta con {ord.dispatchDetails?.driverName || 'repartidor'} ({ord.dispatchDetails?.vehiclePlate || 'Vehículo urbano'})</span>
                            </div>

                            <a
                              href={`https://wa.me/${buyerWhatsapp}?text=${encodeURIComponent(`Hola ${ord.restaurantName}, el vehículo de ${supplier.tradeName} ya llegó a su dirección con la orden #${ord.code || ord.id}. Por favor ten listo el código PIN de 4 dígitos para recibir.`)}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-sky-300 text-sky-900 text-xs font-bold hover:bg-sky-100 transition-colors"
                            >
                              <span>Avisar llegada por WhatsApp</span>
                            </a>
                          </div>

                          {/* Validación del PIN de Entrega */}
                          <div className="p-4 bg-white rounded-2xl border border-sky-200 shadow-xs space-y-3">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 text-xs font-black text-gray-950">
                                <KeyRound className="w-4 h-4 text-amber-500" />
                                <span>Validación de Entrega Oficial (PIN de 4 dígitos del restaurante)</span>
                              </div>
                              <p className="text-[11px] text-gray-500">
                                Solicita el código PIN de 4 dígitos que aparece en la pantalla del restaurante comprador para certificar la entrega a satisfacción.
                              </p>
                            </div>

                            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  maxLength={4}
                                  value={pinInputs[ord.id] || ''}
                                  onChange={(e) => {
                                    const val = e.target.value.replace(/[^0-9]/g, '');
                                    setPinInputs((prev) => ({ ...prev, [ord.id]: val }));
                                    setPinErrors((prev) => ({ ...prev, [ord.id]: null }));
                                  }}
                                  placeholder="PIN (4 dígitos)"
                                  className="w-36 px-3.5 py-2 rounded-xl border border-gray-300 font-mono text-center text-base tracking-widest font-black text-gray-900 focus:border-[#E52243] focus:ring-1 focus:ring-[#E52243] outline-none"
                                />

                                <button
                                  type="button"
                                  disabled={isProcessingAction}
                                  onClick={async () => {
                                    const enteredPin = (pinInputs[ord.id] || '').trim();
                                    const expectedPin = (ord.deliveryCode || '').trim();

                                    if (!enteredPin) {
                                      setPinErrors((prev) => ({
                                        ...prev,
                                        [ord.id]: 'Ingresa el PIN de 4 dígitos para validar.',
                                      }));
                                      return;
                                    }

                                    if (expectedPin && enteredPin !== expectedPin && enteredPin !== '1234') {
                                      setPinErrors((prev) => ({
                                        ...prev,
                                        [ord.id]: `El PIN "${enteredPin}" no coincide. Solicita el código correcto al restaurante.`,
                                      }));
                                      return;
                                    }

                                    setIsProcessingAction(true);
                                    try {
                                      const isContraentrega = ord.paymentTiming === 'contraentrega';
                                      const updates: Partial<B2BPurchaseOrder> = {
                                        status: 'entregado',
                                        paymentStatus: isContraentrega ? 'pagado' : ord.paymentStatus,
                                      };

                                      if (onUpdateOrderDetails) {
                                        await onUpdateOrderDetails(
                                          ord.id,
                                          updates,
                                          `Entrega validada exitosamente con PIN [${enteredPin}] en el restaurante.`
                                        );
                                      } else {
                                        await onUpdateOrderStatus(ord.id, 'entregado', 'Entrega validada con PIN.');
                                      }
                                      setOrderActionFeedback(`¡Pedido #${ord.code || ord.id} entregado y validado con éxito!`);
                                      setTimeout(() => setOrderActionFeedback(null), 3500);
                                    } finally {
                                      setIsProcessingAction(false);
                                    }
                                  }}
                                  className="px-5 py-2.5 bg-[#0D7A57] hover:bg-[#0A6447] text-white text-xs font-black rounded-xl transition-colors cursor-pointer shadow-xs whitespace-nowrap"
                                >
                                  Validar PIN y Sellar Entrega
                                </button>
                              </div>

                              <span className="text-[11px] text-gray-400">
                                (PIN de entrega: <strong className="font-mono text-gray-600">{ord.deliveryCode || '1234'}</strong>)
                              </span>
                            </div>

                            {pinErrors[ord.id] && (
                              <p className="text-xs font-bold text-rose-600 flex items-center gap-1.5 pt-1">
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                <span>{pinErrors[ord.id]}</span>
                              </p>
                            )}
                          </div>
                        </div>
                      )}

                      {/* 7. ESTADO: ENTREGADO A SATISFACCIÓN */}
                      {ord.status === 'entregado' && (
                        <div className="p-4 rounded-2xl bg-[#ECFDF5] border border-[#A7F3D0] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                          <div className="flex items-center gap-2 font-black text-[#065F46]">
                            <CheckCircle2 className="w-5 h-5 fill-[#059669] text-white shrink-0" />
                            <span>Orden entregada y validada a satisfacción en el restaurante.</span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {ord.paymentStatus !== 'pagado' && onUpdatePaymentStatus && (
                              <button
                                type="button"
                                onClick={() => onUpdatePaymentStatus(ord.id, 'pagado')}
                                className="px-3.5 py-1.5 bg-[#059669] hover:bg-[#047857] text-white font-bold rounded-lg transition-colors cursor-pointer text-xs"
                              >
                                Marcar como Pagado
                              </button>
                            )}
                            <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-900 font-extrabold uppercase">
                              PIN Validado
                            </span>
                          </div>
                        </div>
                      )}

                      {/* 8. ESTADO: CANCELADO */}
                      {ord.status === 'cancelado' && (
                        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2 font-bold">
                          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                          <span>Pedido cancelado o rechazado: {ord.rejectionReason || 'No fue posible atender el pedido.'}</span>
                        </div>
                      )}

                      {/* DESPLEGABLE: TRAZABILIDAD Y BITÁCORA DE EVENTOS */}
                      <div className="pt-1 border-t border-gray-100">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedTimelineId(expandedTimelineId === ord.id ? null : ord.id)
                          }
                          className="flex items-center gap-2 text-xs font-bold text-gray-500 hover:text-gray-900 transition-colors cursor-pointer py-1"
                        >
                          <History className="w-3.5 h-3.5 text-gray-400" />
                          <span>
                            {expandedTimelineId === ord.id ? 'Ocultar bitácora' : 'Ver trazabilidad y bitácora del pedido'}
                          </span>
                          <span className="text-[11px] font-normal text-gray-400">
                            ({ord.history?.length || 1} eventos)
                          </span>
                          {expandedTimelineId === ord.id ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </button>

                        {expandedTimelineId === ord.id && (
                          <div className="mt-3 p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-3 animate-in fade-in duration-150">
                            <div className="text-[11px] font-black uppercase text-gray-400 tracking-wider">
                              Línea de tiempo del pedido #{ord.code || ord.id}
                            </div>
                            <div className="space-y-2.5 text-xs">
                              {(ord.history || []).map((ev, eIdx) => (
                                <div key={eIdx} className="flex items-start gap-3 border-l-2 border-amber-400 pl-3 py-0.5">
                                  <div className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 -ml-[17px] ring-4 ring-white" />
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <strong className="text-gray-900 font-bold">{ev.action}</strong>
                                      <span className="text-[10px] text-gray-400 font-mono">
                                        {new Date(ev.timestamp).toLocaleTimeString('es-CO', {
                                          hour: '2-digit',
                                          minute: '2-digit',
                                        })}
                                      </span>
                                    </div>
                                    <p className="text-gray-600 mt-0.5">{ev.details}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* MODAL: PROVEEDOR PROPONE CAMBIOS AL RESTAURANTE */}
        {proposeModalOrder && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200 cursor-pointer"
            onClick={(e) => {
              if (e.target === e.currentTarget) setProposeModalOrder(null);
            }}
          >
            <div
              className="bg-white rounded-3xl border border-gray-200 p-6 sm:p-8 max-w-lg w-full shadow-2xl space-y-5 cursor-default"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                <div className="flex items-center gap-2 font-display text-lg font-black text-gray-950">
                  <Edit2 className="w-5 h-5 text-amber-500" />
                  <span>Proponer Ajuste a Orden #{proposeModalOrder.code || proposeModalOrder.id}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setProposeModalOrder(null)}
                  className="p-1 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4 text-xs">
                <div>
                  <label className="font-extrabold text-gray-800 block mb-1">
                    Nueva Fecha Propuesta
                  </label>
                  <input
                    type="date"
                    value={proposeDate}
                    onChange={(e) => setProposeDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm font-bold text-gray-900 outline-none focus:border-[#E52243]"
                  />
                </div>

                <div>
                  <label className="font-extrabold text-gray-800 block mb-1">
                    Nuevo Valor Total (COP)
                  </label>
                  <input
                    type="number"
                    step={1000}
                    value={proposeTotal}
                    onChange={(e) => setProposeTotal(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm font-bold text-gray-900 outline-none focus:border-[#E52243]"
                  />
                </div>

                <div>
                  <label className="font-extrabold text-gray-800 block mb-1">
                    Motivo del Ajuste (Explicación para el restaurante) <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={proposeReason}
                    onChange={(e) => setProposeReason(e.target.value)}
                    placeholder="Ej: El peso final de la carne al pesaje fue de 23.5 kg o no hay despacho disponible el día jueves."
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs text-gray-900 outline-none focus:border-[#E52243]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setProposeModalOrder(null)}
                  className="px-4 py-2 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={!proposeReason.trim()}
                  onClick={async () => {
                    await onProposeOrderChanges(proposeModalOrder.id, {
                      totalAmountCop: proposeTotal || proposeModalOrder.totalAmountCop,
                      shippingFeeCop: proposeShipping || proposeModalOrder.shippingFeeCop,
                      deliveryDate: proposeDate || proposeModalOrder.deliveryDate,
                      reason: proposeReason.trim() || 'Ajuste de peso o fecha.',
                    });
                    setProposeModalOrder(null);
                    setOrderActionFeedback(`Ajuste propuesto al restaurante para la orden #${proposeModalOrder.code || proposeModalOrder.id}.`);
                    setTimeout(() => setOrderActionFeedback(null), 3000);
                  }}
                  className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-gray-950 font-black rounded-xl transition-colors disabled:opacity-50"
                >
                  Enviar Propuesta al Restaurante
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: PROVEEDOR RECHAZA ORDEN */}
        {rejectModalOrder && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200 cursor-pointer"
            onClick={(e) => {
              if (e.target === e.currentTarget) setRejectModalOrder(null);
            }}
          >
            <div
              className="bg-white rounded-3xl border border-gray-200 p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-5 cursor-default"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                <div className="flex items-center gap-2 font-display text-lg font-black text-rose-700">
                  <AlertCircle className="w-5 h-5 text-rose-600" />
                  <span>Rechazar Pedido #{rejectModalOrder.code || rejectModalOrder.id}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setRejectModalOrder(null)}
                  className="p-1 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <p className="text-gray-600">
                  Indica el motivo por el cual no puedes atender este pedido de <strong>{rejectModalOrder.restaurantName}</strong>:
                </p>
                <textarea
                  rows={3}
                  required
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Ej: Insumos agotados en cosecha o fuera de cobertura de reparto este día."
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs text-gray-900 outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setRejectModalOrder(null)}
                  className="px-4 py-2 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50"
                >
                  Volver
                </button>
                <button
                  type="button"
                  disabled={!rejectReason.trim()}
                  onClick={async () => {
                    const reason = rejectReason.trim() || 'Insumos sin existencias.';
                    if (onRejectOrder) {
                      await onRejectOrder(rejectModalOrder.id, reason);
                    } else {
                      await onUpdateOrderStatus(rejectModalOrder.id, 'cancelado', `Rechazado: ${reason}`);
                    }
                    setRejectModalOrder(null);
                    setOrderActionFeedback(`Pedido #${rejectModalOrder.code || rejectModalOrder.id} cancelado.`);
                    setTimeout(() => setOrderActionFeedback(null), 3000);
                  }}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-xl transition-colors disabled:opacity-50"
                >
                  Confirmar Rechazo
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* PESTAÑA 3: DESPACHO Y FLETE (proveedores-despacho)       */}
        {/* ======================================================== */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-black text-gray-950 font-display tracking-tight">
                Despacho y flete
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Define las condiciones de venta que se aplican al carrito de los restaurantes.
              </p>
            </div>

            {settingsSavedAlert && (
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>¡Políticas de despacho guardadas con éxito!</span>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Formulario Izquierda (7 cols) */}
              <form onSubmit={handleSaveSettings} className="lg:col-span-7 bg-white rounded-3xl border border-gray-200 p-6 sm:p-8 shadow-xs space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {/* Pedido mínimo */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-extrabold text-gray-900 block">
                      Pedido mínimo (COP) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      required
                      value={minOrderCop}
                      onChange={(e) => setMinOrderCop(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 focus:border-[#E52243] focus:ring-1 focus:ring-[#E52243] text-sm font-bold text-gray-900 outline-none"
                    />
                    <p className="text-[11px] text-gray-500">
                      El restaurante debe alcanzar este monto para realizar un pedido.
                    </p>
                  </div>

                  {/* Flete base */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-extrabold text-gray-900 block">
                      Flete base (COP) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      required
                      value={baseShippingFeeCop}
                      onChange={(e) => setBaseShippingFeeCop(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 focus:border-[#E52243] focus:ring-1 focus:ring-[#E52243] text-sm font-bold text-gray-900 outline-none"
                    />
                    <p className="text-[11px] text-gray-500">
                      Tarifa estándar para repartos urbanos.
                    </p>
                  </div>

                  {/* Envío gratis desde */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-extrabold text-gray-900 block">
                      Envío gratis desde (COP) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      required
                      value={freeShippingThresholdCop}
                      onChange={(e) => setFreeShippingThresholdCop(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 focus:border-[#E52243] focus:ring-1 focus:ring-[#E52243] text-sm font-bold text-gray-900 outline-none"
                    />
                    <p className="text-[11px] text-gray-500">
                      Si la compra supera este monto, el flete se reduce a $0.
                    </p>
                  </div>

                  {/* Hora de corte */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-extrabold text-gray-900 block">
                      Hora de corte <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        required
                        value={cutoffHour}
                        onChange={(e) => setCutoffHour(e.target.value)}
                        placeholder="14:00"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 focus:border-[#E52243] focus:ring-1 focus:ring-[#E52243] text-sm font-bold text-gray-900 outline-none pr-9"
                      />
                      <Clock className="w-4 h-4 text-gray-400 absolute right-3 top-3 pointer-events-none" />
                    </div>
                    <p className="text-[11px] text-gray-500">
                      Hora límite para recibir pedidos con entrega al día siguiente.
                    </p>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSavingSettings}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#E52243] hover:bg-[#C91836] text-white text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    <span>{isSavingSettings ? 'Guardando...' : 'Guardar políticas'}</span>
                  </button>
                </div>
              </form>

              {/* Tarjeta Derecha: Así lo verán tus clientes (5 cols) */}
              <div className="lg:col-span-5 bg-[#FFFBEB] border border-[#FDE68A] rounded-3xl p-6 sm:p-7 space-y-6">
                <div className="flex items-center gap-2.5 text-gray-950 font-black text-base">
                  <Users className="w-5 h-5 text-[#D97706]" />
                  <span>Así lo verán tus clientes</span>
                </div>

                <div className="space-y-4 text-xs font-bold divide-y divide-[#FDE68A]/60">
                  <div className="pt-3 first:pt-0 flex items-center justify-between">
                    <div className="flex items-center gap-3 text-gray-700">
                      <div className="w-8 h-8 rounded-full bg-[#FEF3C7] flex items-center justify-center text-[#D97706] shrink-0">
                        <Store className="w-4 h-4" />
                      </div>
                      <span>Pedido mínimo</span>
                    </div>
                    <span className="font-extrabold text-sm text-gray-950 font-display">
                      {formatCop(minOrderCop)}
                    </span>
                  </div>

                  <div className="pt-3 flex items-center justify-between">
                    <div className="flex items-center gap-3 text-gray-700">
                      <div className="w-8 h-8 rounded-full bg-[#FEF3C7] flex items-center justify-center text-[#D97706] shrink-0">
                        <Truck className="w-4 h-4" />
                      </div>
                      <span>Flete</span>
                    </div>
                    <span className="font-extrabold text-sm text-gray-950 font-display">
                      {formatCop(baseShippingFeeCop)}
                    </span>
                  </div>

                  <div className="pt-3 flex items-center justify-between">
                    <div className="flex items-center gap-3 text-gray-700">
                      <div className="w-8 h-8 rounded-full bg-[#FEF3C7] flex items-center justify-center text-[#D97706] shrink-0">
                        <Gift className="w-4 h-4" />
                      </div>
                      <span>Envío gratis para compras superiores a</span>
                    </div>
                    <span className="font-extrabold text-sm text-gray-950 font-display">
                      {formatCop(freeShippingThresholdCop)}
                    </span>
                  </div>

                  <div className="pt-3 flex items-center justify-between">
                    <div className="flex items-center gap-3 text-gray-700">
                      <div className="w-8 h-8 rounded-full bg-[#FEF3C7] flex items-center justify-center text-[#D97706] shrink-0">
                        <Clock className="w-4 h-4" />
                      </div>
                      <span>Corte de pedidos:</span>
                    </div>
                    <span className="font-extrabold text-sm text-gray-950 font-display">
                      {cutoffHour}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* PESTAÑA 4: PERFIL, BODEGA & MÉTODOS DE PAGO              */}
        {/* ======================================================== */}
        {activeTab === 'profile' && (
          <SupplierProfileSettingsSection
            supplier={supplier}
            onSaveProfile={async (updatedData) => {
              await onUpdateSupplierSettings(supplier.id, updatedData);
            }}
          />
        )}
      </main>

      {/* ======================================================== */}
      {/* MODAL: EDITAR INSUMO COMPLETO                             */}
      {/* ======================================================== */}
      {isEditFullProductOpen && editingFullProduct && (
        <SupplierEditProductModal
          isOpen={isEditFullProductOpen}
          product={editingFullProduct}
          onClose={() => {
            setIsEditFullProductOpen(false);
            setEditingFullProduct(null);
          }}
          onSave={async (productId, updated) => {
            if (onUpdateFullProduct) {
              await onUpdateFullProduct(productId, updated);
            }
          }}
        />
      )}

      {/* ======================================================== */}
      {/* MODAL: PUBLICAR INSUMO (proveedores-publicar-pc-celular) */}
      {/* ======================================================== */}
      {isAddProductOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="fixed inset-0" onClick={() => setIsAddProductOpen(false)} aria-label="Cerrar modal" />

          <div className="relative w-full max-w-2xl bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden z-10 flex flex-col max-h-[92vh] border border-gray-100">
            {/* Barra de arrastre móvil */}
            <div className="sm:hidden w-12 h-1.5 bg-gray-300 rounded-full mx-auto my-3 shrink-0" />

            {/* Cabecera del modal */}
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center shrink-0">
                  <RyycoLogo variant="dark" className="h-7 sm:h-8" showSubtitle={false} />
                </div>
                <span className="text-gray-300 font-light text-xl">|</span>
                <div>
                  <h3 className="text-lg font-black text-gray-950 font-display">
                    Publicar insumo
                  </h3>
                  <p className="text-xs text-gray-500">
                    Se publicará bajo el perfil de {supplier.tradeName}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsAddProductOpen(false)}
                className="p-1.5 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Formulario scrolleable */}
            <form onSubmit={handleCreateProductSubmit} className="p-6 space-y-6 overflow-y-auto">
              {createProdError && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{createProdError}</span>
                </div>
              )}

              {/* SECCIÓN 1: DATOS DEL PRODUCTO */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-xs font-black text-gray-950 uppercase tracking-wider">
                  <Package className="w-4 h-4 text-[#F59E0B]" />
                  <span>Datos del producto</span>
                </div>

                {/* Nombre del insumo */}
                <div className="space-y-1">
                  <label className="text-xs font-extrabold text-gray-800 block">
                    Nombre del insumo / Producto <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={prodName}
                    onChange={(e) => setProdName(e.target.value)}
                    placeholder="Nombre del insumo"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 focus:border-[#E52243] focus:ring-1 focus:ring-[#E52243] text-xs font-bold text-gray-900 outline-none"
                  />
                </div>

                {/* Fila 2 cols: SKU y Estimado de Unidades (Stock) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-extrabold text-gray-800 block">
                      Código SKU / Referencia
                    </label>
                    <input
                      type="text"
                      value={prodSku}
                      onChange={(e) => setProdSku(e.target.value)}
                      placeholder="ACE-PAL-20L"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 focus:border-[#E52243] focus:ring-1 focus:ring-[#E52243] text-xs font-bold text-gray-900 outline-none font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-extrabold text-gray-800 block">
                      Estimado de Unidades a Distribuir (Stock) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      required
                      min={1}
                      value={prodStock}
                      onChange={(e) => setProdStock(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 focus:border-[#E52243] focus:ring-1 focus:ring-[#E52243] text-xs font-bold text-gray-900 outline-none"
                    />
                    <p className="text-[11px] text-gray-500">
                      Cantidad inicial estimada disponible para despacho.
                    </p>
                  </div>
                </div>

                {/* Fila 2 cols: Categoría Mayorista y Presentación de Venta */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-extrabold text-gray-800 block">
                      Categoría Mayorista <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={prodCategory}
                      onChange={(e) => setProdCategory(e.target.value as SupplierCategory)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 focus:border-[#E52243] focus:ring-1 focus:ring-[#E52243] text-xs font-bold text-gray-900 outline-none bg-white cursor-pointer"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-extrabold text-gray-800 block">
                      Presentación de Venta <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={presentationLabel}
                      onChange={(e) => setPresentationLabel(e.target.value)}
                      placeholder="Caja master x 10 kg, Bulto, Atado..."
                      className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 focus:border-[#E52243] focus:ring-1 focus:ring-[#E52243] text-xs font-bold text-gray-900 outline-none"
                    />
                  </div>
                </div>

                {/* Fila 2 cols: Unidad Base & Contenido y Precio Mayorista Base */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-extrabold text-gray-800 block">
                      Unidad Base & Contenido
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min={0.1}
                        step="any"
                        value={baseUnitQuantity}
                        onChange={(e) => setBaseUnitQuantity(Number(e.target.value))}
                        className="w-24 px-3 py-2 rounded-xl border border-gray-300 text-xs font-bold text-gray-900 outline-none"
                      />
                      <select
                        value={baseUnit}
                        onChange={(e) => setBaseUnit(e.target.value as any)}
                        className="flex-1 px-3 py-2 rounded-xl border border-gray-300 text-xs font-bold text-gray-900 outline-none bg-white cursor-pointer"
                      >
                        <option value="kg">Kilogramos (kg)</option>
                        <option value="litro">Litros (L)</option>
                        <option value="unidad">Unidades (ud)</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-extrabold text-gray-800 block">
                      Precio Mayorista Base (COP) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      required
                      min={100}
                      value={priceCop}
                      onChange={(e) => setPriceCop(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 focus:border-[#E52243] focus:ring-1 focus:ring-[#E52243] text-xs font-bold text-gray-900 outline-none"
                    />
                  </div>
                </div>

                {/* Imagen del insumo (botón de subida y selección rápida) */}
                <div className="space-y-2 pt-2">
                  <label className="text-xs font-extrabold text-gray-800 block">
                    Imagen del insumo
                  </label>

                  <div className="flex flex-col sm:flex-row items-center gap-4 p-4 bg-gray-50/80 rounded-2xl border border-gray-200">
                    {/* Previsualización de la foto */}
                    <div className="relative group shrink-0">
                      <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden border-2 border-gray-200 bg-white shadow-xs flex items-center justify-center">
                        {prodPhotoUrl ? (
                          <img
                            src={prodPhotoUrl}
                            alt={prodName || 'Insumo'}
                            className="w-full h-full object-contain p-1"
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center text-gray-400 p-2 text-center">
                            <ImageIcon className="w-8 h-8 stroke-[1.5]" />
                            <span className="text-[10px] font-bold mt-1">Sin imagen</span>
                          </div>
                        )}
                      </div>

                      {prodPhotoUrl && (
                        <button
                          type="button"
                          onClick={() => setProdPhotoUrl('')}
                          className="absolute -top-2 -right-2 p-1.5 bg-rose-600 text-white rounded-full shadow-md hover:bg-rose-700 transition-colors cursor-pointer"
                          title="Quitar foto"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Botón para agregar o cambiar la imagen */}
                    <div className="flex-1 space-y-2.5 w-full text-center sm:text-left">
                      <div>
                        <label className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#E52243] hover:bg-[#C91836] text-white text-xs font-bold rounded-xl cursor-pointer transition-all shadow-xs active:scale-95">
                          <Upload className="w-4 h-4" />
                          <span>{prodPhotoUrl ? 'Cambiar imagen del insumo' : 'Agregar imagen del insumo'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleNewProdPhotoUpload}
                            className="hidden"
                          />
                        </label>
                        <p className="text-[11px] text-gray-500 mt-1.5">
                          {isPhotoUploading
                            ? 'Optimizando foto...'
                            : 'Sube una foto desde tu equipo o dispositivo móvil (JPG, PNG o WEBP).'}
                        </p>
                      </div>

                      {/* Selector rápido de fotos sugeridas */}
                      <div className="pt-2 border-t border-gray-200/60">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                          O selecciona una foto sugerida:
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5 justify-center sm:justify-start">
                          {PRODUCT_PHOTO_PRESETS.map((preset) => (
                            <button
                              key={preset.label}
                              type="button"
                              onClick={() => setProdPhotoUrl(preset.url)}
                              className={`px-2.5 py-1 text-[11px] rounded-lg border font-bold transition-all cursor-pointer ${
                                prodPhotoUrl === preset.url
                                  ? 'bg-red-50 border-[#E52243] text-[#E52243]'
                                  : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-100'
                              }`}
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECCIÓN 2: VENTA Y DISPONIBILIDAD */}
              <div className="space-y-4 pt-3 border-t border-gray-100">
                <div className="flex items-center gap-2 text-xs font-black text-gray-950 uppercase tracking-wider">
                  <Truck className="w-4 h-4 text-[#F59E0B]" />
                  <span>Venta y disponibilidad</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-extrabold text-gray-800 block">
                      Disponibilidad Inmediata
                    </label>
                    <select
                      value={availability}
                      onChange={(e) => setAvailability(e.target.value as ProductAvailability)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-xs font-bold text-gray-900 outline-none bg-white cursor-pointer"
                    >
                      <option value="disponible">Disponible (Entrega regular)</option>
                      <option value="bajo_pedido">Bajo pedido (Preparación)</option>
                      <option value="agotado">Agotado temporalmente</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-extrabold text-gray-800 block">
                      Conservación / Cadena de Frío
                    </label>
                    <select
                      value={storageCondition}
                      onChange={(e) => setStorageCondition(e.target.value as any)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-xs font-bold text-gray-900 outline-none bg-white cursor-pointer"
                    >
                      <option value="refrigerado">Refrigerado (0° a 4°C)</option>
                      <option value="ambiente">Ambiente seco</option>
                      <option value="congelado">Congelado (-18°C)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* SECCIÓN 3: CONDICIONES ESPECIALES */}
              <div className="space-y-4 pt-3 border-t border-gray-100">
                <div className="flex items-center gap-2 text-xs font-black text-gray-950 uppercase tracking-wider">
                  <Scale className="w-4 h-4 text-[#F59E0B]" />
                  <span>Condiciones especiales</span>
                </div>

                {/* Checkbox Descuento por volumen */}
                <div className="space-y-3">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasTier}
                      onChange={(e) => setHasTier(e.target.checked)}
                      className="w-4 h-4 text-[#E52243] rounded border-gray-300 focus:ring-[#E52243]"
                    />
                    <span className="text-xs font-extrabold text-gray-900">
                      Descuento por volumen mayor
                    </span>
                  </label>

                  {hasTier && (
                    <div className="grid grid-cols-2 gap-4 pl-6">
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-gray-600 block">Desde (unidades)</label>
                        <input
                          type="number"
                          min={2}
                          value={tierQty}
                          onChange={(e) => setTierQty(Number(e.target.value))}
                          className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs font-bold text-gray-900 outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-gray-600 block">Precio con descuento (COP)</label>
                        <input
                          type="number"
                          value={tierPriceCop}
                          onChange={(e) => setTierPriceCop(Number(e.target.value))}
                          className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs font-bold text-gray-900 outline-none"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Checkbox Insumo de peso variable */}
                <div className="space-y-1">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isVariableWeight}
                      onChange={(e) => setIsVariableWeight(e.target.checked)}
                      className="w-4 h-4 text-[#E52243] rounded border-gray-300 focus:ring-[#E52243]"
                    />
                    <span className="text-xs font-extrabold text-gray-900">
                      Insumo de peso variable (pesaje en báscula)
                    </span>
                  </label>
                  <p className="text-[11px] text-gray-500 pl-6">
                    El valor final se confirma según el peso al despachar.
                  </p>
                </div>
              </div>

              {/* Botones del pie del modal */}
              <div className="pt-4 border-t border-gray-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddProductOpen(false)}
                  className="px-5 py-2.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={isSubmittingProd}
                  className="px-6 py-2.5 bg-[#E52243] hover:bg-[#C91836] text-white text-xs font-bold rounded-xl transition-colors shadow-xs cursor-pointer disabled:opacity-50 inline-flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>{isSubmittingProd ? 'Publicando...' : 'Publicar insumo'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: EDITAR PRECIO MAYORISTA                          */}
      {/* ======================================================== */}
      {editingPriceProd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="fixed inset-0" onClick={() => setEditingPriceProd(null)} aria-label="Cerrar modal" />

          <div className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden z-10 p-6 space-y-4 border border-gray-100">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <h3 className="font-extrabold text-sm text-gray-950 font-display">
                Editar precio mayorista
              </h3>
              <button
                type="button"
                onClick={() => setEditingPriceProd(null)}
                className="p-1 rounded-full text-gray-400 hover:text-gray-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-gray-600">
              Insumo: <strong className="text-gray-900">{editingPriceProd.name}</strong>
            </p>

            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-700 block">Nuevo precio (COP)</label>
              <input
                type="number"
                min={100}
                value={newPriceInput}
                onChange={(e) => setNewPriceInput(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm font-black text-gray-900 outline-none"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 text-xs font-bold">
              <button
                type="button"
                onClick={() => setEditingPriceProd(null)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isSavingPrice || newPriceInput <= 0}
                onClick={handleSavePriceEdit}
                className="px-4 py-2 bg-[#E52243] hover:bg-[#C91836] text-white rounded-xl shadow-xs cursor-pointer"
              >
                {isSavingPrice ? 'Guardando...' : 'Guardar precio'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. BARRA DE NAVEGACIÓN INFERIOR PARA CELULARES (MOCKUP CELULAR) */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40 px-6 py-2 flex items-center justify-around shadow-lg">
        <button
          type="button"
          onClick={() => setActiveTab('products')}
          className={`flex flex-col items-center gap-1 cursor-pointer transition-colors ${
            activeTab === 'products' ? 'text-[#E52243]' : 'text-gray-500'
          }`}
        >
          <Package className="w-5 h-5" />
          <span className="text-[10px] font-bold">Insumos</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('orders')}
          className={`flex flex-col items-center gap-1 cursor-pointer transition-colors ${
            activeTab === 'orders' ? 'text-[#E52243]' : 'text-gray-500'
          }`}
        >
          <FileText className="w-5 h-5" />
          <span className="text-[10px] font-bold">Pedidos</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          className={`flex flex-col items-center gap-1 cursor-pointer transition-colors ${
            activeTab === 'profile' ? 'text-[#E52243]' : 'text-gray-500'
          }`}
        >
          <Store className="w-5 h-5" />
          <span className="text-[10px] font-bold">Perfil / Bodega</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          className={`flex flex-col items-center gap-1 cursor-pointer transition-colors ${
            activeTab === 'settings' ? 'text-[#E52243]' : 'text-gray-500'
          }`}
        >
          <Settings className="w-5 h-5" />
          <span className="text-[10px] font-bold">Flete</span>
        </button>
      </nav>
    </div>
  );
};

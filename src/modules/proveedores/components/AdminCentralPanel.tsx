/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  RyycoSupplier,
  SupplierApplication,
  SupplierCategory,
  SupplierStatus,
  RyycoCommissionRate,
  B2BPurchaseOrder,
  B2BOrderStatus,
  PaymentStatus,
} from '../types/ryycoB2B';
import { formatCop, sanitizeRyycoPhone } from '../utils/ryycoFormatters';
import { DEFAULT_COMMISSION_RATES } from '../firebase/b2bRepository';
import {
  ShieldCheck,
  CheckCircle2,
  Clock,
  Phone,
  Building2,
  Lock,
  Unlock,
  MessageSquare,
  XCircle,
  LogOut,
  ChevronDown,
  Percent,
  Save,
  RotateCcw,
  Info,
  AlertCircle,
  FileText,
  Check,
  PlusCircle,
  Menu,
  Tag,
  ShoppingCart,
  Activity,
  User,
  ClipboardList,
  Search,
  Filter,
  Eye,
  Package,
  MapPin,
  Calendar,
  DollarSign,
  Truck,
  ExternalLink,
  ChevronUp,
  ArrowUpDown,
  Hash,
  Users,
  Pause,
  Ban,
  AlertTriangle,
  X,
} from 'lucide-react';
import { AdminUserSession } from './AdminLoginGate';
import { RyycoLogo } from './RyycoLogo';
import { ResilientImage } from './ResilientImage';
import {
  INACTIVATE_CRITERIA_PRESETS,
  SUSPEND_CRITERIA_PRESETS,
} from './SupplierPortalView';
import { WarehouseLocationPickerMap } from './WarehouseLocationPickerMap';

interface AdminCentralPanelProps {
  suppliers: RyycoSupplier[];
  applications: SupplierApplication[];
  orders?: B2BPurchaseOrder[];
  adminSession?: AdminUserSession | null;
  commissionRates?: RyycoCommissionRate[];
  onLogoutAdmin?: () => void;
  onApproveApplication: (applicationId: string, approvedBy: string) => void;
  onRejectApplication: (applicationId: string, reason?: string) => void;
  onToggleUploadPermission: (supplierId: string) => void;
  onUpdateSupplierStatus: (
    supplierId: string,
    status: SupplierStatus,
    reason?: string
  ) => void;
  onDirectRegisterAndEnableSupplier: (
    supplier: Omit<
      RyycoSupplier,
      'id' | 'uid' | 'createdAt' | 'rating' | 'ratingCount' | 'completedB2BOrders'
    >
  ) => void;
  onSaveCommissionRates?: (rates: RyycoCommissionRate[]) => Promise<void>;
  onUpdateOrderStatus?: (
    orderId: string,
    status: B2BOrderStatus,
    note?: string,
    supplierId?: string
  ) => Promise<void>;
  onUpdatePaymentStatus?: (
    orderId: string,
    status: PaymentStatus,
    supplierId?: string
  ) => Promise<void>;
  onOpenSupplierPortal?: () => void;
}

const CATEGORIES: SupplierCategory[] = [
  'Cárnicos y Embutidos',
  'Frutas y Verduras',
  'Aceites y Abarrotes',
  'Lácteos y Quesos',
  'Empaques Biodegradables',
  'Bebidas y Licores',
];

export const AdminCentralPanel: React.FC<AdminCentralPanelProps> = ({
  suppliers,
  applications,
  orders = [],
  adminSession,
  commissionRates,
  onLogoutAdmin,
  onApproveApplication,
  onRejectApplication,
  onToggleUploadPermission,
  onUpdateSupplierStatus,
  onDirectRegisterAndEnableSupplier,
  onSaveCommissionRates,
  onUpdateOrderStatus,
  onUpdatePaymentStatus,
  onOpenSupplierPortal,
}) => {
  const [activeTab, setActiveTab] = useState<'applications' | 'suppliers_control' | 'direct_onboarding' | 'commission_table' | 'all_orders'>('applications');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [adminNoteInput, setAdminNoteInput] = useState('');
  const [openAppMenuId, setOpenAppMenuId] = useState<string | null>(null);
  const [openSupplierMenuId, setOpenSupplierMenuId] = useState<string | null>(null);

  // Estados para Modal de Criterio de Suspensión / Inactivación
  const [selectedSupplierForStatus, setSelectedSupplierForStatus] = useState<RyycoSupplier | null>(null);
  const [targetStatusAction, setTargetStatusAction] = useState<'inactive' | 'suspended' | null>(null);
  const [selectedPresetReason, setSelectedPresetReason] = useState<string>(INACTIVATE_CRITERIA_PRESETS[0]);
  const [customReasonDetails, setCustomReasonDetails] = useState<string>('');
  const [isSavingStatus, setIsSavingStatus] = useState<boolean>(false);

  const handleOpenStatusModal = (supplier: RyycoSupplier, action: 'inactive' | 'suspended') => {
    setSelectedSupplierForStatus(supplier);
    setTargetStatusAction(action);
    const presets = action === 'inactive' ? INACTIVATE_CRITERIA_PRESETS : SUSPEND_CRITERIA_PRESETS;
    setSelectedPresetReason(presets[0]);
    setCustomReasonDetails('');
    setOpenSupplierMenuId(null);
  };

  const handleConfirmStatusChange = async () => {
    if (!selectedSupplierForStatus || !targetStatusAction || !onUpdateSupplierStatus) return;
    setIsSavingStatus(true);
    try {
      const finalReason = customReasonDetails.trim()
        ? `${selectedPresetReason}: ${customReasonDetails.trim()}`
        : selectedPresetReason;

      await onUpdateSupplierStatus(selectedSupplierForStatus.id, targetStatusAction, finalReason);
      setSuccessBanner(
        `Proveedor "${selectedSupplierForStatus.tradeName}" actualizado a estado ${
          targetStatusAction === 'inactive' ? 'Inactivo / Pausado' : 'Suspendido'
        }.`
      );
      setSelectedSupplierForStatus(null);
      setTargetStatusAction(null);
      setTimeout(() => setSuccessBanner(null), 4000);
    } catch (err) {
      console.error('Error al actualizar estado:', err);
    } finally {
      setIsSavingStatus(false);
    }
  };

  const handleDirectActivate = async (supplier: RyycoSupplier) => {
    if (!onUpdateSupplierStatus) return;
    setIsSavingStatus(true);
    try {
      await onUpdateSupplierStatus(supplier.id, 'active', 'Reactivado y habilitado por RYYCO Central');
      setSuccessBanner(`Proveedor "${supplier.tradeName}" reactivado y habilitado para operar.`);
      setOpenSupplierMenuId(null);
      setTimeout(() => setSuccessBanner(null), 4000);
    } catch (err) {
      console.error('Error al reactivar:', err);
    } finally {
      setIsSavingStatus(false);
    }
  };

  // Estados para la sección de Todos los Pedidos de Proveedores
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [orderSupplierFilter, setOrderSupplierFilter] = useState('all');
  const [orderStatusFilter, setOrderStatusFilter] = useState('all');
  const [orderPaymentFilter, setOrderPaymentFilter] = useState('all');
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [orderUpdatingId, setOrderUpdatingId] = useState<string | null>(null);

  // Estado y edición de la Tabla de Comisiones RYYCO
  const [ratesList, setRatesList] = useState<RyycoCommissionRate[]>(() => {
    return commissionRates && commissionRates.length > 0 ? commissionRates : DEFAULT_COMMISSION_RATES;
  });
  const [isSavingRates, setIsSavingRates] = useState(false);
  const [ratesSuccessMsg, setRatesSuccessMsg] = useState<string | null>(null);
  const [simulationOrderAmount, setSimulationOrderAmount] = useState<number>(250000);

  React.useEffect(() => {
    if (commissionRates && commissionRates.length > 0) {
      setRatesList(commissionRates);
    }
  }, [commissionRates]);

  const handleUpdateRatePercent = (rateId: string, newPercentage: number) => {
    setRatesList((prev) =>
      prev.map((r) => (r.id === rateId ? { ...r, percentage: Number(newPercentage) } : r))
    );
  };

  const handleSaveRatesToFirestore = async () => {
    if (!onSaveCommissionRates) return;
    setIsSavingRates(true);
    try {
      await onSaveCommissionRates(ratesList);
      setRatesSuccessMsg('¡Cambios guardados con éxito!');
      setTimeout(() => setRatesSuccessMsg(null), 3500);
    } catch {
      // handled
    } finally {
      setIsSavingRates(false);
    }
  };

  const handleResetDefaultRates = () => {
    setRatesList(DEFAULT_COMMISSION_RATES);
  };

  // Formulario de onboarding directo por RYYCO Central
  const [directTradeName, setDirectTradeName] = useState('');
  const [directBusinessName, setDirectBusinessName] = useState('');
  const [directNit, setDirectNit] = useState('');
  const [directCategory, setDirectCategory] = useState<SupplierCategory>('Cárnicos y Embutidos');
  const [directAddress, setDirectAddress] = useState('');
  const [directCity, setDirectCity] = useState('Ipiales');
  const [directCoords, setDirectCoords] = useState<{ lat: number; lng: number }>({ lat: 0.8305, lng: -77.6462 });
  const [directPhone, setDirectPhone] = useState('');
  const [directEmail, setDirectEmail] = useState('');
  const [directMinOrder, setDirectMinOrder] = useState(150000);
  const [directFreeShipping, setDirectFreeShipping] = useState(400000);
  const [directLeadHours, setDirectLeadHours] = useState(4);
  const [enableCatalogImmediately, setEnableCatalogImmediately] = useState(true);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [directErrorMsg, setDirectErrorMsg] = useState<string | null>(null);

  const pendingApps = applications.filter((a) => a.status === 'pending');
  const historicalApps = applications.filter((a) => a.status !== 'pending');

  // Deduplicación estricta de historial por ID o NIT
  // Historial exclusivo desde Cloud Firestore
  const displayHistory = React.useMemo(() => {
    const seen = new Set<string>();
    return historicalApps.filter((a) => {
      if (!a || !a.id || seen.has(a.id)) return false;
      seen.add(a.id);
      return true;
    });
  }, [historicalApps]);

  const filteredSuppliers = React.useMemo(() => {
    const seen = new Set<string>();
    const unique = suppliers.filter((s) => {
      if (!s || !s.id) return false;
      const cleanNit = (s.nit || '').trim();
      if (seen.has(s.id) || (cleanNit && seen.has(cleanNit))) return false;
      seen.add(s.id);
      if (cleanNit) seen.add(cleanNit);
      return true;
    });
    return filterCategory === 'all'
      ? unique
      : unique.filter((s) => s.category === filterCategory);
  }, [suppliers, filterCategory]);

  const safeOrders = orders || [];

  const filteredAllOrders = React.useMemo(() => {
    return safeOrders.filter((ord) => {
      if (orderSupplierFilter !== 'all' && ord.supplierId !== orderSupplierFilter) {
        return false;
      }
      if (orderStatusFilter !== 'all' && ord.status !== orderStatusFilter) {
        return false;
      }
      if (orderPaymentFilter !== 'all' && ord.paymentStatus !== orderPaymentFilter) {
        return false;
      }
      if (orderSearchQuery.trim()) {
        const query = orderSearchQuery.toLowerCase();
        const codeMatch = ord.code?.toLowerCase().includes(query);
        const restMatch = ord.restaurantName?.toLowerCase().includes(query);
        const userMatch = ord.restaurantUsername?.toLowerCase().includes(query);
        const supMatch = ord.supplierTradeName?.toLowerCase().includes(query);
        const cityMatch = ord.restaurantCity?.toLowerCase().includes(query);
        const phoneMatch = ord.restaurantPhone?.includes(query) || ord.supplierSalesWhatsapp?.includes(query);
        if (!codeMatch && !restMatch && !userMatch && !supMatch && !cityMatch && !phoneMatch) {
          return false;
        }
      }
      return true;
    });
  }, [safeOrders, orderSupplierFilter, orderStatusFilter, orderPaymentFilter, orderSearchQuery]);

  const totalOrdersAmount = React.useMemo(() => {
    return safeOrders.reduce((sum, o) => sum + (o.totalAmountCop || 0), 0);
  }, [safeOrders]);

  const totalRyycoCommissions = React.useMemo(() => {
    return safeOrders.reduce((sum, o) => sum + (o.ryycoFeeCop || 0), 0);
  }, [safeOrders]);

  const activeOrdersCount = React.useMemo(() => {
    return safeOrders.filter((o) => o.status !== 'entregado' && o.status !== 'cancelado').length;
  }, [safeOrders]);

  const getOrderStatusBadge = (status: B2BOrderStatus) => {
    switch (status) {
      case 'pendiente_confirmacion':
        return {
          label: 'Pendiente confirmación',
          bg: 'bg-amber-50 text-amber-800 border-amber-200',
          dot: 'bg-amber-500',
        };
      case 'confirmado':
        return {
          label: 'Confirmado por proveedor',
          bg: 'bg-blue-50 text-blue-800 border-blue-200',
          dot: 'bg-blue-500',
        };
      case 'en_preparacion':
        return {
          label: 'En preparación (Bodega)',
          bg: 'bg-purple-50 text-purple-800 border-purple-200',
          dot: 'bg-purple-500',
        };
      case 'en_camino':
        return {
          label: 'En camino / Despachado',
          bg: 'bg-indigo-50 text-indigo-800 border-indigo-200',
          dot: 'bg-indigo-500',
        };
      case 'listo_recoger':
        return {
          label: 'Listo para recoger',
          bg: 'bg-sky-50 text-sky-800 border-sky-200',
          dot: 'bg-sky-500',
        };
      case 'entregado':
        return {
          label: 'Entregado con éxito',
          bg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
          dot: 'bg-emerald-500',
        };
      case 'cancelado':
        return {
          label: 'Cancelado / Rechazado',
          bg: 'bg-rose-50 text-rose-800 border-rose-200',
          dot: 'bg-rose-500',
        };
      case 'propuesta_cambios':
        return {
          label: 'Propuesta de ajustes',
          bg: 'bg-orange-50 text-orange-800 border-orange-200',
          dot: 'bg-orange-500',
        };
      default:
        return {
          label: status,
          bg: 'bg-gray-100 text-gray-800 border-gray-200',
          dot: 'bg-gray-400',
        };
    }
  };

  const handleApprove = (app: SupplierApplication) => {
    const reviewer = adminSession?.displayName || adminSession?.email || 'SuperAdmin RYYCO Central';
    onApproveApplication(app.id, reviewer);
    setSuccessBanner(`Proveedor "${app.tradeName}" aprobado y habilitado con éxito.`);
    setTimeout(() => setSuccessBanner(null), 3000);
  };

  const handleReject = (appId: string) => {
    onRejectApplication(appId, adminNoteInput || 'No cumple requisitos mínimos sanitarios o comerciales.');
    setSelectedAppId(null);
    setAdminNoteInput('');
  };

  const handleDirectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setDirectErrorMsg(null);

    const cleanTrade = directTradeName.trim();
    const cleanNit = directNit.trim();
    const cleanEmail = directEmail.trim().toLowerCase();

    if (!cleanTrade) {
      setDirectErrorMsg('Por favor ingresa el nombre comercial de la empresa.');
      return;
    }
    if (!cleanNit) {
      setDirectErrorMsg('Por favor ingresa el NIT o identificación tributaria.');
      return;
    }
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setDirectErrorMsg('Por favor ingresa el correo electrónico con el que el proveedor iniciará sesión.');
      return;
    }

    onDirectRegisterAndEnableSupplier({
      nit: cleanNit,
      businessName: directBusinessName.trim() || `${cleanTrade} S.A.S.`,
      tradeName: cleanTrade,
      slug: cleanTrade.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      category: directCategory,
      categories: [directCategory],
      city: directCity.trim() || 'Ipiales',
      address: directAddress.trim() || 'Zona Industrial Ipiales, Nariño',
      servedZones: ['Centro', 'Área Metropolitana Ipiales'],
      lat: directCoords.lat,
      lng: directCoords.lng,
      salesWhatsapp: sanitizeRyycoPhone(directPhone || '3158009900'),
      email: cleanEmail,
      googleEmail: cleanEmail,
      supportChannel: 'ambos',
      minOrderCop: directMinOrder,
      paymentMethodsAccepted: ['Transferencia Bancolombia / Nequi', 'Contraentrega Efectivo'],
      paymentTiming: 'ambos',
      orderCutoffHour: '14:00',
      disputeReportingWindowHours: 24,
      offeredSolutions: ['reposicion', 'devolucion', 'ajuste_cobro'],
      deliveryOptions: ['entrega_proveedor', 'recogida_restaurante'],
      transportResponsible: 'proveedor',
      deliveryDays: ['Lunes', 'Miércoles', 'Viernes'],
      deliveryTimeWindow: '08:00 - 12:00',
      freeShippingThresholdCop: directFreeShipping,
      baseShippingFeeCop: 10000,
      leadTimeHours: directLeadHours,
      verifiedByRyyco: true,
      canUploadProducts: enableCatalogImmediately,
      status: enableCatalogImmediately ? 'active' : 'pending_verification',
      approvedAt: enableCatalogImmediately ? new Date().toISOString() : undefined,
      approvedBy: enableCatalogImmediately ? 'SuperAdmin RYYCO Central' : undefined,
      acceptsCredit15Days: true,
      acceptsCredit30Days: false,
      bankAccounts: [],
      active: true,
    });

    setDirectTradeName('');
    setDirectBusinessName('');
    setDirectNit('');
    setDirectAddress('');
    setDirectPhone('');
    setDirectEmail('');
    setDirectErrorMsg(null);
    setSuccessBanner(`Proveedor "${cleanTrade}" registrado con acceso autorizado para "${cleanEmail}".`);
    setTimeout(() => setSuccessBanner(null), 3500);
    setActiveTab('suppliers_control');
  };

  return (
    <div className="space-y-6 pb-28 md:pb-8 max-w-7xl mx-auto px-3 sm:px-6 text-gray-900">
      {/* =========================================================================
          BARRA DE IDENTIDAD Y NAVEGACIÓN SUPERIOR (ADAPTADO PC & CELULAR)
          ========================================================================= */}
      
      {/* Header PC */}
      <div className="hidden md:flex items-center justify-between pb-4 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <RyycoLogo variant="dark" className="h-8" showSubtitle={false} />
          <span className="text-gray-300 font-light text-2xl">|</span>
          <h1 className="text-2xl font-black text-gray-950 font-display">Administración</h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
            <User className="w-4 h-4 text-gray-400" />
            <span>{adminSession?.email || 'admin@ryyco.co'}</span>
          </div>

          <span className="px-3 py-1 rounded-full bg-[#FEF3C7] text-[#92400E] text-xs font-bold uppercase tracking-wider">
            {adminSession?.role || 'SuperAdmin Operaciones'}
          </span>

          {onOpenSupplierPortal && (
            <button
              type="button"
              onClick={onOpenSupplierPortal}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-white border border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-800 text-xs font-bold rounded-xl shadow-2xs transition-colors cursor-pointer"
              title="Ver portal Red de Proveedores"
            >
              <Users className="w-4 h-4 text-gray-600" />
              <span>Red de proveedores</span>
            </button>
          )}

          {onLogoutAdmin && (
            <button
              type="button"
              onClick={onLogoutAdmin}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-700 hover:text-gray-950 transition-colors ml-2 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Cerrar sesión</span>
            </button>
          )}
        </div>
      </div>

      {/* Header Celular */}
      <div className="md:hidden space-y-3 pb-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RyycoLogo variant="dark" className="h-7" showSubtitle={false} />
            <span className="text-gray-300 font-light text-xl">|</span>
            <h1 className="text-xl font-black text-gray-950 font-display">Administración</h1>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab(activeTab === 'applications' ? 'commission_table' : 'applications')}
            className="p-1.5 text-gray-700 hover:text-gray-950"
            aria-label="Menú"
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5 truncate">
            <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <span className="font-semibold text-gray-800 truncate">{adminSession?.email || 'admin@ryyco.co'}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="px-2.5 py-0.5 rounded-full bg-[#FEF3C7] text-[#92400E] text-[10px] font-black uppercase tracking-wider">
              {adminSession?.role || 'SuperAdmin Operaciones'}
            </span>
            {onOpenSupplierPortal && (
              <button
                type="button"
                onClick={onOpenSupplierPortal}
                className="text-gray-700 hover:text-gray-950 p-1 rounded-lg hover:bg-gray-100 transition-colors"
                title="Ver Red de Proveedores"
              >
                <Users className="w-4 h-4 text-gray-700" />
              </button>
            )}
            {onLogoutAdmin && (
              <button
                type="button"
                onClick={onLogoutAdmin}
                className="text-gray-600 hover:text-gray-900 p-1"
                title="Cerrar sesión"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* =========================================================================
          PESTAÑAS DE CONTROL (PC Y CELULAR)
          ========================================================================= */}
      
      {/* Pestañas PC */}
      <div className="hidden md:flex items-center justify-between gap-2 p-1.5 bg-white border border-gray-200 rounded-2xl shadow-xs">
        <button
          type="button"
          onClick={() => setActiveTab('applications')}
          className={`flex-1 py-3 px-3 text-sm font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            activeTab === 'applications'
              ? 'bg-[#E52243] text-white shadow-xs'
              : 'text-gray-700 hover:text-gray-950 hover:bg-gray-50'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Solicitudes</span>
          {pendingApps.length > 0 && (
            <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${
              activeTab === 'applications' ? 'bg-white text-[#E52243]' : 'bg-red-100 text-[#E52243]'
            }`}>
              {pendingApps.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('suppliers_control')}
          className={`flex-1 py-3 px-3 text-sm font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            activeTab === 'suppliers_control'
              ? 'bg-[#E52243] text-white shadow-xs'
              : 'text-gray-700 hover:text-gray-950 hover:bg-gray-50'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Habilitaciones ({suppliers.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('direct_onboarding')}
          className={`flex-1 py-3 px-3 text-sm font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            activeTab === 'direct_onboarding'
              ? 'bg-[#E52243] text-white shadow-xs'
              : 'text-gray-700 hover:text-gray-950 hover:bg-gray-50'
          }`}
        >
          <PlusCircle className="w-4 h-4" />
          <span>Alta directa</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('all_orders')}
          className={`flex-1 py-3 px-3 text-sm font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            activeTab === 'all_orders'
              ? 'bg-[#E52243] text-white shadow-xs'
              : 'text-gray-700 hover:text-gray-950 hover:bg-gray-50'
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          <span>Todos los pedidos</span>
          {safeOrders.length > 0 && (
            <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${
              activeTab === 'all_orders' ? 'bg-white text-[#E52243]' : 'bg-red-100 text-[#E52243]'
            }`}>
              {safeOrders.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('commission_table')}
          className={`flex-1 py-3 px-3 text-sm font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            activeTab === 'commission_table'
              ? 'bg-[#E52243] text-white shadow-xs'
              : 'text-gray-700 hover:text-gray-950 hover:bg-gray-50'
          }`}
        >
          <Percent className="w-4 h-4" />
          <span>Comisiones</span>
        </button>

        {onOpenSupplierPortal && (
          <button
            type="button"
            onClick={onOpenSupplierPortal}
            className="flex-1 py-3 px-3 text-sm font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 text-gray-700 hover:text-gray-950 hover:bg-gray-50 border border-gray-200"
            title="Abrir vista de Red de Proveedores"
          >
            <Users className="w-4 h-4 text-amber-600" />
            <span>Red de proveedores</span>
          </button>
        )}
      </div>

      {/* Pestañas Celular Superior (Fila compacta) */}
      <div className="md:hidden grid grid-cols-5 gap-1 p-1 bg-white border border-gray-200 rounded-xl shadow-xs text-xs">
        <button
          type="button"
          onClick={() => setActiveTab('applications')}
          className={`py-2 px-1 text-center font-bold rounded-lg flex flex-col items-center gap-1 transition-all ${
            activeTab === 'applications'
              ? 'bg-[#E52243] text-white shadow-xs'
              : 'text-gray-700 hover:text-gray-950'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span className="text-[10px] leading-tight">Solicitudes</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('suppliers_control')}
          className={`py-2 px-1 text-center font-bold rounded-lg flex flex-col items-center gap-1 transition-all ${
            activeTab === 'suppliers_control'
              ? 'bg-[#E52243] text-white shadow-xs'
              : 'text-gray-700 hover:text-gray-950'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span className="text-[10px] leading-tight">Habilitar</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('direct_onboarding')}
          className={`py-2 px-1 text-center font-bold rounded-lg flex flex-col items-center gap-1 transition-all ${
            activeTab === 'direct_onboarding'
              ? 'bg-[#E52243] text-white shadow-xs'
              : 'text-gray-700 hover:text-gray-950'
          }`}
        >
          <PlusCircle className="w-4 h-4" />
          <span className="text-[10px] leading-tight">Alta</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('all_orders')}
          className={`py-2 px-1 text-center font-bold rounded-lg flex flex-col items-center gap-1 transition-all relative ${
            activeTab === 'all_orders'
              ? 'bg-[#E52243] text-white shadow-xs'
              : 'text-gray-700 hover:text-gray-950'
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          <span className="text-[10px] leading-tight">Pedidos ({safeOrders.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('commission_table')}
          className={`py-2 px-1 text-center font-bold rounded-lg flex flex-col items-center gap-1 transition-all ${
            activeTab === 'commission_table'
              ? 'bg-[#E52243] text-white shadow-xs'
              : 'text-gray-700 hover:text-gray-950'
          }`}
        >
          <Percent className="w-4 h-4" />
          <span className="text-[10px] leading-tight">Comisión</span>
        </button>
      </div>

      {/* Banners de estado */}
      {successBanner && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl flex items-center gap-3 text-sm shadow-xs animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span className="font-semibold">{successBanner}</span>
        </div>
      )}

      {ratesSuccessMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl flex items-center gap-3 text-sm shadow-xs animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span className="font-bold">{ratesSuccessMsg}</span>
        </div>
      )}

      {/* =========================================================================
          PESTAÑA 1: SOLICITUDES DE PROVEEDORES
          ========================================================================= */}
      {activeTab === 'applications' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-3xl font-black text-gray-950 font-display tracking-tight">
              Solicitudes de proveedores
            </h2>
            <p className="text-sm font-medium text-gray-500 mt-1">
              Revisa las postulaciones y habilita nuevos proveedores.
            </p>
          </div>

          {/* Tarjetas de conteo y WhatsApp */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between sm:justify-start sm:gap-3 shadow-xs">
              <div className="flex items-center gap-2.5 text-sm font-semibold text-gray-700">
                <Clock className="w-4 h-4 text-amber-500" />
                <span>Pendientes de revisión</span>
              </div>
              <span className="text-base font-black text-gray-950 font-mono">
                {pendingApps.length}
              </span>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-2.5 text-sm font-medium text-gray-700 shadow-xs">
              <Phone className="w-4 h-4 text-amber-500 shrink-0" />
              <span>WhatsApp RYYCO Central · <strong>+57 316 416 7447</strong></span>
            </div>
          </div>

          {/* Tarjeta de estado de solicitudes pendientes */}
          {pendingApps.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-2xl sm:rounded-3xl p-10 sm:p-12 text-center space-y-2 shadow-xs">
              <div className="w-14 h-14 rounded-full border-2 border-emerald-500 flex items-center justify-center text-emerald-500 mx-auto mb-3">
                <Check className="w-7 h-7 stroke-[2.5]" />
              </div>
              <h3 className="text-xl font-black text-gray-950 font-display">
                Todas las solicitudes están gestionadas
              </h3>
              <p className="text-xs text-gray-500 max-w-sm mx-auto">
                No hay empresas pendientes de revisión.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {pendingApps.map((app) => (
                <div
                  key={app.id}
                  className="bg-white border border-gray-200 rounded-2xl p-5 sm:p-6 space-y-4 shadow-xs"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span className="font-bold text-gray-900">{app.category}</span>
                        <span>·</span>
                        <span>{app.city}</span>
                        <span>·</span>
                        <span>NIT {app.nit}</span>
                      </div>
                      <h4 className="text-lg font-black text-gray-950 font-display">
                        {app.tradeName}
                      </h4>
                      <p className="text-xs text-gray-500">
                        Razón Social: {app.businessName} · Contacto: {app.contactName} ({app.contactWhatsapp})
                      </p>
                    </div>

                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setOpenAppMenuId(openAppMenuId === app.id ? null : app.id)}
                        className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold bg-white hover:bg-gray-50 text-gray-900 border border-gray-200 rounded-xl transition-all shadow-xs cursor-pointer"
                      >
                        <ShieldCheck className="w-4 h-4 text-[#E52243]" />
                        <span>Acciones de Admisión</span>
                        <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                      </button>

                      {openAppMenuId === app.id && (
                        <div className="absolute right-0 mt-1.5 w-60 bg-white border border-gray-200 rounded-xl shadow-xl py-1.5 z-20 text-xs">
                          <button
                            type="button"
                            onClick={() => {
                              handleApprove(app);
                              setOpenAppMenuId(null);
                            }}
                            className="w-full px-3.5 py-2.5 text-left text-emerald-700 hover:bg-emerald-50 font-bold flex items-center gap-2 transition-colors cursor-pointer"
                          >
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            <span>Aprobar y Habilitar Proveedor</span>
                          </button>

                          <a
                            href={`https://wa.me/${app.contactWhatsapp}?text=${encodeURIComponent(
                              `Hola ${app.contactName}, nos comunicamos desde RYYCO Central respecto a su solicitud de vinculación como proveedor B2B para ${app.tradeName}.`
                            )}`}
                            target="_blank"
                            rel="noreferrer"
                            onClick={() => setOpenAppMenuId(null)}
                            className="w-full px-3.5 py-2.5 text-left text-gray-700 hover:bg-gray-50 font-semibold flex items-center gap-2 transition-colors"
                          >
                            <Phone className="w-4 h-4 text-[#D97706]" />
                            <span>Contactar por WhatsApp</span>
                          </a>

                          <div className="my-1 border-t border-gray-100" />

                          <button
                            type="button"
                            onClick={() => {
                              setSelectedAppId(app.id);
                              setOpenAppMenuId(null);
                            }}
                            className="w-full px-3.5 py-2.5 text-left text-red-600 hover:bg-red-50 font-semibold flex items-center gap-2 transition-colors cursor-pointer"
                          >
                            <XCircle className="w-4 h-4 text-red-500" />
                            <span>Rechazar Solicitud</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {app.message && (
                    <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200 text-xs text-gray-700">
                      <p className="font-bold text-gray-900 mb-1 flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5 text-[#D97706]" />
                        <span>Mensaje de la empresa:</span>
                      </p>
                      <p className="leading-relaxed">"{app.message}"</p>
                    </div>
                  )}

                  {selectedAppId === app.id && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-3 text-xs">
                      <p className="font-bold text-red-800">
                        Motivo de rechazo de la solicitud:
                      </p>
                      <input
                        type="text"
                        value={adminNoteInput}
                        onChange={(e) => setAdminNoteInput(e.target.value)}
                        placeholder="Ej. Inconsistencia en certificado de sanidad o capacidad de distribución."
                        className="w-full px-3.5 py-2.5 bg-white border border-red-200 text-gray-900 rounded-xl focus:outline-none focus:border-red-500"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedAppId(null)}
                          className="px-3.5 py-2 text-gray-600 hover:text-gray-900 font-semibold cursor-pointer"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReject(app.id)}
                          className="px-4 py-2 bg-[#E52243] hover:bg-[#C91836] text-white font-bold rounded-xl cursor-pointer"
                        >
                          Confirmar Rechazo
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Historial de solicitudes */}
          <div className="space-y-3 pt-2">
            <h3 className="text-xl font-black text-gray-950 font-display">
              Historial de solicitudes ({displayHistory.length})
            </h3>

            {displayHistory.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center text-xs text-gray-500 shadow-xs">
                No hay solicitudes en el historial todavía.
              </div>
            ) : (
              <>
                {/* Tabla en PC */}
                <div className="hidden md:block bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xs">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-gray-50/70 border-b border-gray-200 text-gray-700 font-bold">
                        <th className="py-3.5 px-5">Empresa</th>
                        <th className="py-3.5 px-4">Categoría</th>
                        <th className="py-3.5 px-4">Contacto</th>
                        <th className="py-3.5 px-4">Estado</th>
                        <th className="py-3.5 px-5">Observaciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-gray-700">
                      {displayHistory.map((hApp) => (
                        <tr key={hApp.id} className="hover:bg-gray-50/60 transition-colors">
                          <td className="py-4 px-5 font-black text-gray-950 text-sm">
                            {hApp.tradeName}
                          </td>
                          <td className="py-4 px-4 font-medium text-gray-800">
                            {hApp.category}
                          </td>
                          <td className="py-4 px-4 font-mono font-medium text-gray-700">
                            {hApp.contactWhatsapp}
                          </td>
                          <td className="py-4 px-4">
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              {hApp.status === 'approved' ? 'Aprobado y habilitado' : hApp.status === 'reviewed' ? 'En revisión' : 'Rechazado'}
                            </span>
                          </td>
                          <td className="py-4 px-5 text-gray-500 max-w-xs leading-relaxed">
                            {hApp.adminNote || 'Aprobado por SuperAdmin RYYCO Central. Perfil habilitado para carga de insumos.'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Tarjetas en Celular */}
                <div className="md:hidden space-y-3">
                  {displayHistory.map((hApp) => (
                    <div key={hApp.id} className="bg-white border border-gray-200 rounded-2xl p-4 space-y-2.5 text-xs shadow-xs">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-gray-500 font-medium">
                          <Building2 className="w-4 h-4 text-gray-400" />
                          <span>Empresa:</span>
                        </span>
                        <strong className="text-gray-950 font-black text-sm">{hApp.tradeName}</strong>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-gray-500 font-medium">
                          <Tag className="w-4 h-4 text-gray-400" />
                          <span>Categoría:</span>
                        </span>
                        <span className="text-gray-800 font-medium">{hApp.category}</span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-gray-500 font-medium">
                          <Phone className="w-4 h-4 text-gray-400" />
                          <span>Contacto:</span>
                        </span>
                        <span className="text-gray-800 font-mono font-medium">{hApp.contactWhatsapp}</span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-gray-500 font-medium">
                          <ShieldCheck className="w-4 h-4 text-gray-400" />
                          <span>Estado:</span>
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[11px]">
                          Aprobado y habilitado
                        </span>
                      </div>

                      <div className="pt-2 border-t border-gray-100 flex items-start gap-1.5 text-gray-500">
                        <FileText className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-semibold text-gray-700">Observaciones: </span>
                          <span>{hApp.adminNote || 'Aprobado por SuperAdmin RYYCO Central. Perfil habilitado para carga de insumos.'}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          PESTAÑA 2: HABILITACIÓN DE PROVEEDORES
          ========================================================================= */}
      {activeTab === 'suppliers_control' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-3xl font-black text-gray-950 font-display tracking-tight">
              Habilitación de proveedores
            </h2>
            <p className="text-sm font-medium text-gray-500 mt-1">
              Controla quién puede publicar insumos y actualizar precios.
            </p>
          </div>

          {/* Banner amarillo e selector de categorías */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex-1 bg-[#FEF3C7] border border-[#FDE68A] text-[#92400E] rounded-xl px-4 py-3 text-xs sm:text-sm font-medium flex items-center gap-2.5 shadow-xs">
              <Info className="w-4 h-4 text-[#D97706] shrink-0" />
              <span>Solo los proveedores habilitados pueden cargar productos en el catálogo.</span>
            </div>

            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-xs sm:text-sm font-bold text-gray-800 shadow-xs focus:outline-none focus:border-[#E52243] cursor-pointer"
            >
              <option value="all">Todas las categorías</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Vista PC: Tabla de Proveedores */}
          <div className="hidden md:block bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50/70 border-b border-gray-200 text-gray-700 font-bold">
                  <th className="py-3.5 px-5">Proveedor</th>
                  <th className="py-3.5 px-4">Línea de insumos</th>
                  <th className="py-3.5 px-4">WhatsApp</th>
                  <th className="py-3.5 px-4">Estado operativo</th>
                  <th className="py-3.5 px-4 text-center">Permiso de publicación</th>
                  <th className="py-3.5 px-5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredSuppliers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-gray-500">
                      No hay proveedores en la categoría seleccionada.
                    </td>
                  </tr>
                ) : (
                  filteredSuppliers.map((sup) => (
                    <tr key={sup.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="py-4 px-5">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-[#D97706] flex items-center justify-center shrink-0 shadow-xs overflow-hidden">
                            {sup.logoUrl ? (
                              <img src={sup.logoUrl} alt={sup.tradeName} className="w-full h-full object-cover" />
                            ) : (
                              <Building2 className="w-5 h-5" />
                            )}
                          </div>
                          <div>
                            <p className="font-black text-gray-950 text-sm">
                              {sup.tradeName}
                            </p>
                            <p className="text-xs text-gray-400">
                              NIT {sup.nit} · {sup.city}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="py-4 px-4 text-xs">
                        <p className="font-bold text-gray-900">{sup.category}</p>
                        <p className="text-gray-400">
                          Pedido mínimo {formatCop(sup.minOrderCop)}
                        </p>
                      </td>

                      <td className="py-4 px-4 font-mono font-bold text-[#D97706] text-xs">
                        {sup.salesWhatsapp}
                      </td>

                      <td className="py-4 px-4">
                        <div className="space-y-1">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                            sup.status === 'active'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : sup.status === 'inactive'
                              ? 'bg-slate-100 text-slate-700 border border-slate-200'
                              : sup.status === 'suspended'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}>
                            <span className="w-1.5 h-1.5 rounded-full bg-current" />
                            <span>
                              {sup.status === 'active'
                                ? 'Activo en ecosistema'
                                : sup.status === 'inactive'
                                ? 'Inactivo / Pausado'
                                : sup.status === 'suspended'
                                ? 'Suspendido'
                                : 'Pendiente'}
                            </span>
                          </span>
                          {sup.statusReason && sup.status !== 'active' && (
                            <p className="text-[10px] text-gray-500 font-medium max-w-xs truncate" title={sup.statusReason}>
                              {sup.statusReason}
                            </p>
                          )}
                        </div>
                      </td>

                      <td className="py-4 px-4 text-center">
                        {sup.canUploadProducts ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600">
                            <Unlock className="w-4 h-4" />
                            <span>Habilitado</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-400">
                            <Lock className="w-4 h-4" />
                            <span>Bloqueado</span>
                          </span>
                        )}
                      </td>

                      <td className="py-4 px-5 text-right">
                        <div className="relative inline-block text-left">
                          <button
                            type="button"
                            onClick={() => setOpenSupplierMenuId(openSupplierMenuId === sup.id ? null : sup.id)}
                            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-white hover:bg-gray-50 text-gray-800 border border-gray-200 rounded-xl transition-all shadow-xs cursor-pointer"
                          >
                            <span>Opciones</span>
                            <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                          </button>

                          {openSupplierMenuId === sup.id && (
                            <div className="absolute right-0 mt-1.5 w-60 bg-white border border-gray-200 rounded-xl shadow-xl py-1.5 z-20 text-xs text-left animate-in fade-in duration-150">
                              <div className="px-3.5 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-gray-100 flex items-center justify-between">
                                <span>Criterio Admin</span>
                                <span className="font-mono text-[9px]">{sup.status}</span>
                              </div>

                              {sup.status !== 'active' && (
                                <button
                                  type="button"
                                  onClick={() => handleDirectActivate(sup)}
                                  className="w-full px-3.5 py-2.5 font-bold flex items-center gap-2 text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer"
                                >
                                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                  <span>Habilitar / Activar Proveedor</span>
                                </button>
                              )}

                              {sup.status !== 'inactive' && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenStatusModal(sup, 'inactive')}
                                  className="w-full px-3.5 py-2.5 font-bold flex items-center gap-2 text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                                >
                                  <Pause className="w-4 h-4 text-slate-600 shrink-0" />
                                  <span>Inactivar Proveedor (Pausa)...</span>
                                </button>
                              )}

                              {sup.status !== 'suspended' && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenStatusModal(sup, 'suspended')}
                                  className="w-full px-3.5 py-2.5 font-bold flex items-center gap-2 text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer"
                                >
                                  <Ban className="w-4 h-4 text-rose-600 shrink-0" />
                                  <span>Suspender Proveedor (Sanción)...</span>
                                </button>
                              )}

                              <div className="my-1 border-t border-gray-100" />

                              <button
                                type="button"
                                onClick={() => {
                                  onToggleUploadPermission(sup.id);
                                  setOpenSupplierMenuId(null);
                                }}
                                className="w-full px-3.5 py-2.5 font-bold flex items-center gap-2 hover:bg-gray-50 transition-colors cursor-pointer text-gray-800"
                              >
                                {sup.canUploadProducts ? (
                                  <>
                                    <Lock className="w-4 h-4 text-amber-500 shrink-0" />
                                    <span>Bloquear Subida de Insumos</span>
                                  </>
                                ) : (
                                  <>
                                    <Unlock className="w-4 h-4 text-emerald-600 shrink-0" />
                                    <span>Habilitar Subida de Insumos</span>
                                  </>
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Vista Celular: Tarjetas de Proveedor */}
          <div className="md:hidden space-y-4">
            {filteredSuppliers.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-2xl p-6 text-center text-xs text-gray-500 shadow-xs">
                No hay proveedores en la categoría seleccionada.
              </div>
            ) : (
              filteredSuppliers.map((sup) => (
              <div key={sup.id} className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3 shadow-xs">
                {/* Cabecera del proveedor */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-[#D97706] flex items-center justify-center shrink-0 shadow-xs overflow-hidden">
                    {sup.logoUrl ? (
                      <img src={sup.logoUrl} alt={sup.tradeName} className="w-full h-full object-cover" />
                    ) : (
                      <Building2 className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <h4 className="font-black text-gray-950 text-base">{sup.tradeName}</h4>
                    <p className="text-xs text-gray-400">NIT {sup.nit} · {sup.city}</p>
                  </div>
                </div>

                <div className="pt-2 border-t border-gray-100 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-gray-500 font-medium">
                      <Tag className="w-4 h-4 text-gray-400" />
                      <span>Línea de insumos:</span>
                    </span>
                    <strong className="text-gray-950 font-bold">{sup.category}</strong>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-gray-500 font-medium">
                      <ShoppingCart className="w-4 h-4 text-gray-400" />
                      <span>Pedido mínimo:</span>
                    </span>
                    <strong className="text-gray-950 font-mono font-bold">{formatCop(sup.minOrderCop)}</strong>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-gray-500 font-medium">
                      <Phone className="w-4 h-4 text-gray-400" />
                      <span>WhatsApp:</span>
                    </span>
                    <span className="text-[#D97706] font-bold font-mono">{sup.salesWhatsapp}</span>
                  </div>

                  <div className="flex items-start justify-between">
                    <span className="flex items-center gap-1.5 text-gray-500 font-medium pt-0.5">
                      <Activity className="w-4 h-4 text-gray-400" />
                      <span>Estado operativo:</span>
                    </span>
                    <div className="text-right">
                      <span className={`px-2.5 py-0.5 rounded-full font-bold text-[11px] inline-flex items-center gap-1 ${
                        sup.status === 'active'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : sup.status === 'inactive'
                          ? 'bg-slate-100 text-slate-700 border border-slate-200'
                          : sup.status === 'suspended'
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current" />
                        <span>
                          {sup.status === 'active'
                            ? 'Activo en ecosistema'
                            : sup.status === 'inactive'
                            ? 'Inactivo / Pausado'
                            : sup.status === 'suspended'
                            ? 'Suspendido'
                            : 'Pendiente'}
                        </span>
                      </span>
                      {sup.statusReason && sup.status !== 'active' && (
                        <p className="text-[10px] text-gray-500 mt-0.5 max-w-[200px] truncate">
                          {sup.statusReason}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-gray-500 font-medium">
                      <Unlock className="w-4 h-4 text-gray-400" />
                      <span>Permiso de publicación:</span>
                    </span>
                    {sup.canUploadProducts ? (
                      <span className="text-emerald-600 font-bold flex items-center gap-1">
                        <Unlock className="w-3.5 h-3.5" />
                        <span>Habilitado</span>
                      </span>
                    ) : (
                      <span className="text-gray-400 font-bold flex items-center gap-1">
                        <Lock className="w-3.5 h-3.5" />
                        <span>Bloqueado</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Botón de acciones para celular */}
                <div className="pt-2">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setOpenSupplierMenuId(openSupplierMenuId === sup.id ? null : sup.id)}
                      className="w-full py-2.5 px-4 bg-white hover:bg-gray-50 text-gray-900 border border-gray-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <span>Opciones</span>
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    </button>

                    {openSupplierMenuId === sup.id && (
                      <div className="absolute left-0 right-0 mt-1.5 bg-white border border-gray-200 rounded-xl shadow-xl py-1.5 z-20 text-xs">
                        {sup.status !== 'active' && (
                          <button
                            type="button"
                            onClick={() => handleDirectActivate(sup)}
                            className="w-full px-4 py-2.5 font-bold flex items-center gap-2 hover:bg-emerald-50 text-emerald-700"
                          >
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            <span>Habilitar / Activar Proveedor</span>
                          </button>
                        )}

                        {sup.status !== 'inactive' && (
                          <button
                            type="button"
                            onClick={() => handleOpenStatusModal(sup, 'inactive')}
                            className="w-full px-4 py-2.5 font-bold flex items-center gap-2 hover:bg-slate-50 text-slate-700"
                          >
                            <Pause className="w-4 h-4 text-slate-600" />
                            <span>Inactivar Proveedor (Pausa)...</span>
                          </button>
                        )}

                        {sup.status !== 'suspended' && (
                          <button
                            type="button"
                            onClick={() => handleOpenStatusModal(sup, 'suspended')}
                            className="w-full px-4 py-2.5 font-bold flex items-center gap-2 hover:bg-rose-50 text-rose-700"
                          >
                            <Ban className="w-4 h-4 text-rose-600" />
                            <span>Suspender Proveedor (Sanción)...</span>
                          </button>
                        )}

                        <div className="my-1 border-t border-gray-100" />

                        <button
                          type="button"
                          onClick={() => {
                            onToggleUploadPermission(sup.id);
                            setOpenSupplierMenuId(null);
                          }}
                          className="w-full px-4 py-2.5 font-bold flex items-center gap-2 hover:bg-gray-50 text-gray-800"
                        >
                          {sup.canUploadProducts ? <Lock className="w-4 h-4 text-amber-500" /> : <Unlock className="w-4 h-4 text-emerald-600" />}
                          <span>{sup.canUploadProducts ? 'Bloquear Subida' : 'Habilitar Subida'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )))}
          </div>

          {/* Modal de Criterio Administrativo de Suspensión / Inactivación en Panel Central */}
          {selectedSupplierForStatus && targetStatusAction && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
              <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden border border-gray-100 flex flex-col p-6 sm:p-7">
                {/* Header Modal */}
                <div className="flex items-start justify-between gap-3 pb-3 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                        targetStatusAction === 'inactive'
                          ? 'bg-slate-100 text-slate-700'
                          : 'bg-rose-100 text-rose-700'
                      }`}
                    >
                      {targetStatusAction === 'inactive' ? (
                        <Pause className="w-5 h-5" />
                      ) : (
                        <Ban className="w-5 h-5" />
                      )}
                    </div>
                    <div>
                      <h3 className="text-base sm:text-lg font-black text-gray-950 font-display">
                        {targetStatusAction === 'inactive'
                          ? 'Inactivar Proveedor (Pausa)'
                          : 'Suspender Proveedor (Sanción)'}
                      </h3>
                      <p className="text-xs text-gray-500">
                        {selectedSupplierForStatus.tradeName} · NIT {selectedSupplierForStatus.nit}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSupplierForStatus(null);
                      setTargetStatusAction(null);
                    }}
                    className="p-1.5 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                    aria-label="Cerrar modal"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Cuerpo del Modal */}
                <div className="py-4 space-y-4 text-xs">
                  <div
                    className={`p-3.5 rounded-2xl border text-xs leading-relaxed ${
                      targetStatusAction === 'inactive'
                        ? 'bg-slate-50 border-slate-200 text-slate-700'
                        : 'bg-rose-50 border-rose-200 text-rose-700'
                    }`}
                  >
                    {targetStatusAction === 'inactive'
                      ? 'La inactivación pondrá en pausa comercial al proveedor. Sus insumos no se mostrarán para compras en el catálogo de restaurantes hasta que el administrador decida reactivarlo.'
                      : 'La suspensión bloquea el acceso del proveedor a su portal y retira de inmediato todos sus insumos del catálogo público por faltas, problemas de calidad o incumplimiento reiterado.'}
                  </div>

                  {/* Selector de Criterio */}
                  <div className="space-y-1.5">
                    <label className="block font-bold text-gray-800 text-xs">
                      Criterio principal del administrador:
                    </label>
                    <select
                      value={selectedPresetReason}
                      onChange={(e) => setSelectedPresetReason(e.target.value)}
                      className="w-full bg-white border border-gray-300 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-gray-900 focus:outline-none focus:border-[#E52243]"
                    >
                      {(targetStatusAction === 'inactive'
                        ? INACTIVATE_CRITERIA_PRESETS
                        : SUSPEND_CRITERIA_PRESETS
                      ).map((reason) => (
                        <option key={reason} value={reason}>
                          {reason}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Observaciones complementarias */}
                  <div className="space-y-1.5">
                    <label className="block font-bold text-gray-800 text-xs">
                      Observaciones o detalles adicionales (opcional):
                    </label>
                    <textarea
                      rows={3}
                      value={customReasonDetails}
                      onChange={(e) => setCustomReasonDetails(e.target.value)}
                      placeholder="Ej. Notificado por WhatsApp. Pausa acordada hasta el 25 de este mes / Reclamo de restaurante #104 por lote con inconsistencias."
                      className="w-full bg-white border border-gray-300 rounded-xl p-3 text-xs text-gray-900 focus:outline-none focus:border-[#E52243]"
                    />
                  </div>
                </div>

                {/* Footer Modal */}
                <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSupplierForStatus(null);
                      setTargetStatusAction(null);
                    }}
                    className="px-4 py-2 text-xs font-bold text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={isSavingStatus}
                    onClick={handleConfirmStatusChange}
                    className={`px-5 py-2.5 text-xs font-bold text-white rounded-xl transition-all shadow-xs cursor-pointer flex items-center gap-2 ${
                      targetStatusAction === 'inactive'
                        ? 'bg-slate-800 hover:bg-slate-900'
                        : 'bg-rose-600 hover:bg-rose-700'
                    }`}
                  >
                    {isSavingStatus ? (
                      <span>Guardando...</span>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>
                          Confirmar {targetStatusAction === 'inactive' ? 'Inactivación' : 'Suspensión'}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          PESTAÑA 3: ALTA DIRECTA / REGISTRAR PROVEEDOR
          ========================================================================= */}
      {activeTab === 'direct_onboarding' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-3xl font-black text-gray-950 font-display tracking-tight">
              Registrar proveedor
            </h2>
            <p className="text-sm font-medium text-gray-500 mt-1">
              Alta directa de empresas verificadas por RYYCO Central.
            </p>
          </div>

          <div className="bg-[#FEF3C7] border border-[#FDE68A] text-[#92400E] rounded-xl px-4 py-3 text-xs sm:text-sm font-medium flex items-center gap-2.5 shadow-xs">
            <Info className="w-4 h-4 text-[#D97706] shrink-0" />
            <span>Utiliza esta opción cuando el proveedor ya contactó a RYYCO y sus documentos fueron cotejados.</span>
          </div>

          {directErrorMsg && (
            <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3 text-xs sm:text-sm font-medium flex items-center gap-2.5 shadow-xs">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{directErrorMsg}</span>
            </div>
          )}

          <form onSubmit={handleDirectSubmit} className="space-y-6">
            {/* Sección 1: Datos de la empresa */}
            <div className="space-y-4">
              <h3 className="text-base font-black text-gray-950 font-display">
                Datos de la empresa
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-800 mb-1.5">
                    Nombre comercial oficial <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={directTradeName}
                    onChange={(e) => {
                      setDirectTradeName(e.target.value);
                      if (directErrorMsg) setDirectErrorMsg(null);
                    }}
                    placeholder="Ej. Frigorífico Los Andes"
                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#E52243] focus:ring-1 focus:ring-[#E52243] transition-all shadow-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-800 mb-1.5">
                    NIT empresarial <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={directNit}
                    onChange={(e) => {
                      setDirectNit(e.target.value);
                      if (directErrorMsg) setDirectErrorMsg(null);
                    }}
                    placeholder="Ej. 901.882.104-5"
                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm font-mono text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#E52243] focus:ring-1 focus:ring-[#E52243] transition-all shadow-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-800 mb-1.5">
                    Razón social
                  </label>
                  <input
                    type="text"
                    value={directBusinessName}
                    onChange={(e) => setDirectBusinessName(e.target.value)}
                    placeholder="Ej. Frigorífico Los Andes del Sur S.A.S."
                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#E52243] focus:ring-1 focus:ring-[#E52243] transition-all shadow-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-800 mb-1.5">
                    Categoría principal
                  </label>
                  <select
                    value={directCategory}
                    onChange={(e) => setDirectCategory(e.target.value as SupplierCategory)}
                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm font-semibold text-gray-900 focus:outline-none focus:border-[#E52243] focus:ring-1 focus:ring-[#E52243] transition-all shadow-xs"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Sección 2: Contacto y despacho */}
            <div className="space-y-4">
              <h3 className="text-base font-black text-gray-950 font-display">
                Contacto y despacho
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-800 mb-1.5">
                    WhatsApp corporativo
                  </label>
                  <input
                    type="text"
                    value={directPhone}
                    onChange={(e) => setDirectPhone(e.target.value)}
                    placeholder="Ej. 317 440 9182"
                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm font-mono text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#E52243] focus:ring-1 focus:ring-[#E52243] transition-all shadow-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-800 mb-1.5 flex items-center justify-between">
                    <span>Ciudad de despacho</span>
                    <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                      Detectada en mapa
                    </span>
                  </label>
                  <input
                    type="text"
                    value={directCity}
                    onChange={(e) => setDirectCity(e.target.value)}
                    placeholder="Ej. Ipiales"
                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#E52243] focus:ring-1 focus:ring-[#E52243] transition-all shadow-xs"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-gray-800 mb-1.5 flex items-center justify-between">
                    <span>Dirección física de bodega o punto de despacho</span>
                    <span className="text-[10px] text-gray-400 font-medium">Autocompletada en mapa</span>
                  </label>
                  <input
                    type="text"
                    value={directAddress}
                    onChange={(e) => setDirectAddress(e.target.value)}
                    placeholder="Ej. Km 3 Vía al Sur, Bodega 9, Ipiales"
                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#E52243] focus:ring-1 focus:ring-[#E52243] transition-all shadow-xs"
                  />
                </div>

                {/* Mapa interactivo de ubicación de bodega en Alta Directa */}
                <div className="sm:col-span-2 space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-extrabold text-gray-900 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-[#E52243]" />
                      <span>Fijar bodega en el mapa interactivo:</span>
                    </span>
                    <span className="text-[11px] text-gray-500 hidden sm:inline">
                      Mueve el pin para autocompletar la dirección y la ciudad
                    </span>
                  </div>

                  <WarehouseLocationPickerMap
                    lat={directCoords.lat}
                    lng={directCoords.lng}
                    address={directAddress}
                    city={directCity}
                    tradeName={directTradeName || 'Bodega del Proveedor'}
                    onChange={(data) => {
                      setDirectCoords({ lat: data.lat, lng: data.lng });
                      if (data.address) setDirectAddress(data.address);
                      if (data.city) setDirectCity(data.city);
                    }}
                  />
                </div>

                {/* Campo de Correo Electrónico de Acceso (Google / Login) */}
                <div className="sm:col-span-2 bg-gradient-to-r from-red-50/70 via-amber-50/40 to-white border-2 border-red-200/90 rounded-2xl p-4 sm:p-5 shadow-xs space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                    <label className="flex items-center gap-1.5 text-xs sm:text-sm font-black text-gray-950">
                      <span>Correo electrónico de acceso (Google / Login)</span>
                      <span className="text-red-600 font-black">*</span>
                    </label>
                    <span className="self-start sm:self-auto px-2.5 py-0.5 text-[10px] font-black text-red-700 bg-red-100/90 rounded-lg border border-red-200 uppercase tracking-wider">
                      Requerido para comprobar en login
                    </span>
                  </div>
                  <input
                    type="email"
                    required
                    value={directEmail}
                    onChange={(e) => {
                      setDirectEmail(e.target.value);
                      if (directErrorMsg) setDirectErrorMsg(null);
                    }}
                    placeholder="Ej. compras@frigorifico.co o proveedor@gmail.com"
                    className="w-full bg-white border-2 border-red-300 focus:border-[#E52243] rounded-xl px-4 py-3 text-sm font-semibold text-gray-950 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#E52243]/20 transition-all shadow-xs"
                  />
                  <p className="text-[11px] text-gray-600 leading-relaxed flex items-center gap-1.5 pt-0.5">
                    <Info className="w-3.5 h-3.5 text-[#E52243] shrink-0" />
                    <span>
                      Este correo será con el que el proveedor ingrese al portal. El sistema lo comprobará automáticamente cuando inicie sesión con su cuenta de Google.
                    </span>
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-800 mb-1.5">
                    Tiempo de entrega (horas)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={72}
                    value={directLeadHours}
                    onChange={(e) => setDirectLeadHours(Number(e.target.value))}
                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm font-mono font-bold text-gray-900 focus:outline-none focus:border-[#E52243] focus:ring-1 focus:ring-[#E52243] transition-all shadow-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-800 mb-1.5">
                    Pedido mínimo (COP)
                  </label>
                  <input
                    type="number"
                    step={10000}
                    value={directMinOrder}
                    onChange={(e) => setDirectMinOrder(Number(e.target.value))}
                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm font-mono font-bold text-gray-900 focus:outline-none focus:border-[#E52243] focus:ring-1 focus:ring-[#E52243] transition-all shadow-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-800 mb-1.5">
                    Envío gratis desde (COP)
                  </label>
                  <input
                    type="number"
                    step={10000}
                    value={directFreeShipping}
                    onChange={(e) => setDirectFreeShipping(Number(e.target.value))}
                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm font-mono font-bold text-gray-900 focus:outline-none focus:border-[#E52243] focus:ring-1 focus:ring-[#E52243] transition-all shadow-xs"
                  />
                </div>
              </div>
            </div>

            {/* Checkbox de Habilitación Inmediata */}
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-4 flex items-start gap-3">
              <input
                type="checkbox"
                id="enableCatalogImmediately"
                checked={enableCatalogImmediately}
                onChange={(e) => setEnableCatalogImmediately(e.target.checked)}
                className="w-5 h-5 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500 mt-0.5 cursor-pointer"
              />
              <label htmlFor="enableCatalogImmediately" className="cursor-pointer space-y-0.5 select-none">
                <span className="block text-sm font-bold text-gray-900">
                  Habilitar inmediatamente al proveedor
                </span>
                <span className="block text-xs text-gray-500">
                  Activa su perfil y el permiso para publicar productos y precios.
                </span>
              </label>
            </div>

            {/* Botones de acción */}
            <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setActiveTab('suppliers_control')}
                className="w-full sm:w-auto px-5 py-3 text-xs font-bold text-gray-600 hover:text-gray-900 transition-colors cursor-pointer text-center"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="w-full sm:w-auto px-6 py-3.5 bg-[#E52243] hover:bg-[#C91836] text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer"
              >
                <Check className="w-4 h-4 stroke-[2.5]" />
                <span>Registrar y habilitar proveedor</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =========================================================================
          PESTAÑA 4: COMISIONES POR CATEGORÍA
          ========================================================================= */}
      {activeTab === 'commission_table' && (
        <div className="space-y-6">
          {/* Cabecera con título y botones de acción */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-3xl font-black text-gray-950 font-display tracking-tight">
                Comisiones por categoría
              </h2>
              <p className="text-sm font-medium text-gray-500 mt-1">
                Define el porcentaje aplicado al subtotal de productos.
              </p>
            </div>

            {/* Botones PC */}
            <div className="hidden sm:flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={handleResetDefaultRates}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-gray-50 text-gray-800 border border-gray-200 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                <RotateCcw className="w-4 h-4 text-gray-500" />
                <span>Valores sugeridos</span>
              </button>

              <button
                type="button"
                onClick={handleSaveRatesToFirestore}
                disabled={isSavingRates}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#E52243] hover:bg-[#C91836] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{isSavingRates ? 'Guardando...' : 'Guardar cambios'}</span>
              </button>
            </div>
          </div>

          {/* Barra de simulación de orden */}
          <div className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
            <span className="text-sm font-bold text-gray-900">
              Subtotal de productos a simular (COP)
            </span>
            <input
              type="number"
              step={10000}
              min={10000}
              value={simulationOrderAmount}
              onChange={(e) => setSimulationOrderAmount(Math.max(1000, Number(e.target.value)))}
              className="w-full sm:w-48 bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm font-mono font-black text-right text-gray-900 focus:outline-none focus:border-[#E52243] shadow-xs"
            />
          </div>

          {/* Botones Celular justo debajo del simulador (coincidiendo con mockup de celular) */}
          <div className="sm:hidden grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handleResetDefaultRates}
              className="py-2.5 px-3 bg-white hover:bg-gray-50 text-gray-800 border border-gray-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
            >
              <RotateCcw className="w-4 h-4 text-gray-500" />
              <span>Valores sugeridos</span>
            </button>

            <button
              type="button"
              onClick={handleSaveRatesToFirestore}
              disabled={isSavingRates}
              className="py-2.5 px-3 bg-[#E52243] hover:bg-[#C91836] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{isSavingRates ? 'Guardando...' : 'Guardar cambios'}</span>
            </button>
          </div>

          <p className="text-xs text-gray-500 font-medium sm:hidden">
            Base: subtotal de productos
          </p>

          {/* Vista PC: Tabla de Comisiones */}
          <div className="hidden md:block bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50/70 border-b border-gray-200 text-gray-700 font-bold">
                  <th className="py-3.5 px-5">Categoría</th>
                  <th className="py-3.5 px-4 text-center">Porcentaje</th>
                  <th className="py-3.5 px-4">Base</th>
                  <th className="py-3.5 px-4 text-right">Comisión simulada</th>
                  <th className="py-3.5 px-5 text-right">Neto al proveedor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ratesList.map((rate) => {
                  const feeSimulated = Math.round(simulationOrderAmount * (rate.percentage / 100));
                  const netSimulated = simulationOrderAmount - feeSimulated;

                  return (
                    <tr key={rate.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="py-4 px-5">
                        <div className="font-black text-sm text-gray-950">
                          {rate.category}
                        </div>
                        <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-1">
                          {rate.description}
                        </p>
                      </td>

                      <td className="py-4 px-4 text-center">
                        <div className="inline-flex items-center justify-center gap-1 bg-white border border-gray-200 rounded-xl px-3 py-1.5 shadow-xs focus-within:border-[#E52243]">
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            max="30"
                            value={rate.percentage}
                            onChange={(e) => handleUpdateRatePercent(rate.id, Number(e.target.value))}
                            className="w-12 bg-transparent text-gray-950 font-mono font-black text-sm text-center focus:outline-none"
                          />
                          <span className="font-bold text-gray-800 text-sm">%</span>
                        </div>
                      </td>

                      <td className="py-4 px-4">
                        <span className="inline-flex items-center px-3 py-1 rounded-lg text-xs font-semibold bg-gray-100 text-gray-700">
                          {rate.appliesTo === 'total_con_flete' ? 'Total con flete' : 'Subtotal productos'}
                        </span>
                      </td>

                      <td className="py-4 px-4 text-right font-mono font-bold text-[#D97706] text-sm">
                        $ {feeSimulated.toLocaleString('es-CO')}
                      </td>

                      <td className="py-4 px-5 text-right font-mono font-black text-emerald-600 text-sm">
                        $ {netSimulated.toLocaleString('es-CO')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="p-4 bg-gray-50/60 border-t border-gray-200 text-xs text-gray-500 flex items-center gap-2">
              <Info className="w-4 h-4 text-gray-400 shrink-0" />
              <span>Los cambios guardados se aplican a nuevos pedidos.</span>
            </div>
          </div>

          {/* Vista Celular: Tarjetas de Categoría con Porcentajes */}
          <div className="md:hidden space-y-3">
            {ratesList.map((rate) => {
              const feeSimulated = Math.round(simulationOrderAmount * (rate.percentage / 100));
              const netSimulated = simulationOrderAmount - feeSimulated;

              return (
                <div key={rate.id} className="bg-white border border-gray-200 rounded-2xl p-4 flex items-center justify-between gap-3 shadow-xs">
                  <div className="max-w-[130px] sm:max-w-none">
                    <h4 className="font-black text-gray-950 text-sm leading-tight">
                      {rate.category}
                    </h4>
                  </div>

                  <div className="inline-flex items-center justify-center gap-1 bg-white border border-gray-200 rounded-xl px-2.5 py-1.5 shadow-xs focus-within:border-[#E52243] shrink-0">
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="30"
                      value={rate.percentage}
                      onChange={(e) => handleUpdateRatePercent(rate.id, Number(e.target.value))}
                      className="w-10 bg-transparent text-gray-950 font-mono font-black text-sm text-center focus:outline-none"
                    />
                    <span className="font-bold text-gray-800 text-sm">%</span>
                  </div>

                  <div className="text-right text-xs shrink-0">
                    <div className="font-mono font-bold text-[#D97706]">
                      <span className="text-[10px] text-gray-400 font-sans mr-1">Comisión:</span>
                      ${feeSimulated.toLocaleString('es-CO')}
                    </div>
                    <div className="font-mono font-black text-emerald-600">
                      <span className="text-[10px] text-gray-400 font-sans mr-1">Neto:</span>
                      ${netSimulated.toLocaleString('es-CO')}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Botón flotante/inferior en celular para guardar */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleSaveRatesToFirestore}
                disabled={isSavingRates}
                className="w-full py-3.5 px-4 bg-[#E52243] hover:bg-[#C91836] text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{isSavingRates ? 'Guardando cambios...' : 'Guardar cambios'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          PESTAÑA 5: TODOS LOS PEDIDOS (ADMINISTRADOR CENTRAL DE COMPRAS)
          ========================================================================= */}
      {activeTab === 'all_orders' && (
        <div className="space-y-6">
          {/* Cabecera con título y estado de conexión */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl sm:text-3xl font-black text-gray-950 font-display tracking-tight flex items-center gap-2.5">
                <ClipboardList className="w-7 h-7 text-[#E52243]" />
                <span>Control central de pedidos</span>
              </h2>
              <p className="text-xs sm:text-sm font-medium text-gray-500 mt-1">
                Auditoría y trazabilidad en tiempo real de todos los pedidos emitidos por restaurantes a cualquier proveedor de la red RYYCO.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-100 text-gray-700 text-xs font-bold border border-gray-200 shadow-2xs">
                <Activity className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
                <span>Cloud Firestore en vivo ({safeOrders.length})</span>
              </span>
            </div>
          </div>

          {/* Tarjetas de Métricas KPI Rápidas */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-500">Total Pedidos</span>
                <Package className="w-4 h-4 text-gray-400" />
              </div>
              <p className="text-2xl sm:text-3xl font-black text-gray-950 mt-1 font-display">
                {safeOrders.length}
              </p>
              <span className="text-[11px] text-gray-500 font-medium">Registrados en la plataforma</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-500">Volumen Bruto</span>
                <DollarSign className="w-4 h-4 text-emerald-500" />
              </div>
              <p className="text-xl sm:text-2xl font-black text-gray-950 mt-1 font-sans">
                {formatCop(totalOrdersAmount)}
              </p>
              <span className="text-[11px] text-emerald-700 font-bold">Total compras facturadas</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-500">Comisiones RYYCO</span>
                <Percent className="w-4 h-4 text-[#E52243]" />
              </div>
              <p className="text-xl sm:text-2xl font-black text-[#E52243] mt-1 font-sans">
                {formatCop(totalRyycoCommissions)}
              </p>
              <span className="text-[11px] text-gray-500 font-medium">Ingresos generados</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-500">Pedidos Activos</span>
                <Clock className="w-4 h-4 text-amber-500" />
              </div>
              <p className="text-2xl sm:text-3xl font-black text-amber-600 mt-1 font-display">
                {activeOrdersCount}
              </p>
              <span className="text-[11px] text-gray-500 font-medium">En proceso de entrega</span>
            </div>
          </div>

          {/* Filtros y Buscador */}
          <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-2xs space-y-3">
            <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
              {/* Buscador */}
              <div className="flex-1 relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={orderSearchQuery}
                  onChange={(e) => setOrderSearchQuery(e.target.value)}
                  placeholder="Buscar por código B2B, restaurante, proveedor, NIT, ciudad..."
                  className="w-full pl-10 pr-9 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-[#E52243] focus:ring-1 focus:ring-[#E52243] outline-none transition-colors"
                />
                {orderSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setOrderSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Filtro por Proveedor */}
              <div className="min-w-[190px]">
                <select
                  value={orderSupplierFilter}
                  onChange={(e) => setOrderSupplierFilter(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-800 outline-none cursor-pointer focus:border-[#E52243]"
                >
                  <option value="all">Todos los proveedores ({suppliers.length})</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.tradeName}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filtro por Estado */}
              <div className="min-w-[190px]">
                <select
                  value={orderStatusFilter}
                  onChange={(e) => setOrderStatusFilter(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-800 outline-none cursor-pointer focus:border-[#E52243]"
                >
                  <option value="all">Todos los estados</option>
                  <option value="pendiente_confirmacion">Pendiente confirmación</option>
                  <option value="confirmado">Confirmado por proveedor</option>
                  <option value="en_preparacion">En preparación (Bodega)</option>
                  <option value="en_camino">En camino / Despachado</option>
                  <option value="listo_recoger">Listo para recoger</option>
                  <option value="entregado">Entregado</option>
                  <option value="cancelado">Cancelado / Rechazado</option>
                  <option value="propuesta_cambios">Propuesta de ajustes</option>
                </select>
              </div>

              {/* Filtro por Pago */}
              <div className="min-w-[140px]">
                <select
                  value={orderPaymentFilter}
                  onChange={(e) => setOrderPaymentFilter(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-800 outline-none cursor-pointer focus:border-[#E52243]"
                >
                  <option value="all">Pago: Todos</option>
                  <option value="pagado">Pagado</option>
                  <option value="pendiente">Pago Pendiente</option>
                </select>
              </div>
            </div>

            {/* Resumen de resultados */}
            <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-gray-100 font-medium">
              <span>
                Mostrando <strong className="text-gray-900">{filteredAllOrders.length}</strong> de{' '}
                <strong className="text-gray-900">{safeOrders.length}</strong> pedidos.
              </span>
              {(orderSearchQuery || orderSupplierFilter !== 'all' || orderStatusFilter !== 'all' || orderPaymentFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setOrderSearchQuery('');
                    setOrderSupplierFilter('all');
                    setOrderStatusFilter('all');
                    setOrderPaymentFilter('all');
                  }}
                  className="text-[#E52243] hover:underline font-bold cursor-pointer"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          </div>

          {/* Listado de Pedidos */}
          {filteredAllOrders.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center shadow-xs">
              <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-3 stroke-[1.5]" />
              <h3 className="text-base font-black text-gray-900 font-display">
                No se encontraron pedidos
              </h3>
              <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
                No hay pedidos en la base de datos que coincidan con los filtros o el texto de búsqueda seleccionado.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredAllOrders.map((ord) => {
                const matchedSup = suppliers.find((s) => s.id === ord.supplierId);
                const statusBadge = getOrderStatusBadge(ord.status);
                const isExpanded = expandedOrderId === ord.id;
                const restPhoneSanitized = sanitizeRyycoPhone(ord.restaurantPhone || '');
                const supPhoneSanitized = sanitizeRyycoPhone(ord.supplierSalesWhatsapp || matchedSup?.salesWhatsapp || '');
                const waRestaurantUrl = `https://wa.me/${restPhoneSanitized || '573152497974'}?text=${encodeURIComponent(`Hola ${ord.restaurantName}, te contactamos desde la Administración Central de RYYCO respecto a tu pedido ${ord.code}.`)}`;
                const waSupplierUrl = `https://wa.me/${supPhoneSanitized || '573152497974'}?text=${encodeURIComponent(`Hola ${ord.supplierTradeName}, te contactamos desde la Administración Central de RYYCO sobre el pedido ${ord.code} de ${ord.restaurantName}.`)}`;

                const isImmediateDelivery =
                  ord.deliveryDate?.toLowerCase().includes('término') ||
                  ord.deliveryDate?.toLowerCase().includes('termino');

                return (
                  <div
                    key={ord.id}
                    className="bg-white rounded-2xl border border-gray-200 shadow-xs hover:border-gray-300 transition-all overflow-hidden"
                  >
                    {/* Barra Superior del Pedido: Código, Fecha, Estado, Pago y PIN */}
                    <div className="p-4 sm:p-5 bg-gray-50/70 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="font-mono text-sm font-black text-gray-950 bg-white px-2.5 py-1 rounded-lg border border-gray-200 shadow-2xs">
                          {ord.code || ord.id.slice(0, 8)}
                        </span>
                        <span className="text-xs text-gray-500 font-medium">
                          {ord.orderDate || new Date(ord.createdAt || Date.now()).toLocaleDateString('es-CO')}
                        </span>
                        <span className="text-gray-300">·</span>
                        <span className="text-[11px] text-gray-400 font-mono">
                          ID: {ord.id}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {/* Estado del pedido */}
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold border ${statusBadge.bg}`}
                        >
                          <span className={`w-2 h-2 rounded-full ${statusBadge.dot}`} />
                          <span>{statusBadge.label}</span>
                        </span>

                        {/* Estado de pago */}
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${
                            ord.paymentStatus === 'pagado'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-amber-50 text-amber-800 border-amber-200'
                          }`}
                        >
                          <DollarSign className="w-3.5 h-3.5" />
                          <span>{ord.paymentStatus === 'pagado' ? 'Pagado' : 'Pago Pendiente'}</span>
                        </span>

                        {/* PIN de entrega */}
                        {ord.deliveryCode && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-mono font-black bg-[#FFFBEB] text-[#92400E] border border-amber-200">
                            <Hash className="w-3.5 h-3.5" />
                            <span>PIN: {ord.deliveryCode}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Contenido en 4 Columnas: Restaurante, Proveedor, Logística, Economía/Comisión */}
                    <div className="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 text-xs">
                      {/* COLUMNA 1: DATOS DEL RESTAURANTE (COMPRADOR) */}
                      <div className="space-y-2 bg-[#F9FAFB] p-3.5 rounded-xl border border-gray-100">
                        <div className="flex items-center gap-1.5 text-gray-500 font-extrabold uppercase tracking-wider text-[10px]">
                          <Building2 className="w-3.5 h-3.5 text-[#E52243]" />
                          <span>Restaurante (Comprador)</span>
                        </div>
                        <div>
                          <h4 className="font-black text-sm text-gray-950 font-display">
                            {ord.restaurantName || 'Restaurante'}
                          </h4>
                          <p className="text-gray-500 text-[11px] font-medium">
                            @{ord.restaurantUsername || 'sin_usuario'}
                          </p>
                        </div>
                        <div className="space-y-1 text-gray-600 text-[11px]">
                          <div className="flex items-start gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                            <span className="leading-tight">
                              <strong>{ord.deliveryAddress || ord.restaurantAddress || 'Cocina'}</strong> ({ord.restaurantCity || 'Ipiales'})
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            <span>{ord.restaurantPhone || 'Sin teléfono'}</span>
                          </div>
                        </div>
                        {restPhoneSanitized && (
                          <a
                            href={waRestaurantUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-[11px] transition-colors border border-emerald-200 mt-1"
                          >
                            <MessageSquare className="w-3 h-3 text-emerald-600" />
                            <span>Contactar Restaurante</span>
                          </a>
                        )}
                      </div>

                      {/* COLUMNA 2: DATOS DEL PROVEEDOR (VENDEDOR) */}
                      <div className="space-y-2 bg-[#F9FAFB] p-3.5 rounded-xl border border-gray-100">
                        <div className="flex items-center gap-1.5 text-gray-500 font-extrabold uppercase tracking-wider text-[10px]">
                          <ShieldCheck className="w-3.5 h-3.5 text-[#E52243]" />
                          <span>Proveedor (Vendedor)</span>
                        </div>
                        <div>
                          <h4 className="font-black text-sm text-gray-950 font-display">
                            {ord.supplierTradeName || matchedSup?.tradeName || 'Proveedor'}
                          </h4>
                          <p className="text-gray-500 text-[11px] font-medium">
                            NIT: <strong className="text-gray-700 font-mono">{matchedSup?.nit || 'No registrado'}</strong>
                          </p>
                        </div>
                        <div className="space-y-1 text-gray-600 text-[11px]">
                          <div className="flex items-start gap-1.5">
                            <Package className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                            <span className="leading-tight">
                              Categoría: <strong>{matchedSup?.category || 'General'}</strong>
                            </span>
                          </div>
                          <div className="flex items-start gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                            <span className="leading-tight">
                              Bodega/CEDI: <strong>{ord.supplierAddress || matchedSup?.address || 'CEDI Principal'}</strong>
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            <span>{ord.supplierSalesWhatsapp || matchedSup?.salesWhatsapp || 'Sin WhatsApp'}</span>
                          </div>
                        </div>
                        {supPhoneSanitized && (
                          <a
                            href={waSupplierUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-[11px] transition-colors border border-emerald-200 mt-1"
                          >
                            <MessageSquare className="w-3 h-3 text-emerald-600" />
                            <span>Contactar Proveedor</span>
                          </a>
                        )}
                      </div>

                      {/* COLUMNA 3: LOGÍSTICA Y TIEMPOS */}
                      <div className="space-y-2 bg-[#F9FAFB] p-3.5 rounded-xl border border-gray-100">
                        <div className="flex items-center gap-1.5 text-gray-500 font-extrabold uppercase tracking-wider text-[10px]">
                          <Truck className="w-3.5 h-3.5 text-[#E52243]" />
                          <span>Logística y Plazos</span>
                        </div>
                        <div className="space-y-1.5 text-[11px]">
                          <div>
                            <span className="text-gray-500 block">Modalidad:</span>
                            <span className="font-bold text-gray-900">
                              {ord.deliveryMode === 'entrega_proveedor' ? '🚚 Despacho a Cocina' : '🏬 Recogida en Bodega'}
                            </span>
                          </div>

                          <div>
                            <span className="text-gray-500 block">Plazo de entrega:</span>
                            {isImmediateDelivery ? (
                              <span className="inline-block mt-0.5 font-black text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                                ⚡ Al término de la distancia
                              </span>
                            ) : (
                              <span className="font-bold text-gray-900">
                                {ord.deliveryDate} · {ord.deliveryTimeWindow}
                              </span>
                            )}
                          </div>

                          <div>
                            <span className="text-gray-500 block">Responsable de flete:</span>
                            <span className="font-semibold text-gray-800">
                              {ord.transportResponsible || 'Proveedor'}
                            </span>
                          </div>

                          {ord.dispatchDetails && (
                            <div className="pt-1.5 border-t border-gray-200/60 text-[10px] space-y-0.5">
                              <span className="font-bold text-indigo-900 block">Datos del transportador:</span>
                              <p className="text-gray-700">
                                <strong>{ord.dispatchDetails.driverName}</strong> · Placa: <strong className="font-mono">{ord.dispatchDetails.vehiclePlate}</strong>
                              </p>
                              <p className="text-gray-600">Tel: {ord.dispatchDetails.driverPhone}</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* COLUMNA 4: LIQUIDACIÓN Y COMISIÓN RYYCO */}
                      <div className="space-y-2 bg-[#F9FAFB] p-3.5 rounded-xl border border-gray-100">
                        <div className="flex items-center gap-1.5 text-gray-500 font-extrabold uppercase tracking-wider text-[10px]">
                          <DollarSign className="w-3.5 h-3.5 text-[#E52243]" />
                          <span>Valores y Comisión</span>
                        </div>

                        <div className="space-y-1 text-[11px]">
                          <div className="flex justify-between text-gray-600">
                            <span>Subtotal insumos:</span>
                            <span className="font-semibold">{formatCop(ord.subtotalCop)}</span>
                          </div>
                          <div className="flex justify-between text-gray-600">
                            <span>Flete / Envío:</span>
                            <span className="font-semibold">{formatCop(ord.shippingFeeCop)}</span>
                          </div>
                          <div className="flex justify-between text-gray-950 font-black text-sm pt-1 border-t border-gray-200">
                            <span>Total Pedido:</span>
                            <span className="text-[#E52243] font-sans">{formatCop(ord.totalAmountCop)}</span>
                          </div>

                          <div className="pt-2 border-t border-dashed border-gray-200 space-y-1">
                            <div className="flex justify-between text-emerald-800 font-bold bg-emerald-50/80 px-2 py-1 rounded-md border border-emerald-100">
                              <span>Comisión RYYCO ({ord.ryycoCommissionPercent || 0}%):</span>
                              <span>{formatCop(ord.ryycoFeeCop || 0)}</span>
                            </div>
                            <div className="flex justify-between text-gray-700 font-medium px-2 py-0.5">
                              <span>Neto a Proveedor:</span>
                              <span className="font-bold font-mono">
                                {formatCop(ord.supplierNetPayoutCop || (ord.totalAmountCop - (ord.ryycoFeeCop || 0)))}
                              </span>
                            </div>
                          </div>

                          <div className="pt-1.5 text-[10px] text-gray-500">
                            <span>Pago: <strong>{ord.paymentMethod}</strong> ({ord.paymentTiming === 'anticipado' ? 'Anticipado' : 'Contraentrega'})</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Barra Inferior de Acciones y Toggle de Detalle */}
                    <div className="px-4 py-3 bg-white border-t border-gray-100 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setExpandedOrderId(isExpanded ? null : ord.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-300 hover:bg-gray-50 text-gray-700 font-bold transition-colors cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5 text-gray-500" />
                          <span>{isExpanded ? 'Ocultar desglose' : `Ver ${ord.itemsCount || ord.items.length} insumos y auditoría`}</span>
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>

                        <span className="text-gray-400 text-xs hidden sm:inline">|</span>

                        <span className="text-xs text-gray-500 font-medium hidden sm:inline">
                          {ord.items.length} productos diferentes en la orden
                        </span>
                      </div>

                      {/* Botones rápidos de control administrativo */}
                      <div className="flex items-center gap-2">
                        {onUpdatePaymentStatus && ord.paymentStatus !== 'pagado' && (
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                setOrderUpdatingId(ord.id);
                                await onUpdatePaymentStatus(ord.id, 'pagado', ord.supplierId);
                              } finally {
                                setOrderUpdatingId(null);
                              }
                            }}
                            disabled={orderUpdatingId === ord.id}
                            className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[11px] font-bold border border-emerald-200 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            Marcar Pagado
                          </button>
                        )}

                        {onUpdateOrderStatus && ord.status === 'pendiente_confirmacion' && (
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                setOrderUpdatingId(ord.id);
                                await onUpdateOrderStatus(ord.id, 'confirmado', 'Confirmado administrativamente desde RYYCO Central', ord.supplierId);
                              } finally {
                                setOrderUpdatingId(null);
                              }
                            }}
                            disabled={orderUpdatingId === ord.id}
                            className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-800 text-[11px] font-bold border border-blue-200 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            Aprobar Pedido
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Desglose Expandible: Tabla de Insumos + Línea de Tiempo de Auditoría */}
                    {isExpanded && (
                      <div className="p-4 sm:p-6 bg-gray-50 border-t border-gray-200 space-y-5 animate-in fade-in duration-200">
                        {/* Tabla de Insumos */}
                        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-2xs">
                          <div className="p-3 bg-gray-100/70 border-b border-gray-200 flex items-center justify-between">
                            <span className="font-extrabold text-xs text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                              <Package className="w-4 h-4 text-[#E52243]" />
                              <span>Insumos solicitados en este pedido</span>
                            </span>
                            <span className="text-xs font-bold text-gray-600 font-mono">
                              {ord.items.reduce((s, it) => s + it.quantity, 0)} unidades totales
                            </span>
                          </div>

                          <div className="divide-y divide-gray-100">
                            {ord.items.map((item, idx) => (
                              <div
                                key={`${item.productId}-${idx}`}
                                className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:bg-gray-50 transition-colors"
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="w-12 h-12 rounded-xl bg-gray-100 border border-gray-200 overflow-hidden shrink-0 flex items-center justify-center">
                                    <ResilientImage
                                      src={item.productPhotoUrl || ''}
                                      alt={item.productName}
                                      className="w-full h-full object-cover"
                                    />
                                  </div>

                                  <div className="min-w-0">
                                    <h5 className="font-bold text-gray-950 truncate text-xs sm:text-sm">
                                      {item.productName}
                                    </h5>
                                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500 mt-0.5">
                                      <span>SKU: <strong className="font-mono text-gray-700">{item.productSku || 'S/SKU'}</strong></span>
                                      <span>·</span>
                                      <span>Presentación: <strong className="text-gray-700">{item.presentationLabel}</strong></span>
                                      {item.appliedTierLabel && (
                                        <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded text-[10px]">
                                          {item.appliedTierLabel}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center justify-between sm:justify-end gap-6 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100">
                                  <div className="text-left sm:text-right">
                                    <span className="text-[10px] text-gray-400 block font-medium">Cantidad</span>
                                    <span className="font-black text-gray-900 font-mono text-xs">
                                      {item.quantity} {item.baseUnit || 'ud'}
                                    </span>
                                  </div>

                                  <div className="text-left sm:text-right">
                                    <span className="text-[10px] text-gray-400 block font-medium">Precio Unitario</span>
                                    <span className="font-bold text-gray-800 text-xs">
                                      {formatCop(item.unitPriceCop)}
                                    </span>
                                  </div>

                                  <div className="text-right min-w-[85px]">
                                    <span className="text-[10px] text-gray-400 block font-medium">Subtotal</span>
                                    <span className="font-black text-[#E52243] text-xs font-sans">
                                      {formatCop(item.subtotalCop)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Reporte de Incidencias si existe */}
                        {ord.problemReport && (
                          <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-1.5 text-xs text-rose-900">
                            <div className="flex items-center gap-2 font-black text-rose-950">
                              <AlertCircle className="w-4 h-4 text-rose-600" />
                              <span>Incidencia reportada por el restaurante ({ord.problemReport.reason})</span>
                            </div>
                            <p className="text-rose-800">{ord.problemReport.description}</p>
                            <p className="text-[11px] text-rose-700">
                              Solución solicitada: <strong>{ord.problemReport.solutionRequested}</strong> · Estado: <strong>{ord.problemReport.status}</strong>
                            </p>
                          </div>
                        )}

                        {/* Trazabilidad e Historial */}
                        {ord.history && ord.history.length > 0 && (
                          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                            <span className="font-extrabold text-xs text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                              <Clock className="w-4 h-4 text-gray-400" />
                              <span>Historial de auditoría y trazabilidad</span>
                            </span>

                            <div className="space-y-2">
                              {ord.history.map((h, hIdx) => (
                                <div
                                  key={h.id || hIdx}
                                  className="flex items-start gap-2.5 text-xs pb-2 border-b last:border-b-0 border-gray-100"
                                >
                                  <div className="w-2 h-2 rounded-full bg-gray-400 mt-1.5 shrink-0" />
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="font-bold text-gray-900">{h.action}</span>
                                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                                        {h.actor}
                                      </span>
                                      <span className="text-[10px] text-gray-400 ml-auto">
                                        {new Date(h.timestamp).toLocaleString('es-CO')}
                                      </span>
                                    </div>
                                    {h.details && (
                                      <p className="text-gray-600 text-[11px] mt-0.5">{h.details}</p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          BARRA DE NAVEGACIÓN INFERIOR FIJA PARA CELULAR (COMO EN EL MOCKUP)
          ========================================================================= */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 px-3 py-2 flex items-center justify-around shadow-lg">
        <button
          type="button"
          onClick={() => setActiveTab('applications')}
          className={`flex flex-col items-center gap-0.5 text-[11px] font-bold transition-all cursor-pointer ${
            activeTab === 'applications'
              ? 'bg-[#E52243] text-white px-3.5 py-1.5 rounded-xl shadow-xs'
              : 'text-gray-500 hover:text-gray-900 px-2 py-1'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Solicitudes</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('suppliers_control')}
          className={`flex flex-col items-center gap-0.5 text-[11px] font-bold transition-all cursor-pointer ${
            activeTab === 'suppliers_control'
              ? 'bg-[#E52243] text-white px-3.5 py-1.5 rounded-xl shadow-xs'
              : 'text-gray-500 hover:text-gray-900 px-2 py-1'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Habilitar</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('direct_onboarding')}
          className={`flex flex-col items-center gap-0.5 text-[11px] font-bold transition-all cursor-pointer ${
            activeTab === 'direct_onboarding'
              ? 'bg-[#E52243] text-white px-3.5 py-1.5 rounded-xl shadow-xs'
              : 'text-gray-500 hover:text-gray-900 px-2 py-1'
          }`}
        >
          <PlusCircle className="w-4 h-4" />
          <span>Alta</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('all_orders')}
          className={`flex flex-col items-center gap-0.5 text-[11px] font-bold transition-all cursor-pointer ${
            activeTab === 'all_orders'
              ? 'bg-[#E52243] text-white px-3.5 py-1.5 rounded-xl shadow-xs'
              : 'text-gray-500 hover:text-gray-900 px-2 py-1'
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          <span>Pedidos</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('commission_table')}
          className={`flex flex-col items-center gap-0.5 text-[11px] font-bold transition-all cursor-pointer ${
            activeTab === 'commission_table'
              ? 'bg-[#E52243] text-white px-3.5 py-1.5 rounded-xl shadow-xs'
              : 'text-gray-500 hover:text-gray-900 px-2 py-1'
          }`}
        >
          <Percent className="w-4 h-4" />
          <span>Comisiones</span>
        </button>
      </div>
    </div>
  );
};

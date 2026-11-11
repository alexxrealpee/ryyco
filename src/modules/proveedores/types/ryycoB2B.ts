/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = 'store' | 'driver' | 'customer' | 'admin';

export interface BankAccount {
  bankName: string;
  accountType: 'ahorros' | 'corriente';
  accountNumber: string;
  titularName: string;
  titularDocument: string;
}

export interface DaySchedule {
  isOpen: boolean;
  openTime: string;
  closeTime: string;
}

export type WeeklySchedule = Record<string, DaySchedule>;

/**
 * Compatible 100% con users/{uid} y profiles/{uid} de RYYCO
 */
export interface RyycoRestaurantProfile {
  uid: string;
  email: string;
  role: UserRole;
  displayName: string;
  username: string;
  ownerWhatsapp: string;
  whatsapp: string;
  customerServiceWhatsapp?: string;
  address: string;
  city: string;
  neighborhood?: string;
  lat: number;
  lng: number;
  layout: 'food' | 'liquor' | 'default' | 'shoes' | 'tech';
  subscriptionPlan: 'basico' | 'medio' | 'pro';
  subscriptionStatus: 'trial' | 'active' | 'pending_payment' | 'suspended' | 'expired';
  subscriptionPaidUntil?: string;
  isClosed: boolean;
  bankAccounts: BankAccount[];
  monthlyProcurementBudgetCop?: number;
  googleUid?: string;
  googleEmail?: string;
  photoUrl?: string;
}

/**
 * Categorías oficiales de insumos
 */
export type SupplierCategory =
  | 'Cárnicos y Embutidos'
  | 'Frutas y Verduras'
  | 'Aceites y Abarrotes'
  | 'Lácteos y Quesos'
  | 'Empaques Biodegradables'
  | 'Bebidas y Licores';

export type SupplierStatus = 'pending_verification' | 'active' | 'suspended' | 'inactive';

/**
 * 1. PERFIL DEL PROVEEDOR (suppliers/{supplierId})
 */
export interface RyycoSupplier {
  id: string;
  uid: string;
  googleUid?: string;
  googleEmail?: string;
  nit: string;
  businessName: string;
  tradeName: string;
  slug: string;
  logoUrl?: string;
  category: SupplierCategory;
  categories: SupplierCategory[];
  city: string;
  address: string;
  servedZones: string[]; // Cobertura de zonas que atiende
  lat: number;
  lng: number;
  salesWhatsapp: string; // Saneado
  email: string;
  supportChannel: 'whatsapp' | 'plataforma' | 'ambos';
  contactPersonName?: string;
  contactNotes?: string;

  // Condiciones de compra configuradas por el proveedor
  minOrderCop: number; // Monto mínimo del pedido (o 0 si no exige)
  paymentMethodsAccepted: string[]; // Transferencia, contraentrega, crédito
  paymentTiming: 'anticipado' | 'contraentrega' | 'ambos';
  orderCutoffHour: string; // Hora límite ej. "14:00"
  disputeReportingWindowHours: number; // Plazo para reportar faltantes (ej. 24 o 48h)
  offeredSolutions: ('reposicion' | 'devolucion' | 'ajuste_cobro')[];

  // Logística y transporte
  deliveryOptions: ('entrega_proveedor' | 'recogida_restaurante')[];
  transportResponsible: 'proveedor' | 'restaurante' | 'ryyco_coordinado';
  deliveryDays: string[]; // Días en los que realiza reparto ej. ["Lunes", "Miércoles", "Viernes"]
  deliveryTimeWindow: string; // Franja horaria acordada ej. "08:00 - 12:00"
  baseShippingFeeCop: number; // Costo de transporte
  freeShippingThresholdCop: number; // Umbral de compra para envío gratuito
  requiresTransportQuote?: boolean; // Si requiere cotización previa de flete

  // RYYCO Central
  leadTimeHours: number;
  rating: number;
  ratingCount: number;
  completedB2BOrders: number;
  verifiedByRyyco: boolean;
  canUploadProducts: boolean; // Habilitado por RYYCO Central
  status: SupplierStatus;
  statusReason?: string; // Criterio o motivo administrativo de suspensión/inactivación
  statusUpdatedAt?: string; // Fecha y hora del cambio de estado
  statusUpdatedBy?: string; // Administrador que ejecutó el cambio
  approvedAt?: string;
  approvedBy?: string;
  acceptsCredit15Days: boolean;
  acceptsCredit30Days: boolean;
  bankAccounts: BankAccount[];
  active: boolean;
  createdAt: string;
}

/**
 * Solicitudes de contacto para ser proveedor
 */
export interface SupplierApplication {
  id: string;
  googleUid?: string;
  googleEmail?: string;
  googlePhotoUrl?: string;
  tradeName: string;
  businessName: string;
  nit: string;
  category: SupplierCategory;
  city: string;
  address: string;
  lat?: number;
  lng?: number;
  contactName: string;
  contactWhatsapp: string;
  email: string;
  catalogEstimatedSkus?: number;
  estimatedSkuCount?: number;
  message?: string;
  notes?: string;
  status: 'pending' | 'reviewed' | 'approved' | 'rejected';
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  adminNote?: string;
  rejectionReason?: string;
}

export interface VolumeTier {
  minQty: number;
  unitPriceCop: number;
  label: string;
}

/**
 * 2. PRODUCTOS (supplier_products/{productId})
 */
export type ProductAvailability = 'disponible' | 'bajo_pedido' | 'agotado';
export type StorageCondition = 'ambiente' | 'refrigerado' | 'congelado';
export type SalesUnitType = 'unidad' | 'kilogramo' | 'bolsa' | 'caja' | 'bulto' | 'litro' | 'galon';

export interface SupplierProduct {
  id: string;
  supplierId: string;
  supplierTradeName: string;
  supplierVerified: boolean;
  supplierLeadTimeHours: number;
  supplierRating: number;
  sku: string;
  equivalentGroupKey: string;
  equivalentGroupName: string;
  name: string;
  description: string;
  category: SupplierCategory;
  photoUrl: string;

  // Especificación de presentación y venta
  presentationLabel: string; // ej. "Bolsa x 5 kg", "Caja x 12 unidades", "Botella x 1 litro"
  salesUnit: SalesUnitType; // Unidad de venta completa
  baseUnit: 'kg' | 'litro' | 'unidad';
  baseUnitQuantity: number;
  priceCop: number; // Corresponde a una unidad de venta completa
  minOrderQty: number; // Cantidad mínima que se puede pedir (por defecto: 1)
  volumeTiers: VolumeTier[];

  // Disponibilidad y conservación
  availability: ProductAvailability;
  leadTimePrepHours?: number; // Obligatorio si está bajo pedido
  storageCondition?: StorageCondition; // Refrigerado, congelado, ambiente
  isVariableWeight?: boolean; // Para productos de peso variable (valor estimado)

  stock?: number;
  active: boolean;
}

export interface B2BCartItem {
  productId: string;
  productName: string;
  productSku: string;
  productPhotoUrl?: string;
  supplierId: string;
  supplierTradeName: string;
  presentationLabel: string;
  salesUnit: SalesUnitType;
  baseUnit: 'kg' | 'litro' | 'unidad';
  baseUnitQuantity: number;
  unitPriceCop: number;
  appliedTierLabel?: string;
  quantity: number;
  subtotalCop: number;
  equivalentGroupKey: string;
  isVariableWeight?: boolean;
}

/**
 * 7. ESTADOS VISIBLES DEL PEDIDO
 */
export type B2BOrderStatus =
  | 'pendiente_confirmacion'
  | 'propuesta_cambios'
  | 'confirmado'
  | 'en_preparacion'
  | 'en_camino'
  | 'listo_recoger'
  | 'entregado'
  | 'cancelado'
  | 'sin_confirmar';

export type PaymentStatus = 'pendiente' | 'pagado';
export type DeliveryMode = 'entrega_proveedor' | 'recogida_restaurante';

export interface OrderHistoryEvent {
  id: string;
  timestamp: string;
  actor: 'restaurante' | 'proveedor' | 'sistema' | 'ryyco_admin';
  action: string;
  details: string;
}

export interface DispatchDetails {
  driverName?: string;
  driverPhone?: string;
  vehiclePlate?: string;
  dispatchNotes?: string;
  dispatchedAt?: string;
}

export interface PreparationDetails {
  preparedBy?: string;
  packingNotes?: string;
  checkedItemIds?: string[];
  preparedAt?: string;
}

export interface RyycoCommissionRate {
  id: string;
  category: SupplierCategory | 'General / Por defecto';
  percentage: number;
  description: string;
  appliesTo: 'subtotal_productos' | 'total_con_flete';
  minFeeCop?: number;
  updatedAt?: string;
}

export interface ProblemReport {
  id: string;
  orderId: string;
  reason:
    | 'producto_danado'
    | 'faltante'
    | 'retraso_grave'
    | 'discrepancia_peso'
    | 'calidad_insuficiente';
  description: string;
  photoUrl?: string;
  solutionRequested: 'reposicion' | 'devolucion' | 'ajuste_cobro';
  status: 'abierto' | 'en_revision' | 'resuelto';
  createdAt: string;
  resolutionNote?: string;
}

/**
 * 5. COMPRA Y CONFIRMACIÓN / 7. HISTORIAL (b2b_orders/{orderId})
 */
export interface B2BPurchaseOrder {
  id: string;
  code: string; // ej. B2B-9842
  createdAt: string;
  orderDate: string;

  // Restaurante
  restaurantUid: string;
  restaurantUsername: string;
  restaurantName: string;
  restaurantAddress: string;
  restaurantCity: string;
  restaurantPhone: string;

  // Proveedor
  supplierId: string;
  supplierTradeName: string;
  supplierSalesWhatsapp: string;
  supplierAddress: string;

  // Productos y valores
  items: B2BCartItem[];
  itemsCount: number;
  subtotalCop: number;
  shippingFeeCop: number;
  totalAmountCop: number;

  // Logística y transporte
  deliveryMode: DeliveryMode;
  deliveryAddress: string;
  deliveryDate: string;
  deliveryTimeWindow: string;
  transportResponsible: string;

  // Estados independientes de entrega y pago
  status: B2BOrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: string;
  paymentTiming: 'anticipado' | 'contraentrega';

  // Plazo de respuesta y propuesta de cambios
  supplierResponseDeadline: string; // ISO string
  proposedChanges?: {
    items?: B2BCartItem[];
    shippingFeeCop?: number;
    totalAmountCop?: number;
    deliveryDate?: string;
    deliveryTimeWindow?: string;
    reason: string;
    proposedAt: string;
  };

  rejectionReason?: string;
  deliveryCode: string; // PIN de 4 dígitos para recibir
  history: OrderHistoryEvent[];
  problemReport?: ProblemReport;

  // Gestión detallada de alistamiento y despacho
  dispatchDetails?: DispatchDetails;
  preparationDetails?: PreparationDetails;

  // Desglose de porcentaje y comisión RYYCO
  ryycoFeeCop?: number;
  ryycoCommissionPercent?: number;
  supplierNetPayoutCop?: number;
}

/**
 * 6. PEDIDOS RECURRENTES (b2b_recurring_schedules/{scheduleId})
 */
export type ScheduleFrequency = 'semanal' | 'cada_dos_semanas' | 'mensual';

export interface B2BRecurringSchedule {
  id: string;
  restaurantUid: string;
  restaurantName: string;
  supplierId: string;
  supplierTradeName: string;
  frequency: ScheduleFrequency;
  firstDeliveryDate: string;
  nextDeliveryDate: string;
  deliveryAddress: string;
  deliveryMode: DeliveryMode;
  status: 'activo' | 'pausado' | 'cancelado';
  skipNextDelivery: boolean;
  items: B2BCartItem[];
  estimatedTotalCop: number;
  createdAt: string;
  lastGeneratedOrderId?: string;
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = 'user' | 'admin' | 'driver';
export type UserPlan = 'free' | 'pro' | 'business';

export interface SystemSettings {
  defaultDeliveryFee: number;
  supportPhone?: string;
  supportEmail?: string;
  adminEmails?: string[];
  updatedAt?: string;
}

export type DriverStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
export type VehicleType = 'moto' | 'carro' | 'bicicleta' | 'otro';

export interface DriverProfile {
  id: string; // Firestore doc ID (usually user.uid)
  uid: string;
  email: string;
  photoURL?: string;
  firstName: string;
  lastName: string;
  docType: 'CC' | 'CE' | 'PASAPORTE' | 'NIT';
  docNumber: string;
  birthDate: string;
  gender?: string;
  phone: string;
  address: string;
  city: string;
  
  // Vehicle details
  vehicleType: VehicleType;
  vehicleBrand?: string;
  vehiclePlate?: string;
  vehicleOwnershipCardUrl?: string; // Foto de la tarjeta de propiedad
  driverLicenseUrl?: string; // Foto de la licencia de conducción
  
  // Status & Availability
  status: DriverStatus;
  rejectionReason?: string;
  isAvailable: boolean; // Availability Switch
  isOnline?: boolean;
  
  // Metrics & Stats
  rating: number; // e.g. 4.9
  ratingCount: number;
  completedDeliveriesCount: number;
  totalEarnings: number; // COP total
  
  // Timestamps
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  lastActiveAt?: string;
}

export interface DriverRating {
  id: string;
  driverId: string;
  orderId: string;
  customerName: string;
  storeName: string;
  stars: number; // 1 to 5
  punctuality?: number;
  attention?: number;
  condition?: number;
  comment?: string;
  createdAt: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  username: string; // Store Handle/Slug (e.g., "mi-tienda")
  displayName: string; // Store Name (e.g., "Boutique de Moda")
  storeName?: string; // Optional Store Name Alias
  bio: string; // Store Slogan/Description
  photoURL?: string; // Store Logo
  coverURL?: string; // Store Cover Banner
  role: UserRole;
  plan: UserPlan;
  createdAt: string;
  phone?: string;
  whatsapp?: string; // Store WhatsApp Number for orders (Customer Service or fallback to Owner)
  ownerWhatsapp?: string; // WhatsApp del Propietario / Administrador (Obligatorio)
  customerServiceWhatsapp?: string; // WhatsApp para Atención al Cliente (Opcional)
  address?: string; // Physical Store / Business Address (Dirección del negocio)
  location?: string;
  currency?: string; // Currency symbol/code (e.g., "$", "COP", "EUR", "MXN", "USD")
  suspended?: boolean;
  googleAnalyticsId?: string;
  whatsappMessageTemplate?: string; // Custom WhatsApp order message template
  // Subscription plans & status fields (COP pricing plans)
  subscriptionPlan?: 'basico' | 'medio' | 'pro';
  requestedPlan?: 'basico' | 'medio' | 'pro';
  subscriptionStatus?: 'trial' | 'active' | 'pending_payment' | 'under_review' | 'suspended' | 'expired';
  subscriptionStartDate?: string;
  subscriptionTrialExpires?: string;
  subscriptionPaidUntil?: string;
  subscriptionAnchorDay?: number;
  layout?: 'food' | 'liquor' | 'default' | 'shoes' | 'tech';
  category?: string;
  rating?: number;
  ratingCount?: number;
  coverTitle?: string;
  instagram?: string;
  facebook?: string;
  tiktok?: string;
  youtube?: string;
  twitter?: string;
  linkedin?: string;
  isClosed?: boolean;
  openTime?: string;
  closeTime?: string;
  scheduleEnabled?: boolean;
  bankAccounts?: BankAccount[];
  coverOpacity?: number;
}

export interface BankAccount {
  id: string;
  bankName: string;
  accountType: 'Ahorros' | 'Corriente';
  accountNumber: string;
  qrCodeURL?: string; // Base64 data URL representing uploaded QR code image
  instructions?: string; // Custom instructions
}

export interface SubscriptionPayment {
  id: string;
  userId: string;
  userEmail: string;
  username: string;
  storeName: string;
  storeWhatsapp?: string;
  storePhone?: string;
  ownerWhatsapp?: string;
  customerServiceWhatsapp?: string;
  plan: 'basico' | 'medio' | 'pro';
  amount: number;
  status: 'pending' | 'review' | 'approved' | 'rejected';
  proofImage?: string; // Base64 data URL string representing uploaded transfer receipt photo
  notes?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  periodLabel?: string; // e.g. "Mes de Junio 2026"
}

export interface ProductItem {
  id: string;
  userId: string; // Store Owner UID
  name: string;
  description: string;
  price: number;
  compareAtPrice?: number; // Original price for sales/discounts
  imageURL?: string; // Product photo URL
  category?: string; // e.g. "Ropa", "Calzado", "Accesorios"
  stock: number; // Inventory count
  variantsText?: string; // Comma separated variants like "S, M, L" or "Azul, Rojo"
  active: boolean;
  storeName?: string;
  storeUsername?: string;
  createdAt?: string;
}

export interface OrderItem {
  id: string;
  storeOwnerId: string;
  storeName?: string;
  storeAddress?: string;
  storePhone?: string;
  orderNumber: number; // Numeric sequential order number
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  customerAddress: string;
  paymentMethod: 'whatsapp' | 'transfer' | 'delivery_cash' | 'cod';
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  items: CartItem[];
  totalAmount: number;
  deliveryFee?: number; // Valor del domicilio
  notes?: string;
  createdAt: string;
  proofImage?: string; // Base64 data URL representing uploaded payment receipt or purchase transaction photo
  orderType?: 'delivery' | 'table' | 'pickup';
  isTableOrder?: boolean;

  // Independent Delivery Driver fields
  deliveryDriverId?: string;
  deliveryDriverName?: string;
  deliveryDriverPhone?: string;
  deliveryDriverPhoto?: string;
  deliveryVehicle?: string;
  deliveryVehiclePlate?: string;
  deliveryStep?: 'accepted' | 'to_store' | 'at_store' | 'picked_up' | 'to_client' | 'at_destination' | 'delivered';
  deliveryStepUpdatedAt?: string;
  driverRatingGiven?: boolean;

  // Content Creator Referral fields
  referralCode?: string;
  referralCreatorId?: string;
  referralCreatorName?: string;
  referralCommissionAmount?: number;
  referralCommissionStatus?: 'pending' | 'paid' | 'cancelled';
  referralCommissionPaidAt?: string;
}

export interface CreatorReferral {
  id: string; // doc ID / code key
  code: string; // unique referral code, e.g. "juandiego"
  name: string; // Content Creator name
  email?: string;
  phone?: string;
  socialMedia?: string; // e.g. "@juandiego_ipiales"
  commissionType: 'percentage' | 'fixed'; // percentage (e.g. 5%) or fixed amount (e.g. 2000 COP)
  commissionValue: number; // 5 or 2000
  active: boolean;
  totalClicks: number;
  totalOrdersCount: number;
  totalSalesAmount: number;
  totalEarnings: number;
  totalPaid: number;
  createdAt: string;
  updatedAt: string;
}

export interface ReferralCommission {
  id: string;
  creatorId: string;
  creatorCode: string;
  creatorName: string;
  orderId: string;
  orderNumber?: number;
  storeName?: string;
  orderTotal: number;
  commissionAmount: number;
  status: 'pending' | 'paid' | 'cancelled';
  createdAt: string;
  paidAt?: string;
  notes?: string;
}

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  selectedVariant?: string;
  imageURL?: string;
}

export interface CustomTheme {
  id: string; // 'minimal' | 'midnight' | 'emerald' | 'pastel' | 'custom'
  name: string;
  category?: 'food' | 'dessert' | 'nightlife' | 'dark' | 'light' | 'all' | string;
  description?: string;
  bgType: 'flat' | 'gradient' | 'image';
  bgColor: string; // e.g., "#0f172a" or a gradient CSS
  textColor: string;
  cardBg: string; // Product card background
  cardBorder: string;
  cardTextColor: string;
  fontFamily: 'font-sans' | 'font-serif' | 'font-mono' | 'font-display';
  buttonStyle: 'rounded' | 'square' | 'pill' | 'shadow' | 'bordered';
  accentColor?: string; // Accent highlights for buttons/price tags
  isPremium?: boolean;
}

export interface StoreCategory {
  id: string;
  name: string;
}

export interface LinkItem {
  id: string;
  userId: string;
  title: string;
  url: string;
  icon?: string;
  active: boolean;
  order: number;
}

export interface SocialLinks {
  instagram?: string;
  facebook?: string;
  tiktok?: string;
  youtube?: string;
  twitter?: string;
  whatsapp?: string;
  [key: string]: string | undefined;
}

export interface LeadItem {
  id: string;
  userId: string;
  name: string;
  email: string;
  message: string;
  createdAt: string;
}

export interface PageViewAnalytic {
  id?: string;
  userId: string;
  timestamp: string;
  referrer?: string;
  country?: string;
  city?: string;
  browser?: string;
  device?: string;
}

export interface ClickAnalytic {
  id?: string;
  userId: string;
  linkId: string;
  linkTitle: string;
  timestamp: string;
}

export type PrizeCategory = 'dish' | 'drink' | 'dessert' | 'discount' | 'points' | 'combo' | 'appetizer' | 'main';

export interface CustomerPrize {
  id: string;
  title: string;
  category: PrizeCategory;
  description: string;
  code: string;
  discountAmount?: number; // COP value
  isRedeemed: boolean;
  wonAt: string;
  redeemedAt?: string;
  expiresAt?: string;
}

export interface CustomerProfile {
  id: string; // Phone number or unique ID
  phone: string;
  name: string;
  password?: string;
  email?: string;
  avatarUrl?: string;
  authUid?: string;
  address?: string;
  notes?: string;
  points: number; // Puntos de fidelidad Ryyco
  totalOrdersCount: number;
  totalSpent: number;
  spinsAvailable: number; // Tiros o giros disponibles en la ruleta de platos gratis
  wonPrizes?: CustomerPrize[];
  createdAt: string;
  updatedAt: string;
}

export interface RedeemableFoodReward {
  id: string;
  title: string;
  description: string;
  pointsCost: number;
  iconName: string;
  valueEstCop: number;
  category: PrizeCategory;
}


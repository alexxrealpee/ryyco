/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  Store, 
  ShoppingBag, 
  Sparkles, 
  ArrowRight, 
  Check, 
  Smartphone, 
  ChevronRight, 
  Package, 
  CreditCard, 
  TrendingUp, 
  Users, 
  MessageCircle, 
  Coins,
  Search,
  QrCode,
  Mail,
  Instagram,
  Facebook,
  Bike,
  Utensils,
  Printer,
  FileText,
  Share2,
  Flame,
  MapPin,
  Clock,
  Award,
  X,
  Rocket,
  Star,
  Headphones,
  Tag,
  Mic,
  Bot,
  Volume2,
  Activity,
  DollarSign,
  Calendar,
  MessageSquare,
  Scale,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import LinnkProLogo from './LinnkProLogo';
import { fetchAllStoresMap } from '../lib/firebase';
import { UserProfile } from '../types';
import StoreTermsModal from './StoreTermsModal';
import BuyerTermsModal from './BuyerTermsModal';
import { SELLER_TERMS_PREAMBLE, SELLER_TERMS_SECTIONS } from '../data/sellerTermsData';
import { BUYER_TERMS_PREAMBLE, BUYER_TERMS_SECTIONS } from '../data/buyerTermsData';

interface LandingPageProps {
  onNavigate: (view: 'landing' | 'login' | 'signup' | 'dashboard' | 'admin' | 'tienda' | 'driver-register' | 'driver-portal', usernameToClaim?: string) => void;
}

export default function LandingPage({ onNavigate }: LandingPageProps) {
  const [storeSlug, setStoreSlug] = useState('');
  const [checking, setChecking] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);
  const [isBuyerTermsModalOpen, setIsBuyerTermsModalOpen] = useState(false);
  const [showFooterTerms, setShowFooterTerms] = useState(false);
  const [footerTermsTab, setFooterTermsTab] = useState<'buyers' | 'sellers'>('buyers');

  // Partner stores in Ipiales with logos and names
  const [partnerStores, setPartnerStores] = useState<Array<{
    name: string;
    category?: string;
    logo?: string;
    username?: string;
  }>>([
    {
      name: "Señor Barril",
      category: "Parrilla & Asados",
      logo: "https://images.unsplash.com/photo-1544025162-d76694265947?w=200&auto=format&fit=crop&q=80",
      username: "senor-barril"
    },
    {
      name: "Comidas Rápidas Sofí",
      category: "Hamburguesas & Salchipapas",
      logo: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=200&auto=format&fit=crop&q=80",
      username: "comidas-rapidas-sofi"
    },
    {
      name: "La Casa de los Caldos",
      category: "Caldos & Tradición",
      logo: "https://images.unsplash.com/photo-1547592166-23ac45744acd?w=200&auto=format&fit=crop&q=80",
      username: "la-casa-de-los-caldos"
    },
    {
      name: "Las Delicias de Doña Yoli",
      category: "Panadería & Típicos",
      logo: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=200&auto=format&fit=crop&q=80",
      username: "las-delicias-de-dona-yoli"
    }
  ]);

  useEffect(() => {
    async function loadStores() {
      try {
        const map = await fetchAllStoresMap();
        if (map && Object.keys(map).length > 0) {
          const uniqueList: Array<{ name: string; category?: string; logo?: string; username?: string }> = [];
          const seen = new Set<string>();

          const baseFeatured = [
            { name: "Señor Barril", category: "Parrilla & Asados", logo: "https://images.unsplash.com/photo-1544025162-d76694265947?w=200&auto=format&fit=crop&q=80", username: "senor-barril" },
            { name: "Comidas Rápidas Sofí", category: "Hamburguesas & Salchipapas", logo: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=200&auto=format&fit=crop&q=80", username: "comidas-rapidas-sofi" },
            { name: "La Casa de los Caldos", category: "Caldos & Tradición", logo: "https://images.unsplash.com/photo-1547592166-23ac45744acd?w=200&auto=format&fit=crop&q=80", username: "la-casa-de-los-caldos" },
            { name: "Las Delicias de Doña Yoli", category: "Panadería & Típicos", logo: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=200&auto=format&fit=crop&q=80", username: "las-delicias-de-dona-yoli" }
          ];

          baseFeatured.forEach(f => {
            const foundProfile = Object.values(map).find(p => 
              p.displayName?.toLowerCase().trim() === f.name.toLowerCase().trim() ||
              p.username?.toLowerCase().trim() === f.username.toLowerCase().trim()
            );
            if (foundProfile && foundProfile.photoURL) {
              uniqueList.push({
                name: foundProfile.displayName || f.name,
                category: foundProfile.category || f.category,
                logo: foundProfile.photoURL,
                username: foundProfile.username || f.username
              });
            } else {
              uniqueList.push(f);
            }
            seen.add(f.name.toLowerCase().trim());
          });

          // Add any other active stores registered in the database (up to 8 total)
          Object.values(map).forEach(p => {
            const dName = p.displayName || p.username || '';
            const key = dName.toLowerCase().trim();
            if (dName && !seen.has(key) && !p.suspended && uniqueList.length < 8) {
              seen.add(key);
              uniqueList.push({
                name: dName,
                category: p.category || 'Restaurante',
                logo: p.photoURL || 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=200&auto=format&fit=crop&q=80',
                username: p.username
              });
            }
          });

          setPartnerStores(uniqueList);
        }
      } catch (err) {
        console.warn("Could not load partner stores map:", err);
      }
    }
    loadStores();
  }, []);

  // Mock State for Restaurant Interactive simulation
  const [mockCategory, setMockCategory] = useState('TODOS');
  const [mockCart, setMockCart] = useState(0);

  const mockProducts = [
    {
      id: 'p1',
      category: 'PARRILLA',
      name: 'Costillas de Cerdo BBQ + Papas Francesas',
      price: '$32.000',
      image: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=300&auto=format&fit=crop&q=80',
    },
    {
      id: 'p2',
      category: 'HAMBURGUESAS',
      name: 'Hamburguesa Doble Carne Queso Gratinado',
      price: '$22.000',
      image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=300&auto=format&fit=crop&q=80',
    },
    {
      id: 'p3',
      category: 'COMIDAS RÁPIDAS',
      name: 'Salchipapa Especial Señor Barril',
      price: '$18.000',
      image: 'https://images.unsplash.com/photo-1585032226651-759b368d7246?w=300&auto=format&fit=crop&q=80',
    },
    {
      id: 'p4',
      category: 'BEBIDAS',
      name: 'Limonada de Coco y Hierbabuena',
      price: '$9.000',
      image: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=300&auto=format&fit=crop&q=80',
    }
  ];

  const filteredMockProducts = mockProducts.filter(p => {
    if (mockCategory === 'TODOS') return true;
    return p.category === mockCategory;
  });

  const handleClaim = (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeSlug.trim()) return;
    
    setChecking(true);
    setTimeout(() => {
      setChecking(false);
      const cleanName = storeSlug.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
      onNavigate('signup', cleanName);
    }, 600);
  };

  const features = [
    {
      icon: <Mic className="w-6 h-6 text-[#E63946]" />,
      title: "Mesero Virtual IA por Voz Natural",
      desc: "Tus comensales y clientes pueden ordenar platos hablando con voz natural a un mesero virtual inteligente que responde, recomienda y arma el pedido al instante."
    },
    {
      icon: <Bot className="w-6 h-6 text-[#F4B400]" />,
      title: "Administrador IA para Propietarios",
      desc: "Pregúntale por voz a tu panel cómo te fue en el día con ventas, pedidos o tu balance del mes. El Administrador IA te informa métricas y rendimiento financiero en segundos."
    },
    {
      icon: <QrCode className="w-6 h-6 text-[#E63946]" />,
      title: "Menú Digital y Código QR en Mesa",
      desc: "Creamos un menú digital profesional con fotos, precios y categorías. Le entregamos un código QR personalizado para que sus clientes solo lo escaneen desde la mesa y pidan al instante."
    },
    {
      icon: <Bike className="w-6 h-6 text-[#F4B400]" />,
      title: "Domicilios Rápidos y Exclusivos",
      desc: "Mejoramos la experiencia con domicilios rápidos, tomados con un pedido a la vez para que la comida llegue caliente y en buen estado a la puerta de sus clientes."
    },
    {
      icon: <Share2 className="w-6 h-6 text-[#E63946]" />,
      title: "Publicidad en TikTok, FB e IG",
      desc: "Promocionamos su restaurante en TikTok, Facebook e Instagram. Así más personas descubren su negocio y se multiplican sus ventas cada mes."
    },
    {
      icon: <MapPin className="w-6 h-6 text-[#F4B400]" />,
      title: "Directorio de Restaurantes en Ipiales",
      desc: "Y lo más importante: su restaurante aparece en un directorio oficial junto a otros restaurantes de Ipiales, lo que aumenta significativamente su visibilidad local."
    },
    {
      icon: <Smartphone className="w-6 h-6 text-[#E63946]" />,
      title: "Panel Sencillo y Tiempo Real",
      desc: "Desde un panel sencillo, puede agregar platos, cambiar precios, actualizar fotos de su menú y recibir pedidos directos en tiempo real."
    },
    {
      icon: <Award className="w-6 h-6 text-[#F4B400]" />,
      title: "Tecnología, Publicidad y Domicilios",
      desc: "Nosotros ponemos la tecnología, la publicidad y los domicilios. Usted se dedica a lo que mejor sabe hacer: preparar deliciosa comida."
    }
  ];

  return (
    <div className="bg-[#090B12] text-gray-100 min-h-screen selection:bg-[#E63946] selection:text-white font-sans">
      
      {/* Navigation Header */}
      <header className="border-b border-[#232B3A] backdrop-blur-md sticky top-0 z-50 bg-[#090B12]/95">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-3 sm:py-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-0">
          <LinnkProLogo 
            onClick={() => onNavigate('tienda')}
            height={42}
            imgClassName="h-7.5 sm:h-[42px]"
          />
          
          <div className="flex items-center justify-center sm:justify-end gap-2.5 sm:gap-4 w-full sm:w-auto">
            <button 
              onClick={() => {
                window.history.pushState({}, '', '/domiciliario');
                onNavigate('driver-portal');
              }}
              className="hidden sm:flex px-2 py-1.5 md:px-3 md:py-2 text-xs md:text-sm font-semibold text-[#E63946] hover:text-white transition-colors items-center gap-1 cursor-pointer whitespace-nowrap bg-[#E63946]/10 border border-[#E63946]/30 rounded-xl"
            >
              <Bike className="w-3.5 h-3.5 text-[#E63946]" />
              <span>Domiciliarios</span>
            </button>
            <button 
              onClick={() => onNavigate('tienda')}
              className="px-2 py-1.5 md:px-3 md:py-2 text-xs md:text-sm font-semibold text-[#A9B2C3] hover:text-white transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Ver Vitrina</span>
            </button>
            <button 
              onClick={() => onNavigate('login')}
              className="px-2 py-1.5 md:px-4 md:py-2 text-xs md:text-sm font-medium hover:text-white transition-colors text-[#A9B2C3] whitespace-nowrap"
            >
              <span className="hidden sm:inline">Acceso Vendedor</span>
              <span className="sm:hidden">Ingresar</span>
            </button>
            <button 
              onClick={() => onNavigate('signup')}
              className="bg-[#E63946] text-white hover:bg-[#D62839] transition-all font-bold rounded-xl text-xs md:text-sm px-3 py-1.5 md:px-4.5 md:py-2 shadow-md hover:shadow-lg hover:shadow-[#E63946]/20 active:scale-[0.98] whitespace-nowrap cursor-pointer"
            >
              <span>Crear Tienda</span>
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-12 sm:pt-20 pb-12 sm:pb-20 px-3 sm:px-6">
        {/* Glow Spheres */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] sm:w-[550px] h-[300px] sm:h-[550px] bg-[#E63946]/5 blur-[100px] sm:blur-[140px] rounded-full -z-10" />
        <div className="absolute top-1/4 left-1/3 w-[200px] sm:w-[350px] h-[200px] sm:h-[350px] bg-[#F4B400]/5 blur-[80px] sm:blur-[110px] rounded-full -z-10" />

        <div className="max-w-5xl mx-auto text-center">
          <motion.h1 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-white mb-6 leading-[1.15] break-words"
          >
            Descubre qué quieres <br className="hidden sm:inline" />
            <span className="text-[#E63946]">comer </span><span className="text-[#F4B400]">hoy.</span>
          </motion.h1>

          <motion.p 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="text-sm sm:text-base md:text-lg text-[#A9B2C3] mb-6 max-w-3xl mx-auto leading-relaxed break-words px-2 font-medium"
          >
            <strong className="text-white">Ryyco</strong> es la plataforma gastronómica impulsada por <strong className="text-[#F4B400]">Inteligencia Artificial</strong>: tus clientes pueden pedir platos por <strong className="text-[#E63946]">voz natural con un Mesero Virtual</strong>, y tú como dueño tienes un <strong className="text-[#F4B400]">Administrador IA por voz</strong> para consultar ventas diarias, pedidos y tu balance del mes en tiempo real.
          </motion.p>

          {/* Subdomain Input claim bar */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="max-w-xl mx-auto mb-10"
          >
            <form onSubmit={handleClaim} className="flex flex-col sm:flex-row gap-2.5 bg-[#111827] border border-[#232B3A] p-2 rounded-2xl shadow-xl">
              <div className="flex items-center flex-grow px-3 sm:px-4 py-2 bg-transparent text-[#A9B2C3] min-w-0">
                <span className="text-[#A9B2C3] mr-0.5 select-none font-semibold text-xs sm:text-base shrink-0">ryyco.com/</span>
                <input 
                  type="text" 
                  value={storeSlug}
                  onChange={(e) => setStoreSlug(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
                  placeholder="nombre-restaurante" 
                  className="bg-transparent focus:outline-none text-white text-xs sm:text-base w-full font-semibold placeholder:text-gray-500 focus:ring-0 min-w-0"
                  required
                />
              </div>
              <button 
                type="submit"
                disabled={checking}
                className="bg-[#E63946] hover:bg-[#D62839] text-white font-bold px-5 sm:px-6 py-3 sm:py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-[#E63946]/20 active:scale-[0.98] transition-all shrink-0 text-xs sm:text-base cursor-pointer"
              >
                {checking ? 'Creando...' : 'Crear Menú QR'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
            <div className="text-xs text-center sm:text-start text-[#A9B2C3] mt-3 px-2 flex flex-wrap items-center gap-2 justify-center sm:justify-between">
              <div className="flex items-center gap-1.5 flex-wrap justify-center">
                <span>🚀 Lanzamiento Instantáneo</span>
                <span className="text-[#232B3A]">•</span>
                <button 
                  type="button" 
                  onClick={() => onNavigate('tienda')}
                  className="text-[#F4B400] hover:underline font-bold inline-flex items-center gap-1 cursor-pointer"
                >
                  <span>Ver Directorio</span>
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => setIsPrintModalOpen(true)}
                className="text-[#E63946] hover:text-white font-bold inline-flex items-center gap-1 cursor-pointer bg-[#E63946]/10 border border-[#E63946]/30 px-2.5 py-1 rounded-lg hover:bg-[#E63946]/20 transition text-[11px] sm:text-xs"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Carta de Presentación (Imprimible)</span>
              </button>
            </div>
          </motion.div>

          {/* Restaurant Partners Badge Box with Logos and Names */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.25 }}
            className="max-w-4xl mx-auto bg-[#111827] border border-[#232B3A] rounded-2xl p-4 sm:p-6 text-center shadow-xl"
          >
            <p className="text-[11px] sm:text-xs uppercase tracking-wider text-[#A9B2C3] font-bold mb-4 sm:mb-6 flex items-center justify-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#F4B400] shrink-0" />
              <span>Ya hacen parte de <strong className="text-white">Ryyco.com</strong> en Ipiales:</span>
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 items-start justify-items-center">
              {partnerStores.map((store, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onNavigate('tienda')}
                  className="flex flex-col items-center group cursor-pointer focus:outline-none transition-transform duration-200 hover:-translate-y-1 w-full max-w-[140px]"
                  title={`Ver tienda de ${store.name}`}
                >
                  {/* Circular Logo Container */}
                  <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full p-0.5 bg-gradient-to-tr from-[#E63946] via-[#F4B400] to-[#E63946] shadow-lg shadow-[#E63946]/20 group-hover:shadow-[0_0_20px_rgba(230,57,70,0.5)] group-hover:scale-105 transition-all duration-300">
                    <div className="w-full h-full rounded-full overflow-hidden bg-[#090B12] border-2 border-[#111827] flex items-center justify-center">
                      {store.logo ? (
                        <img 
                          src={store.logo} 
                          alt={store.name}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#1F2937] to-[#111827] text-white font-black text-base sm:text-lg">
                          {store.name.charAt(0)}
                        </div>
                      )}
                    </div>
                    {/* Active Store Indicator */}
                    <span className="absolute bottom-0 right-0 w-3.5 h-3.5 sm:w-4 sm:h-4 bg-emerald-500 border-2 border-[#111827] rounded-full shadow-xs" title="Tienda Activa" />
                  </div>

                  {/* Store Name Underneath */}
                  <span className="mt-2.5 text-xs sm:text-sm font-extrabold text-white group-hover:text-[#F4B400] transition-colors leading-tight text-center line-clamp-2 px-1">
                    {store.name}
                  </span>
                  {store.category && (
                    <span className="text-[10px] text-[#A9B2C3] font-medium mt-0.5 text-center line-clamp-1">
                      {store.category}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <p className="text-xs sm:text-sm text-[#E63946] font-semibold mt-5">
              Y cada vez somos más. ¡Únase hoy! Nosotros ponemos la tecnología, la publicidad y los domicilios.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Simulated Store Interactive mockup */}
      <section className="pb-16 sm:pb-24 px-3 sm:px-6 flex justify-center">
        <div className="relative max-w-5xl w-full bg-[#111827] border border-[#232B3A] rounded-2xl sm:rounded-[32px] p-4 sm:p-6 shadow-2xl overflow-hidden">
          
          {/* Header element of mockup */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#232B3A] pb-3 sm:pb-4 mb-4 sm:mb-6">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-[#E63946]/40 block shrink-0" />
              <span className="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-[#F4B400]/40 block shrink-0" />
              <span className="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-emerald-500/40 block shrink-0" />
              <span className="text-[10px] sm:text-xs text-[#A9B2C3] font-mono ml-1.5 sm:ml-3 truncate max-w-[150px] sm:max-w-none">ryyco.com/panel-vendedor</span>
            </div>
            <span className="bg-[#E63946]/15 text-[#E63946] border border-[#E63946]/30 rounded-full px-2.5 py-0.5 sm:px-3 sm:py-1 text-[9px] sm:text-[10px] font-black tracking-wider uppercase shrink-0">
              CONSTRUCTOR LIVE
            </span>
          </div>

          <div className="grid lg:grid-cols-12 gap-6 sm:gap-8">
            
            {/* Admin Controls Panel */}
            <div className="lg:col-span-7 flex flex-col justify-center space-y-4 sm:space-y-6">
              <div>
                <h3 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-white mb-2 leading-tight break-words">
                  Diseñado para emprendedores y marcas
                </h3>
                <p className="text-[#A9B2C3] text-xs sm:text-sm md:text-base leading-relaxed break-words">
                  Con el creador de Ryyco.com, tienes el control absoluto de tu negocio digital. Olvídate de configuraciones confusas o integraciones complejas. Crea tu catálogo, súbelo a la nube, controla tus pedidos en un panel inteligente y comunícate fluidamente con tus clientes.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="flex gap-3 items-start p-3 bg-[#090B12] rounded-xl border border-[#232B3A]">
                  <div className="bg-[#E63946]/10 p-2 rounded-lg text-[#E63946] shrink-0">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-white mb-1">Analíticas de Venta</h4>
                    <p className="text-xs text-[#A9B2C3] font-medium leading-normal">Visualiza ingresos, visitas y conversión de carrito de compras.</p>
                  </div>
                </div>

                <div className="flex gap-3 items-start p-3 bg-[#090B12] rounded-xl border border-[#232B3A]">
                  <div className="bg-[#F4B400]/10 p-2 rounded-lg text-[#F4B400] shrink-0">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-white mb-1">Múltiples Pagos</h4>
                    <p className="text-xs text-[#A9B2C3] font-medium leading-normal">Soporta pedidos directos, transferencias y pagos contra entrega.</p>
                  </div>
                </div>

                <div className="flex gap-3 items-start p-3 bg-[#090B12] rounded-xl border border-[#232B3A]">
                  <div className="bg-[#E63946]/10 p-2 rounded-lg text-[#E63946] shrink-0">
                    <ShoppingBag className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-white mb-1">Variantes Dinámicas</h4>
                    <p className="text-xs text-[#A9B2C3] font-medium leading-normal">Asigna tallas, colores o configuraciones específicas a tus productos.</p>
                  </div>
                </div>

                <div className="flex gap-3 items-start p-3 bg-[#090B12] rounded-xl border border-[#232B3A]">
                  <div className="bg-[#F4B400]/10 p-2 rounded-lg text-[#F4B400] shrink-0">
                    <Coins className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-white mb-1">100% de Comisión Cero</h4>
                    <p className="text-xs text-[#A9B2C3] font-medium leading-normal">Tus ganancias van directamente a tu cuenta. Sin tarifas ocultas.</p>
                  </div>
                </div>
              </div>

              <div className="pt-2 sm:pt-4">
                <button 
                  onClick={() => onNavigate('signup')}
                  className="w-full sm:w-auto bg-[#E63946] hover:bg-[#D62839] text-white font-bold rounded-2xl px-6 py-3.5 sm:py-4 flex items-center justify-center gap-2 text-sm transition-all cursor-pointer shadow-lg shadow-[#E63946]/20"
                >
                  Regístrate Ahora
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Public Storefront Preview Simulator */}
            <div className="lg:col-span-5 flex justify-center bg-[#090B12] rounded-3xl p-6 border border-[#232B3A]">
              <div className="w-full max-w-[295px] border-[10px] border-[#232B3A] rounded-[44px] bg-[#090B12] overflow-hidden aspect-[9/19] shadow-2xl flex flex-col py-3 px-3 relative">
                
                {/* Simulated Smartphone Status Bar */}
                <div className="flex items-center justify-between px-2.5 mb-3 shrink-0 text-[8px] text-[#A9B2C3] font-black font-mono">
                  <span>12:00</span>
                  <div className="w-14 h-3 bg-[#232B3A] rounded-full flex items-center justify-center shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#090B12]" />
                  </div>
                  <div className="flex items-center gap-1">
                    <span>LTE</span>
                    <div className="w-3.5 h-2 border border-[#A9B2C3]/40 rounded-sm p-[1px] flex items-center">
                      <div className="w-full h-full bg-[#E63946] rounded-3xs" />
                    </div>
                  </div>
                </div>
                
                {/* Simulated Web View Container */}
                <div className="flex-grow flex flex-col overflow-y-auto scrollbar-none space-y-3 pb-2 text-left select-none">
                  
                  {/* SEÑOR BARRIL Mock Header */}
                  <div className="flex items-center justify-between pb-2.5 border-b border-[#232B3A] shrink-0">
                    <div className="flex items-center gap-1.5">
                      <div className="w-6 h-6 rounded-full bg-black border border-[#E63946]/40 flex items-center justify-center font-serif text-[5px] font-black text-[#E63946] shadow-inner shrink-0">
                        SB
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[8px] font-black tracking-wider text-white leading-none">
                          SEÑOR BARRIL
                        </span>
                        <span className="text-[5px] font-bold text-[#A9B2C3] tracking-widest uppercase">
                          PARRILLA & BAR - IPIALES
                        </span>
                      </div>
                    </div>
                    
                    {/* Header tools */}
                    <div className="flex items-center gap-1.5">
                      <Search className="w-2.5 h-2.5 text-[#A9B2C3]" />
                      <QrCode className="w-2.5 h-2.5 text-[#A9B2C3]" />
                      {/* Shopping Bag Red Pill Badge */}
                      <div className="bg-[#E63946] text-white font-black px-1.5 py-0.5 rounded-full flex items-center gap-0.5 text-[6px]">
                        <ShoppingBag className="w-2 h-2 text-white" />
                        <span className="bg-white text-[#E63946] w-2.5 h-2.5 rounded-full flex items-center justify-center text-[5px] leading-none">
                          {mockCart}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* SEÑOR BARRIL Mock Hero Section */}
                  <div className="relative rounded-xl bg-gradient-to-b from-[#111827] to-[#090B12] p-3 text-center border border-[#232B3A] overflow-hidden shrink-0">
                    <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-24 h-24 bg-[#E63946]/10 blur-xl rounded-full pointer-events-none" />
                    <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 w-20 h-20 bg-[#F4B400]/10 blur-xl rounded-full pointer-events-none" />

                    <h4 className="text-[9px] font-black tracking-tight text-white mb-1 leading-tight uppercase relative z-10">
                      EL MEJOR SABOR A LA <br />PARRILLA EN IPIALES
                    </h4>
                    <p className="text-[5px] text-[#A9B2C3] mb-2 leading-normal max-w-[140px] mx-auto relative z-10">
                      Pide directo desde tu mesa con código QR o a domicilio caliente.
                    </p>

                    {/* Social networks circles row */}
                    <div className="flex items-center justify-center gap-1.5 mb-2.5 relative z-10">
                      {['chat', 'instagram', 'facebook', 'tiktok'].map((social) => (
                        <div key={social} className="w-4 h-4 rounded-full border border-[#232B3A] bg-[#090B12] flex items-center justify-center text-[5px] text-[#A9B2C3]">
                          {social === 'chat' && '💬'}
                          {social === 'instagram' && '📸'}
                          {social === 'facebook' && 'f'}
                          {social === 'tiktok' && '🎵'}
                        </div>
                      ))}
                    </div>

                    <button 
                      type="button"
                      onClick={() => setMockCategory('PARRILLA')}
                      className="bg-[#E63946] hover:bg-[#D62839] text-white font-black text-[6px] tracking-widest py-1 px-3 rounded-full flex items-center justify-center gap-1 mx-auto shadow-md transition active:scale-95 relative z-10"
                    >
                      VER MENÚ QR 🍖
                    </button>
                  </div>

                  {/* Category Selection Filter Section */}
                  <div className="shrink-0">
                    <span className="text-[4px] font-black text-[#A9B2C3] tracking-wider uppercase block leading-none">Filtrar por Categoría</span>
                    <h5 className="text-[8px] font-black text-white block mt-0.5 uppercase leading-none">Menú del Restaurante</h5>
                    <span className="text-[5px] font-bold text-[#A9B2C3] block mt-0.5">Mostrando {filteredMockProducts.length} platos</span>

                    {/* Horizontal scroll selection pills */}
                    <div className="flex gap-1.5 overflow-x-auto pb-1 mt-1.5 scrollbar-none">
                      {[
                        { id: 'TODOS', label: 'TODOS' },
                        { id: 'PARRILLA', label: 'PARRILLA' },
                        { id: 'HAMBURGUESAS', label: 'HAMBURG...' },
                        { id: 'COMIDAS RÁPIDAS', label: 'RÁPIDAS' },
                        { id: 'BEBIDAS', label: 'BEBIDAS' }
                      ].map((cat) => {
                        const isSelected = mockCategory === cat.id;
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => setMockCategory(cat.id)}
                            className={`flex items-center gap-1 p-1 rounded-md border text-left shrink-0 transition-all ${
                              isSelected 
                                ? 'bg-[#E63946]/15 border-[#E63946]' 
                                : 'bg-[#111827] border-[#232B3A]'
                            }`}
                          >
                            <div className={`p-0.5 rounded ${isSelected ? 'bg-[#E63946] text-white' : 'bg-[#232B3A] text-[#A9B2C3]'}`}>
                              <Utensils className="w-2.5 h-2.5" />
                            </div>
                            <div className="min-w-0 pr-0.5">
                              <span className="text-[3px] font-bold text-[#A9B2C3] uppercase block leading-none">Categoría</span>
                              <span className="text-[5px] font-black text-white block truncate uppercase">{cat.label}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Product Grid Area */}
                  <div className="grid grid-cols-2 gap-1.5">
                    {filteredMockProducts.map((p) => (
                      <div key={p.id} className="bg-[#111827] border border-[#232B3A] rounded-lg p-1.5 flex flex-col justify-between shrink-0 shadow-sm relative">
                        <div className="absolute top-1.5 right-1.5 bg-[#E63946]/10 text-[#E63946] font-bold text-[4px] px-1 py-0.2 rounded uppercase tracking-wider z-10 flex items-center gap-0.5">
                          <span className="w-0.8 h-0.8 rounded-full bg-[#E63946] inline-block animate-ping" />
                          FAVORITO
                        </div>
                        
                        <div>
                          {/* Image Box */}
                          <div className="w-full aspect-square rounded bg-[#090B12] overflow-hidden mb-1 relative">
                            <img 
                              src={p.image} 
                              alt={p.name} 
                              className="w-full h-full object-cover" 
                              referrerPolicy="no-referrer"
                            />
                          </div>
                          
                          <span className="text-[4px] font-black text-[#F4B400] uppercase tracking-wide block leading-none">{p.category}</span>
                          <h6 className="text-[6px] font-bold text-white line-clamp-2 min-h-[14px] leading-tight mt-0.5">{p.name}</h6>
                        </div>

                        <div>
                          <div className="text-[7px] font-black text-white mt-1">{p.price}</div>
                          
                          <button 
                            type="button"
                            onClick={() => setMockCart(prev => prev + 1)}
                            className="mt-1 w-full py-1 bg-[#E63946] hover:bg-[#D62839] text-white font-black rounded text-[5px] flex items-center justify-center gap-0.5 transition active:scale-95 cursor-pointer"
                          >
                            <span>PEDIR</span> <Utensils className="w-1.5 h-1.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                    
                    {filteredMockProducts.length === 0 && (
                      <div className="col-span-2 py-4 text-center text-[#A9B2C3] text-[6px]">
                        No hay productos en esta categoría.
                      </div>
                    )}
                  </div>

                  {/* SEÑOR BARRIL Mock Footer */}
                  <div className="text-center pt-3 border-t border-[#232B3A] mt-2 pb-1.5">
                    <div className="w-5 h-5 rounded-full bg-black border border-[#E63946]/40 flex items-center justify-center font-serif text-[4px] font-black text-[#E63946] mx-auto mb-0.5">
                      SB
                    </div>
                    <span className="text-[3px] font-black text-[#A9B2C3] uppercase tracking-widest block">RESTAURANTE</span>
                    <h6 className="text-[6px] font-black text-white leading-none">Señor Barril</h6>
                    <span className="text-[5px] font-black text-[#E63946] tracking-wider block mt-0.5">ryyco.com/senor-barril</span>
                    <p className="text-[4px] text-[#A9B2C3] mt-1">El mejor sabor a la parrilla de Ipiales en tu mesa o domicilio.</p>
                    
                    <div className="flex items-center justify-center gap-1 mt-1.5 text-[4px] text-[#A9B2C3]">
                      <Mail className="w-1.5 h-1.5" />
                      <span>contacto@senorbarril.com</span>
                    </div>

                    <div className="flex justify-center gap-1 mt-2">
                      {['💬', '📸', 'f', '🎵'].map((icon, idx) => (
                        <div key={idx} className="w-3.5 h-3.5 rounded-full bg-[#090B12] border border-[#232B3A] flex items-center justify-center text-[4px] text-[#A9B2C3]">
                          {icon}
                        </div>
                      ))}
                    </div>
                    
                    <span className="text-[3px] font-black text-[#A9B2C3] uppercase tracking-widest block mt-3">MENÚ PRO POR ♥ RYYCO.COM</span>
                  </div>

                </div>

                {/* Floating WhatsApp Buttons Inside the Mockup Simulator */}
                <div 
                  onClick={() => setMockCart(prev => prev + 1)}
                  className="absolute bottom-3 left-3 w-5 h-5 rounded-full bg-[#E63946] hover:bg-[#D62839] text-white shadow-md flex items-center justify-center cursor-pointer active:scale-95 transition"
                >
                  <span className="text-[6px]">💬</span>
                </div>
                <div 
                  onClick={() => setMockCart(prev => prev + 1)}
                  className="absolute bottom-3 right-3 w-5 h-5 rounded-full bg-[#E63946] hover:bg-[#D62839] text-white shadow-md flex items-center justify-center cursor-pointer active:scale-95 transition"
                >
                  <span className="text-[6px]">💬</span>
                </div>

              </div>
            </div>

          </div>

        </div>
      </section>

      {/* DEDICATED AI VOICE SECTION: MESERO VIRTUAL & ADMINISTRADOR IA */}
      <section className="py-20 px-3 sm:px-6 relative overflow-hidden bg-gradient-to-b from-[#090B12] via-[#0D111A] to-[#090B12] border-t border-[#232B3A]">
        {/* Glow FX Background */}
        <div className="absolute top-1/3 left-1/4 w-[350px] sm:w-[500px] h-[350px] sm:h-[500px] bg-[#E63946]/10 blur-[130px] rounded-full -z-10 pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-[350px] sm:w-[500px] h-[350px] sm:h-[500px] bg-[#F4B400]/10 blur-[130px] rounded-full -z-10 pointer-events-none" />

        <div className="max-w-7xl mx-auto">
          {/* Section Header */}
          <div className="text-center max-w-3xl mx-auto mb-14 sm:mb-20">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-gradient-to-r from-[#E63946]/20 to-[#F4B400]/20 border border-[#E63946]/30 text-[#F4B400] text-xs font-black uppercase tracking-wider mb-4 shadow-sm">
              <Sparkles className="w-4 h-4 text-[#F4B400] animate-pulse" />
              <span>Inteligencia Artificial con Voz Natural</span>
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-white mb-4 tracking-tight leading-tight">
              Pide y administra tu restaurante <br className="hidden sm:inline" />
              <span className="text-[#E63946]">hablando por voz natural</span>
            </h2>
            <p className="text-[#A9B2C3] text-sm sm:text-base md:text-lg leading-relaxed">
              En <strong className="text-white">Ryyco</strong> revolucionamos la experiencia gastronómica: tus clientes ordenan con un <strong>Mesero Virtual IA</strong> y tú tienes un <strong>Administrador IA</strong> que te reporta ventas del día y del mes al instante.
            </p>
          </div>

          {/* Dual AI Pillars Grid */}
          <div className="grid lg:grid-cols-2 gap-8 items-stretch">
            
            {/* PILLAR 1: CLIENTES - MESERO VIRTUAL IA */}
            <div className="bg-[#111827] border border-[#E63946]/30 hover:border-[#E63946]/70 transition-all duration-300 rounded-3xl p-6 sm:p-8 flex flex-col justify-between relative shadow-2xl group">
              <div className="absolute -top-3.5 left-6 sm:left-8 bg-gradient-to-r from-[#E63946] to-[#D62839] text-white text-[11px] font-black uppercase tracking-wider px-3.5 py-1 rounded-full shadow-md flex items-center gap-1.5">
                <Mic className="w-3.5 h-3.5" />
                <span>Para tus Clientes • Mesero Virtual</span>
              </div>

              <div>
                <div className="flex items-center gap-3.5 mb-5 mt-2">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-[#E63946]/15 border border-[#E63946]/30 text-[#E63946] flex items-center justify-center shrink-0 shadow-inner">
                    <Mic className="w-6 h-6 sm:w-7 sm:h-7" />
                  </div>
                  <div>
                    <h3 className="text-xl sm:text-2xl font-black text-white leading-tight">
                      Mesero Virtual por Voz Natural
                    </h3>
                    <p className="text-xs sm:text-sm text-[#A9B2C3] font-medium">
                      Tus comensales piden platos hablando en vivo
                    </p>
                  </div>
                </div>

                <p className="text-[#A9B2C3] text-xs sm:text-sm leading-relaxed mb-6">
                  Tus clientes ya no tienen que buscar plato por plato en la pantalla. Solo presionan el micrófono del mesero virtual, le hablan naturalmente y la IA les recomienda opciones, personaliza su plato y lo agrega de inmediato a la orden.
                </p>

                {/* Simulated Voice Dialogue Box */}
                <div className="bg-[#090B12] border border-[#232B3A] rounded-2xl p-4 sm:p-5 space-y-3.5 mb-6">
                  {/* Voice waveform simulation header */}
                  <div className="flex items-center justify-between border-b border-[#232B3A] pb-2.5">
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                      <span>Mesero IA en Vivo</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-1 h-3 bg-[#E63946] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1 h-5 bg-[#F4B400] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1 h-4 bg-[#E63946] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      <span className="w-1 h-6 bg-[#F4B400] rounded-full animate-bounce" style={{ animationDelay: '450ms' }} />
                      <span className="w-1 h-3 bg-[#E63946] rounded-full animate-bounce" style={{ animationDelay: '600ms' }} />
                    </div>
                  </div>

                  {/* Customer phrase */}
                  <div className="flex items-start gap-2.5">
                    <div className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 font-black text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                      Tú
                    </div>
                    <div className="bg-[#1F2937] text-white text-xs sm:text-sm p-3 rounded-2xl rounded-tl-none font-medium leading-relaxed">
                      🎙️ <em>"Mesero, recomiéndame una hamburguesa especial con tocineta y papas francesas."</em>
                    </div>
                  </div>

                  {/* AI Response phrase */}
                  <div className="flex items-start gap-2.5">
                    <div className="w-6 h-6 rounded-full bg-[#E63946]/20 text-[#E63946] font-black text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                      IA
                    </div>
                    <div className="bg-[#E63946]/10 border border-[#E63946]/20 text-gray-200 text-xs sm:text-sm p-3 rounded-2xl rounded-tl-none leading-relaxed">
                      <span className="text-[#F4B400] font-bold">Mesero Virtual:</span> "¡Con gusto! Te sugiero la <strong>Hamburguesa Doble Especial ($28.000)</strong>. La he añadido a tu carrito con papas francesas crujientes. ¿Deseas agregar gaseosa o postre?"
                    </div>
                  </div>
                </div>

                {/* Key Benefits List */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-[#A9B2C3] font-semibold mb-6">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Reconocimiento de voz natural fluido</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Carga automática de platos al carrito</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Sugerencias de platos y combos</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Disponible en celular y computador</span>
                  </div>
                </div>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => onNavigate('tienda')}
                  className="w-full py-3.5 px-5 rounded-2xl bg-[#E63946] hover:bg-[#D62839] text-white font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-[#E63946]/25 cursor-pointer"
                >
                  <Volume2 className="w-4 h-4" />
                  <span>Explorar Vitrina con Mesero IA</span>
                </button>
              </div>
            </div>

            {/* PILLAR 2: ADMINISTRADORES - ADMINISTRADOR IA DE VENTAS */}
            <div className="bg-[#111827] border border-[#F4B400]/30 hover:border-[#F4B400]/70 transition-all duration-300 rounded-3xl p-6 sm:p-8 flex flex-col justify-between relative shadow-2xl group">
              <div className="absolute -top-3.5 left-6 sm:left-8 bg-gradient-to-r from-[#F4B400] to-[#E0A600] text-black text-[11px] font-black uppercase tracking-wider px-3.5 py-1 rounded-full shadow-md flex items-center gap-1.5">
                <Bot className="w-3.5 h-3.5 text-black" />
                <span>Para Propietarios • Administrador IA</span>
              </div>

              <div>
                <div className="flex items-center gap-3.5 mb-5 mt-2">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-[#F4B400]/15 border border-[#F4B400]/30 text-[#F4B400] flex items-center justify-center shrink-0 shadow-inner">
                    <Bot className="w-6 h-6 sm:w-7 sm:h-7" />
                  </div>
                  <div>
                    <h3 className="text-xl sm:text-2xl font-black text-white leading-tight">
                      Administrador IA de tu Negocio
                    </h3>
                    <p className="text-xs sm:text-sm text-[#A9B2C3] font-medium">
                      Habla con tu panel para saber cómo va tu restaurante
                    </p>
                  </div>
                </div>

                <p className="text-[#A9B2C3] text-xs sm:text-sm leading-relaxed mb-6">
                  Como dueño o encargado, no tienes que perder tiempo analizando tablas complejas. Habla por voz con tu Administrador IA y pregúntale cómo te fue hoy, cuántos pedidos se hicieron o cómo van las ventas acumuladas del mes.
                </p>

                {/* Simulated Voice Dialogue Box */}
                <div className="bg-[#090B12] border border-[#232B3A] rounded-2xl p-4 sm:p-5 space-y-3.5 mb-6">
                  {/* Status header */}
                  <div className="flex items-center justify-between border-b border-[#232B3A] pb-2.5">
                    <div className="flex items-center gap-2 text-xs font-bold text-[#F4B400]">
                      <Activity className="w-3.5 h-3.5 text-[#F4B400] animate-pulse" />
                      <span>Administrador IA Activo</span>
                    </div>
                    <span className="text-[10px] font-mono text-[#A9B2C3] bg-[#1F2937] px-2 py-0.5 rounded-md">
                      Métricas en Tiempo Real
                    </span>
                  </div>

                  {/* Admin phrase 1 */}
                  <div className="flex items-start gap-2.5">
                    <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 font-black text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                      Tú
                    </div>
                    <div className="bg-[#1F2937] text-white text-xs sm:text-sm p-3 rounded-2xl rounded-tl-none font-medium leading-relaxed">
                      🎙️ <em>"¿Cómo me fue hoy en ventas y pedidos?"</em>
                    </div>
                  </div>

                  {/* AI Response phrase 1 */}
                  <div className="flex items-start gap-2.5">
                    <div className="w-6 h-6 rounded-full bg-[#F4B400]/20 text-[#F4B400] font-black text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                      IA
                    </div>
                    <div className="bg-[#F4B400]/10 border border-[#F4B400]/20 text-gray-200 text-xs sm:text-sm p-3 rounded-2xl rounded-tl-none leading-relaxed">
                      <span className="text-[#F4B400] font-bold">Administrador IA:</span> "Hoy registraste <strong>18 pedidos completados</strong> por un total de <strong>$468.000 COP</strong> en ventas. Tu plato más pedido fue la <em>Salchipapa Especial</em>."
                    </div>
                  </div>

                  {/* Admin phrase 2 */}
                  <div className="flex items-start gap-2.5 pt-1">
                    <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 font-black text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                      Tú
                    </div>
                    <div className="bg-[#1F2937] text-white text-xs sm:text-sm p-3 rounded-2xl rounded-tl-none font-medium leading-relaxed">
                      🎙️ <em>"¿Y cómo nos fue en el balance del mes?"</em>
                    </div>
                  </div>

                  {/* AI Response phrase 2 */}
                  <div className="flex items-start gap-2.5">
                    <div className="w-6 h-6 rounded-full bg-[#F4B400]/20 text-[#F4B400] font-black text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                      IA
                    </div>
                    <div className="bg-[#F4B400]/10 border border-[#F4B400]/20 text-gray-200 text-xs sm:text-sm p-3 rounded-2xl rounded-tl-none leading-relaxed">
                      <span className="text-[#F4B400] font-bold">Administrador IA:</span> "En el mes acumulas <strong>$11.450.000 COP en ventas</strong> (+24% vs mes anterior) con <strong>420 pedidos atendidos</strong> y 0% de comisiones retenidas."
                    </div>
                  </div>
                </div>

                {/* Key Benefits List */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-[#A9B2C3] font-semibold mb-6">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Reporte de ventas del día y del mes por voz</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Control de pedidos pendientes y despachos</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Identificación de productos más vendidos</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Voz natural y respuestas en tiempo real</span>
                  </div>
                </div>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => onNavigate('signup')}
                  className="w-full py-3.5 px-5 rounded-2xl bg-[#F4B400] hover:bg-[#e0a600] text-black font-black text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-[#F4B400]/20 cursor-pointer"
                >
                  <Bot className="w-4 h-4 text-black" />
                  <span>Crear mi Tienda y Obtener Asistente IA</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* Features Detail Grid */}
      <section className="py-20 bg-[#090B12] border-y border-[#232B3A] px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">Todo lo necesario para comercializar de inmediato</h2>
            <p className="text-[#A9B2C3] mb-2 text-sm md:text-base">Hemos automatizado las tareas complejas de comercio electrónico para que te enfoques en tus ventas.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {features.map((feature, idx) => (
              <div key={idx} className="bg-[#111827] border border-[#232B3A] p-6 md:p-8 rounded-2xl hover:border-[#E63946]/50 transition">
                <div className="bg-[#090B12] p-3 rounded-xl w-fit mb-5 border border-[#232B3A]">
                  {feature.icon}
                </div>
                <h3 className="text-lg font-bold text-white mb-2">{feature.title}</h3>
                <p className="text-[#A9B2C3] text-sm leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Steps Row */}
      <section className="py-20 px-6 max-w-7xl mx-auto text-center">
        <h2 className="text-2xl md:text-3xl font-extrabold text-white mb-3">¿Cómo crear tu tienda?</h2>
        <p className="text-[#A9B2C3] mb-12 text-sm">Empieza hoy mismo tu emprendimiento digital en tres sencillos pasos.</p>

        <div className="grid md:grid-cols-3 gap-8">
          <div className="p-6 bg-[#111827] rounded-2xl border border-[#232B3A] flex flex-col items-center">
            <span className="w-10 h-10 rounded-full bg-[#E63946]/15 text-[#E63946] font-black text-sm flex items-center justify-center mb-4">1</span>
            <h4 className="font-bold text-white text-base mb-1.5">Regístrate en Segundos</h4>
            <p className="text-[#A9B2C3] text-xs leading-relaxed max-w-xs">Elige tu nombre de usuario que será tu subdominio de tienda pública sin costo.</p>
          </div>

          <div className="p-6 bg-[#111827] rounded-2xl border border-[#232B3A] flex flex-col items-center">
            <span className="w-10 h-10 rounded-full bg-[#F4B400]/15 text-[#F4B400] font-black text-sm flex items-center justify-center mb-4">2</span>
            <h4 className="font-bold text-white text-base mb-1.5">Completa tu Catálogo</h4>
            <p className="text-[#A9B2C3] text-xs leading-relaxed max-w-xs">Añade imágenes de tus productos, precios con descuento, stock y variantes disponibles.</p>
          </div>

          <div className="p-6 bg-[#111827] rounded-2xl border border-[#232B3A] flex flex-col items-center">
            <span className="w-10 h-10 rounded-full bg-[#E63946]/15 text-[#E63946] font-black text-sm flex items-center justify-center mb-4">3</span>
            <h4 className="font-bold text-white text-base mb-1.5">Recibe Pedidos Directos</h4>
            <p className="text-[#A9B2C3] text-xs leading-relaxed max-w-xs">Comparte tu enlace, tus clientes ingresarán al carrito y coordinarás ventas por WhatsApp o directo.</p>
          </div>
        </div>
      </section>

      {/* PLANES DISPONIBLES */}
      <section id="planes" className="py-16 px-4 sm:px-6 max-w-7xl mx-auto">
        <div className="bg-[#111827] border border-[#232B3A] rounded-3xl p-6 sm:p-10 shadow-2xl">
          {/* Section Header */}
          <div className="flex items-center gap-2 text-[#F4B400] font-extrabold text-xs sm:text-sm uppercase tracking-wider mb-8">
            <Sparkles className="w-4 h-4 text-[#F4B400]" />
            <span>PLANES DISPONIBLES</span>
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 text-left">
            {/* Plan Básico */}
            <div className="bg-[#090B12] border border-[#E63946]/30 hover:border-[#E63946] transition-all rounded-2xl p-6 flex flex-col justify-between relative shadow-lg">
              <div>
                <div className="w-12 h-12 rounded-2xl bg-[#E63946]/10 text-[#E63946] flex items-center justify-center mb-4 border border-[#E63946]/20">
                  <Package className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Plan Básico</h3>
                <p className="text-[#A9B2C3] text-sm mb-6 min-h-[40px] leading-relaxed">
                  Hasta 5 productos para tu inicio de tu negocio.
                </p>

                <div className="border-t border-[#232B3A] my-5" />

                <div className="flex items-center gap-2.5 text-sm text-[#A9B2C3] font-semibold mb-6">
                  <Tag className="w-4 h-4 text-[#E63946] shrink-0" />
                  <span>Hasta <strong className="text-white font-extrabold">5</strong> productos</span>
                </div>
              </div>

              <div>
                <div className="border-t border-[#232B3A] my-5" />
                <div className="mb-6">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-extrabold text-white">$49.000</span>
                    <span className="text-xs text-[#A9B2C3] font-medium">COP/mes</span>
                  </div>
                  <p className="text-[11px] font-extrabold text-[#F4B400] tracking-wider uppercase mt-1">
                    FACTURACIÓN MENSUAL
                  </p>
                </div>
                <button
                  onClick={() => onNavigate('signup')}
                  className="w-full py-3 px-4 rounded-xl border border-[#E63946]/30 hover:border-[#E63946] bg-[#E63946]/10 hover:bg-[#E63946] text-[#E63946] hover:text-white font-bold text-sm transition-all cursor-pointer text-center"
                >
                  Elegir Plan
                </button>
              </div>
            </div>

            {/* Plan Medio */}
            <div className="bg-[#090B12] border border-[#F4B400]/30 hover:border-[#F4B400] transition-all rounded-2xl p-6 flex flex-col justify-between relative shadow-lg">
              <div>
                <div className="w-12 h-12 rounded-2xl bg-[#F4B400]/10 text-[#F4B400] flex items-center justify-center mb-4 border border-[#F4B400]/20">
                  <ShoppingBag className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Plan Medio</h3>
                <p className="text-[#A9B2C3] text-sm mb-6 min-h-[40px] leading-relaxed">
                  Hasta 12 productos para tiendas en crecimiento.
                </p>

                <div className="border-t border-[#232B3A] my-5" />

                <div className="flex items-center gap-2.5 text-sm text-[#A9B2C3] font-semibold mb-6">
                  <Tag className="w-4 h-4 text-[#F4B400] shrink-0" />
                  <span>Hasta <strong className="text-white font-extrabold">12</strong> productos</span>
                </div>
              </div>

              <div>
                <div className="border-t border-[#232B3A] my-5" />
                <div className="mb-6">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-extrabold text-white">$79.000</span>
                    <span className="text-xs text-[#A9B2C3] font-medium">COP/mes</span>
                  </div>
                  <p className="text-[11px] font-extrabold text-[#F4B400] tracking-wider uppercase mt-1">
                    FACTURACIÓN MENSUAL
                  </p>
                </div>
                <button
                  onClick={() => onNavigate('signup')}
                  className="w-full py-3 px-4 rounded-xl border border-[#F4B400]/30 hover:border-[#F4B400] bg-[#F4B400]/10 hover:bg-[#F4B400] text-[#F4B400] hover:text-black font-bold text-sm transition-all cursor-pointer text-center"
                >
                  Elegir Plan
                </button>
              </div>
            </div>

            {/* Plan Avanzado */}
            <div className="bg-[#090B12] border border-[#E63946]/30 hover:border-[#E63946] transition-all rounded-2xl p-6 flex flex-col justify-between relative shadow-lg">
              <div>
                <div className="w-12 h-12 rounded-2xl bg-[#E63946]/10 text-[#E63946] flex items-center justify-center mb-4 border border-[#E63946]/20">
                  <Rocket className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Plan Avanzado</h3>
                <p className="text-[#A9B2C3] text-sm mb-6 min-h-[40px] leading-relaxed">
                  Hasta 24 productos para marcas de alto calibre.
                </p>

                <div className="border-t border-[#232B3A] my-5" />

                <div className="flex items-center gap-2.5 text-sm text-[#A9B2C3] font-semibold mb-6">
                  <Tag className="w-4 h-4 text-[#E63946] shrink-0" />
                  <span>Hasta <strong className="text-white font-extrabold">24</strong> productos</span>
                </div>
              </div>

              <div>
                <div className="border-t border-[#232B3A] my-5" />
                <div className="mb-6">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-extrabold text-white">$99.000</span>
                    <span className="text-xs text-[#A9B2C3] font-medium">COP/mes</span>
                  </div>
                  <p className="text-[11px] font-extrabold text-[#F4B400] tracking-wider uppercase mt-1">
                    FACTURACIÓN MENSUAL
                  </p>
                </div>
                <button
                  onClick={() => onNavigate('signup')}
                  className="w-full py-3 px-4 rounded-xl border border-[#E63946]/30 hover:border-[#E63946] bg-[#E63946]/10 hover:bg-[#E63946] text-[#E63946] hover:text-white font-bold text-sm transition-all cursor-pointer text-center"
                >
                  Elegir Plan
                </button>
              </div>
            </div>

            {/* Plan Especial */}
            <div className="bg-[#090B12] border border-[#F4B400]/60 hover:border-[#F4B400] border-dashed transition-all rounded-2xl p-6 flex flex-col justify-between relative shadow-xl">
              <span className="absolute top-5 right-5 bg-[#F4B400] text-black font-black text-[11px] px-2.5 py-1 rounded-lg uppercase tracking-wider shadow-sm">
                ESPECIAL
              </span>

              <div>
                <div className="w-12 h-12 rounded-2xl bg-[#F4B400]/10 text-[#F4B400] flex items-center justify-center mb-4 border border-[#F4B400]/20">
                  <Star className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Plan Especial</h3>
                <p className="text-[#A9B2C3] text-sm mb-6 min-h-[40px] leading-relaxed">
                  Para tiendas con más de 24 productos y necesidades personalizadas.
                </p>

                <div className="border-t border-[#232B3A] my-5" />

                <div className="flex items-center gap-2.5 text-sm text-[#A9B2C3] font-semibold mb-6">
                  <Tag className="w-4 h-4 text-[#F4B400] shrink-0" />
                  <span>Más de <strong className="text-[#F4B400] font-extrabold">24</strong> productos</span>
                </div>
              </div>

              <div>
                <div className="bg-[#111827] border border-[#232B3A] rounded-xl p-4 mb-6 flex items-start gap-3">
                  <Headphones className="w-5 h-5 text-[#F4B400] shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-white">Comunícate con un asesor</h4>
                    <p className="text-xs text-[#A9B2C3] leading-relaxed mt-0.5">
                      Te ayudamos a encontrar el plan ideal para tu negocio.
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => window.open('https://wa.me/573219730865?text=Hola%20LinnkPro,%20estoy%20interesado%20en%20el%20Plan%20Especial%20para%20mi%20tienda.', '_blank')}
                  className="w-full py-3 px-4 rounded-xl bg-[#F4B400] hover:bg-[#e0a600] text-black font-black text-sm flex items-center justify-center gap-2 transition-all shadow-lg cursor-pointer"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Contactar Asesor</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive FAQ / Call to Action */}
      <section className="bg-[#090B12] pb-20 pt-16 border-t border-[#232B3A] px-6 text-center">
        <div className="max-w-4xl mx-auto bg-[#111827] border border-[#232B3A] rounded-3xl p-8 md:p-12">
          <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4 leading-tight">
            ¿Listo para digitalizar tu negocio hoy?
          </h2>
          <p className="text-[#A9B2C3] max-w-lg mx-auto mb-8 text-sm md:text-base leading-relaxed">
            Únete a cientos de marcas, tiendas boutique y emprendedores que ya incrementan sus ingresos administrando inteligentemente sus productos y pedidos.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5">
            <button 
              onClick={() => onNavigate('signup')}
              className="w-full sm:w-auto px-6 py-4 bg-[#E63946] hover:bg-[#D62839] text-white font-extrabold text-sm rounded-xl transition shadow-lg shadow-[#E63946]/20 active:scale-[0.98] cursor-pointer"
            >
              Comenzar Mi Tienda
            </button>
            <button 
              onClick={() => onNavigate('login')}
              className="w-full sm:w-auto px-6 py-4 bg-[#090B12] hover:bg-[#232B3A] border border-[#232B3A] text-[#A9B2C3] hover:text-white font-bold text-sm rounded-xl transition cursor-pointer"
            >
              Acceder a mi panel
            </button>
          </div>
        </div>
      </section>

      {/* Minimal Footer */}
      <footer className="border-t border-[#232B3A] py-12 px-6 bg-[#090B12] text-[#A9B2C3] text-center text-xs space-y-4">
        <div className="max-w-3xl mx-auto space-y-2">
          <p className="font-extrabold text-white text-base">Ryyco — Pide comida, descubre restaurantes y recibe recomendaciones</p>
          <p className="text-[#A9B2C3] text-xs leading-relaxed max-w-2xl mx-auto">
            Plataforma gastronómica inteligente en Colombia para pedir comida online, explorar restaurantes cerca de ti, consultar menús de platos y ordenar comida a domicilio con facilidad.
          </p>
        </div>

        <p className="font-semibold text-gray-500 text-[11px]">© 2026 Ryyco (ryyco.com). Todos los derechos reservados.</p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <button 
            onClick={() => {
              window.history.pushState({}, '', '/domiciliario');
              onNavigate('driver-portal');
            }}
            className="inline-flex items-center gap-1.5 text-[#E63946] hover:text-white font-extrabold text-xs transition bg-[#E63946]/10 hover:bg-[#E63946]/20 px-4 py-2.5 rounded-xl border border-[#E63946]/30 active:scale-[0.98] cursor-pointer"
          >
            <Bike className="w-4 h-4 text-[#E63946]" />
            <span>Portal Domiciliario</span>
          </button>
          <button 
            onClick={() => onNavigate('driver-register')}
            className="inline-flex items-center gap-1.5 text-[#F4B400] hover:text-white font-extrabold text-xs transition bg-[#F4B400]/10 hover:bg-[#F4B400]/20 px-4 py-2.5 rounded-xl border border-[#F4B400]/30 active:scale-[0.98] cursor-pointer"
          >
            <Bike className="w-4 h-4 text-[#F4B400]" />
            <span>Ser Domiciliario</span>
          </button>
          <button 
            onClick={() => {
              setFooterTermsTab('buyers');
              setIsBuyerTermsModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 text-gray-300 hover:text-white font-extrabold text-xs transition bg-[#182030] hover:bg-[#232B3A] px-4 py-2.5 rounded-xl border border-[#232B3A] active:scale-[0.98] cursor-pointer"
          >
            <ShoppingBag className="w-4 h-4 text-[#E63946]" />
            <span>Términos Compradores</span>
          </button>
          <button 
            onClick={() => {
              setFooterTermsTab('sellers');
              setIsTermsModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 text-gray-300 hover:text-white font-extrabold text-xs transition bg-[#182030] hover:bg-[#232B3A] px-4 py-2.5 rounded-xl border border-[#232B3A] active:scale-[0.98] cursor-pointer"
          >
            <Scale className="w-4 h-4 text-[#F4B400]" />
            <span>Términos Vendedores</span>
          </button>
          <a 
            href="https://wa.me/573219730865?text=Hola!%20Necesito%20ayuda%20o%20soporte%20con%20Ryyco"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[#E63946] hover:text-white font-extrabold text-xs transition bg-[#E63946]/10 hover:bg-[#E63946]/20 px-4 py-2.5 rounded-xl border border-[#E63946]/30 active:scale-[0.98]"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            Atención al Cliente: 3219730865
          </a>
        </div>

        {/* Sección de Términos y Condiciones al Pie de Página (Compradores y Vendedores) */}
        <div className="max-w-4xl mx-auto text-left mt-8 pt-6 border-t border-[#232B3A]/70">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#111827] border border-[#232B3A] rounded-2xl p-4">
            <div className="flex items-start sm:items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#E63946]/15 border border-[#E63946]/30 flex items-center justify-center text-[#E63946] shrink-0">
                <Scale className="w-4.5 h-4.5" />
              </div>
              <div>
                <h4 className="text-white font-extrabold text-xs sm:text-sm">
                  {footerTermsTab === 'buyers' 
                    ? 'Términos y Condiciones para Usuarios y Compradores' 
                    : 'Términos y Condiciones de Registro para Vendedores'}
                </h4>
                <p className="text-[11px] text-gray-400">
                  De conformidad con la Ley 1480 de 2011 (Estatuto del Consumidor), Ley 1581 de 2012 y Ley 527 de 1999
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowFooterTerms(!showFooterTerms)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#1f293d] hover:bg-[#2c3a54] text-gray-200 hover:text-white rounded-xl text-xs font-bold transition cursor-pointer"
              >
                <span>{showFooterTerms ? 'Ocultar términos' : 'Consultar en el pie de página'}</span>
                {showFooterTerms ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (footerTermsTab === 'buyers') {
                    setIsBuyerTermsModalOpen(true);
                  } else {
                    setIsTermsModalOpen(true);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#E63946]/20 hover:bg-[#E63946] text-[#E63946] hover:text-white border border-[#E63946]/30 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Modal completo</span>
              </button>
            </div>
          </div>

          {/* Selector de pestañas para el pie de página */}
          {showFooterTerms && (
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setFooterTermsTab('buyers')}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer flex items-center gap-1.5 ${
                  footerTermsTab === 'buyers'
                    ? 'bg-[#E63946] text-white shadow-md shadow-[#E63946]/20'
                    : 'bg-[#182030] text-gray-400 hover:text-white border border-[#232B3A]'
                }`}
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                <span>Para Usuarios y Compradores (20 Numerales)</span>
              </button>
              <button
                type="button"
                onClick={() => setFooterTermsTab('sellers')}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer flex items-center gap-1.5 ${
                  footerTermsTab === 'sellers'
                    ? 'bg-[#E63946] text-white shadow-md shadow-[#E63946]/20'
                    : 'bg-[#182030] text-gray-400 hover:text-white border border-[#232B3A]'
                }`}
              >
                <Scale className="w-3.5 h-3.5" />
                <span>Para Tiendas y Vendedores (9 Numerales)</span>
              </button>
            </div>
          )}

          {showFooterTerms && footerTermsTab === 'buyers' && (
            <div className="mt-4 p-5 bg-[#0d121f] border border-[#232B3A] rounded-2xl space-y-5 text-xs text-gray-300">
              <div className="p-3.5 bg-[#090B12] rounded-xl border border-[#232B3A] space-y-1.5">
                <span className="text-[10px] uppercase font-black text-[#E63946] tracking-wider block">
                  Marco Legal Colombiano para Compradores
                </span>
                <h5 className="text-xs sm:text-sm font-black text-white uppercase">
                  {BUYER_TERMS_PREAMBLE.title}
                </h5>
                <p className="text-[11px] text-gray-300 leading-relaxed whitespace-pre-line">
                  {BUYER_TERMS_PREAMBLE.text}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {BUYER_TERMS_SECTIONS.map((sec) => (
                  <div key={sec.id} className="p-3.5 bg-[#141b2d]/60 rounded-xl border border-[#232B3A]/80 space-y-2">
                    <h6 className="font-extrabold text-white text-xs flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-full bg-[#E63946]/20 text-[#E63946] text-[10px] font-black flex items-center justify-center border border-[#E63946]/30 shrink-0">
                        {sec.number}
                      </span>
                      <span>{sec.title}</span>
                    </h6>
                    <p className="text-[11px] text-gray-300 leading-relaxed whitespace-pre-line">
                      {sec.content}
                    </p>
                    {sec.points && sec.points.length > 0 && (
                      <ul className="space-y-1 pt-1 text-[11px]">
                        {sec.points.map((p, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-gray-300">
                            <span className="text-[#F4B400] font-bold">•</span>
                            <span>{p}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {sec.subsections && sec.subsections.length > 0 && (
                      <div className="space-y-1.5 pt-1.5">
                        {sec.subsections.map((sub, i) => (
                          <div key={i} className="p-2 bg-[#090B12] rounded-lg border border-[#232B3A] text-[10px] text-gray-300 space-y-0.5">
                            <div className="font-bold text-white flex items-center gap-1">
                              {sub.letter && <span className="text-[#E63946]">{sub.letter}.</span>}
                              <span>{sub.label}</span>
                            </div>
                            <p className="text-gray-400">{sub.text}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {showFooterTerms && footerTermsTab === 'sellers' && (
            <div className="mt-4 p-5 bg-[#0d121f] border border-[#232B3A] rounded-2xl space-y-5 text-xs text-gray-300">
              <div className="p-3.5 bg-[#090B12] rounded-xl border border-[#232B3A] space-y-1.5">
                <span className="text-[10px] uppercase font-black text-[#E63946] tracking-wider block">
                  Marco Legal Colombiano Aplicable para Vendedores
                </span>
                <h5 className="text-xs sm:text-sm font-black text-white uppercase">
                  {SELLER_TERMS_PREAMBLE.title}
                </h5>
                <p className="text-[11px] text-gray-300 leading-relaxed">
                  {SELLER_TERMS_PREAMBLE.text}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {SELLER_TERMS_SECTIONS.map((sec) => (
                  <div key={sec.id} className="p-3.5 bg-[#141b2d]/60 rounded-xl border border-[#232B3A]/80 space-y-2">
                    <h6 className="font-extrabold text-white text-xs flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-full bg-[#E63946]/20 text-[#E63946] text-[10px] font-black flex items-center justify-center border border-[#E63946]/30 shrink-0">
                        {sec.number}
                      </span>
                      <span>{sec.title}</span>
                    </h6>
                    <p className="text-[11px] text-gray-300 leading-relaxed whitespace-pre-line">
                      {sec.content}
                    </p>
                    {sec.points && sec.points.length > 0 && (
                      <ul className="space-y-1 pt-1 text-[11px]">
                        {sec.points.map((p, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-gray-300">
                            <span className="text-[#F4B400] font-bold">•</span>
                            <span>{p}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {sec.subsections && sec.subsections.length > 0 && (
                      <div className="space-y-1.5 pt-1.5">
                        {sec.subsections.map((sub, i) => (
                          <div key={i} className="p-2 bg-[#090B12] rounded-lg border border-[#232B3A] text-[10px] text-gray-300 space-y-0.5">
                            <div className="font-bold text-white flex items-center gap-1">
                              {sub.letter && <span className="text-[#E63946]">{sub.letter}.</span>}
                              <span>{sub.label}</span>
                            </div>
                            <p className="text-gray-400">{sub.text}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </footer>

      {/* Floating WhatsApp Customer Support Button - Ultra Eye-catching & Animated */}
      <div className="fixed bottom-4 right-3 sm:bottom-6 sm:right-6 z-50 pointer-events-auto print:hidden">
        {/* Continuous Radiating Pulsing Glow Rings */}
        <div className="absolute inset-0 rounded-full bg-[#E63946] opacity-40 animate-ping pointer-events-none" style={{ animationDuration: '3s' }}></div>
        <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-[#FF4D4D] via-[#E63946] to-[#FF0055] opacity-50 blur-md animate-pulse pointer-events-none"></div>

        <motion.a
          href="https://wa.me/573219730865?text=Hola!%20Necesito%20ayuda%20o%20soporte%20con%20Ryyco"
          target="_blank"
          rel="noopener noreferrer"
          initial={{ opacity: 0, scale: 0.8, y: 30 }}
          animate={{ 
            opacity: 1, 
            scale: 1,
            y: [0, -6, 0],
          }}
          transition={{
            y: {
              repeat: Infinity,
              duration: 2.4,
              ease: "easeInOut"
            },
            opacity: { duration: 0.4 },
            scale: { duration: 0.4 }
          }}
          whileHover={{ scale: 1.08, y: -8 }}
          whileTap={{ scale: 0.94 }}
          className="relative flex items-center gap-2 sm:gap-2.5 px-3.5 py-2.5 sm:px-5 sm:py-3.5 bg-gradient-to-r from-[#FF334B] via-[#E63946] to-[#D62839] hover:from-[#FF4D61] hover:to-[#E63946] text-white font-black text-xs sm:text-sm rounded-full shadow-[0_10px_30px_rgba(230,57,70,0.55)] border-2 border-white/30 backdrop-blur-md cursor-pointer transition-all overflow-hidden group"
        >
          {/* Shimmer sweep light effect */}
          <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/25 to-transparent skew-x-12 pointer-events-none" />

          {/* Active status pulse indicator */}
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-90"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400 border border-white/60"></span>
          </span>

          {/* Animated WhatsApp / Chat Icon */}
          <motion.div
            animate={{ rotate: [0, -10, 10, -10, 0] }}
            transition={{ repeat: Infinity, duration: 3, repeatDelay: 2 }}
            className="flex items-center justify-center"
          >
            <MessageCircle className="w-4 h-4 sm:w-5 sm:h-5 text-white stroke-[2.8] drop-shadow" />
          </motion.div>

          <span className="tracking-wide drop-shadow-sm font-extrabold whitespace-nowrap">
            Atención al Cliente
          </span>
        </motion.a>
      </div>

      {/* Printable Presentation Letter Modal */}
      {isPrintModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto print:p-0 print:bg-white print:static">
          <div className="bg-white text-gray-900 w-full max-w-[850px] rounded-2xl shadow-2xl overflow-hidden print:shadow-none print:rounded-none print:max-w-none print:w-full my-8 print:my-0">
            {/* Modal Actions Bar (Hidden on Print) */}
            <div className="flex items-center justify-between px-6 py-4 bg-gray-900 text-white border-b border-gray-800 print:hidden">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-400" />
                <span className="font-bold text-sm">Carta de Presentación - Formato Imprimible (Tamaño Carta)</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="bg-emerald-400 hover:bg-emerald-300 text-black font-bold px-4 py-2 rounded-lg text-xs flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Imprimir / Guardar PDF</span>
                </button>
                <button
                  onClick={() => setIsPrintModalOpen(false)}
                  className="bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white p-2 rounded-lg transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Document Content (Formatted as professional Letter Page) */}
            <div className="p-8 sm:p-12 print:p-8 font-serif leading-relaxed space-y-6 text-gray-800">
              {/* Header */}
              <div className="border-b-2 border-emerald-600 pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                  <h2 className="text-2xl font-black text-gray-900 font-sans tracking-tight">Ryyco.com</h2>
                  <p className="text-xs text-gray-500 font-sans uppercase tracking-wider font-semibold">
                    Tecnología, Publicidad y Domicilios para Restaurantes • Ipiales, Nariño
                  </p>
                </div>
                <div className="text-left sm:text-right text-xs text-gray-500 font-sans">
                  <p className="font-bold text-gray-800">Atención Propietarios</p>
                  <p>WhatsApp: 321 973 0865</p>
                  <p>www.ryyco.com</p>
                </div>
              </div>

              {/* Salutation */}
              <div className="pt-2">
                <h3 className="text-lg font-bold text-gray-900">
                  Estimado propietario de restaurante,
                </h3>
              </div>

              {/* Main Copy Paragraphs */}
              <p className="text-base leading-relaxed">
                Cada día más personas piden su comida desde el celular. En <strong>Ryyco.com</strong> le ayudamos a llegar a más clientes, aumentar sus ventas y ofrecer una mejor experiencia, sin complicaciones. Nos encargamos de la <strong>tecnología, publicidad y domicilios</strong> para que usted se concentre en preparar excelentes platos.
              </p>

              {/* Bullet Points / Key Pillars */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-3 my-4 font-sans text-sm">
                <div className="flex items-start gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-600 mt-1.5 shrink-0" />
                  <p>
                    <strong>Menú digital profesional & Código QR:</strong> Creamos su menú con fotos, precios y categorías. Le entregamos un código QR personalizado para que sus clientes solo lo escaneen desde la mesa y pidan al instante.
                  </p>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-600 mt-1.5 shrink-0" />
                  <p>
                    <strong>Domicilios rápidos y exclusivos:</strong> Mejoramos la experiencia con domicilios rápidos, tomados con un pedido a la vez para que la comida llegue caliente y en buen estado.
                  </p>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-600 mt-1.5 shrink-0" />
                  <p>
                    <strong>Publicidad continua:</strong> Promocionamos su restaurante en TikTok, Facebook e Instagram. Así más personas descubren su negocio cada semana.
                  </p>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-600 mt-1.5 shrink-0" />
                  <p>
                    <strong>Directorio Oficial de Ipiales:</strong> Su restaurante aparece en un directorio junto a otros restaurantes de Ipiales, lo que aumenta notablemente su visibilidad local.
                  </p>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-600 mt-1.5 shrink-0" />
                  <p>
                    <strong>Inteligencia Artificial por Voz Natural:</strong> Sus clientes pueden pedir platos hablando directamente con un mesero virtual por voz natural, y usted como propietario puede preguntarle a la IA cómo le fue en el día con ventas y pedidos, o consultar su balance mensual al instante.
                  </p>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-600 mt-1.5 shrink-0" />
                  <p>
                    <strong>Panel sencillo y en tiempo real:</strong> Desde un panel muy intuitivo, puede agregar platos, cambiar precios, actualizar fotos y recibir pedidos en tiempo real.
                  </p>
                </div>
              </div>

              {/* Partner Restaurants Callout */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 text-center font-sans">
                <p className="text-xs uppercase tracking-wider text-emerald-800 font-bold mb-3">
                  Ya hacen parte de Ryyco.com en Ipiales:
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 justify-items-center mb-3">
                  {partnerStores.slice(0, 4).map((store, idx) => (
                    <div key={idx} className="flex flex-col items-center text-center">
                      <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-emerald-300 bg-white shadow-xs mb-1.5 flex items-center justify-center">
                        {store.logo ? (
                          <img 
                            src={store.logo} 
                            alt={store.name}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="font-black text-emerald-800 text-sm">{store.name.charAt(0)}</span>
                        )}
                      </div>
                      <span className="text-xs font-black text-gray-900 leading-tight max-w-[110px]">
                        {store.name}
                      </span>
                      {store.category && (
                        <span className="text-[9px] text-gray-500 font-semibold">
                          {store.category}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-emerald-700 font-semibold">
                  Y cada vez somos más. Únase hoy a la red gastronómica líder.
                </p>
              </div>

              {/* Slogan and signature */}
              <div className="pt-4 border-t border-gray-200 text-center font-sans">
                <p className="text-sm font-medium text-gray-700 mb-2">
                  Nosotros ponemos la tecnología, la publicidad y los domicilios.<br />
                  Usted se dedica a lo que mejor sabe hacer: <strong>preparar deliciosa comida.</strong>
                </p>
                <p className="text-xl font-black text-emerald-700 tracking-tight mt-3">
                  Más clientes. Más pedidos. Más ventas. Ryyco.com.
                </p>
              </div>
            </div>

            {/* Modal Bottom Close Bar (Hidden on Print) */}
            <div className="bg-gray-100 px-6 py-3 border-t border-gray-200 flex justify-end print:hidden">
              <button
                onClick={() => setIsPrintModalOpen(false)}
                className="bg-gray-800 hover:bg-gray-900 text-white font-bold px-5 py-2 rounded-lg text-xs"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Store Terms and Conditions Modal */}
      <StoreTermsModal
        isOpen={isTermsModalOpen}
        onClose={() => setIsTermsModalOpen(false)}
        showAcceptButton={false}
      />

      {/* Buyer Terms and Conditions Modal */}
      <BuyerTermsModal
        isOpen={isBuyerTermsModalOpen}
        onClose={() => setIsBuyerTermsModalOpen(false)}
        showAcceptButton={false}
      />

    </div>
  );
}

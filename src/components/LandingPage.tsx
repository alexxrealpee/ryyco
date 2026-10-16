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
  ShieldCheck,
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
  onNavigate: (view: 'landing' | 'login' | 'signup' | 'dashboard' | 'admin' | 'tienda' | 'driver-register' | 'driver-portal' | 'profile', usernameToClaim?: string) => void;
}

export default function LandingPage({ onNavigate }: LandingPageProps) {
  const [storeSlug, setStoreSlug] = useState('');
  const [checking, setChecking] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);
  const [isBuyerTermsModalOpen, setIsBuyerTermsModalOpen] = useState(false);
  const [showFooterTerms, setShowFooterTerms] = useState(false);
  const [footerTermsTab, setFooterTermsTab] = useState<'buyers' | 'sellers'>('buyers');

  // Partner stores in Ipiales with verified authentic logos and names
  const [partnerStores, setPartnerStores] = useState<Array<{
    name: string;
    category?: string;
    logo?: string;
    username?: string;
  }>>([
    {
      name: "Señor Barril",
      category: "Parrilla & Asados al Barril",
      logo: "/stores/senorbarril.jpg",
      username: "senorbarril"
    },
    {
      name: "Comidas Rápidas Sofí",
      category: "Hamburguesas & Salchipapas",
      logo: "/stores/karo.2412.jpg",
      username: "karo.2412"
    },
    {
      name: "La Casa de los Caldos",
      category: "Caldos & Tradición",
      logo: "/stores/lacasadeloscaldos.jpg",
      username: "lacasadeloscaldos"
    },
    {
      name: "Delicias Doña Yoli",
      category: "Comidas Rápidas & Típicos",
      logo: "/stores/deliciasdonayoli.jpg",
      username: "deliciasdonayoli"
    },
    {
      name: "Cevichería Un Solo Toque 2",
      category: "Comida de Mar & Cevichería",
      logo: "/stores/unsolotoque2.jpg",
      username: "unsolotoque2"
    },
    {
      name: "El Tertuliadero",
      category: "Bar & Parrilla Rock",
      logo: "/stores/tertuliadero.jpg",
      username: "tertuliadero"
    },
    {
      name: "Pollo Stop",
      category: "Pollo Asado & Broaster",
      logo: "/stores/pollostop.jpg",
      username: "pollostop"
    },
    {
      name: "Barril y Parrilla Express",
      category: "Asados al Barril & Parrilla",
      logo: "/stores/barrilyparillaexpress.jpg",
      username: "barrilyparillaexpress"
    }
  ]);

  useEffect(() => {
    async function loadStores() {
      try {
        const map = await fetchAllStoresMap();
        if (map && Object.keys(map).length > 0) {
          const curatedPartnerList = [
            {
              name: "Señor Barril",
              category: "Parrilla & Asados al Barril",
              username: "senorbarril",
              defaultLogo: "/stores/senorbarril.jpg"
            },
            {
              name: "Comidas Rápidas Sofí",
              category: "Hamburguesas & Salchipapas",
              username: "karo.2412",
              defaultLogo: "/stores/karo.2412.jpg"
            },
            {
              name: "La Casa de los Caldos",
              category: "Caldos & Tradición",
              username: "lacasadeloscaldos",
              defaultLogo: "/stores/lacasadeloscaldos.jpg"
            },
            {
              name: "Delicias Doña Yoli",
              category: "Comidas Rápidas & Típicos",
              username: "deliciasdonayoli",
              defaultLogo: "/stores/deliciasdonayoli.jpg"
            },
            {
              name: "Cevichería Un Solo Toque 2",
              category: "Comida de Mar & Cevichería",
              username: "unsolotoque2",
              defaultLogo: "/stores/unsolotoque2.jpg"
            },
            {
              name: "El Tertuliadero",
              category: "Bar & Parrilla Rock",
              username: "tertuliadero",
              defaultLogo: "/stores/tertuliadero.jpg"
            },
            {
              name: "Pollo Stop",
              category: "Pollo Asado & Broaster",
              username: "pollostop",
              defaultLogo: "/stores/pollostop.jpg"
            },
            {
              name: "Barril y Parrilla Express",
              category: "Asados al Barril & Parrilla",
              username: "barrilyparillaexpress",
              defaultLogo: "/stores/barrilyparillaexpress.jpg"
            }
          ];

          const loadedList: Array<{ name: string; category?: string; logo?: string; username?: string }> = [];

          curatedPartnerList.forEach(item => {
            const prof = Object.values(map).find(p => {
              const u = (p.username || '').toLowerCase().trim();
              const d = (p.displayName || '').toLowerCase().trim();
              const tu = item.username.toLowerCase().trim();
              return u === tu || d === item.name.toLowerCase().trim() ||
                (tu === 'karo.2412' && (u.includes('sofi') || d.includes('sofi') || d.includes('soffi'))) ||
                (tu === 'deliciasdonayoli' && (u.includes('yoli') || d.includes('yoli')));
            });

            let finalLogo = item.defaultLogo;
            if (prof?.photoURL && !prof.photoURL.includes('googleusercontent.com')) {
              finalLogo = prof.photoURL;
            }

            loadedList.push({
              name: prof?.displayName?.trim() || item.name,
              category: prof?.category || item.category,
              logo: finalLogo,
              username: prof?.username || item.username
            });
          });

          if (loadedList.length > 0) {
            setPartnerStores(loadedList);
          }
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
      category: 'PIZZAS',
      name: 'Pizza Artesanal Cuatro Quesos',
      price: '$28.000',
      image: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=300&auto=format&fit=crop&q=80',
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
      icon: <Mic className="w-5 h-5 text-[#D62839]" />,
      title: "Mesero Virtual IA por Voz Natural",
      desc: "Tus comensales y clientes pueden ordenar platos hablando con voz natural a un mesero virtual inteligente que responde, recomienda y arma el pedido al instante."
    },
    {
      icon: <Bot className="w-5 h-5 text-[#E5A100]" />,
      title: "Administrador IA para Propietarios",
      desc: "Pregúntale por voz a tu panel cómo te fue en el día con ventas, pedidos o tu balance del mes. El Administrador IA te informa métricas y rendimiento financiero en segundos."
    },
    {
      icon: <QrCode className="w-5 h-5 text-[#D62839]" />,
      title: "Menú Digital y Código QR en Mesa",
      desc: "Creamos un menú digital profesional con fotos, precios y categorías. Le entregamos un código QR personalizado para que sus clientes solo lo escaneen desde la mesa y pidan al instante."
    },
    {
      icon: <Bike className="w-5 h-5 text-[#E5A100]" />,
      title: "Domicilios Rápidos y Exclusivos",
      desc: "Mejoramos la experiencia con domicilios rápidos, tomados con un pedido a la vez para que la comida llegue caliente y en buen estado a la puerta de sus clientes."
    },
    {
      icon: <Share2 className="w-5 h-5 text-[#D62839]" />,
      title: "Publicidad en TikTok, FB e IG",
      desc: "Promocionamos su restaurante en TikTok, Facebook e Instagram. Así más personas descubren su negocio y se multiplican sus ventas cada mes."
    },
    {
      icon: <MapPin className="w-5 h-5 text-[#E5A100]" />,
      title: "Directorio de Restaurantes en Ipiales",
      desc: "Y lo más importante: su restaurante aparece en un directorio oficial junto a otros restaurantes de Ipiales, lo que aumenta significativamente su visibilidad local."
    },
    {
      icon: <Smartphone className="w-5 h-5 text-[#D62839]" />,
      title: "Panel Sencillo y Tiempo Real",
      desc: "Desde un panel sencillo, puede agregar platos, cambiar precios, actualizar fotos de su menú y recibir pedidos directos en tiempo real."
    },
    {
      icon: <Award className="w-5 h-5 text-[#E5A100]" />,
      title: "Tecnología, Publicidad y Domicilios",
      desc: "Nosotros ponemos la tecnología, la publicidad y los domicilios. Usted se dedica a lo que mejor sabe hacer: preparar deliciosa comida."
    }
  ];

  return (
    <div className="bg-[#0B0E14] text-slate-100 min-h-screen selection:bg-[#D62839] selection:text-white font-sans antialiased">
      
      {/* Top Header - Solid Flat Surface */}
      <header className="border-b border-[#222B38] bg-[#0E121A] sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-0">
          <LinnkProLogo 
            onClick={() => onNavigate('tienda')}
            height={40}
            imgClassName="h-8 sm:h-10 cursor-pointer"
          />
          
          <div className="flex items-center justify-center sm:justify-end gap-2 sm:gap-3 w-full sm:w-auto">
            <button 
              onClick={() => {
                window.history.pushState({}, '', '/domiciliario');
                onNavigate('driver-portal');
              }}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-[#D62839] hover:text-white bg-[#1A222E] hover:bg-[#D62839] border border-[#2B374A] rounded-lg transition-colors cursor-pointer"
            >
              <Bike className="w-3.5 h-3.5" />
              <span>Domiciliarios</span>
            </button>
            <button 
              onClick={() => onNavigate('tienda')}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white hover:bg-[#1A222E] rounded-lg transition-colors cursor-pointer"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Ver Vitrina</span>
            </button>
            <button 
              onClick={() => onNavigate('login')}
              className="px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white hover:bg-[#1A222E] rounded-lg transition-colors cursor-pointer"
            >
              <span className="hidden sm:inline">Acceso Vendedor</span>
              <span className="sm:hidden">Ingresar</span>
            </button>
            <button 
              onClick={() => onNavigate('signup')}
              className="bg-[#D62839] hover:bg-[#b81d2d] text-white font-bold text-xs sm:text-sm px-4 py-2 rounded-lg transition-colors cursor-pointer"
            >
              Ingresar mi restaurante
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section - Pure Flat Canvas */}
      <section className="pt-12 sm:pt-16 pb-12 sm:pb-16 px-4 sm:px-6 border-b border-[#222B38] bg-[#0E121A]">
        <div className="max-w-4xl mx-auto text-center">
          
          {/* Subtle Flat Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-[#161C26] border border-[#2B374A] text-xs font-bold text-[#E5A100] mb-5">
            <Sparkles className="w-3.5 h-3.5 text-[#E5A100]" />
            <span>Plataforma Gastronómica Inteligente de Ipiales</span>
          </div>

          <h1 className="text-3xl sm:text-5xl md:text-6xl font-black tracking-tight text-white mb-5 leading-tight">
            Descubre qué quieres <br className="hidden sm:inline" />
            <span className="text-[#D62839]">comer </span>
            <span className="text-[#E5A100]">hoy.</span>
          </h1>

          <p className="text-sm sm:text-base md:text-lg text-slate-300 mb-8 max-w-3xl mx-auto leading-relaxed font-normal">
            <strong className="text-white font-semibold">Ryyco</strong> es la plataforma gastronómica impulsada por <strong className="text-[#E5A100] font-semibold">Inteligencia Artificial</strong>: tus clientes pueden pedir platos por <strong className="text-[#D62839] font-semibold">voz natural con un Mesero Virtual</strong>, y tú como dueño tienes un <strong className="text-[#E5A100] font-semibold">Administrador IA por voz</strong> para consultar ventas diarias, pedidos y tu balance del mes en tiempo real.
          </p>

          {/* Subdomain Input claim bar - Solid Flat Design */}
          <div className="max-w-xl mx-auto mb-8">
            <form onSubmit={handleClaim} className="flex flex-col sm:flex-row gap-2 bg-[#161C26] border border-[#2B374A] p-2 rounded-xl">
              <div className="flex items-center flex-grow px-3 py-2 bg-[#0B0E14] border border-[#222B38] rounded-lg text-slate-300 min-w-0">
                <span className="text-slate-400 select-none font-semibold text-xs sm:text-sm shrink-0">ryyco.com/</span>
                <input 
                  type="text" 
                  value={storeSlug}
                  onChange={(e) => setStoreSlug(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
                  placeholder="nombre-restaurante" 
                  className="bg-transparent focus:outline-none text-white text-xs sm:text-sm w-full font-medium placeholder:text-slate-500 min-w-0 ml-0.5"
                  required
                />
              </div>
              <button 
                type="submit"
                disabled={checking}
                className="bg-[#D62839] hover:bg-[#b81d2d] text-white font-bold px-5 py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors shrink-0 text-xs sm:text-sm cursor-pointer disabled:opacity-50"
              >
                {checking ? 'Ingresando...' : 'Ingresar mi restaurante'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            <div className="text-xs text-slate-400 mt-3 px-1 flex flex-wrap items-center gap-2 justify-center sm:justify-between">
              <div className="flex items-center gap-2 flex-wrap justify-center">
                <span className="text-slate-300 font-medium">Lanzamiento Instantáneo</span>
                <span className="text-slate-600">·</span>
                <button 
                  type="button" 
                  onClick={() => onNavigate('tienda')}
                  className="text-[#E5A100] hover:underline font-bold inline-flex items-center gap-1 cursor-pointer"
                >
                  <span>Ver Directorio</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => setIsPrintModalOpen(true)}
                className="text-[#D62839] hover:text-white font-bold inline-flex items-center gap-1.5 cursor-pointer bg-[#161C26] hover:bg-[#D62839] border border-[#2B374A] px-2.5 py-1 rounded-md transition-colors text-xs"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Carta de Presentación (Imprimible)</span>
              </button>
            </div>
          </div>

          {/* Restaurant Partners Section - Solid Flat Cards */}
          <div className="max-w-4xl mx-auto bg-[#161C26] border border-[#2B374A] rounded-xl p-5 sm:p-6 text-center">
            <p className="text-xs uppercase tracking-wider text-slate-300 font-bold mb-5 flex items-center justify-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#E5A100] shrink-0" />
              <span>Ya hacen parte de <strong className="text-white">Ryyco.com</strong> en Ipiales:</span>
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 items-start justify-items-center">
              {partnerStores.map((store, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    if (store.username) {
                      onNavigate('profile', store.username);
                    } else {
                      onNavigate('tienda');
                    }
                  }}
                  className="flex flex-col items-center bg-[#0E121A] hover:bg-[#1A222E] border border-[#222B38] hover:border-[#D62839] rounded-xl p-3 w-full transition-colors cursor-pointer group text-center"
                  title={`Ver tienda de ${store.name}`}
                >
                  <div className="relative w-14 h-14 rounded-full overflow-hidden border-2 border-[#2B374A] group-hover:border-[#D62839] bg-[#0B0E14] flex items-center justify-center shrink-0 mb-2 transition-colors">
                    {store.logo ? (
                      <img 
                        src={store.logo} 
                        alt={store.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          if (store.username && !e.currentTarget.src.includes(`/stores/${store.username}`)) {
                            e.currentTarget.src = `/stores/${store.username}.jpg`;
                          }
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white font-bold text-sm bg-[#1A222E]">
                        {store.name.charAt(0)}
                      </div>
                    )}
                    <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-[#0E121A] rounded-full" title="Tienda Activa" />
                  </div>

                  <span className="text-xs font-bold text-white group-hover:text-[#E5A100] transition-colors leading-tight line-clamp-1">
                    {store.name}
                  </span>
                  {store.category && (
                    <span className="text-[10px] text-slate-400 font-normal mt-0.5 line-clamp-1">
                      {store.category}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <p className="text-xs text-slate-300 font-medium mt-4 pt-4 border-t border-[#222B38]">
              Y cada vez somos más. ¡Únase hoy! <strong className="text-white">Nosotros ponemos la tecnología, la publicidad y los domicilios.</strong>
            </p>
          </div>

        </div>
      </section>

      {/* Simulated Store Interactive Mockup - Flat Editorial Structure */}
      <section className="py-12 sm:py-16 px-4 sm:px-6 border-b border-[#222B38] bg-[#0B0E14]">
        <div className="max-w-6xl mx-auto bg-[#121721] border border-[#222B38] rounded-2xl p-5 sm:p-8">
          
          {/* Mockup Header Strip */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#222B38] pb-4 mb-6">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#D62839] block" />
              <span className="w-3 h-3 rounded-full bg-[#E5A100] block" />
              <span className="w-3 h-3 rounded-full bg-emerald-500 block" />
              <span className="text-xs text-slate-400 font-mono ml-2">ryyco.com/panel-vendedor</span>
            </div>
            <span className="bg-[#1A222E] text-slate-300 border border-[#2B374A] rounded-md px-2.5 py-1 text-xs font-bold uppercase tracking-wider">
              CONSTRUCTOR EN VIVO
            </span>
          </div>

          <div className="grid lg:grid-cols-12 gap-8 items-center">
            
            {/* Left Content Column */}
            <div className="lg:col-span-7 space-y-6">
              <div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-2 leading-tight">
                  Diseñado para emprendedores y marcas
                </h2>
                <p className="text-slate-300 text-sm leading-relaxed">
                  Con el creador de Ryyco.com, tienes el control absoluto de tu negocio digital. Olvídate de configuraciones confusas o integraciones complejas. Crea tu catálogo, súbelo a la nube, controla tus pedidos en un panel inteligente y comunícate fluidamente con tus clientes.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 bg-[#0E121A] rounded-xl border border-[#222B38]">
                  <div className="w-8 h-8 rounded-lg bg-[#161C26] text-[#D62839] flex items-center justify-center mb-2.5">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                  <h4 className="text-sm font-bold text-white mb-1">Analíticas de Venta</h4>
                  <p className="text-xs text-slate-400 leading-normal">Visualiza ingresos, visitas y conversión de carrito de compras.</p>
                </div>

                <div className="p-3.5 bg-[#0E121A] rounded-xl border border-[#222B38]">
                  <div className="w-8 h-8 rounded-lg bg-[#161C26] text-[#E5A100] flex items-center justify-center mb-2.5">
                    <CreditCard className="w-4 h-4" />
                  </div>
                  <h4 className="text-sm font-bold text-white mb-1">Múltiples Pagos</h4>
                  <p className="text-xs text-slate-400 leading-normal">Soporta pedidos directos, transferencias y pagos contra entrega.</p>
                </div>

                <div className="p-3.5 bg-[#0E121A] rounded-xl border border-[#222B38]">
                  <div className="w-8 h-8 rounded-lg bg-[#161C26] text-[#D62839] flex items-center justify-center mb-2.5">
                    <ShoppingBag className="w-4 h-4" />
                  </div>
                  <h4 className="text-sm font-bold text-white mb-1">Variantes Dinámicas</h4>
                  <p className="text-xs text-slate-400 leading-normal">Asigna tallas, sabores o configuraciones específicas a tus platos.</p>
                </div>

                <div className="p-3.5 bg-[#0E121A] rounded-xl border border-[#222B38]">
                  <div className="w-8 h-8 rounded-lg bg-[#161C26] text-[#E5A100] flex items-center justify-center mb-2.5">
                    <Coins className="w-4 h-4" />
                  </div>
                  <h4 className="text-sm font-bold text-white mb-1">100% de Comisión Cero</h4>
                  <p className="text-xs text-slate-400 leading-normal">Tus ganancias van directamente a tu cuenta. Sin tarifas ocultas.</p>
                </div>
              </div>

              <div>
                <button 
                  onClick={() => onNavigate('signup')}
                  className="bg-[#D62839] hover:bg-[#b81d2d] text-white font-bold rounded-lg px-6 py-3 flex items-center justify-center gap-2 text-sm transition-colors cursor-pointer"
                >
                  <span>Regístrate Ahora</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Right Simulator Phone Mockup */}
            <div className="lg:col-span-5 flex justify-center">
              <div className="w-full max-w-[280px] bg-[#0B0E14] border-4 border-[#222B38] rounded-3xl p-3 flex flex-col space-y-3">
                
                {/* Phone Status bar */}
                <div className="flex items-center justify-between text-[9px] font-mono text-slate-400 px-1 border-b border-[#1A222E] pb-2">
                  <span>12:00</span>
                  <span className="text-[#D62839] font-bold">● RYYCO</span>
                  <span>4G</span>
                </div>

                {/* Simulated Store Header */}
                <div className="flex items-center justify-between border-b border-[#1A222E] pb-2">
                  <div className="flex items-center gap-1.5">
                    <div className="w-6 h-6 rounded-full bg-[#1A222E] border border-[#2B374A] flex items-center justify-center text-[7px] font-bold text-[#D62839]">
                      SB
                    </div>
                    <div>
                      <div className="text-[9px] font-bold text-white leading-none">SEÑOR BARRIL</div>
                      <div className="text-[6px] text-slate-400 uppercase">Parrilla & Bar</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-[8px] font-bold text-white bg-[#D62839] px-2 py-0.5 rounded-md">
                    <ShoppingBag className="w-2.5 h-2.5" />
                    <span>{mockCart}</span>
                  </div>
                </div>

                {/* Categories row */}
                <div>
                  <div className="text-[7px] uppercase font-bold text-slate-400 mb-1">Categorías</div>
                  <div className="flex gap-1 overflow-x-auto pb-1">
                    {['TODOS', 'PARRILLA', 'HAMBURGUESAS', 'COMIDAS RÁPIDAS', 'PIZZAS'].map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setMockCategory(cat)}
                        className={`text-[7px] px-2 py-1 rounded font-bold whitespace-nowrap cursor-pointer transition-colors ${
                          mockCategory === cat 
                            ? 'bg-[#D62839] text-white' 
                            : 'bg-[#161C26] text-slate-300 hover:bg-[#1A222E]'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Product items in simulator */}
                <div className="grid grid-cols-2 gap-1.5 max-h-[260px] overflow-y-auto">
                  {filteredMockProducts.map((p) => (
                    <div key={p.id} className="bg-[#161C26] border border-[#222B38] rounded-lg p-1.5 flex flex-col justify-between text-left">
                      <div className="w-full aspect-square rounded bg-[#0B0E14] overflow-hidden mb-1">
                        <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                      </div>
                      <span className="text-[6px] font-bold text-[#E5A100] uppercase">{p.category}</span>
                      <h6 className="text-[7px] font-bold text-white line-clamp-1 mt-0.5">{p.name}</h6>
                      <div className="text-[8px] font-extrabold text-white mt-1">{p.price}</div>
                      <button
                        onClick={() => setMockCart(prev => prev + 1)}
                        className="mt-1 w-full py-1 bg-[#D62839] hover:bg-[#b81d2d] text-white text-[7px] font-bold rounded flex items-center justify-center gap-0.5 cursor-pointer"
                      >
                        <Utensils className="w-2 h-2" />
                        <span>PEDIR</span>
                      </button>
                    </div>
                  ))}
                </div>

              </div>
            </div>

          </div>
        </div>
      </section>

      {/* AI Voice Section: Mesero Virtual & Administrador IA - Pure Flat Solid Panels */}
      <section className="py-14 sm:py-20 px-4 sm:px-6 border-b border-[#222B38] bg-[#0E121A]">
        <div className="max-w-7xl mx-auto">
          
          <div className="text-center max-w-3xl mx-auto mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-[#161C26] border border-[#2B374A] text-xs font-bold text-[#E5A100] mb-3">
              <Sparkles className="w-3.5 h-3.5 text-[#E5A100]" />
              <span>Inteligencia Artificial con Voz Natural</span>
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-white mb-3 tracking-tight">
              Pide y administra tu restaurante <br className="hidden sm:inline" />
              <span className="text-[#D62839]">hablando por voz natural</span>
            </h2>
            <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
              En <strong className="text-white">Ryyco</strong> revolucionamos la experiencia gastronómica: tus clientes ordenan con un <strong>Mesero Virtual IA</strong> y tú tienes un <strong>Administrador IA</strong> que te reporta ventas del día y del mes al instante.
            </p>
          </div>

          {/* Dual Columns: Mesero Virtual & Administrador IA */}
          <div className="grid lg:grid-cols-2 gap-6 sm:gap-8 items-stretch">
            
            {/* Pillar 1: Clientes - Mesero Virtual IA */}
            <div className="bg-[#121721] border border-[#2B374A] hover:border-[#D62839] rounded-2xl p-6 sm:p-8 flex flex-col justify-between transition-colors">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#D62839] text-white text-xs font-bold uppercase tracking-wider mb-5">
                  <Mic className="w-3.5 h-3.5" />
                  <span>Para tus Clientes · Mesero Virtual</span>
                </div>

                <div className="flex items-center gap-3.5 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-[#1A222E] text-[#D62839] border border-[#2B374A] flex items-center justify-center shrink-0">
                    <Mic className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl sm:text-2xl font-bold text-white">Mesero Virtual por Voz Natural</h3>
                    <p className="text-xs text-slate-400">Tus comensales piden platos hablando en vivo</p>
                  </div>
                </div>

                <p className="text-slate-300 text-xs sm:text-sm leading-relaxed mb-6">
                  Tus clientes ya no tienen que buscar plato por plato en la pantalla. Solo presionan el micrófono del mesero virtual, le hablan naturalmente y la IA les recomienda opciones, personaliza su plato y lo agrega de inmediato a la orden.
                </p>

                {/* Simulated Conversation Box - Flat Solid UI */}
                <div className="bg-[#0B0E14] border border-[#222B38] rounded-xl p-4 space-y-3 mb-6">
                  <div className="flex items-center justify-between border-b border-[#1A222E] pb-2 text-xs">
                    <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      Mesero IA en Vivo
                    </span>
                    <span className="text-slate-500 font-mono text-[11px]">Audio Bidireccional</span>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <span className="w-6 h-6 rounded bg-[#161C26] text-slate-300 font-bold text-xs flex items-center justify-center shrink-0">
                      Tú
                    </span>
                    <div className="bg-[#161C26] border border-[#222B38] text-white text-xs sm:text-sm p-3 rounded-lg leading-relaxed">
                      "Mesero, recomiéndame una hamburguesa especial con tocineta y papas francesas."
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <span className="w-6 h-6 rounded bg-[#D62839] text-white font-bold text-xs flex items-center justify-center shrink-0">
                      IA
                    </span>
                    <div className="bg-[#1A222E] border border-[#2B374A] text-slate-200 text-xs sm:text-sm p-3 rounded-lg leading-relaxed">
                      <strong className="text-[#E5A100]">Mesero Virtual:</strong> "¡Con gusto! Te sugiero la <strong>Hamburguesa Doble Especial ($28.000)</strong>. La he añadido a tu carrito con papas francesas crujientes. ¿Deseas agregar gaseosa o postre?"
                    </div>
                  </div>
                </div>

                {/* Key Benefits Checklist */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-300 mb-6">
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
                  className="w-full py-3 px-4 rounded-lg bg-[#D62839] hover:bg-[#b81d2d] text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Volume2 className="w-4 h-4" />
                  <span>Explorar Vitrina con Mesero IA</span>
                </button>
              </div>
            </div>

            {/* Pillar 2: Propietarios - Administrador IA */}
            <div className="bg-[#121721] border border-[#2B374A] hover:border-[#E5A100] rounded-2xl p-6 sm:p-8 flex flex-col justify-between transition-colors">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#E5A100] text-black text-xs font-bold uppercase tracking-wider mb-5">
                  <Bot className="w-3.5 h-3.5" />
                  <span>Para Propietarios · Administrador IA</span>
                </div>

                <div className="flex items-center gap-3.5 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-[#1A222E] text-[#E5A100] border border-[#2B374A] flex items-center justify-center shrink-0">
                    <Bot className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl sm:text-2xl font-bold text-white">Administrador IA de tu Negocio</h3>
                    <p className="text-xs text-slate-400">Habla con tu panel para saber cómo va tu restaurante</p>
                  </div>
                </div>

                <p className="text-slate-300 text-xs sm:text-sm leading-relaxed mb-6">
                  Como dueño o encargado, no tienes que perder tiempo analizando tablas complejas. Habla por voz con tu Administrador IA y pregúntale cómo te fue hoy, cuántos pedidos se hicieron o cómo van las ventas acumuladas del mes.
                </p>

                {/* Simulated Conversation Box - Flat Solid UI */}
                <div className="bg-[#0B0E14] border border-[#222B38] rounded-xl p-4 space-y-3 mb-6">
                  <div className="flex items-center justify-between border-b border-[#1A222E] pb-2 text-xs">
                    <span className="font-bold text-[#E5A100] flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5" />
                      Administrador IA Activo
                    </span>
                    <span className="text-slate-500 font-mono text-[11px]">Métricas en Tiempo Real</span>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <span className="w-6 h-6 rounded bg-[#161C26] text-slate-300 font-bold text-xs flex items-center justify-center shrink-0">
                      Tú
                    </span>
                    <div className="bg-[#161C26] border border-[#222B38] text-white text-xs sm:text-sm p-3 rounded-lg leading-relaxed">
                      "¿Cómo me fue hoy en ventas y pedidos?"
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <span className="w-6 h-6 rounded bg-[#E5A100] text-black font-bold text-xs flex items-center justify-center shrink-0">
                      IA
                    </span>
                    <div className="bg-[#1A222E] border border-[#2B374A] text-slate-200 text-xs sm:text-sm p-3 rounded-lg leading-relaxed">
                      <strong className="text-[#E5A100]">Administrador IA:</strong> "Hoy registraste <strong>18 pedidos completados</strong> por un total de <strong>$468.000 COP</strong> en ventas. Tu plato más pedido fue la <em>Salchipapa Especial</em>."
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 pt-1">
                    <span className="w-6 h-6 rounded bg-[#161C26] text-slate-300 font-bold text-xs flex items-center justify-center shrink-0">
                      Tú
                    </span>
                    <div className="bg-[#161C26] border border-[#222B38] text-white text-xs sm:text-sm p-3 rounded-lg leading-relaxed">
                      "¿Y cómo nos fue en el balance del mes?"
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <span className="w-6 h-6 rounded bg-[#E5A100] text-black font-bold text-xs flex items-center justify-center shrink-0">
                      IA
                    </span>
                    <div className="bg-[#1A222E] border border-[#2B374A] text-slate-200 text-xs sm:text-sm p-3 rounded-lg leading-relaxed">
                      <strong className="text-[#E5A100]">Administrador IA:</strong> "En el mes acumulas <strong>$11.450.000 COP en ventas</strong> (+24% vs mes anterior) con <strong>420 pedidos atendidos</strong> y 0% de comisiones retenidas."
                    </div>
                  </div>
                </div>

                {/* Key Benefits Checklist */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-300 mb-6">
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
                  className="w-full py-3 px-4 rounded-lg bg-[#E5A100] hover:bg-[#c98d00] text-black font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Bot className="w-4 h-4" />
                  <span>Crear mi Tienda y Obtener Asistente IA</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* Features Grid - 8 Solid Flat Cards */}
      <section className="py-14 sm:py-20 bg-[#0B0E14] border-b border-[#222B38] px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-3">
              Todo lo necesario para comercializar de inmediato
            </h2>
            <p className="text-slate-300 text-sm">
              Hemos automatizado las tareas complejas de comercio electrónico para que te enfoques en tus ventas.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {features.map((feature, idx) => (
              <div 
                key={idx} 
                className="bg-[#121721] border border-[#222B38] hover:border-[#2B374A] p-5 rounded-xl transition-colors flex flex-col justify-start"
              >
                <div className="w-10 h-10 rounded-lg bg-[#1A222E] flex items-center justify-center mb-4 border border-[#2B374A]">
                  {feature.icon}
                </div>
                <h3 className="text-base font-bold text-white mb-2">{feature.title}</h3>
                <p className="text-slate-400 text-xs leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3 Steps Section - Clean Flat Process */}
      <section className="py-14 sm:py-20 px-4 sm:px-6 max-w-7xl mx-auto text-center border-b border-[#222B38]">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-2">¿Cómo crear tu tienda?</h2>
        <p className="text-slate-400 mb-10 text-sm">Empieza hoy mismo tu emprendimiento digital en tres sencillos pasos.</p>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="p-6 bg-[#121721] rounded-xl border border-[#222B38] flex flex-col items-center text-center">
            <span className="w-9 h-9 rounded-lg bg-[#D62839] text-white font-bold text-sm flex items-center justify-center mb-4">
              1
            </span>
            <h4 className="font-bold text-white text-base mb-2">Regístrate en Segundos</h4>
            <p className="text-slate-400 text-xs leading-relaxed max-w-xs">
              Elige tu nombre de usuario que será tu subdominio de tienda pública sin costo.
            </p>
          </div>

          <div className="p-6 bg-[#121721] rounded-xl border border-[#222B38] flex flex-col items-center text-center">
            <span className="w-9 h-9 rounded-lg bg-[#E5A100] text-black font-bold text-sm flex items-center justify-center mb-4">
              2
            </span>
            <h4 className="font-bold text-white text-base mb-2">Completa tu Catálogo</h4>
            <p className="text-slate-400 text-xs leading-relaxed max-w-xs">
              Añade imágenes de tus productos, precios con descuento, stock y variantes disponibles.
            </p>
          </div>

          <div className="p-6 bg-[#121721] rounded-xl border border-[#222B38] flex flex-col items-center text-center">
            <span className="w-9 h-9 rounded-lg bg-[#D62839] text-white font-bold text-sm flex items-center justify-center mb-4">
              3
            </span>
            <h4 className="font-bold text-white text-base mb-2">Recibe Pedidos Directos</h4>
            <p className="text-slate-400 text-xs leading-relaxed max-w-xs">
              Comparte tu enlace, tus clientes ingresarán al carrito y coordinarás ventas por WhatsApp o directo.
            </p>
          </div>
        </div>
      </section>

      {/* PLANES DISPONIBLES - 4 Clean Flat Pricing Cards */}
      <section id="planes" className="py-14 sm:py-20 px-4 sm:px-6 max-w-7xl mx-auto border-b border-[#222B38]">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <div className="inline-flex items-center gap-1.5 text-[#E5A100] font-bold text-xs uppercase tracking-wider mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            <span>PLANES DISPONIBLES</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">Tarifas claras, sin comisiones por pedido</h2>
        </div>

        {/* 4 Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 text-left">
          
          {/* Plan Básico */}
          <div className="bg-[#121721] border border-[#2B374A] hover:border-[#D62839] rounded-xl p-5 flex flex-col justify-between transition-colors">
            <div>
              <div className="w-10 h-10 rounded-lg bg-[#1A222E] text-[#D62839] flex items-center justify-center mb-3 border border-[#2B374A]">
                <Package className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white mb-1">Plan Básico</h3>
              <p className="text-slate-400 text-xs mb-4 min-h-[36px] leading-relaxed">
                Hasta 5 productos para el inicio de tu negocio.
              </p>

              <div className="border-t border-[#222B38] pt-4 pb-4">
                <div className="flex items-center gap-2 text-xs text-slate-300 font-medium">
                  <Tag className="w-3.5 h-3.5 text-[#D62839] shrink-0" />
                  <span>Hasta <strong className="text-white font-bold">5</strong> productos</span>
                </div>
              </div>
            </div>

            <div className="border-t border-[#222B38] pt-4">
              <div className="mb-4">
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl sm:text-3xl font-black text-white">$49.000</span>
                  <span className="text-xs text-slate-400">COP/mes</span>
                </div>
                <p className="text-[10px] font-bold text-[#E5A100] tracking-wider uppercase mt-1">
                  FACTURACIÓN MENSUAL
                </p>
              </div>
              <button
                onClick={() => onNavigate('signup')}
                className="w-full py-2.5 px-4 rounded-lg bg-[#1A222E] hover:bg-[#D62839] text-white font-bold text-xs transition-colors cursor-pointer text-center border border-[#2B374A] hover:border-[#D62839]"
              >
                Elegir Plan
              </button>
            </div>
          </div>

          {/* Plan Medio */}
          <div className="bg-[#121721] border border-[#2B374A] hover:border-[#E5A100] rounded-xl p-5 flex flex-col justify-between transition-colors">
            <div>
              <div className="w-10 h-10 rounded-lg bg-[#1A222E] text-[#E5A100] flex items-center justify-center mb-3 border border-[#2B374A]">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white mb-1">Plan Medio</h3>
              <p className="text-slate-400 text-xs mb-4 min-h-[36px] leading-relaxed">
                Hasta 12 productos para tiendas en crecimiento.
              </p>

              <div className="border-t border-[#222B38] pt-4 pb-4">
                <div className="flex items-center gap-2 text-xs text-slate-300 font-medium">
                  <Tag className="w-3.5 h-3.5 text-[#E5A100] shrink-0" />
                  <span>Hasta <strong className="text-white font-bold">12</strong> productos</span>
                </div>
              </div>
            </div>

            <div className="border-t border-[#222B38] pt-4">
              <div className="mb-4">
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl sm:text-3xl font-black text-white">$79.000</span>
                  <span className="text-xs text-slate-400">COP/mes</span>
                </div>
                <p className="text-[10px] font-bold text-[#E5A100] tracking-wider uppercase mt-1">
                  FACTURACIÓN MENSUAL
                </p>
              </div>
              <button
                onClick={() => onNavigate('signup')}
                className="w-full py-2.5 px-4 rounded-lg bg-[#1A222E] hover:bg-[#E5A100] text-white hover:text-black font-bold text-xs transition-colors cursor-pointer text-center border border-[#2B374A] hover:border-[#E5A100]"
              >
                Elegir Plan
              </button>
            </div>
          </div>

          {/* Plan Avanzado */}
          <div className="bg-[#121721] border border-[#2B374A] hover:border-[#D62839] rounded-xl p-5 flex flex-col justify-between transition-colors">
            <div>
              <div className="w-10 h-10 rounded-lg bg-[#1A222E] text-[#D62839] flex items-center justify-center mb-3 border border-[#2B374A]">
                <Rocket className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white mb-1">Plan Avanzado</h3>
              <p className="text-slate-400 text-xs mb-4 min-h-[36px] leading-relaxed">
                Hasta 24 productos para marcas de alto calibre.
              </p>

              <div className="border-t border-[#222B38] pt-4 pb-4">
                <div className="flex items-center gap-2 text-xs text-slate-300 font-medium">
                  <Tag className="w-3.5 h-3.5 text-[#D62839] shrink-0" />
                  <span>Hasta <strong className="text-white font-bold">24</strong> productos</span>
                </div>
              </div>
            </div>

            <div className="border-t border-[#222B38] pt-4">
              <div className="mb-4">
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl sm:text-3xl font-black text-white">$99.000</span>
                  <span className="text-xs text-slate-400">COP/mes</span>
                </div>
                <p className="text-[10px] font-bold text-[#E5A100] tracking-wider uppercase mt-1">
                  FACTURACIÓN MENSUAL
                </p>
              </div>
              <button
                onClick={() => onNavigate('signup')}
                className="w-full py-2.5 px-4 rounded-lg bg-[#1A222E] hover:bg-[#D62839] text-white font-bold text-xs transition-colors cursor-pointer text-center border border-[#2B374A] hover:border-[#D62839]"
              >
                Elegir Plan
              </button>
            </div>
          </div>

          {/* Plan Especial */}
          <div className="bg-[#121721] border-2 border-[#E5A100] rounded-xl p-5 flex flex-col justify-between relative">
            <span className="absolute top-4 right-4 bg-[#E5A100] text-black font-extrabold text-[10px] px-2 py-0.5 rounded uppercase tracking-wider">
              ESPECIAL
            </span>

            <div>
              <div className="w-10 h-10 rounded-lg bg-[#1A222E] text-[#E5A100] flex items-center justify-center mb-3 border border-[#2B374A]">
                <Star className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white mb-1">Plan Especial</h3>
              <p className="text-slate-400 text-xs mb-4 min-h-[36px] leading-relaxed">
                Para tiendas con más de 24 productos y necesidades personalizadas.
              </p>

              <div className="border-t border-[#222B38] pt-4 pb-4">
                <div className="flex items-center gap-2 text-xs text-slate-300 font-medium">
                  <Tag className="w-3.5 h-3.5 text-[#E5A100] shrink-0" />
                  <span>Más de <strong className="text-[#E5A100] font-bold">24</strong> productos</span>
                </div>
              </div>
            </div>

            <div className="border-t border-[#222B38] pt-4">
              <div className="bg-[#0B0E14] border border-[#222B38] rounded-lg p-2.5 mb-3 flex items-start gap-2">
                <Headphones className="w-4 h-4 text-[#E5A100] shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-[11px] font-bold text-white">Asesoría directa</h4>
                  <p className="text-[10px] text-slate-400 leading-normal">
                    Te ayudamos a encontrar el plan ideal para tu negocio.
                  </p>
                </div>
              </div>

              <button
                onClick={() => window.open('https://wa.me/573219730865?text=Hola%20RYYCO,%20estoy%20interesado%20en%20el%20Plan%20Especial%20para%20mi%20tienda.', '_blank')}
                className="w-full py-2.5 px-4 rounded-lg bg-[#E5A100] hover:bg-[#c98d00] text-black font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>Contactar Asesor</span>
              </button>
            </div>
          </div>

        </div>
      </section>

      {/* Final Call to Action - Flat Solid Banner */}
      <section className="bg-[#0B0E14] py-14 sm:py-20 px-4 sm:px-6 text-center border-b border-[#222B38]">
        <div className="max-w-3xl mx-auto bg-[#121721] border border-[#222B38] rounded-2xl p-8 sm:p-12">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-white mb-3 leading-tight">
            ¿Listo para digitalizar tu negocio hoy?
          </h2>
          <p className="text-slate-300 max-w-lg mx-auto mb-6 text-xs sm:text-sm leading-relaxed">
            Únete a cientos de marcas, tiendas boutique y emprendedores que ya incrementan sus ingresos administrando inteligentemente sus productos y pedidos.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button 
              onClick={() => onNavigate('signup')}
              className="w-full sm:w-auto px-6 py-3 bg-[#D62839] hover:bg-[#b81d2d] text-white font-bold text-xs sm:text-sm rounded-lg transition-colors cursor-pointer"
            >
              Comenzar Mi Tienda
            </button>
            <button 
              onClick={() => onNavigate('login')}
              className="w-full sm:w-auto px-6 py-3 bg-[#1A222E] hover:bg-[#252E3E] border border-[#2B374A] text-slate-300 hover:text-white font-bold text-xs sm:text-sm rounded-lg transition-colors cursor-pointer"
            >
              Acceder a mi panel
            </button>
          </div>
        </div>
      </section>

      {/* Comprehensive Footer - Pure Flat Surface */}
      <footer className="py-12 px-4 sm:px-6 bg-[#0E121A] text-slate-400 text-center text-xs space-y-4">
        <div className="max-w-3xl mx-auto space-y-2">
          <p className="font-bold text-white text-sm sm:text-base">
            Ryyco — Pide comida, descubre restaurantes y recibe recomendaciones
          </p>
          <p className="text-slate-400 text-xs leading-relaxed max-w-2xl mx-auto">
            Plataforma gastronómica inteligente en Colombia para pedir comida online, explorar restaurantes cerca de ti, consultar menús de platos y ordenar comida a domicilio con facilidad.
          </p>
        </div>

        <p className="font-medium text-slate-500 text-[11px]">
          © 2026 Ryyco (ryyco.com). Todos los derechos reservados.
        </p>

        {/* Quick Navigation Action Links */}
        <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
          <button 
            onClick={() => {
              window.history.pushState({}, '', '/domiciliario');
              onNavigate('driver-portal');
            }}
            className="inline-flex items-center gap-1.5 text-slate-200 hover:text-white font-semibold text-xs transition-colors bg-[#161C26] hover:bg-[#252E3E] px-3 py-2 rounded-lg border border-[#2B374A] cursor-pointer"
          >
            <Bike className="w-3.5 h-3.5 text-[#D62839]" />
            <span>Portal Domiciliario</span>
          </button>
          
          <button 
            onClick={() => onNavigate('driver-register')}
            className="inline-flex items-center gap-1.5 text-slate-200 hover:text-white font-semibold text-xs transition-colors bg-[#161C26] hover:bg-[#252E3E] px-3 py-2 rounded-lg border border-[#2B374A] cursor-pointer"
          >
            <Bike className="w-3.5 h-3.5 text-[#E5A100]" />
            <span>Ser Domiciliario</span>
          </button>

          <button 
            onClick={() => {
              setFooterTermsTab('buyers');
              setIsBuyerTermsModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 text-slate-200 hover:text-white font-semibold text-xs transition-colors bg-[#161C26] hover:bg-[#252E3E] px-3 py-2 rounded-lg border border-[#2B374A] cursor-pointer"
          >
            <ShoppingBag className="w-3.5 h-3.5 text-[#D62839]" />
            <span>Términos Compradores</span>
          </button>

          <button 
            onClick={() => {
              setFooterTermsTab('sellers');
              setIsTermsModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 text-slate-200 hover:text-white font-semibold text-xs transition-colors bg-[#161C26] hover:bg-[#252E3E] px-3 py-2 rounded-lg border border-[#2B374A] cursor-pointer"
          >
            <Scale className="w-3.5 h-3.5 text-[#E5A100]" />
            <span>Términos Vendedores</span>
          </button>

          <a
            href="/privacidad"
            onClick={(e) => {
              e.preventDefault();
              window.history.pushState({}, '', '/privacidad');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
            className="inline-flex items-center gap-1.5 text-slate-200 hover:text-white font-semibold text-xs transition-colors bg-[#161C26] hover:bg-[#252E3E] px-3 py-2 rounded-lg border border-[#2B374A] cursor-pointer"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Política de Privacidad</span>
          </a>

          <a 
            href="https://wa.me/573219730865?text=Hola!%20Necesito%20ayuda%20o%20soporte%20con%20Ryyco"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-slate-200 hover:text-white font-semibold text-xs transition-colors bg-[#161C26] hover:bg-[#252E3E] px-3 py-2 rounded-lg border border-[#2B374A]"
          >
            <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
            <span>Atención al Cliente: 3219730865</span>
          </a>
        </div>

        {/* Section of Legal Terms on Footer - Clean Flat Accordion */}
        <div className="max-w-4xl mx-auto text-left mt-8 pt-6 border-t border-[#222B38]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#121721] border border-[#222B38] rounded-xl p-4">
            <div className="flex items-start sm:items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#1A222E] text-[#D62839] flex items-center justify-center shrink-0 border border-[#2B374A]">
                <Scale className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-white font-bold text-xs sm:text-sm">
                  {footerTermsTab === 'buyers' 
                    ? 'Términos y Condiciones para Usuarios y Compradores' 
                    : 'Términos y Condiciones de Registro para Vendedores'}
                </h4>
                <p className="text-[11px] text-slate-400">
                  De conformidad con la Ley 1480 de 2011 (Estatuto del Consumidor), Ley 1581 de 2012 y Ley 527 de 1999
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowFooterTerms(!showFooterTerms)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#1A222E] hover:bg-[#252E3E] text-slate-200 hover:text-white rounded-lg text-xs font-bold transition-colors cursor-pointer border border-[#2B374A]"
              >
                <span>{showFooterTerms ? 'Ocultar términos' : 'Consultar en el pie'}</span>
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
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#D62839] hover:bg-[#b81d2d] text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Modal completo</span>
              </button>
            </div>
          </div>

          {/* Tab selector for footer terms */}
          {showFooterTerms && (
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setFooterTermsTab('buyers')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                  footerTermsTab === 'buyers'
                    ? 'bg-[#D62839] text-white'
                    : 'bg-[#161C26] text-slate-400 hover:text-white border border-[#222B38]'
                }`}
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                <span>Para Usuarios y Compradores (20 Numerales)</span>
              </button>
              <button
                type="button"
                onClick={() => setFooterTermsTab('sellers')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                  footerTermsTab === 'sellers'
                    ? 'bg-[#D62839] text-white'
                    : 'bg-[#161C26] text-slate-400 hover:text-white border border-[#222B38]'
                }`}
              >
                <Scale className="w-3.5 h-3.5" />
                <span>Para Tiendas y Vendedores (9 Numerales)</span>
              </button>
            </div>
          )}

          {showFooterTerms && footerTermsTab === 'buyers' && (
            <div className="mt-4 p-5 bg-[#0B0E14] border border-[#222B38] rounded-xl space-y-4 text-xs text-slate-300">
              <div className="p-3.5 bg-[#121721] rounded-lg border border-[#222B38] space-y-1">
                <span className="text-[10px] uppercase font-bold text-[#D62839] tracking-wider block">
                  Marco Legal Colombiano para Compradores
                </span>
                <h5 className="text-xs sm:text-sm font-bold text-white uppercase">
                  {BUYER_TERMS_PREAMBLE.title}
                </h5>
                <p className="text-[11px] text-slate-300 leading-relaxed whitespace-pre-line">
                  {BUYER_TERMS_PREAMBLE.text}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {BUYER_TERMS_SECTIONS.map((sec) => (
                  <div key={sec.id} className="p-3.5 bg-[#121721] rounded-lg border border-[#222B38] space-y-2">
                    <h6 className="font-bold text-white text-xs flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded bg-[#161C26] text-[#D62839] text-[10px] font-bold flex items-center justify-center border border-[#2B374A] shrink-0">
                        {sec.number}
                      </span>
                      <span>{sec.title}</span>
                    </h6>
                    <p className="text-[11px] text-slate-300 leading-relaxed whitespace-pre-line">
                      {sec.content}
                    </p>
                    {sec.points && sec.points.length > 0 && (
                      <ul className="space-y-1 pt-1 text-[11px]">
                        {sec.points.map((p, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-slate-300">
                            <span className="text-[#E5A100] font-bold">•</span>
                            <span>{p}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {sec.subsections && sec.subsections.length > 0 && (
                      <div className="space-y-1 pt-1.5">
                        {sec.subsections.map((sub, i) => (
                          <div key={i} className="p-2 bg-[#0B0E14] rounded border border-[#222B38] text-[10px] text-slate-300 space-y-0.5">
                            <div className="font-bold text-white flex items-center gap-1">
                              {sub.letter && <span className="text-[#D62839]">{sub.letter}.</span>}
                              <span>{sub.label}</span>
                            </div>
                            <p className="text-slate-400">{sub.text}</p>
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
            <div className="mt-4 p-5 bg-[#0B0E14] border border-[#222B38] rounded-xl space-y-4 text-xs text-slate-300">
              <div className="p-3.5 bg-[#121721] rounded-lg border border-[#222B38] space-y-1">
                <span className="text-[10px] uppercase font-bold text-[#D62839] tracking-wider block">
                  Marco Legal Colombiano Aplicable para Vendedores
                </span>
                <h5 className="text-xs sm:text-sm font-bold text-white uppercase">
                  {SELLER_TERMS_PREAMBLE.title}
                </h5>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  {SELLER_TERMS_PREAMBLE.text}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {SELLER_TERMS_SECTIONS.map((sec) => (
                  <div key={sec.id} className="p-3.5 bg-[#121721] rounded-lg border border-[#222B38] space-y-2">
                    <h6 className="font-bold text-white text-xs flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded bg-[#161C26] text-[#D62839] text-[10px] font-bold flex items-center justify-center border border-[#2B374A] shrink-0">
                        {sec.number}
                      </span>
                      <span>{sec.title}</span>
                    </h6>
                    <p className="text-[11px] text-slate-300 leading-relaxed whitespace-pre-line">
                      {sec.content}
                    </p>
                    {sec.points && sec.points.length > 0 && (
                      <ul className="space-y-1 pt-1 text-[11px]">
                        {sec.points.map((p, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-slate-300">
                            <span className="text-[#E5A100] font-bold">•</span>
                            <span>{p}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {sec.subsections && sec.subsections.length > 0 && (
                      <div className="space-y-1 pt-1.5">
                        {sec.subsections.map((sub, i) => (
                          <div key={i} className="p-2 bg-[#0B0E14] rounded border border-[#222B38] text-[10px] text-slate-300 space-y-0.5">
                            <div className="font-bold text-white flex items-center gap-1">
                              {sub.letter && <span className="text-[#D62839]">{sub.letter}.</span>}
                              <span>{sub.label}</span>
                            </div>
                            <p className="text-slate-400">{sub.text}</p>
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

      {/* Floating WhatsApp Customer Support Button - Clean Flat Solid Button */}
      <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 print:hidden">
        <a
          href="https://wa.me/573219730865?text=Hola!%20Necesito%20ayuda%20o%20soporte%20con%20Ryyco"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2.5 px-4 py-2.5 bg-[#D62839] hover:bg-[#b81d2d] text-white font-bold text-xs sm:text-sm rounded-full shadow-lg border border-white/20 transition-all cursor-pointer active:scale-95"
        >
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 border border-white/60 shrink-0" />
          <MessageCircle className="w-4 h-4 text-white" />
          <span className="whitespace-nowrap">Atención al Cliente</span>
        </a>
      </div>

      {/* Printable Presentation Letter Modal */}
      {isPrintModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 overflow-y-auto print:p-0 print:bg-white print:static">
          <div className="bg-white text-gray-900 w-full max-w-[850px] rounded-xl shadow-2xl overflow-hidden print:shadow-none print:rounded-none print:max-w-none print:w-full my-8 print:my-0">
            {/* Modal Actions Bar (Hidden on Print) */}
            <div className="flex items-center justify-between px-6 py-4 bg-gray-900 text-white border-b border-gray-800 print:hidden">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-400" />
                <span className="font-bold text-sm">Carta de Presentación - Formato Imprimible (Tamaño Carta)</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-4 py-2 rounded-lg text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Imprimir / Guardar PDF</span>
                </button>
                <button
                  onClick={() => setIsPrintModalOpen(false)}
                  className="bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white p-2 rounded-lg transition-colors cursor-pointer"
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
                <h3 className="text-lg font-bold text-gray-900 font-sans">
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
                      <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-emerald-300 bg-white mb-1.5 flex items-center justify-center">
                        {store.logo ? (
                          <img 
                            src={store.logo} 
                            alt={store.name}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              if (store.username && !e.currentTarget.src.includes(`/stores/${store.username}`)) {
                                e.currentTarget.src = `/stores/${store.username}.jpg`;
                              }
                            }}
                          />
                        ) : (
                          <span className="font-bold text-emerald-800 text-sm">{store.name.charAt(0)}</span>
                        )}
                      </div>
                      <span className="text-xs font-bold text-gray-900 leading-tight max-w-[110px]">
                        {store.name}
                      </span>
                      {store.category && (
                        <span className="text-[10px] text-gray-500 font-medium">
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
                <p className="text-xl font-bold text-emerald-700 tracking-tight mt-3">
                  Más clientes. Más pedidos. Más ventas. Ryyco.com.
                </p>
              </div>
            </div>

            {/* Modal Bottom Close Bar (Hidden on Print) */}
            <div className="bg-gray-100 px-6 py-3 border-t border-gray-200 flex justify-end print:hidden">
              <button
                onClick={() => setIsPrintModalOpen(false)}
                className="bg-gray-800 hover:bg-gray-900 text-white font-bold px-5 py-2 rounded-lg text-xs cursor-pointer"
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

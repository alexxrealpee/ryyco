import React from 'react';
import { FileText, Printer, X } from 'lucide-react';
const partnerStores = [
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
  ];
export default function LandingLetter({onClose}:{onClose:()=>void}) { return (
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
                  onClick={() => onClose()}
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
                onClick={() => onClose()}
                className="bg-gray-800 hover:bg-gray-900 text-white font-bold px-5 py-2 rounded-lg text-xs cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
); }

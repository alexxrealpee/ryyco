import React from 'react';
import { 
  ShieldCheck, 
  MapPin, 
  Camera, 
  Bell, 
  Lock, 
  Trash2, 
  Mail, 
  FileText, 
  ArrowLeft, 
  CheckCircle2, 
  Smartphone,
  ExternalLink,
  Info
} from 'lucide-react';

interface PrivacyPolicyPageProps {
  onNavigateHome?: () => void;
}

export default function PrivacyPolicyPage({ onNavigateHome }: PrivacyPolicyPageProps) {
  const lastUpdated = "23 de septiembre de 2026";
  const contactEmail = "AlexXRealpeE@gmail.com";

  const handleGoHome = () => {
    if (onNavigateHome) {
      onNavigateHome();
    } else {
      window.location.href = '/tienda';
    }
  };

  return (
    <div className="min-h-screen bg-[#090B12] text-slate-100 selection:bg-amber-500/30 selection:text-amber-200">
      {/* Top Header Bar */}
      <header className="sticky top-0 z-50 bg-[#090B12]/90 backdrop-blur-md border-b border-slate-800/80 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={handleGoHome}
              className="p-2 rounded-xl bg-slate-800/70 hover:bg-slate-700 text-slate-300 hover:text-white transition flex items-center gap-2 text-xs font-bold border border-slate-700/60"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Volver a Ryyco</span>
            </button>
            <div className="flex items-center gap-2">
              <span className="text-amber-400 font-black tracking-tight text-lg">Ryyco</span>
              <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">
                Legal & Privacidad
              </span>
            </div>
          </div>
          <a
            href={`mailto:${contactEmail}`}
            className="text-xs text-slate-400 hover:text-amber-400 flex items-center gap-1.5 transition font-medium"
          >
            <Mail className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">{contactEmail}</span>
            <span className="sm:hidden">Contacto</span>
          </a>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
        {/* Title Header Card */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900/90 to-[#121624] border border-slate-800 p-6 sm:p-10 mb-10 shadow-2xl shadow-black/40">
          <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold mb-4">
              <ShieldCheck className="w-4 h-4" />
              <span>Cumplimiento Oficial Google Play y Protección de Datos</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mb-3">
              Política de Privacidad de Ryyco
            </h1>
            <p className="text-slate-300 text-sm sm:text-base leading-relaxed max-w-2xl mb-4">
              Esta política describe de manera transparente cómo la aplicación móvil <strong className="text-white">Ryyco</strong> y la plataforma web gestionan, recopilan, utilizan, protegen y eliminan los datos de los usuarios, clientes, restaurantes y domiciliarios.
            </p>
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 pt-2 border-t border-slate-800">
              <span>📅 <strong>Última actualización:</strong> {lastUpdated}</span>
              <span>•</span>
              <span>🏢 <strong>Aplicación:</strong> Ryyco (Android & Web)</span>
              <span>•</span>
              <span>📍 <strong>Territorio:</strong> Colombia</span>
            </div>
          </div>
        </div>

        {/* Quick Highlights Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex flex-col gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center">
              <MapPin className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Ubicación Precisa</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Utilizada exclusivamente para entrega de pedidos, cálculo de rutas y cálculo de costo de envío.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex flex-col gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/15 text-indigo-400 flex items-center justify-center">
              <Lock className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Cifrado de Datos</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Toda la información se transmite bajo protocolo seguro HTTPS/TLS y almacenamiento protegido en Google Firebase.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex flex-col gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">No Vendemos Datos</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Tus datos personales nunca se venden ni se comparten con redes de publicidad invasivas de terceros.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex flex-col gap-2">
            <div className="w-8 h-8 rounded-xl bg-rose-500/15 text-rose-400 flex items-center justify-center">
              <Trash2 className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Derecho a Borrado</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Puedes solicitar la supresión total de tu cuenta y datos en cualquier momento desde la app o por correo.
            </p>
          </div>
        </div>

        {/* Detailed Sections */}
        <div className="space-y-8 text-slate-300 text-sm leading-relaxed">
          
          {/* Section 1 */}
          <section className="p-6 sm:p-8 rounded-3xl bg-slate-900/40 border border-slate-800/80">
            <h2 className="text-xl font-bold text-white flex items-center gap-3 mb-4">
              <span className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 text-xs font-black flex items-center justify-center border border-amber-500/30">1</span>
              Información que Recopilamos
            </h2>
            <p className="mb-4">
              Para brindar el servicio de pedidos en línea, restaurantes y entrega a domicilio, recopilamos los siguientes datos de los usuarios:
            </p>
            <ul className="space-y-2.5 list-none pl-1">
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                <span><strong className="text-white">Datos de identificación y contacto:</strong> Nombre completo, número de teléfono (WhatsApp), dirección de correo electrónico y dirección física de entrega.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                <span><strong className="text-white">Datos de pedidos y transacciones:</strong> Productos seleccionados, notas de preparación, método de pago acordado (contra entrega o transferencia) y registro de puntos de fidelización Ryyco. <em>Ryyco no almacena números completos de tarjetas de crédito o débito ni datos bancarios sensibles.</em></span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                <span><strong className="text-white">Datos de domiciliarios / repartidores:</strong> Cédula de identidad, vehículo, número de contacto, historial de pedidos entregados y coordenadas de geolocalización durante el servicio activo.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                <span><strong className="text-white">Información técnica del dispositivo:</strong> Dirección IP, versión del sistema operativo Android o navegador, con fines estrictos de diagnóstico, prevención de fraudes y estabilidad de la app.</span>
              </li>
            </ul>
          </section>

          {/* Section 2 - Permissions */}
          <section className="p-6 sm:p-8 rounded-3xl bg-slate-900/40 border border-slate-800/80">
            <h2 className="text-xl font-bold text-white flex items-center gap-3 mb-4">
              <span className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 text-xs font-black flex items-center justify-center border border-amber-500/30">2</span>
              Permisos de la Aplicación Android y Tratamiento de Datos Sensibles
            </h2>
            <p className="mb-4">
              De acuerdo con las directrices de la política de datos de usuario de <strong className="text-white">Google Play</strong>, detallamos a continuación los permisos sensibles solicitados por la aplicación y el motivo exacto de su uso:
            </p>

            <div className="space-y-4">
              {/* Location */}
              <div className="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/60">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-sm">Ubicación (ACCESS_FINE_LOCATION, ACCESS_COARSE_LOCATION y Segundo Plano)</h3>
                    <span className="text-[11px] text-amber-300 font-mono">Sensible / Crítico para el servicio</span>
                  </div>
                </div>
                <div className="text-xs text-slate-300 space-y-2 mt-2">
                  <p>
                    • <strong>Para Clientes:</strong> La app solicita acceso a la ubicación en primer plano para detectar tu dirección de entrega en el mapa, calcular automáticamente la distancia y costo de domicilio, y mostrarte los restaurantes con cobertura en tu zona.
                  </p>
                  <p>
                    • <strong>Para Domiciliarios / Repartidores:</strong> La app solicita permiso de ubicación precisa y en segundo plano mientras el domiciliario se encuentre con un pedido asignado en curso (desde la aceptación hasta la entrega final). Esto permite mostrar al cliente y al restaurante el seguimiento en tiempo real del repartidor en el mapa y calcular el tiempo estimado de entrega (ETA). La transmisión de ubicación en segundo plano se detiene inmediatamente una vez que el pedido es completado o cancelado.
                  </p>
                </div>
              </div>

              {/* Camera & Storage */}
              <div className="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/60">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-xl bg-blue-500/15 text-blue-400">
                    <Camera className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-sm">Cámara y Galería de Fotos (CAMERA, READ_MEDIA_IMAGES)</h3>
                    <span className="text-[11px] text-blue-300 font-mono">Uso voluntario bajo demanda</span>
                  </div>
                </div>
                <p className="text-xs text-slate-300">
                  Se solicita únicamente cuando un restaurante sube imágenes de sus productos al menú, cuando un usuario personaliza su foto de perfil, o cuando se escanea un código QR en una mesa. La aplicación no accede a tus fotos ni utiliza la cámara en segundo plano.
                </p>
              </div>

              {/* Notifications */}
              <div className="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/60">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-xl bg-purple-500/15 text-purple-400">
                    <Bell className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-sm">Notificaciones (POST_NOTIFICATIONS)</h3>
                    <span className="text-[11px] text-purple-300 font-mono">Alertas transaccionales</span>
                  </div>
                </div>
                <p className="text-xs text-slate-300">
                  Se utilizan para mantener informado al cliente sobre el cambio de estado de su orden: <em>"Confirmado"</em>, <em>"En restaurante"</em>, <em>"En camino"</em> y <em>"Entregado"</em>, así como alertas urgentes sobre disponibilidad de productos. Puedes desactivarlas en cualquier momento desde los ajustes de Android.
                </p>
              </div>
            </div>
          </section>

          {/* Section 3 */}
          <section className="p-6 sm:p-8 rounded-3xl bg-slate-900/40 border border-slate-800/80">
            <h2 className="text-xl font-bold text-white flex items-center gap-3 mb-4">
              <span className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 text-xs font-black flex items-center justify-center border border-amber-500/30">3</span>
              Finalidad del Tratamiento de los Datos
            </h2>
            <p className="mb-3">Los datos recopilados se utilizan exclusivamente para:</p>
            <ol className="list-decimal pl-5 space-y-2">
              <li><strong>Procesar y despachar pedidos:</strong> Conectar a los comensales con el restaurante seleccionado y con el domiciliario encargado de la entrega.</li>
              <li><strong>Comunicación operativa:</strong> Enviar confirmaciones, notificaciones de estado y permitir la coordinación directa por WhatsApp o llamada respecto al pedido.</li>
              <li><strong>Gestión del programa de recompensas:</strong> Acumular y canjear puntos de fidelidad Ryyco válidos para descuentos en compras futuras.</li>
              <li><strong>Seguridad y prevención de fraudes:</strong> Verificar la identidad de los domiciliarios registrados y evitar transacciones apócrifas.</li>
            </ol>
          </section>

          {/* Section 4 */}
          <section className="p-6 sm:p-8 rounded-3xl bg-slate-900/40 border border-slate-800/80">
            <h2 className="text-xl font-bold text-white flex items-center gap-3 mb-4">
              <span className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 text-xs font-black flex items-center justify-center border border-amber-500/30">4</span>
              Compartición de Datos con Terceros
            </h2>
            <p className="mb-3">
              Ryyco únicamente comparte la información estrictamente necesaria con las siguientes partes involucradas en el servicio:
            </p>
            <ul className="space-y-2 list-disc pl-5">
              <li><strong>Restaurante afiliado:</strong> Recibe el nombre del cliente, los productos del pedido y las notas de cocina para preparar la orden.</li>
              <li><strong>Domiciliario asignado:</strong> Recibe el nombre, teléfono y dirección física de entrega con coordenadas para llevar el pedido al destino.</li>
              <li><strong>Proveedores de infraestructura en la nube:</strong> Utilizamos los servicios de Google Cloud y Firebase para el alojamiento seguro de la base de datos y la autenticación de usuarios.</li>
            </ul>
            <p className="mt-3 text-xs text-amber-400/90 font-medium">
              Nota: Ryyco no comercializa, no alquila y no vende listas de usuarios ni información personal a empresas de publicidad ni a intermediarios externos.
            </p>
          </section>

          {/* Section 5 - Account Deletion & Rights (MANDATORY FOR GOOGLE PLAY) */}
          <section className="p-6 sm:p-8 rounded-3xl bg-slate-900/40 border border-slate-800/80 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-40 h-40 bg-rose-500/10 rounded-full blur-2xl pointer-events-none" />
            <h2 className="text-xl font-bold text-white flex items-center gap-3 mb-4">
              <span className="w-7 h-7 rounded-lg bg-rose-500/20 text-rose-400 text-xs font-black flex items-center justify-center border border-rose-500/30">5</span>
              Eliminación de Cuenta y Retención de Datos (Derechos ARCO)
            </h2>
            <p className="mb-3">
              En estricto cumplimiento de las políticas de Google Play Store y la Ley de Protección de Datos Personales (Ley 1581 de 2012 de Colombia), todo usuario tiene el derecho inalienable de conocer, actualizar, rectificar y <strong>solicitar la eliminación definitiva de su cuenta y todos sus datos personales asociados</strong>.
            </p>

            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 my-4 space-y-2">
              <h3 className="font-bold text-rose-300 text-sm flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-rose-400" />
                ¿Cómo solicitar el borrado completo de tu cuenta y datos?
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Puedes solicitar el borrado permanente de tu cuenta y todos los registros asociados de cualquiera de las siguientes maneras:
              </p>
              <div className="text-xs text-slate-200 pl-2 space-y-1.5 font-medium">
                <p>1. <strong>Vía Correo Electrónico:</strong> Envía un mensaje a <a href={`mailto:${contactEmail}?subject=Solicitud%20de%20Eliminación%20de%20Cuenta%20Ryyco`} className="text-amber-400 underline font-mono">{contactEmail}</a> con el asunto <em>"Solicitud de Eliminación de Cuenta Ryyco"</em> indicando tu número de teléfono o correo registrado.</p>
                <p>2. <strong>Desde la Aplicación:</strong> Ingresa a tu perfil en el Club de Clientes o Portal del Domiciliario y pulsa en la opción de soporte / solicitud de baja de cuenta.</p>
              </div>
              <p className="text-[11px] text-slate-400 pt-1">
                ⏱️ Tu solicitud será atendida y tus datos personales serán purgados de nuestros servidores en un plazo máximo de <strong>48 a 72 horas hábiles</strong>.
              </p>
            </div>
          </section>

          {/* Section 6 */}
          <section className="p-6 sm:p-8 rounded-3xl bg-slate-900/40 border border-slate-800/80">
            <h2 className="text-xl font-bold text-white flex items-center gap-3 mb-4">
              <span className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 text-xs font-black flex items-center justify-center border border-amber-500/30">6</span>
              Seguridad de la Información
            </h2>
            <p>
              Implementamos medidas técnicas, administrativas y físicas rigurosas para proteger tu información contra acceso no autorizado, alteración, divulgación o destrucción. Esto incluye cifrado TLS en todas las comunicaciones web y móviles, reglas de seguridad en bases de datos con control de acceso por roles (RBAC) y servidores de respaldo con monitoreo continuo.
            </p>
          </section>

          {/* Section 7 - Contact */}
          <section className="p-6 sm:p-8 rounded-3xl bg-slate-900/40 border border-slate-800/80">
            <h2 className="text-xl font-bold text-white flex items-center gap-3 mb-4">
              <span className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 text-xs font-black flex items-center justify-center border border-amber-500/30">7</span>
              Contacto y Responsable del Tratamiento
            </h2>
            <p className="mb-4">
              Si tienes preguntas, dudas o solicitudes relacionadas con esta Política de Privacidad o con el manejo de tus datos en la aplicación Ryyco, puedes comunicarte directamente con el equipo responsable:
            </p>
            <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/70 space-y-2 text-xs">
              <p>• <strong>Responsable:</strong> Equipo de Soporte y Privacidad Ryyco (Alex Realpe)</p>
              <p>• <strong>Correo de atención:</strong> <a href={`mailto:${contactEmail}`} className="text-amber-400 underline font-mono">{contactEmail}</a></p>
              <p>• <strong>Sitio Web Oficial:</strong> <a href="https://ryyco.com" target="_blank" rel="noopener noreferrer" className="text-amber-400 underline">https://ryyco.com</a></p>
              <p>• <strong>Jurisdicción:</strong> República de Colombia</p>
            </div>
          </section>
        </div>

        {/* Footer info & Home button */}
        <div className="mt-12 pt-8 border-t border-slate-800 text-center flex flex-col items-center gap-4">
          <button
            onClick={handleGoHome}
            className="px-6 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm tracking-wide transition shadow-lg shadow-amber-500/20 flex items-center gap-2 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Volver a la App Ryyco</span>
          </button>
          <p className="text-xs text-slate-500">
            © {new Date().getFullYear()} Ryyco. Todos los derechos reservados.
          </p>
        </div>
      </main>
    </div>
  );
}

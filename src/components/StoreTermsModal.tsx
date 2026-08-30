/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ShieldCheck, FileText, CheckCircle, Store, ExternalLink, MessageCircle, AlertTriangle, ChevronRight, Download, Printer } from 'lucide-react';
import LinnkProLogo from './LinnkProLogo';

interface StoreTermsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept?: () => void;
  showAcceptButton?: boolean;
}

export default function StoreTermsModal({
  isOpen,
  onClose,
  onAccept,
  showAcceptButton = true
}: StoreTermsModalProps) {
  const [activeSection, setActiveSection] = useState<string>('all');

  if (!isOpen) return null;

  const sections = [
    {
      id: 'general',
      title: '1. Objeto y Alcance de la Plataforma Ryyco',
      content: `Ryyco es una plataforma digital y tecnológica que permite a comerciantes, emprendedores, restaurantes y vendedores crear, administrar, personalizar y publicar su vitrina virtual y tienda en línea. Ryyco facilita la exhibición de productos, recepción de pedidos por WhatsApp, gestión de inventario, soporte con asistente de inteligencia artificial y vinculación opcional con domiciliarios independientes.`
    },
    {
      id: 'registro',
      title: '2. Registro, Veracidad y Seguridad de la Cuenta',
      content: `El usuario que registra una tienda declara ser mayor de edad o contar con las autorizaciones legales pertinentes para representar comercialmente su establecimiento. Se compromete a suministrar información verídica, vigente y comprobable (nombre comercial, número de WhatsApp de atención al cliente, ubicación física o cobertura de despacho y datos bancarios para transferencias directas). El vendedor es el único responsable de la confidencialidad de sus credenciales de acceso.`
    },
    {
      id: 'productos',
      title: '3. Productos Permitidos y Responsabilidad de Catálogo',
      content: `El vendedor es el único y exclusivo responsable por la calidad, higiene, idoneidad, estado, vigencia y precios de los productos y servicios ofertados en su tienda virtual. Está estrictamente prohibido comercializar:
      • Sustancias ilegales, estupefacientes o controladas sin prescripción legal.
      • Armas, explosivos o materiales peligrosos.
      • Artículos falsificados, réplicas no autorizadas o que violen derechos de propiedad intelectual.
      • Contenido fraudulento, engañoso o que atente contra las leyes locales.
      Ryyco se reserva el derecho de suspender o remover sin previo aviso cualquier tienda o producto que infrinja estas normas.`
    },
    {
      id: 'pagos',
      title: '4. Pagos Directos y Ausencia de Intermediación Forzosa',
      content: `En Ryyco, las transacciones de compraventa de productos se realizan directamente entre el cliente final y el comercio registrado. Los pagos recibidos vía transferencia (Nequi, Daviplata, Bancolombia, efectivo u otros) van directo a la cuenta del vendedor sin retenciones forzosas por parte de Ryyco. El comercio asume la total responsabilidad por la emisión de facturas, recibos y cumplimiento tributario que aplique a su actividad comercial.`
    },
    {
      id: 'prueba_planes',
      title: '5. Periodo de Prueba (Trial 7 Días) y Suscripciones',
      content: `Toda nueva tienda registrada disfruta de un periodo de prueba gratuito de 7 días con acceso a funciones completas (menú digital, pedidos por WhatsApp, asistente IA, personalización visual y código QR). Al culminar dicho periodo, el comercio podrá seleccionar libremente un plan de suscripción activo (Básico o Pro) para mantener activa su vitrina pública. Ryyco no realiza cobros automáticos sorpresa ni exige tarjeta de crédito para iniciar la prueba.`
    },
    {
      id: 'entregas',
      title: '6. Tiempos de Entrega, Domicilios y Garantías al Consumidor',
      content: `El comercio es responsable de coordinar la preparación, empaque y despacho de los pedidos en los tiempos comunicados al cliente. Podrá utilizar sus propios domiciliarios o apoyarse en la red de domiciliarios independientes registrados en Ryyco. Es obligación del comercio atender con prontitud solicitudes de garantía, errores en el pedido o quejas razonables del comprador.`
    },
    {
      id: 'propiedad',
      title: '7. Propiedad Intelectual y Contenido Subido',
      content: `El comercio conserva todos los derechos sobre sus marcas, logotipos, nombres comerciales y fotografías de productos subidas a la plataforma. Al cargarlos, concede a Ryyco una licencia no exclusiva para mostrarlos públicamente en el directorio general de tiendas, vitrinas y campañas de difusión de la plataforma.`
    },
    {
      id: 'habeas_data',
      title: '8. Protección de Datos Personales (Habeas Data)',
      content: `Ryyco trata los datos de los usuarios conforme a las leyes de protección de datos personales. La información de los clientes (nombre, teléfono, dirección de entrega) entregada al comercio durante un pedido únicamente podrá ser utilizada con el fin específico de gestionar y entregar dicha compra. El vendedor tiene prohibido vender, ceder o utilizar los datos de los compradores para fines no autorizados.`
    },
    {
      id: 'suspension',
      title: '9. Suspensión, Terminación y Sanciones',
      content: `Ryyco podrá suspender temporal o permanentemente el acceso a la plataforma en caso de:
      • Reportes reiterados y verificados de estafas o incumplimiento de pedidos.
      • Publicación de contenido ofensivo, ilícito o difamatorio.
      • Uso indebido de la tecnología o intentos de vulnerar la seguridad del sistema.`
    },
    {
      id: 'soporte',
      title: '10. Modificaciones y Canales de Atención',
      content: `Ryyco podrá actualizar estos términos previa notificación en la plataforma. Para cualquier duda, aclaración o solicitud de soporte técnico, los comerciantes pueden comunicarse a través de nuestra línea oficial de WhatsApp: +57 321 973 0865 o mediante el canal de soporte integrado en el Dashboard.`
    }
  ];

  const handlePrint = () => {
    window.print();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-sm overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2 }}
          className="bg-[#0f1422] border border-[#232B3A] text-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="px-6 py-5 bg-[#141b2d] border-b border-[#232B3A] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#E63946]/15 border border-[#E63946]/30 flex items-center justify-center text-[#E63946]">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-black text-white leading-tight">
                  Términos y Condiciones para Tiendas
                </h3>
                <p className="text-[11px] sm:text-xs text-[#A9B2C3]">
                  Contrato de uso y políticas para comercios en Ryyco
                </p>
              </div>
            </div>
            
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-[#232B3A]/60 hover:bg-[#232B3A] text-gray-400 hover:text-white flex items-center justify-center transition cursor-pointer"
              title="Cerrar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Notice Banner */}
          <div className="bg-[#E63946]/10 border-b border-[#E63946]/20 px-6 py-3 flex items-center gap-3 shrink-0">
            <Store className="w-4 h-4 text-[#E63946] shrink-0" />
            <p className="text-xs text-[#F4B400] font-medium leading-tight">
              Reglas claras para vender con tranquilidad, recibir pedidos por WhatsApp y gestionar tu vitrina virtual.
            </p>
          </div>

          {/* Scrollable Document Body */}
          <div className="p-6 overflow-y-auto space-y-6 text-xs sm:text-sm text-gray-300 leading-relaxed font-normal flex-1">
            <div className="p-3.5 bg-[#090B12] rounded-2xl border border-[#232B3A] space-y-1.5">
              <span className="text-[10px] uppercase font-black text-[#E63946] tracking-wider block">
                Última Actualización: Agosto 2026 • Versión 2.4 Oficial
              </span>
              <p className="text-xs text-gray-400">
                Al registrar tu tienda o catálogo comercial en <strong>Ryyco (ryyco.com)</strong>, aceptas cumplir las siguientes pautas y condiciones legales diseñadas para garantizar la mejor experiencia entre comercios y compradores.
              </p>
            </div>

            {sections.map((section) => (
              <div key={section.id} className="space-y-2 border-b border-[#232B3A]/60 pb-5 last:border-b-0">
                <h4 className="font-extrabold text-white text-xs sm:text-sm flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#E63946]" />
                  {section.title}
                </h4>
                <p className="text-xs text-[#A9B2C3] leading-relaxed whitespace-pre-line pl-3.5">
                  {section.content}
                </p>
              </div>
            ))}

            {/* Support Line Highlight */}
            <div className="p-4 bg-[#141b2d] rounded-2xl border border-[#232B3A] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-white block">¿Tienes dudas sobre los términos?</span>
                <span className="text-[11px] text-gray-400">Nuestro equipo de atención al comerciante está disponible para ti.</span>
              </div>
              <a
                href="https://wa.me/573219730865?text=Hola!%20Tengo%20una%20consulta%20sobre%20los%20términos%20y%20condiciones%20para%20tiendas%20en%20Ryyco"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#E63946]/20 hover:bg-[#E63946] text-[#E63946] hover:text-white border border-[#E63946]/40 rounded-xl text-xs font-bold transition whitespace-nowrap"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>WhatsApp Soporte</span>
              </a>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="px-6 py-4 bg-[#141b2d] border-t border-[#232B3A] flex items-center justify-between gap-3 shrink-0">
            <div className="text-[11px] text-gray-400 hidden sm:block">
              Ryyco Technologies • Todos los derechos reservados
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-[#232B3A]/70 hover:bg-[#232B3A] text-gray-300 hover:text-white text-xs font-bold transition cursor-pointer"
              >
                Cerrar
              </button>

              {showAcceptButton && onAccept && (
                <button
                  type="button"
                  onClick={() => {
                    onAccept();
                    onClose();
                  }}
                  className="px-5 py-2.5 rounded-xl bg-[#E63946] hover:bg-[#D62839] text-white text-xs font-black transition cursor-pointer shadow-lg shadow-[#E63946]/25 flex items-center gap-1.5"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>Aceptar y Continuar</span>
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

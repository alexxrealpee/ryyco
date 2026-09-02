/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ShieldCheck, CheckCircle, MessageCircle, Scale, Search, ShoppingBag } from 'lucide-react';
import { BUYER_TERMS_PREAMBLE, BUYER_TERMS_SECTIONS } from '../data/buyerTermsData';

interface BuyerTermsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept?: () => void;
  showAcceptButton?: boolean;
}

export default function BuyerTermsModal({
  isOpen,
  onClose,
  onAccept,
  showAcceptButton = true
}: BuyerTermsModalProps) {
  const [filterText, setFilterText] = useState('');

  if (!isOpen) return null;

  const filteredSections = BUYER_TERMS_SECTIONS.filter(s => 
    s.title.toLowerCase().includes(filterText.toLowerCase()) ||
    s.content.toLowerCase().includes(filterText.toLowerCase()) ||
    (s.points && s.points.some(p => p.toLowerCase().includes(filterText.toLowerCase())))
  );

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-sm overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2 }}
          className="bg-[#0f1422] border border-[#232B3A] text-white w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="px-6 py-5 bg-[#141b2d] border-b border-[#232B3A] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#E63946]/15 border border-[#E63946]/30 flex items-center justify-center text-[#E63946] shrink-0">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-black text-white leading-tight">
                  Términos y Condiciones para Usuarios y Compradores
                </h3>
                <p className="text-[11px] sm:text-xs text-[#A9B2C3]">
                  RYYCO / Rico • Plataforma tecnológica de domicilios y restaurantes
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

          {/* Quick Legal Framework Notice Banner */}
          <div className="bg-[#E63946]/10 border-b border-[#E63946]/20 px-6 py-3 flex items-center gap-3 shrink-0">
            <ShieldCheck className="w-4 h-4 text-[#E63946] shrink-0" />
            <p className="text-xs text-white/90 font-medium leading-tight">
              Última actualización: <strong className="text-[#F4B400]">{BUYER_TERMS_PREAMBLE.lastUpdated}</strong> • Conforme a la <strong className="text-[#F4B400]">Ley 1480 de 2011</strong> (Estatuto del Consumidor), <strong className="text-[#F4B400]">Ley 1581 de 2012</strong> y <strong className="text-[#F4B400]">Ley 527 de 1999</strong>.
            </p>
          </div>

          {/* Search/filter bar */}
          <div className="px-6 py-2.5 bg-[#0d121f] border-b border-[#232B3A]/60 flex items-center gap-2 shrink-0">
            <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <input
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Buscar cláusulas, pedidos, entregas, cancelaciones o pagos..."
              className="w-full bg-transparent text-xs text-white placeholder-gray-500 outline-none"
            />
            {filterText && (
              <button
                onClick={() => setFilterText('')}
                className="text-[10px] text-gray-400 hover:text-white uppercase font-bold"
              >
                Limpiar
              </button>
            )}
          </div>

          {/* Scrollable Document Body */}
          <div className="p-6 overflow-y-auto space-y-6 text-xs sm:text-sm text-gray-300 leading-relaxed font-normal flex-1">
            
            {/* Main Preamble Box */}
            <div className="p-4 bg-[#090B12] rounded-2xl border border-[#232B3A] space-y-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-[#E63946]/20 border border-[#E63946]/40 text-[#E63946] font-black text-[10px] tracking-wider uppercase">
                  Usuarios y Compradores
                </span>
                <span className="text-[10px] uppercase font-bold text-gray-400">
                  Vigencia: {BUYER_TERMS_PREAMBLE.lastUpdated}
                </span>
              </div>
              <h2 className="text-sm sm:text-base font-black text-white tracking-wide uppercase pt-1">
                {BUYER_TERMS_PREAMBLE.title}
              </h2>
              <p className="text-xs text-[#A9B2C3] leading-relaxed whitespace-pre-line">
                {BUYER_TERMS_PREAMBLE.text}
              </p>
            </div>

            {/* Sections Listing */}
            {filteredSections.map((section) => (
              <div key={section.id} className="space-y-2.5 border-b border-[#232B3A]/60 pb-5 last:border-b-0">
                <h4 className="font-extrabold text-white text-xs sm:text-sm flex items-start gap-2">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#E63946]/20 text-[#E63946] text-[11px] font-black shrink-0 mt-0.5 border border-[#E63946]/30">
                    {section.number}
                  </span>
                  <span>{section.title}</span>
                </h4>
                
                <div className="pl-7 space-y-2 text-xs text-[#A9B2C3] leading-relaxed whitespace-pre-line">
                  <p>{section.content}</p>

                  {section.points && section.points.length > 0 && (
                    <ul className="space-y-1.5 pt-1">
                      {section.points.map((pt, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#F4B400] shrink-0 mt-1.5" />
                          <span className="text-gray-200">{pt}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {section.subsections && section.subsections.length > 0 && (
                    <div className="space-y-2 pt-2">
                      {section.subsections.map((sub, idx) => (
                        <div key={idx} className="p-3 bg-[#111827]/70 rounded-xl border border-[#232B3A] space-y-1">
                          <div className="font-bold text-white text-xs flex items-center gap-1.5">
                            {sub.letter && (
                              <span className="text-[#E63946] font-mono font-black">{sub.letter}.</span>
                            )}
                            <span>{sub.label}</span>
                          </div>
                          <p className="text-gray-300 text-[11px] leading-relaxed">
                            {sub.text}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Support & Claims Box */}
            <div className="p-4 bg-[#141b2d] rounded-2xl border border-[#232B3A] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-white block">¿Reclamaciones, novedades con tu pedido o dudas?</span>
                <span className="text-[11px] text-gray-400">Canal de atención al usuario y centro de soporte RYYCO.</span>
              </div>
              <a
                href="https://wa.me/573219730865?text=Hola!%20Tengo%20una%20consulta%20o%20reclamación%20sobre%20los%20términos%20y%20condiciones%20de%20comprador%20en%20Ryyco"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#E63946]/20 hover:bg-[#E63946] text-[#E63946] hover:text-white border border-[#E63946]/40 rounded-xl text-xs font-bold transition whitespace-nowrap"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>Atención al Comprador</span>
              </a>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="px-6 py-4 bg-[#141b2d] border-t border-[#232B3A] flex items-center justify-between gap-3 shrink-0">
            <div className="text-[11px] text-gray-400 hidden sm:block">
              RYYCO / Rico Colombia • Estatuto del Consumidor (Ley 1480 de 2011)
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

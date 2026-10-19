import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Send, 
  MessageCircle, 
  Bike, 
  User, 
  Clock, 
  CheckCheck, 
  Phone, 
  Sparkles,
  MapPin,
  ShieldCheck
} from 'lucide-react';
import { OrderItem, OrderChatMessage, OrderChatSenderRole } from '../types';
import { 
  subscribeToOrderChat, 
  sendOrderChatMessage, 
  markOrderChatAsRead,
  playChatChime 
} from '../lib/orderChatService';

import { useOrderChatViewport } from '../hooks/useOrderChatViewport';

interface OrderChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: OrderItem;
  currentRole: 'driver' | 'customer';
  currentUserId?: string;
  currentUserName: string;
}

export default function OrderChatModal({
  isOpen,
  onClose,
  order,
  currentRole,
  currentUserId,
  currentUserName
}: OrderChatModalProps) {
  const [messages, setMessages] = useState<OrderChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const { shellRef, streamRef } = useOrderChatViewport(isOpen, order.id, messages);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const isDriver = currentRole === 'driver';
  const otherPartyTitle = isDriver ? 'Cliente' : 'Domiciliario RYYCO';
  const otherPartyName = isDriver 
    ? (order.customerName || 'Cliente') 
    : (order.deliveryDriverName || 'Domiciliario Asignado');
  const otherPartyPhone = isDriver ? order.customerPhone : order.deliveryDriverPhone;

  // Real-time chat messages listener
  useEffect(() => {
    if (!isOpen || !order?.id) return;

    // Mark unread as zero for this role
    markOrderChatAsRead(order.id, currentRole);

    let prevCount = 0;
    const unsubscribe = subscribeToOrderChat(order.id, (loadedMsgs) => {
      setMessages(loadedMsgs);
      // If a new incoming message from the other party arrives, play chime
      if (loadedMsgs.length > prevCount && prevCount > 0) {
        const lastMsg = loadedMsgs[loadedMsgs.length - 1];
        if (lastMsg.senderRole !== currentRole) {
          playChatChime(true);
        }
      }
      prevCount = loadedMsgs.length;
    });

    return () => {
      unsubscribe();
    };
  }, [isOpen, order?.id, currentRole]);

  // Prevent the browser from panning the entire page when opening the keyboard.
  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 250);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const textToSend = inputText.trim();
    if (!textToSend || isSending) return;

    setIsSending(true);
    setInputText('');

    const success = await sendOrderChatMessage({
      orderId: order.id,
      senderRole: currentRole,
      senderId: currentUserId || '',
      senderName: currentUserName,
      text: textToSend
    });

    if (!success) {
      // Restore input text if failed
      setInputText(textToSend);
    }

    setIsSending(false);
    inputRef.current?.focus({ preventScroll: true });
  };

  // Quick suggestion chips depending on whether user is driver or customer
  const driverSuggestions = [
    'Ya recogí tu pedido, voy en camino 🛵💨',
    'Ya estoy afuera de tu dirección 📍',
    '¿Podrías confirmar el color de tu casa o punto de referencia? 🏠',
    'Llego en 5 minutos aproximadamente ⏱️'
  ];

  const customerSuggestions = [
    '¡Hola! Estoy atento a la entrega 👋',
    'La casa es portón negro / timbre blanco 🏠',
    '¿Por dónde vienes aproximadamente? 🛵',
    'Por favor timbra fuerte o llámame al llegar 🔔'
  ];

  const activeSuggestions = isDriver ? driverSuggestions : customerSuggestions;

  if (!isOpen) return null;

  return (
    <div ref={shellRef} data-ryyco-managed-viewport="chat" className="fixed inset-0 overflow-hidden overscroll-none z-[120] bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn">
      <div 
        className="w-full max-w-lg bg-[#0F172A] border-t sm:border border-[#232F48] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col h-[90vh] sm:h-[650px] max-h-[92vh] overflow-hidden"
        style={{ maxHeight: 'min(92vh, 100%)', minHeight: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-[#111A2E] to-[#1E293B] border-b border-[#232F48] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm shrink-0 shadow-md ${
              isDriver 
                ? 'bg-[#E63946]/20 border border-[#E63946]/40 text-[#E63946]' 
                : 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400'
            }`}>
              {isDriver ? <User className="w-5 h-5" /> : <Bike className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                  {otherPartyTitle}
                </span>
                <span className="text-[10px] font-mono font-bold bg-[#E63946]/20 text-[#E63946] px-1.5 py-0.2 rounded">
                  #{order.orderNumber}
                </span>
              </div>
              <h3 className="text-sm font-black text-white truncate">
                {otherPartyName}
              </h3>
              <p className="text-[10px] text-gray-400 truncate flex items-center gap-1">
                <MapPin className="w-3 h-3 text-[#E63946] shrink-0" />
                <span>{order.customerAddress || 'Ipiales'}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {otherPartyPhone && (
              <a
                href={`tel:${otherPartyPhone}`}
                className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-gray-300 hover:text-white border border-slate-700 transition"
                title="Llamar"
              >
                <Phone className="w-4 h-4 text-emerald-400" />
              </a>
            )}
            <button
              onClick={onClose}
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-gray-400 hover:text-white border border-slate-700 transition cursor-pointer"
              title="Cerrar chat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Security badge info */}
        <div className="px-4 py-2 bg-gradient-to-r from-emerald-950/40 to-slate-900 border-b border-[#232F48] flex items-center justify-between text-[11px] text-gray-300 shrink-0">
          <div className="flex items-center gap-1.5 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Chat directo y seguro de la entrega</span>
          </div>
          <span className="text-[10px] text-gray-400 font-mono">
            {isDriver ? 'Tú: Domiciliario' : 'Tú: Cliente'}
          </span>
        </div>

        {/* Chat message stream */}
        <div ref={streamRef} style={{ overflowAnchor: 'none' }} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 space-y-3.5 bg-[#090E17]/60">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-400 gap-2.5">
              <div className="w-14 h-14 rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center text-[#E63946]">
                <MessageCircle className="w-7 h-7" />
              </div>
              <h4 className="text-sm font-bold text-white">Comienza la conversación</h4>
              <p className="text-xs text-gray-400 max-w-xs">
                Coordina la entrega, comparte puntos de referencia o avisa cuando estés en camino.
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              const isMine = msg.senderRole === currentRole;
              const formattedTime = msg.createdAt 
                ? new Date(msg.createdAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
                : '';

              return (
                <div 
                  key={msg.id}
                  className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} animate-fadeIn`}
                >
                  <div className="flex items-center gap-1 mb-1 px-1">
                    <span className="text-[10px] font-semibold text-gray-400">
                      {isMine ? 'Tú' : msg.senderName}
                    </span>
                    <span className="text-[9px] text-gray-500 font-mono">
                      • {formattedTime}
                    </span>
                  </div>

                  <div 
                    className={`max-w-[82%] sm:max-w-[75%] rounded-2xl px-4 py-2.5 shadow-md text-sm leading-relaxed ${
                      isMine 
                        ? 'bg-gradient-to-r from-[#D62839] to-[#E63946] text-white rounded-tr-none font-medium' 
                        : 'bg-[#1E293B] border border-[#2E3C54] text-gray-100 rounded-tl-none font-medium'
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Quick Suggestion Chips */}
        <div className="px-3 py-2 bg-[#0C1322] border-t border-[#1E293B] flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
          <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0 ml-1" />
          {activeSuggestions.map((sug, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setInputText(sug);
                inputRef.current?.focus({ preventScroll: true });
              }}
              className="text-[11px] whitespace-nowrap bg-slate-800/90 hover:bg-slate-700 text-gray-300 hover:text-white px-2.5 py-1 rounded-full border border-slate-700/80 transition cursor-pointer shrink-0"
            >
              {sug}
            </button>
          ))}
        </div>

        {/* Input box */}
        <form 
          onSubmit={handleSend}
          className="p-3 bg-[#111A2E] border-t border-[#232F48] flex items-center gap-2 shrink-0"
        >
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={`Escribe un mensaje para ${otherPartyName}...`}
            className="min-w-0 flex-1 bg-[#1E293B] border border-[#2E3C54] focus:border-[#E63946] focus:ring-1 focus:ring-[#E63946] text-white text-xs sm:text-sm rounded-xl px-4 py-3 outline-none placeholder-gray-400 transition"
          />
          <button
            type="submit"
            disabled={!inputText.trim() || isSending}
            className="p-3 bg-gradient-to-r from-[#D62839] to-[#E63946] hover:from-[#B51E2D] hover:to-[#D62839] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl shadow-lg transition active:scale-95 cursor-pointer shrink-0"
            title="Enviar mensaje"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Bot, 
  Sparkles, 
  X, 
  Send, 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX, 
  TrendingUp, 
  ShoppingBag, 
  Package, 
  Store, 
  RefreshCw,
  Clock,
  ArrowRight,
  DollarSign
} from 'lucide-react';
import { UserProfile, ProductItem, OrderItem } from '../types';

interface LinnkAdminVoiceAssistantProps {
  profile: UserProfile;
  products?: ProductItem[];
  orders?: OrderItem[];
  isOpen?: boolean;
  onClose?: () => void;
  onNavigateTab?: (tab: string) => void;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

export default function LinnkAdminVoiceAssistant({
  profile,
  products = [],
  orders = [],
  isOpen = false,
  onClose,
  onNavigateTab
}: LinnkAdminVoiceAssistantProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioMuted, setAudioMuted] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize welcoming message when opened
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const pendingCount = orders.filter(o => o.status === 'pending' || o.status === 'processing').length;
      const totalSales = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
      const isClosed = Boolean(profile.isClosed);

      const welcomeText = `¡Hola, ${profile.displayName}! Soy tu Asesor IA exclusivo para la gestión de tu restaurante. Tu tienda está actualmente ${isClosed ? '🔴 CERRADA' : '🟢 ABIERTA'}. Tienes ${pendingCount} pedido(s) pendientes y ventas acumuladas de ${totalSales.toLocaleString('es-CO')} pesos. ¿Qué información deseas consultar hoy?`;

      setMessages([
        {
          id: 'welcome-admin',
          sender: 'assistant',
          text: welcomeText,
          timestamp: new Date()
        }
      ]);
    }
  }, [isOpen, profile, orders]);

  // Scroll to bottom when messages update
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // Handle Speech Recognition setup (Web Speech API)
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.lang = 'es-CO';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript && transcript.trim()) {
          handleSendMessage(transcript.trim());
        }
        setIsListening(false);
      };

      recognition.onerror = (err: any) => {
        console.warn("Admin Speech recognition notice:", err);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
      }
    };
  }, [profile, products, orders]);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      try {
        if (currentAudioRef.current) {
          currentAudioRef.current.pause();
          setIsSpeaking(false);
        }
        recognitionRef.current?.start();
        setIsListening(true);
      } catch (err) {
        console.warn("Could not start speech recognition:", err);
        setIsListening(false);
      }
    }
  };

  const playVoiceResponse = async (textToSpeak: string) => {
    if (audioMuted) return;
    try {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }

      setIsSpeaking(true);

      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textToSpeak, voice: 'alloy' })
      });

      if (res.ok) {
        const audioBlob = await res.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        currentAudioRef.current = audio;
        audio.onended = () => {
          setIsSpeaking(false);
          URL.revokeObjectURL(audioUrl);
        };
        audio.onerror = () => {
          setIsSpeaking(false);
        };
        await audio.play();
      } else {
        // Fallback to browser synthesis
        if ('speechSynthesis' in window) {
          const utterance = new SpeechSynthesisUtterance(textToSpeak);
          utterance.lang = 'es-CO';
          utterance.rate = 1.05;
          utterance.onend = () => setIsSpeaking(false);
          utterance.onerror = () => setIsSpeaking(false);
          window.speechSynthesis.speak(utterance);
        } else {
          setIsSpeaking(false);
        }
      }
    } catch (err) {
      console.warn("TTS playback error:", err);
      setIsSpeaking(false);
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const messageText = (textToSend || inputText).trim();
    if (!messageText || isProcessing) return;

    setInputText('');
    const userMsgId = `user-${Date.now()}`;
    const newMessages: ChatMessage[] = [
      ...messages,
      { id: userMsgId, sender: 'user', text: messageText, timestamp: new Date() }
    ];
    setMessages(newMessages);
    setIsProcessing(true);

    // Build rich merchant context for the server
    const pendingOrders = orders.filter(o => o.status === 'pending' || o.status === 'processing');
    const completedOrders = orders.filter(o => o.status === 'delivered' || o.status === 'shipped');
    const totalSales = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

    const merchantContextPayload = {
      storeUid: profile.uid || '',
      storeName: profile.displayName || profile.username || 'Mi Restaurante',
      storeUsername: profile.username || '',
      isClosed: Boolean(profile.isClosed),
      scheduleEnabled: Boolean(profile.scheduleEnabled),
      openTime: profile.openTime || '',
      closeTime: profile.closeTime || '',
      phone: profile.phone || '',
      whatsapp: profile.whatsapp || '',
      address: profile.address || profile.location || '',
      activeProductsCount: products.filter(p => p.active !== false).length,
      totalProductsCount: products.length,
      totalOrdersCount: orders.length,
      pendingOrdersCount: pendingOrders.length,
      completedOrdersCount: completedOrders.length,
      totalSalesAmount: totalSales,
      recentStoreOrders: orders.slice(0, 10).map(o => ({
        id: o.id,
        orderNumber: o.orderNumber || 0,
        customerName: o.customerName || 'Cliente',
        customerPhone: o.customerPhone || '',
        customerAddress: o.customerAddress || '',
        totalAmount: o.totalAmount || 0,
        status: o.status,
        createdAt: o.createdAt ? new Date(o.createdAt).toLocaleDateString('es-CO') : 'Reciente',
        itemsSummary: (o.items || []).map(i => `${i.quantity}x ${i.name}`).join(', '),
        paymentMethod: o.paymentMethod || 'Efectivo'
      })),
      storeProducts: products.slice(0, 30).map(p => ({
        id: p.id,
        name: p.name,
        price: p.price,
        stock: p.stock,
        category: p.category,
        active: p.active !== false
      }))
    };

    const historyPayload = newMessages.slice(-6).map(m => ({
      role: m.sender === 'user' ? 'user' : 'model',
      parts: [{ text: m.text }]
    }));

    try {
      const response = await fetch('/api/voice-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageText,
          history: historyPayload,
          catalogContext: {
            role: 'merchant',
            merchantContext: merchantContextPayload,
            products: [],
            stores: [],
            deliveryFee: 7000,
            cart: []
          }
        })
      });

      const data = await response.json();
      const botResponse = data.text || data.speechText || 'He analizado la información de tu negocio.';
      const speechToPlay = data.speechText || botResponse;

      setMessages(prev => [
        ...prev,
        {
          id: `bot-${Date.now()}`,
          sender: 'assistant',
          text: botResponse,
          timestamp: new Date()
        }
      ]);

      playVoiceResponse(speechToPlay);
    } catch (err) {
      console.error("Error communicating with Admin AI Assistant:", err);
      const fallbackReply = `Disculpa, tuve un inconveniente temporal al consultar las métricas. Tu negocio cuenta actualmente con ${orders.length} pedidos y ${products.length} productos en menú.`;
      setMessages(prev => [
        ...prev,
        {
          id: `bot-fallback-${Date.now()}`,
          sender: 'assistant',
          text: fallbackReply,
          timestamp: new Date()
        }
      ]);
    } finally {
      setIsProcessing(false);
    }
  };

  const quickPrompts = [
    { label: '📊 Ventas y Resumen', text: '¿Cuánto he vendido en total y cuál es el resumen de ventas?' },
    { label: '📦 Pedidos Pendientes', text: '¿Cuáles pedidos tengo pendientes por despachar?' },
    { label: '🍔 Platos y Menú', text: '¿Cuántos productos tengo en el menú y cuáles están activos?' },
    { label: '🕒 Estado de mi Tienda', text: '¿Mi tienda está abierta o cerrada actualmente?' }
  ];

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="bg-[#0e131f] border border-indigo-500/30 rounded-3xl w-full max-w-2xl h-[90vh] max-h-[720px] flex flex-col shadow-2xl overflow-hidden relative"
        >
          {/* Header */}
          <div className="px-6 py-4 bg-gradient-to-r from-indigo-950/80 via-purple-950/40 to-[#0e131f] border-b border-indigo-500/20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-2xl relative">
                <Bot className="w-5 h-5" />
                {isSpeaking && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full animate-ping" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-extrabold text-white tracking-tight">IA Administrador</h2>
                  <span className="text-[9px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border border-indigo-500/30">
                    Negocio & Gestión
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 font-medium">
                  {profile.displayName || 'Mi Restaurante'} • Datos de ventas, pedidos y catálogo
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Audio mute toggle */}
              <button
                type="button"
                onClick={() => {
                  if (isSpeaking && currentAudioRef.current) {
                    currentAudioRef.current.pause();
                    setIsSpeaking(false);
                  }
                  setAudioMuted(!audioMuted);
                }}
                className={`p-2 rounded-xl border transition cursor-pointer ${
                  audioMuted 
                    ? 'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20' 
                    : 'bg-gray-900 border-gray-800 text-gray-300 hover:text-white'
                }`}
                title={audioMuted ? "Activar audio" : "Silenciar voz"}
              >
                {audioMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>

              {/* Close modal */}
              <button
                type="button"
                onClick={onClose}
                className="p-2 bg-gray-900 hover:bg-gray-800 border border-gray-800 text-gray-400 hover:text-white rounded-xl transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Quick Metrics Ribbon */}
          <div className="px-6 py-2.5 bg-black/40 border-b border-gray-800/80 flex items-center justify-between text-[11px] overflow-x-auto gap-4">
            <div className="flex items-center gap-1.5 text-gray-400 shrink-0">
              <Store className="w-3.5 h-3.5 text-emerald-400" />
              <span>Tienda:</span>
              <span className={`font-bold ${profile.isClosed ? 'text-red-400' : 'text-emerald-400'}`}>
                {profile.isClosed ? 'Cerrada' : 'Abierta'}
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-gray-400 shrink-0">
              <ShoppingBag className="w-3.5 h-3.5 text-amber-400" />
              <span>Pendientes:</span>
              <span className="font-bold text-white">
                {orders.filter(o => o.status === 'pending' || o.status === 'processing').length}
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-gray-400 shrink-0">
              <DollarSign className="w-3.5 h-3.5 text-indigo-400" />
              <span>Ventas:</span>
              <span className="font-bold text-indigo-300">
                {orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0).toLocaleString('es-CO')} pesos
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-gray-400 shrink-0">
              <Package className="w-3.5 h-3.5 text-purple-400" />
              <span>Productos:</span>
              <span className="font-bold text-white">{products.length}</span>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.sender === 'assistant' && (
                  <div className="w-8 h-8 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-300 shrink-0 mt-0.5">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-xs sm:text-[13px] leading-relaxed ${
                    msg.sender === 'user'
                      ? 'bg-indigo-600 text-white font-medium shadow-md'
                      : 'bg-[#151b2c] text-gray-200 border border-gray-800 shadow-sm'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                  <span className={`text-[9px] block mt-1.5 opacity-60 ${msg.sender === 'user' ? 'text-right' : 'text-left'}`}>
                    {msg.timestamp.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </motion.div>
            ))}

            {isProcessing && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex gap-3 justify-start items-center"
              >
                <div className="w-8 h-8 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-300 shrink-0">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="bg-[#151b2c] border border-indigo-500/20 rounded-2xl px-4 py-2.5 text-xs text-indigo-300 flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 animate-spin" />
                  <span>Pensando...</span>
                </div>
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Prompts */}
          <div className="px-4 py-2 bg-[#090c14] border-t border-gray-800/80 flex items-center gap-2 overflow-x-auto no-scrollbar">
            {quickPrompts.map((q, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSendMessage(q.text)}
                disabled={isProcessing}
                className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 border border-gray-800 rounded-xl text-[11px] font-semibold text-gray-300 hover:text-white whitespace-nowrap transition cursor-pointer disabled:opacity-50 shrink-0"
              >
                {q.label}
              </button>
            ))}
          </div>

          {/* Input Box */}
          <div className="p-4 bg-[#090c14] border-t border-gray-800">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center gap-2"
            >
              <div className="relative flex-1">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Pregúntale a la IA sobre pedidos, ventas, productos..."
                  disabled={isProcessing}
                  className="w-full h-11 bg-gray-900/90 border border-gray-800 focus:border-indigo-500 px-4 rounded-xl text-xs sm:text-sm text-white placeholder-gray-500 outline-none transition pr-10"
                />
              </div>

              {/* Voice recognition button */}
              <button
                type="button"
                onClick={toggleListening}
                className={`w-11 h-11 rounded-xl flex items-center justify-center transition border cursor-pointer shrink-0 ${
                  isListening
                    ? 'bg-red-500 border-red-400 text-white animate-pulse shadow-lg shadow-red-500/30'
                    : 'bg-gray-900 hover:bg-gray-800 border-gray-800 text-gray-300 hover:text-white'
                }`}
                title={isListening ? 'Escuchando... clic para parar' : 'Hablar por micrófono'}
              >
                {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>

              {/* Send Button */}
              <button
                type="submit"
                disabled={!inputText.trim() || isProcessing}
                className="w-11 h-11 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white rounded-xl flex items-center justify-center transition cursor-pointer shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

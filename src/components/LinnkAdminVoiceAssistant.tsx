/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Clock, 
  DollarSign,
  Award,
  AlertTriangle,
  Users,
  Lightbulb,
  PieChart,
  RotateCcw
} from 'lucide-react';
import { UserProfile, ProductItem, OrderItem } from '../types';
import { smartApiFetch } from '../lib/apiConfig';

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

  // Business Analytics Computation for the Entrepreneur
  const businessMetrics = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    const pendingOrders = orders.filter(o => o.status === 'pending' || o.status === 'processing');
    const completedOrders = orders.filter(o => o.status === 'delivered' || o.status === 'shipped');
    const cancelledOrders = orders.filter(o => o.status === 'cancelled');

    // Total sales (excluding cancelled orders)
    const totalSales = orders.reduce((sum, o) => sum + (o.status !== 'cancelled' ? (o.totalAmount || 0) : 0), 0);

    // Today sales
    const todayOrders = orders.filter(o => o.createdAt && o.createdAt.startsWith(todayStr) && o.status !== 'cancelled');
    const todaySales = todayOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

    // Ticket promedio (AOV)
    const validOrdersCount = orders.filter(o => o.status !== 'cancelled').length;
    const averageTicket = validOrdersCount > 0 ? Math.round(totalSales / validOrdersCount) : 0;

    // Top selling items aggregation
    const itemSalesMap: Record<string, { quantity: number; revenue: number }> = {};
    orders.forEach(o => {
      if (o.status !== 'cancelled' && Array.isArray(o.items)) {
        o.items.forEach(it => {
          const name = it.name || 'Producto';
          if (!itemSalesMap[name]) itemSalesMap[name] = { quantity: 0, revenue: 0 };
          itemSalesMap[name].quantity += (it.quantity || 1);
          itemSalesMap[name].revenue += ((it.price || 0) * (it.quantity || 1));
        });
      }
    });

    const topSellingItems = Object.entries(itemSalesMap)
      .map(([name, val]) => ({ name, ...val }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    // Low stock items alerts (stock <= 5)
    const lowStockItems = products
      .filter(p => typeof p.stock === 'number' && p.stock <= 5)
      .map(p => ({ name: p.name, stock: p.stock, price: p.price }));

    // Operational times calculation (preparation and total delivery)
    const prepOrders = orders.filter(o => typeof o.processingDuration === 'number' && o.processingDuration > 0);
    const avgPrepMinutes = prepOrders.length > 0
      ? Math.round(prepOrders.reduce((acc, o) => acc + (o.processingDuration || 0), 0) / prepOrders.length / 60)
      : 0;

    const deliveryOrders = orders.filter(o => typeof o.totalDuration === 'number' && o.totalDuration > 0);
    const avgDeliveryMinutes = deliveryOrders.length > 0
      ? Math.round(deliveryOrders.reduce((acc, o) => acc + (o.totalDuration || 0), 0) / deliveryOrders.length / 60)
      : 0;

    // Customer retention & loyalty
    const customerMap: Record<string, number> = {};
    orders.forEach(o => {
      let rawPhone = (o.customerPhone || '').replace(/\D/g, '').replace(/^0+/, '');
      if (rawPhone.length === 12 && rawPhone.startsWith('57')) rawPhone = rawPhone.slice(2);
      else if (rawPhone.length > 10 && rawPhone.startsWith('573')) rawPhone = rawPhone.slice(2);
      const key = (rawPhone && rawPhone.length >= 7) ? rawPhone : (o.customerName || '').toLowerCase().trim();
      if (key) customerMap[key] = (customerMap[key] || 0) + 1;
    });
    const uniqueCustomersCount = Object.keys(customerMap).length;
    const repeatCount = Object.values(customerMap).filter(c => c > 1).length;
    const repeatCustomerRate = uniqueCustomersCount > 0 ? Math.round((repeatCount / uniqueCustomersCount) * 100) : 0;

    // Peak hours analysis
    let lunchOrders = 0;
    let dinnerOrders = 0;
    let otherOrders = 0;
    orders.forEach(o => {
      if (o.createdAt) {
        const hour = new Date(o.createdAt).getHours();
        if (hour >= 11 && hour <= 15) lunchOrders++;
        else if (hour >= 18 && hour <= 23) dinnerOrders++;
        else otherOrders++;
      }
    });
    const peakHoursSummary = `Almuerzo (${lunchOrders} pedidos), Cena (${dinnerOrders} pedidos), Tarde (${otherOrders} pedidos)`;

    // Payment methods breakdown
    let cashOrders = 0;
    let digitalOrders = 0;
    orders.forEach(o => {
      if (o.paymentMethod === 'delivery_cash' || o.paymentMethod === 'cod') cashOrders++;
      else digitalOrders++;
    });
    const totalPayments = cashOrders + digitalOrders;
    const paymentMethodsSummary = totalPayments > 0
      ? `${Math.round((cashOrders / totalPayments) * 100)}% Efectivo contra entrega, ${Math.round((digitalOrders / totalPayments) * 100)}% Transferencia/Digital`
      : 'Efectivo / Transferencia';

    // Cancellation reasons
    const cancellationReasons = orders
      .filter(o => o.status === 'cancelled' && o.cancellationReason)
      .map(o => o.cancellationReason as string);

    return {
      pendingOrders,
      completedOrders,
      cancelledOrders,
      totalSales,
      todaySales,
      averageTicket,
      topSellingItems,
      lowStockItems,
      avgPrepMinutes,
      avgDeliveryMinutes,
      uniqueCustomersCount,
      repeatCustomerRate,
      peakHoursSummary,
      paymentMethodsSummary,
      cancellationReasons
    };
  }, [orders, products]);

  // Welcome message tailored for the business owner
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const isClosed = Boolean(profile.isClosed);
      const prepText = businessMetrics.avgPrepMinutes > 0 ? `${businessMetrics.avgPrepMinutes} minutos` : 'medición activa';
      const welcomeText = `¡Hola, ${profile.displayName || 'Empresario'}! Soy tu Asesor IA Empresarial exclusivo para el vendedor.
Tu negocio está actualmente ${isClosed ? '🔴 CERRADO' : '🟢 ABIERTO'}.
Hoy registras ${businessMetrics.todaySales.toLocaleString('es-CO')} pesos en ventas y un ticket promedio de ${businessMetrics.averageTicket.toLocaleString('es-CO')} pesos. Tienes ${businessMetrics.pendingOrders.length} pedido(s) en curso y tu cocina tiene un tiempo promedio de preparación de ${prepText}.
¿Qué métricas o estrategias deseas consultar hoy?`;

      setMessages([
        {
          id: 'welcome-entrepreneur',
          sender: 'assistant',
          text: welcomeText,
          timestamp: new Date()
        }
      ]);
    }
  }, [isOpen, profile, businessMetrics, messages.length]);

  // Scroll to bottom when messages update
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // Speech Recognition setup (Web Speech API)
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
        console.warn("Entrepreneur Speech recognition notice:", err);
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

      const res = await smartApiFetch('/api/tts', {
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

    // Comprehensive Merchant Admin Context for the AI Server
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
      pendingOrdersCount: businessMetrics.pendingOrders.length,
      completedOrdersCount: businessMetrics.completedOrders.length,
      cancelledOrdersCount: businessMetrics.cancelledOrders.length,
      totalSalesAmount: businessMetrics.totalSales,
      todaySalesAmount: businessMetrics.todaySales,
      averageTicket: businessMetrics.averageTicket,
      topSellingItems: businessMetrics.topSellingItems,
      lowStockItems: businessMetrics.lowStockItems,
      averagePrepTimeMinutes: businessMetrics.avgPrepMinutes,
      averageDeliveryTimeMinutes: businessMetrics.avgDeliveryMinutes,
      cancellationReasons: businessMetrics.cancellationReasons,
      repeatCustomerRate: businessMetrics.repeatCustomerRate,
      uniqueCustomersCount: businessMetrics.uniqueCustomersCount,
      peakHoursSummary: businessMetrics.peakHoursSummary,
      paymentMethodsSummary: businessMetrics.paymentMethodsSummary,
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
      const response = await smartApiFetch('/api/voice-assistant', {
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
      const botResponse = data.text || data.speechText || 'He analizado las métricas de tu negocio.';
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
      console.error("Error communicating with Entrepreneur AI Assistant:", err);
      const fallbackReply = `Disculpa, tuve un inconveniente de conexión. Tu negocio registra ventas acumuladas de ${businessMetrics.totalSales.toLocaleString('es-CO')} pesos, ${businessMetrics.pendingOrders.length} pedido(s) en curso y un ticket promedio de ${businessMetrics.averageTicket.toLocaleString('es-CO')} pesos.`;
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

  // Quick action prompts designed for the Entrepreneur / Store Owner
  const quickPrompts = [
    { label: '📊 Diagnóstico Financiero', icon: TrendingUp, text: '¿Cuál es mi balance de ventas totales, ventas de hoy y ticket promedio?' },
    { label: '🏆 Platos Más Vendidos', icon: Award, text: '¿Cuáles son mis productos estrella más vendidos y cuáles no se venden?' },
    { label: '⏱️ Tiempos de Cocina', icon: Clock, text: '¿Cómo van los tiempos promedio de preparación en cocina y entrega de pedidos?' },
    { label: '⚠️ Alertas de Stock', icon: AlertTriangle, text: '¿Cuáles productos están con stock crítico o agotados en el inventario?' },
    { label: '👥 Clientes y Retención', icon: Users, text: '¿Cuál es mi tasa de recompra de clientes y en qué horas hay mayor demanda?' },
    { label: '💡 Estrategias de Venta', icon: Lightbulb, text: 'Dame 3 estrategias concretas para subir mi ticket promedio y facturación esta semana.' }
  ];

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="bg-[#0b0f19] border border-indigo-500/30 rounded-3xl w-full max-w-2xl h-[92vh] max-h-[760px] flex flex-col shadow-2xl overflow-hidden relative"
        >
          {/* Header with Entrepreneur Identity */}
          <div className="px-5 py-3.5 bg-gradient-to-r from-indigo-950/90 via-purple-950/50 to-[#0b0f19] border-b border-indigo-500/20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 rounded-2xl relative shadow-md shadow-indigo-900/40">
                <Bot className="w-5 h-5 text-indigo-400" />
                {isSpeaking && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full animate-ping" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-extrabold text-white tracking-tight">Asesor IA Empresarial</h2>
                  <span className="text-[9px] bg-gradient-to-r from-indigo-500/30 to-purple-500/30 text-indigo-200 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border border-indigo-500/40">
                    Solo Vendedor
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 font-medium">
                  {profile.displayName || 'Mi Restaurante'} • Datos de ventas, ticket promedio, cocina e inventario
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Reset Conversation */}
              <button
                type="button"
                onClick={() => setMessages([])}
                className="p-2 bg-gray-900/80 hover:bg-gray-800 border border-gray-800 text-gray-400 hover:text-white rounded-xl transition cursor-pointer"
                title="Reiniciar conversación"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

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
                    : 'bg-gray-900/80 border-gray-800 text-gray-300 hover:text-white'
                }`}
                title={audioMuted ? "Activar audio" : "Silenciar voz"}
              >
                {audioMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>

              {/* Close modal */}
              <button
                type="button"
                onClick={onClose}
                className="p-2 bg-gray-900/80 hover:bg-gray-800 border border-gray-800 text-gray-400 hover:text-white rounded-xl transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Entrepreneur Executive Metrics Ribbon */}
          <div className="px-4 py-2.5 bg-black/50 border-b border-gray-800/80 flex items-center justify-between text-[11px] overflow-x-auto gap-3 no-scrollbar">
            {/* Sales */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-gray-900/70 border border-gray-800/80 text-gray-400 shrink-0">
              <DollarSign className="w-3.5 h-3.5 text-indigo-400" />
              <span>Ventas:</span>
              <span className="font-bold text-indigo-300">
                {businessMetrics.totalSales.toLocaleString('es-CO')}
              </span>
            </div>

            {/* Ticket Promedio */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-gray-900/70 border border-gray-800/80 text-gray-400 shrink-0">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              <span>Ticket Prom:</span>
              <span className="font-bold text-emerald-300">
                {businessMetrics.averageTicket.toLocaleString('es-CO')}
              </span>
            </div>

            {/* Cocina Prep Time */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-gray-900/70 border border-gray-800/80 text-gray-400 shrink-0">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>Cocina:</span>
              <span className="font-bold text-amber-300">
                {businessMetrics.avgPrepMinutes > 0 ? `${businessMetrics.avgPrepMinutes}m` : 'En cola'}
              </span>
            </div>

            {/* Pending Orders */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-gray-900/70 border border-gray-800/80 text-gray-400 shrink-0">
              <ShoppingBag className="w-3.5 h-3.5 text-purple-400" />
              <span>Pendientes:</span>
              <span className="font-bold text-white">
                {businessMetrics.pendingOrders.length}
              </span>
            </div>

            {/* Low stock alert */}
            {businessMetrics.lowStockItems.length > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-red-950/40 border border-red-500/30 text-red-300 shrink-0">
                <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                <span>Stock bajo:</span>
                <span className="font-bold text-red-200">
                  {businessMetrics.lowStockItems.length}
                </span>
              </div>
            )}

            {/* Repeat customer rate */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-gray-900/70 border border-gray-800/80 text-gray-400 shrink-0">
              <Users className="w-3.5 h-3.5 text-cyan-400" />
              <span>Recompra:</span>
              <span className="font-bold text-cyan-300">
                {businessMetrics.repeatCustomerRate}%
              </span>
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
                  className={`max-w-[88%] sm:max-w-[80%] rounded-2xl px-4 py-3 text-xs sm:text-[13px] leading-relaxed ${
                    msg.sender === 'user'
                      ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white font-medium shadow-md shadow-indigo-900/30'
                      : 'bg-[#131929] text-gray-200 border border-indigo-500/10 shadow-sm'
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
                <div className="bg-[#131929] border border-indigo-500/20 rounded-2xl px-4 py-2.5 text-xs text-indigo-300 flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 animate-spin" />
                  <span>Analizando datos de tu negocio...</span>
                </div>
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Action Prompts for the Entrepreneur */}
          <div className="px-4 py-2.5 bg-[#080b12] border-t border-gray-800/80 flex items-center gap-2 overflow-x-auto no-scrollbar">
            {quickPrompts.map((q, idx) => {
              const IconComp = q.icon;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSendMessage(q.text)}
                  disabled={isProcessing}
                  className="px-3 py-1.5 bg-gray-900/90 hover:bg-gray-800 border border-gray-800/80 hover:border-indigo-500/40 rounded-xl text-[11px] font-semibold text-gray-300 hover:text-white whitespace-nowrap transition cursor-pointer disabled:opacity-50 shrink-0 flex items-center gap-1.5"
                >
                  <IconComp className="w-3.5 h-3.5 text-indigo-400" />
                  <span>{q.label}</span>
                </button>
              );
            })}
          </div>

          {/* Input Box with Voice & Send Controls */}
          <div className="p-3.5 sm:p-4 bg-[#080b12] border-t border-gray-800">
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
                  placeholder="Pregúntale a tu Asesor IA sobre ventas, ticket promedio, cocina..."
                  disabled={isProcessing}
                  className="w-full h-11 bg-gray-900/90 border border-gray-800 focus:border-indigo-500 px-4 rounded-xl text-xs sm:text-sm text-white placeholder-gray-500 outline-none transition"
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
                className="w-11 h-11 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white rounded-xl flex items-center justify-center transition cursor-pointer shrink-0 shadow-md shadow-indigo-900/30"
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

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
import { auth } from '../lib/firebase';
import type { AdvisorMetrics } from '../../server/merchantAdvisorCore';

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
  const audioUrlRef = useRef<string | null>(null);
  const playbackGeneration = useRef(0);

  const [serverMetrics, setServerMetrics] = useState<AdvisorMetrics | null>(null);
  const [metricsError, setMetricsError] = useState('');
  const requestRef = useRef<AbortController | null>(null);
  const summaryRef = useRef<AbortController | null>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const sendRef = useRef<(text: string) => void>(() => {});
  const scopeRef = useRef(profile.uid);
  const businessMetrics = {
    totalSales: serverMetrics?.totalSales,
    averageTicket: serverMetrics?.averageTicket,
    avgPrepMinutes: serverMetrics?.averagePrepMinutes,
    pendingCount: serverMetrics?.pendingCount,
    lowStockItems: serverMetrics?.lowStock || [],
    repeatCustomerRate: serverMetrics?.repeatCustomerRate,
  };
  const welcome = () => `¡Hola! Soy tu asesor empresarial de RYYCO para ${profile.displayName || profile.username || 'tu restaurante'}. Estoy aquí para ayudarte a analizar las ventas, conocer el rendimiento de tus productos y encontrar oportunidades para hacer crecer tu restaurante. ¿Qué te gustaría analizar hoy?`;
  const stopResources = () => {
    playbackGeneration.current += 1;
    requestRef.current?.abort(); requestRef.current = null;
    recognitionRef.current?.abort(); currentAudioRef.current?.pause();
    if (audioUrlRef.current) { URL.revokeObjectURL(audioUrlRef.current); audioUrlRef.current = null; }
    window.speechSynthesis?.cancel();
    setIsProcessing(false); setIsListening(false); setIsSpeaking(false);
  };
  const requestAdvisor = async (message: string, history: ChatMessage[], controller: AbortController) => {
    const user = auth.currentUser;
    if (!user || user.uid !== profile.uid) throw new Error('Inicia sesión con la cuenta propietaria de este restaurante para consultar sus datos.');
    const token = await user.getIdToken();
    const response = await smartApiFetch('/api/merchant-advisor.php', {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message, storeUid: profile.uid, history: history.filter(m => m.id !== 'welcome-entrepreneur').slice(-8).map(m => ({ role: m.sender, text: m.text })) }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudieron verificar los datos del restaurante.');
    if (data.scope !== 'merchant' || data.source !== 'firestore' || !data.metrics || typeof data.text !== 'string') throw new Error('El servicio empresarial no está disponible. Reintenta.');
    return data;
  };
  useEffect(() => {
    if (scopeRef.current !== profile.uid) {
      scopeRef.current = profile.uid; setMessages([]); messagesRef.current = [];
      setInputText(''); setServerMetrics(null);
    }
    if (!isOpen) return;
    if (!messagesRef.current.length) setMessages([{ id: 'welcome-entrepreneur', sender: 'assistant', text: welcome(), timestamp: new Date() }]);
    const controller = new AbortController();
    summaryRef.current = controller;
    setMetricsError(''); setServerMetrics(null);
    requestAdvisor('__summary__', [], controller).then(data => {
      if (!controller.signal.aborted) setServerMetrics(data.metrics);
    }).catch(error => { if (!controller.signal.aborted) setMetricsError(error.message || 'No se pudieron verificar los indicadores.'); });
    return () => { controller.abort(); stopResources(); };
  }, [isOpen, profile.uid]);

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
          sendRef.current(transcript.trim());
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
  }, []);

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
    const generation = ++playbackGeneration.current;

    try {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
      if (audioUrlRef.current) { URL.revokeObjectURL(audioUrlRef.current); audioUrlRef.current = null; }

      setIsSpeaking(true);

      const res = await smartApiFetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textToSpeak, voice: 'alloy' })
      });
      if (generation !== playbackGeneration.current) return;

      if (res.ok) {
        const audioBlob = await res.blob();
        if (generation !== playbackGeneration.current) return;
        const audioUrl = URL.createObjectURL(audioBlob);
        audioUrlRef.current = audioUrl;
        const audio = new Audio(audioUrl);
        currentAudioRef.current = audio;
        audio.onended = () => {
          setIsSpeaking(false);
          URL.revokeObjectURL(audioUrl);
        };
        audio.onerror = () => {
          setIsSpeaking(false);
          URL.revokeObjectURL(audioUrl);
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
    if (!messageText || requestRef.current || !isOpen) return;
    summaryRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const history = messagesRef.current;
    setInputText(''); setIsProcessing(true); setMetricsError('');
    setMessages([...history, { id: `user-${Date.now()}`, sender: 'user', text: messageText, timestamp: new Date() }]);
    try {
      const data = await requestAdvisor(messageText, history, controller);
      if (controller.signal.aborted) return;
      setServerMetrics(data.metrics);
      setMessages(prev => [...prev, { id: `bot-${Date.now()}`, sender: 'assistant', text: data.text, timestamp: new Date() }]);
      playVoiceResponse(data.speechText || data.text);
    } catch (error) {
      if (controller.signal.aborted) return;
      setServerMetrics(null);
      const text = error instanceof Error ? error.message : 'No pude consultar Firebase. Reintenta tu pregunta; no mostraré cifras sin verificar.';
      setMetricsError(text);
      setMessages(prev => [...prev, { id: `error-${Date.now()}`, sender: 'assistant', text, timestamp: new Date() }]);
    } finally {
      if (requestRef.current === controller) { requestRef.current = null; setIsProcessing(false); }
    }
  };
  sendRef.current = text => { void handleSendMessage(text); };

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
                onClick={() => { stopResources(); setMessages([{ id: 'welcome-entrepreneur', sender: 'assistant', text: welcome(), timestamp: new Date() }]); }}
                className="p-2 bg-gray-900/80 hover:bg-gray-800 border border-gray-800 text-gray-400 hover:text-white rounded-xl transition cursor-pointer"
                title="Reiniciar conversación"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              {/* Audio mute toggle */}
              <button
                type="button"
                onClick={() => {
                  playbackGeneration.current += 1;
                  window.speechSynthesis?.cancel();
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
                {businessMetrics.totalSales?.toLocaleString('es-CO') ?? '—'}
              </span>
            </div>

            {/* Ticket Promedio */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-gray-900/70 border border-gray-800/80 text-gray-400 shrink-0">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              <span>Ticket Prom:</span>
              <span className="font-bold text-emerald-300">
                {businessMetrics.averageTicket?.toLocaleString('es-CO', { maximumFractionDigits: 0 }) ?? '—'}
              </span>
            </div>

            {/* Cocina Prep Time */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-gray-900/70 border border-gray-800/80 text-gray-400 shrink-0">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>Cocina:</span>
              <span className="font-bold text-amber-300">
                {businessMetrics.avgPrepMinutes != null ? `${businessMetrics.avgPrepMinutes.toFixed(1)}m` : 'Sin datos'}
              </span>
            </div>

            {/* Pending Orders */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-gray-900/70 border border-gray-800/80 text-gray-400 shrink-0">
              <ShoppingBag className="w-3.5 h-3.5 text-purple-400" />
              <span>Pendientes:</span>
              <span className="font-bold text-white">
                {businessMetrics.pendingCount ?? '—'}
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
                {businessMetrics.repeatCustomerRate != null ? `${businessMetrics.repeatCustomerRate.toFixed(1)}%` : '—'}
              </span>
            </div>
          </div>

          {metricsError && <p role="alert" className="px-5 py-2 text-xs text-amber-300">{metricsError}</p>}

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

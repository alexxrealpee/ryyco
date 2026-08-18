/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ChefCapSparkIcon from './ChefCapSparkIcon';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Sparkles,
  ShoppingBag,
  Store,
  X,
  Send,
  CheckCircle2,
  Clock,
  Truck,
  Plus,
  Minus,
  Trash2,
  MapPin,
  Phone,
  ArrowRight,
  RefreshCw,
  Bot,
  AlertCircle,
  MessageSquare,
  PhoneCall,
  PhoneOff,
  Radio,
  ChevronDown,
  AudioWaveform,
  AudioLines,
  Check,
  Loader2,
  ChefHat,
  BookOpen,
  Star,
  ConciergeBell
} from 'lucide-react';
import { ProductItem, UserProfile, OrderItem } from '../types';
import { 
  fetchAllActiveProductsAndStores, 
  fetchSystemSettings, 
  saveOrder, 
  checkIsStoreClosed,
  findStoreForProduct,
  DEFAULT_PLATFORM_PRODUCTS, 
  DEFAULT_PLATFORM_STORES 
} from '../lib/firebase';
import { 
  getStoredCart, 
  addProductToCart, 
  updateCartQuantity, 
  removeProductFromCart, 
  clearAllCart, 
  calculateCartSummary, 
  GeneralCartItem, 
  CART_UPDATED_EVENT 
} from '../lib/cartHelper';
import { RealtimeMeseroManager } from '../lib/realtimeMeseroAgent';

interface LinnkProVoiceAssistantProps {
  onNavigateToStore?: (username: string) => void;
  onNavigateToTienda?: () => void;
  activeUsername?: string | null;
}

type AssistantVoiceState = 'idle' | 'listening' | 'processing' | 'speaking';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: Date;
  actionPayload?: {
    type: 'PRODUCTS_SEARCHED' | 'CART_SUMMARY' | 'ORDER_CONFIRMATION_REQUESTED' | 'ORDER_CREATE_CONFIRMED' | 'ORDER_STATUS_RESULT' | 'RESTAURANT_MENU';
    data: any;
  };
}

export default function LinnkProVoiceAssistant({
  onNavigateToStore,
  onNavigateToTienda,
  activeUsername
}: LinnkProVoiceAssistantProps) {
  // Modal and real-time call states
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showFloatingTooltip, setShowFloatingTooltip] = useState(true);
  const [isInVoiceCall, setIsInVoiceCall] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'call'>('chat');
  const [callDuration, setCallDuration] = useState(0);

  // Assistant states
  const [assistantState, setAssistantState] = useState<AssistantVoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [inputText, setInputText] = useState('');
  const [isVoiceMuted, setIsVoiceMuted] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [micAudioLevel, setMicAudioLevel] = useState(0);

  // Chat stream messages with exact wording from design image
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: '¡Hola! Soy tu mesero IA 👋\n¿En qué puedo ayudarte hoy?',
      timestamp: new Date()
    }
  ]);

  // Catalog and system data cache with instant preloaded defaults
  const [catalogProducts, setCatalogProducts] = useState<ProductItem[]>(DEFAULT_PLATFORM_PRODUCTS);
  const [catalogStores, setCatalogStores] = useState<Record<string, UserProfile>>(DEFAULT_PLATFORM_STORES);
  const [systemDeliveryFee, setSystemDeliveryFee] = useState<number>(4000);
  const [cart, setCart] = useState<GeneralCartItem[]>(getStoredCart());
  const [isOrdering, setIsOrdering] = useState(false);
  const [micPermissionError, setMicPermissionError] = useState<string | null>(null);

  // Audio & Realtime WebRTC refs
  const currentAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Real-time conversation loop & VAD refs
  const isInVoiceCallRef = useRef<boolean>(false);
  const assistantStateRef = useRef<AssistantVoiceState>('idle');
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const latestTranscriptRef = useRef<string>('');
  const isSpeakingRef = useRef<boolean>(false);
  const isMicMutedRef = useRef<boolean>(false);
  const realtimeManagerRef = useRef<RealtimeMeseroManager | null>(null);

  // Helper to detect mobile device
  const isMobile = typeof navigator !== 'undefined' && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  // Synchronize refs with state for asynchronous event handlers
  useEffect(() => {
    isInVoiceCallRef.current = isInVoiceCall;
  }, [isInVoiceCall]);

  useEffect(() => {
    assistantStateRef.current = assistantState;
  }, [assistantState]);

  useEffect(() => {
    isMicMutedRef.current = isMicMuted;
  }, [isMicMuted]);

  // Automatically end voice call when user switches to chat mode
  useEffect(() => {
    if (activeTab === 'chat' && isInVoiceCallRef.current) {
      endVoiceCall();
    }
  }, [activeTab]);

  // 1. Sync Cart across events
  useEffect(() => {
    const handleCartUpdate = (e: any) => {
      if (e?.detail?.cart) {
        setCart(e.detail.cart);
      } else {
        setCart(getStoredCart());
      }
    };

    window.addEventListener(CART_UPDATED_EVENT, handleCartUpdate);
    return () => {
      window.removeEventListener(CART_UPDATED_EVENT, handleCartUpdate);
    };
  }, []);

  // 2. Fetch Catalog Context & Delivery Fee
  const loadCatalogData = async () => {
    try {
      const [catalogData, settings] = await Promise.all([
        fetchAllActiveProductsAndStores(),
        fetchSystemSettings().catch(() => ({ defaultDeliveryFee: 4000 }))
      ]);

      if (catalogData && catalogData.products) {
        const profiles = catalogData.profiles || {};
        let onlyOpenProducts = catalogData.products.filter(p => {
          if (p.active === false) return false;
          const store = findStoreForProduct(p, profiles);
          if (store) {
            return !checkIsStoreClosed(store) && !store.suspended;
          }
          return true;
        });

        // Fallback: if all products were filtered out, keep all active products
        if (onlyOpenProducts.length === 0 && catalogData.products.length > 0) {
          onlyOpenProducts = catalogData.products.filter(p => p.active !== false);
        }

        setCatalogProducts(onlyOpenProducts);
        setCatalogStores(profiles);
      }
      if (settings && typeof settings.defaultDeliveryFee === 'number') {
        setSystemDeliveryFee(settings.defaultDeliveryFee);
      }
    } catch (e) {
      console.warn("Could not pre-fetch full catalog for voice assistant:", e);
    }
  };

  useEffect(() => {
    loadCatalogData();
  }, []);

  // 3. Call Duration Timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isInVoiceCall) {
      interval = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => clearInterval(interval);
  }, [isInVoiceCall]);

  // 4. Scroll to bottom of chat
  useEffect(() => {
    if (isOpen && activeTab === 'chat') {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [messages, isOpen, activeTab]);

  // 5. Initialize Web Audio Visualizer (Dynamic Pulse Simulation without blocking hardware mic)
  const initAudioAnalyser = () => {
    let t = 0;
    const updateLevel = () => {
      if (isInVoiceCallRef.current) {
        t += 0.08;
        if (assistantStateRef.current === 'listening') {
          // Dynamic organic pulse while listening
          const level = Math.sin(t * 2) * 0.25 + 0.35 + (latestTranscriptRef.current ? 0.3 : 0);
          setMicAudioLevel(Math.max(0.1, Math.min(1, level)));
        } else if (assistantStateRef.current === 'speaking') {
          // High energetic rhythmic pulse while speaking
          const level = Math.abs(Math.sin(t * 4)) * 0.6 + 0.4;
          setMicAudioLevel(Math.min(1, level));
        } else {
          setMicAudioLevel(0.05);
        }
        animFrameRef.current = requestAnimationFrame(updateLevel);
      }
    };
    animFrameRef.current = requestAnimationFrame(updateLevel);
  };

  const stopAudioAnalyser = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setMicAudioLevel(0);
  };

  // 6. Stop any active TTS audio playback (Supports Interruption / Barge-in)
  const stopAudioPlayback = () => {
    isSpeakingRef.current = false;
    if (currentAudioSourceRef.current) {
      try {
        currentAudioSourceRef.current.stop();
        currentAudioSourceRef.current.disconnect();
      } catch (e) {}
      currentAudioSourceRef.current = null;
    }
  };

  // 7. Start & End Real-Time Voice Call Session (100% Continuous Hands-Free WebRTC)
  const startVoiceCall = async () => {
    setIsOpen(true);
    setIsInVoiceCall(true);
    isInVoiceCallRef.current = true;
    setActiveTab('call');
    setTranscript('');
    latestTranscriptRef.current = '';
    setAssistantState('listening');
    setMicPermissionError(null);

    // Warm up AudioContext synchronously on user gesture (Crucial for mobile browsers)
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioCtxClass();
      }
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().catch(() => {});
      }
    } catch (e) {}

    stopAudioPlayback();
    initAudioAnalyser();

    // Start OpenAI Realtime WebRTC continuous voice session
    try {
      if (realtimeManagerRef.current) {
        try {
          realtimeManagerRef.current.stop();
        } catch (e) {}
        realtimeManagerRef.current = null;
      }

      realtimeManagerRef.current = new RealtimeMeseroManager({
        onStateChange: (state) => {
          setAssistantState(state);
          assistantStateRef.current = state;
        },
        onTranscriptDelta: (text, isFinal, sender) => {
          if (sender === 'user') {
            setTranscript(text);
            if (isFinal) {
              setMessages(prev => [
                ...prev,
                { id: 'usr_' + Date.now(), sender: 'user', text, timestamp: new Date() }
              ]);
            }
          } else {
            setTranscript(text);
            if (isFinal) {
              setMessages(prev => [
                ...prev,
                { id: 'asst_' + Date.now(), sender: 'assistant', text, timestamp: new Date() }
              ]);
            }
          }
        },
        onCartUpdated: (updatedCart) => {
          setCart(updatedCart);
        },
        onError: (err) => {
          console.warn("Realtime WebRTC connection notice:", err);
          setMicPermissionError(typeof err === 'string' ? err : 'Error al conectar micrófono o sesión de voz.');
        }
      });

      await realtimeManagerRef.current.start();
    } catch (realtimeErr: any) {
      console.error("Error starting continuous Realtime voice session:", realtimeErr);
      setMicPermissionError(realtimeErr?.message || "No se pudo acceder al micrófono. Por favor verifica los permisos.");
      setAssistantState('idle');
    }
  };

  const endVoiceCall = () => {
    setIsInVoiceCall(false);
    isInVoiceCallRef.current = false;
    setAssistantState('idle');
    setTranscript('');
    latestTranscriptRef.current = '';
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

    if (realtimeManagerRef.current) {
      realtimeManagerRef.current.stop();
    }

    stopAudioPlayback();
    stopAudioAnalyser();
  };

  // Interactive Central Orb Click Handler (Allows tap to interrupt or restart)
  const handleCentralMicClick = () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(35);
      }
    } catch (e) {}

    if (!isInVoiceCallRef.current) {
      startVoiceCall();
      return;
    }

    // If AI is speaking -> User can tap to interrupt immediately
    if (isSpeakingRef.current || assistantStateRef.current === 'speaking') {
      stopAudioPlayback();
      setAssistantState('listening');
    }
  };

  // 8. Play audio response with Web Audio (MP3/PCM)
  const playVoiceResponse = async (text: string, audioBase64?: string) => {
    if (isVoiceMuted) {
      if (isInVoiceCallRef.current) {
        setAssistantState('listening');
      } else {
        setAssistantState('idle');
      }
      return;
    }

    stopAudioPlayback();
    isSpeakingRef.current = true;
    setAssistantState('speaking');

    // Callback when AI finishes speaking -> resume listening cleanly
    const onSpeechComplete = () => {
      isSpeakingRef.current = false;
      currentAudioSourceRef.current = null;
      if (isInVoiceCallRef.current) {
        setAssistantState('listening');
        setTranscript('');
        latestTranscriptRef.current = '';
      } else {
        setAssistantState('idle');
      }
    };

    if (audioBase64) {
      try {
        const binaryString = atob(audioBase64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!audioContextRef.current) {
          audioContextRef.current = new AudioContextClass();
        }
        const ctx = audioContextRef.current;
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }

        let audioBuffer: AudioBuffer | null = null;

        // 1. Try browser native decodeAudioData (decodes OpenAI MP3, WAV, AAC)
        try {
          const bufferCopy = bytes.buffer.slice(0);
          audioBuffer = await ctx.decodeAudioData(bufferCopy);
        } catch (decodeErr) {
          // 2. Fallback to Gemini 24kHz raw PCM decoding
          try {
            const int16Array = new Int16Array(bytes.buffer);
            const float32Array = new Float32Array(int16Array.length);
            for (let i = 0; i < int16Array.length; i++) {
              float32Array[i] = int16Array[i] / 32768;
            }
            audioBuffer = ctx.createBuffer(1, float32Array.length, 24000);
            audioBuffer.getChannelData(0).set(float32Array);
          } catch (pcmErr) {
            audioBuffer = null;
          }
        }

        if (audioBuffer) {
          const source = ctx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(ctx.destination);
          currentAudioSourceRef.current = source;

          source.onended = onSpeechComplete;
          source.start();
          return;
        }
      } catch (err) {
        console.warn("OpenAI Audio playback error:", err);
      }
    }

    // Direct completion when no audio data is received (100% OpenAI voice only, no browser speech synthesis)
    onSpeechComplete();
  };

  // Fallback client-side matching engine when backend API or network connection is interrupted
  const computeClientLocalVoiceResponse = (
    userText: string,
    products: ProductItem[],
    stores: Record<string, UserProfile>,
    currentCart: GeneralCartItem[],
    deliveryFee: number
  ) => {
    const lower = userText.toLowerCase().trim();
    const executedActions: any[] = [];
    let responseText = '';

    let activeProducts = products.filter(p => {
      if (p.active === false) return false;
      const store = findStoreForProduct(p, stores);
      if (store) {
        return !checkIsStoreClosed(store) && !store.suspended;
      }
      return true;
    });
    if (activeProducts.length === 0 && products.length > 0) {
      activeProducts = products.filter(p => p.active !== false);
    }

    // 0. Query about open stores or restaurants
    if (
      (lower.includes('tienda') || lower.includes('tiendas') || lower.includes('restaurante') || lower.includes('restaurantes') || lower.includes('local') || lower.includes('locales') || lower.includes('negocio') || lower.includes('negocios')) &&
      (lower.includes('abiert') || lower.includes('hay') || lower.includes('cuales') || lower.includes('cuáles') || lower.includes('disponible') || lower.includes('ver') || lower.includes('mostrar') || lower.includes('lista'))
    ) {
      const storeList = Object.values(stores).filter(s => s && !s.suspended);
      const safeStores = storeList.length > 0 ? storeList : [];
      const storeNames = safeStores.slice(0, 5).map(s => s.displayName || s.username).join(', ');

      executedActions.push({
        type: 'OPEN_STORES_LISTED',
        stores: safeStores.slice(0, 10)
      });

      if (safeStores.length > 0) {
        responseText = `¡Sí, claro! Tenemos abiertos y disponibles los siguientes restaurantes y tiendas: ${storeNames}. ¿Qué se te antoja ordenar hoy?`;
      } else if (activeProducts.length > 0) {
        const topProds = activeProducts.slice(0, 3).map(p => `${p.name} por ${p.price.toLocaleString('es-CO')} pesos`).join(', ');
        responseText = `Tenemos deliciosos platos listos para ti como: ${topProds}. ¿Te gustaría que agregue alguno a tu pedido?`;
      } else {
        responseText = `Nuestros restaurantes afiliados están listos para atenderte. ¿Qué te gustaría ordenar hoy?`;
      }
    }
    // 1. Check cart request
    else if (lower.includes('carrito') || lower.includes('que tengo') || lower.includes('qué tengo') || lower.includes('mis platos') || lower.includes('ver orden')) {
      const totalAmount = currentCart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
      const itemCount = currentCart.reduce((sum, item) => sum + item.quantity, 0);
      executedActions.push({
        type: 'CART_SUMMARY',
        cart: currentCart,
        totalAmount,
        itemCount
      });

      if (currentCart.length === 0) {
        responseText = 'Tu carrito de compras está vacío actualmente. Puedes pedirme pollo asado, hamburguesas, pizzas o consultar nuestros menús.';
      } else {
        const itemsList = currentCart.map(i => `${i.quantity}x ${i.product.name}`).join(', ');
        responseText = `Tienes ${itemCount} plato(s) en tu carrito: ${itemsList}. Subtotal: ${totalAmount.toLocaleString('es-CO')} pesos. ¿Deseas confirmar tu pedido?`;
      }
    }
    // 2. Add to cart request
    else if (lower.includes('quiero') || lower.includes('agrega') || lower.includes('pedir') || lower.includes('ordenar') || lower.includes('añade') || lower.includes('dame')) {
      let qty = 1;
      const matchNum = lower.match(/\b(\d+)\b/);
      if (matchNum) {
        qty = parseInt(matchNum[1], 10);
      } else if (lower.includes('dos') || lower.includes('2')) {
        qty = 2;
      } else if (lower.includes('tres') || lower.includes('3')) {
        qty = 3;
      }

      const candidate = activeProducts.find(p => {
        const pName = (p.name || '').toLowerCase();
        const pWords = pName.split(/\s+/);
        return pWords.some(w => w.length > 3 && lower.includes(w)) || lower.includes(pName);
      });

      if (candidate) {
        executedActions.push({
          type: 'ADD_TO_CART',
          product: candidate,
          quantity: qty
        });
        responseText = `¡Listo! He agregado ${qty} ${candidate.name} a tu carrito por ${(candidate.price * qty).toLocaleString('es-CO')} pesos. ¿Deseas algo más o confirmamos tu pedido?`;
      } else {
        const searchMatches = activeProducts.filter(p => {
          const pName = (p.name || '').toLowerCase();
          const pCat = (p.category || '').toLowerCase();
          return lower.includes(pName) || (pCat && lower.includes(pCat)) || pName.split(/\s+/).some(w => w.length > 3 && lower.includes(w));
        });
        const topItems = (searchMatches.length > 0 ? searchMatches : activeProducts).slice(0, 3);
        responseText = `Tenemos opciones como: ${topItems.map(p => `${p.name} por ${p.price.toLocaleString('es-CO')} pesos`).join(', ')}. ¿Cuál deseas agregar?`;
      }
    }
    // 3. Search / Menu queries
    else if (
      lower.includes('pizza') || lower.includes('hamburguesa') || lower.includes('pollo') || 
      lower.includes('pechuga') || lower.includes('alita') || lower.includes('broaster') || 
      lower.includes('asado') || lower.includes('salchipapa') || lower.includes('perro') || 
      lower.includes('bebida') || lower.includes('menu') || lower.includes('menú') || 
      lower.includes('platos') || lower.includes('restaurantes') || lower.includes('comida') || lower.includes('comer')
    ) {
      const rawTokens = lower.split(/\s+/).map(t => t.replace(/[^a-záéíóúüñ0-9]/gi, '')).filter(t => t.length >= 3);
      const searchMatches = activeProducts.filter(p => {
        const pName = (p.name || '').toLowerCase();
        const pCat = (p.category || '').toLowerCase();
        const pDesc = (p.description || '').toLowerCase();

        if (lower.includes('pollo') || lower.includes('pollos')) {
          if (pName.includes('pollo') || pCat.includes('pollo') || pDesc.includes('pollo') || pName.includes('pechuga') || pName.includes('alitas') || pName.includes('broaster')) return true;
        }
        if (lower.includes('hamburguesa') || lower.includes('burger')) {
          if (pName.includes('hamburguesa') || pCat.includes('hamburguesa') || pName.includes('burger') || pDesc.includes('angus')) return true;
        }
        if (lower.includes('pizza')) {
          if (pName.includes('pizza') || pCat.includes('pizza')) return true;
        }
        return rawTokens.some(tok => {
          const singular = tok.endsWith('s') ? tok.slice(0, -1) : tok;
          return pName.includes(tok) || pName.includes(singular) || pCat.includes(tok) || pDesc.includes(tok);
        }) || lower.includes(pName);
      });

      const finalResults = searchMatches.length > 0 ? searchMatches : activeProducts;
      executedActions.push({
        type: 'PRODUCTS_SEARCHED',
        query: userText,
        results: finalResults.slice(0, 8),
        stores: Object.values(stores).slice(0, 4)
      });

      const topItems = finalResults.slice(0, 3).map(p => `${p.name} por ${p.price.toLocaleString('es-CO')} pesos en ${stores[p.userId]?.displayName || 'el restaurante'}`).join(', ');
      responseText = `Encontré estas opciones deliciosas: ${topItems}. ¿Te gustaría que agregue alguna a tu carrito?`;
    }
    // 4. Confirm order request
    else if (lower.includes('confirm') || lower.includes('hacer pedido') || lower.includes('enviar pedido') || lower.includes('finalizar')) {
      if (currentCart.length === 0) {
        responseText = 'Tu carrito está vacío. Agrega primero los platos que deseas ordenar.';
      } else {
        const subtotal = currentCart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
        const grandTotal = subtotal + deliveryFee;
        executedActions.push({
          type: 'ORDER_CONFIRMATION_REQUESTED',
          orderProposal: {
            itemsCount: currentCart.length,
            subtotal,
            deliveryFee,
            grandTotal,
            customerName: 'Cliente',
            customerPhone: '',
            customerAddress: 'Dirección de entrega',
            paymentMethod: 'delivery_cash'
          }
        });
        responseText = `El total de tu pedido es ${grandTotal.toLocaleString('es-CO')} pesos con domicilio incluido. Por favor confirma tus datos de entrega en pantalla para enviarlo.`;
      }
    }
    // 5. Default greeting & assistance
    else {
      const sample = activeProducts.slice(0, 3).map(p => `${p.name} (${p.price.toLocaleString('es-CO')} pesos)`).join(', ');
      responseText = `¡Hola! Soy tu asistente LinnkPro. Puedes pedir platos como ${sample}, o consultar restaurantes. ¿Qué te gustaría ordenar hoy?`;
    }

    return {
      text: responseText,
      actions: executedActions
    };
  };

  // 10. Handle Send Message to Gemini Voice Assistant
  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend || !textToSend.trim()) return;

    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    stopAudioPlayback();
    setTranscript('');
    latestTranscriptRef.current = '';
    setInputText('');

    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      sender: 'user',
      text: textToSend.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setAssistantState('processing');

    try {
      // Ensure catalog data is loaded and up to date
      let currentStores = catalogStores;
      let currentProducts = catalogProducts;
      if (currentProducts.length === 0 || Object.keys(currentStores).length === 0) {
        try {
          const freshData = await fetchAllActiveProductsAndStores();
          if (freshData && freshData.products) {
            currentStores = freshData.profiles || {};
            currentProducts = freshData.products.filter(p => p.active !== false);
            setCatalogStores(currentStores);
            setCatalogProducts(currentProducts);
          }
        } catch (e) {}
      }

      // Build catalog context with real data (open stores and active products)
      const storeMap = new Map<string, any>();
      (Object.values(currentStores) as UserProfile[]).forEach(s => {
        if (s && s.uid && !s.suspended && !storeMap.has(s.uid)) {
          storeMap.set(s.uid, {
            uid: s.uid,
            username: s.username || '',
            displayName: s.displayName || s.username || 'Tienda',
            bio: s.bio || '',
            address: s.address || '',
            phone: s.phone || '',
            whatsapp: s.whatsapp || '',
            isClosed: false
          });
        }
      });

      // Also extract and ensure stores for all active products are included
      currentProducts.forEach(p => {
        if (p.active !== false) {
          const store = findStoreForProduct(p, currentStores);
          if (store && store.uid && !store.suspended && !storeMap.has(store.uid)) {
            storeMap.set(store.uid, {
              uid: store.uid,
              username: store.username || '',
              displayName: store.displayName || store.username || 'Tienda',
              bio: store.bio || '',
              address: store.address || '',
              phone: store.phone || '',
              whatsapp: store.whatsapp || '',
              isClosed: false
            });
          }
        }
      });

      const storesArray = Array.from(storeMap.values());

      let productsArray = currentProducts
        .filter(p => {
          if (p.active === false) return false;
          const store = findStoreForProduct(p, currentStores);
          if (store) {
            return !checkIsStoreClosed(store) && !store.suspended;
          }
          return true;
        })
        .map(p => {
          const store = findStoreForProduct(p, currentStores);
          return {
            id: p.id,
            userId: p.userId || store?.uid || '',
            name: p.name,
            description: p.description || '',
            price: p.price,
            stock: p.stock,
            category: p.category || 'General',
            imageURL: p.imageURL && p.imageURL.startsWith('data:') ? undefined : p.imageURL,
            storeName: store?.displayName || 'Tienda',
            storeUsername: store?.username || '',
            active: p.active
          };
        });

      if (productsArray.length === 0 && currentProducts.length > 0) {
        productsArray = currentProducts.filter(p => p.active !== false).map(p => {
          const store = findStoreForProduct(p, currentStores);
          return {
            id: p.id,
            userId: p.userId || store?.uid || '',
            name: p.name,
            description: p.description || '',
            price: p.price,
            stock: p.stock,
            category: p.category || 'General',
            imageURL: p.imageURL && p.imageURL.startsWith('data:') ? undefined : p.imageURL,
            storeName: store?.displayName || 'Tienda',
            storeUsername: store?.username || '',
            active: p.active
          };
        });
      }

      const currentCart = getStoredCart();
      const cartPayload = currentCart.map(c => ({
        id: c.id,
        productId: c.product.id,
        name: c.product.name,
        price: c.product.price,
        quantity: c.quantity,
        selectedVariant: c.selectedVariant,
        imageURL: c.product.imageURL && c.product.imageURL.startsWith('data:') ? undefined : c.product.imageURL,
        storeName: catalogStores[c.product.userId]?.displayName || 'Tienda',
        userId: c.product.userId
      }));

      // Map confirmed prior history strictly alternating and non-empty
      const historyPayload: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
      messages.slice(-8).forEach(m => {
        if (m.text && m.text.trim()) {
          const role = m.sender === 'user' ? 'user' : 'model';
          historyPayload.push({
            role,
            parts: [{ text: m.text.trim() }]
          });
        }
      });

      let result: any = null;

      try {
        // Call backend voice assistant endpoint (ChatGPT GPT-4o)
        const response = await fetch('/api/voice-assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: textToSend.trim(),
            history: historyPayload,
            catalogContext: {
              products: productsArray,
              stores: storesArray,
              deliveryFee: systemDeliveryFee,
              cart: cartPayload
            }
          })
        });

        if (response.ok) {
          result = await response.json();
        }
      } catch (fetchErr) {
        console.warn("Backend fetch failed, activating resilient local client engine:", fetchErr);
      }

      // If backend failed or was unreachable on custom domain, calculate locally
      if (!result || !result.text) {
        result = computeClientLocalVoiceResponse(
          textToSend.trim(),
          catalogProducts,
          catalogStores,
          currentCart,
          systemDeliveryFee
        );
      }

      const aiReplyText = result.text || 'Entendido. ¿Deseas hacer algo más?';
      const actions = result.actions || [];

      // Process and execute any direct client-side state actions (like adding to cart)
      let primaryActionPayload: any = null;

      for (const action of actions) {
        if (action.type === 'ADD_TO_CART' && action.product) {
          addProductToCart(action.product, action.quantity || 1, action.variant);
          setCart(getStoredCart());
          primaryActionPayload = {
            type: 'CART_SUMMARY',
            data: {
              addedProduct: action.product,
              quantity: action.quantity || 1,
              cart: getStoredCart()
            }
          };
        } else if (action.type === 'PRODUCTS_SEARCHED') {
          primaryActionPayload = {
            type: 'PRODUCTS_SEARCHED',
            data: {
              query: action.query,
              products: action.results,
              stores: action.stores
            }
          };
        } else if (action.type === 'CART_SUMMARY') {
          primaryActionPayload = {
            type: 'CART_SUMMARY',
            data: {
              cart: getStoredCart()
            }
          };
        } else if (action.type === 'ORDER_CONFIRMATION_REQUESTED') {
          primaryActionPayload = {
            type: 'ORDER_CONFIRMATION_REQUESTED',
            data: action.orderProposal
          };
        } else if (action.type === 'ORDER_CREATE_CONFIRMED') {
          // Execute order creation in Firestore
          await handleExecuteOrderCreation(action.orderData);
          primaryActionPayload = {
            type: 'ORDER_CREATE_CONFIRMED',
            data: action.orderData
          };
        } else if (action.type === 'NAVIGATE_TO_STORE' && action.storeUsername) {
          if (onNavigateToStore) {
            onNavigateToStore(action.storeUsername);
          }
        }
      }

      const assistantMsg: ChatMessage = {
        id: `ai_${Date.now()}`,
        sender: 'assistant',
        text: aiReplyText,
        timestamp: new Date(),
        actionPayload: primaryActionPayload
      };

      setMessages(prev => [...prev, assistantMsg]);

      // Request OpenAI High Definition TTS audio or fallback to Web Speech API
      if (!isVoiceMuted) {
        try {
          const ttsRes = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: result.speechText || aiReplyText })
          });
          if (ttsRes.ok) {
            const ttsData = await ttsRes.json();
            if (ttsData && ttsData.audio) {
              playVoiceResponse(aiReplyText, ttsData.audio);
            } else {
              playVoiceResponse(aiReplyText);
            }
          } else {
            playVoiceResponse(aiReplyText);
          }
        } catch (e) {
          playVoiceResponse(aiReplyText);
        }
      } else {
        if (isInVoiceCallRef.current) {
          setAssistantState('listening');
        } else {
          setAssistantState('idle');
        }
      }
    } catch (error) {
      console.error("Critical fallback in LinnkPro AI:", error);
      const fallback = computeClientLocalVoiceResponse(
        textToSend.trim(),
        catalogProducts,
        catalogStores,
        getStoredCart(),
        systemDeliveryFee
      );
      const assistantMsg: ChatMessage = {
        id: `ai_${Date.now()}`,
        sender: 'assistant',
        text: fallback.text,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, assistantMsg]);
      playVoiceResponse(fallback.text);
    }
  };

  // Real Order Creation in Firebase
  const handleExecuteOrderCreation = async (orderData: any) => {
    setIsOrdering(true);
    try {
      const currentCart = getStoredCart();
      if (currentCart.length === 0) {
        throw new Error("El carrito está vacío.");
      }

      // Group items by merchant userId
      const itemsBySeller: Record<string, typeof currentCart> = {};
      currentCart.forEach(item => {
        const sId = item.product.userId || 'general';
        if (!itemsBySeller[sId]) itemsBySeller[sId] = [];
        itemsBySeller[sId].push(item);
      });

      const orderNumberBase = Math.floor(1000 + Math.random() * 9000);

      // Create an order in Firestore for each seller
      for (const [sellerId, sellerItems] of Object.entries(itemsBySeller)) {
        const storeProfile = catalogStores[sellerId];
        const storeSubtotal = sellerItems.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
        const storeTotal = storeSubtotal + systemDeliveryFee;

        const newOrder: OrderItem = {
          id: '',
          storeOwnerId: sellerId,
          storeName: storeProfile?.displayName || 'Restaurante LinnkPro',
          storeAddress: storeProfile?.address || '',
          storePhone: storeProfile?.phone || storeProfile?.whatsapp || '',
          orderNumber: orderNumberBase,
          customerName: orderData.customerName || 'Cliente LinnkPro',
          customerPhone: orderData.customerPhone || '',
          customerAddress: orderData.customerAddress || 'Dirección de entrega',
          paymentMethod: (orderData.paymentMethod as any) || 'delivery_cash',
          status: 'pending',
          items: sellerItems.map(item => ({
            productId: item.product.id,
            name: item.product.name,
            price: item.product.price,
            quantity: item.quantity,
            selectedVariant: item.selectedVariant
          })),
          totalAmount: storeTotal,
          deliveryFee: systemDeliveryFee,
          notes: orderData.notes ? `[LinnkPro AI Voice] ${orderData.notes}` : '[LinnkPro AI Voice]',
          createdAt: new Date().toISOString()
        };

        await saveOrder(newOrder);
      }

      // Clear cart
      clearAllCart();
      setCart([]);
    } catch (e) {
      console.error("Error creating real order from voice assistant:", e);
    } finally {
      setIsOrdering(false);
    }
  };

  // Format call duration into MM:SS
  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const lastAssistantMessage = [...messages].reverse().find(m => m.sender === 'assistant');

  return (
    <>
      {/* 1. FLOATING CALL & CHAT TRIGGER (1. Botón Inicial Minimalista & 4. Opción Alternativa & 5. Modo Minimizado) */}
      <div 
        id="linnkpro-voice-fab-container"
        className="fixed bottom-20 left-4 sm:bottom-6 sm:left-6 z-40 flex items-center gap-3"
      >
        {/* 5. MODO MINIMIZADO: Sleek floating indicator docked in the corner */}
        {isOpen && isMinimized ? (
          <motion.button
            id="linnkpro-voice-minimized-pill"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            onClick={() => setIsMinimized(false)}
            className="flex items-center gap-2.5 px-3.5 py-2 rounded-full bg-[#121722]/95 hover:bg-[#181F2E] border-2 border-[#EF4444] shadow-[0_0_25px_rgba(239,68,68,0.45)] text-white hover:scale-105 transition-all group backdrop-blur-md"
            title="Abrir chat de iAmesero"
          >
            <div className="w-7 h-7 rounded-full bg-[#EF4444] flex items-center justify-center text-white relative shadow-sm">
              <ChefCapSparkIcon size={16} fill="#ffffff" />
              <span className="w-2 h-2 rounded-full bg-emerald-400 border border-[#121722] absolute -top-0.5 -right-0.5 animate-pulse"></span>
            </div>
            <span className="text-xs font-bold tracking-tight pr-1 flex items-center gap-1">
              <span className="text-[#EF4444]">iA</span>
              <span className="text-white">mesero</span>
            </span>
          </motion.button>
        ) : !isOpen ? (
          <div className="flex items-center gap-3">
            {/* 1. BOTÓN INICIAL (MINIMALISTA) */}
            <button
              id="linnkpro-voice-fab"
              onClick={() => {
                setIsOpen(true);
                setIsMinimized(false);
              }}
              className="relative w-14 h-14 rounded-full border-2 border-[#EF4444] bg-[#0E131F]/95 shadow-[0_0_25px_rgba(239,68,68,0.45)] hover:shadow-[0_0_35px_rgba(239,68,68,0.7)] flex items-center justify-center transition-all duration-300 transform active:scale-95 group hover:scale-105 flex-shrink-0"
              aria-label="Invocar Mesero IA"
              title="Pulsa para invocar a tu mesero IA"
            >
              {/* 2. ANIMACIÓN AL ACTIVAR: Subtle expanding concentric ripple */}
              <span className="absolute -inset-1 rounded-full border border-red-500/40 animate-ping pointer-events-none opacity-40"></span>
              <span className="absolute -inset-2 rounded-full bg-red-600/10 blur-sm group-hover:bg-red-600/20 transition"></span>

              <div className="relative flex items-center justify-center">
                <ChefCapSparkIcon size={28} fill="#ffffff" className="group-hover:scale-105 transition-transform" />
              </div>
            </button>

            {/* 4. OPCIÓN ALTERNATIVA: Friendly Speech Bubble Tooltip */}
            {showFloatingTooltip && (
              <motion.div
                initial={{ opacity: 0, x: -15, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative hidden sm:flex items-center bg-[#161D2B]/95 border border-red-500/40 text-white text-xs px-3.5 py-2 rounded-2xl shadow-xl backdrop-blur-md gap-2"
              >
                {/* Speech Bubble Tail pointing left */}
                <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 bg-[#161D2B] border-b border-l border-red-500/40 rotate-45"></div>
                <Sparkles className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 animate-pulse" />
                <span className="font-medium text-slate-200">¿Necesitas ayuda para pedir algo?</span>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowFloatingTooltip(false);
                  }}
                  className="text-slate-400 hover:text-white p-0.5 ml-1 transition"
                  title="Cerrar sugerencia"
                >
                  <X className="w-3 h-3" />
                </button>
              </motion.div>
            )}
          </div>
        ) : null}
      </div>

      {/* 3. CHAT DEL MESERO IA & IMMERSIVE VOICE STAGE MODAL */}
      <AnimatePresence>
        {isOpen && !isMinimized && (
          <motion.div
            id="linnkpro-voice-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-start sm:justify-start sm:pl-6 p-0 sm:p-4 bg-black/75 backdrop-blur-sm"
          >
            {/* Modal Container Card */}
            <motion.div
              id="linnkpro-voice-modal-card"
              initial={{ y: 60, scale: 0.95, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              exit={{ y: 60, scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', damping: 26, stiffness: 300 }}
              className="w-full sm:w-[440px] h-[92vh] sm:h-[650px] max-h-[95vh] bg-[#121722]/98 backdrop-blur-2xl border border-white/10 rounded-t-3xl sm:rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden text-gray-100 relative"
            >
              {/* TOP HEADER BAR (Matching Diseño de chat.png) */}
              <div className="px-4 sm:px-5 py-3.5 bg-[#161D2B] border-b border-white/10 flex items-center justify-between z-10 w-full flex-shrink-0">
                <div className="flex items-center gap-3 min-w-0 flex-1 mr-2">
                  {/* Chef Hat Circular Badge Avatar */}
                  <div className="w-10 h-10 rounded-full border-2 border-[#EF4444] bg-[#0E131F] flex items-center justify-center text-white shadow-md shadow-red-500/20 flex-shrink-0">
                    <ChefCapSparkIcon size={22} fill="#ffffff" />
                  </div>
                  
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-base font-extrabold tracking-tight leading-none">
                        <span className="text-[#EF4444]">iA</span>
                        <span className="text-white">mesero</span>
                      </h3>
                    </div>
                    {/* Status Indicator */}
                    <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium leading-none mt-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      <span>En línea</span>
                    </div>
                  </div>
                </div>

                {/* Right Action Controls */}
                <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                  {/* View Mode Switcher (Chat vs Voz) */}
                  <div className="bg-[#0E131F] p-0.5 rounded-full border border-white/10 flex items-center">
                    <button
                      onClick={() => {
                        endVoiceCall();
                        setActiveTab('chat');
                      }}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition flex items-center gap-1 ${
                        activeTab === 'chat' 
                          ? 'bg-[#EF4444] text-white shadow-sm' 
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <MessageSquare className="w-3 h-3" />
                      Chat
                    </button>
                    <button
                      onClick={() => {
                        setActiveTab('call');
                        if (!isInVoiceCallRef.current) {
                          startVoiceCall();
                        }
                      }}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition flex items-center gap-1 ${
                        activeTab === 'call' 
                          ? 'bg-[#EF4444] text-white shadow-sm' 
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Radio className="w-3 h-3" />
                      Voz
                    </button>
                  </div>

                  {/* Minimize Button (—) */}
                  <button
                    id="linnkpro-voice-minimize-btn"
                    onClick={() => setIsMinimized(true)}
                    className="w-8 h-8 rounded-full bg-[#0E131F] hover:bg-slate-800 text-slate-300 hover:text-white border border-white/10 flex items-center justify-center transition active:scale-95 flex-shrink-0"
                    title="Minimizar"
                    aria-label="Minimizar"
                  >
                    <Minus className="w-4 h-4 text-slate-300" />
                  </button>

                  {/* Close Button (✕) */}
                  <button
                    id="linnkpro-voice-close-btn"
                    onClick={() => {
                      endVoiceCall();
                      setIsOpen(false);
                    }}
                    className="w-8 h-8 rounded-full bg-[#0E131F] hover:bg-red-500/20 text-slate-300 hover:text-white border border-white/10 flex items-center justify-center transition active:scale-95 flex-shrink-0"
                    title="Cerrar"
                    aria-label="Cerrar"
                  >
                    <X className="w-4 h-4 text-slate-300 hover:text-white" />
                  </button>
                </div>
              </div>

              {/* VIEW 1: IMMERSIVE REAL-TIME VOICE CALL STAGE */}
              {activeTab === 'call' && (
                <div className="flex-1 flex flex-col justify-between p-4 sm:p-6 overflow-y-auto relative bg-[#0B0F19]">
                  {/* Background Subtle Radial Glow */}
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className={`w-80 h-80 rounded-full blur-[100px] transition-all duration-700 opacity-20 ${
                      assistantState === 'listening'
                        ? 'bg-[#EF4444] scale-110'
                        : assistantState === 'speaking'
                        ? 'bg-[#EF4444] scale-125'
                        : assistantState === 'processing'
                        ? 'bg-[#EF4444]/70 scale-100'
                        : 'bg-[#EF4444]/20'
                    }`}></div>
                  </div>

                  {/* 1. Header Title */}
                  <div className="flex flex-col items-center justify-center z-10 pt-2 text-center">
                    <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                      {assistantState === 'listening' 
                        ? (transcript ? `"${transcript}"` : 'Escuchando... habla con libertad')
                        : assistantState === 'speaking' 
                        ? 'IAMesero te está respondiendo...'
                        : assistantState === 'processing'
                        ? 'Procesando tu solicitud...'
                        : 'En llamada con IAMesero'}
                    </h2>
                  </div>

                  {/* Mobile Mic Permission Notice if any */}
                  {micPermissionError && (
                    <div className="z-20 my-2 mx-auto max-w-sm bg-rose-950/90 border border-rose-600 rounded-2xl p-3 text-center shadow-2xl backdrop-blur">
                      <p className="text-xs text-rose-200 font-medium leading-relaxed">
                        {micPermissionError}
                      </p>
                      <button
                        onClick={startVoiceCall}
                        className="mt-2 px-3 py-1 bg-[#EF4444] hover:bg-[#DC2626] text-white text-xs font-bold rounded-lg transition"
                      >
                        🔄 Reintentar conexión de voz
                      </button>
                    </div>
                  )}

                  {/* 2. Central iAmesero Orb matching exact clean button design */}
                  <div className="flex flex-col items-center justify-center my-auto py-6 z-10">
                    <div className="relative flex items-center justify-center">
                      {/* Central Circle Button (Clean dark background + Red border + Larger Icon) */}
                      <button
                        id="linnkpro-interactive-center-mic"
                        onClick={handleCentralMicClick}
                        className="w-32 h-32 sm:w-36 sm:h-36 rounded-full border-2 sm:border-[3px] border-[#EF4444] bg-[#0E131F]/95 flex items-center justify-center shadow-[0_0_30px_rgba(239,68,68,0.4)] hover:shadow-[0_0_45px_rgba(239,68,68,0.65)] relative z-10 active:scale-95 hover:scale-105 transition-all duration-200 cursor-pointer focus:outline-none group"
                        title={assistantState === 'speaking' ? 'Toca para interrumpir' : transcript ? 'Toca para enviar' : 'iAmesero activo'}
                      >
                        <div className="relative flex items-center justify-center">
                          <ChefCapSparkIcon size={78} fill="#ffffff" className="group-hover:scale-105 transition-transform" />
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* 3. Action Cards Pop-up (Cart or Product quick cards during call) */}
                  {lastAssistantMessage?.actionPayload && (
                    <div className="z-10 mb-3">
                      {lastAssistantMessage.actionPayload.type === 'CART_SUMMARY' && (
                        <div className="bg-[#111827] border border-red-500/40 rounded-2xl p-3 shadow-lg flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-red-500/20 text-red-500 flex items-center justify-center font-bold">
                              <ShoppingBag className="w-5 h-5" />
                            </div>
                            <div>
                              <h4 className="text-xs font-bold text-white">Carrito Actualizado</h4>
                              <p className="text-[11px] text-amber-400 font-bold">
                                {cart.reduce((s, i) => s + i.quantity, 0)} platos • ${cart.reduce((s, i) => s + (i.product.price * i.quantity), 0).toLocaleString('es-CO')} COP
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              endVoiceCall();
                              setActiveTab('chat');
                            }}
                            className="px-3 py-1.5 rounded-xl bg-[#EF4444] hover:bg-[#DC2626] text-white text-xs font-bold transition flex items-center gap-1 shadow-md"
                          >
                            Ver Carrito <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>
                      )}

                      {lastAssistantMessage.actionPayload.type === 'ORDER_CONFIRMATION_REQUESTED' && (
                        <div className="bg-gradient-to-r from-[#1E1418] to-[#111827] border border-amber-500/50 rounded-2xl p-3 shadow-xl flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
                              <AlertCircle className="w-5 h-5" />
                            </div>
                            <div>
                              <h4 className="text-xs font-bold text-white">Confirmar Pedido</h4>
                              <p className="text-[11px] text-amber-400 font-bold">
                                Total: ${lastAssistantMessage.actionPayload.data.grandTotal?.toLocaleString('es-CO')} COP
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={async () => {
                              await handleExecuteOrderCreation(lastAssistantMessage.actionPayload?.data);
                              handleSendMessage("Sí, confirmo mi pedido ahora.");
                            }}
                            className="px-3 py-1.5 rounded-xl bg-[#EF4444] hover:bg-[#DC2626] text-white text-xs font-bold transition shadow-md"
                          >
                            Confirmar
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* VIEW 2: CHAT & CART TRANSCRIPT VIEW (Matching 3. Chat del Mesero IA) */}
              {activeTab === 'chat' && (
                <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm bg-[#121722] scrollbar-thin scrollbar-thumb-slate-800">
                  {/* Welcome Message Card if initial conversation */}
                  {messages.length <= 1 && (
                    <div className="bg-[#161D2B] border border-white/10 rounded-2xl p-4 shadow-md space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#EF4444] text-white flex items-center justify-center flex-shrink-0 shadow-sm">
                          <ChefCapSparkIcon size={18} fill="#ffffff" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-white font-medium text-sm leading-relaxed">
                            ¡Hola! Soy tu asistente de <span className="font-bold text-white">Linnk<span className="text-[#EF4444]">Pro</span></span>. ¿Qué te gustaría ordenar hoy?
                          </p>
                          <p className="text-xs text-slate-400">
                            Puedo recomendarte platos, consultar tiendas abiertas o armar tu pedido.
                          </p>
                        </div>
                      </div>

                      {/* Prompt Suggestion Pills */}
                      <div className="pt-2 border-t border-white/5 flex flex-wrap gap-2">
                        {[
                          { label: '🍔 ¿Qué hamburguesas recomiendas?', query: '¿Qué hamburguesas me recomiendas de las tiendas abiertas?' },
                          { label: '🍕 ¿Cuáles son las pizzas más pedidas?', query: '¿Cuáles son las mejores pizzas disponibles?' },
                          { label: '🛒 Ver mi carrito de compras', query: '¿Qué tengo en mi carrito?' },
                          { label: '🛵 ¿Cuánto demora el domicilio?', query: '¿Cuánto demora el domicilio y cuál es el costo?' }
                        ].map((chip, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleSendMessage(chip.query)}
                            className="px-3 py-1.5 rounded-full bg-[#0E131F] hover:bg-slate-800 text-xs text-slate-200 hover:text-white border border-white/10 transition text-left active:scale-95"
                          >
                            {chip.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                    >
                      <div className="flex items-start gap-2.5 max-w-[88%]">
                        {msg.sender === 'assistant' && (
                          <div className="w-7 h-7 rounded-full bg-[#EF4444] text-white flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
                            <ChefCapSparkIcon size={16} fill="#ffffff" />
                          </div>
                        )}
                        <div
                          className={`rounded-2xl px-4 py-2.5 shadow-md ${
                            msg.sender === 'user'
                              ? 'bg-[#EF4444] text-white rounded-tr-sm font-medium'
                              : 'bg-[#182030] text-slate-100 border border-white/10 rounded-tl-sm'
                          }`}
                        >
                          <p className="leading-relaxed whitespace-pre-wrap text-[13.5px]">{msg.text}</p>
                          <span className={`text-[10px] mt-1 block text-right ${msg.sender === 'user' ? 'text-red-100/80' : 'text-slate-400'}`}>
                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>

                      {/* Rich Action Attachments */}
                      {msg.actionPayload && (
                        <div className="w-full mt-2 space-y-2 pl-9">
                          {/* 1. Products Carousel Result */}
                          {msg.actionPayload.type === 'PRODUCTS_SEARCHED' && msg.actionPayload.data?.products?.length > 0 && (
                            <div className="bg-[#161D2B] border border-white/10 rounded-2xl p-3 shadow-md">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-bold text-[#EF4444] flex items-center gap-1">
                                  <ShoppingBag className="w-3.5 h-3.5" />
                                  Platos disponibles ({msg.actionPayload.data.products.length})
                                </span>
                              </div>
                              <div className="grid grid-cols-1 gap-2 max-h-60 overflow-y-auto pr-1">
                                {msg.actionPayload.data.products.map((p: ProductItem) => {
                                  const store = catalogStores[p.userId];
                                  return (
                                    <div
                                      key={p.id}
                                      className="flex items-center gap-2.5 p-2 rounded-xl bg-[#0E131F] border border-white/10 hover:border-red-500/50 transition"
                                    >
                                      {p.imageURL ? (
                                        <img
                                          src={p.imageURL}
                                          alt={p.name}
                                          referrerPolicy="no-referrer"
                                          className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                                        />
                                      ) : (
                                        <div className="w-12 h-12 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 flex-shrink-0">
                                          <ShoppingBag className="w-5 h-5" />
                                        </div>
                                      )}

                                      <div className="flex-1 min-w-0">
                                        <h4 className="text-xs font-bold text-white truncate">{p.name}</h4>
                                        <p className="text-[11px] text-slate-400 truncate">
                                          {store?.displayName || 'Restaurante'} • {p.category || 'Comida'}
                                        </p>
                                        <span className="text-xs font-extrabold text-amber-400">
                                          ${p.price.toLocaleString('es-CO')} COP
                                        </span>
                                      </div>

                                      <button
                                        onClick={() => {
                                          addProductToCart(p, 1);
                                          setCart(getStoredCart());
                                          handleSendMessage(`Agregué 1 ${p.name} al carrito.`);
                                        }}
                                        className="px-2.5 py-1.5 rounded-lg bg-[#EF4444] hover:bg-[#DC2626] text-white text-xs font-bold flex items-center gap-1 transition shadow"
                                      >
                                        <Plus className="w-3.5 h-3.5" />
                                        Agregar
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* 2. Cart Summary Card */}
                          {msg.actionPayload.type === 'CART_SUMMARY' && (
                            <div className="bg-[#161D2B] border border-white/10 rounded-2xl p-3.5 shadow-md">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-bold text-white flex items-center gap-1">
                                  <ShoppingBag className="w-3.5 h-3.5 text-[#EF4444]" />
                                  Carrito de Compras ({cart.reduce((s, i) => s + i.quantity, 0)} ítems)
                                </span>
                                {cart.length > 0 && (
                                  <button
                                    onClick={() => {
                                      clearAllCart();
                                      setCart([]);
                                    }}
                                    className="text-[11px] text-[#EF4444] hover:underline flex items-center gap-0.5 font-bold"
                                  >
                                    <Trash2 className="w-3 h-3" /> Vaciar
                                  </button>
                                )}
                              </div>

                              {cart.length === 0 ? (
                                <p className="text-xs text-slate-400 py-2 text-center">Tu carrito está vacío.</p>
                              ) : (
                                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                  {cart.map((item) => (
                                    <div
                                      key={item.id}
                                      className="flex items-center justify-between p-2 rounded-xl bg-[#0E131F] border border-white/10 text-xs"
                                    >
                                      <div className="flex-1 truncate pr-2">
                                        <span className="font-bold text-white truncate block">{item.product.name}</span>
                                        <span className="text-[11px] text-amber-400 font-semibold">${(item.product.price * item.quantity).toLocaleString('es-CO')} COP</span>
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <button
                                          onClick={() => {
                                            updateCartQuantity(item.id, item.quantity - 1);
                                            setCart(getStoredCart());
                                          }}
                                          className="w-6 h-6 rounded-md bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-white"
                                        >
                                          <Minus className="w-3 h-3" />
                                        </button>
                                        <span className="w-5 text-center font-bold text-white">{item.quantity}</span>
                                        <button
                                          onClick={() => {
                                            updateCartQuantity(item.id, item.quantity + 1);
                                            setCart(getStoredCart());
                                          }}
                                          className="w-6 h-6 rounded-md bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-white"
                                        >
                                          <Plus className="w-3 h-3" />
                                        </button>
                                      </div>
                                    </div>
                                  ))}

                                  {(() => {
                                    const summary = calculateCartSummary(cart, systemDeliveryFee);
                                    return (
                                      <div className="pt-2 border-t border-white/10 text-xs space-y-1">
                                        <div className="flex justify-between text-slate-400">
                                          <span>Subtotal:</span>
                                          <span>${summary.subtotal.toLocaleString('es-CO')} COP</span>
                                        </div>
                                        <div className="flex justify-between text-slate-400">
                                          <span>Domicilio ({summary.storeCount} restaurante):</span>
                                          <span>${summary.deliveryFee.toLocaleString('es-CO')} COP</span>
                                        </div>
                                        <div className="flex justify-between text-white font-bold pt-1 border-t border-white/10">
                                          <span>Total:</span>
                                          <span className="text-amber-400 font-black text-sm">${summary.grandTotal.toLocaleString('es-CO')} COP</span>
                                        </div>
                                      </div>
                                    );
                                  })()}
                                </div>
                              )}
                            </div>
                          )}

                          {/* 3. Order Confirmation Proposal Card */}
                          {msg.actionPayload.type === 'ORDER_CONFIRMATION_REQUESTED' && msg.actionPayload.data && (
                            <div className="bg-gradient-to-b from-[#1C1824] to-[#121722] border border-amber-500/50 rounded-2xl p-4 shadow-xl">
                              <div className="flex items-center gap-2 mb-2 text-amber-400 font-black text-xs uppercase tracking-wider">
                                <AlertCircle className="w-4 h-4" />
                                Confirmación de Pedido
                              </div>

                              <div className="space-y-1.5 text-xs text-gray-300 mb-3 bg-[#0E131F] border border-white/10 p-3 rounded-xl">
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Nombre:</span>
                                  <span className="font-bold text-white">{msg.actionPayload.data.customerName || 'Cliente'}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Teléfono:</span>
                                  <span className="font-bold text-white">{msg.actionPayload.data.customerPhone || 'N/A'}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Dirección:</span>
                                  <span className="font-bold text-white text-right max-w-[60%] truncate">{msg.actionPayload.data.customerAddress || 'N/A'}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Método de Pago:</span>
                                  <span className="font-bold text-amber-400 uppercase">{msg.actionPayload.data.paymentMethod === 'delivery_cash' ? 'Efectivo contra entrega' : 'Transferencia'}</span>
                                </div>
                                <div className="flex justify-between pt-1 border-t border-white/10 text-sm font-black">
                                  <span className="text-white">Total a pagar:</span>
                                  <span className="text-amber-400">${msg.actionPayload.data.grandTotal?.toLocaleString('es-CO')} COP</span>
                                </div>
                              </div>

                              <div className="flex gap-2">
                                <button
                                  onClick={async () => {
                                    await handleExecuteOrderCreation(msg.actionPayload?.data);
                                    handleSendMessage("Sí, confirmo mi pedido ahora.");
                                  }}
                                  disabled={isOrdering}
                                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#EF4444] to-[#DC2626] hover:from-[#DC2626] hover:to-[#B91C1C] text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-lg transition uppercase tracking-wider"
                                >
                                  {isOrdering ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                  Confirmar Pedido Ahora
                                </button>
                              </div>
                            </div>
                          )}

                          {/* 4. Order Created Success Card */}
                          {msg.actionPayload.type === 'ORDER_CREATE_CONFIRMED' && (
                            <div className="bg-[#161D2B] border border-[#EF4444]/50 rounded-2xl p-4 text-center">
                              <div className="w-10 h-10 mx-auto rounded-full bg-[#EF4444]/20 text-[#EF4444] flex items-center justify-center mb-2">
                                <CheckCircle2 className="w-6 h-6" />
                              </div>
                              <h4 className="text-sm font-extrabold text-white">¡Pedido Creado con Éxito!</h4>
                              <p className="text-xs text-slate-400 mt-1">
                                El restaurante ha recibido tu pedido y comenzará a prepararlo de inmediato.
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Processing / Typing Indicator */}
                  {assistantState === 'processing' && (
                    <div className="flex items-center gap-2 text-xs text-slate-400 bg-[#182030] border border-white/10 px-3.5 py-2 rounded-2xl w-fit">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#EF4444]" />
                      <span>iAmesero está pensando...</span>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              )}

              {/* BOTTOM CONTROLS & INPUT BAR (Matching Diseño de chat.png) */}
              <div className="p-3 sm:p-4 bg-[#161D2B] border-t border-white/10 flex flex-col gap-3">
                {/* Pill Shaped Text Input matching screenshot */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 relative flex items-center bg-[#0E131F] border border-white/10 rounded-full px-4 py-2.5 shadow-inner focus-within:border-[#EF4444]/60 transition">
                    <input
                      type="text"
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage(inputText);
                        }
                      }}
                      placeholder="Escribe tu mensaje..."
                      className="w-full bg-transparent text-sm text-white placeholder-slate-500 outline-none pr-10"
                    />

                    {inputText.trim() ? (
                      <button
                        onClick={() => handleSendMessage(inputText)}
                        className="absolute right-1.5 w-8 h-8 rounded-full bg-[#EF4444] hover:bg-[#DC2626] text-white flex items-center justify-center transition active:scale-95 shadow-md"
                        title="Enviar mensaje"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          if (isInVoiceCall) {
                            endVoiceCall();
                          } else {
                            setActiveTab('call');
                            startVoiceCall();
                          }
                        }}
                        className={`absolute right-1.5 w-8 h-8 rounded-full flex items-center justify-center transition active:scale-95 ${
                          isInVoiceCall 
                            ? 'bg-[#EF4444] text-white animate-pulse' 
                            : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
                        }`}
                        title="Hablar por voz"
                      >
                        <Mic className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Primary Call Controls (Silenciar, Finalizar, Altavoz) when in voice mode */}
                {activeTab === 'call' && (
                  <div className="flex items-center justify-around pt-1 pb-1">
                    {/* Toggle User Microphone (Silenciar) */}
                    <button
                      id="linnkpro-voice-mic-toggle-btn"
                      onClick={() => setIsMicMuted(prev => !prev)}
                      className="flex flex-col items-center gap-1.5 group transition"
                    >
                      <div className={`w-14 h-14 rounded-full flex items-center justify-center border transition transform active:scale-95 ${
                        isMicMuted 
                          ? 'bg-red-950/80 border-red-500 text-red-400 shadow-lg shadow-red-950/50' 
                          : 'bg-[#0E131F] border-white/10 text-[#EF4444] group-hover:border-red-500/40 group-hover:bg-[#182030]'
                      }`}>
                        {isMicMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5 text-[#EF4444] stroke-[2]" />}
                      </div>
                      <span className="text-[11px] text-slate-400 font-medium group-hover:text-white transition">Silenciar</span>
                    </button>

                    {/* Main Call Action Button (Finalizar con icono X rojo o Iniciar) */}
                    {isInVoiceCall ? (
                      <button
                        id="linnkpro-voice-end-call-btn"
                        onClick={endVoiceCall}
                        className="flex flex-col items-center gap-1.5 group"
                      >
                        <div className="w-16 h-16 rounded-full bg-[#EF4444] hover:bg-[#DC2626] text-white flex items-center justify-center shadow-xl shadow-red-600/30 group-hover:scale-105 transition transform active:scale-95">
                          <X className="w-7 h-7 text-white stroke-[2.5]" />
                        </div>
                        <span className="text-[11px] font-semibold text-white tracking-wide">Finalizar</span>
                      </button>
                    ) : (
                      <button
                        id="linnkpro-voice-start-call-btn"
                        onClick={startVoiceCall}
                        className="flex flex-col items-center gap-1.5 group"
                      >
                        <div className="w-16 h-16 rounded-full bg-[#EF4444] hover:bg-[#DC2626] text-white flex items-center justify-center shadow-xl shadow-red-600/30 group-hover:scale-105 transition transform active:scale-95 animate-pulse">
                          <Mic className="w-7 h-7 text-white stroke-[2.5]" />
                        </div>
                        <span className="text-[11px] font-semibold text-white tracking-wide">Hablar</span>
                      </button>
                    )}

                    {/* Toggle AI Speaker Voice Output (Altavoz) */}
                    <button
                      id="linnkpro-voice-speaker-toggle-btn"
                      onClick={() => setIsVoiceMuted(prev => !prev)}
                      className="flex flex-col items-center gap-1.5 group transition"
                    >
                      <div className={`w-14 h-14 rounded-full flex items-center justify-center border transition transform active:scale-95 ${
                        isVoiceMuted 
                          ? 'bg-amber-950/80 border-amber-500 text-amber-400' 
                          : 'bg-[#0E131F] border-white/10 text-[#EF4444] group-hover:border-red-500/40 group-hover:bg-[#182030]'
                      }`}>
                        {isVoiceMuted ? <VolumeX className="w-5 h-5 text-amber-400" /> : <Volume2 className="w-5 h-5 text-[#EF4444] stroke-[2]" />}
                      </div>
                      <span className="text-[11px] text-slate-400 font-medium group-hover:text-white transition">Altavoz</span>
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

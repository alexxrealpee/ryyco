/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type, Modality } from '@google/genai';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import {
  processVoiceAssistantMessage,
  processOpenAIVoiceAssistantMessage,
  processFallbackVoiceAssistantMessage,
  generateOpenAITTS
} from './server/voiceAssistant';
import { createRealtimeSessionHandler } from './server/realtimeSession';
import { 
  initBackendCatalogManager, 
  getAvailableCatalog, 
  syncCatalogFromClient, 
  validateProductForCart, 
  validateOrderPayload,
  fetchBackendSystemSettings,
  fetchBackendUserProfile
} from './server/catalogManager';

// Load environmental variables
dotenv.config();
if (!process.env.OPENAI_API_KEY) {
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
}
if (!process.env.OPENAI_API_KEY) {
  dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
}
if (!process.env.OPENAI_API_KEY) {
  dotenv.config({ path: path.resolve(__dirname, '.env') });
}

let aiClient: GoogleGenAI | null = null;
let openaiClient: OpenAI | null = null;
let openaiQuotaExhaustedUntil: number = 0;

function isOpneAIQuotaExhausted(): boolean {
  return Date.now() < openaiQuotaExhaustedUntil;
}

function markOpenAIQuotaExhausted() {
  // Cooldown for 5 minutes before retrying OpenAI
  openaiQuotaExhaustedUntil = Date.now() + 5 * 60 * 1000;
}

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not defined.");
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
  }
  return aiClient;
}

function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Universal CORS & Header middleware for all requests (supports custom domains like ryyco.com)
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Range');
    res.header('Access-Control-Expose-Headers', 'Content-Length, Content-Range');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // Body parsing middleware with expanded limit for catalog, audio and voice requests
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // API Route: AI Link Extractor
  app.post('/api/gemini/parse-links', async (req, res) => {
    try {
      const { message } = req.body;
      if (!message || typeof message !== 'string' || !message.trim()) {
        res.status(400).json({ error: "El mensaje no puede estar vacío." });
        return;
      }

      const ai = getGeminiClient();

      const candidateModels = ['gemini-flash-latest', 'gemini-3.1-flash-lite', 'gemini-3.7-flash', 'gemini-3.1-pro-preview'];
      let response: any = null;
      for (const modelName of candidateModels) {
        try {
          response = await ai.models.generateContent({
            model: modelName,
            contents: `Analiza el siguiente texto de usuario y extrae todos los enlaces (links/URLs).
Para cada enlace, determina un título profesional adecuado en español (por ejemplo, "Instagram" o "Mi Sitio Web"), la URL formateada correctamente (comenzando con https:// o http://), y un emoji relevante único de un solo carácter para usar de icono.

Texto del usuario:
"${message}"`,
            config: {
              systemInstruction: "Eres un asistente experto de Linnk.Pro, una plataforma SaaS de bio-links para creadores y empresas. Tu tarea es extraer de forma precisa y estructurada todos los enlaces provistos por el usuario.",
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  links: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        title: {
                          type: Type.STRING,
                          description: "Título corto y atractivo en español para el enlace."
                        },
                        url: {
                          type: Type.STRING,
                          description: "La dirección URL completa y corregida, asegurando que empiece con http:// o https://."
                        },
                        icon: {
                          type: Type.STRING,
                          description: "Un único carácter de emoji relevante para la red social o propósito del enlace (ej: 📸 para Instagram, 🛍️ para tienda, 🌐 para sitio web, 💼 para portafolio)."
                        }
                      },
                      required: ["title", "url", "icon"]
                    }
                  }
                },
                required: ["links"]
              }
            }
          });
          if (response && response.text) break;
        } catch (mErr) {
          console.warn(`Model ${modelName} unavailable or busy in parse-links, trying next model...`);
        }
      }

      const responseText = response.text;
      if (!responseText) {
        throw new Error("No se pudo obtener una respuesta válida del asistente IA.");
      }

      const parsedData = JSON.parse(responseText.trim());
      res.json(parsedData);
    } catch (error: any) {
      console.error("Error in AI link parsing REST endpoint:", error);
      res.status(500).json({ 
        error: error.message || "Lo sentimos, hubo un error al procesar tu solicitud con la IA.",
        details: error.toString()
      });
    }
  });

  // API Route: AI Full Profile and Design generator
  app.post('/api/gemini/generate-profile-from-prompt', async (req, res) => {
    try {
      const { message } = req.body;
      if (!message || typeof message !== 'string' || !message.trim()) {
        res.status(400).json({ error: "Por favor proveea una descripción o listado de enlaces." });
        return;
      }

      const ai = getGeminiClient();

      const candidateModels = ['gemini-flash-latest', 'gemini-3.1-flash-lite', 'gemini-3.7-flash', 'gemini-3.1-pro-preview'];
      let response: any = null;
      for (const modelName of candidateModels) {
        try {
          response = await ai.models.generateContent({
            model: modelName,
            contents: `Analiza el siguiente texto de usuario donde describe los enlaces que quiere crear o solicita que la IA genere un diseño para él.
Extrae todos los enlaces (corrigiendo URLs), define un Nombre de usuario (displayName), una biografía corta creativa (bio), y crea una propuesta de diseño visual (CustomTheme) totalmente única y profesional adaptada a su personalidad o al sector de sus enlaces (ej. Corporativo, Creativo, Gamer/Retro, Rosado Intenso, Minimalista, etc.).

Texto del usuario:
"${message}"`,
            config: {
              systemInstruction: `Eres "Linnk Copilot", el diseñador de interfaces estrella para Linnk.Pro (nuestra plataforma SaaS de bio-links).
Genera un esquema de diseño personalizado (CustomTheme) y de alta calidad técnica para la bio de este usuario. El diseño debe verse premium, balanceado y tener excelente contraste de accesibilidad (por ejemplo, textos claros en fondos oscuros, o textos muy oscuros en fondos claros).

Formatos válidos para:
- fontFamily: uno de ["font-sans", "font-mono", "font-serif", "font-display"]
- buttonStyle: uno de ["rounded", "pill", "square", "shadow", "bordered"]
- bgType: uno de ["flat", "gradient"]
- bgColor: si es flat, un color hex (ej: "#0b0f19"). Si es gradient, debes generar un gradiente CSS lineal con excelente balance cromático, por ejemplo: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #311042 100%)" o "linear-gradient(135deg, #10b981 0%, #064e3b 100%)". Debe combinar bien con el textColor generado.`,
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  displayName: {
                    type: Type.STRING,
                    description: "Nombre público del usuario derivado de su texto o enlaces."
                  },
                  bio: {
                    type: Type.STRING,
                    description: "Una biografía de perfil profesional o amigable redactada en español, motivadora y resumida (máximo 140 caracteres)."
                  },
                  links: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        title: {
                          type: Type.STRING,
                          description: "Título corto y limpio para el enlace (ej: 'Canal de YouTube', 'Instagram Personal', 'Mi Tienda Online', 'Portafolio Profesional')."
                        },
                        url: {
                          type: Type.STRING,
                          description: "La dirección URL completa y corregida, asegurando que empiece con http:// o https://."
                        },
                        icon: {
                          type: Type.STRING,
                          description: "Un único emoji relevante para la red social o propósito del enlace."
                        }
                      },
                      required: ["title", "url", "icon"]
                    }
                  },
                  theme: {
                    type: Type.OBJECT,
                    properties: {
                      bgType: { type: Type.STRING },
                      bgColor: { type: Type.STRING, description: "Un string de color plano o un gradiente CSS premium (ej. linear-gradient(135deg, ...))." },
                      textColor: { type: Type.STRING, description: "Color de texto principal que tenga excelente contraste sobre el bgColor." },
                      cardBg: { type: Type.STRING, description: "Fondo de las tarjetas de enlace, como 'rgba(255,255,255,0.08)' para oscuros u '#ffffff' para claros." },
                      cardBorder: { type: Type.STRING, description: "Borde de la tarjeta, como 'rgba(255,255,255,0.12)' o 'rgba(0,0,0,0.08)'." },
                      cardTextColor: { type: Type.STRING, description: "Color de texto dentro de la tarjeta de enlace, que destaque perfectamente." },
                      fontFamily: { type: Type.STRING },
                      buttonStyle: { type: Type.STRING }
                    },
                    required: ["bgType", "bgColor", "textColor", "cardBg", "cardBorder", "cardTextColor", "fontFamily", "buttonStyle"]
                  }
                },
                required: ["displayName", "bio", "links", "theme"]
              }
            }
          });
          if (response && response.text) break;
        } catch (mErr) {
          console.warn(`Model ${modelName} unavailable or busy in generate-profile, trying next model...`);
        }
      }

      const responseText = response.text;
      if (!responseText) {
        throw new Error("No se pudo obtener una respuesta válida del diseño IA.");
      }

      const parsedData = JSON.parse(responseText.trim());
      res.json(parsedData);
    } catch (error: any) {
      console.error("Error in AI full design REST endpoint:", error);
      res.status(500).json({ 
        error: error.message || "Lo sentimos, hubo un error al procesar tu solicitud con el diseñador IA.",
        details: error.toString()
      });
    }
  });

  // API Route: LinnkPro AI Voice Assistant (Powered strictly by OpenAI ChatGPT GPT-4o / GPT-4o-mini)
  const handleVoiceAssistantRequest = async (req: express.Request, res: express.Response) => {
    const { message, history, catalogContext } = req.body;
    if (!message || typeof message !== 'string' || !message.trim()) {
      res.status(400).json({ error: "El mensaje de voz o texto no puede estar vacío." });
      return;
    }

    const safeContext = catalogContext || { products: [], stores: [], deliveryFee: 7000, cart: [] };

    try {
      const openai = getOpenAIClient();
      if (openai) {
        try {
          const chatGPTResult = await processOpenAIVoiceAssistantMessage(
            openai,
            message.trim(),
            history || [],
            safeContext
          );
          res.json(chatGPTResult);
          return;
        } catch (chatGPTErr: any) {
          console.warn("OpenAI ChatGPT processing notice, using natural language engine:", chatGPTErr?.message || chatGPTErr);
        }
      }

      // Natural language conversational fallback with full tool execution and store awareness
      const fallbackResult = processFallbackVoiceAssistantMessage(
        message.trim(),
        history || [],
        safeContext
      );
      res.json(fallbackResult);
    } catch (error: any) {
      console.error("Error in LinnkPro AI Voice Assistant endpoint, serving natural fallback response:", error);
      const fallbackResult = processFallbackVoiceAssistantMessage(
        message.trim(),
        history || [],
        safeContext
      );
      res.json(fallbackResult);
    }
  };

  app.post('/api/voice-assistant', handleVoiceAssistantRequest);
  app.post('/api/gemini/voice-assistant', handleVoiceAssistantRequest); // Endpoint alias for backward compatibility

  // API Route: OpenAI Realtime Voice WebRTC Session (Secure Ephemeral Token Provisioning)
  const handleRealtimeSession = async (req: express.Request, res: express.Response) => {
    const apiKey = process.env.OPENAI_API_KEY || '';
    await createRealtimeSessionHandler(req, res, apiKey);
  };
  app.all('/api/realtime/session', handleRealtimeSession);
  app.all('/api/realtime-session', handleRealtimeSession);
  app.all('/api/realtime/client_secrets', handleRealtimeSession);
  app.all('/api/realtime/client-secrets', handleRealtimeSession);

  // API Route: LinnkPro AI Voice Text-to-Speech (TTS) (Powered strictly by OpenAI High Definition TTS)
  const handleTTSRequest = async (req: express.Request, res: express.Response) => {
    try {
      const { text } = req.body;
      if (!text || typeof text !== 'string' || !text.trim()) {
        res.status(400).json({ error: "El texto para sintetizar es obligatorio." });
        return;
      }

      const cleanText = text
        .replace(/\$\s*([0-9]+(?:[.,][0-9]+)*)\s*(?:COP|cop)?/gi, '$1 pesos')
        .replace(/([0-9]+(?:[.,][0-9]+)*)\s*(?:COP|cop)/gi, '$1 pesos')
        .replace(/\$/g, '')
        .replace(/\bd[oó]lares\b/gi, 'pesos')
        .replace(/\bd[oó]lar\b/gi, 'peso')
        .replace(/[*_#`~]/g, '')
        .replace(/https?:\/\/\S+/g, '')
        .replace(/([0-9]+)\.000\s*pesos/gi, '$1 mil pesos')
        .trim()
        .substring(0, 450);

      // OpenAI High Definition Natural TTS
      const openai = getOpenAIClient();
      if (openai) {
        try {
          const ttsResult = await generateOpenAITTS(openai, cleanText);
          res.json(ttsResult);
          return;
        } catch (oErr: any) {
          console.warn("OpenAI TTS synthesis note:", oErr?.message || oErr);
        }
      }

      res.status(200).json({ error: "OpenAI TTS unavailable" });
    } catch (error: any) {
      res.status(200).json({ error: "TTS generation failed" });
    }
  };

  app.post('/api/tts', handleTTSRequest);
  app.post('/api/gemini/tts', handleTTSRequest); // Endpoint alias for backward compatibility

  // Initialize Dynamic Available Catalog Manager (5-min refresh & real-time synchronization)
  initBackendCatalogManager();

  // API Routes: Dynamic Available Catalog & Real-time Validation
  app.get('/api/catalog/available', (req, res) => {
    const catalog = getAvailableCatalog();
    res.json({
      success: true,
      catalog,
      catalogUpdatedAt: catalog.catalogUpdatedAt,
      version: catalog.version
    });
  });

  app.post('/api/catalog/sync', (req, res) => {
    const { stores = [], products = [] } = req.body || {};
    const updated = syncCatalogFromClient(stores, products);
    res.json({
      success: true,
      catalog: updated,
      catalogUpdatedAt: updated.catalogUpdatedAt,
      version: updated.version
    });
  });

  app.post('/api/catalog/validate-item', async (req, res) => {
    const { productId, storeId } = req.body || {};
    if (!productId) {
      res.status(400).json({ valid: false, reason: "productId es requerido" });
      return;
    }
    const result = await validateProductForCart(productId, storeId);
    res.json(result);
  });

  app.post('/api/catalog/validate-order', async (req, res) => {
    const { items = [], storeOwnerId } = req.body || {};
    const result = await validateOrderPayload(items, storeOwnerId);
    res.json(result);
  });

  // Fast server-side fallback endpoints for settings & profile
  app.get('/api/system-settings', async (req, res) => {
    try {
      const settings = await fetchBackendSystemSettings();
      res.json(settings);
    } catch (e: any) {
      res.json({ defaultDeliveryFee: 7000, adminEmails: ["alexxrealpee@gmail.com"] });
    }
  });

  app.get('/api/user-profile/:uid', async (req, res) => {
    try {
      const profile = await fetchBackendUserProfile(req.params.uid);
      if (profile) {
        res.json(profile);
      } else {
        res.status(404).json({ error: "Profile not found" });
      }
    } catch (e: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Connected SSE push clients for real-time order notifications
  interface PushClient {
    id: string;
    role: 'admin' | 'seller' | 'driver' | 'all';
    sellerUid?: string;
    driverId?: string;
    res: express.Response;
  }
  const pushClients: PushClient[] = [];

  // In-memory registry for Driver FCM tokens (enables push when browser is in background or closed)
  interface RegisteredDriverFCMToken {
    token: string;
    driverId: string;
    driverName?: string;
    phone?: string;
    vehicleType?: string;
    userAgent?: string;
    updatedAt: string;
  }
  const driverFCMTokensMap = new Map<string, RegisteredDriverFCMToken>();

  // In-memory registry for Admin FCM tokens (enables push to general admin devices)
  interface RegisteredAdminFCMToken {
    token: string;
    adminUid: string;
    adminEmail?: string;
    adminName?: string;
    userAgent?: string;
    updatedAt: string;
  }
  const adminFCMTokensMap = new Map<string, RegisteredAdminFCMToken>();

  // Helper to send FCM Web Push via Google Firebase Cloud Messaging HTTP API
  // This is what delivers notifications even when Chrome is completely closed!
  async function sendFCMWebPush(
    tokens: string[],
    notification: { title: string; body: string; icon?: string; badge?: string; sound?: string; click_action?: string },
    data: Record<string, string>
  ) {
    const fcmServerKey = process.env.FCM_SERVER_KEY || process.env.FIREBASE_SERVER_KEY;
    if (!fcmServerKey) {
      console.log('[FCM-SERVER] ℹ️ Aviso: FCM_SERVER_KEY no está definido en variables de entorno. Para enviar alertas con Chrome cerrado en segundo plano a través de los servidores de Google, agregue FCM_SERVER_KEY en .env');
      return { sent: false, reason: 'NO_FCM_SERVER_KEY' };
    }

    if (!tokens || tokens.length === 0) {
      return { sent: false, reason: 'NO_TOKENS' };
    }

    try {
      const response = await fetch('https://fcm.googleapis.com/fcm/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `key=${fcmServerKey}`
        },
        body: JSON.stringify({
          registration_ids: tokens,
          priority: 'high',
          notification: {
            title: notification.title,
            body: notification.body,
            icon: notification.icon || '/logoryyco.png',
            badge: notification.badge || '/favicon.svg',
            sound: notification.sound || 'default',
            click_action: notification.click_action || '/?view=driver'
          },
          data: {
            ...data,
            title: notification.title,
            body: notification.body
          }
        })
      });

      const resJson = await response.json();
      console.log('[FCM-SERVER] 🚀 Notificación PUSH transmitida a Google FCM para dispositivos en segundo plano/cerrados:', resJson);
      return { sent: true, response: resJson };
    } catch (err: any) {
      console.error('[FCM-SERVER] ❌ Error enviando a Google FCM HTTP API:', err);
      return { sent: false, error: err.message };
    }
  }

  // Register active driver FCM device token with the server
  app.post('/api/fcm/register-driver-token', (req, res) => {
    try {
      const { token, driverId, driverName, phone, vehicleType } = req.body || {};
      if (!token || !driverId) {
        return res.status(400).json({ error: 'Token and driverId are required' });
      }

      driverFCMTokensMap.set(token, {
        token,
        driverId,
        driverName,
        phone,
        vehicleType,
        userAgent: req.headers['user-agent'] as string,
        updatedAt: new Date().toISOString()
      });

      console.log(`[FCM-SERVER] 📲 Token de domiciliario registrado (${driverName || driverId}). Total activos en servidor: ${driverFCMTokensMap.size}`);
      res.json({ status: 'ok', registeredCount: driverFCMTokensMap.size });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Query active driver tokens registered with the server
  app.get('/api/fcm/driver-tokens', (req, res) => {
    res.json({
      status: 'ok',
      count: driverFCMTokensMap.size,
      tokens: Array.from(driverFCMTokensMap.values())
    });
  });

  // Register active admin FCM device token with the server
  app.post('/api/fcm/register-admin-token', (req, res) => {
    try {
      const { token, adminUid, adminEmail, adminName } = req.body || {};
      if (!token) {
        return res.status(400).json({ error: 'Token is required' });
      }

      adminFCMTokensMap.set(token, {
        token,
        adminUid: adminUid || 'admin',
        adminEmail: adminEmail || 'admin@ryyco.com',
        adminName: adminName || 'Administrador General RYYCO',
        userAgent: req.headers['user-agent'] as string,
        updatedAt: new Date().toISOString()
      });

      console.log(`[FCM-SERVER] 📲 Token de administrador registrado (${adminName || adminUid}). Total activos en servidor: ${adminFCMTokensMap.size}`);
      res.json({ status: 'ok', registeredCount: adminFCMTokensMap.size });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Query active admin tokens registered with the server
  app.get('/api/fcm/admin-tokens', (req, res) => {
    res.json({
      status: 'ok',
      count: adminFCMTokensMap.size,
      tokens: Array.from(adminFCMTokensMap.values())
    });
  });

  // Real-time Push Stream (SSE) for Admin, Seller & Driver Dashboards
  app.get('/api/fcm/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    if (typeof (res as any).flushHeaders === 'function') {
      (res as any).flushHeaders();
    }

    const clientId = Math.random().toString(36).substring(2, 12);
    const role = ((req.query.role as string) || 'all') as 'admin' | 'seller' | 'driver' | 'all';
    const sellerUid = (req.query.sellerUid as string) || undefined;
    const driverId = (req.query.driverId as string) || undefined;

    const client: PushClient = { id: clientId, role, sellerUid, driverId, res };
    pushClients.push(client);

    res.write(`data: ${JSON.stringify({ type: 'CONNECTED', clientId, role, timestamp: new Date().toISOString() })}\n\n`);

    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch (e) {
        clearInterval(heartbeat);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(heartbeat);
      const idx = pushClients.findIndex(c => c.id === clientId);
      if (idx !== -1) pushClients.splice(idx, 1);
    });
  });

  // Firebase Cloud Messaging (FCM) Order Notification Broadcast Endpoint
  app.post('/api/fcm/broadcast-order', async (req, res) => {
    try {
      const { orderId, orderNumber, storeName, customerName, totalAmount, itemsCount, tokens: incomingTokens } = req.body || {};
      console.log(`[FCM-SERVER] 🚨 Nuevo pedido para administración general: #${orderNumber || 'S/N'} en "${storeName || 'Tienda'}" por ${customerName || 'Cliente'} ($${totalAmount || 0})`);
      
      // Relay to connected Admin clients (SSE)
      const payload = {
        type: 'ADMIN_ORDER_PUSH',
        orderId,
        orderNumber,
        storeName,
        customerName,
        totalAmount,
        itemsCount,
        timestamp: new Date().toISOString()
      };

      let deliveredSSE = 0;
      pushClients.forEach(c => {
        if (c.role === 'admin' || c.role === 'all') {
          try {
            c.res.write(`data: ${JSON.stringify(payload)}\n\n`);
            deliveredSSE++;
          } catch (e) {}
        }
      });

      // Dispatch to Google FCM for Admin devices in background or with browser closed
      const registeredTokens = Array.from(adminFCMTokensMap.values()).map(t => t.token);
      const passedTokens = Array.isArray(incomingTokens) ? incomingTokens : [];
      const allTokens = Array.from(new Set([...registeredTokens, ...passedTokens]));

      const totalFormatted = totalAmount ? `$${Number(totalAmount).toLocaleString('es-CO')}` : '$0';
      const orderNum = orderNumber ? `#${orderNumber}` : 'S/N';
      const store = storeName || 'Restaurante en RYYCO';
      const customer = customerName || 'Cliente';

      const fcmResult = await sendFCMWebPush(
        allTokens,
        {
          title: `🚨 ¡Nuevo Pedido ${orderNum} en ${store}!`,
          body: `${customer} • Total: ${totalFormatted} COP (${itemsCount || 1} items)`,
          icon: '/logoryyco.png',
          badge: '/favicon.svg',
          sound: 'default',
          click_action: '/?view=admin&tab=orders'
        },
        {
          type: 'ADMIN_ORDER',
          isAdmin: 'true',
          orderId: String(orderId || ''),
          orderNumber: String(orderNumber || ''),
          storeName: String(store),
          customerName: String(customer),
          totalAmount: String(totalAmount || 0),
          itemsCount: String(itemsCount || 1),
          url: '/?view=admin&tab=orders'
        }
      );

      res.json({
        status: 'ok',
        delivered: true,
        deliveredSSE,
        fcmPushTargetTokens: allTokens.length,
        fcmResult,
        orderId,
        orderNumber,
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      console.error('[FCM-SERVER] Error in broadcast-order:', err);
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  });

  // Firebase Cloud Messaging (FCM) Seller Order Notification Broadcast Endpoint
  app.post('/api/fcm/broadcast-seller-order', (req, res) => {
    try {
      const { storeOwnerId, orderId, orderNumber, storeName, customerName, totalAmount, itemsCount } = req.body || {};
      console.log(`[FCM-SERVER] 📦 Nuevo pedido para Vendedor (Tienda: "${storeName || 'Tienda'}" - UID: ${storeOwnerId}): #${orderNumber || 'S/N'} por ${customerName || 'Cliente'} ($${totalAmount || 0})`);

      // Relay to connected Seller clients
      const payload = {
        type: 'SELLER_ORDER_PUSH',
        storeOwnerId,
        orderId,
        orderNumber,
        storeName,
        customerName,
        totalAmount,
        itemsCount,
        timestamp: new Date().toISOString()
      };

      pushClients.forEach(c => {
        if (c.role === 'admin' || (c.role === 'seller' && (!c.sellerUid || c.sellerUid === storeOwnerId)) || c.role === 'all') {
          try {
            c.res.write(`data: ${JSON.stringify(payload)}\n\n`);
          } catch (e) {}
        }
      });

      res.json({
        status: 'ok',
        delivered: true,
        storeOwnerId,
        orderId,
        orderNumber,
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      console.error('[FCM-SERVER] Error in broadcast-seller-order:', err);
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  });

  // Broadcast custom push alert from Admin to a specific seller or all sellers
  app.post('/api/fcm/broadcast-to-seller', (req, res) => {
    try {
      const { storeOwnerId, storeName, title, message } = req.body || {};
      console.log(`[FCM-SERVER] 📢 Emisión de alerta Push a Vendedor (${storeOwnerId === 'all' ? 'TODOS LOS VENDEDORES' : storeOwnerId}): "${title}" - "${message}"`);

      const payload = {
        type: 'CUSTOM_SELLER_ALERT',
        storeOwnerId: storeOwnerId || 'all',
        storeName: storeName || 'Tienda',
        title: title || 'Aviso de Administración RYYCO',
        message: message || 'Tienes un nuevo mensaje importante de la administración.',
        timestamp: new Date().toISOString()
      };

      let deliveredCount = 0;
      pushClients.forEach(c => {
        if (c.role === 'seller' && (storeOwnerId === 'all' || !c.sellerUid || c.sellerUid === storeOwnerId)) {
          try {
            c.res.write(`data: ${JSON.stringify(payload)}\n\n`);
            deliveredCount++;
          } catch (e) {}
        }
      });

      res.json({
        status: 'ok',
        deliveredCount,
        message: `Alerta transmitida a ${deliveredCount} dispositivos conectados`
      });
    } catch (err: any) {
      console.error('[FCM-SERVER] Error in broadcast-to-seller:', err);
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  });

  // Broadcast new delivery request to connected Delivery Drivers (Domiciliarios)
  app.post('/api/fcm/broadcast-driver-request', async (req, res) => {
    try {
      const { orderId, orderNumber, storeName, customerAddress, deliveryCost, customerName, totalAmount, itemsCount, tokens: incomingTokens } = req.body || {};
      console.log(`[FCM-SERVER] 🛵 Nueva solicitud de entrega para Domiciliarios: Pedido #${orderNumber || 'S/N'} en "${storeName || 'Tienda'}" -> Destino: "${customerAddress || 'Ipiales'}" (Tarifa: $${deliveryCost || 0})`);

      const payload = {
        type: 'DRIVER_REQUEST_PUSH',
        orderId,
        orderNumber,
        storeName,
        customerAddress,
        deliveryCost,
        customerName,
        totalAmount,
        itemsCount,
        timestamp: new Date().toISOString()
      };

      // 1. Send via Server-Sent Events to currently connected tabs
      let deliveredCount = 0;
      pushClients.forEach(c => {
        if (c.role === 'driver' || c.role === 'all') {
          try {
            c.res.write(`data: ${JSON.stringify(payload)}\n\n`);
            deliveredCount++;
          } catch (e) {}
        }
      });

      // 2. Dispatch to Google FCM for devices with Chrome in background or closed
      const registeredTokens = Array.from(driverFCMTokensMap.values()).map(t => t.token);
      const passedTokens = Array.isArray(incomingTokens) ? incomingTokens : [];
      const allTokens = Array.from(new Set([...registeredTokens, ...passedTokens]));

      const feeFormatted = deliveryCost ? `$${Number(deliveryCost).toLocaleString('es-CO')}` : '$3.000';
      const fcmResult = await sendFCMWebPush(
        allTokens,
        {
          title: `🛵 ¡Nueva Solicitud de Domicilio #${orderNumber || 'S/N'}!`,
          body: `De: ${storeName || 'Restaurante'}\nPara: ${customerAddress || 'Ipiales'} • Ganancia: ${feeFormatted}`,
          icon: '/logoryyco.png',
          badge: '/favicon.svg',
          sound: 'default',
          click_action: '/?view=driver'
        },
        {
          type: 'DRIVER_REQUEST',
          isDriver: 'true',
          orderId: String(orderId || ''),
          orderNumber: String(orderNumber || ''),
          storeName: String(storeName || 'Restaurante'),
          customerAddress: String(customerAddress || 'Ipiales'),
          deliveryCost: String(deliveryCost || 3000),
          customerName: String(customerName || ''),
          url: '/?view=driver'
        }
      );

      res.json({
        status: 'ok',
        delivered: true,
        deliveredCount,
        fcmPushTargetTokens: allTokens.length,
        fcmResult,
        orderId,
        orderNumber,
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      console.error('[FCM-SERVER] Error in broadcast-driver-request:', err);
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  });

  // Broadcast custom push alert from Admin to a specific driver or all drivers
  app.post('/api/fcm/broadcast-to-driver', async (req, res) => {
    try {
      const { driverId, driverName, title, message } = req.body || {};
      console.log(`[FCM-SERVER] 🛵 Emisión de alerta Push a Domiciliario (${driverId === 'all' ? 'TODOS LOS DOMICILIARIOS' : driverId}): "${title}" - "${message}"`);

      const payload = {
        type: 'CUSTOM_DRIVER_ALERT',
        driverId: driverId || 'all',
        driverName: driverName || 'Domiciliario',
        title: title || 'Aviso para Domiciliarios RYYCO',
        message: message || 'Tienes un nuevo mensaje importante de la administración.',
        timestamp: new Date().toISOString()
      };

      let deliveredCount = 0;
      pushClients.forEach(c => {
        if (c.role === 'driver' && (driverId === 'all' || !c.driverId || c.driverId === driverId)) {
          try {
            c.res.write(`data: ${JSON.stringify(payload)}\n\n`);
            deliveredCount++;
          } catch (e) {}
        }
      });

      // Dispatch to Google FCM for background/closed browsers
      const targetTokens = Array.from(driverFCMTokensMap.values())
        .filter(t => driverId === 'all' || t.driverId === driverId)
        .map(t => t.token);

      const fcmResult = await sendFCMWebPush(
        targetTokens,
        {
          title: title || 'Aviso para Domiciliarios RYYCO',
          body: message || 'Tienes un nuevo mensaje importante de la administración.',
          icon: '/logoryyco.png',
          badge: '/favicon.svg',
          click_action: '/?view=driver'
        },
        {
          type: 'CUSTOM_DRIVER_ALERT',
          isDriver: 'true',
          driverId: driverId || 'all',
          url: '/?view=driver'
        }
      );

      res.json({
        status: 'ok',
        deliveredCount,
        fcmPushTargetTokens: targetTokens.length,
        fcmResult,
        message: `Alerta transmitida a ${deliveredCount} domiciliarios conectados y ${targetTokens.length} dispositivos en segundo plano`
      });
    } catch (err: any) {
      console.error('[FCM-SERVER] Error in broadcast-to-driver:', err);
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  });

  app.post('/api/fcm/test', async (req, res) => {
    console.log('[FCM-SERVER] 🧪 Test push notification triggered for Admin Panel');
    const testPayload = {
      type: 'ADMIN_ORDER_PUSH',
      orderId: 'test_order_' + Date.now(),
      orderNumber: 777,
      storeName: 'Restaurante Ejemplo RYYCO',
      customerName: 'Prueba FCM Admin',
      totalAmount: 36000,
      itemsCount: 2,
      timestamp: new Date().toISOString()
    };

    let deliveredSSE = 0;
    pushClients.forEach(c => {
      if (c.role === 'admin' || c.role === 'all') {
        try {
          c.res.write(`data: ${JSON.stringify(testPayload)}\n\n`);
          deliveredSSE++;
        } catch (e) {}
      }
    });

    const adminTokens = Array.from(adminFCMTokensMap.values()).map(t => t.token);
    const fcmResult = await sendFCMWebPush(
      adminTokens,
      {
        title: '🚨 ¡Nuevo Pedido #777 en Restaurante Ejemplo RYYCO!',
        body: 'Prueba FCM Admin • Total: $36.000 COP (2 items)',
        icon: '/logoryyco.png',
        badge: '/favicon.svg',
        click_action: '/?view=admin&tab=orders'
      },
      {
        type: 'ADMIN_ORDER',
        isAdmin: 'true',
        orderId: testPayload.orderId,
        orderNumber: '777',
        storeName: 'Restaurante Ejemplo RYYCO',
        customerName: 'Prueba FCM Admin',
        totalAmount: '36000',
        itemsCount: '2',
        url: '/?view=admin&tab=orders'
      }
    );

    res.json({
      status: 'ok',
      message: 'Notificación de prueba FCM transmitida a administradores',
      deliveredSSE,
      fcmPushTargetTokens: adminTokens.length,
      fcmResult,
      timestamp: new Date().toISOString()
    });
  });

  app.post('/api/fcm/seller-test', (req, res) => {
    const { storeOwnerId, storeName } = req.body || {};
    console.log(`[FCM-SERVER] Test push notification triggered for Seller: "${storeName || 'Tienda'}" (${storeOwnerId || 'Desconocido'})`);
    res.json({
      status: 'ok',
      message: `Notificación de prueba FCM recibida para vendedor (${storeName || 'Tienda'})`,
      timestamp: new Date().toISOString()
    });
  });

  app.post('/api/fcm/driver-test', (req, res) => {
    const { driverId, driverName } = req.body || {};
    console.log(`[FCM-SERVER] Test push notification triggered for Driver: "${driverName || 'Domiciliario'}" (${driverId || 'Desconocido'})`);
    res.json({
      status: 'ok',
      message: `Notificación de prueba FCM recibida para domiciliario (${driverName || 'Domiciliario'})`,
      timestamp: new Date().toISOString()
    });
  });

  // Google Maps Platform Configuration endpoint (provides client config and API key for interactive maps)
  app.get(['/api/maps/config', '/api/maps-config.php'], (req, res) => {
    const mapsKey = process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
    res.json({
      status: 'ok',
      configured: Boolean(mapsKey),
      apiKey: mapsKey,
      provider: mapsKey ? 'google' : 'leaflet',
      source: 'node_server'
    });
  });

  app.get('/api/maps/key', (req, res) => {
    const mapsKey = process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
    res.json({
      status: 'ok',
      configured: Boolean(mapsKey),
      apiKey: mapsKey
    });
  });

// Helper to format or calculate Colombian street name with house number in Ipiales/Colombia
function formatColombianStreetWithHouseNumber(streetName: string, houseNumber: string | undefined, lat: number, lng: number): string {
  if (!streetName || !streetName.trim()) {
    streetName = 'Calle';
  }
  const cleanStreet = streetName.trim();

  // If houseNumber already provided (e.g. from Google or OSM), format as "Street #HouseNumber"
  if (houseNumber && houseNumber.trim()) {
    const cleanNum = houseNumber.replace(/^[#№No\.]+\s*/i, '').trim();
    if (cleanNum) {
      return `${cleanStreet} #${cleanNum}`;
    }
  }

  // If streetName already has a house/door number (e.g. "Calle 24 # 13-40" or "Carrera 6 # 8-20")
  if (/#\s*\d+/i.test(cleanStreet) || /\b(n[o°]\.?|num)\s*\d+/i.test(cleanStreet)) {
    return cleanStreet;
  }

  // Check orientation (Calle vs Carrera vs Avenida)
  const isCalle = /\b(calle|cll|diagonal|transversal|cl)\b/i.test(cleanStreet);
  const isCarrera = /\b(carrera|cra|kr|kfe|cr)\b/i.test(cleanStreet);

  if (isCalle) {
    // Calles run East-West; Carreras cross them (longitude becomes more negative moving West from -77.6330)
    const baseLng = -77.6330;
    const diff = Math.max(0, baseLng - lng);
    const carreraCross = Math.max(1, Math.min(26, Math.round(1 + (diff / 0.00135))));
    const fraction = (diff / 0.00135) - Math.floor(diff / 0.00135);
    const rawPlaca = Math.floor(fraction * 82) + 12;
    const isEven = Math.round(Math.abs(lat) * 100000) % 2 === 0;
    const door = isEven ? rawPlaca - (rawPlaca % 2) : rawPlaca - (rawPlaca % 2) + 1;
    const plateStr = door < 10 ? `0${door}` : `${door}`;
    return `${cleanStreet} #${carreraCross}-${plateStr}`;
  } else if (isCarrera) {
    // Carreras run North-South; Calles cross them (latitude increases moving North from 0.8150)
    const baseLat = 0.8150;
    const diff = Math.max(0, lat - baseLat);
    const calleCross = Math.max(1, Math.min(36, Math.round(4 + (diff / 0.00092))));
    const fraction = (diff / 0.00092) - Math.floor(diff / 0.00092);
    const rawPlaca = Math.floor(fraction * 82) + 10;
    const isEven = Math.round(Math.abs(lng) * 100000) % 2 === 0;
    const door = isEven ? rawPlaca - (rawPlaca % 2) : rawPlaca - (rawPlaca % 2) + 1;
    const plateStr = door < 10 ? `0${door}` : `${door}`;
    return `${cleanStreet} #${calleCross}-${plateStr}`;
  } else {
    // Other roads (Avenida Panamericana, etc.) or unnamed streets:
    const baseLng = -77.6330;
    const diff = Math.max(0, baseLng - lng);
    const crossNum = Math.max(1, Math.min(26, Math.round(1 + (diff / 0.00135))));
    const fraction = (diff / 0.00135) - Math.floor(diff / 0.00135);
    const door = Math.floor(fraction * 80) + 14;
    return `${cleanStreet} #${crossNum}-${door < 10 ? '0' + door : door}`;
  }
}

// Deterministic Colombian Address Parser & Geocoder for Ipiales
function parseColombianAddressToCoords(query: string): { formattedTitle: string; lat: number; lng: number } | null {
  if (!query || typeof query !== 'string') return null;
  const clean = query.trim().replace(/,/g, ' ').replace(/\s+/g, ' ');
  const regex = /^(calle|cll|cl|c\.|carrera|cra|cr|kr|k\.|avenida|av|av\.|diagonal|diag|dg|transversal|trans|tv)\s*([0-9]{1,3}\s*[a-zA-Z]?)(?:\s*(?:[#№no\.\s°]+|con\s+(?:carrera|calle|cra|cll|cr|cl)?\s*|\s+)\s*([0-9]{1,3}\s*[a-zA-Z]?)(?:[\s\-\#]+([0-9]{1,4}))?)?/i;
  const match = clean.match(regex);
  if (!match) {
    if (/panamericana/i.test(clean)) {
      const numMatch = clean.match(/([0-9]{1,3})[\s\-\#]+([0-9]{1,3})/);
      const cross = numMatch ? parseInt(numMatch[1], 10) : 15;
      const door = numMatch ? parseInt(numMatch[2], 10) : 40;
      return {
        formattedTitle: `Avenida Panamericana #${cross}-${door < 10 ? '0' + door : door}`,
        lat: 0.8380,
        lng: -77.6350
      };
    }
    return null;
  }

  const rawType = match[1].toLowerCase();
  const rawMain = match[2].replace(/\s+/g, '').toUpperCase();
  const rawCross = match[3] ? match[3].replace(/\s+/g, '').toUpperCase() : '';
  const rawDoor = match[4] ? parseInt(match[4], 10) : undefined;

  let mainType = 'Calle';
  let isCalle = true;
  if (/^(carrera|cra|cr|kr|k\.)/i.test(rawType)) {
    mainType = 'Carrera';
    isCalle = false;
  } else if (/^(avenida|av|av\.)/i.test(rawType)) {
    mainType = 'Avenida';
    isCalle = true;
  } else if (/^(diagonal|diag|dg)/i.test(rawType)) {
    mainType = 'Diagonal';
    isCalle = true;
  } else if (/^(transversal|trans|tv)/i.test(rawType)) {
    mainType = 'Transversal';
    isCalle = false;
  }

  let formattedTitle = `${mainType} ${rawMain}`;
  if (rawCross) {
    formattedTitle += ` # ${rawCross}`;
    if (rawDoor !== undefined && !isNaN(rawDoor)) {
      formattedTitle += `-${rawDoor < 10 ? '0' + rawDoor : rawDoor}`;
    }
  }

  const mainNumOnly = parseInt(rawMain.replace(/[^0-9]/g, ''), 10) || 10;
  const mainLetter = (rawMain.match(/[A-Z]/i) || [''])[0].toUpperCase();
  const mainLetterBonus = mainLetter === 'A' ? 0.33 : mainLetter === 'B' ? 0.66 : mainLetter === 'C' ? 0.9 : 0;
  const mainEffective = mainNumOnly + mainLetterBonus;

  const crossNumOnly = rawCross ? (parseInt(rawCross.replace(/[^0-9]/g, ''), 10) || 6) : 6;
  const crossLetter = rawCross ? (rawCross.match(/[A-Z]/i) || [''])[0].toUpperCase() : '';
  const crossLetterBonus = crossLetter === 'A' ? 0.33 : crossLetter === 'B' ? 0.66 : crossLetter === 'C' ? 0.9 : 0;
  const crossEffective = crossNumOnly + crossLetterBonus;

  const doorFraction = rawDoor !== undefined && !isNaN(rawDoor) ? Math.min(0.95, Math.max(0.05, rawDoor / 100)) : 0.45;

  let lat = 0.83028;
  let lng = -77.64444;

  if (isCalle) {
    const calleDelta = (mainEffective - 14) * 0.00055;
    lat = 0.8300 + calleDelta;
    const craDelta = (crossEffective - 6) * 0.00095;
    const doorDelta = doorFraction * 0.00095;
    lng = -77.6450 - craDelta - doorDelta;
  } else {
    const craDelta = (mainEffective - 6) * 0.00095;
    lng = -77.6450 - craDelta;
    const calleDelta = (crossEffective - 14) * 0.00055;
    const doorDelta = doorFraction * 0.00055;
    lat = 0.8300 + calleDelta + doorDelta;
  }

  lat = Math.max(0.8160, Math.min(0.8490, lat));
  lng = Math.max(-77.6650, Math.min(-77.6300, lng));

  return { formattedTitle, lat, lng };
}

// Circuit breakers for third-party public geocoders
let photonDisabledUntil = 0;
let nominatimDisabledUntil = 0;

  // Google Maps Platform Geocoding endpoint (handles forward and reverse geocoding with server-side API key proxy and fast fallbacks)
  app.get(['/api/maps/geocode', '/api/maps-geocode.php'], async (req, res) => {
    const lat = req.query.lat as string | undefined;
    const lng = req.query.lng as string | undefined;
    const rawAddress = req.query.address as string | undefined;
    // Always bias searches to Ipiales, Nariño, Colombia
    const address = rawAddress 
      ? (rawAddress.toLowerCase().includes('ipiales') ? rawAddress : `${rawAddress}, Ipiales, Nariño, Colombia`) 
      : undefined;

    const mapsKey = process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY;

    try {
      // 1. Try Google Maps API if key is present (with 2s timeout)
      if (mapsKey) {
        let url = '';
        if (lat && lng) {
          url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=es&key=${mapsKey}`;
        } else if (address) {
          url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&components=country:CO&bounds=0.70,-77.75|0.95,-77.50&language=es&key=${mapsKey}`;
        }
        if (url) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);
            const gRes = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);
            const gData = await gRes.json();
            if (gData.status === 'OK' && gData.results && gData.results.length > 0) {
              const withNumber = gData.results.find((r: any) => 
                r.types?.includes('street_address') || 
                r.types?.includes('premise') ||
                r.address_components?.some((c: any) => c.types?.includes('street_number'))
              ) || gData.results[0];

              let route = '';
              let streetNumber = '';
              let neighborhood = '';
              let locality = 'Ipiales';

              for (const comp of (withNumber.address_components || [])) {
                if (comp.types.includes('route')) route = comp.long_name;
                if (comp.types.includes('street_number')) streetNumber = comp.long_name;
                if (comp.types.includes('neighborhood') || comp.types.includes('sublocality')) neighborhood = comp.long_name;
                if (comp.types.includes('locality')) locality = comp.long_name;
              }

              let formatted = withNumber.formatted_address;
              if (lat && lng) {
                const streetWithNum = formatColombianStreetWithHouseNumber(route || formatted.split(',')[0], streetNumber, parseFloat(lat), parseFloat(lng));
                formatted = `${streetWithNum}, ${neighborhood ? neighborhood + ', ' : ''}${locality}, Nariño, Colombia`;
              }

              return res.json({
                status: 'OK',
                formatted_address: formatted,
                street: route || undefined,
                house_number: streetNumber || undefined,
                lat: withNumber.geometry.location.lat,
                lng: withNumber.geometry.location.lng,
                source: 'google'
              });
            }
          } catch {
            // Silently fall through to next geocoder
          }
        }
      }

      // 2. High-speed Photon reverse / forward geocoder (< 300ms) with circuit breaker
      const now = Date.now();
      if (now > photonDisabledUntil) {
        if (lat && lng) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1800);
            const pRes = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}`, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (pRes.ok) {
              const pData = await pRes.json();
              if (pData?.features && pData.features.length > 0) {
                const p = pData.features[0].properties;
                const rawStreet = p.street || p.name || 'Calle';
                const streetWithNumber = formatColombianStreetWithHouseNumber(rawStreet, p.housenumber, parseFloat(lat), parseFloat(lng));
                
                const parts = [
                  streetWithNumber,
                  p.district || p.suburb || p.locality || null,
                  p.city || p.county || 'Ipiales',
                  p.state || 'Nariño'
                ].filter(Boolean);

                const formatted = parts.length > 0 ? parts.join(', ') : '';
                if (formatted) {
                  return res.json({
                    status: 'OK',
                    formatted_address: formatted,
                    street: rawStreet,
                    house_number: p.housenumber,
                    lat: parseFloat(lat),
                    lng: parseFloat(lng),
                    source: 'photon'
                  });
                }
              }
            } else {
              photonDisabledUntil = Date.now() + 5 * 60 * 1000;
            }
          } catch {
            // Photon is down or connection refused; disable for 10 minutes to eliminate lag and stderr errors
            photonDisabledUntil = Date.now() + 10 * 60 * 1000;
          }
        } else if (address) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1800);
            const pRes = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(address)}&lat=0.83028&lon=-77.64444&limit=1`, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (pRes.ok) {
              const pData = await pRes.json();
              if (pData?.features && pData.features.length > 0) {
                const f = pData.features[0];
                const p = f.properties;
                const coords = f.geometry?.coordinates;
                const rawStreet = p.street || p.name || 'Calle';
                const streetWithNumber = coords 
                  ? formatColombianStreetWithHouseNumber(rawStreet, p.housenumber, coords[1], coords[0])
                  : (p.housenumber ? `${rawStreet} #${p.housenumber}` : rawStreet);

                const parts = [
                  streetWithNumber,
                  p.district || p.suburb || p.locality || null,
                  p.city || p.county || 'Ipiales',
                  p.state || 'Nariño'
                ].filter(Boolean);

                return res.json({
                  status: 'OK',
                  formatted_address: parts.join(', ') || address,
                  lat: coords ? coords[1] : 0.83028,
                  lng: coords ? coords[0] : -77.64444,
                  source: 'photon'
                });
              }
            } else {
              photonDisabledUntil = Date.now() + 5 * 60 * 1000;
            }
          } catch {
            photonDisabledUntil = Date.now() + 10 * 60 * 1000;
          }
        }
      }

      // 3. Fallback to OpenStreetMap Nominatim with circuit breaker
      if (now > nominatimDisabledUntil) {
        if (lat && lng) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);
            const nomRes = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
              { 
                signal: controller.signal,
                headers: { 'User-Agent': 'RyycoStore/1.0', 'Accept-Language': 'es' } 
              }
            );
            clearTimeout(timeoutId);
            if (nomRes.ok) {
              const data = await nomRes.json();
              const addr = data.address || {};
              const road = addr.road || addr.pedestrian || addr.cycleway || 'Calle';
              const houseNum = addr.house_number;
              const streetWithNumber = formatColombianStreetWithHouseNumber(road, houseNum, parseFloat(lat), parseFloat(lng));
              const parts = [
                streetWithNumber,
                addr.neighbourhood || addr.suburb || addr.residential || null,
                addr.city || addr.town || 'Ipiales',
                addr.state || 'Nariño'
              ].filter(Boolean);

              return res.json({
                status: 'OK',
                formatted_address: parts.join(', '),
                street: road,
                house_number: houseNum,
                lat: parseFloat(lat),
                lng: parseFloat(lng),
                source: 'nominatim'
              });
            } else {
              nominatimDisabledUntil = Date.now() + 5 * 60 * 1000;
            }
          } catch {
            nominatimDisabledUntil = Date.now() + 5 * 60 * 1000;
          }
        } else if (address) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);
            const nomRes = await fetch(
              `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&countrycodes=co&viewbox=-77.75,0.95,-77.50,0.70&limit=1`,
              { 
                signal: controller.signal,
                headers: { 'User-Agent': 'RyycoStore/1.0', 'Accept-Language': 'es' } 
              }
            );
            clearTimeout(timeoutId);
            if (nomRes.ok) {
              const data = await nomRes.json();
              if (Array.isArray(data) && data.length > 0) {
                return res.json({
                  status: 'OK',
                  formatted_address: data[0].display_name,
                  lat: parseFloat(data[0].lat),
                  lng: parseFloat(data[0].lon),
                  source: 'nominatim'
                });
              }
            } else {
              nominatimDisabledUntil = Date.now() + 5 * 60 * 1000;
            }
          } catch {
            nominatimDisabledUntil = Date.now() + 5 * 60 * 1000;
          }
        }
      }

      // 4. Guaranteed mathematical fallback: Colombian street and house number by coordinate
      if (lat && lng) {
        const fallbackStreet = formatColombianStreetWithHouseNumber('Calle', undefined, parseFloat(lat), parseFloat(lng));
        return res.json({
          status: 'OK',
          formatted_address: `${fallbackStreet}, Ipiales, Nariño, Colombia`,
          street: fallbackStreet.split('#')[0].trim(),
          house_number: fallbackStreet.split('#')[1]?.trim(),
          lat: parseFloat(lat),
          lng: parseFloat(lng),
          source: 'coords'
        });
      }

      // 5. Deterministic Colombian address forward geocoding fallback for Ipiales
      if (rawAddress) {
        const parsed = parseColombianAddressToCoords(rawAddress);
        if (parsed) {
          return res.json({
            status: 'OK',
            formatted_address: `${parsed.formattedTitle}, Ipiales, Nariño, Colombia`,
            street: parsed.formattedTitle.split('#')[0].trim(),
            house_number: parsed.formattedTitle.split('#')[1]?.trim(),
            lat: parsed.lat,
            lng: parsed.lng,
            source: 'colombian_grid'
          });
        }
      }

      // Default safe fallback centered on Ipiales, Nariño, Colombia
      return res.json({
        status: 'OK',
        formatted_address: address || 'Centro, Ipiales, Nariño, Colombia',
        lat: 0.83028,
        lng: -77.64444,
        source: 'default_ipiales'
      });
    } catch {
      // Safe fallback if unexpected issue occurs
      const safeLat = lat ? parseFloat(lat) : 0.83028;
      const safeLng = lng ? parseFloat(lng) : -77.64444;
      const fallbackStreet = formatColombianStreetWithHouseNumber('Calle', undefined, safeLat, safeLng);
      return res.json({
        status: 'OK',
        formatted_address: `${fallbackStreet}, Ipiales, Nariño, Colombia`,
        lat: safeLat,
        lng: safeLng,
        source: 'coords'
      });
    }
  });

  // Serve static files from public directory
  app.use(express.static(path.join(process.cwd(), 'public')));

  // Serve static files / Vite middleware
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Linnk.Pro Express full-stack server running on http://localhost:${PORT}`);
  });
}

startServer();

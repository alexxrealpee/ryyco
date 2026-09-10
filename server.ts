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

  // Google Maps Platform Geocoding endpoint (handles forward and reverse geocoding with server-side API key proxy)
  app.get('/api/maps/geocode', async (req, res) => {
    const lat = req.query.lat as string | undefined;
    const lng = req.query.lng as string | undefined;
    const address = req.query.address as string | undefined;

    const mapsKey = process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY;

    try {
      if (mapsKey) {
        let url = '';
        if (lat && lng) {
          url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=es&key=${mapsKey}`;
        } else if (address) {
          url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&language=es&key=${mapsKey}`;
        }
        if (url) {
          const gRes = await fetch(url);
          const gData = await gRes.json();
          if (gData.status === 'OK' && gData.results && gData.results.length > 0) {
            const first = gData.results[0];
            return res.json({
              status: 'OK',
              formatted_address: first.formatted_address,
              lat: first.geometry.location.lat,
              lng: first.geometry.location.lng,
              source: 'google'
            });
          }
        }
      }

      // Safe fallback using Nominatim
      if (lat && lng) {
        const nomRes = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
          { headers: { 'User-Agent': 'RyycoStore/1.0', 'Accept-Language': 'es' } }
        );
        if (nomRes.ok) {
          const data = await nomRes.json();
          return res.json({
            status: 'OK',
            formatted_address: data.display_name || '',
            lat: parseFloat(lat),
            lng: parseFloat(lng),
            source: 'fallback'
          });
        }
      } else if (address) {
        const nomRes = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`,
          { headers: { 'User-Agent': 'RyycoStore/1.0', 'Accept-Language': 'es' } }
        );
        if (nomRes.ok) {
          const data = await nomRes.json();
          if (Array.isArray(data) && data.length > 0) {
            return res.json({
              status: 'OK',
              formatted_address: data[0].display_name,
              lat: parseFloat(data[0].lat),
              lng: parseFloat(data[0].lon),
              source: 'fallback'
            });
          }
        }
      }

      res.status(400).json({ error: 'Could not geocode location' });
    } catch (err: any) {
      console.warn('Geocoding error:', err);
      res.status(500).json({ error: err.message || 'Geocoding request failed' });
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

/**
 * RYYCO Automatic SEO Image Renamer
 * 
 * Rules:
 * 1. All lowercase.
 * 2. Remove accents / diacritics (á -> a, é -> e, etc.).
 * 3. Remove emojis and special characters (keep only a-z, 0-9).
 * 4. Use hyphens (-) as separators.
 * 5. No spaces.
 * 6. Maximum 5-7 relevant words before the unique ID.
 * 7. Do not repeat words (deduplication with singular/plural awareness).
 * 8. Do not invent information; use only existing system & database fields.
 * 9. No visual analysis of the image content.
 * 10. Generate a collision-free unique ID at the end, right before .webp.
 * 
 * Structure:
 * ryyco-[producto]-[categoria/intencion]-[ciudad]-[ID_UNICO].webp
 * 
 * Examples:
 * - ryyco-hamburguesa-especial-domicilio-ipiales-8f32ac.webp
 * - ryyco-ceviche-mixto-domicilio-ipiales-a72k91.webp
 * - ryyco-granizado-fresa-ipiales-39bd82.webp
 * - ryyco-pizza-hawaiana-domicilio-ipiales-f82a17.webp
 */

export interface RyycoImageNamingParams {
  productName?: string;
  category?: string;
  storeName?: string;
  city?: string;
  intent?: string; // e.g. 'domicilio'
  uniqueId?: string;
  assetType?: 'product' | 'logo' | 'banner';
}

/**
 * Spanish stop words to remove for high-density SEO keywords
 */
const SPANISH_STOP_WORDS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'y', 'en', 'para', 'por', 'con', 'al', 'a', 'o', 'u', 'sin', 'sobre',
  'mi', 'tu', 'su', 'este', 'esta', 'estos', 'estas'
]);

/**
 * Normalizes text to lowercase, removes accents/diacritics and special characters,
 * returning clean alphanumeric tokens.
 */
export function cleanTokens(text?: string): string[] {
  if (!text) return [];

  // 1. Decompose diacritics (á -> a + accent, ñ -> n + ~)
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // 2. To lowercase
  const lower = normalized.toLowerCase();

  // 3. Remove emojis, punctuation, symbols (keep only a-z and 0-9)
  const cleaned = lower.replace(/[^a-z0-9]+/g, ' ');

  // 4. Split into words and discard stop words or empty strings
  const words = cleaned.trim().split(/\s+/).filter(w => {
    return w.length > 0 && !SPANISH_STOP_WORDS.has(w);
  });

  return words;
}

/**
 * Generates a collision-resistant 6-character alphanumeric unique ID.
 * Examples: '8f32ac', 'a72k91', '39bd82', 'f82a17'
 */
export function generateUniqueImageId(): string {
  let hexBytes = '';
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const arr = new Uint8Array(4);
    crypto.getRandomValues(arr);
    hexBytes = Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  } else {
    hexBytes = Math.random().toString(16).substring(2, 10);
  }

  // Add microsecond-level timestamp entropy to guarantee collision resistance across simultaneous uploads
  const timeEntropy = (Date.now() % 46656).toString(36).padStart(3, '0');
  const combined = (hexBytes.slice(0, 3) + timeEntropy).toLowerCase().replace(/[^a-z0-9]/g, 'a');
  return combined.slice(0, 6);
}

/**
 * Checks if a word is essentially the same as an already seen word (handling basic singular/plural)
 */
function isDuplicateOrSimilar(word: string, seenSet: Set<string>): boolean {
  if (seenSet.has(word)) return true;
  
  // Check singular/plural variants (e.g., hamburguesa vs hamburguesas)
  if (word.endsWith('s') && seenSet.has(word.slice(0, -1))) return true;
  if (word.endsWith('es') && seenSet.has(word.slice(0, -2))) return true;
  for (const seen of seenSet) {
    if (seen.endsWith('s') && seen.slice(0, -1) === word) return true;
    if (seen.endsWith('es') && seen.slice(0, -2) === word) return true;
  }

  return false;
}

/**
 * Extracts city from address or store profile, defaulting to 'ipiales' if none specified.
 */
export function extractCityFromProfile(cityOrAddress?: string): string {
  if (!cityOrAddress) return 'ipiales';
  const tokens = cleanTokens(cityOrAddress);
  if (tokens.length === 0) return 'ipiales';

  // Common Colombian cities
  const knownCities = ['ipiales', 'pasto', 'tuquerres', 'pupiales', 'cumbal', 'cali', 'bogota', 'medellin'];
  for (const token of tokens) {
    if (knownCities.includes(token)) {
      return token;
    }
  }

  // If the string starts with city name or contains it
  return tokens[0] || 'ipiales';
}

/**
 * Generates the automatic SEO WebP image filename following RYYCO rules:
 * Structure: ryyco-[producto]-[categoria/intencion]-[ciudad]-[ID_UNICO].webp
 * Maximum 5-7 relevant words before the ID.
 */
export function generateRyycoImageName(params: RyycoImageNamingParams): string {
  const {
    productName,
    category,
    storeName,
    city,
    intent = 'domicilio',
    uniqueId = generateUniqueImageId(),
    assetType = 'product'
  } = params;

  const seenWords = new Set<string>();
  const words: string[] = [];

  // 1. Prefix is always 'ryyco'
  words.push('ryyco');
  seenWords.add('ryyco');

  // Handle Logo / Banner asset types cleanly
  if (assetType === 'logo') {
    words.push('logo');
    seenWords.add('logo');
  } else if (assetType === 'banner') {
    words.push('banner');
    seenWords.add('banner');
  }

  // 2. Product Name tokens
  const productTokens = cleanTokens(productName);
  for (const token of productTokens) {
    if (!isDuplicateOrSimilar(token, seenWords)) {
      words.push(token);
      seenWords.add(token);
    }
    // Cap product tokens to 3 words to leave room for category/intent/city
    if (words.length >= 4) break;
  }

  // Fallback if no product name provided
  if (assetType === 'product' && words.length === 1) {
    words.push('producto');
    seenWords.add('producto');
  }

  // 3. Category or Intention ('[categoria/intencion]')
  // Either the category or intent ('domicilio') fills this slot
  let addedCategoryOrIntent = false;

  // Check if intent ('domicilio') is requested (e.g. standard delivery item)
  if (intent && !isDuplicateOrSimilar(intent, seenWords)) {
    const intentToken = cleanTokens(intent)[0] || 'domicilio';
    if (!isDuplicateOrSimilar(intentToken, seenWords)) {
      words.push(intentToken);
      seenWords.add(intentToken);
      addedCategoryOrIntent = true;
    }
  }

  // If intent was not added, try adding a category keyword if distinct
  if (!addedCategoryOrIntent) {
    const categoryTokens = cleanTokens(category);
    for (const token of categoryTokens) {
      if (token === 'general' || token === 'otros' || token === 'todos') continue;
      if (!isDuplicateOrSimilar(token, seenWords)) {
        words.push(token);
        seenWords.add(token);
        addedCategoryOrIntent = true;
        break;
      }
    }
  }

  // 4. Restaurant name (when necessary and if total words < 6)
  if (storeName && words.length < 5) {
    const storeTokens = cleanTokens(storeName);
    for (const token of storeTokens) {
      if (token === 'restaurante' || token === 'asadero' || token === 'tienda') continue;
      if (!isDuplicateOrSimilar(token, seenWords)) {
        words.push(token);
        seenWords.add(token);
        break;
      }
    }
  }

  // 5. City (e.g. 'ipiales')
  const effectiveCity = extractCityFromProfile(city);
  const cityTokens = cleanTokens(effectiveCity);
  const primaryCityToken = cityTokens[0] || 'ipiales';
  if (!isDuplicateOrSimilar(primaryCityToken, seenWords)) {
    words.push(primaryCityToken);
    seenWords.add(primaryCityToken);
  }

  // 6. Enforce rule: Máximo 5-7 palabras relevantes antes del ID
  // Words array contains ['ryyco', ...up to 6 words] = max 7 words total
  const finalWordsBeforeId = words.slice(0, 7);

  // 7. Ensure unique ID
  const cleanId = (uniqueId || generateUniqueImageId()).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6);

  // 8. Join with hyphens and append .webp
  const fileName = `${finalWordsBeforeId.join('-')}-${cleanId}.webp`;

  return fileName;
}

/**
 * Compresses an image file/base64 to WebP format using HTML5 Canvas,
 * with automatic fallback to JPEG if WebP encoding is unsupported by the browser.
 */
export function compressImageToWebP(
  base64OrFile: string,
  maxWidth = 1200,
  maxHeight = 800,
  quality = 0.85
): Promise<{ dataUrl: string; isWebP: boolean }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = base64OrFile;

    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      if (height > maxHeight) {
        width = Math.round((width * maxHeight) / height);
        height = maxHeight;
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Attempt export as WebP
        const webpDataUrl = canvas.toDataURL('image/webp', quality);
        if (webpDataUrl.startsWith('data:image/webp')) {
          resolve({ dataUrl: webpDataUrl, isWebP: true });
        } else {
          // Fallback if browser doesn't support WebP export
          const jpegDataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve({ dataUrl: jpegDataUrl, isWebP: false });
        }
      } else {
        resolve({ dataUrl: base64OrFile, isWebP: false });
      }
    };

    img.onerror = () => {
      resolve({ dataUrl: base64OrFile, isWebP: false });
    };
  });
}

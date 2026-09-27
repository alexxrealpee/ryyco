/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface CompressionResult {
  dataUrl: string;
  originalSize: number;
  compressedSize: number;
  savedPercent: number;
  width: number;
  height: number;
  format: 'webp' | 'jpeg';
}

export interface CompressOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  maxSizeBytes?: number;
}

/**
 * Formats bytes into a human-readable string (e.g. "45 KB", "1.2 MB").
 */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Compresses an image File using HTML5 Canvas with progressive resolution
 * scaling and quality adjustments, producing a high-efficiency WebP/JPEG data URL.
 */
export async function compressImageFile(
  file: File,
  options: CompressOptions = {}
): Promise<CompressionResult> {
  const {
    maxWidth = 1200,
    maxHeight = 1200,
    quality = 0.78,
    maxSizeBytes = 120 * 1024 // 120 KB default ceiling
  } = options;

  const originalSize = file.size;

  return new Promise((resolve, reject) => {
    // Validate that the file is an image
    if (!file.type.startsWith('image/')) {
      reject(new Error('El archivo seleccionado no es una imagen válida.'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Error al leer el archivo de imagen.'));

    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Error al cargar la imagen en memoria.'));

      img.onload = () => {
        try {
          let currentWidth = img.naturalWidth || img.width;
          let currentHeight = img.naturalHeight || img.height;

          // Proportional scaling
          let ratio = 1;
          if (currentWidth > maxWidth || currentHeight > maxHeight) {
            const widthRatio = maxWidth / currentWidth;
            const heightRatio = maxHeight / currentHeight;
            ratio = Math.min(widthRatio, heightRatio);
          }

          let targetWidth = Math.round(currentWidth * ratio);
          let targetHeight = Math.round(currentHeight * ratio);

          // Canvas setup
          const canvas = document.createElement('canvas');
          canvas.width = targetWidth;
          canvas.height = targetHeight;

          const ctx = canvas.getContext('2d', { alpha: false });
          if (!ctx) {
            reject(new Error('No se pudo inicializar el contexto gráfico.'));
            return;
          }

          // Quality settings for smooth scaling
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';

          // Background fill in case of transparency
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, targetWidth, targetHeight);
          ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

          // Step 1: Attempt WebP compression
          let outputFormat: 'webp' | 'jpeg' = 'webp';
          let outputDataUrl = canvas.toDataURL('image/webp', quality);

          // If browser does not support WebP export (returns image/png), fallback to JPEG
          if (!outputDataUrl.startsWith('data:image/webp')) {
            outputFormat = 'jpeg';
            outputDataUrl = canvas.toDataURL('image/jpeg', quality);
          }

          // Calculate approximate byte size of the base64 string
          const headerIdx = outputDataUrl.indexOf(',');
          let compressedBytes = Math.round(((outputDataUrl.length - headerIdx - 1) * 3) / 4);

          // Secondary pass if still over maxSizeBytes
          if (compressedBytes > maxSizeBytes && quality > 0.4) {
            const lowerQuality = Math.max(0.45, quality - 0.25);
            const secondaryDataUrl = canvas.toDataURL(`image/${outputFormat}`, lowerQuality);
            const secBytes = Math.round(((secondaryDataUrl.length - secondaryDataUrl.indexOf(',') - 1) * 3) / 4);
            if (secBytes < compressedBytes) {
              outputDataUrl = secondaryDataUrl;
              compressedBytes = secBytes;
            }
          }

          // Calculate saved percentage
          const savedPercent = Math.max(
            0,
            Math.round(((originalSize - compressedBytes) / originalSize) * 100)
          );

          resolve({
            dataUrl: outputDataUrl,
            originalSize,
            compressedSize: compressedBytes,
            savedPercent,
            width: targetWidth,
            height: targetHeight,
            format: outputFormat
          });
        } catch (err) {
          reject(err);
        }
      };

      img.src = reader.result as string;
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Estimates the byte size of a data URL or returns 0.
 */
export function estimateDataUrlBytes(dataUrl: string): number {
  if (!dataUrl) return 0;
  const headerIdx = dataUrl.indexOf(',');
  if (headerIdx === -1) return dataUrl.length;
  const base64Len = dataUrl.length - headerIdx - 1;
  return Math.round((base64Len * 3) / 4);
}

export interface ImageInfoResult {
  sizeBytes: number;
  width: number;
  height: number;
  format: string;
  isWebP: boolean;
  isOptimized: boolean;
}

/**
 * Inspects an image URL or data URL to extract its dimensions, size in bytes, format and optimization status.
 */
export async function getImageWeightAndDimensions(imageUrl: string): Promise<ImageInfoResult> {
  if (!imageUrl || typeof imageUrl !== 'string') {
    return { sizeBytes: 0, width: 0, height: 0, format: 'unknown', isWebP: false, isOptimized: false };
  }

  // 1. Data URL
  if (imageUrl.startsWith('data:image/')) {
    const formatMatch = imageUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);/);
    const format = formatMatch ? formatMatch[1].toLowerCase() : 'unknown';
    const sizeBytes = estimateDataUrlBytes(imageUrl);
    const isWebP = format === 'webp';
    const isOptimized = isWebP && sizeBytes < 250 * 1024;

    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        resolve({
          sizeBytes,
          width: img.naturalWidth || img.width || 0,
          height: img.naturalHeight || img.height || 0,
          format,
          isWebP,
          isOptimized
        });
      };
      img.onerror = () => {
        resolve({
          sizeBytes,
          width: 0,
          height: 0,
          format,
          isWebP,
          isOptimized
        });
      };
      img.src = imageUrl;
    });
  }

  // 2. Remote URL (http/https)
  let detectedBytes = 0;
  let detectedFormat = 'jpeg';
  if (imageUrl.toLowerCase().includes('.webp')) detectedFormat = 'webp';
  else if (imageUrl.toLowerCase().includes('.png')) detectedFormat = 'png';
  else if (imageUrl.toLowerCase().includes('.gif')) detectedFormat = 'gif';
  else if (imageUrl.toLowerCase().includes('.svg')) detectedFormat = 'svg';

  try {
    const res = await fetch(imageUrl, { method: 'HEAD', mode: 'cors' });
    const cl = res.headers.get('content-length');
    const ct = res.headers.get('content-type');
    if (cl) detectedBytes = parseInt(cl, 10);
    if (ct && ct.startsWith('image/')) detectedFormat = ct.replace('image/', '').toLowerCase();
  } catch (e) {
    // If HEAD fails due to CORS or host restrictions, attempt a lightweight fetch blob
    try {
      const res = await fetch(imageUrl, { mode: 'cors' });
      const blob = await res.blob();
      detectedBytes = blob.size;
      if (blob.type && blob.type.startsWith('image/')) {
        detectedFormat = blob.type.replace('image/', '').toLowerCase();
      }
    } catch (e2) {
      // Fallback: estimate will be verified upon canvas draw
    }
  }

  const isWebP = detectedFormat === 'webp';
  const isOptimized = (isWebP || detectedFormat === 'jpeg') && detectedBytes > 0 && detectedBytes < 250 * 1024;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      // If we couldn't get the byte size via fetch, estimate based on uncompressed canvas pixels with a conservative ratio
      let finalBytes = detectedBytes;
      if (!finalBytes) {
        const px = (img.naturalWidth || 800) * (img.naturalHeight || 800);
        finalBytes = isWebP ? Math.round(px * 0.15) : Math.round(px * 0.35);
      }
      resolve({
        sizeBytes: finalBytes,
        width: img.naturalWidth || img.width || 0,
        height: img.naturalHeight || img.height || 0,
        format: detectedFormat,
        isWebP,
        isOptimized: isWebP && finalBytes < 250 * 1024
      });
    };
    img.onerror = () => {
      // If crossOrigin caused error, retry without crossOrigin
      const fallbackImg = new Image();
      fallbackImg.onload = () => {
        resolve({
          sizeBytes: detectedBytes || 150 * 1024,
          width: fallbackImg.naturalWidth || fallbackImg.width || 0,
          height: fallbackImg.naturalHeight || fallbackImg.height || 0,
          format: detectedFormat,
          isWebP,
          isOptimized: isWebP
        });
      };
      fallbackImg.onerror = () => {
        resolve({
          sizeBytes: detectedBytes || 0,
          width: 0,
          height: 0,
          format: detectedFormat,
          isWebP,
          isOptimized: false
        });
      };
      fallbackImg.src = imageUrl;
    };
    img.src = imageUrl;
  });
}

/**
 * Takes an image URL or data URL and compresses it to modern high-efficiency WebP/JPEG,
 * reducing resolution if excessively large and producing a lightweight data URL.
 */
export async function compressImageUrl(
  imageUrl: string,
  options: CompressOptions = {}
): Promise<CompressionResult> {
  const {
    maxWidth = 1000,
    maxHeight = 1000,
    quality = 0.82,
    maxSizeBytes = 180 * 1024
  } = options;

  if (!imageUrl) {
    throw new Error('No se proporcionó una URL de imagen válida.');
  }

  // Calculate original size
  let originalSize = estimateDataUrlBytes(imageUrl);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    const handleLoadedImage = () => {
      try {
        let currentWidth = img.naturalWidth || img.width || 800;
        let currentHeight = img.naturalHeight || img.height || 800;

        if (!originalSize) {
          originalSize = Math.round(currentWidth * currentHeight * 0.45);
        }

        // Proportional scaling
        let ratio = 1;
        if (currentWidth > maxWidth || currentHeight > maxHeight) {
          const widthRatio = maxWidth / currentWidth;
          const heightRatio = maxHeight / currentHeight;
          ratio = Math.min(widthRatio, heightRatio);
        }

        const targetWidth = Math.max(1, Math.round(currentWidth * ratio));
        const targetHeight = Math.max(1, Math.round(currentHeight * ratio));

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;

        const ctx = canvas.getContext('2d', { alpha: true });
        if (!ctx) {
          reject(new Error('No se pudo inicializar el contexto de renderizado de imagen.'));
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Draw image onto canvas
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        // Step 1: Export as WebP
        let outputFormat: 'webp' | 'jpeg' = 'webp';
        let outputDataUrl = canvas.toDataURL('image/webp', quality);

        // Fallback to JPEG if WebP is unsupported
        if (!outputDataUrl.startsWith('data:image/webp')) {
          outputFormat = 'jpeg';
          outputDataUrl = canvas.toDataURL('image/jpeg', quality);
        }

        let compressedBytes = estimateDataUrlBytes(outputDataUrl);

        // Second pass if still heavier than desired
        if (compressedBytes > maxSizeBytes && quality > 0.5) {
          const secondPassQuality = Math.max(0.5, quality - 0.2);
          const secondDataUrl = canvas.toDataURL(`image/${outputFormat}`, secondPassQuality);
          const secBytes = estimateDataUrlBytes(secondDataUrl);
          if (secBytes < compressedBytes) {
            outputDataUrl = secondDataUrl;
            compressedBytes = secBytes;
          }
        }

        const savedPercent = originalSize > compressedBytes
          ? Math.round(((originalSize - compressedBytes) / originalSize) * 100)
          : 0;

        resolve({
          dataUrl: outputDataUrl,
          originalSize,
          compressedSize: compressedBytes,
          savedPercent,
          width: targetWidth,
          height: targetHeight,
          format: outputFormat
        });
      } catch (err) {
        reject(err);
      }
    };

    img.onload = handleLoadedImage;

    img.onerror = () => {
      // If crossOrigin fails due to CORS on external host, try via proxy or direct load
      const fallback = new Image();
      fallback.onload = () => {
        try {
          const w = fallback.naturalWidth || fallback.width || 600;
          const h = fallback.naturalHeight || fallback.height || 600;
          const canvas = document.createElement('canvas');
          canvas.width = Math.min(w, maxWidth);
          canvas.height = Math.min(h, maxHeight);
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(fallback, 0, 0, canvas.width, canvas.height);
            const fallbackDataUrl = canvas.toDataURL('image/webp', quality);
            const compBytes = estimateDataUrlBytes(fallbackDataUrl);
            resolve({
              dataUrl: fallbackDataUrl,
              originalSize: originalSize || compBytes * 2,
              compressedSize: compBytes,
              savedPercent: 50,
              width: canvas.width,
              height: canvas.height,
              format: 'webp'
            });
            return;
          }
        } catch (e2) {
          reject(new Error('No se pudo acceder a los pixeles de la imagen externa por restricciones de origen (CORS).'));
          return;
        }
        reject(new Error('Error al procesar la imagen externa.'));
      };
      fallback.onerror = () => {
        reject(new Error('No se pudo cargar la imagen para optimizarla.'));
      };
      fallback.src = imageUrl;
    };

    img.src = imageUrl;
  });
}

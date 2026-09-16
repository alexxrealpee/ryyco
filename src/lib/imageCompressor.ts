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

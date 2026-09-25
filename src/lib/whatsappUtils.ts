/**
 * Utility helpers to guarantee opening WhatsApp Messenger (Personal)
 * rather than WhatsApp Business (com.whatsapp.w4b).
 */

export function formatWhatsAppNumber(phone: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '').replace(/^0+/, '');
  return digits.startsWith('57') ? digits : `57${digits}`;
}

/**
 * Returns a URL string targeted specifically at WhatsApp Messenger (Personal).
 * On Android, builds an intent:// URI with package=com.whatsapp.
 * On iOS, uses whatsapp:// scheme.
 * On Desktop / fallback, returns https://wa.me/...
 */
export function getPersonalWhatsAppUrl(phone: string, message: string = ''): string {
  if (!phone) return '#';
  const fullNumber = formatWhatsAppNumber(phone);
  if (!fullNumber) return '#';
  const encodedText = encodeURIComponent(message || '');
  const fallbackUrl = `https://wa.me/${fullNumber}${encodedText ? `?text=${encodedText}` : ''}`;

  if (typeof navigator !== 'undefined') {
    const ua = navigator.userAgent || '';
    // Android: Explicitly target package com.whatsapp (WhatsApp Messenger Personal)
    if (/android/i.test(ua)) {
      return `intent://send?phone=${fullNumber}${encodedText ? `&text=${encodedText}` : ''}#Intent;package=com.whatsapp;scheme=whatsapp;S.browser_fallback_url=${encodeURIComponent(fallbackUrl)};end`;
    }
    // iOS: WhatsApp registered custom scheme
    if (/iphone|ipad|ipod/i.test(ua)) {
      return `whatsapp://send?phone=${fullNumber}${encodedText ? `&text=${encodedText}` : ''}`;
    }
  }

  return fallbackUrl;
}

/**
 * Directly launches WhatsApp Messenger (Personal) on mobile or WhatsApp Web on desktop.
 */
export function openPersonalWhatsApp(phone: string, message: string = ''): void {
  if (!phone) return;
  const fullNumber = formatWhatsAppNumber(phone);
  if (!fullNumber) return;
  const encodedText = encodeURIComponent(message || '');
  const fallbackUrl = `https://wa.me/${fullNumber}${encodedText ? `?text=${encodedText}` : ''}`;
  const androidIntentUrl = `intent://send?phone=${fullNumber}${encodedText ? `&text=${encodedText}` : ''}#Intent;package=com.whatsapp;scheme=whatsapp;S.browser_fallback_url=${encodeURIComponent(fallbackUrl)};end`;
  const iosUrl = `whatsapp://send?phone=${fullNumber}${encodedText ? `&text=${encodedText}` : ''}`;

  if (typeof navigator !== 'undefined') {
    const ua = navigator.userAgent || '';
    if (/android/i.test(ua)) {
      window.location.href = androidIntentUrl;
      return;
    }
    if (/iphone|ipad|ipod/i.test(ua)) {
      window.location.href = iosUrl;
      return;
    }
  }

  window.open(fallbackUrl, '_blank', 'noopener,noreferrer');
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Utility functions for Colombian phone number parsing and formatting
 */

export function cleanColombianPhone(rawInput: string): string {
  if (!rawInput) return '';
  // 1. Remove all non-digits (spaces, dashes, parentheses, dots, etc.)
  let digits = rawInput.replace(/\D/g, '');
  
  // 2. If it starts with '57' and has more than 10 digits, remove '57'
  if (digits.startsWith('57') && digits.length > 10) {
    digits = digits.slice(2);
  }
  
  // 3. Keep only up to 10 digits
  return digits.slice(0, 10);
}

export function formatColombianPhoneWith57(rawInput: string): string {
  if (!rawInput) return '';
  let digits = rawInput.replace(/\D/g, '');
  if (digits.startsWith('57') && digits.length >= 12) {
    return '+57' + digits.slice(2, 12);
  }
  if (digits.length === 10) {
    return '+57' + digits;
  }
  if (digits.length > 0 && !digits.startsWith('57')) {
    return '+57' + digits.slice(0, 10);
  }
  if (digits.startsWith('57')) {
    return '+' + digits;
  }
  return digits ? '+57' + digits : '';
}

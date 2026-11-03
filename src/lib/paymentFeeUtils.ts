import type { BankAccount } from '../types';

/**
 * Normaliza un registro de cuenta bancaria garantizando retrocompatibilidad:
 * si no tiene configurado el costo adicional, queda desactivado y su valor es $0.
 */
export function normalizeBankAccount(raw: any): BankAccount {
  const enabled = Boolean(raw?.additionalFeeEnabled);
  const feeType: 'fixed' | 'percentage' = raw?.additionalFeeType === 'percentage' ? 'percentage' : 'fixed';
  const rawVal = typeof raw?.additionalFeeValue === 'number'
    ? raw.additionalFeeValue
    : parseFloat(String(raw?.additionalFeeValue ?? '0'));
  const cleanVal = !isNaN(rawVal) && rawVal > 0
    ? (feeType === 'percentage' ? Math.min(100, Math.round(rawVal * 100) / 100) : Math.round(rawVal))
    : 0;

  return {
    id: String(raw?.id || 'bank_' + Math.random().toString(36).slice(2, 11)),
    bankName: String(raw?.bankName || '').trim(),
    accountType: raw?.accountType === 'Corriente' ? 'Corriente' : 'Ahorros',
    accountNumber: String(raw?.accountNumber || '').trim(),
    ...(raw?.qrCodeURL ? { qrCodeURL: String(raw.qrCodeURL).trim() } : {}),
    ...(raw?.instructions ? { instructions: String(raw.instructions).trim() } : {}),
    additionalFeeEnabled: enabled && cleanVal > 0,
    additionalFeeType: feeType,
    additionalFeeValue: enabled && cleanVal > 0 ? cleanVal : 0
  };
}

/**
 * Determina si una cuenta bancaria tiene activo un costo adicional válido (> 0).
 */
export function isBankAccountFeeActive(account?: Partial<BankAccount> | null): boolean {
  if (!account || account.additionalFeeEnabled !== true) return false;
  const val = typeof account.additionalFeeValue === 'number'
    ? account.additionalFeeValue
    : parseFloat(String(account.additionalFeeValue ?? '0'));
  if (isNaN(val) || val <= 0) return false;
  if (account.additionalFeeType === 'percentage' && val > 100) return false;
  return true;
}

/**
 * Calcula el costo adicional en pesos colombianos ($ COP) para un pedido dado su monto base
 * (subtotal de productos + empaque + domicilio - descuentos, sin incluir el propio recargo).
 */
export function calculateBankAccountFee(
  account: Partial<BankAccount> | undefined | null,
  baseOrderAmount: number
): number {
  if (!isBankAccountFeeActive(account)) return 0;
  const safeBase = Math.max(0, Number(baseOrderAmount) || 0);
  if (safeBase <= 0) return 0;

  const val = typeof account!.additionalFeeValue === 'number'
    ? account!.additionalFeeValue
    : parseFloat(String(account!.additionalFeeValue ?? '0'));
  if (isNaN(val) || val <= 0) return 0;

  if (account!.additionalFeeType === 'percentage') {
    const clampedPct = Math.min(100, Math.max(0, val));
    return Math.round((safeBase * clampedPct) / 100);
  }

  return Math.round(val);
}

/**
 * Devuelve una etiqueta descriptiva del costo adicional configurado en un método de pago.
 */
export function formatBankAccountFeeBadge(
  account?: Partial<BankAccount> | null,
  currency = '$'
): string {
  if (!isBankAccountFeeActive(account)) {
    return 'Sin costo adicional';
  }
  const val = Number(account!.additionalFeeValue) || 0;
  if (account!.additionalFeeType === 'percentage') {
    return `+${val}% adicional`;
  }
  return `+${currency}${Math.round(val).toLocaleString('es-CO')} adicionales`;
}

/**
 * Resuelve la cuenta bancaria seleccionada por ID o por nombre de banco,
 * o devuelve la primera cuenta válida disponible.
 */
export function resolveSelectedBankAccount(
  accounts: BankAccount[] | undefined,
  selectedAccountId?: string,
  selectedBankName?: string
): BankAccount | undefined {
  if (!Array.isArray(accounts) || accounts.length === 0) return undefined;
  const valid = accounts.filter(
    a => a && typeof a.bankName === 'string' && a.bankName.trim() && typeof a.accountNumber === 'string' && a.accountNumber.trim()
  );
  if (valid.length === 0) return undefined;

  if (selectedAccountId) {
    const byId = valid.find(a => a.id === selectedAccountId);
    if (byId) return byId;
  }
  if (selectedBankName) {
    const target = selectedBankName.trim().toLowerCase();
    const byName = valid.find(a => a.bankName.trim().toLowerCase() === target);
    if (byName) return byName;
  }
  return valid[0];
}

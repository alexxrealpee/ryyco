import React, { useRef, useState } from 'react';
import type { BankAccount } from '../types';
import {
  normalizeBankAccount,
  isBankAccountFeeActive,
  calculateBankAccountFee,
  resolveSelectedBankAccount
} from '../lib/paymentFeeUtils';

export function validTransferAccounts(accounts: BankAccount[] | undefined): BankAccount[] {
  return Array.isArray(accounts)
    ? accounts
        .filter(
          a =>
            typeof a?.bankName === 'string' &&
            a.bankName.trim() &&
            typeof a.accountNumber === 'string' &&
            a.accountNumber.trim()
        )
        .map(normalizeBankAccount)
    : [];
}

export default function CheckoutBankTransfer({
  name,
  accounts,
  proof,
  onProof,
  onBusy,
  selectedAccountId,
  onSelectAccount,
  baseOrderAmount = 0
}: {
  name: string;
  accounts: BankAccount[];
  proof?: string;
  onProof: (image: string) => void;
  onBusy: (busy: boolean) => void;
  selectedAccountId?: string;
  onSelectAccount?: (account: BankAccount) => void;
  baseOrderAmount?: number;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const activeAccount = resolveSelectedBankAccount(accounts, selectedAccountId);

  return (
    <section className="rounded-xl border border-[#232B3A] bg-[#111827] p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-bold text-white">{name}</h4>
        {accounts.length > 1 && (
          <span className="text-[10px] font-bold text-[#A9B2C3]">
            Selecciona la cuenta con la que vas a pagar
          </span>
        )}
      </div>

      <div className="space-y-2">
        {accounts.map((account, index) => {
          const isSelected = activeAccount ? activeAccount.id === account.id : index === 0;
          const feeActive = isBankAccountFeeActive(account);
          const computedFee = baseOrderAmount > 0 ? calculateBankAccountFee(account, baseOrderAmount) : 0;

          return (
            <div
              key={`${account.id}-${index}`}
              onClick={() => onSelectAccount?.(account)}
              className={`rounded-xl p-3 space-y-2 border transition cursor-pointer ${
                isSelected
                  ? 'bg-[#090B12] border-[#E63946]'
                  : 'bg-[#090B12]/70 border-[#232B3A] hover:border-gray-600'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full border border-[#232B3A] flex items-center justify-center shrink-0">
                    {isSelected && <div className="w-2.5 h-2.5 bg-[#E63946] rounded-full" />}
                  </div>
                  <p className="text-xs font-extrabold text-white">
                    {account.bankName} · {account.accountType}
                  </p>
                </div>

                {feeActive ? (
                  <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-lg shrink-0">
                    {account.additionalFeeType === 'percentage'
                      ? `+${account.additionalFeeValue}%${computedFee > 0 ? ` ($${computedFee.toLocaleString('es-CO')})` : ' adicional'}`
                      : `+$${Math.round(Number(account.additionalFeeValue) || 0).toLocaleString('es-CO')} adicionales`}
                  </span>
                ) : (
                  <span className="text-[10px] font-mono font-bold text-emerald-400 shrink-0">
                    Sin costo adicional
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 pl-6">
                <span className="select-all break-all font-mono text-sm text-white">{account.accountNumber}</span>
                <button
                  type="button"
                  className="rounded-lg bg-[#334155] hover:bg-[#475569] px-3 py-1.5 text-xs font-bold text-white transition cursor-pointer"
                  onClick={async e => {
                    e.stopPropagation();
                    onSelectAccount?.(account);
                    try {
                      await navigator.clipboard.writeText(account.accountNumber.trim());
                      setMessage('Número de cuenta copiado.');
                    } catch {
                      setMessage('No se pudo copiar. Mantén pulsado el número para seleccionarlo y copiarlo.');
                    }
                  }}
                >
                  Copiar número de cuenta
                </button>
              </div>
              {account.instructions && (
                <p className="text-xs whitespace-pre-wrap text-gray-300 pl-6">{account.instructions}</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs leading-relaxed text-gray-300">
          Copia el número de cuenta, ve a la aplicación, haz el pago, toma una captura y sube el comprobante de pago.
        </p>
      </div>
      <div className="space-y-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => fileInput.current?.click()}
          className={`w-full min-h-12 px-4 py-3 rounded-xl text-white text-sm font-bold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-wait ${
            proof ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-[#E63946] hover:bg-[#D62839]'
          }`}
        >
          {busy
            ? 'Preparando comprobante…'
            : proof
            ? '✓ Comprobante cargado (Cambiar imagen)'
            : 'Subir comprobante de pago (Obligatorio)'}
        </button>
        <input
          ref={fileInput}
          aria-label="Seleccionar comprobante de pago"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          className="hidden"
          onChange={async event => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
              setMessage('Selecciona una imagen JPG, PNG o WebP de máximo 10 MB.');
              return;
            }
            setBusy(true);
            onBusy(true);
            setMessage('Preparando comprobante…');
            try {
              const { compressPaymentReceipt } = await import('../lib/imageCompressor');
              const result = await compressPaymentReceipt(file);
              onProof(result.dataUrl);
              setMessage(
                `✓ Comprobante cargado (${Math.ceil(result.dataUrl.length / 1024)} KB). Ya puedes confirmar tu pedido.`
              );
            } catch {
              setMessage(
                'No se pudo reducir el comprobante. Recorta la imagen para mostrar solo el pago y vuelve a intentarlo.'
              );
            } finally {
              setBusy(false);
              onBusy(false);
            }
          }}
        />
      </div>
      {!proof ? (
        <p className="text-xs text-amber-400 font-semibold">
          ⚠️ Obligatorio: Debes subir la captura o comprobante de la transferencia para poder avanzar.
        </p>
      ) : (
        <p className="text-xs text-emerald-400 font-semibold">
          ✓ Comprobante adjuntado correctamente. El restaurante verificará el pago.
        </p>
      )}
      {proof && (
        <div className="flex items-center gap-3">
          <img src={proof} alt={`Comprobante para ${name}`} className="h-24 w-24 object-contain bg-white rounded-lg" />
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              onProof('');
              setMessage('Comprobante eliminado. Debes subir uno para continuar.');
            }}
            className="min-h-11 px-4 py-2 rounded-xl bg-[#E63946] hover:bg-[#D62839] text-xs font-bold text-white transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Quitar comprobante
          </button>
        </div>
      )}
      {message && (
        <p role="status" className="text-xs text-gray-300">
          {message}
        </p>
      )}
    </section>
  );
}


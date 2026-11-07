import { useEffect, useRef, useState } from 'react';

/** Shared checkout pipeline; a late decode must never update an abandoned order. */
export function useReceiptUpload(onProof: (image: string) => void, onBusy?: (busy: boolean) => void) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const active = useRef<AbortController | null>(null);
  const callbacks = useRef({ onProof, onBusy });
  callbacks.current = { onProof, onBusy };

  useEffect(() => () => {
    if (!active.current) return;
    active.current.abort();
    active.current = null;
    callbacks.current.onBusy?.(false);
  }, []);

  const upload = async (file?: File) => {
    // Canceling the system picker preserves the previously selected receipt.
    if (!file || active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    callbacks.current.onBusy?.(true);
    setMessage('Preparando comprobante…');
    try {
      const { compressPaymentReceipt } = await import('../lib/imageCompressor');
      if (controller.signal.aborted) return;
      const result = await compressPaymentReceipt(file, controller.signal);
      if (controller.signal.aborted) return;
      callbacks.current.onProof(result.dataUrl);
      setMessage(`✓ Comprobante preparado (${Math.ceil(result.dataUrl.length / 1024)} KB). Se guardará al confirmar el pedido.`);
    } catch (error) {
      if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'No se pudo preparar el comprobante. Intenta con una captura JPG o PNG.');
    } finally {
      if (active.current === controller) {
        active.current = null;
        setBusy(false);
        callbacks.current.onBusy?.(false);
      }
    }
  };

  return { busy, message, setMessage, upload, isBusy: () => active.current !== null };
}

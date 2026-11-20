import { MessageCircle } from 'lucide-react';
import type { OrderItem } from '../types';

export default function WhatsAppPaymentNotice({ paymentMethod }: Pick<OrderItem, 'paymentMethod'>) {
  if (paymentMethod !== 'whatsapp') return null;

  return (
    <span className="mt-1 inline-flex max-w-full items-start gap-1.5 rounded-lg border border-emerald-800/70 bg-emerald-950/50 px-2 py-1 font-sans text-[11px] font-semibold normal-case leading-snug tracking-normal text-emerald-300">
      <MessageCircle aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
      <span className="whitespace-normal">Coordinar el pago por WhatsApp</span>
    </span>
  );
}

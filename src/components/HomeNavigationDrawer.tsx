import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'motion/react';
import { Bike, ChevronRight, Crown, Flame, Gift, HelpCircle, LogOut, ShoppingBag, Store, User, Utensils, X } from 'lucide-react';
import type { CustomerProfile } from '../types';

type CustomerTab = 'orders' | 'profile' | 'rewards' | 'wheel';

interface Props {
  customer: CustomerProfile | null;
  isAndroid: boolean;
  onClose: () => void;
  onCustomerTab: (tab: CustomerTab) => void;
  onNavigate: (path: string, mode?: 'seller' | 'driver') => void;
  onLogout: () => void;
}

const rowClass = 'flex min-h-12 w-full shrink-0 items-center gap-3 rounded-xl px-3 py-3 text-left text-[14px] font-medium leading-snug text-[#F8FAFC] transition-colors hover:bg-[#232B3A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E63946]';

export default function HomeNavigationDrawer({ customer, isAndroid, onClose, onCustomerTab, onNavigate, onLogout }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  return createPortal(
    <dialog
      ref={dialogRef}
      id="home-navigation-drawer"
      aria-label="Menú de RYYCO"
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none overflow-hidden border-0 bg-transparent p-0 backdrop:bg-black/50"
      onCancel={onClose}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <motion.div
        initial={reducedMotion ? false : { x: '-100%' }}
        animate={{ x: 0 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        className="flex h-full w-[86vw] max-w-[390px] flex-col overflow-y-auto overscroll-contain bg-[#111827] font-sans"
      >
        <header className="relative shrink-0 px-6 pb-8 pt-[max(4rem,env(safe-area-inset-top))]">
          <button type="button" autoFocus onClick={onClose} aria-label="Cerrar menú" className="absolute right-4 top-[max(0.75rem,env(safe-area-inset-top))] flex h-10 w-10 items-center justify-center rounded-full text-[#C4CBD8] hover:bg-[#232B3A] focus-visible:outline-2 focus-visible:outline-[#E63946]">
            <X className="h-5 w-5" />
          </button>
          <button type="button" onClick={() => onCustomerTab(customer ? 'profile' : 'orders')} className="flex w-full items-center justify-between gap-4 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-[#E63946]">
            <div className="min-w-0">
              <p className="break-words text-2xl font-bold leading-tight text-white">{customer?.name || 'Bienvenido a RYYCO'}</p>
              <span className="mt-2 flex items-center gap-1 text-sm text-[#C4CBD8]">{customer ? 'Editar mi perfil' : 'Ingresar como cliente'}<ChevronRight className="h-4 w-4 shrink-0" /></span>
            </div>
            <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#E63946] text-white">
              {customer?.avatarUrl ? <img src={customer.avatarUrl} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" /> : <User className="h-8 w-8" />}
            </span>
          </button>
        </header>
        <nav aria-label="Opciones de inicio" className="flex flex-1 flex-col gap-1 rounded-tr-[28px] bg-[#0F172A] px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5">
          <div className="contents">
            <button id="drawer-my-orders-btn" type="button" className={rowClass} onClick={() => onCustomerTab('orders')}><ShoppingBag className="h-5 w-5 shrink-0 text-[#E63946]" />Mis Pedidos</button>
            {!isAndroid && <button id="drawer-my-points-btn" type="button" className={rowClass} onClick={() => onCustomerTab('rewards')}><Crown className="h-5 w-5 shrink-0 text-[#FFC400]" /><span className="flex-1">Puntos Ryycos</span>{customer && <span className="rounded-lg bg-[#FFC400] px-2 py-1 text-xs font-bold text-[#111827]">{(customer.points || 0).toLocaleString('es-CO')} R</span>}</button>}
            <a href="https://wa.me/573106502043?text=Hola%20Soporte%20Ryyco%2C%20necesito%20ayuda" target="_blank" rel="noopener noreferrer" className={rowClass} onClick={onClose}><HelpCircle className="h-5 w-5 shrink-0 text-[#E63946]" />Centro de Ayuda / Soporte</a>
          </div>
          <div className="contents">
            {!isAndroid && <button type="button" className={rowClass} onClick={() => onCustomerTab('wheel')}><Gift className="h-5 w-5 shrink-0 text-[#FFC400]" />Ruleta de Premios</button>}
            <button type="button" className={rowClass} onClick={() => onNavigate('/carruselproduc')}><Flame className="h-5 w-5 shrink-0 text-[#E63946]" />Reels de Comida</button>
          </div>
          <div className="contents">
            <button type="button" className={rowClass} onClick={() => onNavigate('/landing')}><Store className="h-5 w-5 shrink-0 text-[#E63946]" />Registrar mi restaurante</button>
            <button type="button" className={rowClass} onClick={() => onNavigate('/admin-restaurante', 'seller')}><Utensils className="h-5 w-5 shrink-0 text-[#E63946]" />Administrar mi Restaurante</button>
            <button type="button" className={rowClass} onClick={() => onNavigate('/domiciliario', 'driver')}><Bike className="h-5 w-5 shrink-0 text-[#FFC400]" />Acceso Domiciliario (Login)</button>
          </div>
          {customer && <div className="contents"><button type="button" className={rowClass} onClick={onLogout}><LogOut className="h-5 w-5 shrink-0 text-[#E63946]" />Cerrar sesión</button></div>}
        </nav>
      </motion.div>
    </dialog>, document.body,
  );
}

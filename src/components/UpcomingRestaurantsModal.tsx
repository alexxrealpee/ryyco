import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { collection, getDocsFromServer } from 'firebase/firestore';
import { Clock, Loader2, X } from 'lucide-react';
import { db, checkIsStoreClosed } from '../lib/firebase';
import { isUpcomingRestaurantEligible, nextRestaurantOpening } from '../lib/upcomingRestaurants';
import type { UserProfile } from '../types';
import RestaurantLogo from './RestaurantLogo';

interface Props {
  profiles: Record<string, UserProfile>;
  availabilityError: { message: string } | null;
  onClose: () => void;
  onRetryAvailability: () => void;
}

export default function UpcomingRestaurantsModal({ profiles, availabilityError, onClose, onRetryAvailability }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [stores, setStores] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const latestProfiles = useRef(profiles);
  latestProfiles.current = profiles;
  const ready = useRef(false);

  useEffect(() => {
    const element = dialog.current;
    const focus = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = 'hidden';
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(timer); element?.close(); document.body.style.overflow = overflow; if (focus?.isConnected) focus.focus({ preventScroll: true }); };
  }, []);

  useEffect(() => {
    let active = true;
    let expired = false;
    ready.current = false;
    setLoading(true); setError('');
    const initialProfiles = latestProfiles.current;
    const timeout = setTimeout(() => {
      expired = true;
      if (active) { setLoading(false); setError('No pudimos confirmar los horarios. Revisa tu conexión y reintenta.'); }
    }, 15000);
    void getDocsFromServer(collection(db, 'profiles')).then(snapshot => {
      if (!active || expired) return;
      if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) throw Error('unconfirmed');
      // If the existing live listener delivered newer profiles during the request, keep those.
      setStores(latestProfiles.current !== initialProfiles && Object.keys(latestProfiles.current).length
        ? Object.values(latestProfiles.current)
        : snapshot.docs.map(doc => ({ ...doc.data(), uid: doc.data().uid || doc.id } as UserProfile)));
      ready.current = true; setLoading(false); setNow(Date.now());
    }).catch(() => {
      if (active && !expired) { setLoading(false); setError('No pudimos consultar los restaurantes. Revisa tu conexión y reintenta.'); }
    }).finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); };
  }, [attempt]);

  // Reuse the homepage's server-confirmed listener; no second onSnapshot subscription.
  useEffect(() => {
    if (ready.current) { setStores(Object.values(profiles)); setNow(Date.now()); }
  }, [profiles]);

  const rows = useMemo(() => Array.from(new Map<string, UserProfile>(stores.map(store => [store.uid, store] as [string, UserProfile])).values())
    .filter(store => isUpcomingRestaurantEligible(store) &&
      !checkIsStoreClosed({ ...store, isClosed: false, scheduleEnabled: false }))
    .map(store => ({ store, opening: nextRestaurantOpening(store, now) }))
    .filter(({ store, opening }) => checkIsStoreClosed(store))
    .filter(({ opening }) => opening.label !== 'Abierto ahora')
    .sort((a, b) => (a.opening.at ?? Infinity) - (b.opening.at ?? Infinity) || (a.store.displayName || a.store.username).localeCompare(b.store.displayName || b.store.username)), [stores, now]);

  const message = error || availabilityError?.message;
  return createPortal(<dialog ref={dialog} aria-labelledby="upcoming-title" onCancel={onClose}
    onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-hidden rounded-3xl border border-slate-700 bg-[#111827] p-0 text-[#C4CBD8] backdrop:bg-black/70">
    <header className="flex items-center justify-between gap-3 border-b border-slate-800 p-5">
      <h2 id="upcoming-title" className="flex items-center gap-2 text-lg font-bold text-white"><Clock className="h-5 w-5 shrink-0 text-[#E63946]" />Restaurantes por abrir</h2>
      <button autoFocus type="button" onClick={onClose} aria-label="Cerrar restaurantes por abrir" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-slate-800"><X className="h-5 w-5" /></button>
    </header>
    <div className="max-h-[70dvh] overflow-y-auto overscroll-contain p-5">
      {message ? <div role="alert" className="text-sm"><p>{message}</p><button type="button" onClick={() => { onRetryAvailability(); setAttempt(value => value + 1); }} className="mt-3 rounded-xl bg-[#E63946] px-4 py-2 font-bold text-white">Reintentar</button></div>
        : loading ? <div role="status" className="flex items-center gap-3 py-8 text-sm"><Loader2 className="h-5 w-5 animate-spin text-[#E63946]" />Consultando restaurantes…</div>
        : !rows.length ? <p className="py-8 text-center text-sm">No hay restaurantes por abrir en este momento</p>
        : <ul className="space-y-4">{rows.map(({store, opening}) => <li key={store.uid} className="flex items-center gap-3 rounded-2xl bg-[#0F172A] p-3">
          <div className="h-14 w-14 shrink-0 rounded-full ring-2 ring-slate-700"><RestaurantLogo src={store.photoURL} name={store.displayName || store.username} /></div>
          <div className="min-w-0"><p className="break-words text-sm font-bold text-white">{store.displayName || store.storeName || store.username}</p><p className="mt-1 text-xs text-[#FFC400]">{opening.label}</p></div>
        </li>)}</ul>}
    </div>
  </dialog>, document.body);
}

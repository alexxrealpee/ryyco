import React, { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { auth, db, isSubscriptionExpiredOrSuspended } from '../lib/firebase';
import { COLLECTION_FOLLOWUPS, updateCollectionFollowup } from '../lib/subscriptionCollection';
import {
  CollectionFollowup, CollectionSubscription, collectionDate, collectionElapsed,
  collectionPeriod, collectionVisualState, currentCollection,
} from '../lib/subscriptionCollectionState';

export function useSubscriptionCollectionFollowups(enabled: boolean) {
  const [records, setRecords] = useState<Record<string, CollectionFollowup>>({});
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    setReady(false);
    setError('');
    let stop = () => {};
    const stopAuth = onAuthStateChanged(auth, (user) => {
      stop();
      setRecords({});
      setReady(false);
      if (!user) return;
      stop = onSnapshot(collection(db, COLLECTION_FOLLOWUPS), { includeMetadataChanges: true }, snapshot => {
        // Never present a cached absence as "not yet sent". Wait for server confirmation.
        if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
        setRecords(Object.fromEntries(snapshot.docs.map(d => [d.id, d.data() as CollectionFollowup])));
        setReady(true);
        setError('');
      }, () => {
        setReady(false);
        setError('No se pudo sincronizar el seguimiento de cobros.');
      });
    });
    const refresh = () => setNow(Date.now());
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { stopAuth(); stop(); clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [enabled, retry]);
  return { records, error, ready, now, retry: () => setRetry(n => n + 1) };
}

export type CollectionTracking = ReturnType<typeof useSubscriptionCollectionFollowups>;

export function SubscriptionCollectionBadge({ user, tracking }: { user: CollectionSubscription; tracking: CollectionTracking }) {
  const expired = isSubscriptionExpiredOrSuspended(user).isExpired;
  const state = collectionVisualState(expired, currentCollection(user, tracking.records[user.uid]), tracking.now);
  return <span className={`ml-1 px-1 rounded text-[8.5px] font-black border uppercase ${
    tracking.ready && state === 'sent' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' :
    tracking.ready && state === 'due' ? 'bg-red-600 text-white border-red-400' : 'text-emerald-300 border-emerald-500/30'
  }`}>{expired && !tracking.ready ? 'Ver cobro' : state === 'sent' ? '✓ Enviado' : state === 'due' ? 'Volver a cobrar' : 'Cobrar'}</span>;
}

export function SubscriptionCollectionButton({ user, tracking, onClick, wide = false }: {
  user: CollectionSubscription; tracking: CollectionTracking; onClick: () => void; wide?: boolean;
}) {
  const expired = isSubscriptionExpiredOrSuspended(user).isExpired;
  const saved = currentCollection(user, tracking.records[user.uid]);
  const state = collectionVisualState(expired, saved, tracking.now);
  const label = !expired ? 'Cobrar' : !tracking.ready ? 'Ver cobro' : state === 'due' ? '🔴 VOLVER A COBRAR' : state === 'sent' ? '✓ COBRO ENVIADO' : 'COBRAR';
  return <div className={wide ? 'w-full space-y-1' : 'flex flex-col items-center gap-1'}>
    <button type="button" onClick={onClick} className={`${wide ? 'w-full py-2.5' : 'py-1'} px-3 rounded-lg border text-[10px] font-black uppercase tracking-wide transition cursor-pointer ${
      expired && tracking.ready && state === 'due' ? 'bg-red-600 hover:bg-red-500 border-red-400 text-white' :
      expired && tracking.ready && state === 'sent' ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300' :
      'bg-emerald-600 hover:bg-emerald-500 border-emerald-400/40 text-white'
    }`}>{label}</button>
    {expired && tracking.ready && saved?.lastConfirmedAt && <span className="text-[9px] text-gray-400 text-center leading-relaxed">
      {collectionDate(saved.lastConfirmedAt)}<br />{collectionElapsed(saved.lastConfirmedAt, tracking.now)} · {saved.confirmedCount} envío(s)
    </span>}
  </div>;
}

export function SubscriptionCollectionConfirmation({ user, tracking }: { user: CollectionSubscription; tracking: CollectionTracking }) {
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [periods, setPeriods] = useState<CollectionFollowup[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const saved = currentCollection(user, tracking.records[user.uid]);
  const period = collectionPeriod(user);
  const expired = isSubscriptionExpiredOrSuspended(user).isExpired;
  useEffect(() => { setSelectedPeriod(''); setError(''); }, [user.uid, period]);
  useEffect(() => {
    if (!historyOpen) return;
    return onSnapshot(query(collection(db, COLLECTION_FOLLOWUPS, user.uid, 'periods'), orderBy('updatedAt', 'desc'), limit(24)),
      snap => setPeriods(snap.docs.map(d => d.data() as CollectionFollowup)),
      () => setError('No se pudieron cargar los vencimientos anteriores.'));
  }, [historyOpen, user.uid]);
  useEffect(() => {
    if (!historyOpen) return;
    setHistory([]);
    return onSnapshot(query(collection(db, COLLECTION_FOLLOWUPS, user.uid, 'periods', selectedPeriod || period, 'messages'), orderBy('attemptedAt', 'desc'), limit(20)),
      snap => setHistory(snap.docs.map(d => ({ ...d.data(), id: d.id }))),
      () => setError('No se pudo cargar el historial.'));
  }, [historyOpen, user.uid, period, selectedPeriod]);
  const act = async (action: 'confirm' | 'undo', id: string) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try { await updateCollectionFollowup(user, action, id); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar el seguimiento.'); }
    finally { lock.current = false; setBusy(false); }
  };
  if (!expired) return null;
  return <div className="rounded-xl border border-gray-800 bg-gray-950 p-3 space-y-2 text-xs">
    {tracking.error ? <p role="alert" className="text-red-300">{tracking.error} <button type="button" onClick={tracking.retry} className="underline">Reintentar</button></p> :
      !tracking.ready ? <p className="text-gray-400">Sincronizando seguimiento…</p> : <>
        {saved?.lastConfirmedAt && <p className="text-emerald-300">Último cobro enviado: {collectionDate(saved.lastConfirmedAt)} · {saved.confirmedCount} envío(s)</p>}
        {saved?.pendingAttemptId ? <>
          <p className="text-gray-400">WhatsApp abierto el {collectionDate(saved.lastAttemptAt)}. Confirma únicamente si enviaste el mensaje.</p>
          <button type="button" disabled={busy} onClick={() => act('confirm', saved.pendingAttemptId!)} className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 py-2.5 font-bold text-white disabled:opacity-50">{busy ? 'Guardando…' : 'Ya envié el mensaje'}</button>
        </> : <p className="text-gray-400">Al abrir WhatsApp podrás confirmar el envío aquí.</p>}
        {saved?.lastConfirmedId && <button type="button" disabled={busy} onClick={() => {
          if (window.confirm('¿Corregir la última confirmación? Se conservará en el historial como corregida.')) void act('undo', saved.lastConfirmedId!);
        }} className="text-amber-300 underline disabled:opacity-50">Corregir última confirmación accidental</button>}
      </>}
    {error && <p role="alert" className="text-red-300">{error}</p>}
    <button type="button" onClick={() => setHistoryOpen(v => !v)} className="block text-gray-400 underline">{historyOpen ? 'Ocultar historial' : 'Historial de cobros'}</button>
    {historyOpen && <>
      <select aria-label="Vencimiento del historial de cobros" value={selectedPeriod || period} onChange={e => setSelectedPeriod(e.target.value)} className="w-full rounded-lg border border-gray-700 bg-gray-900 p-2 text-gray-300">
        <option value={period}>Vencimiento actual</option>
        {periods.filter(p => p.periodId !== period).map(p => <option key={p.periodId} value={p.periodId}>Anterior · {collectionDate(p.lastConfirmedAt || p.lastAttemptAt)} · {p.confirmedCount} envío(s)</option>)}
      </select>
      <p className="text-[10px] text-gray-500">Últimos 20 intentos del período seleccionado.</p>
      <ul className="max-h-36 overflow-y-auto space-y-2 text-[11px] text-gray-400">
      {history.map(event => <li key={event.id}>{collectionDate(event.confirmedAt || event.attemptedAt)} · {event.status === 'confirmed' ? 'Enviado' : event.status === 'corrected' ? 'Confirmación corregida' : 'Intento sin confirmar'}</li>)}
      {!history.length && <li>Sin registros.</li>}
    </ul></>}
  </div>;
}

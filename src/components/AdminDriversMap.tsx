import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { db } from '../lib/firebase';
import { lockBodyScroll } from '../lib/bodyScrollLock';
import { validCoordinates, GPS_FRESH_MS } from '../lib/deliveryTracking';
import type { DriverProfile } from '../types';

type Presence = { lat: number; lng: number; gpsTimestamp: number };
export default function AdminDriversMap({ onClose }: { onClose: () => void }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef(new Map<string, L.CircleMarker>());
  const centered = useRef(false);
  const [drivers, setDrivers] = useState<DriverProfile[]>([]);
  const [positions, setPositions] = useState<Record<string, Presence>>({});
  const [confirmed, setConfirmed] = useState({ drivers: false, positions: false });
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [waiting, setWaiting] = useState(false);
  const live = confirmed.drivers && confirmed.positions;
  const located = drivers.filter(d => {
    const p = positions[d.id];
    return live && p && validCoordinates(p.lat, p.lng) &&
      now - p.gpsTimestamp <= GPS_FRESH_MS && p.gpsTimestamp <= now + 5000;
  });
  const center = () => {
    if (map.current && markers.current.size) map.current.fitBounds(
      L.featureGroup([...markers.current.values()]).getBounds(), { padding: [40, 40], maxZoom: 16 });
  };
  useEffect(() => {
    const unlock = lockBodyScroll();
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', close);
    return () => { unlock(); window.removeEventListener('keydown', close); };
  }, [onClose]);
  useEffect(() => {
    setError('');
    setWaiting(false);
    setConfirmed({ drivers: false, positions: false });
    const fail = () => { setError('No se pudo conectar al mapa privado. Revisa la conexión, la sesión de administrador y las reglas de Firebase.'); setConfirmed({ drivers: false, positions: false }); };
    const a = onSnapshot(query(collection(db, 'drivers'), where('isAvailable', '==', true)),
      { includeMetadataChanges: true }, snapshot => {
        setDrivers(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as DriverProfile)).filter(d => d.status === 'approved'));
        setConfirmed(v => ({ ...v, drivers: !snapshot.metadata.fromCache }));
      }, fail);
    const b = onSnapshot(collection(db, 'driver_presence'), { includeMetadataChanges: true }, snapshot => {
      setPositions(Object.fromEntries(snapshot.docs.map(d => [d.id, d.data() as Presence])));
      setConfirmed(v => ({ ...v, positions: !snapshot.metadata.fromCache }));
    }, fail);
    const timer = window.setInterval(() => setNow(Date.now()), 2000);
    const timeout = window.setTimeout(() => setWaiting(true), 12000);
    return () => { a(); b(); window.clearInterval(timer); window.clearTimeout(timeout); };
  }, [attempt]);
  useEffect(() => {
    if (!container.current) return;
    const instance = L.map(container.current, { zoomControl: true }).setView([0.825, -77.64], 13);
    map.current = instance;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors', maxZoom: 19,
    }).addTo(instance);
    const resize = new ResizeObserver(() => instance.invalidateSize());
    resize.observe(container.current);
    return () => { resize.disconnect(); instance.remove(); map.current = null; markers.current.clear(); };
  }, []);
  useEffect(() => {
    if (!map.current) return;
    const ids = new Set(located.map(d => d.id));
    markers.current.forEach((marker, id) => { if (!ids.has(id)) { marker.remove(); markers.current.delete(id); } });
    located.forEach(d => {
      const p = positions[d.id];
      let marker = markers.current.get(d.id);
      const label = document.createElement('span');
      label.textContent = [d.firstName, d.lastName].filter(Boolean).join(' ') || d.name || 'Domiciliario';
      if (!marker) {
        marker = L.circleMarker([p.lat, p.lng], { radius: 10, color: '#fff', weight: 2, fillColor: '#059669', fillOpacity: 1 }).addTo(map.current!);
        markers.current.set(d.id, marker);
      }
      marker.setLatLng([p.lat, p.lng]).unbindTooltip().bindTooltip(label);
    });
    if (!centered.current && located.length) { center(); centered.current = true; }
  }, [drivers, positions, now, live]);
  return createPortal(<div role="dialog" aria-modal="true" aria-label="Mapa de domiciliarios disponibles" className="fixed inset-0 z-[1000000] bg-[#0d1322] text-white flex flex-col h-[100dvh]">
    <header className="p-4 border-b border-gray-700 flex flex-wrap items-center gap-3">
      <div className="flex-1"><h2 className="font-bold">Domiciliarios disponibles · Mapa en vivo</h2>
        <p className="text-xs text-gray-300" aria-live="polite">{live ? `${located.length} con GPS reciente · ${drivers.length - located.length} sin GPS reciente` : 'Conectando con Firebase…'}</p></div>
      <button onClick={center} className="rounded-xl px-4 py-2 bg-emerald-700">Centrar todos</button>
      <button onClick={onClose} className="rounded-xl px-4 py-2 bg-gray-700">Cerrar</button>
    </header>
    {error && <p role="alert" className="p-3 text-sm bg-red-950">{error} <button className="underline" onClick={() => setAttempt(v => v + 1)}>Reintentar</button></p>}
    {!error && waiting && !live && <p role="status" className="p-3 text-sm bg-gray-800">Esperando conexión con Firebase. No se muestran posiciones antiguas como actuales. <button className="underline" onClick={() => setAttempt(v => v + 1)}>Reintentar</button></p>}
    <div className="flex-1 min-h-0 flex flex-col md:flex-row">
      <div ref={container} className="flex-1 min-h-0 relative z-0" style={{ touchAction: 'none' }} />
      <aside className="md:w-72 max-h-[30dvh] md:max-h-none overflow-y-auto p-4 space-y-2">
        {live && !drivers.length && <p className="text-sm">No hay domiciliarios aprobados disponibles.</p>}
        {drivers.map(d => <button key={d.id} className="block text-left w-full bg-gray-800 rounded-xl p-3" onClick={() => {
          const marker = markers.current.get(d.id);
          if (marker) { map.current?.setView(marker.getLatLng(), 16); marker.openTooltip(); }
        }}><span className="block font-bold text-sm">{[d.firstName, d.lastName].filter(Boolean).join(' ') || d.name}</span>
          <span className="text-xs text-gray-300">{located.some(v => v.id === d.id) ? 'GPS reciente' : 'Sin GPS reciente'}</span></button>)}
        <p className="text-xs text-gray-400">Solo se muestran posiciones recientes. El domiciliario debe mantener su portal abierto, estar disponible y permitir el GPS.</p>
      </aside>
    </div>
  </div>, document.body);
}

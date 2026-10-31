import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { auth, db, signInWithGoogleUniversal } from '../lib/firebase';
import { lockBodyScroll } from '../lib/bodyScrollLock';
import { animateGps, validCoordinates, GPS_FRESH_MS, type GpsPoint } from '../lib/deliveryTracking';
import type { DriverProfile } from '../types';

type PresenceRecord = {
  lat: number;
  lng: number;
  accuracy?: number;
  heading?: number;
  speed?: number;
  gpsTimestamp: number;
  orderNumber?: number | string;
  storeName?: string;
  deliveryStatus?: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getVehicleEmoji(vehicleType?: string): string {
  const v = (vehicleType || '').toLowerCase();
  if (v.includes('car') || v.includes('auto') || v.includes('carro')) return '🚗';
  if (v.includes('bici') || v.includes('bike')) return '🚲';
  return '🛵';
}

function buildDriverMarkerHtml(driver: DriverProfile, pos: PresenceRecord, isFollowed: boolean): string {
  const fullName = ([driver.firstName, driver.lastName].filter(Boolean).join(' ') || driver.name || 'Domiciliario').trim();
  const shortName = fullName.split(/\s+/).slice(0, 2).join(' ');
  const emoji = getVehicleEmoji(driver.vehicleType);
  const speedKmh = typeof pos.speed === 'number' && Number.isFinite(pos.speed) && pos.speed >= 1 ? Math.round(pos.speed) : null;
  const hasOrder = Boolean(pos.orderNumber);
  const headingDeg = typeof pos.heading === 'number' && Number.isFinite(pos.heading) ? Math.round(pos.heading) : null;
  const ringColor = hasOrder ? '#f59e0b' : '#10b981';
  const badgeBg = isFollowed ? '#059669' : '#0f172a';

  return `
    <div style="position:relative;display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-50%);pointer-events:auto;">
      <div data-driver-badge style="margin-bottom:4px;padding:2px 8px;border-radius:9999px;background:${badgeBg};border:1.5px solid ${ringColor};color:#fff;font-size:11px;font-weight:800;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,0.45);display:flex;align-items:center;gap:4px;">
        <span>${escapeHtml(shortName)}</span>
        <span data-driver-speed style="color:#6ee7b7;font-size:10px;font-weight:700;${speedKmh ? '' : 'display:none;'}">${speedKmh ? `${speedKmh} km/h` : ''}</span>
      </div>
      <div style="position:relative;width:40px;height:40px;display:flex;align-items:center;justify-content:center;">
        <span style="position:absolute;inset:0;border-radius:9999px;background:${ringColor};opacity:0.28;animation:ping 1.8s cubic-bezier(0,0,0.2,1) infinite;"></span>
        <div style="position:relative;width:34px;height:34px;border-radius:9999px;background:${ringColor};border:2.5px solid #ffffff;box-shadow:0 4px 14px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;font-size:17px;">
          <span>${emoji}</span>
          <span data-driver-heading style="position:absolute;inset:-4px;display:${headingDeg !== null ? 'flex' : 'none'};align-items:flex-start;justify-content:center;transform:rotate(${headingDeg ?? 0}deg);pointer-events:none;">
            <span style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:8px solid #ffffff;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.6));"></span>
          </span>
        </div>
      </div>
    </div>
  `;
}

export default function AdminDriversMap({ onClose }: { onClose: () => void }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef(new Map<string, L.Marker>());
  const prevPoints = useRef(new Map<string, GpsPoint>());
  const cancelAnims = useRef(new Map<string, () => void>());
  const centered = useRef(false);

  const [drivers, setDrivers] = useState<DriverProfile[]>([]);
  const [presenceMap, setPresenceMap] = useState<Record<string, PresenceRecord>>({});
  const [deliveryMap, setDeliveryMap] = useState<Record<string, PresenceRecord>>({});
  const [confirmed, setConfirmed] = useState({ drivers: false, positions: false });
  const [error, setError] = useState('');
  const [authRepairing, setAuthRepairing] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [waiting, setWaiting] = useState(false);
  const [followedDriverId, setFollowedDriverId] = useState<string | null>(null);

  // Merge real-time positions from both driver_presence and active delivery_tracking (picking the freshest fix)
  const positions = useMemo<Record<string, PresenceRecord>>(() => {
    const merged: Record<string, PresenceRecord> = { ...presenceMap };
    Object.entries(deliveryMap).forEach(([driverId, trackPos]) => {
      const existing = merged[driverId];
      if (!existing || (trackPos.gpsTimestamp || 0) >= (existing.gpsTimestamp || 0)) {
        merged[driverId] = {
          ...existing,
          ...trackPos,
        };
      } else if (trackPos.orderNumber) {
        merged[driverId] = {
          ...existing,
          orderNumber: trackPos.orderNumber,
          storeName: trackPos.storeName,
          deliveryStatus: trackPos.deliveryStatus,
        };
      }
    });
    return merged;
  }, [presenceMap, deliveryMap]);

  const live = confirmed.drivers && confirmed.positions;

  const located = useMemo(() => {
    return drivers.filter(d => {
      const p = positions[d.id];
      return (
        live &&
        p &&
        validCoordinates(p.lat, p.lng) &&
        now - p.gpsTimestamp <= GPS_FRESH_MS &&
        p.gpsTimestamp <= now + 5000
      );
    });
  }, [drivers, positions, now, live]);

  const center = () => {
    setFollowedDriverId(null);
    if (map.current && markers.current.size) {
      map.current.fitBounds(
        L.featureGroup([...markers.current.values()]).getBounds(),
        { padding: [50, 50], maxZoom: 16 }
      );
    }
  };

  const handleAdminGoogleReauth = async () => {
    if (authRepairing) return;
    setAuthRepairing(true);
    try {
      await signInWithGoogleUniversal();
      setError('');
      setAttempt(v => v + 1);
    } catch (err: any) {
      if (err?.code !== 'auth/cancelled-popup-request' && err?.code !== 'auth/popup-closed-by-user') {
        setError(err?.message || 'No se pudo autenticar la sesión de administrador.');
      }
    } finally {
      setAuthRepairing(false);
    }
  };

  useEffect(() => {
    const unlock = lockBodyScroll();
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', close);
    return () => {
      unlock();
      window.removeEventListener('keydown', close);
    };
  }, [onClose]);

  useEffect(() => {
    setError('');
    setWaiting(false);
    setConfirmed({ drivers: false, positions: false });

    let unsubDrivers: (() => void) | undefined;
    let unsubPresence: (() => void) | undefined;
    let unsubTracking: (() => void) | undefined;
    let cancelled = false;

    const attachListeners = () => {
      unsubDrivers?.();
      unsubPresence?.();
      unsubTracking?.();

      const failDrivers = () => {
        if (cancelled) return;
        setError('No se pudo conectar al mapa privado. Revisa la conexión, la sesión de administrador y las reglas de Firebase.');
        setConfirmed(v => ({ ...v, drivers: false }));
      };

      const failPresence = () => {
        if (cancelled) return;
        setError('No se pudo conectar al mapa privado. Revisa la conexión, la sesión de administrador y las reglas de Firebase.');
        setConfirmed(v => ({ ...v, positions: false }));
      };

      unsubDrivers = onSnapshot(
        query(collection(db, 'drivers'), where('isAvailable', '==', true)),
        { includeMetadataChanges: true },
        snapshot => {
          if (cancelled) return;
          const approvedAvailable = snapshot.docs
            .map(d => ({ ...d.data(), id: d.id } as DriverProfile))
            .filter(d => d.status === 'approved');
          setDrivers(approvedAvailable);
          setConfirmed(v => ({ ...v, drivers: true }));
        },
        failDrivers
      );

      unsubPresence = onSnapshot(
        collection(db, 'driver_presence'),
        { includeMetadataChanges: true },
        snapshot => {
          if (cancelled) return;
          setError('');
          setPresenceMap(
            Object.fromEntries(
              snapshot.docs.map(d => [d.id, d.data() as PresenceRecord])
            )
          );
          setConfirmed(v => ({ ...v, positions: true }));
        },
        failPresence
      );

      // Optional live stream from active delivery_tracking documents for drivers currently delivering an order
      unsubTracking = onSnapshot(
        collection(db, 'delivery_tracking'),
        { includeMetadataChanges: true },
        snapshot => {
          if (cancelled) return;
          const nextTrackMap: Record<string, PresenceRecord> = {};
          snapshot.docs.forEach(docSnap => {
            const raw = docSnap.data();
            const driverId = raw.driverId || raw.deliveryDriverId;
            if (
              driverId &&
              raw.isTrackingActive !== false &&
              validCoordinates(raw.lat, raw.lng) &&
              typeof raw.gpsTimestamp === 'number'
            ) {
              const prev = nextTrackMap[driverId];
              if (!prev || raw.gpsTimestamp >= prev.gpsTimestamp) {
                nextTrackMap[driverId] = {
                  lat: raw.lat,
                  lng: raw.lng,
                  accuracy: raw.accuracy,
                  heading: raw.heading,
                  speed: raw.speed,
                  gpsTimestamp: raw.gpsTimestamp,
                  orderNumber: raw.orderNumber,
                  storeName: raw.storeName,
                  deliveryStatus: raw.status,
                };
              }
            }
          });
          setDeliveryMap(nextTrackMap);
        },
        () => {
          // Non-fatal if delivery_tracking is not used
        }
      );
    };

    const unsubAuth = onAuthStateChanged(auth, () => {
      if (!cancelled) attachListeners();
    });

    const timer = window.setInterval(() => setNow(Date.now()), 1500);
    const timeout = window.setTimeout(() => setWaiting(true), 12000);

    return () => {
      cancelled = true;
      unsubAuth();
      unsubDrivers?.();
      unsubPresence?.();
      unsubTracking?.();
      window.clearInterval(timer);
      window.clearTimeout(timeout);
    };
  }, [attempt]);

  useEffect(() => {
    if (!container.current) return;
    const instance = L.map(container.current, { zoomControl: true }).setView([0.825, -77.64], 14);
    map.current = instance;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(instance);
    const resize = new ResizeObserver(() => instance.invalidateSize());
    resize.observe(container.current);
    return () => {
      cancelAnims.current.forEach(cancel => cancel());
      cancelAnims.current.clear();
      prevPoints.current.clear();
      resize.disconnect();
      instance.remove();
      map.current = null;
      markers.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!map.current) return;
    const activeIds = new Set(located.map(d => d.id));

    // Remove markers for drivers no longer located
    markers.current.forEach((marker, id) => {
      if (!activeIds.has(id)) {
        cancelAnims.current.get(id)?.();
        cancelAnims.current.delete(id);
        prevPoints.current.delete(id);
        marker.remove();
        markers.current.delete(id);
      }
    });

    located.forEach(d => {
      const p = positions[d.id];
      if (!p) return;
      const isFollowed = followedDriverId === d.id;
      const nextPoint: GpsPoint = {
        lat: p.lat,
        lng: p.lng,
        accuracy: p.accuracy ?? 10,
        timestamp: p.gpsTimestamp,
        heading: p.heading,
        speed: p.speed,
      };
      const prevPoint = prevPoints.current.get(d.id) || null;
      let marker = markers.current.get(d.id);

      const fullName = ([d.firstName, d.lastName].filter(Boolean).join(' ') || d.name || 'Domiciliario').trim();
      const speedText = typeof p.speed === 'number' && p.speed >= 1 ? ` · ${Math.round(p.speed)} km/h` : '';
      const orderText = p.orderNumber ? ` · Pedido #${p.orderNumber}` : ' · Disponible';
      const tooltipText = `${fullName}${orderText}${speedText}`;

      if (!marker) {
        const icon = L.divIcon({
          className: 'ryyco-live-driver-marker',
          html: buildDriverMarkerHtml(d, p, isFollowed),
          iconSize: [40, 56],
          iconAnchor: [20, 28],
        });
        marker = L.marker([p.lat, p.lng], { icon }).addTo(map.current!);
        marker.bindTooltip(tooltipText, { direction: 'top', offset: [0, -24] });
        marker.on('click', () => {
          setFollowedDriverId(prev => (prev === d.id ? null : d.id));
        });
        markers.current.set(d.id, marker);
        prevPoints.current.set(d.id, nextPoint);
      } else {
        marker.setTooltipContent(tooltipText);
        const el = marker.getElement();
        if (el) {
          const speedEl = el.querySelector<HTMLElement>('[data-driver-speed]');
          if (speedEl) {
            if (typeof p.speed === 'number' && p.speed >= 1) {
              speedEl.textContent = `${Math.round(p.speed)} km/h`;
              speedEl.style.display = '';
            } else {
              speedEl.style.display = 'none';
            }
          }
          const badgeEl = el.querySelector<HTMLElement>('[data-driver-badge]');
          if (badgeEl) {
            badgeEl.style.background = isFollowed ? '#059669' : '#0f172a';
          }
        }

        // Smoothly interpolate position & heading when a new GPS fix arrives
        if (
          !prevPoint ||
          prevPoint.lat !== nextPoint.lat ||
          prevPoint.lng !== nextPoint.lng ||
          prevPoint.timestamp !== nextPoint.timestamp
        ) {
          cancelAnims.current.get(d.id)?.();
          const currentMarker = marker;
          const cancel = animateGps(prevPoint, nextPoint, frame => {
            currentMarker.setLatLng([frame.lat, frame.lng]);
            const markerEl = currentMarker.getElement();
            if (markerEl && typeof frame.heading === 'number' && Number.isFinite(frame.heading)) {
              const headingEl = markerEl.querySelector<HTMLElement>('[data-driver-heading]');
              if (headingEl) {
                headingEl.style.display = 'flex';
                headingEl.style.transform = `rotate(${Math.round(frame.heading)}deg)`;
              }
            }
            if (followedDriverId === d.id && map.current) {
              map.current.panTo([frame.lat, frame.lng], { animate: false });
            }
          });
          cancelAnims.current.set(d.id, cancel);
          prevPoints.current.set(d.id, nextPoint);
        }
      }
    });

    if (!centered.current && located.length) {
      center();
      centered.current = true;
    }
  }, [drivers, positions, now, live, followedDriverId]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Mapa de domiciliarios disponibles"
      className="fixed inset-0 z-[1000000] bg-[#0d1322] text-white flex flex-col h-[100dvh]"
    >
      <header className="p-4 border-b border-gray-800 bg-[#090d18] flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px]">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${live ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400 animate-ping'}`} />
            <h2 className="font-black text-base sm:text-lg tracking-tight">
              Domiciliarios disponibles · Mapa en vivo
            </h2>
          </div>
          <p className="text-xs text-gray-300 mt-0.5" aria-live="polite">
            {live
              ? `${located.length} moviéndose con GPS en tiempo real · ${Math.max(0, drivers.length - located.length)} sin GPS reciente`
              : 'Conectando con Firebase…'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {followedDriverId && (
            <button
              onClick={() => setFollowedDriverId(null)}
              className="rounded-xl px-3 py-2 bg-amber-600/20 border border-amber-500/40 text-amber-300 text-xs font-bold hover:bg-amber-600/30 transition cursor-pointer"
            >
              Dejar de seguir
            </button>
          )}
          <button
            onClick={center}
            className="rounded-xl px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-bold transition cursor-pointer shadow-md"
          >
            Centrar todos
          </button>
          <button
            onClick={onClose}
            className="rounded-xl px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-xs sm:text-sm font-bold transition cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </header>

      {error && (
        <div role="alert" className="px-4 py-3 text-xs sm:text-sm bg-red-950/90 border-b border-red-800/60 flex flex-wrap items-center justify-between gap-3">
          <span>{error}</span>
          <div className="flex items-center gap-3">
            <button
              className="px-3 py-1.5 rounded-lg bg-red-800 hover:bg-red-700 font-bold text-white transition cursor-pointer"
              onClick={() => setAttempt(v => v + 1)}
            >
              Reintentar
            </button>
            <button
              disabled={authRepairing}
              className="px-3 py-1.5 rounded-lg bg-white text-gray-900 hover:bg-gray-100 font-bold transition cursor-pointer disabled:opacity-50"
              onClick={handleAdminGoogleReauth}
            >
              {authRepairing ? 'Verificando…' : 'Verificar sesión Admin con Google'}
            </button>
          </div>
        </div>
      )}

      {!error && waiting && !live && (
        <p role="status" className="p-3 text-sm bg-gray-800">
          Esperando conexión con Firebase. No se muestran posiciones antiguas como actuales.{' '}
          <button className="underline font-bold" onClick={() => setAttempt(v => v + 1)}>
            Reintentar
          </button>
        </p>
      )}

      <div className="flex-1 min-h-0 flex flex-col md:flex-row">
        <div
          ref={container}
          className="flex-1 min-h-0 relative z-0"
          style={{ touchAction: 'none' }}
        />

        <aside className="md:w-80 max-h-[36dvh] md:max-h-none overflow-y-auto p-4 space-y-2.5 bg-[#0b101d] border-t md:border-t-0 md:border-l border-gray-800">
          <div className="flex items-center justify-between pb-1 border-b border-gray-800/80">
            <span className="text-xs font-extrabold uppercase tracking-wider text-gray-400">
              Repartidores Activos ({drivers.length})
            </span>
            <span className="text-[11px] text-emerald-400 font-bold">
              {located.length} con GPS
            </span>
          </div>

          {live && !drivers.length && (
            <p className="text-sm text-gray-400 py-4 text-center">
              No hay domiciliarios aprobados disponibles en este momento.
            </p>
          )}

          {drivers.map(d => {
            const p = positions[d.id];
            const isLiveGps = located.some(v => v.id === d.id);
            const isFollowing = followedDriverId === d.id;
            const ageSec = p && isLiveGps ? Math.max(0, Math.round((now - p.gpsTimestamp) / 1000)) : null;
            const speedKmh = p && typeof p.speed === 'number' && p.speed >= 1 ? Math.round(p.speed) : null;

            return (
              <button
                key={d.id}
                className={`block text-left w-full rounded-xl p-3 border transition cursor-pointer ${
                  isFollowing
                    ? 'bg-emerald-950/60 border-emerald-500/60 shadow-lg'
                    : isLiveGps
                    ? 'bg-gray-900/90 hover:bg-gray-800 border-emerald-500/30'
                    : 'bg-gray-900/50 hover:bg-gray-800/70 border-gray-800'
                }`}
                onClick={() => {
                  const marker = markers.current.get(d.id);
                  if (marker && map.current) {
                    setFollowedDriverId(prev => (prev === d.id ? null : d.id));
                    map.current.setView(marker.getLatLng(), 16, { animate: true });
                    marker.openTooltip();
                  }
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-sm text-white truncate">
                    {getVehicleEmoji(d.vehicleType)}{' '}
                    {[d.firstName, d.lastName].filter(Boolean).join(' ') || d.name}
                  </span>
                  {d.vehiclePlate && (
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-gray-800 text-gray-300 border border-gray-700 shrink-0">
                      {d.vehiclePlate}
                    </span>
                  )}
                </div>

                <div className="mt-1 flex flex-wrap items-center justify-between gap-1 text-xs">
                  {isLiveGps ? (
                    <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                      <span>
                        GPS en vivo{speedKmh ? ` · ${speedKmh} km/h` : ''}
                        {ageSec !== null ? ` · hace ${ageSec}s` : ''}
                      </span>
                    </span>
                  ) : (
                    <span className="text-gray-400">Sin GPS reciente</span>
                  )}

                  {isLiveGps && (
                    <span className="text-[10px] font-bold text-emerald-300 underline">
                      {isFollowing ? 'Siguiendo' : 'Seguir'}
                    </span>
                  )}
                </div>

                {isLiveGps && p?.orderNumber && (
                  <div className="mt-1.5 px-2 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-[11px] text-amber-300 font-bold truncate">
                    📦 En pedido #{p.orderNumber} {p.storeName ? `· ${p.storeName}` : ''}
                  </div>
                )}
              </button>
            );
          })}

          <p className="text-[11px] text-gray-400 pt-2 leading-relaxed">
            Los domiciliarios con GPS activo se mueven en tiempo real sobre el mapa. Haz clic en un domiciliario para centrarlo y seguir su recorrido en vivo.
          </p>
        </aside>
      </div>
    </div>,
    document.body
  );
}

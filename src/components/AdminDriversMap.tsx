import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { auth, db, signInWithGoogleUniversal, checkIsStoreClosed, isSubscriptionExpiredOrSuspended } from '../lib/firebase';
import { lockBodyScroll } from '../lib/bodyScrollLock';
import { animateGps, validCoordinates, GPS_FRESH_MS, type GpsPoint } from '../lib/deliveryTracking';
import { extractCoordinates } from '../lib/coordinateUtils';
import type { DriverProfile, UserProfile } from '../types';

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

type LocatedStore = {
  store: UserProfile;
  lat: number;
  lng: number;
  hasExactGps: boolean;
  addressLabel: string;
  isClosed: boolean;
  isExpired: boolean;
  closedCategory: 'open' | 'closed_active' | 'expired';
};

function getRestaurantSubscriptionState(profile?: UserProfile | null): 'active' | 'expired' | 'suspended' {
  if (!profile) return 'suspended';
  if (profile.suspended === true || profile.subscriptionStatus === 'suspended') {
    return 'suspended';
  }

  const subCheck = isSubscriptionExpiredOrSuspended(profile);
  if (subCheck.isSuspended || subCheck.effectiveStatus === 'suspended') {
    return 'suspended';
  }

  if (
    profile.subscriptionStatus === 'expired' ||
    subCheck.isExpired ||
    subCheck.effectiveStatus === 'expired'
  ) {
    return 'expired';
  }

  const now = Date.now();
  const hasValidPaidUntil = !!(
    profile.subscriptionPaidUntil &&
    !isNaN(new Date(profile.subscriptionPaidUntil).getTime()) &&
    new Date(profile.subscriptionPaidUntil).getTime() >= now
  );

  if (!hasValidPaidUntil) {
    if (profile.subscriptionStatus !== 'active' && profile.subscriptionStatus !== 'under_review') {
      if (profile.subscriptionTrialExpires) {
        const trialExp = new Date(profile.subscriptionTrialExpires).getTime();
        if (!isNaN(trialExp) && trialExp < now) {
          return 'expired';
        }
      }
    }
  }

  return 'active';
}

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

/**
 * Resolves coordinates for a restaurant.
 * Uses exact stored GPS coordinates (`lat`/`lng` or `mapUrl` extraction) when available,
 * and falls back to a deterministic position in Ipiales urban center so all restaurants
 * are visible on the map.
 */
function resolveStoreMapCoordinates(store: UserProfile, index: number): { lat: number; lng: number; hasExactGps: boolean } {
  const rawLat = typeof store.lat === 'number' ? store.lat : Number(store.lat);
  const rawLng = typeof store.lng === 'number' ? store.lng : Number(store.lng);
  if (validCoordinates(rawLat, rawLng)) {
    return { lat: rawLat, lng: rawLng, hasExactGps: true };
  }

  const candidateTexts = [
    store.mapUrl,
    (store as any).restaurantMapUrl,
    store.restaurantAddress,
    store.address,
    store.location,
  ];
  for (const text of candidateTexts) {
    if (text && typeof text === 'string') {
      const parsed = extractCoordinates(text);
      if (parsed && validCoordinates(parsed.lat, parsed.lng)) {
        return { lat: parsed.lat, lng: parsed.lng, hasExactGps: true };
      }
    }
  }

  // Deterministic fallback in Ipiales urban area so stores without saved GPS still appear on the map
  const seedStr = store.uid || store.username || store.displayName || String(index);
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = (hash * 31 + seedStr.charCodeAt(i)) >>> 0;
  }
  const angle = ((index * 137.508 + (hash % 360)) * Math.PI) / 180;
  const radius = 0.0022 + ((hash % 7) * 0.0009); // ~250m to 850m around central Ipiales
  const baseLat = 0.8262;
  const baseLng = -77.6412;
  return {
    lat: Number((baseLat + Math.sin(angle) * radius).toFixed(6)),
    lng: Number((baseLng + Math.cos(angle) * radius * 1.15).toFixed(6)),
    hasExactGps: false,
  };
}

function buildDriverMarkerHtml(driver: DriverProfile, pos: PresenceRecord, isFollowed: boolean): string {
  const fullName = ([driver.firstName, driver.lastName].filter(Boolean).join(' ') || (driver as any).name || 'Domiciliario').trim();
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

function buildStoreMarkerHtml(
  store: UserProfile,
  isSelected: boolean,
  isClosed = false,
  isExpired = false
): string {
  const rawName = (store.displayName || store.storeName || store.username || 'Restaurante').trim();
  const shortName = rawName.length > 20 ? `${rawName.slice(0, 18)}…` : rawName;
  const closedAccent = isExpired ? '#a855f7' : '#ef4444';
  const closedSelectedBg = isExpired ? '#581c87' : '#7f1d1d';
  const closedAvatarBg = isExpired ? '#9333ea' : '#dc2626';

  const borderColor = isSelected ? '#34d399' : isClosed ? closedAccent : '#f97316';
  const badgeBg = isSelected ? (isClosed ? closedSelectedBg : '#7c2d12') : '#18181b';
  const statusDotColor = isClosed ? closedAccent : '#10b981';
  const avatarBg = isClosed ? closedAvatarBg : '#ea580c';
  const photoUrl = (store.photoURL || '').trim();
  const statusTitle = isClosed
    ? isExpired
      ? 'Restaurante cerrado expirado'
      : 'Restaurante cerrado activo'
    : 'Restaurante abierto';

  const avatarInner = photoUrl
    ? `<img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(rawName)}" style="width:100%;height:100%;object-fit:cover;border-radius:9999px;display:block;${isClosed ? 'filter:grayscale(35%);' : ''}" onerror="this.style.display='none';this.parentElement.textContent='🍽️';" />`
    : `<span>🍽️</span>`;

  return `
    <div style="position:relative;display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-50%);pointer-events:auto;">
      <div data-store-badge style="margin-bottom:4px;padding:2px 8px;border-radius:9999px;background:${badgeBg};border:1.5px solid ${borderColor};color:#fff;font-size:11px;font-weight:800;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,0.5);display:flex;align-items:center;gap:4px;">
        <span style="width:6px;height:6px;border-radius:9999px;background:${statusDotColor};display:inline-block;flex-shrink:0;"></span>
        <span>${escapeHtml(shortName)}</span>
      </div>
      <div style="position:relative;width:38px;height:38px;display:flex;align-items:center;justify-content:center;">
        <div style="position:relative;width:34px;height:34px;border-radius:9999px;background:${avatarBg};border:2.5px solid #ffffff;box-shadow:0 4px 14px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;font-size:16px;overflow:hidden;">
          ${avatarInner}
        </div>
        <span style="position:absolute;bottom:0;right:0;width:13px;height:13px;border-radius:9999px;background:${statusDotColor};border:2px solid #090d18;display:flex;align-items:center;justify-content:center;font-size:8px;" title="${statusTitle}"></span>
      </div>
    </div>
  `;
}

export default function AdminDriversMap({ onClose }: { onClose: () => void }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef(new Map<string, L.Marker>());
  const storeMarkers = useRef(new Map<string, L.Marker>());
  const closedStoreMarkers = useRef(new Map<string, L.Marker>());
  const prevPoints = useRef(new Map<string, GpsPoint>());
  const cancelAnims = useRef(new Map<string, () => void>());
  const centered = useRef(false);

  const [drivers, setDrivers] = useState<DriverProfile[]>([]);
  const [rawStores, setRawStores] = useState<UserProfile[]>([]);
  const [presenceMap, setPresenceMap] = useState<Record<string, PresenceRecord>>({});
  const [deliveryMap, setDeliveryMap] = useState<Record<string, PresenceRecord>>({});
  const [confirmed, setConfirmed] = useState({ drivers: false, positions: false });
  const [error, setError] = useState('');
  const [authRepairing, setAuthRepairing] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [waiting, setWaiting] = useState(false);
  const [followedDriverId, setFollowedDriverId] = useState<string | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [showDriversLayer, setShowDriversLayer] = useState(true);
  const [showStoresLayer, setShowStoresLayer] = useState(true);
  const [showClosedStoresLayer, setShowClosedStoresLayer] = useState(false);
  const [closedSubFilter, setClosedSubFilter] = useState<'all' | 'active' | 'expired'>('all');
  const [sidebarTab, setSidebarTab] = useState<'all' | 'drivers' | 'stores' | 'closed'>('all');

  // Merge real-time positions from both driver_presence and active delivery_tracking (picking the freshest fix)
  const positions = useMemo<Record<string, PresenceRecord>>(() => {
    const merged: Record<string, PresenceRecord> = { ...presenceMap };
    Object.entries(deliveryMap).forEach(([driverId, trackPosRaw]) => {
      const trackPos = trackPosRaw as any;
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

  // Deduplicate restaurants and split into open, closed active, and expired restaurants
  const { openStores, closedActiveStores, expiredStores, closedStores } = useMemo<{
    openStores: LocatedStore[];
    closedActiveStores: LocatedStore[];
    expiredStores: LocatedStore[];
    closedStores: LocatedStore[];
  }>(() => {
    const byKey = new Map<string, UserProfile>();
    rawStores.forEach(s => {
      if (!s) return;
      if (s.role === 'driver') return;
      const name = (s.displayName || s.storeName || s.username || '').trim();
      if (!name) return;

      const key = (s.username || s.uid || name).toLowerCase().trim();
      const prev = byKey.get(key);
      if (!prev) {
        byKey.set(key, s);
      } else {
        byKey.set(key, {
          ...prev,
          ...s,
          lat: s.lat ?? prev.lat,
          lng: s.lng ?? prev.lng,
          mapUrl: s.mapUrl || prev.mapUrl,
          photoURL: s.photoURL || prev.photoURL,
          restaurantAddress: s.restaurantAddress || prev.restaurantAddress || s.address || prev.address,
        });
      }
    });

    const list = Array.from(byKey.values()).sort((a, b) => {
      const nameA = (a.displayName || a.storeName || a.username || '').toLowerCase();
      const nameB = (b.displayName || b.storeName || b.username || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });

    const open: LocatedStore[] = [];
    const closedActive: LocatedStore[] = [];
    const expired: LocatedStore[] = [];

    list.forEach((store, idx) => {
      const subState = getRestaurantSubscriptionState(store);
      if (subState === 'suspended') return;

      const coords = resolveStoreMapCoordinates(store, idx);
      const addressLabel = (store.restaurantAddress || store.address || store.restaurantCity || store.location || 'Ipiales').trim();

      if (subState === 'expired') {
        expired.push({
          store,
          lat: coords.lat,
          lng: coords.lng,
          hasExactGps: coords.hasExactGps,
          addressLabel,
          isClosed: true,
          isExpired: true,
          closedCategory: 'expired',
        });
        return;
      }

      const isClosed = checkIsStoreClosed(store);
      if (isClosed) {
        closedActive.push({
          store,
          lat: coords.lat,
          lng: coords.lng,
          hasExactGps: coords.hasExactGps,
          addressLabel,
          isClosed: true,
          isExpired: false,
          closedCategory: 'closed_active',
        });
      } else {
        open.push({
          store,
          lat: coords.lat,
          lng: coords.lng,
          hasExactGps: coords.hasExactGps,
          addressLabel,
          isClosed: false,
          isExpired: false,
          closedCategory: 'open',
        });
      }
    });

    return {
      openStores: open,
      closedActiveStores: closedActive,
      expiredStores: expired,
      closedStores: [...closedActive, ...expired],
    };
  }, [rawStores, now]);

  const filteredClosedStores = useMemo(() => {
    if (closedSubFilter === 'active') return closedActiveStores;
    if (closedSubFilter === 'expired') return expiredStores;
    return closedStores;
  }, [closedSubFilter, closedActiveStores, expiredStores, closedStores]);

  // Sort drivers so those with live GPS appear first in the sidebar
  const sortedDrivers = useMemo(() => {
    const locatedIds = new Set(located.map(d => d.id));
    return [...drivers].sort((a, b) => {
      const aLive = locatedIds.has(a.id) ? 1 : 0;
      const bLive = locatedIds.has(b.id) ? 1 : 0;
      if (aLive !== bLive) return bLive - aLive;
      const nameA = ([a.firstName, a.lastName].filter(Boolean).join(' ') || a.name || '').toLowerCase();
      const nameB = ([b.firstName, b.lastName].filter(Boolean).join(' ') || b.name || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [drivers, located]);

  const center = () => {
    setFollowedDriverId(null);
    setSelectedStoreId(null);
    const allMarkers = [
      ...(showDriversLayer ? [...markers.current.values()] : []),
      ...(showStoresLayer ? [...storeMarkers.current.values()] : []),
      ...(showClosedStoresLayer ? [...closedStoreMarkers.current.values()] : []),
    ];
    if (map.current && allMarkers.length) {
      map.current.fitBounds(
        L.featureGroup(allMarkers).getBounds(),
        { padding: [50, 50], maxZoom: 16 }
      );
    }
  };

  const handleToggleClosedStores = () => {
    setShowClosedStoresLayer(prev => {
      const next = !prev;
      if (next) {
        setSidebarTab('closed');
      } else if (sidebarTab === 'closed') {
        setSidebarTab('all');
      }
      return next;
    });
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
    let unsubStores: (() => void) | undefined;
    let cancelled = false;

    const attachListeners = () => {
      unsubDrivers?.();
      unsubPresence?.();
      unsubTracking?.();
      unsubStores?.();

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

      // Real-time stream of store profiles so open and closed restaurants appear and update live on the map
      unsubStores = onSnapshot(
        collection(db, 'profiles'),
        { includeMetadataChanges: true },
        snapshot => {
          if (cancelled) return;
          const profilesList: UserProfile[] = [];
          snapshot.forEach(docSnap => {
            const data = docSnap.data() as UserProfile;
            profilesList.push({
              ...data,
              uid: data.uid || docSnap.id,
            });
          });
          setRawStores(profilesList);
        },
        () => {
          // Non-fatal
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
      unsubStores?.();
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
      storeMarkers.current.clear();
      closedStoreMarkers.current.clear();
    };
  }, []);

  // Render & animate live delivery driver markers
  useEffect(() => {
    if (!map.current) return;
    const visibleDrivers = showDriversLayer ? located : [];
    const activeIds = new Set(visibleDrivers.map(d => d.id));

    // Remove markers for drivers no longer located or when layer is hidden
    markers.current.forEach((marker, id) => {
      if (!activeIds.has(id)) {
        cancelAnims.current.get(id)?.();
        cancelAnims.current.delete(id);
        prevPoints.current.delete(id);
        marker.remove();
        markers.current.delete(id);
      }
    });

    visibleDrivers.forEach(d => {
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
        marker = L.marker([p.lat, p.lng], { icon, zIndexOffset: 500 }).addTo(map.current!);
        marker.bindTooltip(tooltipText, { direction: 'top', offset: [0, -24] });
        marker.on('click', () => {
          setSelectedStoreId(null);
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

    if (!centered.current && (visibleDrivers.length || openStores.length)) {
      center();
      centered.current = true;
    }
  }, [drivers, positions, now, live, followedDriverId, showDriversLayer]);

  // Render open restaurant markers on the map
  useEffect(() => {
    if (!map.current) return;
    const visibleStores = showStoresLayer ? openStores : [];
    const activeStoreIds = new Set(visibleStores.map(item => item.store.uid));

    storeMarkers.current.forEach((marker, id) => {
      if (!activeStoreIds.has(id)) {
        marker.remove();
        storeMarkers.current.delete(id);
      }
    });

    visibleStores.forEach(item => {
      const { store, lat, lng, addressLabel } = item;
      const storeId = store.uid;
      const isSelected = selectedStoreId === storeId;
      const storeName = (store.displayName || store.storeName || store.username || 'Restaurante').trim();
      const tooltipText = `🍽️ ${storeName} · Abierto ahora${addressLabel ? ` · ${addressLabel}` : ''}`;

      let marker = storeMarkers.current.get(storeId);
      if (!marker) {
        const icon = L.divIcon({
          className: 'ryyco-open-store-marker',
          html: buildStoreMarkerHtml(store, isSelected, false),
          iconSize: [40, 56],
          iconAnchor: [20, 28],
        });
        marker = L.marker([lat, lng], { icon, zIndexOffset: 200 }).addTo(map.current!);
        marker.bindTooltip(tooltipText, { direction: 'top', offset: [0, -24] });
        marker.on('click', () => {
          setFollowedDriverId(null);
          setSelectedStoreId(prev => (prev === storeId ? null : storeId));
          if (map.current) {
            map.current.setView([lat, lng], 16, { animate: true });
          }
        });
        storeMarkers.current.set(storeId, marker);
      } else {
        marker.setLatLng([lat, lng]);
        marker.setTooltipContent(tooltipText);
        const el = marker.getElement();
        if (el) {
          const badgeEl = el.querySelector<HTMLElement>('[data-store-badge]');
          if (badgeEl) {
            badgeEl.style.background = isSelected ? '#7c2d12' : '#18181b';
            badgeEl.style.borderColor = isSelected ? '#34d399' : '#f97316';
          }
        }
      }
    });

    if (!centered.current && visibleStores.length) {
      center();
      centered.current = true;
    }
  }, [openStores, selectedStoreId, showStoresLayer]);

  // Render closed & expired restaurant markers on the map when enabled
  useEffect(() => {
    if (!map.current) return;
    const visibleClosedStores = showClosedStoresLayer ? filteredClosedStores : [];
    const activeClosedIds = new Set(visibleClosedStores.map(item => item.store.uid));

    closedStoreMarkers.current.forEach((marker, id) => {
      if (!activeClosedIds.has(id)) {
        marker.remove();
        closedStoreMarkers.current.delete(id);
      }
    });

    visibleClosedStores.forEach(item => {
      const { store, lat, lng, addressLabel, isExpired } = item;
      const storeId = store.uid;
      const isSelected = selectedStoreId === storeId;
      const storeName = (store.displayName || store.storeName || store.username || 'Restaurante').trim();
      const statusText = isExpired ? 'Expirado' : 'Cerrado activo';
      const statusIcon = isExpired ? '⏳' : '🔒';
      const tooltipText = `${statusIcon} ${storeName} · ${statusText}${addressLabel ? ` · ${addressLabel}` : ''}`;

      let marker = closedStoreMarkers.current.get(storeId);
      if (!marker) {
        const icon = L.divIcon({
          className: 'ryyco-closed-store-marker',
          html: buildStoreMarkerHtml(store, isSelected, true, isExpired),
          iconSize: [40, 56],
          iconAnchor: [20, 28],
        });
        marker = L.marker([lat, lng], { icon, zIndexOffset: 150 }).addTo(map.current!);
        marker.bindTooltip(tooltipText, { direction: 'top', offset: [0, -24] });
        marker.on('click', () => {
          setFollowedDriverId(null);
          setSelectedStoreId(prev => (prev === storeId ? null : storeId));
          if (map.current) {
            map.current.setView([lat, lng], 16, { animate: true });
          }
        });
        closedStoreMarkers.current.set(storeId, marker);
      } else {
        marker.setLatLng([lat, lng]);
        marker.setTooltipContent(tooltipText);
        const el = marker.getElement();
        if (el) {
          const badgeEl = el.querySelector<HTMLElement>('[data-store-badge]');
          if (badgeEl) {
            badgeEl.style.background = isSelected ? (isExpired ? '#581c87' : '#7f1d1d') : '#18181b';
            badgeEl.style.borderColor = isSelected ? '#34d399' : isExpired ? '#a855f7' : '#ef4444';
          }
        }
      }
    });
  }, [filteredClosedStores, selectedStoreId, showClosedStoresLayer]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Mapa de domiciliarios disponibles y restaurantes"
      className="fixed inset-0 z-[1000000] bg-[#0d1322] text-white flex flex-col h-[100dvh]"
    >
      <header className="p-4 border-b border-gray-800 bg-[#090d18] flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px]">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${live ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400 animate-ping'}`} />
            <h2 className="font-black text-base sm:text-lg tracking-tight">
              Domiciliarios disponibles y Restaurantes · Mapa en vivo
            </h2>
          </div>
          <p className="text-xs text-gray-300 mt-0.5" aria-live="polite">
            {live
              ? `${located.length} moviéndose con GPS en tiempo real · ${Math.max(0, drivers.length - located.length)} sin GPS reciente · ${openStores.length} restaurantes abiertos · ${closedActiveStores.length} cerrados activos · ${expiredStores.length} expirados`
              : 'Conectando con Firebase…'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleToggleClosedStores}
            className={`rounded-xl px-3 py-1.5 text-xs font-bold border transition cursor-pointer flex items-center gap-1.5 ${
              showClosedStoresLayer
                ? 'bg-red-500/20 border-red-500/50 text-red-300'
                : 'bg-gray-900 border-gray-800 text-gray-400 hover:border-red-500/40 hover:text-red-300'
            }`}
          >
            <span>🔒</span>
            <span>
              Restaurantes cerrados activos y expirados ({closedStores.length})
            </span>
          </button>

          <button
            type="button"
            onClick={() => setShowDriversLayer(v => !v)}
            className={`rounded-xl px-3 py-1.5 text-xs font-bold border transition cursor-pointer flex items-center gap-1.5 ${
              showDriversLayer
                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                : 'bg-gray-900 border-gray-800 text-gray-400'
            }`}
          >
            <span>🛵</span>
            <span>Domiciliarios ({located.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setShowStoresLayer(v => !v)}
            className={`rounded-xl px-3 py-1.5 text-xs font-bold border transition cursor-pointer flex items-center gap-1.5 ${
              showStoresLayer
                ? 'bg-orange-500/20 border-orange-500/50 text-orange-300'
                : 'bg-gray-900 border-gray-800 text-gray-400'
            }`}
          >
            <span>🍽️</span>
            <span>Restaurantes abiertos ({openStores.length})</span>
          </button>

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

        <aside className="md:w-80 max-h-[38dvh] md:max-h-none overflow-y-auto p-4 space-y-3 bg-[#0b101d] border-t md:border-t-0 md:border-l border-gray-800">
          {/* Sidebar Filter Tabs */}
          <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-gray-900/90 border border-gray-800">
            <button
              type="button"
              onClick={() => setSidebarTab('all')}
              className={`py-1.5 px-1.5 rounded-lg text-[11px] font-extrabold transition cursor-pointer ${
                sidebarTab === 'all'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => setSidebarTab('drivers')}
              className={`py-1.5 px-1.5 rounded-lg text-[11px] font-extrabold transition cursor-pointer truncate ${
                sidebarTab === 'drivers'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              🛵 ({drivers.length})
            </button>
            <button
              type="button"
              onClick={() => setSidebarTab('stores')}
              className={`py-1.5 px-1.5 rounded-lg text-[11px] font-extrabold transition cursor-pointer truncate ${
                sidebarTab === 'stores'
                  ? 'bg-orange-600 text-white shadow'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              🍽️ ({openStores.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setSidebarTab('closed');
                if (!showClosedStoresLayer) setShowClosedStoresLayer(true);
              }}
              className={`py-1.5 px-1.5 rounded-lg text-[11px] font-extrabold transition cursor-pointer truncate ${
                sidebarTab === 'closed'
                  ? 'bg-red-600 text-white shadow'
                  : 'text-gray-400 hover:text-white'
              }`}
              title="Restaurantes cerrados activos y expirados"
            >
              🔒 ({closedStores.length})
            </button>
          </div>

          {/* Closed Active & Expired Restaurants Section */}
          {(sidebarTab === 'closed' || (sidebarTab === 'all' && showClosedStoresLayer)) && (
            <div className="space-y-2">
              <div className="flex items-center justify-between pb-1 border-b border-gray-800/80">
                <span className="text-xs font-extrabold uppercase tracking-wider text-red-400">
                  Cerrados Activos y Expirados ({filteredClosedStores.length})
                </span>
                <button
                  type="button"
                  onClick={() => setShowClosedStoresLayer(v => !v)}
                  className="text-[11px] text-red-300 hover:text-red-200 font-bold underline cursor-pointer"
                >
                  {showClosedStoresLayer ? 'Ocultar en mapa' : 'Mostrar en mapa'}
                </button>
              </div>

              {/* Sub-filter pills for Closed Active vs Expired */}
              <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-gray-950/90 border border-gray-800">
                <button
                  type="button"
                  onClick={() => setClosedSubFilter('all')}
                  className={`py-1 px-1.5 rounded-md text-[10px] font-bold transition cursor-pointer truncate ${
                    closedSubFilter === 'all'
                      ? 'bg-gray-800 text-white border border-gray-600'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Todos ({closedStores.length})
                </button>
                <button
                  type="button"
                  onClick={() => setClosedSubFilter('active')}
                  className={`py-1 px-1.5 rounded-md text-[10px] font-bold transition cursor-pointer truncate ${
                    closedSubFilter === 'active'
                      ? 'bg-red-600/30 text-red-200 border border-red-500/50'
                      : 'text-gray-400 hover:text-red-300'
                  }`}
                >
                  🔒 Activos ({closedActiveStores.length})
                </button>
                <button
                  type="button"
                  onClick={() => setClosedSubFilter('expired')}
                  className={`py-1 px-1.5 rounded-md text-[10px] font-bold transition cursor-pointer truncate ${
                    closedSubFilter === 'expired'
                      ? 'bg-purple-600/30 text-purple-200 border border-purple-500/50'
                      : 'text-gray-400 hover:text-purple-300'
                  }`}
                >
                  ⏳ Expirados ({expiredStores.length})
                </button>
              </div>

              {filteredClosedStores.length === 0 ? (
                <p className="text-xs text-gray-400 py-2 text-center">
                  No hay restaurantes en esta categoría en este momento.
                </p>
              ) : (
                <div className="space-y-2">
                  {filteredClosedStores.map(({ store, lat, lng, hasExactGps, addressLabel, isExpired }) => {
                    const isSelected = selectedStoreId === store.uid;
                    const storeName = (store.displayName || store.storeName || store.username || 'Restaurante').trim();
                    return (
                      <button
                        key={store.uid}
                        type="button"
                        className={`block text-left w-full rounded-xl p-2.5 border transition cursor-pointer ${
                          isSelected
                            ? isExpired
                              ? 'bg-purple-950/60 border-purple-500/70 shadow-lg'
                              : 'bg-red-950/60 border-red-500/70 shadow-lg'
                            : isExpired
                              ? 'bg-gray-900/80 hover:bg-gray-800/90 border-purple-500/25'
                              : 'bg-gray-900/80 hover:bg-gray-800/90 border-red-500/25'
                        }`}
                        onClick={() => {
                          setFollowedDriverId(null);
                          setSelectedStoreId(prev => (prev === store.uid ? null : store.uid));
                          if (!showClosedStoresLayer) setShowClosedStoresLayer(true);
                          if (map.current) {
                            map.current.setView([lat, lng], 16, { animate: true });
                            setTimeout(() => {
                              closedStoreMarkers.current.get(store.uid)?.openTooltip();
                            }, 50);
                          }
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-sm text-white truncate flex items-center gap-1.5">
                            <span>{isExpired ? '⏳' : '🔒'}</span>
                            <span className="truncate">{storeName}</span>
                          </span>
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                              isExpired
                                ? 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                                : 'bg-red-500/15 text-red-300 border border-red-500/30'
                            }`}
                          >
                            {isExpired ? 'Cerrado · Expirado' : 'Cerrado · Activo'}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-gray-400">
                          <span className="truncate">📍 {addressLabel}</span>
                          <span
                            className={`text-[10px] font-bold shrink-0 underline ${
                              isExpired ? 'text-purple-300' : 'text-red-300'
                            }`}
                          >
                            {hasExactGps ? 'Ver GPS' : 'Ver en mapa'}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Open Restaurants Section */}
          {(sidebarTab === 'all' || sidebarTab === 'stores') && (
            <div className="space-y-2">
              <div className="flex items-center justify-between pb-1 border-b border-gray-800/80">
                <span className="text-xs font-extrabold uppercase tracking-wider text-orange-400">
                  Restaurantes Abiertos ({openStores.length})
                </span>
                <span className="text-[11px] text-emerald-400 font-bold">
                  En vivo
                </span>
              </div>

              {openStores.length === 0 ? (
                <p className="text-xs text-gray-400 py-2 text-center">
                  No hay restaurantes abiertos en este momento.
                </p>
              ) : (
                <div className="space-y-2">
                  {openStores.map(({ store, lat, lng, hasExactGps, addressLabel }) => {
                    const isSelected = selectedStoreId === store.uid;
                    const storeName = (store.displayName || store.storeName || store.username || 'Restaurante').trim();
                    return (
                      <button
                        key={store.uid}
                        type="button"
                        className={`block text-left w-full rounded-xl p-2.5 border transition cursor-pointer ${
                          isSelected
                            ? 'bg-orange-950/60 border-orange-500/70 shadow-lg'
                            : 'bg-gray-900/80 hover:bg-gray-800/90 border-orange-500/25'
                        }`}
                        onClick={() => {
                          setFollowedDriverId(null);
                          setSelectedStoreId(prev => (prev === store.uid ? null : store.uid));
                          if (!showStoresLayer) setShowStoresLayer(true);
                          const marker = storeMarkers.current.get(store.uid);
                          if (map.current) {
                            map.current.setView([lat, lng], 16, { animate: true });
                            marker?.openTooltip();
                          }
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-sm text-white truncate flex items-center gap-1.5">
                            <span>🍽️</span>
                            <span className="truncate">{storeName}</span>
                          </span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shrink-0">
                            Abierto
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-gray-400">
                          <span className="truncate">📍 {addressLabel}</span>
                          <span className="text-[10px] font-bold text-orange-300 shrink-0 underline">
                            {hasExactGps ? 'Ver GPS' : 'Ver en mapa'}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Active Drivers Section */}
          {(sidebarTab === 'all' || sidebarTab === 'drivers') && (
            <div className="space-y-2 pt-1">
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

              {sortedDrivers.map(d => {
                const p = positions[d.id];
                const isLiveGps = located.some(v => v.id === d.id);
                const isFollowing = followedDriverId === d.id;
                const ageSec = p && isLiveGps ? Math.max(0, Math.round((now - p.gpsTimestamp) / 1000)) : null;
                const speedKmh = p && typeof p.speed === 'number' && p.speed >= 1 ? Math.round(p.speed) : null;

                return (
                  <button
                    key={d.id}
                    type="button"
                    className={`block text-left w-full rounded-xl p-3 border transition cursor-pointer ${
                      isFollowing
                        ? 'bg-emerald-950/60 border-emerald-500/60 shadow-lg'
                        : isLiveGps
                        ? 'bg-gray-900/90 hover:bg-gray-800 border-emerald-500/30'
                        : 'bg-gray-900/50 hover:bg-gray-800/70 border-gray-800'
                    }`}
                    onClick={() => {
                      if (!showDriversLayer) setShowDriversLayer(true);
                      const marker = markers.current.get(d.id);
                      if (marker && map.current) {
                        setSelectedStoreId(null);
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
            </div>
          )}

          <p className="text-[11px] text-gray-400 pt-2 leading-relaxed">
            Los domiciliarios con GPS activo y los restaurantes se muestran en tiempo real sobre el mapa. Haz clic en cualquiera para ubicarlo en el mapa.
          </p>
        </aside>
      </div>
    </div>,
    document.body
  );
}


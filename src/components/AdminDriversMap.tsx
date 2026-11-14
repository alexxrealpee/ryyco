import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './adminFlatTheme.css';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { auth, db, signInWithGoogleUniversal, checkIsStoreClosed } from '../lib/firebase';
import { lockBodyScroll } from '../lib/bodyScrollLock';
import { animateGps, validCoordinates, GPS_FRESH_MS, type GpsPoint } from '../lib/deliveryTracking';
import { extractCoordinates } from '../lib/coordinateUtils';
import type { DriverProfile, UserProfile } from '../types';

// Official RYYCO Palette
const RYYCO_GREEN = '#10B981';
const RYYCO_RED = '#E63946';
const RYYCO_YELLOW = '#F4B400';
const RYYCO_DARK_BG = '#090B12';

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
  lat: number | null;
  lng: number | null;
  hasExactGps: boolean;
  addressLabel: string;
  isClosed: boolean;
  isExpired: boolean;
  needsAttention: boolean;
  closedCategory: 'open' | 'closed_active' | 'expired';
};

type StoreRenderNode =
  | {
      kind: 'single';
      id: string;
      lat: number;
      lng: number;
      item: LocatedStore;
    }
  | {
      kind: 'cluster';
      id: string;
      lat: number;
      lng: number;
      items: LocatedStore[];
      openCount: number;
      closedCount: number;
      attentionCount: number;
    };

/**
 * Determines whether a store is closed specifically due to an expired subscription,
 * using the exact same subscription criteria as `checkIsStoreClosed` in `src/lib/firebase.ts`.
 * A store with `subscriptionStatus === 'active'` or `'under_review'` or a future `subscriptionPaidUntil`
 * is never treated as expired.
 */
function isClosedByExpiredSubscription(profile?: UserProfile | null): boolean {
  if (!profile) return false;
  if (profile.subscriptionStatus === 'expired') {
    return true;
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
          return true;
        }
      }
    }
  }

  return false;
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
 * Resolves GPS coordinates for a restaurant.
 * Uses exact stored GPS coordinates (`lat`/`lng` or `mapUrl`/address coordinate extraction) when available.
 * If a restaurant does not have valid GPS coordinates, `hasExactGps` is `false` and `lat`/`lng` are `null`
 * so the restaurant is still counted and listed with a pending location warning without placing an invalid marker.
 */
function resolveStoreMapCoordinates(store: UserProfile): { lat: number | null; lng: number | null; hasExactGps: boolean } {
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

  return {
    lat: null,
    lng: null,
    hasExactGps: false,
  };
}

/**
 * Projects [lat, lng] into Web Mercator pixel coordinates at a given zoom level
 * for fast, deterministic marker clustering and overlap separation.
 */
function projectToPixel(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const scale = 256 * Math.pow(2, zoom);
  const x = ((lng + 180) / 360) * scale;
  const sinLat = Math.max(-0.9999, Math.min(0.9999, Math.sin((lat * Math.PI) / 180)));
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
  return { x, y };
}

function unprojectFromPixel(x: number, y: number, zoom: number): { lat: number; lng: number } {
  const scale = 256 * Math.pow(2, zoom);
  const lng = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat, lng };
}

/**
 * Checks whether a coordinate is inside the Ipiales metropolitan area
 * so outlier ISP locations (e.g. Pasto/Cali) do not pull the camera out of Ipiales.
 */
function isWithinIpialesArea(lat: number, lng: number): boolean {
  return lat >= 0.76 && lat <= 0.90 && lng >= -77.72 && lng <= -77.56;
}

/**
 * Builds zoom-aware clusters when zoomed out (`zoom <= 14`) and shows individual circular
 * logo markers at city zoom (`zoom >= 15`) with automatic circular separation (spiderfy)
 * when multiple restaurants share identical/near-identical coordinates.
 */
function computeStoreRenderNodes(
  storesWithGps: LocatedStore[],
  zoom: number,
  selectedStoreId: string | null
): StoreRenderNode[] {
  if (storesWithGps.length === 0) return [];

  // At city zoom (>= 15), show every restaurant individually and separate any near-identical coordinates
  if (zoom >= 15) {
    const projected = storesWithGps.map(item => ({
      item,
      pt: projectToPixel(item.lat!, item.lng!, zoom),
    }));

    const visited = new Set<number>();
    const result: StoreRenderNode[] = [];
    const minSeparationPx = 30;

    for (let i = 0; i < projected.length; i++) {
      if (visited.has(i)) continue;
      const groupIndices = [i];
      visited.add(i);

      for (let j = i + 1; j < projected.length; j++) {
        if (visited.has(j)) continue;
        const dx = projected[i].pt.x - projected[j].pt.x;
        const dy = projected[i].pt.y - projected[j].pt.y;
        if (Math.hypot(dx, dy) < minSeparationPx) {
          groupIndices.push(j);
          visited.add(j);
        }
      }

      if (groupIndices.length === 1) {
        const entry = projected[i].item;
        result.push({
          kind: 'single',
          id: `store_${entry.store.uid}`,
          lat: entry.lat!,
          lng: entry.lng!,
          item: entry,
        });
      } else {
        const centerX = groupIndices.reduce((acc, idx) => acc + projected[idx].pt.x, 0) / groupIndices.length;
        const centerY = groupIndices.reduce((acc, idx) => acc + projected[idx].pt.y, 0) / groupIndices.length;
        const radiusPx = Math.max(20, groupIndices.length * 6);

        groupIndices.forEach((idx, k) => {
          const entry = projected[idx].item;
          const angle = (2 * Math.PI * k) / groupIndices.length - Math.PI / 2;
          const offsetPt = unprojectFromPixel(
            centerX + Math.cos(angle) * radiusPx,
            centerY + Math.sin(angle) * radiusPx,
            zoom
          );
          result.push({
            kind: 'single',
            id: `store_${entry.store.uid}`,
            lat: offsetPt.lat,
            lng: offsetPt.lng,
            item: entry,
          });
        });
      }
    }

    return result;
  }

  // Zoom <= 14: anchor-based pixel-distance clustering so nearby buckets never chain-merge across the whole city
  const clusterRadiusPx = zoom <= 12 ? 42 : zoom === 13 ? 34 : 26;

  type ClusterBucket = {
    anchorX: number;
    anchorY: number;
    items: LocatedStore[];
    sumLat: number;
    sumLng: number;
  };

  const buckets: ClusterBucket[] = [];
  const standaloneSelected: LocatedStore[] = [];

  storesWithGps.forEach(item => {
    // Keep the currently selected restaurant unclustered so its marker and floating card remain focused
    if (selectedStoreId && item.store.uid === selectedStoreId) {
      standaloneSelected.push(item);
      return;
    }

    const pt = projectToPixel(item.lat!, item.lng!, zoom);
    let bestBucket: ClusterBucket | null = null;
    let bestDist = Infinity;

    for (const b of buckets) {
      const dist = Math.hypot(pt.x - b.anchorX, pt.y - b.anchorY);
      if (dist <= clusterRadiusPx && dist < bestDist) {
        bestDist = dist;
        bestBucket = b;
      }
    }

    if (bestBucket) {
      bestBucket.items.push(item);
      bestBucket.sumLat += item.lat!;
      bestBucket.sumLng += item.lng!;
    } else {
      buckets.push({
        anchorX: pt.x,
        anchorY: pt.y,
        items: [item],
        sumLat: item.lat!,
        sumLng: item.lng!,
      });
    }
  });

  const nodes: StoreRenderNode[] = [];

  standaloneSelected.forEach(item => {
    nodes.push({
      kind: 'single',
      id: `store_${item.store.uid}`,
      lat: item.lat!,
      lng: item.lng!,
      item,
    });
  });

  buckets.forEach(b => {
    if (b.items.length === 1) {
      const only = b.items[0];
      nodes.push({
        kind: 'single',
        id: `store_${only.store.uid}`,
        lat: only.lat!,
        lng: only.lng!,
        item: only,
      });
    } else {
      const sortedIds = b.items.map(i => i.store.uid).sort().join('_');
      const openCount = b.items.filter(i => !i.isClosed).length;
      const attentionCount = b.items.filter(i => i.isClosed && i.needsAttention).length;
      const closedCount = b.items.filter(i => i.isClosed && !i.needsAttention).length;
      nodes.push({
        kind: 'cluster',
        id: `cluster_${zoom}_${sortedIds}`,
        lat: b.sumLat / b.items.length,
        lng: b.sumLng / b.items.length,
        items: b.items,
        openCount,
        closedCount,
        attentionCount,
      });
    }
  });

  return nodes;
}

function buildDriverMarkerHtml(driver: DriverProfile, pos: PresenceRecord, isFollowed: boolean): string {
  const fullName = ([driver.firstName, driver.lastName].filter(Boolean).join(' ') || (driver as any).name || 'Domiciliario').trim();
  const shortName = fullName.split(/\s+/).slice(0, 2).join(' ');
  const emoji = getVehicleEmoji(driver.vehicleType);
  const speedKmh = typeof pos.speed === 'number' && Number.isFinite(pos.speed) && pos.speed >= 1 ? Math.round(pos.speed) : null;
  const hasOrder = Boolean(pos.orderNumber);
  const headingDeg = typeof pos.heading === 'number' && Number.isFinite(pos.heading) ? Math.round(pos.heading) : null;
  const ringColor = hasOrder ? RYYCO_YELLOW : RYYCO_GREEN;
  const badgeBg = isFollowed ? '#059669' : RYYCO_DARK_BG;

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

/**
 * Compact circular restaurant marker with original logo centered, RYYCO status ring,
 * and zero permanent text clutter over streets.
 */
function buildStoreMarkerHtml(item: LocatedStore, isSelected: boolean): string {
  const { store, isClosed, needsAttention } = item;
  const rawName = (store.displayName || store.storeName || store.username || 'Restaurante').trim();
  const initial = (rawName.charAt(0) || 'R').toUpperCase();

  const statusColor = !isClosed
    ? RYYCO_GREEN
    : needsAttention
      ? RYYCO_YELLOW
      : RYYCO_RED;

  const size = isSelected ? 48 : 38;
  const borderWidth = isSelected ? 3.5 : 2.5;
  const dotSize = isSelected ? 13 : 11;
  const glowShadow = isSelected
    ? `0 0 0 4px ${statusColor}44, 0 8px 20px rgba(0,0,0,0.65)`
    : '0 4px 12px rgba(0,0,0,0.55)';

  const photoUrl = (store.photoURL || '').trim();
  const avatarInner = photoUrl
    ? `<img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(rawName)}" style="width:100%;height:100%;object-fit:cover;border-radius:9999px;display:block;${isClosed ? 'filter:grayscale(25%);opacity:0.92;' : ''}" onerror="this.style.display='none';this.parentElement.textContent='${escapeHtml(initial)}';" />`
    : `<span style="color:#ffffff;font-weight:900;font-size:${isSelected ? 16 : 13}px;letter-spacing:-0.02em;">${escapeHtml(initial)}</span>`;

  return `
    <div style="position:relative;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;transform:translate(-50%,-50%);pointer-events:auto;transition:transform 0.18s ease;">
      <div data-store-circle style="position:relative;width:${size}px;height:${size}px;border-radius:9999px;background:${RYYCO_DARK_BG};border:${borderWidth}px solid ${statusColor};box-shadow:${glowShadow};display:flex;align-items:center;justify-content:center;overflow:hidden;">
        ${avatarInner}
      </div>
      <span style="position:absolute;bottom:-1px;right:-1px;width:${dotSize}px;height:${dotSize}px;border-radius:9999px;background:${statusColor};border:2px solid ${RYYCO_DARK_BG};box-shadow:0 1px 4px rgba(0,0,0,0.5);"></span>
    </div>
  `;
}

/**
 * Compact circular cluster marker showing the count of grouped restaurants and their RYYCO status colors.
 */
function buildClusterMarkerHtml(
  items: LocatedStore[],
  openCount: number,
  closedCount: number,
  attentionCount: number
): string {
  const total = items.length;
  const size = total >= 10 ? 48 : 42;

  let ringColor = RYYCO_GREEN;
  if (openCount === 0 && attentionCount > 0 && closedCount === 0) {
    ringColor = RYYCO_YELLOW;
  } else if (openCount === 0 && closedCount > 0) {
    ringColor = RYYCO_RED;
  } else if (openCount > 0 && (closedCount > 0 || attentionCount > 0)) {
    ringColor = RYYCO_GREEN;
  }

  const badgeDotColor = openCount > 0 ? RYYCO_GREEN : attentionCount > 0 ? RYYCO_YELLOW : RYYCO_RED;

  return `
    <div style="position:relative;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;transform:translate(-50%,-50%);pointer-events:auto;">
      <span style="position:absolute;inset:-4px;border-radius:9999px;background:${ringColor};opacity:0.22;"></span>
      <div style="position:relative;width:${size}px;height:${size}px;border-radius:9999px;background:${RYYCO_DARK_BG};border:3px solid ${ringColor};box-shadow:0 6px 16px rgba(0,0,0,0.6);display:flex;flex-direction:column;align-items:center;justify-content:center;color:#ffffff;line-height:1;">
        <span style="font-size:${total >= 10 ? 14 : 15}px;font-weight:900;letter-spacing:-0.03em;">${total}</span>
        <span style="font-size:8px;font-weight:800;color:#cbd5e1;text-transform:uppercase;margin-top:1px;">locales</span>
      </div>
      <span style="position:absolute;bottom:-1px;right:-1px;width:12px;height:12px;border-radius:9999px;background:${badgeDotColor};border:2px solid ${RYYCO_DARK_BG};"></span>
    </div>
  `;
}

function buildStoreTooltipHtml(item: LocatedStore): string {
  const { store, isClosed, needsAttention } = item;
  const name = (store.displayName || store.storeName || store.username || 'Restaurante').trim();
  const statusLabel = !isClosed
    ? 'Abierto'
    : needsAttention
      ? 'Requiere atención · Expirado'
      : 'Cerrado';
  const statusColor = !isClosed
    ? RYYCO_GREEN
    : needsAttention
      ? RYYCO_YELLOW
      : RYYCO_RED;

  return `
    <div style="display:flex;align-items:center;gap:6px;padding:2px 4px;font-family:system-ui,-apple-system,sans-serif;">
      <span style="width:8px;height:8px;border-radius:9999px;background:${statusColor};flex-shrink:0;"></span>
      <span style="font-weight:800;font-size:12px;color:#ffffff;">${escapeHtml(name)}</span>
      <span style="font-size:10px;font-weight:700;color:${statusColor};">· ${statusLabel}</span>
    </div>
  `;
}

function buildClusterTooltipHtml(items: LocatedStore[], openCount: number, closedCount: number, attentionCount: number): string {
  const previewNames = items
    .slice(0, 4)
    .map(i => escapeHtml((i.store.displayName || i.store.storeName || i.store.username || 'Restaurante').trim()))
    .join(', ');
  const extra = items.length > 4 ? ` y ${items.length - 4} más` : '';

  const parts: string[] = [];
  if (openCount > 0) parts.push(`<span style="color:${RYYCO_GREEN};font-weight:800;">${openCount} abiertos</span>`);
  if (closedCount > 0) parts.push(`<span style="color:${RYYCO_RED};font-weight:800;">${closedCount} cerrados</span>`);
  if (attentionCount > 0) parts.push(`<span style="color:${RYYCO_YELLOW};font-weight:800;">${attentionCount} expirados</span>`);

  return `
    <div style="padding:3px 5px;max-width:240px;white-space:normal;font-family:system-ui,-apple-system,sans-serif;">
      <div style="font-weight:800;font-size:12px;color:#ffffff;margin-bottom:2px;">
        ${items.length} restaurantes agrupados
      </div>
      <div style="font-size:11px;display:flex;flex-wrap:wrap;gap:6px;margin-bottom:3px;">
        ${parts.join(' · ')}
      </div>
      <div style="font-size:10px;color:#cbd5e1;line-height:1.3;">
        ${previewNames}${extra}
      </div>
      <div style="font-size:10px;color:${RYYCO_YELLOW};font-weight:700;margin-top:3px;">
        Clic para acercar y separar
      </div>
    </div>
  `;
}

export default function AdminDriversMap({ onClose }: { onClose: () => void }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markers = useRef(new Map<string, L.Marker>());
  const storeLayerMarkers = useRef(new Map<string, { marker: L.Marker; signature: string }>());
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
  const [mapZoom, setMapZoom] = useState(15);
  const [mapType, setMapType] = useState<'roadmap' | 'hybrid'>('roadmap');
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
  // Single source of truth: `checkIsStoreClosed(store)` from `src/lib/firebase.ts` (same as main RYYCO platform)
  const { openStores, closedActiveStores, expiredStores, closedStores, allLocatedStoresMap } = useMemo<{
    openStores: LocatedStore[];
    closedActiveStores: LocatedStore[];
    expiredStores: LocatedStore[];
    closedStores: LocatedStore[];
    allLocatedStoresMap: Map<string, LocatedStore>;
  }>(() => {
    const byUid = new Map<string, UserProfile>();
    const uidByUsername = new Map<string, string>();

    rawStores.forEach(s => {
      if (!s) return;
      if (s.role === 'driver' || s.role === 'customer') return;
      const name = (s.displayName || s.storeName || s.username || '').trim();
      if (!name) return;

      const rawUid = (s.uid || '').trim();
      const normUsername = (s.username || '').replace(/^@+/, '').toLowerCase().trim();
      const canonicalKey =
        (rawUid && byUid.has(rawUid) ? rawUid : null) ||
        (normUsername && uidByUsername.has(normUsername) ? uidByUsername.get(normUsername)! : null) ||
        rawUid ||
        normUsername ||
        name.toLowerCase();

      const prev = byUid.get(canonicalKey);
      if (!prev) {
        const normalizedStore: UserProfile = {
          ...s,
          uid: rawUid || canonicalKey,
        };
        byUid.set(canonicalKey, normalizedStore);
        if (normUsername) uidByUsername.set(normUsername, canonicalKey);
      } else {
        const merged: UserProfile = {
          ...prev,
          ...s,
          uid: prev.uid || rawUid || canonicalKey,
          displayName: s.displayName || prev.displayName || s.storeName || prev.storeName,
          username: s.username || prev.username,
          lat: s.lat ?? prev.lat,
          lng: s.lng ?? prev.lng,
          mapUrl: s.mapUrl || prev.mapUrl,
          photoURL: s.photoURL || prev.photoURL,
          restaurantAddress: s.restaurantAddress || prev.restaurantAddress || s.address || prev.address,
        };
        byUid.set(canonicalKey, merged);
        if (normUsername) uidByUsername.set(normUsername, canonicalKey);
      }
    });

    const list = Array.from(byUid.values()).sort((a, b) => {
      const nameA = (a.displayName || a.storeName || a.username || '').toLowerCase();
      const nameB = (b.displayName || b.storeName || b.username || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });

    const open: LocatedStore[] = [];
    const closedActive: LocatedStore[] = [];
    const expired: LocatedStore[] = [];
    const storeLookup = new Map<string, LocatedStore>();

    list.forEach(store => {
      if (store.suspended === true || store.subscriptionStatus === 'suspended') return;

      const coords = resolveStoreMapCoordinates(store);
      const addressLabel = (store.restaurantAddress || store.address || store.restaurantCity || store.location || 'Ipiales').trim();

      // Use the exact same open/close function as the main RYYCO platform (`TiendaGeneral` / `useProgressiveStoreLoader`)
      const isClosed = checkIsStoreClosed(store);

      if (!isClosed) {
        const locatedItem: LocatedStore = {
          store,
          lat: coords.lat,
          lng: coords.lng,
          hasExactGps: coords.hasExactGps,
          addressLabel,
          isClosed: false,
          isExpired: false,
          needsAttention: !coords.hasExactGps,
          closedCategory: 'open',
        };
        open.push(locatedItem);
        storeLookup.set(store.uid, locatedItem);
        return;
      }

      const isExpired = isClosedByExpiredSubscription(store);
      if (isExpired) {
        const locatedItem: LocatedStore = {
          store,
          lat: coords.lat,
          lng: coords.lng,
          hasExactGps: coords.hasExactGps,
          addressLabel,
          isClosed: true,
          isExpired: true,
          needsAttention: true,
          closedCategory: 'expired',
        };
        expired.push(locatedItem);
        storeLookup.set(store.uid, locatedItem);
      } else {
        const locatedItem: LocatedStore = {
          store,
          lat: coords.lat,
          lng: coords.lng,
          hasExactGps: coords.hasExactGps,
          addressLabel,
          isClosed: true,
          isExpired: false,
          needsAttention: false,
          closedCategory: 'closed_active',
        };
        closedActive.push(locatedItem);
        storeLookup.set(store.uid, locatedItem);
      }
    });

    return {
      openStores: open,
      closedActiveStores: closedActive,
      expiredStores: expired,
      closedStores: [...closedActive, ...expired],
      allLocatedStoresMap: storeLookup,
    };
  }, [rawStores, now]);

  const filteredClosedStores = useMemo(() => {
    if (closedSubFilter === 'active') return closedActiveStores;
    if (closedSubFilter === 'expired') return expiredStores;
    return closedStores;
  }, [closedSubFilter, closedActiveStores, expiredStores, closedStores]);

  // Currently selected store for the single interactive floating card
  const selectedLocatedStore = useMemo<LocatedStore | null>(() => {
    if (!selectedStoreId) return null;
    return allLocatedStoresMap.get(selectedStoreId) || null;
  }, [selectedStoreId, allLocatedStoresMap]);

  // Visible stores with valid GPS coordinates to render on the map (clustered or individual)
  const visibleMapStores = useMemo<LocatedStore[]>(() => {
    const list: LocatedStore[] = [];
    if (showStoresLayer) {
      openStores.forEach(item => {
        if (item.hasExactGps && item.lat !== null && item.lng !== null && validCoordinates(item.lat, item.lng)) {
          list.push(item);
        }
      });
    }
    if (showClosedStoresLayer) {
      filteredClosedStores.forEach(item => {
        if (item.hasExactGps && item.lat !== null && item.lng !== null && validCoordinates(item.lat, item.lng)) {
          list.push(item);
        }
      });
    }
    return list;
  }, [openStores, filteredClosedStores, showStoresLayer, showClosedStoresLayer]);

  const storeRenderNodes = useMemo<StoreRenderNode[]>(() => {
    return computeStoreRenderNodes(visibleMapStores, mapZoom, selectedStoreId);
  }, [visibleMapStores, mapZoom, selectedStoreId]);

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
    if (!map.current) return;

    const candidatePoints: [number, number][] = [];
    visibleMapStores.forEach(s => {
      if (s.lat !== null && s.lng !== null && validCoordinates(s.lat, s.lng)) {
        candidatePoints.push([s.lat, s.lng]);
      }
    });
    if (showDriversLayer) {
      located.forEach(d => {
        const p = positions[d.id];
        if (p && validCoordinates(p.lat, p.lng)) {
          candidatePoints.push([p.lat, p.lng]);
        }
      });
    }

    // Prioritize points within the Ipiales operational area so an outlier ISP coordinate
    // in Pasto/Cali never pulls the Google Maps viewport out to the regional/department scale
    const ipialesPoints = candidatePoints.filter(([lat, lng]) => isWithinIpialesArea(lat, lng));
    const targetPoints = ipialesPoints.length > 0 ? ipialesPoints : candidatePoints;

    if (targetPoints.length > 0) {
      const bounds = L.latLngBounds(targetPoints);
      map.current.fitBounds(bounds, { padding: [45, 45], maxZoom: 16 });
      if (ipialesPoints.length > 0 && map.current.getZoom() < 14) {
        map.current.setView([0.8285, -77.6415], 15);
      }
    } else {
      map.current.setView([0.8285, -77.6415], 15);
    }
  };

  const focusStoreOnMap = (item: LocatedStore, targetZoom = 17) => {
    setFollowedDriverId(null);
    setSelectedStoreId(item.store.uid);
    if (item.isClosed && !showClosedStoresLayer) {
      setShowClosedStoresLayer(true);
    } else if (!item.isClosed && !showStoresLayer) {
      setShowStoresLayer(true);
    }
    if (item.hasExactGps && item.lat !== null && item.lng !== null && map.current) {
      const nextZoom = Math.max(map.current.getZoom(), targetZoom);
      map.current.setView([item.lat, item.lng], nextZoom, { animate: true });
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
    let storesConfirmedFromServer = false;
    let cancelled = false;
    const abortController = new AbortController();

    // Immediate server-fresh bootstrap of store profiles so no stale cache or delayed listener omits open stores
    fetch('/api/catalog-page.php?kind=stores', {
      cache: 'no-store',
      signal: abortController.signal,
    })
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (cancelled || storesConfirmedFromServer) return;
        if (data?.source === 'firestore-server' && data?.kind === 'stores' && Array.isArray(data.items)) {
          const items: UserProfile[] = data.items.map((item: any) => ({
            ...item,
            uid: item.uid || item.id,
          }));
          setRawStores(items);
        }
      })
      .catch(() => {
        // Fallback handled by live Firestore onSnapshot listener below
      });

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
          // Prevent stale local IndexedDB cache from overwriting confirmed server state
          if (snapshot.metadata.fromCache && storesConfirmedFromServer) {
            return;
          }
          if (!snapshot.metadata.fromCache) {
            storesConfirmedFromServer = true;
          }
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
      abortController.abort();
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
    const instance = L.map(container.current, { zoomControl: true }).setView([0.8285, -77.6415], 15);
    map.current = instance;
    setMapZoom(instance.getZoom());

    // Base cartography: Google Maps tiles (Spanish labels, street detail up to zoom 21)
    const googleLayer = L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&hl=es&x={x}&y={y}&z={z}', {
      subdomains: ['0', '1', '2', '3'],
      attribution: '&copy; Google Maps',
      maxZoom: 21,
    }).addTo(instance);
    tileLayerRef.current = googleLayer;

    const handleZoomEnd = () => {
      setMapZoom(instance.getZoom());
    };
    const handleMapClick = () => {
      setSelectedStoreId(null);
    };

    instance.on('zoomend', handleZoomEnd);
    instance.on('click', handleMapClick);

    const resize = new ResizeObserver(() => instance.invalidateSize());
    resize.observe(container.current);

    return () => {
      instance.off('zoomend', handleZoomEnd);
      instance.off('click', handleMapClick);
      cancelAnims.current.forEach(cancel => cancel());
      cancelAnims.current.clear();
      prevPoints.current.clear();
      resize.disconnect();
      instance.remove();
      map.current = null;
      tileLayerRef.current = null;
      markers.current.clear();
      storeLayerMarkers.current.clear();
    };
  }, []);

  // Switch between Google Maps Roadmap ('m') and Hybrid Satellite ('y')
  useEffect(() => {
    if (!tileLayerRef.current) return;
    const lyrs = mapType === 'hybrid' ? 'y' : 'm';
    tileLayerRef.current.setUrl(`https://mt{s}.google.com/vt/lyrs=${lyrs}&hl=es&x={x}&y={y}&z={z}`);
  }, [mapType]);

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
        marker = L.marker([p.lat, p.lng], { icon, zIndexOffset: 650 }).addTo(map.current!);
        marker.bindTooltip(tooltipText, {
          direction: 'top',
          offset: [0, -24],
          className: 'ryyco-dark-tooltip',
        });
        marker.on('click', (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
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
            badgeEl.style.background = isFollowed ? '#059669' : RYYCO_DARK_BG;
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

    if (!centered.current && visibleMapStores.length > 0) {
      center();
      centered.current = true;
    }
  }, [drivers, positions, now, live, followedDriverId, showDriversLayer]);

  // Incrementally render & update restaurant markers and smart cluster markers on the map
  useEffect(() => {
    if (!map.current) return;
    const activeNodeIds = new Set(storeRenderNodes.map(n => n.id));

    // Remove only markers that are no longer in the current render nodes
    storeLayerMarkers.current.forEach((entry, id) => {
      if (!activeNodeIds.has(id)) {
        entry.marker.remove();
        storeLayerMarkers.current.delete(id);
      }
    });

    storeRenderNodes.forEach(node => {
      if (node.kind === 'single') {
        const { item, lat, lng, id } = node;
        const storeId = item.store.uid;
        const isSelected = selectedStoreId === storeId;
        const size = isSelected ? 48 : 38;
        const zIndex = isSelected ? 900 : item.isClosed ? 180 : 300;
        const signature = [
          'single',
          lat.toFixed(6),
          lng.toFixed(6),
          isSelected ? '1' : '0',
          item.isClosed ? '1' : '0',
          item.needsAttention ? '1' : '0',
          item.store.photoURL || '',
          item.store.displayName || item.store.storeName || item.store.username || '',
        ].join('|');

        const existing = storeLayerMarkers.current.get(id);
        const tooltipHtml = buildStoreTooltipHtml(item);

        if (!existing) {
          const icon = L.divIcon({
            className: 'ryyco-compact-store-marker',
            html: buildStoreMarkerHtml(item, isSelected),
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2],
          });
          const marker = L.marker([lat, lng], { icon, zIndexOffset: zIndex }).addTo(map.current!);
          marker.bindTooltip(tooltipHtml, {
            direction: 'top',
            offset: [0, -(size / 2) - 4],
            className: 'ryyco-dark-tooltip',
            opacity: 1,
          });
          marker.on('click', (e: L.LeafletMouseEvent) => {
            L.DomEvent.stopPropagation(e);
            setFollowedDriverId(null);
            setSelectedStoreId(prev => (prev === storeId ? null : storeId));
          });
          storeLayerMarkers.current.set(id, { marker, signature });
        } else if (existing.signature !== signature) {
          existing.marker.setLatLng([lat, lng]);
          existing.marker.setZIndexOffset(zIndex);
          existing.marker.setIcon(
            L.divIcon({
              className: 'ryyco-compact-store-marker',
              html: buildStoreMarkerHtml(item, isSelected),
              iconSize: [size, size],
              iconAnchor: [size / 2, size / 2],
            })
          );
          existing.marker.setTooltipContent(tooltipHtml);
          existing.signature = signature;
        }
      } else {
        const { id, lat, lng, items, openCount, closedCount, attentionCount } = node;
        const size = items.length >= 10 ? 48 : 42;
        const signature = ['cluster', lat.toFixed(6), lng.toFixed(6), openCount, closedCount, attentionCount].join('|');
        const tooltipHtml = buildClusterTooltipHtml(items, openCount, closedCount, attentionCount);
        const existing = storeLayerMarkers.current.get(id);

        if (!existing) {
          const icon = L.divIcon({
            className: 'ryyco-cluster-store-marker',
            html: buildClusterMarkerHtml(items, openCount, closedCount, attentionCount),
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2],
          });
          const marker = L.marker([lat, lng], { icon, zIndexOffset: 420 }).addTo(map.current!);
          marker.bindTooltip(tooltipHtml, {
            direction: 'top',
            offset: [0, -(size / 2) - 4],
            className: 'ryyco-dark-tooltip',
            opacity: 1,
          });
          marker.on('click', (e: L.LeafletMouseEvent) => {
            L.DomEvent.stopPropagation(e);
            if (map.current) {
              const currentZoom = map.current.getZoom();
              map.current.setView([lat, lng], Math.min(18, Math.max(currentZoom + 2, 16)), { animate: true });
            }
          });
          storeLayerMarkers.current.set(id, { marker, signature });
        } else if (existing.signature !== signature) {
          existing.marker.setLatLng([lat, lng]);
          existing.marker.setIcon(
            L.divIcon({
              className: 'ryyco-cluster-store-marker',
              html: buildClusterMarkerHtml(items, openCount, closedCount, attentionCount),
              iconSize: [size, size],
              iconAnchor: [size / 2, size / 2],
            })
          );
          existing.marker.setTooltipContent(tooltipHtml);
          existing.signature = signature;
        }
      }
    });

    if (!centered.current && visibleMapStores.length > 0) {
      center();
      centered.current = true;
    }
  }, [storeRenderNodes, selectedStoreId, visibleMapStores]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Mapa de domiciliarios disponibles y restaurantes"
      className="ryyco-admin-theme fixed inset-0 z-[1000000] bg-black text-white flex flex-col h-[100dvh]"
    >
      {/* Scoped dark tooltip styling for Leaflet hover tooltips */}
      <style>{`
        .ryyco-dark-tooltip.leaflet-tooltip {
          background-color: #090B12 !important;
          color: #FFFFFF !important;
          border: 1px solid rgba(255, 255, 255, 0.16) !important;
          border-radius: 10px !important;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.65) !important;
          padding: 4px 8px !important;
        }
        .ryyco-dark-tooltip.leaflet-tooltip-top:before {
          border-top-color: #090B12 !important;
        }
        .ryyco-compact-store-marker,
        .ryyco-cluster-store-marker,
        .ryyco-live-driver-marker {
          background: transparent !important;
          border: none !important;
        }
      `}</style>

      <header className="p-4 border-b border-gray-800 bg-[#090B12] flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px]">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${live ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400 animate-ping'}`} />
            <h2 className="font-black text-base sm:text-lg tracking-tight text-white">
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
                ? 'bg-[#E63946]/20 border-[#E63946]/60 text-white'
                : 'bg-gray-900 border-gray-800 text-gray-400 hover:border-[#E63946]/50 hover:text-white'
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
                ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300'
                : 'bg-gray-900 border-gray-800 text-gray-400'
            }`}
          >
            <span>🍽️</span>
            <span>Restaurantes abiertos ({openStores.length})</span>
          </button>

          {followedDriverId && (
            <button
              onClick={() => setFollowedDriverId(null)}
              className="rounded-xl px-3 py-2 bg-[#F4B400]/20 border border-[#F4B400]/50 text-[#F4B400] text-xs font-bold hover:bg-[#F4B400]/30 transition cursor-pointer"
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
        {/* Map Viewport Wrapper with Google Maps Mode Selector, Legend & Single Active Floating Restaurant Card */}
        <div className="flex-1 min-h-0 relative z-0">
          <div
            ref={container}
            className="w-full h-full"
            style={{ touchAction: 'none' }}
          />

          {/* Google Maps Layer Selector (Mapa / Satélite) */}
          <div className="absolute top-3 left-14 z-[500] inline-flex items-center rounded-xl bg-[#090B12]/90 border border-gray-800/90 p-1 shadow-lg">
            <button
              type="button"
              onClick={() => setMapType('roadmap')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                mapType === 'roadmap'
                  ? 'bg-white text-[#090B12] shadow-sm'
                  : 'text-gray-300 hover:text-white'
              }`}
            >
              Mapa
            </button>
            <button
              type="button"
              onClick={() => setMapType('hybrid')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                mapType === 'hybrid'
                  ? 'bg-white text-[#090B12] shadow-sm'
                  : 'text-gray-300 hover:text-white'
              }`}
            >
              Satélite
            </button>
          </div>

          {/* Compact Visual Legend (Top-Right over Map) */}
          <div className="pointer-events-none absolute top-3 right-3 z-[500] hidden sm:flex items-center gap-3 px-3 py-1.5 rounded-xl bg-[#090B12]/90 border border-gray-800/90 shadow-lg text-[11px] font-bold text-white">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#10B981]" />
              <span>Abierto</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#E63946]" />
              <span>Cerrado</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#F4B400]" />
              <span>Atención / Expirado</span>
            </span>
          </div>

          {/* Single Interactive Floating Restaurant Card */}
          {selectedLocatedStore && (() => {
            const { store, lat, lng, hasExactGps, addressLabel, isClosed, needsAttention } = selectedLocatedStore;
            const storeName = (store.displayName || store.storeName || store.username || 'Restaurante').trim();
            const statusColor = !isClosed ? RYYCO_GREEN : needsAttention ? RYYCO_YELLOW : RYYCO_RED;
            const statusText = !isClosed
              ? 'Abierto ahora'
              : needsAttention
                ? 'Requiere atención · Expirado'
                : 'Cerrado · Activo';
            const phone = (store.whatsapp || store.customerServiceWhatsapp || store.ownerWhatsapp || store.phone || '').trim();
            const scheduleText = store.openTime && store.closeTime ? `${store.openTime} - ${store.closeTime}` : null;
            const categoryText = (store.category || store.restaurantCuisine || '').trim();
            const referenceText = (store.restaurantReference || '').trim();
            const googleMapsHref = hasExactGps && lat !== null && lng !== null
              ? `https://www.google.com/maps?q=${lat},${lng}`
              : (store.mapUrl || '').trim() || null;

            return (
              <div
                role="region"
                aria-label={`Información de ${storeName}`}
                className="pointer-events-auto absolute bottom-3 left-3 right-3 sm:right-auto sm:w-[370px] z-[800] rounded-2xl p-4 shadow-2xl border transition-all"
                style={{
                  backgroundColor: RYYCO_DARK_BG,
                  borderColor: statusColor,
                }}
              >
                <div className="flex items-start gap-3">
                  {/* Original Restaurant Logo */}
                  <div
                    className="w-12 h-12 rounded-full shrink-0 overflow-hidden flex items-center justify-center bg-gray-900 text-white font-black text-base"
                    style={{ border: `2.5px solid ${statusColor}` }}
                  >
                    {store.photoURL ? (
                      <img
                        src={store.photoURL}
                        alt={storeName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span>{storeName.charAt(0).toUpperCase()}</span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-extrabold text-sm sm:text-base text-white truncate">
                        {storeName}
                      </h3>
                      <button
                        type="button"
                        onClick={() => setSelectedStoreId(null)}
                        aria-label="Cerrar tarjeta del restaurante"
                        className="w-6 h-6 rounded-lg bg-gray-800/90 hover:bg-gray-700 text-gray-300 hover:text-white flex items-center justify-center text-xs font-bold cursor-pointer shrink-0"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <span
                        className="inline-flex items-center gap-1.5 font-extrabold"
                        style={{ color: statusColor }}
                      >
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: statusColor }}
                        />
                        <span>{statusText}</span>
                      </span>
                      {scheduleText && (
                        <span className="text-gray-300 text-[11px]">
                          · 🕒 {scheduleText}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-gray-800/90 space-y-1.5 text-xs text-gray-200">
                  <div className="flex items-start gap-1.5">
                    <span className="shrink-0">📍</span>
                    <span className="leading-snug">
                      {addressLabel}
                      {referenceText ? ` (${referenceText})` : ''}
                    </span>
                  </div>

                  {!hasExactGps && (
                    <div
                      className="flex items-center gap-1.5 text-[11px] font-bold"
                      style={{ color: RYYCO_YELLOW }}
                    >
                      <span>⚠️</span>
                      <span>Ubicación GPS exacta pendiente de configurar</span>
                    </div>
                  )}

                  {(categoryText || phone || store.restaurantDeliveryTime) && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-300 pt-0.5">
                      {categoryText && <span>🍽️ {categoryText}</span>}
                      {store.restaurantDeliveryTime && <span>⏱️ {store.restaurantDeliveryTime}</span>}
                      {phone && <span>📞 {phone}</span>}
                    </div>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {hasExactGps && lat !== null && lng !== null && (
                    <button
                      type="button"
                      onClick={() => focusStoreOnMap(selectedLocatedStore, 18)}
                      className="flex-1 min-w-[120px] py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold transition cursor-pointer text-center"
                    >
                      Acercar ubicación GPS
                    </button>
                  )}

                  {googleMapsHref && (
                    <a
                      href={googleMapsHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="py-2 px-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-white text-xs font-bold transition text-center border border-gray-700"
                    >
                      Google Maps ↗
                    </a>
                  )}
                </div>
              </div>
            );
          })()}
        </div>

        <aside className="md:w-80 max-h-[38dvh] md:max-h-none overflow-y-auto p-4 space-y-3 bg-[#090B12] border-t md:border-t-0 md:border-l border-gray-800">
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
                  ? 'bg-emerald-600 text-white shadow'
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
                  ? 'bg-[#E63946] text-white shadow'
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
                <span className="text-xs font-extrabold uppercase tracking-wider text-[#E63946]">
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

              {/* Sub-filter buttons for Closed Active vs Expired */}
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
                      ? 'bg-[#E63946]/25 text-white border border-[#E63946]/60'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  🔒 Activos ({closedActiveStores.length})
                </button>
                <button
                  type="button"
                  onClick={() => setClosedSubFilter('expired')}
                  className={`py-1 px-1.5 rounded-md text-[10px] font-bold transition cursor-pointer truncate ${
                    closedSubFilter === 'expired'
                      ? 'bg-[#F4B400]/25 text-[#F4B400] border border-[#F4B400]/60'
                      : 'text-gray-400 hover:text-[#F4B400]'
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
                  {filteredClosedStores.map(item => {
                    const { store, hasExactGps, addressLabel, isExpired } = item;
                    const isSelected = selectedStoreId === store.uid;
                    const storeName = (store.displayName || store.storeName || store.username || 'Restaurante').trim();
                    return (
                      <button
                        key={store.uid}
                        type="button"
                        className={`block text-left w-full rounded-xl p-2.5 border transition cursor-pointer ${
                          isSelected
                            ? isExpired
                              ? 'bg-[#F4B400]/15 border-[#F4B400] shadow-lg'
                              : 'bg-[#E63946]/15 border-[#E63946] shadow-lg'
                            : isExpired
                              ? 'bg-gray-900/80 hover:bg-gray-800/90 border-[#F4B400]/30'
                              : 'bg-gray-900/80 hover:bg-gray-800/90 border-[#E63946]/30'
                        }`}
                        onClick={() => focusStoreOnMap(item, 17)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-sm text-white truncate flex items-center gap-2">
                            {store.photoURL ? (
                              <img
                                src={store.photoURL}
                                alt={storeName}
                                className="w-6 h-6 rounded-full object-cover shrink-0 border border-gray-700"
                              />
                            ) : (
                              <span>{isExpired ? '⏳' : '🔒'}</span>
                            )}
                            <span className="truncate">{storeName}</span>
                          </span>
                          <span
                            className="text-[10px] font-extrabold shrink-0"
                            style={{ color: isExpired ? RYYCO_YELLOW : RYYCO_RED }}
                          >
                            {isExpired ? 'Expirado' : 'Cerrado'}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-gray-400">
                          <span className="truncate">📍 {addressLabel}</span>
                          {hasExactGps ? (
                            <span
                              className="text-[10px] font-bold shrink-0 underline"
                              style={{ color: isExpired ? RYYCO_YELLOW : RYYCO_RED }}
                            >
                              Ver GPS
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold shrink-0" style={{ color: RYYCO_YELLOW }}>
                              ⚠️ Ubicación pendiente
                            </span>
                          )}
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
                <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-400">
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
                  {openStores.map(item => {
                    const { store, hasExactGps, addressLabel } = item;
                    const isSelected = selectedStoreId === store.uid;
                    const storeName = (store.displayName || store.storeName || store.username || 'Restaurante').trim();
                    return (
                      <button
                        key={store.uid}
                        type="button"
                        className={`block text-left w-full rounded-xl p-2.5 border transition cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-950/60 border-emerald-500 shadow-lg'
                            : 'bg-gray-900/80 hover:bg-gray-800/90 border-emerald-500/25'
                        }`}
                        onClick={() => focusStoreOnMap(item, 17)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-sm text-white truncate flex items-center gap-2">
                            {store.photoURL ? (
                              <img
                                src={store.photoURL}
                                alt={storeName}
                                className="w-6 h-6 rounded-full object-cover shrink-0 border border-emerald-500/50"
                              />
                            ) : (
                              <span>🍽️</span>
                            )}
                            <span className="truncate">{storeName}</span>
                          </span>
                          <span className="text-[10px] font-extrabold text-emerald-400 shrink-0">
                            Abierto
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-gray-400">
                          <span className="truncate">📍 {addressLabel}</span>
                          {hasExactGps ? (
                            <span className="text-[10px] font-bold text-emerald-300 shrink-0 underline">
                              Ver GPS
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold shrink-0" style={{ color: RYYCO_YELLOW }}>
                              ⚠️ Ubicación pendiente
                            </span>
                          )}
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
                      <div className="mt-1.5 px-2 py-1 rounded-lg bg-[#F4B400]/15 border border-[#F4B400]/40 text-[11px] text-[#F4B400] font-bold truncate">
                        📦 En pedido #{p.orderNumber} {p.storeName ? `· ${p.storeName}` : ''}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <p className="text-[11px] text-gray-400 pt-2 leading-relaxed">
            Los restaurantes cercanos se agrupan automáticamente según el nivel de zoom. Pasa el cursor o toca un marcador para ver su nombre, o selecciónalo para ver su tarjeta detallada.
          </p>
        </aside>
      </div>
    </div>,
    document.body
  );
}

export interface GpsPoint {
  lat: number;
  lng: number;
  timestamp: number;
  accuracy: number;
  heading?: number;
  speed?: number; // km/h
}

export const GPS_FRESH_MS = 45_000;
export const GPS_HEARTBEAT_MS = 30_000;

export function validCoordinates(lat: unknown, lng: unknown): boolean {
  return typeof lat === 'number' && Number.isFinite(lat) && Math.abs(lat) <= 90 &&
    typeof lng === 'number' && Number.isFinite(lng) && Math.abs(lng) <= 180;
}

export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lng - a.lng) * rad / 2) ** 2;
  return 12_742_000 * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function bearing(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = Math.PI / 180, d = (b.lng - a.lng) * r;
  return (Math.atan2(Math.sin(d) * Math.cos(b.lat * r),
    Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos(d)) / r + 360) % 360;
}

export function acceptGpsPosition(position: GeolocationPosition, previous: GpsPoint | null, now = Date.now()): GpsPoint | null {
  const { latitude: lat, longitude: lng, accuracy, speed, heading } = position.coords;
  const timestamp = position.timestamp;
  if (!validCoordinates(lat, lng) || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 60 ||
      !Number.isFinite(timestamp) || now - timestamp > 15_000 || timestamp - now > 5_000 ||
      (previous && timestamp <= previous.timestamp)) return null;
  const point: GpsPoint = { lat, lng, accuracy, timestamp };
  const moved = previous ? distanceMeters(previous, point) : 0;
  // Allow measurement uncertainty, but reject travel beyond 150 km/h plus GPS error.
  if (previous && moved > 42 * ((timestamp - previous.timestamp) / 1000) + previous.accuracy + accuracy) return null;
  if (typeof speed === 'number' && Number.isFinite(speed) && speed >= 0 && speed <= 42) point.speed = speed * 3.6;
  point.heading = previous?.heading;
  if (!previous || moved >= Math.max(5, accuracy / 2)) {
    point.heading = typeof heading === 'number' && Number.isFinite(heading) && heading >= 0 && heading < 360
      ? heading : previous && moved >= 5 ? bearing(previous, point) : undefined;
  }
  return point;
}

export function shouldSendGps(point: GpsPoint, previous: GpsPoint | null, elapsed: number): boolean {
  if (!previous) return true;
  if (elapsed < 3_000) return false;
  const threshold = Math.max(7, Math.min(20, (point.accuracy + previous.accuracy) / 4));
  return distanceMeters(previous, point) >= threshold || elapsed >= GPS_HEARTBEAT_MS;
}

/** Only interpolate between received fixes. Never extrapolate beyond the target. */
export function animateGps(from: GpsPoint | null, to: GpsPoint, frame: (point: GpsPoint) => void): () => void {
  let id = 0;
  if (!from || to.timestamp - from.timestamp > GPS_FRESH_MS || distanceMeters(from, to) > 1_000 ||
      distanceMeters(from, to) < 1 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    frame(to);
    return () => {};
  }
  const duration = Math.max(200, Math.min(2_500, (to.timestamp - from.timestamp) * 0.8));
  const start = performance.now();
  const headingDelta = ((to.heading ?? from.heading ?? 0) - (from.heading ?? 0) + 540) % 360 - 180;
  const tick = (now: number) => {
    const t = Math.min(1, Math.max(0, (now - start) / duration));
    frame({ ...to, lat: from.lat + (to.lat - from.lat) * t,
      lng: from.lng + (to.lng - from.lng) * t, heading: (from.heading ?? 0) + headingDelta * t });
    if (t < 1) id = requestAnimationFrame(tick);
  };
  id = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(id);
}

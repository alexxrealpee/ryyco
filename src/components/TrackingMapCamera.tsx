import { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';

export function GoogleMapCameraController({
  points, driver, padding, centerModeTrigger, identity
}: {
  identity?: string;
  points: { lat: number; lng: number }[];
  driver: { lat: number; lng: number } | null;
  padding: { top: number; bottom: number; left: number; right: number };
  centerModeTrigger: { mode: 'all' | 'driver'; id: number };
}) {
  const map = useMap();
  // Telemetry moves markers without resetting the customer's chosen zoom.
  const latest = useRef({ points, driver });
  latest.current = { points, driver };
  const hasDriver = !!driver;
  useEffect(() => {
    if (!map) return;
    const { points, driver } = latest.current;
    if (centerModeTrigger.mode === 'driver' && driver) {
      map.setZoom(16);
      map.setCenter(driver);
      map.panBy((padding.right - padding.left) / 2, (padding.bottom - padding.top) / 2);
    } else if (points.length === 1) {
      map.setZoom(16);
      map.setCenter(points[0]);
      map.panBy((padding.right - padding.left) / 2, (padding.bottom - padding.top) / 2);
    } else if (points.length) {
      const bounds = new google.maps.LatLngBounds();
      points.forEach(point => bounds.extend(point));
      map.fitBounds(bounds, padding);
    }
  }, [map, identity, centerModeTrigger.id, centerModeTrigger.mode, padding, hasDriver, points.length]);
  return null;
}


import React, { useRef } from 'react';
import { AdvancedMarker, useAdvancedMarkerRef } from '@vis.gl/react-google-maps';
import { useCourierAnimation } from '../hooks/useCourierAnimation';
import type { GpsPoint } from '../lib/deliveryTracking';

/** Update the Google marker imperatively; do not re-render the entire modal every frame. */
export function AnimatedCourierMarker({ point, enabled, identity, children, ...props }: {
  point: GpsPoint; enabled: boolean; identity?: string; children: React.ReactNode; title?: string; zIndex?: number;
}) {
  const [ref, marker] = useAdvancedMarkerRef();
  const content = useRef<HTMLDivElement>(null);
  useCourierAnimation(point, enabled, identity, value => {
    if (marker) marker.position = { lat: value.lat, lng: value.lng };
    const heading = content.current?.querySelector<HTMLElement>('[data-courier-heading]');
    if (heading) heading.style.transform = `rotate(${value.heading ?? 0}deg)`;
  }, marker);
  return <AdvancedMarker ref={ref} {...props}><div ref={content}>{children}</div></AdvancedMarker>;
}

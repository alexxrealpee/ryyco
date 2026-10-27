import { useCallback, useEffect, useRef, useState } from 'react';

type Download = { start: () => void; priority: boolean; active: boolean; done: boolean };
const downloads: Download[] = [];
let activeDownloads = 0;
function drainDownloads() {
  downloads.sort((a, b) => Number(b.priority) - Number(a.priority));
  while (activeDownloads < 3 && downloads.length) {
    const download = downloads.shift()!;
    if (download.done) continue;
    download.active = true;
    activeDownloads++;
    download.start();
  }
}

// Keep HTTP/1 connections available for small metadata/availability requests.
export function useImageDownload(src: string | undefined, priority: boolean) {
  const { element, enabled: near } = useNearViewport(priority);
  const [allowed, setAllowed] = useState<string>();
  const finishRef = useRef<{src?: string; release: () => void}>({release: () => {}});
  useEffect(() => {
    if (!near || !src) return;
    if (element.current?.getAttribute('src') === src && element.current.complete && element.current.naturalWidth > 0) {
      setAllowed(src);
      return;
    }
    const download: Download = {start: () => setAllowed(src), priority, active: false, done: false};
    const release = () => {
      if (download.done) return;
      download.done = true;
      if (download.active) activeDownloads--;
      else {
        const index = downloads.indexOf(download);
        if (index >= 0) downloads.splice(index, 1);
      }
      drainDownloads();
    };
    finishRef.current = {src, release};
    downloads.push(download);
    drainDownloads();
    return release;
  }, [near, src, priority]);
  const finish = useCallback(() => {
    if (finishRef.current.src === src) finishRef.current.release();
  }, [src]);
  return {element, enabled: Boolean(src && allowed === src), finish};
}

// Native lazy loading can fetch several screens ahead on mobile. Bound this to
// the nearby viewport so photographs do not compete with catalog metadata.
export function useNearViewport(priority: boolean) {
  const element = useRef<HTMLImageElement | null>(null);
  const [near, setNear] = useState(priority || typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (priority || near) return;
    if (!element.current || typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setNear(true);
        observer.disconnect();
      }
    }, { rootMargin: '200px' });
    observer.observe(element.current);
    return () => observer.disconnect();
  }, [priority, near]);
  return { element, enabled: priority || near };
}

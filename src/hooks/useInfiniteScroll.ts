import { useEffect, useRef } from 'react';

function scrollParent(node: HTMLElement | null): HTMLElement | null {
  let current = node?.parentElement ?? null;
  while (current && current !== document.body) {
    const { overflowY } = getComputedStyle(current);
    if ((overflowY === 'auto' || overflowY === 'scroll') && current.scrollHeight > current.clientHeight) return current;
    current = current.parentElement;
  }
  return null; // la ventana
}

/**
 * Llama a onLoadMore cuando el elemento centinela queda a ~250 px del final visible.
 * Usa IntersectionObserver con el contenedor que realmente hace scroll (o la ventana).
 * Si tras una carga el centinela sigue visible (pocos clientes para llenar la
 * pantalla), vuelve a pedir; se detiene en cuanto la lista supera la pantalla.
 */
export function useInfiniteScroll<T extends HTMLElement>({
  enabled, busy, itemCount, onLoadMore, margin = 250,
}: { enabled: boolean; busy: boolean; itemCount: number; onLoadMore: () => void; margin?: number }) {
  const sentinelRef = useRef<T | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const callback = useRef(onLoadMore);
  callback.current = onLoadMore;

  useEffect(() => {
    const node = sentinelRef.current;
    if (!enabled || !node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) callback.current();
    }, { root: scrollParent(node), rootMargin: `0px 0px ${margin}px 0px` });
    observer.observe(node);
    observerRef.current = observer;
    return () => { observer.disconnect(); observerRef.current = null; };
  }, [enabled, margin]);

  // Relleno controlado: tras cada carga se vuelve a observar el centinela; el navegador
  // informa su posición real y solo se pide otra página si sigue cerca de la pantalla.
  useEffect(() => {
    const node = sentinelRef.current;
    const observer = observerRef.current;
    if (!enabled || busy || !node || !observer) return;
    observer.unobserve(node);
    observer.observe(node);
  }, [enabled, busy, itemCount]);

  return sentinelRef;
}

import { useLayoutEffect, useRef } from 'react';

/** The chat owns its viewport; only its message stream may scroll. */
export function useOrderChatViewport(isOpen: boolean, conversationId: string, messages: unknown[]) {
  const shellRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<HTMLDivElement>(null);
  const position = useRef({ top: 0, pinned: true, height: 0 });

  const restore = () => {
    const stream = streamRef.current;
    if (!stream) return;
    stream.scrollTop = position.current.pinned ? stream.scrollHeight : position.current.top;
    position.current.top = stream.scrollTop;
    position.current.height = stream.clientHeight;
  };

  useLayoutEffect(() => {
    if (!isOpen) return;
    position.current = { top: 0, pinned: true, height: 0 };
    const shell = shellRef.current!;
    const stream = streamRef.current!;
    const viewport = window.visualViewport;
    const mobile = window.matchMedia('(max-width: 1023px), (hover: none) and (pointer: coarse)');
    let frame = 0;
    const resize = () => {
      // Do not counteract manual pinch zoom.
      if (mobile.matches && viewport && Math.abs(viewport.scale - 1) < 0.02) {
        shell.style.top = `${viewport.offsetTop}px`;
        shell.style.bottom = 'auto';
        shell.style.height = `${viewport.height}px`;
      } else {
        shell.style.removeProperty('top');
        shell.style.removeProperty('bottom');
        shell.style.removeProperty('height');
      }
      restore();
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; resize(); });
    };
    const onScroll = () => {
      // A viewport resize can dispatch scroll before ResizeObserver runs.
      if (stream.clientHeight !== position.current.height) { restore(); return; }
      position.current = {
        top: stream.scrollTop,
        pinned: stream.scrollHeight - stream.clientHeight - stream.scrollTop <= 32,
        height: stream.clientHeight,
      };
    };
    const observer = new ResizeObserver(restore);
    observer.observe(stream);
    stream.addEventListener('scroll', onScroll, { passive: true });
    viewport?.addEventListener('resize', schedule);
    viewport?.addEventListener('scroll', schedule);
    window.addEventListener('resize', schedule);
    mobile.addEventListener('change', schedule);
    resize();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      stream.removeEventListener('scroll', onScroll);
      viewport?.removeEventListener('resize', schedule);
      viewport?.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      mobile.removeEventListener('change', schedule);
    };
  }, [isOpen, conversationId]);

  useLayoutEffect(() => { if (isOpen) restore(); }, [isOpen, messages]);
  return { shellRef, streamRef };
}

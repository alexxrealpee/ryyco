import { memo, useCallback, useState } from 'react';
import { ShoppingBag } from 'lucide-react';
import { useImageDownload } from '../hooks/useNearViewport';

// Only the photograph waits for its download. The card's content stays mounted.
export default memo(function ProductCardImage({ src, name, priority = false }: {
  src: string;
  name: string;
  priority?: boolean;
}) {
  const [result, setResult] = useState({ src, status: 'loading' });
  const { element, enabled, finish } = useImageDownload(src, priority);
  const status = result.src === src ? result.status : 'loading';
  const imageRef = useCallback((image: HTMLImageElement | null) => {
    element.current = image;
    // A cached image may complete before React attaches the load handler.
    if (enabled && image?.complete && image.currentSrc) { setResult({ src, status: image.naturalWidth > 0 ? 'loaded' : 'error' }); finish(); }
  }, [src, enabled]);

  return <>
    {status !== 'loaded' && <div aria-hidden="true" className="absolute inset-0 flex flex-col items-center justify-center text-gray-600 gap-1.5">
      <ShoppingBag className="w-8 h-8 opacity-45 text-orange-400" />
      {status === 'error' && <span className="text-[10px] font-mono opacity-40">Sin Imagen</span>}
    </div>}
    <img ref={imageRef} src={enabled ? src : undefined} alt={name} referrerPolicy="no-referrer"
      loading={priority ? 'eager' : 'lazy'} fetchPriority={priority ? 'high' : 'auto'}
      decoding="async" width="300" height="300" data-image-state={status}
      onLoad={() => { setResult({ src, status: 'loaded' }); finish(); }}
      onError={() => { setResult({ src, status: 'error' }); finish(); }}
      className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-200 ${status === 'loaded' ? 'opacity-100' : 'opacity-0'}`} />
  </>;
});

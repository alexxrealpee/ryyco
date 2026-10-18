import { memo, useCallback, useState } from 'react';

// Image state belongs to this circle, never to the restaurant list or counter.
export default memo(function RestaurantLogo({ src, name, priority = false }: {
  src?: string;
  name: string;
  priority?: boolean;
}) {
  const [result, setResult] = useState({ src, status: 'loading' });
  const status = result.src === src ? result.status : 'loading';
  const imageRef = useCallback((image: HTMLImageElement | null) => {
    if (image?.complete) setResult({ src, status: image.naturalWidth > 0 ? 'loaded' : 'error' });
  }, [src]);

  return <div className="relative w-full h-full rounded-full overflow-hidden pointer-events-none select-none">
    <div aria-hidden="true" className="absolute inset-0 rounded-full bg-[#D62839]/20 text-[#D62839] flex items-center justify-center font-black text-xs sm:text-sm uppercase">
      {(name || 'T').substring(0, 2)}
    </div>
    {src && <img ref={imageRef} src={src} alt={name} draggable={false}
      loading={priority ? 'eager' : 'lazy'} fetchPriority={priority ? 'high' : 'auto'}
      decoding="async" width="64" height="64" data-logo-state={status}
      onLoad={() => setResult({ src, status: 'loaded' })}
      onError={() => setResult({ src, status: 'error' })}
      className={`absolute inset-0 w-full h-full rounded-full object-cover bg-slate-950 pointer-events-none select-none transition-opacity duration-200 ${status === 'loaded' ? 'opacity-100' : 'opacity-0'}`} />}
  </div>;
});

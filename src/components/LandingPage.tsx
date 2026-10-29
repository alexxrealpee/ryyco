import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';

const StoreTermsModal = lazy(() => import('./StoreTermsModal'));
const BuyerTermsModal = lazy(() => import('./BuyerTermsModal'));
const LandingLetter = lazy(() => import('./LandingLetter'));

interface LandingPageProps {
  onNavigate: (view: 'landing' | 'login' | 'signup' | 'dashboard' | 'admin' | 'tienda' | 'driver-register' | 'driver-portal' | 'profile', usernameToClaim?: string) => void;
}

export default function LandingPage({ onNavigate }: LandingPageProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [dialog, setDialog] = useState<'buyer-terms' | 'seller-terms' | 'letter' | null>(null);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow ||
          event.data?.type !== 'ryyco-landing-action') return;
      const { action, username } = event.data;
      if (action === 'buyer-terms' || action === 'seller-terms' || action === 'letter') {
        setDialog(action);
      } else if (['tienda', 'signup', 'login', 'driver-portal', 'driver-register', 'profile'].includes(action)) {
        const slug = typeof username === 'string' ? username.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0,60) : undefined;
        onNavigate(action, slug);
      }
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [onNavigate]);
  const close = () => { setDialog(null); frame.current?.focus(); };
  return (
    <>
      <iframe ref={frame} src="/landing-presentation/index.html"
        title="RYYCO: descubre qué quieren comer tus clientes"
        allow="fullscreen" allowFullScreen
        className="block w-full border-0 bg-[#070b13] print:hidden"
        style={{ height: '100dvh' }} />
      <Suspense fallback={<div role="status" className="fixed inset-0 z-50 grid place-items-center bg-black/80 text-white">Abriendo información…</div>}>
        {dialog === 'seller-terms' && <StoreTermsModal isOpen onClose={close} showAcceptButton={false} />}
        {dialog === 'buyer-terms' && <BuyerTermsModal isOpen onClose={close} showAcceptButton={false} />}
        {dialog === 'letter' && <LandingLetter onClose={close} />}
      </Suspense>
    </>
  );
}

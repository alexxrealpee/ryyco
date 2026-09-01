/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, fetchProfileByUid, captureUrlReferralCode, getActiveReferralCode, checkIsAdminEmail, fetchSystemSettings } from './lib/firebase';
import { UserProfile } from './types';

// Importing Custom Component views
import LandingPage from './components/LandingPage';
import AuthPage from './components/AuthPage';
import Dashboard from './components/Dashboard';
import PublicProfile from './components/PublicProfile';
import AdminPanel from './components/AdminPanel';
import TiendaGeneral from './components/TiendaGeneral';
import DriverRegister from './components/DriverRegister';
import DriverPortal from './components/DriverPortal';
import CarruselProduc from './components/CarruselProduc';
import PwaLoadingScreen from './components/PwaLoadingScreen';
import LinnkProVoiceAssistant from './components/LinnkProVoiceAssistant';
import { DriverProfile } from './types';

// Helper function defined outside or hoisted for initial state computation
const detectInitialRouteFromUrl = (): { 
  view: 'landing' | 'login' | 'signup' | 'dashboard' | 'profile' | 'admin' | 'tienda' | 'driver-register' | 'driver-portal' | 'carruselproduc'; 
  username: string | null;
  reelId: string | null;
} => {
  let search = window.location.search;
  let pathname = window.location.pathname;

  // Handle SPA 404 redirect fallback parameter format (e.g. Hostinger 404 redirect /?/pollostop)
  if (search.startsWith('?/')) {
    const redirected = search.substring(2).split('&')[0];
    if (redirected) {
      pathname = '/' + redirected;
      try {
        const cleanSearch = search.includes('&') ? '?' + search.split('&').slice(1).join('&') : '';
        window.history.replaceState(null, '', pathname + cleanSearch + window.location.hash);
      } catch (e) {}
    }
  }

  const searchParams = new URLSearchParams(window.location.search);
  const queryUser = searchParams.get('u') || searchParams.get('store') || searchParams.get('user');

  let pathUser = '';
  try {
    pathUser = decodeURIComponent(pathname.substring(1).trim());
  } catch (e) {
    pathUser = pathname.substring(1).trim();
  }

  while (pathUser.startsWith('/')) pathUser = pathUser.substring(1);
  while (pathUser.endsWith('/')) pathUser = pathUser.substring(0, pathUser.length - 1);
  if (pathUser.startsWith('@')) pathUser = pathUser.substring(1);
  if (pathUser.toLowerCase() === 'index.html') pathUser = '';

  let hashUser = '';
  try {
    hashUser = decodeURIComponent(window.location.hash.substring(1).trim());
  } catch (e) {
    hashUser = window.location.hash.substring(1).trim();
  }

  while (hashUser.startsWith('/')) hashUser = hashUser.substring(1);
  while (hashUser.endsWith('/')) hashUser = hashUser.substring(0, hashUser.length - 1);
  if (hashUser.startsWith('@')) hashUser = hashUser.substring(1);

  const systemRoutes = ['login', 'signup', 'dashboard', 'admin', 'landing', 'vender', 'crear-tienda', 'tienda', 'tiendas', 'catalogo', 'domiciliario', 'driver-register', 'driver-portal', 'domiciliarios', 'carruselproduc', 'carrusel-productos', 'reels', 'reel', 'historias', 'historia', 'api', 'assets'];

  const pathLower = pathUser.toLowerCase();
  const hashLower = hashUser.toLowerCase();
  const searchTab = searchParams.get('tab')?.toLowerCase();

  // 1. Explicit admin routes (e.g. /admin, /admin?tab=general, #/admin, #admin)
  if (
    pathLower === 'admin' || 
    pathLower.startsWith('admin/') || 
    hashLower === 'admin' || 
    hashLower.startsWith('admin/') || 
    searchParams.has('admin') ||
    (searchTab && ['users', 'payments', 'subscriptions', 'orders', 'drivers', 'referrals', 'general'].includes(searchTab))
  ) {
    return { view: 'admin', username: null, reelId: null };
  }

  // 2. Dashboard and Authentication routes
  if (['dashboard'].includes(pathLower) || ['dashboard'].includes(hashLower)) {
    return { view: 'dashboard', username: null, reelId: null };
  }
  if (['login', 'ingresar'].includes(pathLower) || ['login', 'ingresar'].includes(hashLower)) {
    return { view: 'login', username: null, reelId: null };
  }
  if (['signup', 'registro'].includes(pathLower) || ['signup', 'registro'].includes(hashLower)) {
    return { view: 'signup', username: null, reelId: null };
  }

  // 3. Reels / Stories / Carrusel de productos route with direct reel ID detection
  const isReelsRoute = 
    ['carruselproduc', 'carrusel-productos', 'reels', 'reel', 'historias', 'historia'].includes(pathLower) ||
    pathLower.startsWith('reels/') ||
    pathLower.startsWith('reel/') ||
    pathLower.startsWith('carruselproduc/') ||
    pathLower.startsWith('historias/') ||
    ['carruselproduc', 'carrusel-productos', 'reels', 'reel', 'historias', 'historia'].includes(hashLower) ||
    hashLower.startsWith('reels/') ||
    hashLower.startsWith('reel/') ||
    hashLower.startsWith('carruselproduc/') ||
    hashLower.startsWith('historias/') ||
    searchParams.has('reel') ||
    searchParams.has('reels') ||
    searchParams.has('story');

  if (isReelsRoute) {
    let extractedReelId: string | null = searchParams.get('id') || searchParams.get('reel') || searchParams.get('p') || searchParams.get('story') || null;
    if (!extractedReelId) {
      if (pathUser.includes('/')) {
        const parts = pathUser.split('/');
        if (parts.length > 1 && parts[1]) extractedReelId = parts[1];
      } else if (hashUser.includes('/')) {
        const parts = hashUser.split('/');
        if (parts.length > 1 && parts[1]) extractedReelId = parts[1];
      }
    }
    return { view: 'carruselproduc', username: null, reelId: extractedReelId };
  }

  // 4. Other system views
  if (['landing', 'vender', 'crear-tienda'].includes(pathLower) || ['landing', 'vender', 'crear-tienda'].includes(hashLower)) {
    return { view: 'landing', username: null, reelId: null };
  }
  if (['domiciliario', 'domiciliarios', 'driver-portal'].includes(pathLower) || ['domiciliario', 'domiciliarios', 'driver-portal'].includes(hashLower)) {
    return { view: 'driver-portal', username: null, reelId: null };
  }
  if (['driver-register'].includes(pathLower) || ['driver-register'].includes(hashLower)) {
    return { view: 'driver-register', username: null, reelId: null };
  }
  if (['tienda', 'tiendas', 'catalogo', ''].includes(pathLower) || ['tienda', 'tiendas', 'catalogo'].includes(hashLower)) {
    return { view: 'tienda', username: null, reelId: null };
  }

  const cleanedPath = pathUser && !systemRoutes.includes(pathLower) ? pathUser : null;
  const cleanedHash = hashUser && !systemRoutes.includes(hashLower) ? hashUser : null;
  const username = queryUser || cleanedPath || cleanedHash || null;

  if (username) {
    return { view: 'profile', username, reelId: null };
  }

  return { view: 'tienda', username: null, reelId: null };
};

export default function App() {
  // Routing initial states computed synchronously to prevent flash on refresh
  const initialRoute = detectInitialRouteFromUrl();
  const [view, setView] = useState<'landing' | 'login' | 'signup' | 'dashboard' | 'profile' | 'admin' | 'tienda' | 'driver-register' | 'driver-portal' | 'carruselproduc'>(initialRoute.view);
  const [targetUsername, setTargetUsername] = useState<string | null>(initialRoute.username);
  const [targetReelId, setTargetReelId] = useState<string | null>(initialRoute.reelId);
  const [activeDriverSession, setActiveDriverSession] = useState<DriverProfile | null>(null);
  
  // Auth state
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [initLoading, setInitLoading] = useState(true);

  // Buffer state to pass claimed username from landing to sign up
  const [claimedUsername, setClaimedUsername] = useState('');

  // 1. Unified function to detect target public profile username from URL
  const getUsernameFromUrl = (): string | null => {
    return detectInitialRouteFromUrl().username;
  };

  // 2. React to URL Changes dynamically
  useEffect(() => {
    const handleUrlRouteCheck = () => {
      const route = detectInitialRouteFromUrl();
      setView(route.view);
      setTargetUsername(route.username);
      setTargetReelId(route.reelId);
    };

    // Run on mount
    handleUrlRouteCheck();

    // Capture referral from URL if present (?ref=..., ?referral=..., ?c=...)
    captureUrlReferralCode();

    // Listen to back/forward and hash changes
    window.addEventListener('popstate', handleUrlRouteCheck);
    window.addEventListener('hashchange', handleUrlRouteCheck);
    
    return () => {
      window.removeEventListener('popstate', handleUrlRouteCheck);
      window.removeEventListener('hashchange', handleUrlRouteCheck);
    };
  }, []);

  // Update browser document tab title dynamically
  useEffect(() => {
    switch (view) {
      case 'tienda':
        document.title = 'Ryyco | Pide comida, descubre restaurantes y recibe recomendaciones';
        break;
      case 'landing':
        document.title = 'Ryyco | Descubre qué quieres comer hoy';
        break;
      case 'carruselproduc':
        document.title = 'Stories & Platos | Ryyco';
        break;
      case 'profile':
        document.title = targetUsername ? `${targetUsername} | Ryyco` : 'Restaurante | Ryyco';
        break;
      case 'login':
        document.title = 'Iniciar Sesión | Ryyco';
        break;
      case 'signup':
        document.title = 'Crear Tienda | Ryyco';
        break;
      case 'driver-portal':
      case 'driver-register':
        document.title = 'Portal Domiciliarios | Ryyco';
        break;
      case 'dashboard':
        document.title = 'Panel de Control | Ryyco';
        break;
      case 'admin':
        document.title = 'Administración | Ryyco';
        break;
      default:
        document.title = 'Ryyco | Pide comida, descubre restaurantes y recibe recomendaciones';
    }
  }, [view, targetUsername]);

  // 3. Keep Auth listener continuously running so session is never lost or orphaned
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Distinguish active authentication mode: 'seller' (vendor dashboard) vs 'customer' (buyer on store)
        const authMode = localStorage.getItem('ryyco_auth_mode');

        if (authMode === 'customer') {
          // User is authenticated as a customer/buyer. Do not hijack view or set seller userProfile.
          setUserProfile(null);
        } else {
          // Seller mode (default for merchant login / admin)
          localStorage.setItem('ryyco_auth_mode', 'seller');
          fetchSystemSettings().catch(() => {});
          let profile = await fetchProfileByUid(user.uid);
          
          if (!profile) {
            // Check if there is pending profile in session or fallback registry
            try {
              const pendingStr = sessionStorage.getItem('ryyco_pending_signup_profile');
              if (pendingStr) {
                const parsed = JSON.parse(pendingStr);
                if (parsed) {
                  profile = { uid: user.uid, ...parsed };
                }
              }
            } catch (e) {}
          }

          if (profile) {
            const isAdmin = Boolean(profile.role === 'admin' || checkIsAdminEmail(profile.email) || checkIsAdminEmail(user.email));
            if (isAdmin && profile.role !== 'admin') {
              profile = { ...profile, role: 'admin' };
            }
            setUserProfile(profile);
            
            // Only force redirect to dashboard if user is not looking at a public profile, public routing or during active store creation
            const activeUserProfileUrl = getUsernameFromUrl();
            const pathUser = window.location.pathname.substring(1).trim().toLowerCase();
            const hashVal = window.location.hash.toLowerCase();
            const isPublicRoute = ['tienda', 'tiendas', 'catalogo', 'landing', 'vender', 'crear-tienda', 'domiciliario', 'domiciliarios', 'driver-register', 'driver-portal', 'carruselproduc', 'reels', 'reel', 'historias'].some(r => pathUser === r || pathUser.startsWith(r + '/')) ||
              ['#tienda', '#/tienda', '#tiendas', '#/tiendas', '#catalogo', '#/catalogo', '#landing', '#/landing', '#domiciliario', '#/domiciliario', '#driver-portal', '#/driver-portal', '#carruselproduc', '#/carruselproduc', '#reels', '#/reels', '#reel', '#/reel'].some(r => hashVal === r || hashVal.startsWith(r + '/'));

            setView(prevView => {
              if (prevView === 'signup') {
                return 'signup'; // Let AuthPage finish celebratory creation and call handleAuthSuccess
              }
              const routeCheck = detectInitialRouteFromUrl();
              if (routeCheck.view === 'admin' || prevView === 'admin') {
                return 'admin';
              }
              if (!activeUserProfileUrl && !isPublicRoute) {
                return profile.suspended ? 'tienda' : 'dashboard';
              }
              return prevView;
            });
          } else {
            // Setup a temporary user profile for seller with 7-day reverse trial
            const trialExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
            const tempProfile: UserProfile = {
              uid: user.uid,
              email: user.email || '',
              username: user.email?.split('@')[0] || `store_${Date.now().toString().substring(5)}`,
              displayName: user?.displayName || 'Mi Tienda Online',
              bio: '¡Bienvenido a nuestra tienda! Aquí encontrarás los mejores productos con envíos rápidos y seguros.',
              role: 'user',
              plan: 'free',
              subscriptionPlan: 'basico',
              subscriptionStatus: 'trial',
              subscriptionTrialExpires: trialExpires,
              currency: '$',
              createdAt: new Date().toISOString()
            };
            setUserProfile(tempProfile);
            
            const activeUserProfileUrl = getUsernameFromUrl();
            const pathUser = window.location.pathname.substring(1).trim().toLowerCase();
            const hashVal = window.location.hash.toLowerCase();
            const isPublicRoute = ['tienda', 'tiendas', 'catalogo', 'landing', 'vender', 'crear-tienda', 'domiciliario', 'domiciliarios', 'driver-register', 'driver-portal', 'carruselproduc', 'reels', 'reel', 'historias'].some(r => pathUser === r || pathUser.startsWith(r + '/')) ||
              ['#tienda', '#/tienda', '#tiendas', '#/tiendas', '#catalogo', '#/catalogo', '#landing', '#/landing', '#domiciliario', '#/domiciliario', '#driver-portal', '#/driver-portal', '#carruselproduc', '#/carruselproduc', '#reels', '#/reels', '#reel', '#/reel'].some(r => hashVal === r || hashVal.startsWith(r + '/'));

            setView(prevView => {
              if (prevView === 'signup') {
                return 'signup';
              }
              const routeCheck = detectInitialRouteFromUrl();
              if (routeCheck.view === 'admin' || prevView === 'admin') {
                return 'admin';
              }
              if (!activeUserProfileUrl && !isPublicRoute) {
                return 'dashboard';
              }
              return prevView;
            });
          }
        }
      } else {
        setUserProfile(null);
        // Return back to tienda general if user was inside protected views
        setView(prev => {
          if (prev === 'dashboard' || prev === 'admin') {
            window.history.pushState({}, document.title, '/tienda');
            return 'tienda';
          }
          return prev;
        });
      }
      setInitLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    try {
      localStorage.removeItem('ryyco_auth_mode');
      await signOut(auth);
      setUserProfile(null);
      window.history.pushState({}, document.title, '/tienda');
      setView('tienda');
    } catch (e) {
      console.error(e);
    }
  };

  const handleNavigateHome = (claimUsername?: string) => {
    // Return to /tienda as the primary landing address
    window.history.pushState({}, document.title, '/tienda');
    setTargetUsername(null);
    if (claimUsername && typeof claimUsername === 'string') {
      setClaimedUsername(claimUsername);
      setView('signup');
    } else {
      setView('tienda');
    }
  };

  const handleAuthSuccess = (profile: UserProfile) => {
    localStorage.setItem('ryyco_auth_mode', 'seller');
    setUserProfile(profile);
    setView('dashboard');
  };

  if (initLoading && (view === 'dashboard' || view === 'admin')) {
    return <PwaLoadingScreen />;
  }

  return (
    <div className="min-h-screen bg-[#090B12] text-gray-100">
      {view === 'landing' && (
        <LandingPage 
          onNavigate={(targetView, customUser) => {
            if (targetView === 'tienda') {
              window.history.pushState({}, '', '/tienda');
              setView('tienda');
            } else if (targetView === 'landing') {
              window.history.pushState({}, '', '/landing');
              setView('landing');
            } else {
              if (customUser) {
                setClaimedUsername(customUser);
              }
              setView(targetView);
            }
          }} 
        />
      )}

      {(view === 'login' || view === 'signup') && (
        <AuthPage 
          initialView={view} 
          usernameClaimed={claimedUsername}
          onNavigate={(targetView) => {
            if (targetView === 'tienda') {
              window.history.pushState({}, '', '/tienda');
              setView('tienda');
            } else if (targetView === 'landing') {
              window.history.pushState({}, '', '/landing');
              setView('landing');
            } else {
              setView(targetView);
            }
          }} 
          onSuccess={handleAuthSuccess}
        />
      )}

      {view === 'dashboard' && userProfile && (
        <Dashboard 
          userProfile={userProfile} 
          onLogout={handleLogout}
          onNavigateAdmin={() => {
            const lastTab = localStorage.getItem('ryyco_admin_active_tab') || 'subscriptions';
            window.history.pushState({}, '', `/admin?tab=${lastTab}`);
            setView('admin');
          }}
        />
      )}

      {view === 'profile' && targetUsername && (
        <PublicProfile 
          username={targetUsername} 
          onNavigateHome={handleNavigateHome}
        />
      )}

      {view === 'tienda' && (
        <TiendaGeneral 
          onNavigateHome={handleNavigateHome}
          onNavigateToStore={(username) => {
            window.history.pushState({}, '', '/' + username);
            setTargetUsername(username);
            setView('profile');
          }}
        />
      )}

      {view === 'admin' && (
        <AdminPanel 
          onBack={() => {
            window.history.pushState({}, '', '/dashboard');
            setView('dashboard');
          }}
        />
      )}

      {view === 'driver-register' && (
        <DriverRegister 
          onNavigateHome={handleNavigateHome}
          onNavigateLogin={() => setView('driver-portal')}
          onSuccessRegistered={(driver) => {
            setActiveDriverSession(driver);
            setView('driver-portal');
          }}
        />
      )}

      {view === 'driver-portal' && (
        <DriverPortal 
          onNavigateHome={handleNavigateHome}
          onNavigateRegister={() => setView('driver-register')}
          initialDriver={activeDriverSession}
        />
      )}

      {view === 'carruselproduc' && (
        <CarruselProduc
          initialReelId={targetReelId}
          onNavigateHome={() => {
            window.history.pushState({}, '', '/tienda');
            setTargetUsername(null);
            setTargetReelId(null);
            setView('tienda');
          }}
          onNavigateToStore={(username) => {
            window.history.pushState({}, '', '/' + username);
            setTargetUsername(username);
            setTargetReelId(null);
            setView('profile');
          }}
          onNavigateToTienda={() => {
            window.history.pushState({}, '', '/tienda');
            setTargetUsername(null);
            setTargetReelId(null);
            setView('tienda');
          }}
        />
      )}

      {/* LinnkPro AI Voice Assistant (Floating Button & Voice Shopping Modal) - Solo en página de inicio */}
      {(view === 'tienda' || view === 'landing') && (
        <LinnkProVoiceAssistant 
          activeUsername={targetUsername}
          onNavigateToStore={(storeUsername) => {
            window.history.pushState({}, '', '/' + storeUsername);
            setTargetUsername(storeUsername);
            setView('profile');
          }}
          onNavigateToTienda={() => {
            window.history.pushState({}, '', '/tienda');
            setTargetUsername(null);
            setView('tienda');
          }}
        />
      )}
    </div>
  );
}

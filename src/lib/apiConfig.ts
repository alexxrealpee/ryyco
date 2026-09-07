/**
 * API Configuration and Smart Routing
 * Resolves API endpoints dynamically whether running in local development,
 * on Google Cloud Run, or deployed as a static frontend on custom domains (e.g. Hostinger, ryyco.com).
 */

/**
 * API Configuration and Smart Routing
 * Resolves API endpoints dynamically whether running in local development,
 * on Google Cloud Run, or deployed on custom domains (e.g. Hostinger, ryyco.com).
 */

// Configurable remote backend URL if user runs a dedicated Node.js service
export function getCustomBackendUrl(): string | null {
  if (typeof window !== 'undefined') {
    const custom = (window as any).RYYCO_API_URL || localStorage.getItem('ryyco_backend_url');
    if (custom && typeof custom === 'string' && custom.trim()) {
      return custom.trim().replace(/\/$/, '');
    }
  }
  const envUrl = (import.meta as any).env?.VITE_API_BASE_URL || (import.meta as any).env?.VITE_BACKEND_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    return envUrl.trim().replace(/\/$/, '');
  }
  return null;
}

export function getApiBaseUrl(): string {
  // 1. Explicit override if configured
  const customUrl = getCustomBackendUrl();
  if (customUrl) {
    return customUrl;
  }

  // 2. Client-side hostname detection
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    // On localhost, Cloud Run, or custom domains with native/PHP API bridge (like ryyco.com on Hostinger),
    // always use relative paths so requests stay same-origin and avoid CORS issues.
    return '';
  }

  return '';
}

export function getApiUrl(endpoint: string, forceRemote: boolean = false): string {
  const cleanPath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  if (forceRemote) {
    const custom = getCustomBackendUrl();
    if (custom) return `${custom}${cleanPath}`;
    return cleanPath;
  }
  const base = getApiBaseUrl();
  return base ? `${base}${cleanPath}` : cleanPath;
}

/**
 * Robust fetch that handles static hosting environments (like Hostinger).
 * If a relative /api call returns HTML (due to .htaccess or 404 SPA fallback),
 * it attempts a custom backend if configured, or gracefully signals unavailability
 * without triggering unhandled CORS policy blocks.
 */
export async function smartApiFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const cleanPath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const primaryUrl = getApiUrl(cleanPath);

  try {
    const response = await fetch(primaryUrl, {
      ...options,
      headers: {
        'Accept': 'application/json',
        ...(options.headers || {})
      }
    });

    // Check if the response returned an HTML document (typical of static hostings before PHP files are active)
    const contentType = response.headers.get('content-type') || '';
    const isHtmlResponse = contentType.includes('text/html');

    if (isHtmlResponse) {
      const customBackend = getCustomBackendUrl();
      if (customBackend && primaryUrl !== `${customBackend}${cleanPath}`) {
        console.info(`Endpoint ${primaryUrl} returned HTML. Retrying on custom backend...`);
        return await fetch(`${customBackend}${cleanPath}`, {
          ...options,
          headers: {
            'Accept': 'application/json',
            ...(options.headers || {})
          }
        });
      }

      // If no valid remote backend is configured, reject with a structured error
      // so calling services activate their local client-side matching engine cleanly
      throw new Error(`ENDPOINT_RETURNED_HTML:${cleanPath}`);
    }

    return response;
  } catch (err: any) {
    const customBackend = getCustomBackendUrl();
    if (customBackend && primaryUrl !== `${customBackend}${cleanPath}`) {
      console.info(`Primary fetch failed (${err?.message || err}). Retrying on custom backend...`);
      return await fetch(`${customBackend}${cleanPath}`, {
        ...options,
        headers: {
          'Accept': 'application/json',
          ...(options.headers || {})
        }
      });
    }
    throw err;
  }
}

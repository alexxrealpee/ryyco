/**
 * API Configuration and Smart Routing
 * Resolves API endpoints dynamically whether running in local development,
 * on Google Cloud Run, or deployed as a static frontend on custom domains (e.g. Hostinger, ryyco.com).
 */

const CLOUD_RUN_BACKEND_URL = 'https://ais-pre-d6s4zlfh5wgcjs25a6lj5e-310830613015.us-west1.run.app';

export function getApiBaseUrl(): string {
  // 1. Explicit environment variable override
  const envUrl = (import.meta as any).env?.VITE_API_BASE_URL || (import.meta as any).env?.VITE_BACKEND_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    return envUrl.trim().replace(/\/$/, '');
  }

  // 2. Client-side hostname detection
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    // When running locally or directly on Cloud Run, relative paths hit the server.ts backend directly
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.run.app')) {
      return '';
    }

    // When running on custom domains hosted statically on Hostinger, Vercel, etc. (e.g. ryyco.com)
    // Route API requests to the active Cloud Run server
    return CLOUD_RUN_BACKEND_URL;
  }

  return '';
}

export function getApiUrl(endpoint: string, forceRemote: boolean = false): string {
  const cleanPath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  if (forceRemote) {
    return `${CLOUD_RUN_BACKEND_URL}${cleanPath}`;
  }
  const base = getApiBaseUrl();
  return base ? `${base}${cleanPath}` : cleanPath;
}

/**
 * Robust fetch that handles static hosting environments (like Hostinger).
 * If a relative /api call returns HTML (due to .htaccess or 404 SPA fallback),
 * it automatically re-routes the request to the live Cloud Run backend.
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

    // Check if the response returned an HTML document (typical of static hostings like Hostinger)
    const contentType = response.headers.get('content-type') || '';
    const isHtmlResponse = contentType.includes('text/html');

    // If on a static host that caught the route and returned index.html, retry on the Cloud Run backend
    if (isHtmlResponse && primaryUrl !== getApiUrl(cleanPath, true)) {
      console.warn(`Endpoint ${primaryUrl} returned HTML. Retrying on Cloud Run backend...`);
      return await fetch(getApiUrl(cleanPath, true), {
        ...options,
        headers: {
          'Accept': 'application/json',
          ...(options.headers || {})
        }
      });
    }

    return response;
  } catch (err) {
    // If the initial request failed with network error and was relative, attempt remote backend
    if (primaryUrl !== getApiUrl(cleanPath, true)) {
      console.warn(`Fetch to ${primaryUrl} failed (${err}). Retrying on Cloud Run backend...`);
      return await fetch(getApiUrl(cleanPath, true), {
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

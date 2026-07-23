import type { AxiosInstance } from 'axios';

const STORAGE_KEY = 'wn_auth';

function storedToken(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw)?.token ?? null;
  } catch {
    return null;
  }
}

// Wire an axios client into the session:
//
// 1. Request interceptor — attach the stored token at request time. This is
//    the source of truth for auth headers: it works for every client
//    (the shared `api` instance never sees mutations made to
//    axios.defaults after module load) and can't race a login re-render.
// 2. Response interceptor — on any 401 the session is gone; clear it and
//    send the user to /login. Auth endpoints are excluded so a
//    wrong-password 401 on the login form doesn't trigger a redirect loop.
// fetch() with the same auth behavior the axios interceptors provide:
// attach the stored token, and on 401 clear the session and go to /login.
// For pages that use fetch directly instead of the shared axios instance.
export async function authedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has('Authorization')) {
    const token = storedToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }
  const res = await fetch(input, { ...init, headers });
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const isAuthEndpoint = url.includes('/auth/');
  const onLoginPage = window.location.pathname === '/login';
  if (res.status === 401 && !isAuthEndpoint && !onLoginPage) {
    localStorage.removeItem(STORAGE_KEY);
    window.location.assign('/login');
  }
  return res;
}

export function installAuthRedirect(instance: AxiosInstance) {
  instance.interceptors.request.use((config) => {
    if (!config.headers?.Authorization) {
      const token = storedToken();
      if (token) config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  instance.interceptors.response.use(
    (response) => response,
    (error) => {
      const status = error?.response?.status;
      const url: string = error?.config?.url || '';
      const isAuthEndpoint = url.includes('/auth/');
      const onLoginPage = window.location.pathname === '/login';
      if (status === 401 && !isAuthEndpoint && !onLoginPage) {
        localStorage.removeItem(STORAGE_KEY);
        window.location.assign('/login');
      }
      return Promise.reject(error);
    },
  );
}

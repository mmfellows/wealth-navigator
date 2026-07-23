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

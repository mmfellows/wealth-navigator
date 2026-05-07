import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import axios from 'axios';
import {
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser';

// --- Types -------------------------------------------------------------------

export interface AuthUser {
  id: string;
  email: string;
}

interface LoginResponseNoPasskey {
  requires_passkey: false;
  user: AuthUser;
  token: string;
}

interface LoginResponseWithPasskey {
  requires_passkey: true;
  email: string;
  options: unknown; // PublicKeyCredentialRequestOptionsJSON, opaque to consumers
}

type LoginResponse = LoginResponseNoPasskey | LoginResponseWithPasskey;

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  ready: boolean;
  /** Step 1 of login. Returns the server response unchanged so the caller (Login page) can branch. */
  login: (email: string, password: string) => Promise<LoginResponse>;
  /** Step 2 of login when a passkey is required. Performs the WebAuthn ceremony. */
  loginVerifyPasskey: (email: string, options: unknown) => Promise<void>;
  /** Register email+password (allow-list enforced server-side in prod). */
  register: (email: string, password: string) => Promise<void>;
  /** Add a passkey to the currently-authenticated user. */
  registerPasskey: (deviceLabel?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// --- Storage -----------------------------------------------------------------
//
// Tokens live in localStorage. The trade-off: simple & survives reload, but
// vulnerable to XSS (mitigated by helmet's default CSP and our hand-built
// frontend without third-party JS injecting into our origin). Acceptable for
// this single-user personal app; documented in security/ACCESS_CONTROL.md.

const STORAGE_KEY = 'wn_auth';

function loadFromStorage(): { user: AuthUser; token: string } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.user && parsed.token) return parsed;
    return null;
  } catch {
    return null;
  }
}

function saveToStorage(user: AuthUser, token: string) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ user, token }));
}

function clearStorage() {
  localStorage.removeItem(STORAGE_KEY);
}

// --- Provider ----------------------------------------------------------------

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Hydrate from storage on mount.
  useEffect(() => {
    const stored = loadFromStorage();
    if (stored) {
      setUser(stored.user);
      setToken(stored.token);
    }
    setReady(true);
  }, []);

  // Wire global axios so every request — including the Plaid components that
  // import axios directly rather than going through services/api.ts — sends
  // the Authorization header.
  useEffect(() => {
    const id = axios.interceptors.request.use((config) => {
      if (token) {
        config.headers = config.headers || {};
        // axios v1 typing: headers is AxiosHeaders | undefined; assignment works either way.
        (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
      }
      return config;
    });
    return () => {
      axios.interceptors.request.eject(id);
    };
  }, [token]);

  const setSession = useCallback((u: AuthUser, t: string) => {
    setUser(u);
    setToken(t);
    saveToStorage(u, t);
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    clearStorage();
  }, []);

  const login = useCallback<AuthContextValue['login']>(async (email, password) => {
    const { data } = await axios.post<LoginResponse>('/api/auth/login', { email, password });
    if (!data.requires_passkey) {
      setSession(data.user, data.token);
    }
    return data;
  }, [setSession]);

  const loginVerifyPasskey = useCallback<AuthContextValue['loginVerifyPasskey']>(
    async (email, options) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const assertion = await startAuthentication({ optionsJSON: options as any });
      const { data } = await axios.post<LoginResponseNoPasskey>(
        '/api/auth/passkey/login-verify',
        { email, response: assertion },
      );
      setSession(data.user, data.token);
    },
    [setSession],
  );

  const register = useCallback<AuthContextValue['register']>(async (email, password) => {
    const { data } = await axios.post<{ user: AuthUser; token: string }>(
      '/api/auth/register',
      { email, password },
    );
    setSession(data.user, data.token);
  }, [setSession]);

  const registerPasskey = useCallback<AuthContextValue['registerPasskey']>(async (deviceLabel) => {
    if (!token) throw new Error('Must be logged in to register a passkey');
    const { data: options } = await axios.post('/api/auth/passkey/register-options', {});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attestation = await startRegistration({ optionsJSON: options as any });
    await axios.post('/api/auth/passkey/register-verify', {
      response: attestation,
      deviceLabel: deviceLabel || null,
    });
  }, [token]);

  const value = useMemo<AuthContextValue>(() => ({
    user, token, ready, login, loginVerifyPasskey, register, registerPasskey, logout,
  }), [user, token, ready, login, loginVerifyPasskey, register, registerPasskey, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

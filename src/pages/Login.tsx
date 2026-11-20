import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { TrendingUp } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

type Stage = 'password' | 'passkey';
type Mode = 'login' | 'register';

// Google Identity Services web client ID. Unset -> the Google button is
// hidden and only password/passkey auth is offered.
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const GSI_SRC = 'https://accounts.google.com/gsi/client';

interface GoogleCredentialResponse { credential: string }
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: object) => void;
          renderButton: (el: HTMLElement, options: object) => void;
        };
      };
    };
  }
}

// Load the GIS script once and resolve when window.google is available.
let gsiPromise: Promise<void> | null = null;
function loadGsi(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!gsiPromise) {
    gsiPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = GSI_SRC;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => { gsiPromise = null; reject(new Error('Failed to load Google sign-in')); };
      document.head.appendChild(script);
    });
  }
  return gsiPromise;
}

export default function Login() {
  const { login, loginVerifyPasskey, register, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: { pathname?: string } } };
  const redirectTo = location.state?.from?.pathname || '/';

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [stage, setStage] = useState<Stage>('password');
  const [pendingOptions, setPendingOptions] = useState<unknown>(null);
  const [pendingEmail, setPendingEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const googleButtonRef = useRef<HTMLDivElement>(null);

  // Render the official Google button when configured. The GIS callback
  // hands us an ID token; the server verifies it and issues our JWT.
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || stage !== 'password') return;
    let cancelled = false;
    loadGsi()
      .then(() => {
        if (cancelled || !googleButtonRef.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: async (response: GoogleCredentialResponse) => {
            setError(null);
            setBusy(true);
            try {
              await loginWithGoogle(response.credential);
              navigate(redirectTo, { replace: true });
            } catch (err) {
              setError(extractError(err) || 'Google sign-in failed');
            } finally {
              setBusy(false);
            }
          },
        });
        window.google.accounts.id.renderButton(googleButtonRef.current, {
          theme: 'filled_black',
          size: 'large',
          width: 352,
          text: 'continue_with',
        });
      })
      .catch(() => {
        // Script blocked or offline — password login still works.
      });
    return () => { cancelled = true; };
  }, [stage, loginWithGoogle, navigate, redirectTo]);

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const cleanedEmail = email.trim().toLowerCase();
      if (mode === 'register') {
        await register(cleanedEmail, password);
        navigate('/security', { replace: true });
        return;
      }
      const result = await login(cleanedEmail, password);
      if (result.requires_passkey) {
        setPendingEmail(result.email);
        setPendingOptions(result.options);
        setStage('passkey');
      } else {
        navigate(redirectTo, { replace: true });
      }
    } catch (err) {
      setError(extractError(err) || (mode === 'register' ? 'Registration failed' : 'Login failed'));
    } finally {
      setBusy(false);
    }
  }

  async function handlePasskeyVerify() {
    if (!pendingOptions) return;
    setError(null);
    setBusy(true);
    try {
      await loginVerifyPasskey(pendingEmail, pendingOptions);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(extractError(err) || 'Passkey verification failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="theme-evergreen min-h-screen bg-ever-bg font-grotesk text-ever-ink flex items-center justify-center px-4 py-10">
      <div className="max-w-md w-full rounded-ever border border-ever-line bg-ever-card p-8">
        <div className="mb-1 flex items-center gap-2.5">
          <TrendingUp className="h-7 w-7 text-ever-lime" aria-hidden="true" />
          <h1 className="text-2xl font-extrabold tracking-tight text-ever-ink">Wealth Navigator</h1>
        </div>
        <p className="text-sm text-ever-dim mb-6">
          {stage === 'passkey'
            ? 'Verify with your passkey to continue.'
            : mode === 'login'
            ? 'Sign in to your account.'
            : 'Create your account.'}
        </p>

        {stage === 'password' && GOOGLE_CLIENT_ID && (
          <div className="mb-5">
            <div ref={googleButtonRef} className="flex justify-center" />
            <div className="flex items-center gap-3 mt-5">
              <div className="flex-1 border-t border-ever-line" />
              <span className="font-mono text-[10.5px] text-ever-dim uppercase tracking-[0.14em]">or</span>
              <div className="flex-1 border-t border-ever-line" />
            </div>
          </div>
        )}

        {stage === 'password' && (
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label className="block font-mono text-[10.5px] uppercase tracking-[0.14em] text-ever-dim mb-1.5" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-[11px] border border-ever-line bg-ever-bg px-3 py-2.5 text-ever-ink placeholder-ever-faint focus:outline-none focus:border-ever-lime focus:ring-1 focus:ring-ever-lime"
              />
            </div>

            <div>
              <label className="block font-mono text-[10.5px] uppercase tracking-[0.14em] text-ever-dim mb-1.5" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-[11px] border border-ever-line bg-ever-bg px-3 py-2.5 text-ever-ink placeholder-ever-faint focus:outline-none focus:border-ever-lime focus:ring-1 focus:ring-ever-lime"
              />
            </div>

            {error && <p role="alert" className="rounded-[11px] border border-ever-neg/40 bg-ever-neg/10 px-3 py-2 text-sm text-ever-neg">{error}</p>}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-[11px] bg-ever-lime py-2.5 font-semibold text-ever-lime-ink transition hover:brightness-95 disabled:opacity-50"
            >
              {busy
                ? mode === 'register' ? 'Creating account…' : 'Signing in…'
                : mode === 'register' ? 'Create account' : 'Sign in'}
            </button>

            <button
              type="button"
              onClick={() => {
                setMode((m) => (m === 'login' ? 'register' : 'login'));
                setError(null);
                setPassword('');
              }}
              className="w-full text-sm text-ever-dim hover:text-ever-ink"
            >
              {mode === 'login'
                ? "First time? Create an account"
                : 'Already have an account? Sign in'}
            </button>
          </form>
        )}

        {stage === 'passkey' && (
          <div className="space-y-4">
            <p className="text-sm text-ever-dim">
              Signed in as <span className="font-medium text-ever-ink">{pendingEmail}</span>. Tap your security key
              or use Touch ID / Face ID to complete sign-in.
            </p>

            {error && <p role="alert" className="rounded-[11px] border border-ever-neg/40 bg-ever-neg/10 px-3 py-2 text-sm text-ever-neg">{error}</p>}

            <button
              type="button"
              onClick={handlePasskeyVerify}
              disabled={busy}
              className="w-full rounded-[11px] bg-ever-lime py-2.5 font-semibold text-ever-lime-ink transition hover:brightness-95 disabled:opacity-50"
            >
              {busy ? 'Verifying…' : 'Verify with passkey'}
            </button>

            <button
              type="button"
              onClick={() => {
                setStage('password');
                setPendingOptions(null);
                setPendingEmail('');
                setPassword('');
                setError(null);
              }}
              className="w-full text-sm text-ever-dim hover:text-ever-ink"
            >
              Use a different account
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractError(err: any): string | null {
  if (!err) return null;
  if (err.response?.data?.error) return String(err.response.data.error);
  if (err.message) return String(err.message);
  return null;
}

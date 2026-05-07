import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

type Stage = 'password' | 'passkey';
type Mode = 'login' | 'register';

export default function Login() {
  const { login, loginVerifyPasskey, register } = useAuth();
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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow p-8">
        <h1 className="text-2xl font-semibold text-gray-900 mb-1">Wealth Navigator</h1>
        <p className="text-sm text-gray-500 mb-6">
          {stage === 'passkey'
            ? 'Verify with your passkey to continue.'
            : mode === 'login'
            ? 'Sign in to your account.'
            : 'Create your account.'}
        </p>

        {stage === 'password' && (
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={busy}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-md py-2 transition"
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
              className="w-full text-sm text-gray-500 hover:text-gray-700"
            >
              {mode === 'login'
                ? "First time? Create an account"
                : 'Already have an account? Sign in'}
            </button>
          </form>
        )}

        {stage === 'passkey' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-700">
              Signed in as <span className="font-medium">{pendingEmail}</span>. Tap your security key
              or use Touch ID / Face ID to complete sign-in.
            </p>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="button"
              onClick={handlePasskeyVerify}
              disabled={busy}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-md py-2 transition"
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
              className="w-full text-sm text-gray-500 hover:text-gray-700"
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

import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

interface PasskeySummary {
  id: string;
  name: string | null;
  device_type: string | null;
  backed_up: boolean;
  created_at: string;
  last_used_at: string;
}

export default function Security() {
  const { user, registerPasskey, logout } = useAuth();
  const [passkeys, setPasskeys] = useState<PasskeySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [deviceLabel, setDeviceLabel] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadPasskeys() {
    setLoading(true);
    try {
      const { data } = await axios.get<{ passkeys: PasskeySummary[] }>('/api/auth/passkey/list');
      setPasskeys(data.passkeys);
    } catch (err) {
      setError(extractError(err) || 'Failed to load passkeys');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPasskeys();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAddPasskey() {
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      await registerPasskey(deviceLabel.trim() || undefined);
      setMessage('Passkey registered. Future logins will require it.');
      setDeviceLabel('');
      await loadPasskeys();
    } catch (err) {
      setError(extractError(err) || 'Passkey registration failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Security</h1>
        <p className="text-sm text-gray-500 mt-1">
          Signed in as <span className="font-medium">{user?.email}</span>.
        </p>
      </div>

      <section className="bg-white rounded-lg shadow p-6 space-y-4">
        <div>
          <h2 className="text-lg font-medium text-gray-900">Passkeys</h2>
          <p className="text-sm text-gray-500 mt-1">
            Register a passkey (security key, Touch ID, Face ID, Windows Hello) to add a
            phishing-resistant second factor to your login. Once registered, every future
            login will require both your password and the passkey.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            placeholder="Device label (e.g. MacBook — Touch ID)"
            value={deviceLabel}
            onChange={(e) => setDeviceLabel(e.target.value)}
            className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={handleAddPasskey}
            disabled={busy}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-md px-4 py-2 transition"
          >
            {busy ? 'Registering…' : 'Add passkey'}
          </button>
        </div>

        {message && <p className="text-sm text-green-700">{message}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="border-t border-gray-200 pt-4">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Registered passkeys</h3>
          {loading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : passkeys.length === 0 ? (
            <p className="text-sm text-gray-500">
              None registered yet. After you register the first one, every subsequent login
              will require it.
            </p>
          ) : (
            <ul className="space-y-2">
              {passkeys.map((pk) => (
                <li key={pk.id} className="flex justify-between items-center text-sm border-b border-gray-100 pb-2">
                  <div>
                    <div className="font-medium text-gray-900">{pk.name || 'Unnamed device'}</div>
                    <div className="text-xs text-gray-500">
                      {pk.device_type || 'unknown type'}
                      {pk.backed_up ? ' · synced' : ' · device-bound'}
                      {' · added ' + new Date(pk.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="text-xs text-gray-400">
                    last used {new Date(pk.last_used_at).toLocaleDateString()}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="bg-white rounded-lg shadow p-6">
        <button
          type="button"
          onClick={logout}
          className="text-sm text-gray-700 hover:text-gray-900 underline"
        >
          Sign out
        </button>
      </section>
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

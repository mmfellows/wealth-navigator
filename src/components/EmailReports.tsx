import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { authedFetch } from '../services/authRedirect';
import { Card, toast } from './ui';

type ReportType = 'digest' | 'monthly' | 'quarterly' | 'annual';

interface SendRecord {
  last_sent_at?: string | null;
  last_sent_to?: string | null;
  last_sent_manual?: boolean;
  last_error?: string | null;
  last_error_at?: string | null;
}

interface Status {
  history?: Partial<Record<ReportType, SendRecord | null>>;
  email_configured: boolean;
  provider: 'gmail' | 'resend' | null;
  gmail_check: { user_is_email: boolean; user_domain: string | null; password_length: number; password_looks_like_app_password: boolean } | null;
  recipient: string | null;
  schedule: Record<ReportType, string>;
  settings?: { digest: string; monthly: boolean; quarterly: boolean; annual: boolean };
  digest_frequencies?: Record<string, string>;
  next?: Record<ReportType, string | null>;
}

const REPORTS: Array<{ type: ReportType; name: string; what: string }> = [
  { type: 'digest', name: 'Spending check-in', what: 'Month-to-date pacing, recent transactions to review, and a prompt for planned costs' },
  { type: 'monthly', name: 'Monthly lookback', what: 'Last month: spend vs budget by category' },
  { type: 'quarterly', name: 'Quarterly lookback', what: 'Last quarter vs budget, month by month' },
  { type: 'annual', name: 'Annual lookback', what: 'Last year vs budget, month by month' },
];

// Emailed reports: what goes out when, with a preview and a send-now button.
const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function EmailReports() {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  // Result of a "Send now" click in this visit, shown in place on the row.
  const [result, setResult] = useState<Partial<Record<ReportType, { ok: boolean; text: string }>>>({});

  const { data: status } = useQuery<Status>({
    queryKey: ['report-status'],
    queryFn: async () => {
      const res = await authedFetch('/api/reports/status');
      if (!res.ok) throw new Error('Failed to fetch report status');
      return res.json();
    },
  });

  const preview = async (type: ReportType) => {
    // Open the tab first so the browser treats it as a user-initiated popup.
    const tab = window.open('', '_blank');
    setBusy(`preview-${type}`);
    try {
      const res = await authedFetch(`/api/reports/${type}/preview`);
      if (!res.ok) throw new Error('Could not build the preview.');
      const { html } = await res.json();
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      if (tab) tab.location.href = url;
      else toast.error('Allow pop-ups to see the preview.');
    } catch (e) {
      tab?.close();
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const send = async (type: ReportType) => {
    setBusy(`send-${type}`);
    setResult(r => ({ ...r, [type]: undefined }));
    try {
      const res = await authedFetch(`/api/reports/${type}/send`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not send the email.');
      const text = `Sent to ${body.to || 'you'} just now. Check your inbox for "${body.subject}".`;
      setResult(r => ({ ...r, [type]: { ok: true, text } }));
      toast.success(`Email sent to ${body.to || 'you'}`);
    } catch (e) {
      setResult(r => ({ ...r, [type]: { ok: false, text: (e as Error).message } }));
      toast.error('The email did not send. See the reason next to the report.');
    } finally {
      setBusy(null);
      queryClient.invalidateQueries({ queryKey: ['report-status'] });
    }
  };

  // Change how often a report is sent. Saved straight away.
  const saveSetting = async (patch: Record<string, string | boolean>, label: string) => {
    setBusy('settings');
    try {
      const res = await authedFetch('/api/reports/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'That change did not save.');
      toast.success(label);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
      queryClient.invalidateQueries({ queryKey: ['report-status'] });
    }
  };

  // "Mon, Nov 23" from 'YYYY-MM-DD', as a local date.
  const dayLabel = (iso: string) =>
    new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))
      .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const selectCls = 'rounded-lg border border-ever-line bg-ever-bg px-2 py-1.5 text-xs text-ever-ink focus:border-ever-lime focus:outline-none disabled:opacity-50';

  const linkCls = 'font-mono text-[10.5px] text-ever-lime hover:underline disabled:opacity-50 disabled:no-underline';

  return (
    <Card>
      <h2 className="flex items-center gap-2 text-lg font-semibold text-ever-ink">
        <Mail className="h-4 w-4 text-ever-lime" /> Email reports
      </h2>
      <p className="mt-1 text-sm text-ever-dim">
        {status?.recipient ? <>Sent to <span className="text-ever-ink">{status.recipient}</span>{status.provider === 'gmail' ? ' from your Gmail account' : ''}.</> : 'Sent to the address in REPORT_EMAIL_TO.'}
      </p>
      {status && !status.email_configured && (
        <p className="mt-3 rounded-md border border-ever-orange/30 bg-ever-orange/10 p-3 text-sm text-ever-orange">
          Email sending isn't set up yet, so nothing will go out: the server needs your Gmail address (GMAIL_USER) and a Gmail app password (GMAIL_APP_PASSWORD). Previews work in the meantime.
        </p>
      )}
      {status?.gmail_check && (!status.gmail_check.user_is_email || !status.gmail_check.password_looks_like_app_password) && (
        <p className="mt-3 rounded-md border border-ever-neg/30 bg-ever-neg/10 p-3 text-sm text-ever-neg">
          {!status.gmail_check.user_is_email
            ? 'The saved Gmail address (GMAIL_USER) is not a full email address, so Gmail will reject the sign-in.'
            : `The saved Gmail app password (GMAIL_APP_PASSWORD) is ${status.gmail_check.password_length} characters. A Google app password is 16 letters, so Gmail will reject this one. It may be your normal password.`}
        </p>
      )}
      <div className="mt-3">
        {REPORTS.map(r => (
          <div key={r.type} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-ever-line py-3 first:border-t-0">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-ever-ink">{r.name}</div>
              <div className="text-xs text-ever-dim">{r.what}</div>
            </div>
            <div className="flex flex-col items-start gap-0.5 sm:items-end">
              {status?.settings && (r.type === 'digest' ? (
                <select
                  className={selectCls}
                  value={status.settings.digest}
                  disabled={busy !== null}
                  onChange={e => saveSetting({ digest: e.target.value }, `Check-in: ${status.digest_frequencies?.[e.target.value] ?? e.target.value}`)}
                  aria-label="How often the spending check-in is sent"
                >
                  {Object.entries(status.digest_frequencies || {}).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
              ) : (
                <select
                  className={selectCls}
                  value={status.settings[r.type] ? 'on' : 'off'}
                  disabled={busy !== null}
                  onChange={e => saveSetting({ [r.type]: e.target.value === 'on' }, `${r.name} ${e.target.value === 'on' ? 'turned on' : 'turned off'}`)}
                  aria-label={`${r.name}: on or off`}
                >
                  <option value="on">{status.schedule[r.type]}</option>
                  <option value="off">Off</option>
                </select>
              ))}
              <span className="font-mono text-[10.5px] text-ever-faint">
                {status?.next?.[r.type] ? `Next: ${dayLabel(status.next[r.type] as string)}` : status?.settings ? 'Not scheduled' : ''}
              </span>
            </div>
            <button className={linkCls} disabled={busy !== null} onClick={() => preview(r.type)}>
              {busy === `preview-${r.type}` ? 'Building…' : 'Preview'}
            </button>
            <button className={linkCls} disabled={busy !== null || !status?.email_configured} onClick={() => send(r.type)}>
              {busy === `send-${r.type}` ? 'Sending…' : 'Send now'}
            </button>
            {/* Outcome: this visit's click if there was one, otherwise the last recorded attempt. */}
            {(() => {
              const now = result[r.type];
              const h = status?.history?.[r.type];
              const row = 'flex w-full items-start gap-1.5 text-xs';
              if (busy === `send-${r.type}`) {
                return <div className={`${row} text-ever-dim`} role="status"><Loader2 className="mt-px h-3.5 w-3.5 flex-none animate-spin" /> Sending the email…</div>;
              }
              if (now) {
                return (
                  <div className={`${row} ${now.ok ? 'text-ever-pos' : 'text-ever-neg'}`} role={now.ok ? 'status' : 'alert'}>
                    {now.ok ? <CheckCircle2 className="mt-px h-3.5 w-3.5 flex-none" /> : <AlertCircle className="mt-px h-3.5 w-3.5 flex-none" />}
                    <span>{now.ok ? now.text : `Not sent. ${now.text}`}</span>
                  </div>
                );
              }
              if (h?.last_error && h.last_error_at) {
                return (
                  <div className={`${row} text-ever-neg`}>
                    <AlertCircle className="mt-px h-3.5 w-3.5 flex-none" />
                    <span>Last attempt failed {when(h.last_error_at)}. {h.last_error}</span>
                  </div>
                );
              }
              if (h?.last_sent_at) {
                return (
                  <div className={`${row} text-ever-dim`}>
                    <CheckCircle2 className="mt-px h-3.5 w-3.5 flex-none text-ever-pos" />
                    <span>Last sent {when(h.last_sent_at)} to {h.last_sent_to}{h.last_sent_manual ? ' (sent by hand)' : ' (scheduled)'}</span>
                  </div>
                );
              }
              return <div className={`${row} text-ever-faint`}>Never sent yet.</div>;
            })()}
          </div>
        ))}
      </div>
    </Card>
  );
}

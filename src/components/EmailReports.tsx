import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Mail } from 'lucide-react';
import { authedFetch } from '../services/authRedirect';
import { Card, toast } from './ui';

type ReportType = 'digest' | 'monthly' | 'quarterly' | 'annual';

interface Status {
  email_configured: boolean;
  recipient: string | null;
  schedule: Record<ReportType, string>;
}

const REPORTS: Array<{ type: ReportType; name: string; what: string }> = [
  { type: 'digest', name: 'Spending check-in', what: 'Month-to-date pacing, recent transactions to review, and a prompt for planned costs' },
  { type: 'monthly', name: 'Monthly lookback', what: 'Last month: spend vs budget by category' },
  { type: 'quarterly', name: 'Quarterly lookback', what: 'Last quarter vs budget, month by month' },
  { type: 'annual', name: 'Annual lookback', what: 'Last year vs budget, month by month' },
];

// Emailed reports: what goes out when, with a preview and a send-now button.
export function EmailReports() {
  const [busy, setBusy] = useState<string | null>(null);

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
    try {
      const res = await authedFetch(`/api/reports/${type}/send`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not send the email.');
      toast.success(`Sent: ${body.subject}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const linkCls = 'font-mono text-[10.5px] text-ever-lime hover:underline disabled:opacity-50 disabled:no-underline';

  return (
    <Card>
      <h2 className="flex items-center gap-2 text-lg font-semibold text-ever-ink">
        <Mail className="h-4 w-4 text-ever-lime" /> Email reports
      </h2>
      <p className="mt-1 text-sm text-ever-dim">
        {status?.recipient ? <>Sent to <span className="text-ever-ink">{status.recipient}</span>.</> : 'Sent to the address in REPORT_EMAIL_TO.'}
      </p>
      {status && !status.email_configured && (
        <p className="mt-3 rounded-md border border-ever-orange/30 bg-ever-orange/10 p-3 text-sm text-ever-orange">
          Email sending isn't set up yet, so nothing will go out: the server needs a RESEND_API_KEY. Previews work in the meantime.
        </p>
      )}
      <div className="mt-3">
        {REPORTS.map(r => (
          <div key={r.type} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-ever-line py-3 first:border-t-0">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-ever-ink">{r.name}</div>
              <div className="text-xs text-ever-dim">{r.what}</div>
            </div>
            <div className="font-mono text-[10.5px] text-ever-faint">{status?.schedule[r.type] || ''}</div>
            <button className={linkCls} disabled={busy !== null} onClick={() => preview(r.type)}>
              {busy === `preview-${r.type}` ? 'Building…' : 'Preview'}
            </button>
            <button className={linkCls} disabled={busy !== null || !status?.email_configured} onClick={() => send(r.type)}>
              {busy === `send-${r.type}` ? 'Sending…' : 'Send now'}
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
}

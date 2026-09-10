import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '../../lib/cn';

export type ToastKind = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

// Module-level emitter so any code (components, services, event handlers) can
// fire a toast without hook/context plumbing. The single <Toaster/> mounted in
// App subscribes and renders the stack.
type Listener = (t: ToastItem) => void;
let listener: Listener | null = null;
let nextId = 1;

function push(kind: ToastKind, message: string) {
  listener?.({ id: nextId++, kind, message });
}

export const toast = {
  success: (message: string) => push('success', message),
  error: (message: string) => push('error', message),
  info: (message: string) => push('info', message),
};

// Dev console access: window.toast.success('…')
if (import.meta.env.DEV) (window as unknown as { toast: typeof toast }).toast = toast;

const KIND_STYLES: Record<ToastKind, { icon: typeof CheckCircle2; accent: string }> = {
  success: { icon: CheckCircle2, accent: 'text-ever-lime' },
  error: { icon: AlertCircle, accent: 'text-ever-neg' },
  info: { icon: Info, accent: 'text-ever-violet' },
};

const AUTO_DISMISS_MS = 5000;

export const Toaster: React.FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    listener = (t) => {
      setToasts(prev => [...prev.slice(-3), t]); // cap the visible stack at 4
      window.setTimeout(() => {
        setToasts(prev => prev.filter(x => x.id !== t.id));
      }, AUTO_DISMISS_MS);
    };
    return () => { listener = null; };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-[min(380px,calc(100vw-2.5rem))] flex-col gap-2">
      {toasts.map(t => {
        const { icon: Icon, accent } = KIND_STYLES[t.kind];
        return (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex items-start gap-3 rounded-ever border border-ever-line bg-ever-card p-4 shadow-lg shadow-black/30"
          >
            <Icon className={cn('mt-0.5 h-4 w-4 flex-shrink-0', accent)} />
            <p className="flex-1 whitespace-pre-line text-[13px] leading-snug text-ever-ink">{t.message}</p>
            <button
              onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
              className="text-ever-faint transition hover:text-ever-ink"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

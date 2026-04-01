/* eslint-disable react-refresh/only-export-components */
import { useState, useEffect, useCallback, createContext, useContext, useRef } from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType, duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// Falls back to no-op when used outside ToastProvider (e.g., in tests)
const noopToast: ToastContextValue = { toast: () => {} };

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  return ctx || noopToast;
}

const typeStyles: Record<ToastType, string> = {
  success: 'bg-green-900/90 border-green-700 text-green-200',
  error: 'bg-red-900/90 border-red-700 text-red-200',
  warning: 'bg-yellow-900/90 border-yellow-700 text-yellow-200',
  info: 'bg-gray-800/90 border-gray-600 text-gray-200',
};

const typeIcons: Record<ToastType, string> = {
  success: '\u2713',
  error: '\u2717',
  warning: '\u26A0',
  info: '\u2139',
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const exitTimer = setTimeout(() => setIsExiting(true), toast.duration - 300);
    const removeTimer = setTimeout(() => onDismiss(toast.id), toast.duration);
    return () => { clearTimeout(exitTimer); clearTimeout(removeTimer); };
  }, [toast.id, toast.duration, onDismiss]);

  return (
    <div
      className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border shadow-lg backdrop-blur-sm transition-all duration-300 ${typeStyles[toast.type]} ${
        isExiting ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0'
      }`}
      role="alert"
    >
      <span className="text-sm font-bold shrink-0">{typeIcons[toast.type]}</span>
      <span className="text-sm">{toast.message}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        className="ml-2 text-xs opacity-60 hover:opacity-100 transition-opacity shrink-0"
        aria-label="Dismiss notification"
      >
        \u2715
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idCounter = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((message: string, type: ToastType = 'info', duration = 3000) => {
    const id = `toast-${++idCounter.current}`;
    setToasts(prev => [...prev.slice(-4), { id, message, type, duration }]); // Keep max 5
  }, []);

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      {/* Toast container */}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm" aria-live="polite">
          {toasts.map(t => (
            <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

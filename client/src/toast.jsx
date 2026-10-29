import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { CircleAlert, CircleCheck, Bell } from 'lucide-react';

const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

const ICONS = { success: CircleCheck, error: CircleAlert, info: Bell };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const stack = useRef(null);

  const toast = useCallback((message, type = 'info') => {
    const id = crypto.randomUUID();
    setToasts((list) => [...list, { id, message, type }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 3500);
    // The stack is a native popover so it lives in the top layer. Re-showing it moves it above
    // any <dialog> opened since, so toasts from inside a modal aren't hidden behind its backdrop.
    const el = stack.current;
    if (el?.showPopover) {
      if (el.matches(':popover-open')) el.hidePopover();
      el.showPopover();
    }
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div ref={stack} popover="manual" aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-auto bottom-20 m-0 flex h-auto w-full flex-col items-center gap-2 overflow-visible border-0 bg-transparent px-4 md:bottom-6">
        {toasts.map(({ id, message, type }) => {
          const Icon = ICONS[type];
          return (
            <div key={id} role={type === 'error' ? 'alert' : 'status'} className="flex max-w-sm animate-toast items-center gap-2.5 rounded-2xl border border-line bg-raised px-4 py-3 text-sm text-fg shadow-lg shadow-black/40">
              <Icon size={18} className={`shrink-0 ${type === 'error' ? 'text-red-400' : 'text-coral'}`} />
              {message}
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

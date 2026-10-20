import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

interface ToastMsg {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

const Ctx = createContext<(text: string, action?: ToastMsg['action']) => void>(() => {});

export function useToast() {
  return useContext(Ctx);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((text: string, action?: ToastMsg['action']) => {
    if (timer.current) clearTimeout(timer.current);
    setMsg({ id: Date.now(), text, action });
    timer.current = setTimeout(() => setMsg(null), action ? 6000 : 3000);
  }, []);

  return (
    <Ctx.Provider value={show}>
      {children}
      {msg && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4">
          <div key={msg.id} className="pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl bg-stone-900 px-4 py-3 text-sm text-white shadow-lg">
            <span>{msg.text}</span>
            {msg.action && (
              <button
                className="font-semibold text-teal-300"
                onClick={() => {
                  msg.action!.run();
                  setMsg(null);
                }}
              >
                {msg.action.label}
              </button>
            )}
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

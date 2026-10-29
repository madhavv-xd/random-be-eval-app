import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useToast } from '../toast';

// Native <dialog>: Escape-to-close, focus trapping and the backdrop come for free.
export default function Modal({ onClose, children, className = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current.open) ref.current.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={`m-auto bg-transparent p-0 text-fg backdrop:bg-black/75 backdrop:backdrop-blur-sm ${className}`}
    >
      {children}
    </dialog>
  );
}

// Card-style modal with a title bar.
export function Sheet({ title, onClose, children, width = 'w-[min(94vw,26rem)]' }) {
  return (
    <Modal onClose={onClose} className={width}>
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <h2 className="font-bold">{title}</h2>
          <button onClick={onClose} className="icon-btn" aria-label="Close"><X size={20} /></button>
        </div>
        {children}
      </div>
    </Modal>
  );
}

// "Are you sure?" dialog. onConfirm may be async; the button shows a busy state meanwhile.
export function Confirm({ title, text, confirmLabel = 'Confirm', danger = true, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  async function confirm() {
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      toast(err.message, 'error');
      setBusy(false);
    }
  }
  return (
    <Modal onClose={onClose} className="w-[min(92vw,22rem)]">
      <div className="card p-6 text-center">
        <h2 className="text-lg font-bold">{title}</h2>
        {text && <p className="mt-2 text-sm text-muted">{text}</p>}
        <div className="mt-6 grid grid-cols-2 gap-2">
          <button onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button onClick={confirm} disabled={busy} className={`btn ${danger ? 'bg-red-500 text-white hover:bg-red-500/85' : 'btn-primary'}`}>
            {busy ? 'One sec…' : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}

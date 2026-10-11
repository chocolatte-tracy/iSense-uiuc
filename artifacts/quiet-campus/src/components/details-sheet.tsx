import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export function DetailsSheet({ title, open, onClose, children, labelledBy, ownerActive = true }: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  labelledBy?: string;
  ownerActive?: boolean;
}) {
  const panel = useRef<HTMLElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    if (!ownerActive) { onCloseRef.current(); return; }
    previousFocus.current = document.activeElement as HTMLElement;
    const app = document.getElementById('root');
    const wasInert = app?.hasAttribute('inert') ?? false;
    app?.setAttribute('inert', '');
    panel.current?.querySelector<HTMLElement>('button,[href],input,summary,[tabindex]:not([tabindex="-1"])')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onCloseRef.current(); return; }
      if (event.key !== 'Tab' || !panel.current) return;
      const nodes = [...panel.current.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,summary,[tabindex]:not([tabindex="-1"])')]
        .filter(node => !node.hasAttribute('disabled') && node.getClientRects().length > 0);
      if (!nodes.length) return;
      if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0].focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (!wasInert) app?.removeAttribute('inert');
      const previous = previousFocus.current;
      if (previous?.isConnected && previous.getClientRects().length) previous.focus();
      else app?.querySelector<HTMLElement>('button[aria-current="page"]')?.focus();
    };
  }, [open, ownerActive]);
  if (!open || !ownerActive) return null;
  return createPortal(<div className="native-sheet-backdrop" onMouseDown={event => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <section ref={panel} className="native-sheet" role="dialog" aria-modal="true"
      aria-labelledby={labelledBy ?? 'native-sheet-title'} tabIndex={-1}>
      <div className="native-sheet-grip" aria-hidden="true"/>
      <header className="native-sheet-header">
        <h2 id={labelledBy ?? 'native-sheet-title'}>{title}</h2>
        <button type="button" className="native-sheet-close" onClick={onClose} aria-label="Close details"><X size={19}/></button>
      </header>
      <div className="native-sheet-content">{children}</div>
    </section>
  </div>, document.body);
}

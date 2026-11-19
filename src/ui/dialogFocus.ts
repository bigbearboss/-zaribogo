/** Keep keyboard focus within a modal, then return it to the opening control. */
export function focusDialog(dialog: HTMLElement, close: () => void, busy: () => boolean) {
  const trigger = document.activeElement as HTMLElement | null;
  const app = document.getElementById('app');
  if (app) app.inert = true;
  const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(
    'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
  )).filter(element => element.getClientRects().length > 0);
  focusable()[0]?.focus({ preventScroll: true });
  const handleKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && !busy()) {
      event.preventDefault();
      close();
    }
    if (event.key !== 'Tab') return;
    const items = focusable();
    const first = items[0];
    const last = items.at(-1);
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  };
  dialog.addEventListener('keydown', handleKey);
  return () => {
    dialog.removeEventListener('keydown', handleKey);
    if (app) app.inert = false;
    trigger?.focus({ preventScroll: true });
  };
}

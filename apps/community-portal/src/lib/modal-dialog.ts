interface ModalOptions {
  initialFocus: string;
  returnFocus?: HTMLElement | null;
  dismissOnBackdrop?: () => void;
}

/** Native modality supplies background inertness and keyboard focus containment. */
export function modalDialog(node: HTMLDialogElement, options: ModalOptions) {
  const previous = options.returnFocus ?? document.activeElement;
  node.showModal();
  node.querySelector<HTMLElement>(options.initialFocus)?.focus();
  const focusable = () =>
    [
      ...node.querySelectorAll<HTMLElement>(
        'button, input:not([type="hidden"]), select, textarea, a[href], summary, [tabindex]'
      )
    ].filter(
      (element) =>
        element.tabIndex >= 0 &&
        !element.matches(':disabled') &&
        !element.closest('[hidden], [inert]') &&
        element.getClientRects().length > 0
    );
  const wrapFocus = (event: KeyboardEvent) => {
    if (event.key !== 'Tab') return;
    const items = focusable();
    const first = items[0],
      last = items.at(-1);
    if (!first || !last) {
      event.preventDefault();
      node.focus();
      return;
    }
    if (
      event.shiftKey &&
      (document.activeElement === first || document.activeElement === node)
    ) {
      event.preventDefault();
      last.focus();
    } else if (
      !event.shiftKey &&
      (document.activeElement === last || document.activeElement === node)
    ) {
      event.preventDefault();
      first.focus();
    }
  };
  const dismissBackdrop = (event: MouseEvent) => {
    if (!options.dismissOnBackdrop || event.target !== node) return;
    const bounds = node.getBoundingClientRect();
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    )
      options.dismissOnBackdrop();
  };
  node.addEventListener('keydown', wrapFocus);
  node.addEventListener('click', dismissBackdrop);
  return {
    destroy() {
      node.removeEventListener('keydown', wrapFocus);
      node.removeEventListener('click', dismissBackdrop);
      node.close();
      // A replacement modal may mount in the same render (search → record → edit).
      queueMicrotask(() => {
        if (document.querySelector('dialog[open]')) return;
        if (
          previous instanceof HTMLElement &&
          previous.isConnected &&
          !previous.closest('[inert]')
        )
          previous.focus();
        else document.getElementById('main')?.focus();
      });
    }
  };
}

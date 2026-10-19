/** Keep a focused mobile form inside the visual viewport, without changing zoom. */
export function installMobileInputViewport(): () => void {
  const viewport = window.visualViewport;
  if (!viewport) return () => {};

  const mobile = window.matchMedia('(max-width: 1023px), (hover: none) and (pointer: coarse)');
  const root = document.documentElement;
  const excludedTypes = new Set(['hidden', 'checkbox', 'radio', 'range', 'color', 'file', 'button', 'submit', 'reset', 'image']);
  let overlay: HTMLElement | null = null;
  let panel: HTMLElement | null = null;
  let frame = 0;
  let reveal = false;
  let layoutWidth = root.clientWidth;
  let fullHeight = Math.max(window.innerHeight, root.clientHeight, viewport.height);

  const field = (): HTMLElement | null => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || active.matches(':disabled')) return null;
    if (active instanceof HTMLInputElement) return excludedTypes.has(active.type) ? null : active;
    return active.matches('textarea, select, [contenteditable]:not([contenteditable="false"])') ? active : null;
  };
  const clear = () => {
    overlay?.removeAttribute('data-ryyco-keyboard-overlay');
    panel?.removeAttribute('data-ryyco-keyboard-panel');
    overlay = panel = null;
    root.style.removeProperty('--ryyco-visible-height');
    root.style.removeProperty('--ryyco-visible-top');
  };
  const findOverlay = (active: HTMLElement) => {
    for (let parent = active.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      // Full-screen modal shells only; leave inline forms and small fixed controls alone.
      if (style.position === 'fixed' && style.top !== 'auto' && style.bottom !== 'auto' &&
          parent.getBoundingClientRect().width >= root.clientWidth - 48) return parent;
    }
    return null;
  };
  const keepVisible = (active: HTMLElement) => {
    const bounds = active.getBoundingClientRect();
    const top = viewport.offsetTop + 12;
    const bottom = viewport.offsetTop + viewport.height - 12;
    const delta = bounds.top < top ? bounds.top - top
      : bounds.bottom > bottom ? Math.min(bounds.bottom - bottom, bounds.top - top) : 0;
    if (Math.abs(delta) < 1) return;
    // Scroll the form's own container, not every ancestor as scrollIntoView would.
    for (let parent = active.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(parent).overflowY) && parent.scrollHeight > parent.clientHeight) {
        parent.scrollBy({ top: delta, behavior: 'auto' });
        return;
      }
    }
    window.scrollBy({ top: delta, behavior: 'auto' });
  };
  const update = () => {
    frame = 0;
    const shouldReveal = reveal;
    reveal = false;
    const active = field();
    // Pinch zoom is a user action. Never counteract it with resizing or forced scrolling.
    if (active?.closest('[data-ryyco-managed-viewport]') || !mobile.matches || Math.abs(viewport.scale - 1) > 0.02) { clear(); return; }
    const layoutHeight = Math.max(window.innerHeight, root.clientHeight);
    if (root.clientWidth !== layoutWidth) {
      layoutWidth = root.clientWidth;
      fullHeight = layoutHeight;
    }
    fullHeight = Math.max(layoutHeight, viewport.height, active ? fullHeight : 0);
    // Browser toolbars alone must not trigger keyboard layout changes.
    if (!active || fullHeight - viewport.height < 120) { clear(); return; }
    const nextOverlay = findOverlay(active);
    if (nextOverlay !== overlay) {
      clear();
      overlay = nextOverlay;
      overlay?.setAttribute('data-ryyco-keyboard-overlay', '');
    }
    if (overlay) {
      let nextPanel = active;
      while (nextPanel.parentElement && nextPanel.parentElement !== overlay) nextPanel = nextPanel.parentElement;
      if (nextPanel !== panel) {
        panel?.removeAttribute('data-ryyco-keyboard-panel');
        panel = nextPanel;
        panel.setAttribute('data-ryyco-keyboard-panel', '');
      }
      root.style.setProperty('--ryyco-visible-height', `${viewport.height}px`);
      root.style.setProperty('--ryyco-visible-top', `${viewport.offsetTop}px`);
    }
    if (shouldReveal) keepVisible(active);
  };
  const schedule = (showField = false) => {
    reveal ||= showField;
    if (!frame) frame = window.requestAnimationFrame(update);
  };
  const onFocus = () => schedule(true);
  const onResize = () => schedule(true);
  // Let users scroll to read other content while typing; don't drag them back to the field.
  const onScroll = () => schedule();
  document.addEventListener('focusin', onFocus);
  document.addEventListener('focusout', onScroll);
  viewport.addEventListener('resize', onResize);
  viewport.addEventListener('scroll', onScroll);
  window.addEventListener('resize', onResize);
  if (mobile.addEventListener) mobile.addEventListener('change', onResize);
  else mobile.addListener(onResize);
  schedule(true);

  return () => {
    window.cancelAnimationFrame(frame);
    document.removeEventListener('focusin', onFocus);
    document.removeEventListener('focusout', onScroll);
    viewport.removeEventListener('resize', onResize);
    viewport.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onResize);
    if (mobile.removeEventListener) mobile.removeEventListener('change', onResize);
    else mobile.removeListener(onResize);
    clear();
  };
}

// Shared by the full-screen customer portal and its tracking view.
let locks = 0;
let originalOverflow = '';
export function lockBodyScroll(): () => void {
  if (locks++ === 0) {
    originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--locks === 0) document.body.style.overflow = originalOverflow;
  };
}

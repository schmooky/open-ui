/** Treat touch devices as non-desktop so we don't fire phantom hover states. */
export function isDesktop(): boolean {
  if (typeof window === 'undefined') return true;
  const noTouch = !('ontouchstart' in window);
  const noPoints = (navigator.maxTouchPoints ?? 0) === 0;
  return noTouch && noPoints;
}

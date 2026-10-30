/** A phone or tablet: the main input is a finger and nothing can hover. */
export function isTouchDevice(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(hover: none) and (pointer: coarse)').matches
  );
}

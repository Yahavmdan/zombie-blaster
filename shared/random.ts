/** A whole number from `min` to `max`, both included (`min` and `max` are whole numbers). */
export function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

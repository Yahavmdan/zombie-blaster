/** A whole number from `min` to `max`, both included (`min` and `max` are whole numbers). */
export function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/** A number from `min` up to (not including) `max`. */
export function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** `value` scaled by a random factor from 1 - `spread` to 1 + `spread`: never quite the same twice. */
export function vary(value: number, spread: number): number {
  return value * randomBetween(1 - spread, 1 + spread);
}

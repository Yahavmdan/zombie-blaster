import { Page } from '@playwright/test';
import { expect } from './fixtures';
import { E2eSnapshot, E2eZombieView } from './probe';
import { WORLD } from './invariants';

/** Opens the in-game dev tools dialog (dev builds and the /dev page). */
export async function openDevTools(page: Page): Promise<void> {
  await page.getByTestId('game-dev-button-toggle-dialog').click();
  await expect(page.getByTestId('game-dev-button-close-dialog')).toBeVisible();
}

export async function closeDevTools(page: Page): Promise<void> {
  await page.getByTestId('game-dev-button-close-dialog').click();
  await expect(page.getByTestId('game-dev-button-close-dialog')).toBeHidden();
}

/** Page px of a world point: the canvas is stretched to the page per axis. */
export async function pagePoint(
  page: Page,
  x: number,
  y: number,
): Promise<{ x: number; y: number }> {
  const box: { x: number; y: number; width: number; height: number } | null = await page
    .locator('app-game-canvas canvas')
    .boundingBox();
  expect(box, 'game canvas is on screen').not.toBeNull();
  return {
    x: box!.x + (x / WORLD.width) * box!.width,
    y: box!.y + (y / WORLD.height) * box!.height,
  };
}

export function liveZombies(s: E2eSnapshot): number {
  return s.zombies.filter((z: E2eZombieView): boolean => !z.isDead).length;
}

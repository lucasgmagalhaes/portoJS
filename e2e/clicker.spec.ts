import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const START = new Date('2030-01-01T00:00:00Z');
const HOUR = 3_600_000;

/** Opens the game with a controllable clock. Timers and Date.now() are faked. */
async function open(page: Page, at: Date = START): Promise<void> {
  await page.clock.install({ time: at });
  await page.goto('/');
  await expect(page.locator('.gold')).toBeVisible();
}

const gold = (page: Page) => page.locator('.gold');

test('clicking mines gold and unlocks an achievement', async ({ page }) => {
  await open(page);
  await expect(gold(page)).toHaveText('0');
  for (let i = 0; i < 20; i++) await page.locator('#click').click();
  await expect(gold(page)).toHaveText('20');
  await page.clock.runFor(1000); // the achievement check runs every 500 ms of game time
  await expect(page.locator('.achievement.unlocked')).toContainText('First gold');
});

test('generators produce on a fixed timestep driven by the browser clock', async ({ page }) => {
  await open(page);
  for (let i = 0; i < 15; i++) await page.locator('#click').click();
  await page.locator('.row button', { hasText: 'Buy 1' }).first().click(); // a cursor, 0.2/s
  await expect(page.locator('.rate')).toHaveText('0.2 per second');
  await page.clock.runFor(10_000);
  await expect(gold(page)).toHaveText('2'); // 2 gold in 10 s
});

test('a long pause in the page catches up without freezing', async ({ page }) => {
  await open(page);
  for (let i = 0; i < 15; i++) await page.locator('#click').click();
  await page.locator('.row button', { hasText: 'Buy 1' }).first().click();
  // A throttled background tab: one timer firing after a whole hour. The loop simulates a
  // bounded number of steps and credits the dropped time as offline time (cap 8 h at 50%).
  await page.clock.fastForward(HOUR);
  const text = (await gold(page).textContent()) ?? '';
  const value = Number.parseFloat(text.replace(/[^\d.]/g, ''));
  expect(value).toBeGreaterThan(300); // ~360 gold: 0.2/s × 3600 s × 50%
  expect(value).toBeLessThan(400);
});

test('progress is saved and offline time is credited on the next visit', async ({ browser }) => {
  const context = await browser.newContext();
  const first = await context.newPage();
  await open(first);
  for (let i = 0; i < 15; i++) await first.locator('#click').click();
  await first.locator('.row button', { hasText: 'Buy 1' }).first().click();
  await first.clock.runFor(6000); // autosave runs every 5 s
  await first.close();

  // Return 20 hours later: capped at 8 h and credited at 50% => 4 h × 0.2/s = 2880 gold.
  const second = await context.newPage();
  await open(second, new Date(START.getTime() + 20 * HOUR));
  await expect(second.locator('#toast')).toContainText('Welcome back');
  const value = Number.parseFloat(
    ((await gold(second).textContent()) ?? '').replace(/[^\d.]/g, ''),
  );
  expect(value).toBeGreaterThan(2.8);
  expect(value).toBeLessThan(3.0); // displayed as "2.88K"
  await context.close();
});

test('a damaged save is rejected with a clear message and nothing changes', async ({ page }) => {
  await open(page);
  for (let i = 0; i < 5; i++) await page.locator('#click').click();
  await page.locator('textarea').fill('this is definitely not a save');
  await page.getByRole('button', { name: 'Import' }).click();
  await expect(page.locator('#toast')).toContainText('damaged');
  await expect(gold(page)).toHaveText('5');
});

test('export then import round-trips through the UI', async ({ page }) => {
  await open(page);
  for (let i = 0; i < 7; i++) await page.locator('#click').click();
  await page.getByRole('button', { name: 'Export' }).click();
  const exported = await page.locator('textarea').inputValue();
  expect(exported.length).toBeGreaterThan(50);

  for (let i = 0; i < 3; i++) await page.locator('#click').click();
  await expect(gold(page)).toHaveText('10');
  await page.locator('textarea').fill(exported);
  await page.getByRole('button', { name: 'Import' }).click();
  await expect(page.locator('#toast')).toContainText('Save imported');
  await expect(gold(page)).toHaveText('7');
});

import { expect, type Locator, type Page } from '@playwright/test';

let seq = 0;
export const uid = () => `${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function futureDate(days = 60): string {
  const d = new Date(Date.now() + days * 86400000);
  return d.toISOString().slice(0, 10);
}

export async function signUp(page: Page, name = 'QA User') {
  const email = `qa-${uid()}@example.com`;
  await page.goto('/signup');
  await waitHydrated(page.getByLabel('Your name'));
  await page.getByLabel('Your name').fill(name);
  await waitHydrated(page.getByLabel('Email'));
  await page.getByLabel('Email').fill(email);
  await waitHydrated(page.getByLabel('Password'));
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('**/goal/new');
  return email;
}

export async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await page.waitForURL('**/signin');
}

/** Creates a goal via /goal/new (title + target date, then success criteria). Ends on the "created" step. */
export async function createGoal(page: Page, title: string, opts: { criteria?: string; target?: string } = {}) {
  await waitHydrated(page.getByLabel('Your goal'));
  await page.getByLabel('Your goal').fill(title);
  await waitHydrated(page.getByLabel('Target date (optional)'));
  await page.getByLabel('Target date (optional)').fill(opts.target ?? futureDate());
  await page.getByRole('button', { name: 'Create goal' }).click();
  await expect(page.getByRole('form', { name: 'Goal details' })).toBeVisible();
  if (opts.criteria) {
    await page.getByLabel(/How you'll know you've succeeded/).fill(opts.criteria);
    await page.getByRole('button', { name: 'Save and continue' }).click();
  } else {
    await page.getByRole('button', { name: 'Skip for now' }).click();
  }
  await expect(page.getByRole('heading', { name: 'Your goal is created' })).toBeVisible();
}

/** After createGoal: open the matrix and return the goal id from ?goal=. */
export async function openMatrix(page: Page): Promise<string> {
  await page.getByRole('link', { name: 'Open your matrix' }).click();
  await page.waitForURL(/\/matrix\?goal=/);
  return new URL(page.url()).searchParams.get('goal')!;
}

export async function addKeyArea(page: Page, goalId: string, position: number, title: string) {
  await page.goto(`/matrix/${position}?goal=${goalId}`);
  await waitHydrated(page.getByLabel('Key area title'));
  await page.getByLabel('Key area title').fill(title);
  await page.getByRole('button', { name: 'Create key area' }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
}

/** Must be on the key-area page. slot is 1-based. */
export async function addAction(page: Page, slot: number, title: string) {
  await page.getByRole('button', { name: `Add action ${slot} of 8` }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('Title').fill(title);
  await dlg.getByRole('button', { name: 'Add action' }).click();
  await expect(dlg).toBeHidden();
  await expect(page.getByRole('button', { name: new RegExp(`^Edit action ${slot} of 8: ${title}`) })).toBeVisible();
}

export async function activateGoal(page: Page, goalId: string) {
  await page.goto(`/goal?goal=${goalId}`);
  await page.getByRole('button', { name: 'Activate goal' }).click();
  await expect(page.getByRole('button', { name: 'Activate goal' })).toBeHidden();
}

/**
 * Waits until React has hydrated `locator`'s element (React attaches `__reactProps$…` to hydrated DOM
 * nodes). `networkidle` is not enough on WebKit: JS can still be executing after the network is quiet,
 * and text typed before hydration is lost (HYD-01).
 */
export async function waitHydrated(locator: Locator) {
  await locator.waitFor();
  await locator.evaluate(
    (el) =>
      new Promise<void>((resolve) => {
        const ok = () => Object.keys(el).some((k) => k.startsWith('__reactProps$'));
        if (ok()) return resolve();
        const t = setInterval(() => ok() && (clearInterval(t), resolve()), 25);
      }),
  );
}

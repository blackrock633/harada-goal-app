/**
 * Core user journeys against the REAL app (real server, real DB, dev auth). Phone viewport.
 * Fresh unique user per test. Run with a config whose baseURL points at the app under test.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { activateGoal, addAction, addKeyArea, createGoal, openMatrix, signOut, signUp, uid, waitHydrated } from './helpers';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

/** Resolves when the next server action (a Next `next-action` POST) has returned. */
const actionSaved = (page: import('@playwright/test').Page) =>
  page.waitForResponse((r) => r.request().method() === 'POST' && !!r.request().headers()['next-action']);

test.describe('core journeys', () => {
  // After every successful save, runAuthed's revalidatePath('/') makes Next refetch the current route.
  // WebKit's driver reports that soft refresh as a navigation, so a page.goto issued at the same moment
  // fails with "interrupted by another navigation". A user-level probe (save, then immediately tap a tab)
  // landed on the tapped tab 3/3 on WebKit, so this is a harness race, not a user-visible defect.
  // Retry ONLY that error; anything else still fails.
  test.beforeEach(async ({ page }) => {
    const goto = page.goto.bind(page);
    page.goto = async (url, opts) => {
      for (let attempt = 1; ; attempt++) {
        try {
          return await goto(url, opts);
        } catch (e) {
          if (attempt >= 3 || !/interrupted by another navigation/.test(String(e))) throw e;
          await page.waitForLoadState('load');
        }
      }
    };
  });

  test('1. create goal and persist across reload', async ({ page }) => {
    await signUp(page);
    const title = `Run a marathon ${uid()}`;
    const criteria = `Finish under 4h ${uid()}`;
    await createGoal(page, title, { criteria });
    await expect(page.getByText(title)).toBeVisible();
    const id = await openMatrix(page);

    await page.goto(`/goal?goal=${id}`);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(page.getByText(criteria)).toBeVisible();
    await expect(page.getByText('Draft', { exact: true })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(page.getByText(criteria)).toBeVisible();
    // also resolved without ?goal= (focused-goal fallback / goal switcher)
    await page.goto('/goal');
    await expect(page.getByText(title).first()).toBeVisible();
  });

  test('2. matrix: 1 goal + 8 key areas + 64 action positions, add and persist', async ({ page }) => {
    await signUp(page);
    const title = `Matrix goal ${uid()}`;
    await createGoal(page, title);
    const id = await openMatrix(page);

    // Overview: goal tile + 8 key-area tiles (empty ones count).
    await expect(page.getByRole('link', { name: `Goal: ${title}` })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Key area [1-8]: /, includeHidden: false })).toHaveCount(8);
    await expect(page.getByTestId('completeness').getByText('Plan: 0 of 72 positions filled')).toBeVisible();
    await expect(page.getByTestId('completeness').getByText('0 of 8 key areas · 0 of 64 actions')).toBeVisible();

    // 8 action positions per key area (8 x 8 = 64): every key-area page has 8 slots.
    for (let p = 0; p < 8; p++) {
      await page.goto(`/matrix/${p}?goal=${id}`);
      await expect(page.getByRole('heading', { level: 1, name: `Key area ${p + 1} is empty` })).toBeVisible();
    }

    const areas = [`Fitness ${uid()}`, `Career ${uid()}`] as const;
    const actions: Array<[number, number, string]> = [
      [0, 1, `Run 5k ${uid()}`],
      [0, 2, `Stretch ${uid()}`],
      [1, 1, `Update CV ${uid()}`],
    ];
    await addKeyArea(page, id, 0, areas[0]);
    await addKeyArea(page, id, 1, areas[1]);
    for (const p of [0, 1]) {
      await page.goto(`/matrix/${p}?goal=${id}`);
      await expect(page.getByRole('list', { name: `Actions in key area ${p + 1}` }).getByRole('listitem')).toHaveCount(8);
      for (const [ap, slot, t] of actions.filter((a) => a[0] === p)) {
        void ap;
        await addAction(page, slot, t);
      }
    }

    const check = async () => {
      await page.goto(`/matrix?goal=${id}`);
      await expect(page.getByTestId('completeness').getByText('Plan: 5 of 72 positions filled')).toBeVisible();
      await expect(page.getByTestId('completeness').getByText('2 of 8 key areas · 3 of 64 actions')).toBeVisible();
      await expect(page.getByRole('link', { name: new RegExp(`^Key area 1: ${areas[0]}, 2 of 8 actions planned`) })).toBeVisible();
      await expect(page.getByRole('link', { name: new RegExp(`^Key area 2: ${areas[1]}, 1 of 8 actions planned`) })).toBeVisible();
      await expect(page.getByRole('link', { name: /^Key area [3-8]: empty/ })).toHaveCount(6);
    };
    await check();
    await page.reload();
    await check();
    await page.goto(`/matrix/0?goal=${id}`);
    for (const [p, , t] of actions.filter((a) => a[0] === 0)) {
      void p;
      await expect(page.getByRole('button', { name: new RegExp(`^Edit action \\d of 8: ${t}`) })).toBeVisible();
    }
  });

  test('3. today: action appears, complete, persists, reopen', async ({ page }) => {
    await signUp(page);
    await createGoal(page, `Today goal ${uid()}`);
    const id = await openMatrix(page);
    const area = `Area ${uid()}`;
    const act = `Write chapter ${uid()}`;
    await addKeyArea(page, id, 0, area);
    await addAction(page, 1, act);
    await activateGoal(page, id);

    // Pick it for today's focus from the key area.
    await page.goto(`/matrix/0?goal=${id}`);
    await page.getByRole('button', { name: `Add to today: ${act}` }).click();
    await expect(page.getByRole('button', { name: `Remove from today: ${act}` })).toBeVisible();

    await page.goto('/today');
    await expect(page.getByRole('heading', { name: "Today's focus" })).toBeVisible();
    const complete = page.getByRole('button', { name: `Complete: ${act}` });
    await expect(complete).toHaveAttribute('aria-pressed', 'false');
    const completed = actionSaved(page);
    await complete.click();
    await expect(page.getByRole('button', { name: `Reopen: ${act}` })).toHaveAttribute('aria-pressed', 'true');
    await completed; // persistence after a confirmed save; the unconfirmed case is #13 (EXEC-01)

    await page.reload();
    const reopen = page.getByRole('button', { name: `Reopen: ${act}` });
    await expect(reopen).toHaveAttribute('aria-pressed', 'true');
    const reopened = actionSaved(page);
    await reopen.click();
    await expect(page.getByRole('button', { name: `Complete: ${act}` })).toHaveAttribute('aria-pressed', 'false');
    await reopened;
    await page.reload();
    await expect(page.getByRole('button', { name: `Complete: ${act}` })).toHaveAttribute('aria-pressed', 'false');
  });

  test('4. progress semantics: planning vs completion vs attainment', async ({ page }) => {
    await signUp(page);
    await createGoal(page, `Progress goal ${uid()}`);
    const id = await openMatrix(page);
    await addKeyArea(page, id, 0, `A ${uid()}`);
    const titles = [`T1 ${uid()}`, `T2 ${uid()}`, `T3 ${uid()}`];
    for (const [i, t] of titles.entries()) await addAction(page, i + 1, t);
    await activateGoal(page, id);

    // Two of three tasks done (key-area page check circles).
    await page.goto(`/matrix/0?goal=${id}`);
    for (const t of titles.slice(0, 2)) {
      const c = page.getByRole('button', { name: t, exact: true });
      await c.click();
      await expect(c).toHaveAttribute('aria-pressed', 'true');
      await expect(c).toBeEnabled(); // mutation settled
    }

    const verify = async (done: number) => {
      await page.goto(`/goal?goal=${id}`);
      const body = page.locator('main');
      const plan = await page.getByText(/\d+ of \d+ positions filled/).first().innerText();
      const tasks = await page.getByText(/\d+ of \d+ tasks done/).first().innerText();
      const attain = await page.getByText('Not measured yet').innerText();
      test.info().annotations.push({ type: 'evidence #4 goal', description: `plan: "${plan}" | tasks: "${tasks}" | attainment: "${attain}"` });
      await expect(page.getByText('4 of 72 positions filled')).toBeVisible();
      await expect(page.getByText(`${done} of 3 tasks done`)).toBeVisible();
      await expect(page.getByText('Not measured yet')).toBeVisible();
      await expect(page.getByText('Active', { exact: true })).toBeVisible();
      await expect(page.getByText('Achieved', { exact: true })).toHaveCount(0);
      await expect(body).not.toContainText('100%');
      await expect(body).not.toContainText(/Measured attainment/);
    };
    await verify(2);

    // Even with every task done, the goal is NOT attained (no measure recorded).
    await page.goto(`/matrix/0?goal=${id}`);
    const last = page.getByRole('button', { name: titles[2], exact: true });
    await last.click();
    await expect(last).toHaveAttribute('aria-pressed', 'true');
    await expect(last).toBeEnabled();
    await verify(3);

    await page.goto(`/matrix?goal=${id}`);
    test.info().annotations.push({ type: 'evidence #4 matrix', description: (await page.getByTestId('completeness').innerText()).replace(/\n/g, ' | ') });
    await expect(page.getByTestId('completeness')).toContainText('Plan: 4 of 72 positions filled');
    await expect(page.getByTestId('completeness')).toContainText('Actions: 3 of 3 done');
  });

  test('5. two-user isolation', async ({ page }) => {
    await signUp(page);
    const secret = `Secret goal ${uid()}`;
    await createGoal(page, secret);
    const id = await openMatrix(page);
    const area = `SecretArea ${uid()}`;
    await addKeyArea(page, id, 0, area);
    expect(id).toBeTruthy();
    await signOut(page);

    await signUp(page, 'User B');
    for (const path of [`/goal?goal=${id}`, `/matrix?goal=${id}`, `/matrix/0?goal=${id}`, `/review?goal=${id}`]) {
      const resp = await page.goto(path);
      await page.waitForLoadState('networkidle');
      // Positive control: B's page must actually render (an error page would hide nothing and "pass").
      expect(resp?.status(), `${path} must render for B, not error`).toBeLessThan(500);
      await expect(page.getByRole('main')).toBeVisible();
      const text = await page.content();
      expect(text, `${path} (status ${resp?.status()}) leaked goal title`).not.toContain(secret);
      expect(text, `${path} leaked key area title`).not.toContain(area);
      await expect(page.locator('body')).not.toContainText(secret);
    }
    // B has no goals, so a foreign ?goal= falls back to onboarding (/goal/new), which can still be
    // navigating; retry only if this navigation is aborted by that one. The assertion stays strict.
    await expect(async () => { await page.goto('/today'); }).toPass({ timeout: 30_000 });
    await expect(page.locator('body')).not.toContainText(secret);
  });

  test('6. failure recovery: failed save shows error, retry creates exactly one action', async ({ page }) => {
    await signUp(page);
    await createGoal(page, `Fail goal ${uid()}`);
    const id = await openMatrix(page);
    await addKeyArea(page, id, 0, `Area ${uid()}`);
    const act = `Flaky action ${uid()}`;

    let failures = 0;
    await page.route('**/*', async (route) => {
      const req = route.request();
      if (req.method() === 'POST' && req.headers()['next-action'] && failures < 1) {
        failures++;
        return route.abort('failed');
      }
      return route.continue();
    });

    await page.getByRole('button', { name: 'Add action 1 of 8' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('Title').fill(act);
    await dlg.getByRole('button', { name: 'Add action' }).click();
    await expect.poll(() => failures).toBe(1);
    await expect(dlg).toBeVisible(); // not closed = not reported as success
    await expect(dlg.getByRole('alert')).toBeVisible();
    await expect(dlg.getByRole('alert')).toContainText(/went wrong|try again|connection/i);
    await expect(dlg.getByLabel('Title')).toHaveValue(act); // input preserved

    await page.unroute('**/*');
    await dlg.getByRole('button', { name: 'Add action' }).click();
    await expect(dlg).toBeHidden();

    await page.reload();
    await expect(page.getByRole('button', { name: new RegExp(`^Edit action \\d of 8: ${act}`) })).toHaveCount(1);
    await expect(page.getByText(act)).toHaveCount(1);
    await page.goto(`/matrix?goal=${id}`);
    await expect(page.getByTestId('completeness').getByText('1 of 8 key areas · 1 of 64 actions')).toBeVisible();
  });

  test('6b. lost response: server commits but client sees an error; retry must not duplicate', async ({ page }) => {
    // The dangerous half of failure recovery: the write reaches the server and commits, but the
    // response is lost. Only an idempotent create (client-generated id) prevents a duplicate on retry.
    await signUp(page);
    await createGoal(page, `Lost-response goal ${uid()}`);
    const id = await openMatrix(page);
    await addKeyArea(page, id, 0, `Area ${uid()}`);
    const act = `Committed action ${uid()}`;

    let swallowed = 0;
    await page.route('**/*', async (route) => {
      const req = route.request();
      if (req.method() === 'POST' && req.headers()['next-action'] && swallowed < 1) {
        swallowed++;
        await route.fetch(); // let the server process and commit the write
        return route.fulfill({ status: 500, body: 'simulated lost response' });
      }
      return route.continue();
    });

    await page.getByRole('button', { name: 'Add action 1 of 8' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('Title').fill(act);
    await dlg.getByRole('button', { name: 'Add action' }).click();
    await expect.poll(() => swallowed).toBe(1);
    await expect(dlg).toBeVisible(); // the client must not claim success
    await expect(dlg.getByRole('alert')).toBeVisible();

    await page.unroute('**/*');
    await dlg.getByRole('button', { name: 'Add action' }).click();
    await expect(dlg).toBeHidden();

    await page.reload();
    await expect(page.getByText(act)).toHaveCount(1);
    await page.goto(`/matrix?goal=${id}`);
    await expect(page.getByTestId('completeness').getByText('1 of 8 key areas · 1 of 64 actions')).toBeVisible();
  });

  test('7. mobile editing: action editor save control stays in the viewport', async ({ page }) => {
    await signUp(page);
    await createGoal(page, `Edit goal ${uid()}`);
    const id = await openMatrix(page);
    await addKeyArea(page, id, 0, `Area ${uid()}`);
    const before = `Original ${uid()}`;
    const after = `Edited ${uid()}`;
    await addAction(page, 1, before);

    await page.getByRole('button', { name: new RegExp(`^Edit action 1 of 8: ${before}`) }).click();
    const dlg = page.getByRole('dialog');
    const input = dlg.getByLabel('Title');
    await input.fill(after);
    await input.focus();
    // Emulate the on-screen keyboard by shrinking the viewport, then check geometry.
    for (const h of [844, 420]) {
      await page.setViewportSize({ width: 390, height: h });
      await input.focus();
      const save = dlg.getByRole('button', { name: 'Save changes' });
      const vp = page.viewportSize()!;
      // The app scrolls the focused field smoothly; poll until geometry settles (no manual scrolling by the test).
      const within = async (loc: typeof save) => {
        const bb = await loc.boundingBox();
        return !!bb && bb.x >= 0 && bb.y >= 0 && bb.x + bb.width <= vp.width && bb.y + bb.height <= vp.height;
      };
      await expect.poll(() => within(save), { message: `Save changes within ${vp.width}x${vp.height}`, timeout: 5000 }).toBe(true);
      await expect.poll(() => within(input), { message: 'focused title input within viewport', timeout: 5000 }).toBe(true);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await dlg.getByRole('button', { name: 'Save changes' }).click();
    await expect(dlg).toBeHidden();
    await expect(page.getByRole('button', { name: new RegExp(`^Edit action 1 of 8: ${after}`) })).toBeVisible();

    await page.goto(`/goal?goal=${id}`);
    await page.goto(`/matrix/0?goal=${id}`);
    await expect(page.getByRole('button', { name: new RegExp(`^Edit action 1 of 8: ${after}`) })).toBeVisible();
    await expect(page.getByText(before)).toHaveCount(0);
  });

  test('8. auth: redirect, sign up, sign out, redirect again', async ({ page }) => {
    await page.goto('/today');
    await page.waitForURL('**/signin**');
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();

    await signUp(page);
    const title = `Auth goal ${uid()}`;
    await createGoal(page, title);
    await page.goto('/today');
    await expect(page).toHaveURL(/\/today$/);
    await expect(page.locator('main, body').first()).toBeVisible();
    await page.goto('/goal');
    await expect(page.getByText(title).first()).toBeVisible();

    await signOut(page);
    await page.goto('/today');
    await page.waitForURL('**/signin**');
    await expect(page.locator('body')).not.toContainText(title);
    await page.goto('/goal');
    await page.waitForURL('**/signin**');
    await expect(page.locator('body')).not.toContainText(title);
  });
  test('9. session ends mid-edit: save is refused honestly, input kept, nothing written', async ({ page, context }) => {
    // Dev auth has no cookie expiry (Supabase owns real expiry); losing the session cookie mid-edit is the
    // closest local stand-in for an expired or revoked session.
    const email = await signUp(page);
    await createGoal(page, `Expiry goal ${uid()}`);
    const id = await openMatrix(page);
    await addKeyArea(page, id, 0, `Area ${uid()}`);
    const act = `Unsaved action ${uid()}`;

    await page.getByRole('button', { name: 'Add action 1 of 8' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('Title').fill(act);
    await context.clearCookies({ name: 'harada_dev_session' });
    await dlg.getByRole('button', { name: 'Add action' }).click();

    // Contract (runAuthed → UNAUTHENTICATED, no redirect, so unsaved input survives):
    // honest error in place, input kept, no navigation, nothing written.
    const urlBefore = page.url();
    const alert = dlg.getByRole('alert');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/session has ended/i);
    await expect(alert).toContainText(/nothing was saved/i);
    await expect(dlg.getByLabel('Title')).toHaveValue(act);
    expect(page.url()).toBe(urlBefore);
    await page.goto(`/matrix/0?goal=${id}`);
    await expect(page).toHaveURL(/\/signin/);

    // Nothing was written: sign back in as the same user and look for the action.
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill('correct-horse-battery');
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL((u) => !u.pathname.startsWith('/signin'));
    await page.goto(`/matrix/0?goal=${id}`);
    await expect(page.getByRole('button', { name: 'Add action 1 of 8' })).toBeVisible();
    await expect(page.getByText(act)).toHaveCount(0);
  });

  test('10. forged session cookie (valid user id, bad signature) is not accepted', async ({ page, context, baseURL }) => {
    await signUp(page);
    const secret = `Forgery target ${uid()}`;
    await createGoal(page, secret);
    const cookie = (await context.cookies()).find((c) => c.name === 'harada_dev_session');
    expect(cookie, 'dev session cookie present').toBeTruthy();
    const [userId] = cookie!.value.split('.');
    await context.clearCookies();
    // Same user id, signature that was never issued by the server.
    await context.addCookies([{ name: 'harada_dev_session', value: `${userId}.${'0'.repeat(64)}`, url: baseURL! }]);
    for (const path of ['/today', '/goal', '/matrix']) {
      await page.goto(path);
      await expect(page, `${path} must not open with a forged cookie`).toHaveURL(/\/signin/);
      await expect(page.locator('body')).not.toContainText(secret);
    }
  });
  test('11. text typed before hydration is saved, not wiped (slow phone / slow network)', async ({ page, context }) => {
    await signUp(page);
    await createGoal(page, `Hydration goal ${uid()}`);
    const id = await openMatrix(page);

    // A second tab in the same session, with the app's JS held back so the user can type into the
    // server-rendered form before React hydrates it.
    const slow = await context.newPage();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await slow.route('**/_next/static/chunks/**', async (route) => { await gate; await route.continue(); });
    await slow.goto(`/matrix/0?goal=${id}`, { waitUntil: 'domcontentloaded' });
    const title = `Typed early ${uid()}`;
    await slow.getByLabel('Key area title').fill(title);
    release();
    await waitHydrated(slow.getByRole('button', { name: 'Create key area' }));
    // The DOM keeps showing the text either way; what matters is whether React captured it.
    await slow.getByRole('button', { name: 'Create key area' }).click();
    await expect(slow.getByRole('heading', { level: 1, name: title }), 'text typed before hydration must be saved').toBeVisible();
    await slow.close();
  });
  test('12. accessibility: no serious/critical axe violations on the real screens with real data', async ({ page }) => {
    await signUp(page);
    await createGoal(page, `A11y goal ${uid()}`, { criteria: 'Finish a half marathon under 2 hours' });
    const id = await openMatrix(page);
    await addKeyArea(page, id, 0, `Endurance ${uid()}`);
    await addAction(page, 1, `Run 5k ${uid()}`);
    await activateGoal(page, id);

    const screens = ['/today', `/goal?goal=${id}`, `/matrix?goal=${id}`, `/matrix/0?goal=${id}`, `/review?goal=${id}`, '/settings'];
    const report: string[] = [];
    for (const path of screens) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      for (const v of violations) {
        report.push(`${path} ${v.impact} ${v.id} ×${v.nodes.length}: ${v.nodes[0]?.target.join(' ')}`);
      }
    }
    test.info().annotations.push({ type: 'axe (all impacts)', description: report.join('\n') || 'none' });
    const blocking = report.filter((r) => / (serious|critical) /.test(r));
    expect(blocking, blocking.join('\n')).toEqual([]);
  });
  test('13. completing then immediately reloading does not silently lose the completion', async ({ page }) => {
    // EXEC-01: the toggle is optimistic. If the page unloads before the server action lands, the UI has
    // already shown "done". The write must still persist, or the user must be warned (e.g. beforeunload
    // while writes are pending). Silent loss after showing success is the defect.
    await signUp(page);
    await createGoal(page, `Unload goal ${uid()}`);
    const id = await openMatrix(page);
    const act = `Quick tap ${uid()}`;
    await addKeyArea(page, id, 0, `Area ${uid()}`);
    await addAction(page, 1, act);
    await activateGoal(page, id);
    await page.goto(`/matrix/0?goal=${id}`);
    await page.getByRole('button', { name: `Add to today: ${act}` }).click();
    await expect(page.getByRole('button', { name: `Remove from today: ${act}` })).toBeVisible();
    await page.goto('/today');

    let warned = false;
    page.on('dialog', async (d) => { warned = d.type() === 'beforeunload'; await d.accept(); });
    await page.getByRole('button', { name: `Complete: ${act}` }).click();
    await expect(page.getByRole('button', { name: `Reopen: ${act}` })).toBeVisible(); // UI claims success
    await page.reload();
    if (!warned) {
      await expect(page.getByRole('button', { name: `Reopen: ${act}` }), 'shown as done, so it must have been saved').toHaveAttribute('aria-pressed', 'true');
    }
  });
});

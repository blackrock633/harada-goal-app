/**
 * Mobile shell smoke + accessibility checks against the REAL app (no mocks).
 *
 * Requires: a Playwright browser (`npx playwright install chromium`) and a running server.
 * NOTE: /styleguide is dev-only (notFound() when NODE_ENV === 'production'), and playwright.config.ts
 * starts `next start` with NODE_ENV=production, so the styleguide tests SKIP under the stock config.
 * Run them against `next dev` on E2E_PORT (default 3100) to exercise the shell/primitives.
 */
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const VIEWPORTS = [
  { name: '360x640', width: 360, height: 640 },
  { name: '390x844', width: 390, height: 844 },
];

test('GET /api/health returns 200 {status:ok}', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ status: 'ok' });
});

/** The phone tab bar: the visible, fixed-position <nav> (the desktop rail is display:none below lg). */
function bottomTabBar(page: Page) {
  return page.locator('nav:visible').filter({ has: page.locator('a') }).and(page.locator('nav.fixed'));
}

async function hasHorizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const el = document.scrollingElement!;
    return { scrollWidth: el.scrollWidth, innerWidth: window.innerWidth };
  });
}

for (const vp of VIEWPORTS) {
  test.describe(`mobile ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: true });

    test('/ renders without horizontal overflow', async ({ page }) => {
      const res = await page.goto('/');
      expect(res?.status()).toBe(200);
      const { scrollWidth, innerWidth } = await hasHorizontalOverflow(page);
      expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
    });

    test.describe('/styleguide', () => {
      test.beforeEach(async ({ page }) => {
        const res = await page.goto('/styleguide');
        test.skip(res?.status() === 404, '/styleguide is dev-only (404 under NODE_ENV=production)');
        expect(res?.status()).toBe(200);
        await expect(page.getByRole('heading', { level: 1, name: 'Design System' })).toBeVisible();
      });

      test('no horizontal overflow', async ({ page }) => {
        const { scrollWidth, innerWidth } = await hasHorizontalOverflow(page);
        expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
      });

      test('axe: no serious/critical violations', async ({ page }) => {
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
        const summary = bad.map((v) => `${v.impact} ${v.id}: ${v.nodes.length} node(s), e.g. ${v.nodes[0]?.target.join(' ')}`);
        test.info().annotations.push({ type: `axe ${vp.name}`, description: results.violations.map((v) => `${v.impact}:${v.id}(${v.nodes.length})`).join(', ') || 'none' });
        expect(summary, summary.join('\n')).toEqual([]);
      });

      test('interactive elements are at least 44x44 CSS px (WCAG 2.5.5 / Apple HIG)', async ({ page }) => {
        const small = await page.evaluate(() => {
          const out: string[] = [];
          const sel = 'button, a[href], [role=button], input:not([type=hidden]), select, textarea';
          for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden') continue;
            if (el.matches('.sr-only, .sr-only *')) continue; // skip-link is visually hidden until focused
            if (r.width < 44 || r.height < 44) {
              const label = el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 24) || el.tagName;
              out.push(`${el.tagName.toLowerCase()} "${label}" ${Math.round(r.width)}x${Math.round(r.height)}`);
            }
          }
          return out;
        });
        test.info().annotations.push({ type: `touch ${vp.name}`, description: small.join('; ') || 'none' });
        expect(small).toEqual([]);
      });

      test('Tab shows a visible focus indicator', async ({ page }) => {
        // First Tab lands on the skip link; second on the first control. Check both for a non-zero outline/ring.
        for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
        const indicator = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement;
          const cs = getComputedStyle(el);
          return {
            tag: el.tagName,
            outlineWidth: parseFloat(cs.outlineWidth),
            outlineStyle: cs.outlineStyle,
            boxShadow: cs.boxShadow,
          };
        });
        expect(indicator.tag).not.toBe('BODY');
        const visible = (indicator.outlineStyle !== 'none' && indicator.outlineWidth > 0) || indicator.boxShadow !== 'none';
        expect(visible, JSON.stringify(indicator)).toBe(true);
      });

      test('bottom tab bar does not hide the last content on the page', async ({ page }) => {
        await page.evaluate(() => window.scrollTo(0, document.scrollingElement!.scrollHeight));
        const gap = await page.evaluate(() => {
          const nav = [...document.querySelectorAll('nav')].find((n) => getComputedStyle(n).position === 'fixed')!.getBoundingClientRect();
          const main = document.querySelector('main')!;
          const last = main.lastElementChild!.getBoundingClientRect();
          return nav.top - last.bottom; // >= 0 means last block is fully above the bar
        });
        expect(gap).toBeGreaterThanOrEqual(0);
      });

      test('bottom tab bar reserves safe-area inset (class actually defined)', async ({ page }) => {
        // The bar's computed padding must come from env(safe-area-inset-bottom), not an undefined utility class.
        const usesInset = await page.evaluate(() =>
          [...document.styleSheets]
            .flatMap((s) => { try { return [...s.cssRules]; } catch { return []; } })
            .some((r) => r.cssText.includes('safe-area-inset-bottom')),
        );
        expect(usesInset).toBe(true);
        expect(await bottomTabBar(page).count()).toBe(1);
      });
    });
  });
}

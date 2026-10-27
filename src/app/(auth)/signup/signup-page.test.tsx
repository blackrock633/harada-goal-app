// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/app/actions/auth', () => ({ signUpAction: async () => ({}), signInAction: async () => ({}) }));

import SignUpPage from './page';

async function renderWith(params: Record<string, string>) {
  return render(await SignUpPage({ searchParams: Promise.resolve(params) }));
}

describe('/signup referral and next capture', () => {
  afterEach(() => cleanup());

  it('carries a valid ?ref and a safe ?next as hidden fields', async () => {
    const { container } = await renderWith({ ref: 'abcdef0123', next: '/pricing' });
    expect(container.querySelector<HTMLInputElement>('input[name="ref"]')!.value).toBe('abcdef0123');
    expect(container.querySelector<HTMLInputElement>('input[name="next"]')!.value).toBe('/pricing');
  });

  it('drops an invalid ref and an unsafe next', async () => {
    const { container } = await renderWith({ ref: '"><script>', next: '//evil.example' });
    expect(container.querySelector('input[name="ref"]')).toBeNull();
    expect(container.querySelector('input[name="next"]')).toBeNull();
  });
});

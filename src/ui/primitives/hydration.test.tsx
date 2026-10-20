// @vitest-environment jsdom
import React from 'react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { act } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Input, Textarea } from './Input';

// HYD-01: text typed into a server-rendered field before hydration must not be lost.
function Harness({ Control }: { Control: 'input' | 'textarea' }) {
  const [value, setValue] = React.useState('');
  const C = Control === 'input' ? Input : Textarea;
  return (
    <div>
      <C aria-label="field" value={value} onChange={(e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => setValue(e.target.value)} />
      <output data-testid="state">{value}</output>
    </div>
  );
}

let container: HTMLDivElement | null = null;
afterEach(() => {
  container?.remove();
  container = null;
});

async function hydrateAfterTyping(Control: 'input' | 'textarea', typed: string) {
  container = document.createElement('div');
  container.innerHTML = renderToString(<Harness Control={Control} />);
  document.body.appendChild(container);
  const field = container.querySelector(Control) as HTMLInputElement | HTMLTextAreaElement;
  field.value = typed; // the user types before JS has loaded
  await act(async () => {
    hydrateRoot(container!, <Harness Control={Control} />);
  });
  return {
    field: container.querySelector(Control) as HTMLInputElement | HTMLTextAreaElement,
    state: container.querySelector('[data-testid="state"]')!.textContent,
  };
}

describe('pre-hydration typing (HYD-01)', () => {
  it('Input adopts text typed before hydration', async () => {
    const { field, state } = await hydrateAfterTyping('input', 'Fitness');
    expect(state).toBe('Fitness');
    expect(field.value).toBe('Fitness');
  });

  it('Textarea adopts text typed before hydration', async () => {
    const { field, state } = await hydrateAfterTyping('textarea', 'Run three times a week');
    expect(state).toBe('Run three times a week');
    expect(field.value).toBe('Run three times a week');
  });

  it('does nothing when nothing was typed', async () => {
    const { state } = await hydrateAfterTyping('input', '');
    expect(state).toBe('');
  });
});

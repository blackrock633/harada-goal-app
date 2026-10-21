import { render, screen } from '@testing-library/react-native';

import { Text } from '@/ui';

describe('Text', () => {
  it('renders children', async () => {
    await render(<Text>Hello</Text>);
    expect(screen.getByText('Hello')).toBeOnTheScreen();
  });

  it.each(['display', 'title', 'heading'] as const)('%s is a header', async (variant) => {
    await render(<Text variant={variant}>Heading</Text>);
    expect(screen.getByRole('header')).toBeOnTheScreen();
  });

  it('body and meta are not headers and are never below 12pt', async () => {
    await render(
      <>
        <Text variant="body">Body</Text>
        <Text variant="meta">Meta</Text>
      </>,
    );
    expect(screen.queryByRole('header')).toBeNull();
    for (const label of ['Body', 'Meta']) {
      const style = screen.getByText(label).props.style.flat?.() ?? screen.getByText(label).props.style;
      const flat = Object.assign({}, ...[style].flat(Infinity));
      expect(flat.fontSize).toBeGreaterThanOrEqual(12);
    }
  });

  it('does not disable font scaling', async () => {
    await render(<Text>Scales</Text>);
    expect(screen.getByText('Scales').props.allowFontScaling).not.toBe(false);
  });
});

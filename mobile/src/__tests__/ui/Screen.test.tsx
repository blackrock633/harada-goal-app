import { render, screen, within } from '@testing-library/react-native';
import { Text as RNText } from 'react-native';

import { Screen } from '@/ui';

describe('Screen', () => {
  it('renders children in a scroll view that persists taps', async () => {
    await render(
      <Screen>
        <RNText>Body</RNText>
      </Screen>,
    );
    const scroll = screen.getByTestId('screen-scroll');
    expect(within(scroll).getByText('Body')).toBeOnTheScreen();
    expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
  });

  it('pins the footer outside the scroll view so it stays above the keyboard', async () => {
    await render(
      <Screen footer={<RNText>Save</RNText>}>
        <RNText>Body</RNText>
      </Screen>,
    );
    expect(screen.getByText('Save')).toBeOnTheScreen();
    expect(within(screen.getByTestId('screen-scroll')).queryByText('Save')).toBeNull();
  });

  it('offers pull-to-refresh only when onRefresh is given', async () => {
    const onRefresh = jest.fn();
    const view = await render(
      <Screen onRefresh={onRefresh} refreshing>
        <RNText>content</RNText>
      </Screen>,
    );
    const control = screen.getByTestId('screen-scroll').props.refreshControl;
    expect(control.props.refreshing).toBe(true);
    control.props.onRefresh();
    expect(onRefresh).toHaveBeenCalledTimes(1);
    await view.rerender(
      <Screen>
        <RNText>content</RNText>
      </Screen>,
    );
    expect(screen.getByTestId('screen-scroll').props.refreshControl).toBeUndefined();
  });
});

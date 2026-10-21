import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text as RNText } from 'react-native';

import { Sheet } from '@/ui';

describe('Sheet', () => {
  it('shows an accessible title and content when visible', async () => {
    await render(
      <Sheet visible onClose={() => {}} title="Edit action" footer={<RNText>Save</RNText>}>
        <RNText>Fields</RNText>
      </Sheet>,
    );
    expect(screen.getByRole('header')).toHaveTextContent('Edit action');
    expect(screen.getByLabelText('Edit action')).toBeOnTheScreen();
    expect(screen.getByText('Fields')).toBeOnTheScreen();
    expect(screen.getByText('Save')).toBeOnTheScreen();
  });

  it('renders nothing when hidden', async () => {
    await render(
      <Sheet visible={false} onClose={() => {}} title="Edit action">
        <RNText>Fields</RNText>
      </Sheet>,
    );
    expect(screen.queryByText('Fields')).toBeNull();
  });

  it('closes via Close, backdrop and the system back/Escape request', async () => {
    const onClose = jest.fn();
    await render(
      <Sheet visible onClose={onClose} title="Edit action">
        <RNText>Fields</RNText>
      </Sheet>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Dismiss', includeHiddenElements: true }));
    screen.getByTestId('sheet-modal').props.onRequestClose();
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});

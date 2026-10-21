import { renderRouter, screen, testRouter } from 'expo-router/testing-library';

const APP = './src/app';

describe('app routes', () => {
  it.each([
    ['/today', 'Nothing for today yet'],
    ['/goal', 'No goal yet'],
    ['/matrix', 'The matrix is empty'],
    ['/review', 'Nothing to review yet'],
  ])('renders %s', async (url, copy) => {
    await renderRouter(APP, { initialUrl: url });
    expect(screen).toHavePathname(url);
    expect(screen.getByText(copy)).toBeOnTheScreen();
    expect(screen.getAllByRole('button', { name: 'Account menu' }).length).toBeGreaterThan(0);
  });

  it('redirects / to Today', async () => {
    await renderRouter(APP, { initialUrl: '/' });
    expect(screen).toHavePathname('/today');
  });

  it('renders the four tabs in order', async () => {
    const { getRouterState } = await renderRouter(APP, { initialUrl: '/today' });
    // Native tabs are rendered by the platform; verify the layout registers all four routes in order.
    const root = getRouterState()?.routes[0]?.state;
    const tabs = root?.routes.find((r: { name: string }) => r.name === '(tabs)')?.state;
    expect(tabs?.routeNames).toEqual(['today', 'goal', 'matrix', 'review']);
  });

  it('renders the auth screens with the real form layout', async () => {
    await renderRouter(APP, { initialUrl: '/signin' });
    expect(screen.getByLabelText('Email')).toBeOnTheScreen();
    expect(screen.getByLabelText('Password')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeOnTheScreen();
    await testRouter.push('/signup');
    expect(screen).toHavePathname('/signup');
    expect(screen.getByRole('button', { name: 'Create account' })).toBeOnTheScreen();
  });

  it('opens a key-area detail route', async () => {
    await renderRouter(APP, { initialUrl: '/matrix/3' });
    expect(screen).toHavePathname('/matrix/3');
    expect(screen.getByText('No key area yet')).toBeOnTheScreen();
  });

  it('rejects an out-of-range key area', async () => {
    await renderRouter(APP, { initialUrl: '/matrix/9' });
    expect(screen.getByText('Key area not found')).toBeOnTheScreen();
  });

  it('opens settings from the account menu with a Sign out button', async () => {
    await renderRouter(APP, { initialUrl: '/today' });
    await testRouter.push('/settings');
    expect(screen).toHavePathname('/settings');
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeOnTheScreen();
  });
});

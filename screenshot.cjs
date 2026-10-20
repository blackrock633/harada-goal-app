const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch();
  const contextLight = await browser.newContext({
    colorScheme: 'light',
    viewport: { width: 1280, height: 1024 }
  });
  const pageLight = await contextLight.newPage();
  await pageLight.goto('http://localhost:3001/styleguide', { waitUntil: 'networkidle' });
  await pageLight.screenshot({ path: '/Users/noahdockery/.gemini/antigravity/brain/6aedcf5a-e57e-4e5d-83ff-5f2441a61547/scratch/desktop-light.png', fullPage: true });

  const contextDark = await browser.newContext({
    colorScheme: 'dark',
    viewport: { width: 1280, height: 1024 }
  });
  const pageDark = await contextDark.newPage();
  await pageDark.goto('http://localhost:3001/styleguide', { waitUntil: 'networkidle' });
  await pageDark.screenshot({ path: '/Users/noahdockery/.gemini/antigravity/brain/6aedcf5a-e57e-4e5d-83ff-5f2441a61547/scratch/desktop-dark.png', fullPage: true });

  const contextMobileLight = await browser.newContext({
    colorScheme: 'light',
    viewport: { width: 375, height: 812 }
  });
  const pageMobileLight = await contextMobileLight.newPage();
  await pageMobileLight.goto('http://localhost:3001/styleguide', { waitUntil: 'networkidle' });
  await pageMobileLight.screenshot({ path: '/Users/noahdockery/.gemini/antigravity/brain/6aedcf5a-e57e-4e5d-83ff-5f2441a61547/scratch/mobile-light.png', fullPage: true });

  await browser.close();
})();

import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import fs from 'node:fs/promises';
import { startTestGateway, TEST_ACCESS_KEY } from './gateway-fixture.mjs';

// These fixtures exercise real canvas pixels, not stored or canned results.
async function photo(page: Page, color = '#28aa32', patch?: string, format = 'image/png') {
  const image = await page.evaluate(
    ({ color, patch, format }) => {
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 100;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 200, 100);
      if (patch === 'transparent') ctx.clearRect(0, 0, 2, 100);
      else if (patch) {
        ctx.fillStyle = patch;
        ctx.fillRect(0, 0, 2, 100);
      }
      return canvas.toDataURL(format).split(',')[1];
    },
    { color, patch, format },
  );
  return Buffer.from(image, 'base64');
}
async function upload(page: Page, buffer: Buffer) {
  await page.getByRole('button', { name: 'New scan', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('tab', { name: 'Upload a photo', exact: true }).click();
  await dialog
    .getByLabel('Choose leaf photo', { exact: true })
    .setInputFiles({ name: 'real-pixels.png', mimeType: 'image/png', buffer });
  await dialog.getByRole('button', { name: 'Screen this leaf' }).click();
  await expect(dialog.getByText('Uploaded leaf photo', { exact: true })).toBeVisible();
  return page.evaluate(() => JSON.parse(localStorage.getItem('smartfarm-scans') || '[]')[0]);
}
const done = (page: Page) =>
  page.getByRole('dialog').getByRole('button', { name: 'All done', exact: true }).click();
async function settings(page: Page) {
  // The panel button also works when the mobile sidebar is closed.
  await page.getByRole('button', { name: 'Camera settings', exact: true }).click();
  return page.getByRole('dialog');
}

test('starts empty, screens an actual photo, updates the dashboard, exports, and persists', async ({
  page,
}) => {
  const errors: string[] = [],
    apiCalls: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.url().includes('/api/camera/')) apiCalls.push(request.url());
  });
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Farm overview', exact: true })).toBeVisible();
  const values = page.locator('.stat-card .stat-value');
  await expect(values.nth(0)).toHaveText('Offline');
  await expect(values.nth(1)).toHaveText('—');
  await expect(values.nth(2)).toHaveText('00scans');
  await expect(values.nth(3)).toHaveText('—');
  await expect(page.getByRole('button', { name: 'Export report', exact: true })).toBeDisabled();
  await expect(page.locator('.camera-image')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Demo mode', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'New scan', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Upload a photo', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page
    .getByLabel('Choose leaf photo', { exact: true })
    .setInputFiles({ name: 'green.png', mimeType: 'image/png', buffer: await photo(page) });
  // Two synchronous clicks must not create duplicate scans.
  await page.getByRole('button', { name: 'Screen this leaf', exact: true }).evaluate((button) => {
    button.click();
    button.click();
  });
  await expect(page.getByText('Uploaded leaf photo', { exact: true })).toBeVisible();
  const scan = await page.evaluate(
    () => JSON.parse(localStorage.getItem('smartfarm-scans') || '[]')[0],
  );
  expect(scan).toMatchObject({
    source: 'upload',
    method: 'single-frame',
    cls: 1,
    green: 100,
    yellow: 0,
    brown: 0,
  });
  expect(scan.image).toMatch(/^data:image\/jpeg;base64,/);
  const download = page.waitForEvent('download');
  await page.getByRole('dialog').getByRole('button', { name: 'Export scan', exact: true }).click();
  const csv = await download;
  expect(csv.suggestedFilename()).toMatch(/\.csv$/);
  const report = await fs.readFile((await csv.path())!, 'utf8');
  expect(report).toContain('"Healthy","100","0","0","upload"');
  expect(report).toContain('single-frame HSV');
  await done(page);
  await expect(values.nth(0)).toHaveText('Offline');
  await expect(values.nth(1)).toHaveText('Healthy');
  await expect(values.nth(3)).toHaveText('100.0%');
  await expect(page.locator('.feed-badge')).toHaveText('UPLOADED PHOTO');
  await expect(page.locator('.screening-label')).toHaveText('Photo');
  await page.reload();
  await expect(values.nth(3)).toHaveText('100.0%');
  await page.getByRole('button', { name: 'Scan history', exact: true }).click();
  await expect(page.locator('.scans-table tbody tr')).toHaveCount(1);
  await page.getByLabel('Filter by condition').selectOption('2');
  await expect(page.getByRole('button', { name: 'Clear filters', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(page.locator('.scans-table tbody tr')).toHaveCount(1);
  expect(apiCalls).toEqual([]);
  expect(errors).toEqual([]);
});

for (const [name, color, patch, cls, green, yellow, brown] of [
  ['yellow', '#dcc828', undefined, 2, 0, 100, 0],
  ['brown', '#784b1e', undefined, 3, 0, 0, 100],
  ['background', '#dddddd', undefined, 0, 0, 0, 0],
  ['dark specks', '#28aa32', '#0a0a0a', 4, 100, 0, 0],
  ['transparency is not damage', '#28aa32', 'transparent', 1, 100, 0, 0],
] as const) {
  test(`genuine pixel analysis: ${name}`, async ({ page }) => {
    await page.goto('./');
    const scan = await upload(page, await photo(page, color, patch));
    expect(scan).toMatchObject({ source: 'upload', cls, green, yellow, brown });
    await done(page);
    await expect(page.locator('.stat-card .stat-value').first()).toHaveText('Offline');
    await expect(page.locator('.screening-label')).toHaveText('Photo');
  });
}

test('rejects invalid images and oversized files without inventing a result', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'New scan', exact: true }).click();
  const input = page.getByLabel('Choose leaf photo', { exact: true });
  await input.setInputFiles({
    name: 'not-a-photo.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not an image'),
  });
  await expect(page.getByRole('alert')).toContainText('JPG, PNG, or WebP');
  await input.setInputFiles({
    name: 'too-large.png',
    mimeType: 'image/png',
    buffer: Buffer.alloc(12 * 1024 * 1024 + 1),
  });
  await expect(page.getByRole('alert')).toContainText('12 MB');
  await input.setInputFiles({
    name: 'corrupt.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not a PNG'),
  });
  await page.getByRole('button', { name: 'Screen this leaf', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('couldn’t read');
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('smartfarm-scans') || '[]')),
  ).toHaveLength(0);
  await page.getByRole('button', { name: 'Remove selected photo', exact: true }).click();
  await input.setInputFiles({
    name: 'valid.png',
    mimeType: 'image/png',
    buffer: await photo(page),
  });
  await page.getByRole('button', { name: 'Screen this leaf', exact: true }).click();
  await expect(page.getByText('Uploaded leaf photo', { exact: true })).toBeVisible();
});

test('migrates automatically enabled demo settings but preserves real saved work', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'smartfarm-preferences',
      JSON.stringify({
        mode: 'demo',
        host: '192.168.4.3',
        location: 'North greenhouse',
        name: 'ESP32-CAM',
      }),
    );
    localStorage.setItem(
      'smartfarm-scans',
      JSON.stringify([
        {
          id: 'old-demo',
          source: 'demo',
          cls: 1,
          green: 92.4,
          yellow: 5.2,
          brown: 2.4,
          timestamp: new Date().toISOString(),
        },
        {
          id: 'real-upload',
          source: 'upload',
          cls: 2,
          green: 60,
          yellow: 40,
          brown: 0,
          timestamp: new Date().toISOString(),
        },
      ]),
    );
  });
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Demo mode', exact: true })).toHaveCount(0);
  await expect(page.locator('.stat-card .stat-value').nth(0)).toHaveText('Offline');
  await expect(page.locator('.stat-card .stat-value').nth(1)).toHaveText('Yellowing');
  await expect(page.locator('.scans-table tbody tr')).toHaveCount(1);
});

test('demo is explicit, labelled, and ends when a real photo is screened', async ({ page }) => {
  await page.goto('./');
  const dialog = await settings(page);
  await dialog.getByRole('radio', { name: 'Demo workspace Explore with sample data' }).click();
  await dialog.getByRole('button', { name: 'Save workspace', exact: true }).click();
  await expect(page.locator('.stat-card .stat-value').nth(0)).toHaveText('Demo');
  await expect(page.getByRole('button', { name: 'Demo mode', exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('smartfarm-preferences') || '{}').demoOptIn,
    ),
  ).toBe(true);
  await page.getByRole('button', { name: 'Capture', exact: true }).click();
  await expect(page.getByText('Demo scan · sample data', { exact: true })).toBeVisible();
  await done(page);
  const scan = await upload(page, await photo(page, '#dcc828'));
  expect(scan.cls).toBe(2);
  await done(page);
  await expect(page.getByRole('button', { name: 'Demo mode', exact: true })).toHaveCount(0);
  await expect(page.locator('.stat-card .stat-value').nth(1)).toHaveText('Yellowing');
  await expect(page.locator('.scans-table tbody tr')).toHaveCount(1);
});

test('keeps screening and exporting usable when browser storage is unavailable', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem() {
          throw new Error('Storage unavailable.');
        },
        setItem() {
          throw new Error('Storage unavailable.');
        },
      },
    });
  });
  await page.goto('./');
  await page.getByRole('button', { name: 'New scan', exact: true }).click();
  await page
    .getByLabel('Choose leaf photo', { exact: true })
    .setInputFiles({ name: 'leaf.png', mimeType: 'image/png', buffer: await photo(page) });
  await page.getByRole('button', { name: 'Screen this leaf', exact: true }).click();
  await expect(page.getByText('Uploaded leaf photo', { exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Export your results');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export scan', exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/\.csv$/);
  await done(page);
  await expect(page.locator('.stat-card .stat-value').nth(3)).toHaveText('100.0%');
  expect(errors).toEqual([]);
});

test.describe('HTTPS gateway with a simulated upstream ESP32', () => {
  test.use({ ignoreHTTPSErrors: true }); // Disposable fixture certificate ONLY.

  test('actual gateway integration: auth, CORS, video, pause, capture, offline recovery, and disconnect', async ({
    page,
    baseURL,
  }) => {
    test.skip(
      new URL(baseURL!).protocol === 'https:',
      'Run the private software gateway fixture against a locally served website.',
    );
    const errors: string[] = [],
      urls: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => urls.push(request.url()));
    await page.goto('./');
    const jpeg = await photo(page, '#28aa32', undefined, 'image/jpeg');
    const gateway = await startTestGateway(jpeg, new URL(baseURL!).origin);
    try {
      let dialog = await settings(page);
      await dialog.getByLabel('Camera IP address', { exact: true }).fill('8.8.8.8');
      await dialog.getByRole('button', { name: 'Connect camera', exact: true }).click();
      await expect(dialog.getByRole('alert')).toContainText('private');
      await dialog.getByLabel('Camera IP address', { exact: true }).fill('192.168.4.9');
      await dialog.getByLabel('HTTPS gateway URL', { exact: true }).fill(gateway.url);
      await dialog.getByLabel('Gateway access key', { exact: true }).fill('wrong');
      await dialog.getByRole('button', { name: 'Connect camera', exact: true }).click();
      await expect(dialog.getByRole('alert')).toContainText('access key');
      expect(gateway.state.calls.status).toBe(0);
      await dialog.getByLabel('Gateway access key', { exact: true }).fill(TEST_ACCESS_KEY);
      await dialog.getByRole('button', { name: 'Connect camera', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(page.locator('.stat-card .stat-value').nth(0)).toHaveText('Online');
      await expect(page.locator('.stat-card .stat-value').nth(1)).toHaveText('Yellowing');
      await expect(page.locator('.camera-image')).toBeVisible();
      await expect
        .poll(() =>
          page.locator('.camera-image').evaluate((image: HTMLImageElement) => image.naturalWidth),
        )
        .toBe(200);
      await expect.poll(() => gateway.state.activeStreams).toBe(1);
      await page.getByRole('button', { name: 'Pause stream', exact: true }).click();
      await expect(page.getByText('Stream paused', { exact: true })).toBeVisible();
      await expect.poll(() => gateway.state.activeStreams).toBe(0);
      await page.getByRole('button', { name: 'Resume stream', exact: true }).click();
      await expect.poll(() => gateway.state.activeStreams).toBe(1);
      await page.getByRole('button', { name: 'Expand camera', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Expanded camera view' })).toBeVisible();
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'New scan', exact: true }).click();
      await expect(
        page.getByRole('dialog').getByAltText('Current real camera frame'),
      ).toBeVisible();
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Capture & screen', exact: true })
        .click();
      await expect(page.getByText('ESP32-CAM capture', { exact: true })).toBeVisible();
      const scan = await page.evaluate(
        () => JSON.parse(localStorage.getItem('smartfarm-scans') || '[]')[0],
      );
      // The JPEG is green, while the separate firmware telemetry says yellowing.
      // The saved result MUST describe the exact green JPEG, not borrow /status.
      expect(scan).toMatchObject({ cls: 1, green: 100, source: 'camera', method: 'single-frame' });
      await done(page);
      await expect(page.locator('.stat-card .stat-value').nth(1)).toHaveText('Yellowing');
      expect(
        await page.evaluate(() => localStorage.getItem('smartfarm-preferences')),
      ).not.toContain(TEST_ACCESS_KEY);
      expect(urls.some((url) => url.includes(TEST_ACCESS_KEY))).toBe(false);
      gateway.state.streamBroken = true;
      await expect(page.getByRole('heading', { name: 'The stream is unavailable' })).toBeVisible();
      await expect(page.locator('.stat-card .stat-value').nth(0)).toHaveText('Online');
      gateway.state.streamBroken = false;
      await page.getByRole('button', { name: 'Retry stream', exact: true }).click();
      await expect(page.locator('.camera-image')).toBeVisible();
      gateway.state.online = false;
      await expect(page.locator('.stat-card .stat-value').nth(0)).toHaveText('Offline', {
        timeout: 10000,
      });
      await expect(page.locator('.feed-badge')).toHaveText('SAVED FRAME');
      await expect(page.locator('.screening-label')).toHaveText('Saved');
      gateway.state.online = true;
      await expect(page.locator('.stat-card .stat-value').nth(0)).toHaveText('Online', {
        timeout: 10000,
      });
      await expect(page.locator('.camera-image')).toBeVisible();
      dialog = await settings(page);
      await dialog
        .getByRole('button', { name: 'Use photos only · disconnect camera', exact: true })
        .click();
      await expect(page.locator('.stat-card .stat-value').nth(0)).toHaveText('Offline');
      await expect.poll(() => gateway.state.activeStreams).toBe(0);
      expect(
        await page.evaluate(() => JSON.parse(localStorage.getItem('smartfarm-scans') || '[]')),
      ).toHaveLength(1);
      expect(errors).toEqual([]);
    } finally {
      await gateway.close();
    }
  });

  test('cancelling a slow connection cannot later switch the workspace to online', async ({
    page,
    baseURL,
  }) => {
    test.skip(
      new URL(baseURL!).protocol === 'https:',
      'Uses a locally reachable software gateway fixture.',
    );
    await page.goto('./');
    const gateway = await startTestGateway(
      await photo(page, '#28aa32', undefined, 'image/jpeg'),
      new URL(baseURL!).origin,
    );
    gateway.state.delay = 1200;
    try {
      const dialog = await settings(page);
      await dialog.getByLabel('Camera IP address', { exact: true }).fill('192.168.4.9');
      await dialog.getByLabel('HTTPS gateway URL', { exact: true }).fill(gateway.url);
      await dialog.getByLabel('Gateway access key', { exact: true }).fill(TEST_ACCESS_KEY);
      await dialog.getByRole('button', { name: 'Connect camera', exact: true }).click();
      await expect.poll(() => gateway.state.calls.status).toBe(1);
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      await page.waitForTimeout(1600);
      await expect(page.locator('.stat-card .stat-value').nth(0)).toHaveText('Offline');
      expect(
        await page.evaluate(
          () => JSON.parse(localStorage.getItem('smartfarm-preferences') || '{}').host,
        ),
      ).toBe('');
    } finally {
      await gateway.close();
    }
  });
});

test('navigation, search, dialogs, and the existing responsive layout stay functional', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./');
  for (const [hash, title] of [
    ['overview', 'Farm overview'],
    ['camera', 'Live camera'],
    ['history', 'Scan history'],
    ['devices', 'Your devices'],
    ['guide', 'Field guide'],
  ]) {
    await page.goto(`./#${hash}`);
    await expect(page.getByRole('heading', { name: title, exact: true, level: 1 })).toBeVisible();
  }
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('textbox', { name: 'Search workspace', exact: true })).toBeFocused();
  await page.getByRole('textbox', { name: 'Search workspace', exact: true }).fill('camera');
  await page.getByRole('button', { name: 'Live camera A closer look at your plants' }).click();
  await expect(
    page.getByRole('heading', { name: 'Live camera', exact: true, level: 1 }),
  ).toBeVisible();
  for (const width of [390, 768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('button', { name: 'Scan history', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Scan history', exact: true, level: 1 }),
  ).toBeVisible();
  await expect(page.locator('.workspace')).not.toHaveAttribute('inert', '');
  expect(errors).toEqual([]);
});

import { expect, test, type Page } from '@playwright/test';
const organizationId = '00000000-0000-4000-8000-000000000201';
const offerId = '00000000-0000-4000-8000-000000000301';
const apiBase = 'http://127.0.0.1:4999/api/v1';
const envelope = (data: unknown) => ({
  data,
  meta: { requestId: 'ledger-browser-test', timestamp: '2026-10-03T08:00:00.000Z' },
});
const cors = {
  'access-control-allow-origin': 'http://127.0.0.1:3100',
  'access-control-allow-credentials': 'true',
};
async function setup(page: Page) {
  await page.route(`${apiBase}/**`, async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    let data: unknown = [];
    if (request.method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          ...cors,
          'access-control-allow-headers': 'authorization,content-type',
          'access-control-allow-methods': 'GET,POST,PATCH,DELETE,PUT,OPTIONS',
        },
      });
      return;
    }
    if (pathname.endsWith('/auth/refresh'))
      data = {
        accessToken: 'ledger-test-token',
        expiresIn: 900,
        user: {
          id: '00000000-0000-4000-8000-000000000101',
          email: 'admin@test.local',
          phone: null,
          firstName: 'Field',
          lastName: 'Officer',
          status: 'ACTIVE',
          platformRole: 'PLATFORM_ADMIN',
          organizations: [
            {
              organizationId,
              organizationName: 'Rwenzori Coffee Cooperative',
              role: 'COOPERATIVE_ADMIN',
              permissions: [],
            },
          ],
        },
      };
    else if (pathname.endsWith('/farmers'))
      data = { items: [], pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 } };
    else if (pathname.endsWith(`/marketplace/offers/${offerId}`))
      data = {
        id: offerId,
        offerNumber: 'OFR-LEDGER-1',
        quantity: '120.0000',
        currency: 'UGX',
        unitPriceMinor: '450000',
        version: 4,
        status: 'SUBMITTED',
        deliveryTerm: 'Cooperative collection',
        validUntil: '2026-10-10T12:00:00Z',
      };
    else if (pathname.endsWith('/auth/me'))
      data = { firstName: 'Field', lastName: 'Officer', email: 'admin@test.local' };
    else if (request.method() !== 'GET') data = { saved: true };
    await route.fulfill({
      contentType: 'application/json',
      headers: cors,
      body: JSON.stringify(envelope(data)),
    });
  });
}
test.beforeEach(async ({ page }) => setup(page));
test('finance register validates and writes the actual exchange-rate contract', async ({
  page,
}) => {
  await page.goto(`/organizations/${organizationId}/finance/registers`);
  await expect(page.getByRole('heading', { name: 'Finance registers', exact: true })).toBeVisible();
  await page.getByText('Record an exchange rate', { exact: true }).click();
  await page.getByLabel('Conversion rate', { exact: true }).fill('3750.5');
  await page.getByLabel('Rate source', { exact: true }).selectOption('MANUAL');
  await page.getByLabel('Effective from', { exact: true }).fill('2026-10-03T09:00');
  const request = page.waitForRequest(
    (request) => request.method() === 'POST' && request.url().endsWith('/finance/exchange-rates'),
  );
  await page
    .locator('details')
    .filter({ has: page.locator('summary', { hasText: 'Record an exchange rate' }) })
    .getByRole('button', { name: 'Save record', exact: true })
    .click();
  const body: unknown = (await request).postDataJSON();
  expect(body).toMatchObject({
    baseCurrency: 'USD',
    quoteCurrency: 'UGX',
    rate: '3750.5',
    source: 'MANUAL',
  });
  await expect(page.getByRole('status').filter({ hasText: 'Record saved.' })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
});
test('counter offer carries the backend version and entered terms', async ({ page }) => {
  await page.goto(`/organizations/${organizationId}/marketplace/offers/${offerId}`);
  await expect(page.getByRole('heading', { name: 'OFR-LEDGER-1' })).toBeVisible();
  await page.getByText('Counter offer', { exact: true }).click();
  await page.getByLabel('Quantity (kg)', { exact: true }).fill('120.0000');
  await page.getByLabel('Unit price (major currency units)', { exact: false }).fill('4600');
  await page.getByLabel('Delivery terms', { exact: true }).fill('Warehouse pickup');
  await page.getByLabel('Valid until', { exact: true }).fill('2026-10-10T12:00');
  const request = page.waitForRequest(
    (request) =>
      request.method() === 'POST' && request.url().endsWith(`/offers/${offerId}/counter`),
  );
  await page.getByRole('button', { name: 'Submit counter offer', exact: true }).click();
  const body: unknown = (await request).postDataJSON();
  expect(body).toMatchObject({
    version: 4,
    quantity: '120.0000',
    unitPriceMinor: '460000',
    currency: 'UGX',
    deliveryTerm: 'Warehouse pickup',
  });
  await expect(page.getByRole('status').filter({ hasText: 'Record saved.' })).toBeVisible();
  await page.getByRole('button', { name: 'Toggle theme' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
});
test('account recovery sends an entered recovery request without fabricated success data', async ({
  page,
}) => {
  await page.goto('/account/access');
  await page.getByText('Request a password reset', { exact: true }).click();
  await page.getByLabel('Account email', { exact: true }).fill('farmer@test.local');
  const request = page.waitForRequest(
    (request) =>
      request.method() === 'POST' && request.url().endsWith('/auth/password-reset/request'),
  );
  await page.getByRole('button', { name: 'Request recovery', exact: true }).click();
  const body: unknown = (await request).postDataJSON();
  expect(body).toEqual({ email: 'farmer@test.local' });
  await expect(
    page.getByText('If the account is eligible, recovery instructions will be sent.'),
  ).toBeVisible();
});

test('CSV import uploads the selected file before requesting checksum validation', async ({
  page,
}) => {
  const pilotId = '00000000-0000-4000-8000-000000006003';
  const importId = '00000000-0000-4000-8000-000000006004';
  const base = `${apiBase}/pilots/${pilotId}`;
  const record = { id: importId, publicId: 'IMP-001', status: 'UPLOADED', rows: [], rowCount: 1 };
  await page.route(`${base}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let data: unknown = [];
    if (path.endsWith('/farmer-imports') && request.method() === 'POST')
      data = {
        import: record,
        upload: {
          method: 'PUT',
          url: 'https://upload.test.local/farmer.csv',
          requiredHeaders: { 'content-type': 'text/csv' },
        },
      };
    else if (path.endsWith(`/farmer-imports/${importId}`)) data = record;
    await route.fulfill({
      contentType: 'application/json',
      headers: cors,
      body: JSON.stringify(envelope(data)),
    });
  });
  await page.route(base, (route) =>
    route.fulfill({
      contentType: 'application/json',
      headers: cors,
      body: JSON.stringify(
        envelope({
          id: pilotId,
          organizationId,
          code: 'PILOT-001',
          name: 'Cooperative onboarding',
          status: 'SUPERVISED_LIVE_USE',
          district: 'Kasese',
          region: 'Western',
          readOnly: false,
          version: 1,
          _count: { participants: 0, supportCases: 0 },
          readinessGates: [],
          statusEvents: [],
          plannedStartDate: '2026-10-01T00:00:00Z',
          plannedEndDate: '2026-11-01T00:00:00Z',
        }),
      ),
    }),
  );
  let uploaded = '';
  await page.route('https://upload.test.local/**', async (route) => {
    if (route.request().method() === 'PUT') uploaded = route.request().postData() ?? '';
    await route.fulfill({
      status: 200,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'content-type',
        'access-control-allow-methods': 'PUT,OPTIONS',
      },
    });
  });
  await page.goto(`/admin/pilots/${pilotId}/imports`);
  await page
    .getByLabel('Farmer register CSV')
    .setInputFiles({
      name: 'farmers.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('firstName,lastName\nSarah,Atim\n'),
    });
  const validation = page.waitForRequest(
    (request) =>
      request.method() === 'POST' && request.url().endsWith(`/farmer-imports/${importId}/validate`),
  );
  await page.getByRole('button', { name: 'Upload & validate CSV' }).click();
  const body: unknown = (await validation).postDataJSON();
  expect(uploaded).toBe('firstName,lastName\nSarah,Atim\n');
  expect(body).toMatchObject({ checksum: expect.stringMatching(/^sha256:[a-f0-9]{64}$/) });
  await expect(page.getByText('CSV uploaded. Server validation is running.')).toBeVisible();
});

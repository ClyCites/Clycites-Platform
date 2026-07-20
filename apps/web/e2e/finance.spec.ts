import { expect, test } from '@playwright/test';

const organizationId = '00000000-0000-4000-8000-000000000201';
const apiBase = 'http://127.0.0.1:4999/api/v1';
const corsHeaders = {
  'access-control-allow-credentials': 'true',
  'access-control-allow-origin': 'http://127.0.0.1:3100',
};
const envelope = (data: unknown) => ({
  data,
  meta: { requestId: 'finance-browser-test', timestamp: new Date().toISOString() },
});

test.beforeEach(async ({ page }) => {
  await page.route(`${apiBase}/auth/refresh`, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      headers: corsHeaders,
      body: JSON.stringify(
        envelope({
          accessToken: 'finance-browser-token',
          expiresIn: 900,
          user: {
            id: '00000000-0000-4000-8000-000000000104',
            email: 'finance.officer@clycites.local',
            phone: null,
            firstName: 'Sarah',
            lastName: 'Atim',
            status: 'ACTIVE',
            platformRole: null,
            organizations: [
              {
                organizationId,
                organizationName: 'Rwenzori Coffee Cooperative',
                role: 'FINANCE_OFFICER',
                permissions: ['sale-proceeds.read', 'payment-instruction.read'],
              },
            ],
          },
        }),
      ),
    });
  });
  await page.route(`${apiBase}/organizations/${organizationId}/finance/sale-proceeds`, (route) =>
    route.fulfill({
      contentType: 'application/json',
      headers: corsHeaders,
      body: JSON.stringify(
        envelope([
          {
            id: '00000000-0000-4000-8000-000000004061',
            proceedsNumber: 'PRC-KIS-2026-001',
            status: 'VERIFIED',
            currency: 'UGX',
            expectedAmountMinor: '36000000',
            recordedAmountMinor: '36000000',
            version: 1,
            order: { orderNumber: 'ORD-KIS-2026-SETTLED' },
          },
        ]),
      ),
    }),
  );
  await page.route(
    `${apiBase}/organizations/${organizationId}/finance/payment-instructions`,
    (route) =>
      route.fulfill({
        contentType: 'application/json',
        headers: corsHeaders,
        body: JSON.stringify(
          envelope([
            {
              id: '00000000-0000-4000-8000-0000000040d1',
              instructionNumber: 'PAY-KIS-2026-001',
              status: 'COMPLETED',
              currency: 'UGX',
              amountMinor: '35640000',
              provider: 'manual',
              version: 1,
              farmer: { farmerNumber: 'FMR-KIS-001', firstName: 'Alice', lastName: 'Seed' },
              paymentMethod: { type: 'MOBILE_MONEY', accountIdentifierLast4: '3456' },
            },
          ]),
        ),
      }),
  );
});

test('finance officer reviews proceeds and masked payment status', async ({ page }) => {
  await page.goto(`/organizations/${organizationId}/finance`);
  await expect(page.getByRole('heading', { name: 'Sale proceeds' })).toBeVisible();
  await expect(page.getByText('PRC-KIS-2026-001')).toBeVisible();
  await page.getByRole('link', { name: 'Payments' }).click();
  await expect(page.getByRole('heading', { name: 'Payment instructions' })).toBeVisible();
  await expect(page.getByText('MOBILE_MONEY ···· 3456')).toBeVisible();
  await expect(page.getByText('256700123456')).toHaveCount(0);
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
});

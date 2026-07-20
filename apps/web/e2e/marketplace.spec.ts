import { expect, test } from '@playwright/test';

const organizationId = '00000000-0000-4000-8000-000000000202';
const corsHeaders = {
  'access-control-allow-credentials': 'true',
  'access-control-allow-origin': 'http://127.0.0.1:3100',
};

test.beforeEach(async ({ page }) => {
  await page.route('http://127.0.0.1:4999/api/v1/auth/refresh', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      headers: corsHeaders,
      body: JSON.stringify({
        data: {
          accessToken: 'browser-test-token',
          expiresIn: 900,
          user: {
            id: '00000000-0000-4000-8000-000000000105',
            email: 'buyer@clycites.local',
            phone: null,
            firstName: 'Amina',
            lastName: 'Kato',
            status: 'ACTIVE',
            platformRole: null,
            organizations: [
              {
                organizationId,
                organizationName: 'Kampala Coffee Exporters',
                role: 'BUYER',
                permissions: ['marketplace-listing.read', 'offer.submit'],
              },
            ],
          },
        },
        meta: { requestId: 'browser-test', timestamp: new Date().toISOString() },
      }),
    });
  });
  await page.route(
    `http://127.0.0.1:4999/api/v1/organizations/${organizationId}/marketplace/listings`,
    async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        headers: corsHeaders,
        body: JSON.stringify({
          data: [
            {
              id: '00000000-0000-4000-8000-000000003001',
              title: 'Rwenzori washed parchment coffee',
              listingNumber: 'LST-KIS-2026-001',
              status: 'PUBLISHED',
              listedQuantity: '68.0000',
              availableQuantity: '38.0000',
              quantityUnit: 'KG',
              currency: 'UGX',
              askingUnitPriceMinor: '1250000',
              version: 1,
              sellerOrganization: { name: 'Rwenzori Coffee Cooperative' },
              lot: {
                lotNumber: 'LOT-KIS-2026-001',
                commodity: { name: 'Coffee' },
                commodityForm: { name: 'Parchment' },
              },
            },
          ],
          meta: { requestId: 'browser-test', timestamp: new Date().toISOString() },
        }),
      });
    },
  );
});

test('buyer discovers a published cooperative listing', async ({ page }) => {
  await page.goto(`/organizations/${organizationId}/marketplace`);
  await expect(page.getByRole('heading', { name: 'Lot marketplace' })).toBeVisible();
  await expect(page.getByText('Rwenzori washed parchment coffee')).toBeVisible();
  await expect(page.getByText('38.0000 KG')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Offers' })).toBeVisible();
  await page.getByRole('button', { name: 'Create listing' }).click();
  await expect(page.getByLabel('Approved lot ID')).toBeVisible();
});

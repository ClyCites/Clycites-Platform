import { expect, test } from '@playwright/test';

const apiBase = 'http://127.0.0.1:4999/api/v1';
const pilotId = '00000000-0000-4000-8000-000000006003';
const corsHeaders = {
  'access-control-allow-credentials': 'true',
  'access-control-allow-origin': 'http://127.0.0.1:3100',
};
const envelope = (data: unknown) => ({
  data,
  meta: { requestId: 'pilot-browser-test', timestamp: new Date().toISOString() },
});
const pilot = {
  id: pilotId,
  code: 'SYNTH-SUPERVISED-2026',
  name: 'Synthetic supervised-use pilot',
  organizationId: '00000000-0000-4000-8000-000000000201',
  status: 'SUPERVISED_LIVE_USE',
  crop: 'COFFEE',
  region: 'Synthetic Central Region',
  district: 'Synthetic District C',
  plannedStartDate: '2026-07-20T00:00:00.000Z',
  plannedEndDate: '2026-09-18T00:00:00.000Z',
  targetFarmerCount: 25,
  targetAgentCount: 2,
  targetCollectionPointCount: 1,
  targetBuyerCount: 1,
  paymentMode: 'MOCK',
  hederaMode: 'MOCK',
  smsMode: 'MOCK',
  environmentLabel: 'LOCAL SYNTHETIC PILOT',
  readOnly: false,
  version: 1,
  approvedAt: null,
  readinessGates: [],
  statusEvents: [],
  _count: { participants: 4, supportCases: 1, feedback: 1 },
};

test.beforeEach(async ({ page }) => {
  await page.route(`${apiBase}/auth/refresh`, (route) =>
    route.fulfill({
      contentType: 'application/json',
      headers: corsHeaders,
      body: JSON.stringify(
        envelope({
          accessToken: 'pilot-browser-token',
          expiresIn: 900,
          user: {
            id: '00000000-0000-4000-8000-000000000101',
            email: 'admin@clycites.local',
            phone: null,
            firstName: 'Pilot',
            lastName: 'Admin',
            status: 'ACTIVE',
            platformRole: 'PLATFORM_ADMIN',
            organizations: [
              {
                organizationId: pilot.organizationId,
                organizationName: 'Synthetic Cooperative',
                role: 'COOPERATIVE_ADMIN',
                permissions: ['pilot.read'],
              },
            ],
          },
        }),
      ),
    }),
  );
  await page.route(`${apiBase}/pilots/${pilotId}`, (route) =>
    route.fulfill({
      contentType: 'application/json',
      headers: corsHeaders,
      body: JSON.stringify(envelope(pilot)),
    }),
  );
  await page.route(`${apiBase}/pilots/${pilotId}/preflight`, (route) =>
    route.fulfill({
      contentType: 'application/json',
      headers: corsHeaders,
      body: JSON.stringify(
        envelope({
          pilotId,
          passed: false,
          generatedAt: new Date().toISOString(),
          checks: [
            {
              code: 'readiness-gates',
              status: 'FAIL',
              blocking: true,
              message: '3 blocking readiness gates remain',
            },
          ],
        }),
      ),
    }),
  );
  await page.route(`${apiBase}/pilots`, (route) =>
    route.fulfill({
      contentType: 'application/json',
      headers: corsHeaders,
      body: JSON.stringify(envelope([pilot])),
    }),
  );
});

test('@accessibility pilot control room has semantic navigation and keyboard focus', async ({
  page,
}) => {
  await page.goto(`/admin/pilots/${pilotId}`);
  await expect(page.getByRole('heading', { name: pilot.name })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Traceability sections' })).toBeVisible();
  await expect(page.getByText('LOCAL SYNTHETIC PILOT')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('@offline pilot shell remains usable when preflight is unavailable', async ({ page }) => {
  await page.route(`${apiBase}/pilots/${pilotId}/preflight`, (route) =>
    route.abort('internetdisconnected'),
  );
  await page.goto(`/admin/pilots/${pilotId}`);
  await expect(page.getByRole('heading', { name: pilot.name })).toBeVisible();
  await expect(page.getByText('Preflight not measured.')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('MOCK', { exact: true }).first()).toBeVisible();
});

test('@performance pilot list renders mocked operational data within smoke budget', async ({
  page,
}) => {
  const startedAt = Date.now();
  await page.goto('/admin/pilots');
  await expect(page.getByText(pilot.name)).toBeVisible();
  expect(Date.now() - startedAt).toBeLessThan(5_000);
});

import { expect, test, type Page } from '@playwright/test';

const organizationId = '00000000-0000-4000-8000-000000000201';
const apiBase = 'http://127.0.0.1:4999/api/v1';
const timestamp = '2026-10-03T08:00:00.000Z';
const envelope = (data: unknown) => ({
  data,
  meta: { requestId: 'dashboard-browser-test', timestamp },
});
const permissions = [
  'analytics.read',
  'analytics.finance.read',
  'operations.read',
  'audit.read',
  'report.read',
];

async function mockDashboard(page: Page, allowed = permissions) {
  await page.route(`${apiBase}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown;
    if (path.endsWith('/auth/refresh'))
      data = {
        accessToken: 'dashboard-browser-token',
        expiresIn: 900,
        user: {
          id: '00000000-0000-4000-8000-000000000104',
          email: 'staff@clycites.local',
          phone: null,
          username: null,
          firstName: 'Sarah',
          lastName: 'Atim',
          status: 'ACTIVE',
          platformRole: null,
          organizations: [
            {
              organizationId,
              organizationName: 'Rwenzori Coffee Cooperative',
              role: 'ORG_ADMIN',
              permissions: allowed,
            },
          ],
        },
      };
    else if (path.endsWith('/analytics/overview'))
      data = {
        organizationId,
        generatedAt: timestamp,
        kpis: [
          {
            key: 'active_farmers',
            label: 'Active farmers',
            value: 42,
            unit: null,
            deltaPercent: null,
            trend: null,
          },
          {
            key: 'deliveries',
            label: 'Deliveries',
            value: 12,
            unit: null,
            deltaPercent: null,
            trend: null,
          },
        ],
        timeSeries: [
          {
            key: 'deliveries',
            label: 'Deliveries',
            granularity: 'DAY',
            points: Array.from({ length: 12 }, (_, index) => ({
              bucket: `2026-09-${String(index + 1).padStart(2, '0')}`,
              value: index + 1,
            })),
          },
        ],
        breakdowns: [
          {
            key: 'delivery_status',
            label: 'Deliveries by status',
            data: [
              { label: 'Accepted', value: 10 },
              { label: 'Rejected', value: 2 },
            ],
          },
        ],
      };
    else if (path.endsWith('/analytics/finance'))
      data = {
        organizationId,
        generatedAt: timestamp,
        currency: 'UGX',
        kpis: [
          {
            key: 'net_entitlement',
            label: 'Net entitlement',
            value: 120000,
            unit: 'UGX',
            deltaPercent: null,
            trend: null,
          },
        ],
        settlementTimeSeries: [],
      };
    else if (path.endsWith('/operations/summary'))
      data = {
        organizationId,
        generatedAt: timestamp,
        activeUsers24h: 3,
        pendingReportExports: 2,
        failedReportExports24h: 1,
        auditEvents24h: 8,
        featureFlagChanges7d: 0,
      };
    else if (path.endsWith('/audit/search'))
      data = {
        items: [
          {
            id: 'audit-1',
            action: 'report.exported',
            entityType: 'ReportExport',
            createdAt: timestamp,
          },
        ],
        pagination: { page: 1, pageSize: 5, totalItems: 1, totalPages: 1 },
      };
    else {
      await route.fulfill({
        status: 404,
        body: JSON.stringify({ error: { message: 'Fixture unavailable' } }),
      });
      return;
    }
    await route.fulfill({
      contentType: 'application/json',
      headers: {
        'access-control-allow-credentials': 'true',
        'access-control-allow-origin': 'http://127.0.0.1:3100',
      },
      body: JSON.stringify(envelope(data)),
    });
  });
}

test('dashboard uses API metrics, chart exploration, and responsive navigation', async ({
  page,
  isMobile,
}) => {
  await mockDashboard(page);
  await page.goto(`/dashboard/${organizationId}`);
  await expect(page.getByRole('heading', { name: 'Operations at a glance' })).toBeVisible();
  await expect(page.getByText('120,000 UGX')).toBeVisible();
  await expect(page.getByText('report.exported')).toBeVisible();
  await page.getByText('Explore chart data', { exact: true }).first().click();
  await expect(page.getByText('Page 1 of 2 · 12 entries')).toBeVisible();
  await page.getByRole('button', { name: 'Next', exact: true }).first().click();
  await expect(page.getByText('Page 2 of 2 · 12 entries')).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Search Deliveries data', exact: true })
    .fill('2026-09-01');
  await expect(page.getByText('Page 1 of 1 · 1 entries')).toBeVisible();
  await page.getByRole('button', { name: 'Toggle theme' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
  if (isMobile) {
    const open = page.getByRole('button', { name: 'Open navigation', exact: true });
    await open.click();
    await expect(page.getByRole('dialog', { name: 'Workspace navigation' })).toBeVisible();
    await page.keyboard.press('Shift+Tab');
    await expect(
      page.getByRole('dialog').getByRole('link', { name: 'System status', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('dialog').getByRole('link', { name: /ClyCites/ })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(open).toBeFocused();
    await open.click();
    await page
      .getByRole('navigation', { name: 'Primary navigation' })
      .getByRole('link', { name: 'Finance', exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`/organizations/${organizationId}/finance$`));
    await expect(page.getByRole('dialog')).toHaveCount(0);
  } else {
    await page.getByRole('button', { name: 'Collapse sidebar' }).click();
    await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
    await page.getByRole('button', { name: 'Expand sidebar' }).click();
    await expect(page.getByRole('button', { name: 'Collapse sidebar' })).toBeVisible();
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
});

test('dashboard avoids restricted queries and exposes retry on unavailable metrics', async ({
  page,
}) => {
  const restrictedRequests: string[] = [];
  page.on('request', (request) => {
    if (/analytics\/finance|operations\/summary|audit\/search/.test(request.url()))
      restrictedRequests.push(request.url());
  });
  await mockDashboard(page, ['analytics.read']);
  await page.route(`${apiBase}/organizations/${organizationId}/analytics/overview`, (route) =>
    route.fulfill({
      status: 403,
      contentType: 'application/json',
      headers: {
        'access-control-allow-credentials': 'true',
        'access-control-allow-origin': 'http://127.0.0.1:3100',
      },
      body: JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Access denied' } }),
    }),
  );
  await page.goto(`/dashboard/${organizationId}`);
  await expect(page.getByRole('heading', { name: 'Access denied', exact: true })).toBeVisible();
  await expect(
    page.getByText('Operational monitoring requires additional organization permissions.'),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Settlement performance' })).toHaveCount(0);
  expect(restrictedRequests).toEqual([]);
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled();
});

test('farmer directory paginates server records and resets when searching', async ({ page }) => {
  await mockDashboard(page, ['analytics.read']);
  const requestedPages: string[] = [];
  await page.route(`${apiBase}/organizations/${organizationId}/farmers?**`, async (route) => {
    const url = new URL(route.request().url());
    const pageNumber = Number(url.searchParams.get('page') ?? 1);
    requestedPages.push(url.searchParams.get('page') ?? '1');
    const filtered = Boolean(url.searchParams.get('search'));
    const farmerName = pageNumber === 2 ? 'Grace Second' : 'Alice First';
    await route.fulfill({
      contentType: 'application/json',
      headers: {
        'access-control-allow-credentials': 'true',
        'access-control-allow-origin': 'http://127.0.0.1:3100',
      },
      body: JSON.stringify(
        envelope({
          items: [
            {
              id: `farmer-${pageNumber}`,
              displayName: farmerName,
              farmerNumber: `FMR-00${pageNumber}`,
              membershipNumber: null,
              village: 'Kasese',
              district: 'Rwenzori',
              status: 'ACTIVE',
            },
          ],
          pagination: {
            page: pageNumber,
            pageSize: 25,
            totalItems: filtered ? 1 : 26,
            totalPages: filtered ? 1 : 2,
          },
        }),
      ),
    });
  });
  await page.goto(`/organizations/${organizationId}/farmers`);
  await expect(page.getByRole('link', { name: 'Alice First' })).toBeVisible();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Grace Second' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('Alice');
  await expect(page.getByText('1 records · Page 1 of 1')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Alice First' })).toBeVisible();
  expect(requestedPages).toContain('2');
  expect(requestedPages.at(-1)).toBe('1');
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
});

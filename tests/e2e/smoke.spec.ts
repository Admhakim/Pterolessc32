import { expect, test } from '@playwright/test';

const username = process.env.E2E_USERNAME;
const password = process.env.E2E_PASSWORD;

test('admin and main user pages render without browser or server errors', async ({ page }) => {
    test.skip(!username || !password, 'Set E2E_USERNAME and E2E_PASSWORD to run the authenticated smoke test.');

    const pageErrors: string[] = [];
    const serverErrors: string[] = [];
    const pollRequests: string[] = [];
    const dashboardStatsRequests: string[] = [];
    let snapshotResponse: {
        json: () => Promise<{
        resources: { attributes: { current_state: string } };
        logs: { logs: string };
        }>;
    } | undefined;

    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('request', (request) => {
        const path = new URL(request.url()).pathname;
        const endpoint = path.match(/\/api\/client\/servers\/[^/]+\/(snapshot|resources|logs)$/)?.[1];
        if (endpoint) pollRequests.push(endpoint);
        if (/\/api\/client\/servers\/[^/]+\/resources$/.test(path)) dashboardStatsRequests.push(path);
    });
    page.on('response', (response) => {
        if (new URL(response.url()).pathname.endsWith('/snapshot')) {
            snapshotResponse = response;
        }
        if (response.status() >= 500) {
            serverErrors.push(`${response.status()} ${new URL(response.url()).pathname}`);
        }
    });

    await page.goto('/auth/login');
    await page.locator('input[name="username"]').fill(username!);
    await page.locator('input[name="password"]').fill(password!);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page).toHaveTitle('Dashboard');

    const visit = async (path: string) => {
        const response = await page.goto(path);
        expect(response?.status(), path).toBe(200);
        await expect(page.locator('body'), path).not.toContainText(/404 NOT FOUND|500 SERVER ERROR/);
    };

    await visit('/');
    const clientServerLinks = page.locator('a[href^="/server/"]');
    const clientServerPath = (await clientServerLinks.count())
        ? await clientServerLinks.first().getAttribute('href')
        : null;

    if (await clientServerLinks.count()) {
        await page.clock.install();
        dashboardStatsRequests.length = 0;
        await page.reload();
        await expect.poll(() => dashboardStatsRequests.length).toBe(await clientServerLinks.count());
        const dashboardRequestsBeforeHide = dashboardStatsRequests.length;

        await page.evaluate(() => {
            Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
            Object.defineProperty(document, 'hidden', { configurable: true, value: true });
            document.dispatchEvent(new Event('visibilitychange'));
        });
        await page.clock.fastForward(60000);
        expect(dashboardStatsRequests).toHaveLength(dashboardRequestsBeforeHide);

        await page.evaluate(() => {
            Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
            Object.defineProperty(document, 'hidden', { configurable: true, value: false });
            document.dispatchEvent(new Event('visibilitychange'));
        });
        await expect.poll(() => dashboardStatsRequests.length).toBeGreaterThan(dashboardRequestsBeforeHide);
        await page.clock.resume();
    }

    const adminPages = [
        '/admin',
        '/admin/api',
        '/admin/api/new',
        '/admin/databases',
        '/admin/locations',
        '/admin/mounts',
        '/admin/nests',
        '/admin/nests/new',
        '/admin/nests/egg/new',
        '/admin/nodes',
        '/admin/nodes/new',
        '/admin/servers',
        '/admin/servers/new',
        '/admin/settings',
        '/admin/settings/advanced',
        '/admin/settings/mail',
        '/admin/users',
        '/admin/users/new',
    ];

    for (const path of adminPages) await visit(path);

    const relatedAdminPages: Array<[string, string[]]> = [
        ['a[href^="/admin/servers/view/"]', [
            'build', 'database', 'delete', 'details', 'manage', 'mounts', 'startup',
        ]],
        ['a[href^="/admin/nodes/view/"]', ['allocation', 'configuration', 'servers', 'settings']],
        ['a[href^="/admin/locations/view/"]', []],
        ['a[href^="/admin/nests/view/"]', []],
        ['a[href^="/admin/nests/egg/"]', ['scripts', 'variables']],
    ];

    for (const [selector, suffixes] of relatedAdminPages) {
        const links = page.locator(selector);
        if (!(await links.count())) continue;

        const href = await links.first().getAttribute('href');
        if (!href) continue;

        await visit(href);
        for (const suffix of suffixes) await visit(`${href.replace(/\/$/, '')}/${suffix}`);
    }

    for (const path of ['/account', '/account/api', '/account/ssh', '/account/activity']) {
        await visit(path);
    }

    if (clientServerPath) {
        pollRequests.length = 0;
        await visit(clientServerPath);
        await expect.poll(() => (snapshotResponse ? 1 : 0)).toBe(1);
        const snapshot = await snapshotResponse!.json();
        const snapshotsBeforeHide = pollRequests.filter((endpoint) => endpoint === 'snapshot').length;

        await page.evaluate(() => {
            Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
            Object.defineProperty(document, 'hidden', { configurable: true, value: true });
            document.dispatchEvent(new Event('visibilitychange'));
        });
        await page.waitForTimeout(1800);
        expect(pollRequests.filter((endpoint) => endpoint === 'snapshot')).toHaveLength(snapshotsBeforeHide);

        await page.evaluate(() => {
            Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
            Object.defineProperty(document, 'hidden', { configurable: true, value: false });
            document.dispatchEvent(new Event('visibilitychange'));
        });
        await expect
            .poll(() => pollRequests.filter((endpoint) => endpoint === 'snapshot').length)
            .toBeGreaterThan(snapshotsBeforeHide);

        for (const suffix of ['files', 'users', 'startup', 'settings', 'activity']) {
            await visit(`${clientServerPath.replace(/\/$/, '')}${suffix ? `/${suffix}` : ''}`);
        }

        expect(snapshot.resources.attributes.current_state).toBeTruthy();
        expect(snapshot.logs).toHaveProperty('logs');
        expect(pollRequests).toContain('snapshot');
        expect(pollRequests.filter((endpoint) => endpoint === 'resources' || endpoint === 'logs')).toEqual([]);
    }

    expect(serverErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
});
import { expect, test } from '@playwright/test';
import process from 'node:process';

const username = process.env.E2E_USERNAME;
const password = process.env.E2E_PASSWORD;
const baseURL = process.env.E2E_BASE_URL || 'http://localhost:8080';

test('creates and runs two local applications, then removes its test servers', async ({ page, playwright }) => {
    test.skip(
        process.env.E2E_LOCAL_RUNNER !== '1' || !username || !password,
        'Set E2E_LOCAL_RUNNER=1 and E2E_USERNAME/E2E_PASSWORD to run local process tests.',
    );

    test.setTimeout(180_000);

    const testId = Date.now();
    const startup =
        `exec node -e 'require("http").createServer((request, response) => response.end("pteroless-e2e-ok")).listen(Number(process.env.PORT), "127.0.0.1")'`;
    const servers: Array<{ id: string; clientPath?: string; port?: number; allocationId?: number }> = [];
    const cleanupErrors: string[] = [];
    let csrfToken = '';

    await page.goto('/auth/login');
    await page.locator('input[name="username"]').fill(username!);
    await page.locator('input[name="password"]').fill(password!);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/$/);
    const cleanupRequest = await playwright.request.newContext({
        baseURL,
        storageState: await page.context().storageState(),
    });

    try {
        for (let index = 1; index <= 2; index++) {
            const name = `Pteroless E2E ${testId}-${index}`;
            await page.goto('/admin/servers/new');
            csrfToken = (await page.locator('meta[name="_token"]').getAttribute('content')) || csrfToken;
            await page.locator('#pName').fill(name);
            await page.locator('#pRuntime').selectOption('custom');
            await page.locator('#pStartup').fill(startup);
            await page.locator('#pMemory').fill('128');
            await page.getByRole('button', { name: 'Create Server' }).click();
            await expect(page).toHaveURL(/\/admin\/servers\/view\/\d+$/);

            const id = new URL(page.url()).pathname.split('/').at(-1)!;
            const server: { id: string; clientPath?: string; port?: number; allocationId?: number } = { id };
            servers.push(server);

            await page.goto('/');
            const serverLink = page.locator('a[href^="/server/"]').filter({ hasText: name }).first();
            await expect(serverLink).toBeVisible();
            server.clientPath = (await serverLink.getAttribute('href'))!;

            const serverResponse = await cleanupRequest.get(`/api/client/servers/${server.clientPath.split('/').at(-1)}`);
            expect(serverResponse.ok()).toBeTruthy();
            const serverData = await serverResponse.json();
            const allocation = serverData.attributes?.relationships?.allocations?.data?.[0]?.attributes;
            server.allocationId = Number(allocation?.id);
            server.port = Number(allocation?.port);
            expect(server.allocationId).toBeGreaterThan(0);
            expect(server.port).toBeGreaterThan(0);

            await page.goto(server.clientPath);
            await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeEnabled();
            expect(server.port, `address for ${name}`).toBeTruthy();

            await page.getByRole('button', { name: 'Start', exact: true }).click();
            await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeEnabled({ timeout: 15000 });

            const response = await fetch(`http://127.0.0.1:${server.port}`);
            expect(response.status, name).toBe(200);
            expect(await response.text(), name).toBe('pteroless-e2e-ok');
        }
    } finally {
        for (const server of [...servers].reverse()) {
            try {
                const allocationPage = await cleanupRequest.get('/admin/nodes/view/1/allocation');
                const allocationHtml = await allocationPage.text();
                if (!server.allocationId) {
                    const row = (allocationHtml.match(/<tr\b[\s\S]*?<\/tr>/g) || []).find((value) =>
                        value.includes(`/admin/servers/view/${server.id}`),
                    );
                    server.allocationId = Number(row?.match(/data-action="set-alias" data-id="(\d+)"/)?.[1]);
                    server.port = Number(row?.match(/data-identifier="port">(\d+)</)?.[1]);
                }

                const deleteResponse = await cleanupRequest.post(`/admin/servers/view/${server.id}/delete`, {
                    form: { _token: csrfToken, force_delete: '1' },
                });
                expect(deleteResponse.ok(), `delete server ${server.id}`).toBeTruthy();

                if (server.allocationId) {
                    const response = await cleanupRequest.delete(
                        `/admin/nodes/view/1/allocation/remove/${server.allocationId}`,
                        { headers: { 'X-CSRF-TOKEN': csrfToken } },
                    );
                    expect(response.status(), `deallocate port ${server.port}`).toBe(204);
                }
            } catch (error) {
                cleanupErrors.push(`${server.id}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }

    expect(cleanupErrors).toEqual([]);
    await cleanupRequest.dispose();
});
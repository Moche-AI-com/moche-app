import { test as base, expect, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

export const PROPERTY_ID = '11111111-1111-4111-8111-111111111111';
export const ESCALATION_ID = '22222222-2222-4222-8222-222222222222';
export const REQUEST_ID = '33333333-3333-4333-8333-333333333333';
export const GUEST_SLUG = 'synthetic-ai-workflow-villa';
export const ACTIONS = '/__mock/actions/';
export const INGEST = `/api/properties/${PROPERTY_ID}/ingest/`;
export const GUEST = `/api/guest/${GUEST_SLUG}/`;

type MockRequest = {
  path: string;
  method: string;
  contentType: string;
  body: Record<string, unknown> | string | null;
};
type MockResponse = { status?: number; json: unknown };
type MockHandler = (request: MockRequest) => MockResponse | Promise<MockResponse>;

export type MockBoundary = {
  requests: MockRequest[];
  respond: (path: string, response: MockResponse | MockHandler) => void;
  calls: (path: string) => MockRequest[];
};

// Every test uses a fresh page and mock registry. No API request falls through
// to the HTTP fixture, much less to a real provider or a production host.
export const test = base.extend<{ mocks: MockBoundary }>({
  mocks: [async ({ page, context, baseURL }, use, testInfo) => {
    const requests: MockRequest[] = [];
    const unexpected: string[] = [];
    const browserErrors: string[] = [];
    const consoleMessages: { type: string; text: string }[] = [];
    const handlers = new Map<string, MockHandler>();
    const origin = new URL(baseURL!).origin;
    page.on('pageerror', error => browserErrors.push(error.message));
    page.on('console', message => consoleMessages.push({ type: message.type(), text: message.text() }));
    await context.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== origin) {
        unexpected.push(`External request blocked: ${request.method()} ${url.origin}${url.pathname}`);
        return route.abort('blockedbyclient');
      }
      if (request.method() === 'GET' && ['/', `/dashboard/properties/${PROPERTY_ID}`, '/app.js', '/app.css', '/favicon.ico'].includes(url.pathname)) {
        return route.continue();
      }
      const contentType = request.headers()['content-type'] ?? '';
      const entry: MockRequest = {
        path: url.pathname,
        method: request.method(),
        contentType,
        body: contentType.includes('application/json') ? request.postDataJSON() : request.postData(),
      };
      requests.push(entry);
      const handler = handlers.get(url.pathname);
      if (!handler) {
        unexpected.push(`Unconfigured mock request: ${entry.method} ${entry.path}`);
        return route.fulfill({ status: 503, json: { error: 'MOCK ONLY: no response configured.' } });
      }
      const response = await handler(entry);
      return route.fulfill({ status: response.status ?? 200, json: response.json });
    });
    await use({
      requests,
      respond(path, response) {
        handlers.set(path, typeof response === 'function' ? response : () => response);
      },
      calls: path => requests.filter(request => request.path === path),
    });
    if (!page.isClosed()) {
      await page.screenshot({ path: testInfo.outputPath(`${testInfo.project.name}.png`), fullPage: true });
    }
    const logPath = testInfo.outputPath('mock-only-browser-log.json');
    await writeFile(logPath, JSON.stringify({ requests, unexpected, browserErrors, consoleMessages }, null, 2));
    await testInfo.attach('mock-only-browser-log', { path: logPath, contentType: 'application/json' });
    expect(unexpected, 'No external or unconfigured requests are allowed').toEqual([]);
    expect(browserErrors, 'Actual components must not throw in the browser').toEqual([]);
  }, { auto: true }],
});

export { expect };

export async function openWorkflow(page: Page, workflow: 'knowledge' | 'escalation' | 'needs' | 'setup', query = '') {
  await page.goto(`/?workflow=${workflow}${query}`);
  await expect(page.getByText('MOCK ONLY — offline AI workflow component checks', { exact: true })).toBeVisible();
}

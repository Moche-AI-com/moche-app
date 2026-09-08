import { expect, test } from '@playwright/test';

test('own consent + phone OTP, explicit recovery, exact focus, and workflow warning', async ({ page }, testInfo) => {
  let verified = false;
  let recovered = false;
  let sends = 0;
  const requests: Record<string, unknown>[] = [];
  const target = { conversationId: '40000000-0000-4000-8000-000000000001', messageId: '80000000-0000-4000-8000-000000000001' };
  const hostMessage = { id: target.messageId, role: 'host', content: 'Synthetic exact host message', createdAt: '2026-09-08T14:00:00Z', messageKind: 'text', escalationId: null, replyToMessageId: null };
  const browserErrors: string[] = [];
  page.on('pageerror', error => browserErrors.push(error.message));
  // The fixture intercepts EVERY API request: neither OTP nor message writes
  // can reach a real server or provider.
  await page.route('**/api/**', async route => {
    const request = route.request();
    if (request.method() === 'GET') {
      const url = new URL(request.url());
      expect(url.searchParams.get('conversation')).toBe(target.conversationId);
      expect(url.searchParams.get('message')).toBe(target.messageId);
      return route.fulfill({ status: recovered ? 200 : 404, json: recovered
        ? { conversationId: target.conversationId, canSend: true, messages: [hostMessage] }
        : { error: 'Verify your own phone to open this conversation.', code: 'RECOVERY_REQUIRED', recoveryReady: verified, canSend: false } });
    }
    const body = request.postDataJSON();
    requests.push(body);
    if (request.url().endsWith('/notify-consent')) {
      expect(body.phone).toBe('+15005550006');
      if (body.action === 'start') {
        expect(body).toMatchObject({ consent: true, termsAccepted: true });
        return route.fulfill({ json: { ok: true, message: 'Synthetic code requested.' } });
      }
      expect(body).toMatchObject({ action: 'confirm', code: '123456' });
      verified = true;
      return route.fulfill({ json: { ok: true, canSend: true } });
    }
    if (request.url().endsWith('/recover')) {
      expect(verified).toBe(true);
      expect(body).toEqual({ ...target, confirm: true });
      recovered = true;
      return route.fulfill({ json: { ok: true, ...target } });
    }
    sends++;
    return route.fulfill({ json: {
      ok: true, messageStored: true, notification: { sms: 'failed' },
      workflowWarnings: ['Your message was saved, but the escalation could not be reopened. Do not resend the message.'],
      message: { ...hostMessage, id: '80000000-0000-4000-8000-000000000002', role: 'guest', content: body.message },
    } });
  });
  await page.goto('/');
  await expect(page.locator('#host-chat-input')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Open this conversation here' })).toHaveCount(0);
  await page.getByLabel('Your phone, including + and country code').fill('+15005550006');
  await page.getByRole('button', { name: 'Request verification SMS' }).click();
  expect(requests).toHaveLength(0); // Native required consent checkboxes still block.
  await page.getByRole('checkbox').nth(0).check();
  await page.getByRole('checkbox').nth(1).check();
  await page.getByRole('button', { name: 'Request verification SMS' }).click();
  await page.getByLabel('Six-digit verification code').fill('123456');
  await page.getByRole('button', { name: 'Verify phone' }).click();
  await expect(page.getByRole('button', { name: 'Open this conversation here' })).toBeVisible();
  await expect(page.locator('#host-chat-input')).toBeDisabled();
  expect(recovered).toBe(false);
  await page.getByRole('button', { name: 'Open this conversation here' }).click();
  await expect(page.locator(`#message-${target.messageId}`)).toBeFocused();
  await expect(page.locator('#host-chat-input')).toBeEnabled();
  await expect(page.getByText(hostMessage.content)).toBeVisible();
  await page.locator('#host-chat-input').fill('Synthetic follow-up');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Do not resend the message.');
  expect(sends).toBe(1);
  expect(browserErrors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath(`messaging-${testInfo.project.name}.png`), fullPage: true });
});

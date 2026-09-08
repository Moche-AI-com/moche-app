import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
const read = (path: string) => readFileSync(path, 'utf8');
it('guest keeps a message locator through registration and phone readiness gates send', () => {
  const portal = read('app/g/[slug]/GuestPortal.tsx');
  const chat = read('app/g/[slug]/HostChatWorkflow.tsx');
  expect(portal).toContain('initialConversationId');
  expect(portal).toContain('initialMessageId');
  expect(chat).toContain('json.canSend === true');
  expect(chat).toContain('!canSend');
  expect(chat).toContain('GuestMessagingSetup');
  expect(chat).toContain('id={`message-${message.id}`}');
});
it('host follows exact message deep links and does not claim SMS delivered', () => {
  const thread = read('app/dashboard/properties/[id]/stays/[stayId]/conversations/[conversationId]/ConversationThread.tsx');
  expect(thread).toContain('initialMessageId');
  expect(thread).toContain('id={`message-${message.id}`}');
  expect(thread).toContain('messageNotificationNotice');
  expect(thread).toContain('json.workflowWarnings');
  expect(read('app/g/[slug]/HostChatWorkflow.tsx')).toContain('json.workflowWarnings');
});
it('a new browser preserves target locators and requires explicit recovery after its own phone proof', () => {
  const chat = read('app/g/[slug]/HostChatWorkflow.tsx');
  expect(chat).toContain('RECOVERY_REQUIRED');
  expect(chat).toContain('recoveryReady');
  expect(chat).toContain('/host-chat/recover');
  expect(chat).toContain('confirm: true');
  expect(chat).toContain('messageId: props.initialMessageId');
  expect(chat).toContain('Open this conversation here');
});
it('concierge handoff and appliance pings report the stored-message and SMS result separately', () => {
  const concierge = read('app/g/[slug]/AiChatWorkflow.tsx');
  expect(concierge).toContain('messageNotificationNotice');
  expect(concierge).toContain('json.messageStored');
  expect(concierge).not.toContain("t('askEscNotice')");
  expect(concierge).not.toContain("t('askAppliancePinged')");
});

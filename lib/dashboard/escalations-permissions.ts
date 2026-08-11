export interface EscalationCapabilities {
  canReceiveEscalations: boolean;
  canReplyGuests: boolean;
  canEditBrain: boolean;
}

export function canViewEscalationInbox(capabilities: EscalationCapabilities): boolean {
  return capabilities.canReceiveEscalations;
}

export function canAnswerEscalation(capabilities: EscalationCapabilities): boolean {
  return capabilities.canReceiveEscalations && capabilities.canReplyGuests;
}

export function canTeachFromEscalation(capabilities: EscalationCapabilities): boolean {
  return canAnswerEscalation(capabilities) && capabilities.canEditBrain;
}

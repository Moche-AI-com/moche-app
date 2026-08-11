export type ServiceRequestStatus =
  | 'new'
  | 'acknowledged'
  | 'in_progress'
  | 'waiting_on_guest'
  | 'resolved'
  | 'closed';

// Keep the detailed database statuses, while allowing the concise host workflow:
// Open -> (optional In progress) -> Completed.
export const ALLOWED_TRANSITIONS: Record<ServiceRequestStatus, readonly ServiceRequestStatus[]> = {
  new: ['acknowledged', 'in_progress', 'resolved', 'closed'],
  acknowledged: ['in_progress', 'waiting_on_guest', 'resolved', 'closed'],
  in_progress: ['waiting_on_guest', 'resolved', 'closed'],
  waiting_on_guest: ['in_progress', 'resolved', 'closed'],
  resolved: ['closed', 'in_progress'],
  closed: [],
};

export function canTransition(from: ServiceRequestStatus, to: ServiceRequestStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

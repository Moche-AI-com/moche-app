import { permanentRedirect } from 'next/navigation';

// The profile shell's document list now lives at /dashboard/profile/documents,
// rendered inside the dashboard. Keep the old URL landing there instead of
// pushing hosts out to the public Legal Center.
export default function ProfileLegalRedirect() {
  permanentRedirect('/dashboard/profile/documents');
}

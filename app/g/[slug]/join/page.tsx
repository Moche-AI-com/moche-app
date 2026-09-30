import type { Metadata } from 'next';
import { JoinWithInvite } from './JoinWithInvite';

// Generic, token-free landing for party invites. The token lives in the URL
// fragment, so this server render (and any link-preview crawler) never sees it.
export const metadata: Metadata = {
  title: 'Join your group’s stay — Moche-AI',
  description: 'Open the house guide, check-in details, local tips and host chat for your stay.',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function JoinPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <JoinWithInvite slug={slug} />;
}

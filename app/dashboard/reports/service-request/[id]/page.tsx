import { permanentRedirect } from 'next/navigation';

// Legacy URL — the printable Service Report moved out of the Reports section
// and into the Service tab's own scope at /dashboard/service-requests/[id].
//
// This route stays as a permanent (308) redirect on purpose: hosts may have
// bookmarked the report URL, and reports already shared by email/text/print
// carry it. Those links must keep working; the redirect sends them to the
// canonical page under the Service tab.
export const dynamic = 'force-dynamic';

export default async function LegacyServiceRequestReportRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  permanentRedirect(`/dashboard/service-requests/${id}`);
}

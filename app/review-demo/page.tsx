import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Demo review-link test | Moche-AI',
  description: 'A clearly labeled test destination for the Moche-AI demo guest portal. No public review is submitted.',
  robots: { index: false, follow: false },
};

export default function DemoReviewPage() {
  return (
    <main style={{ maxWidth: '42rem', margin: '3rem auto', padding: '0 1rem' }}>
      <section className="card" aria-labelledby="demo-review-title" style={{ padding: '1.5rem' }}>
        <p className="muted" style={{ marginTop: 0 }}>Moche-AI demo — test destination only</p>
        <h1 id="demo-review-title">Demo review-link test</h1>
        <p role="status">The link destination was reached. No public review was posted.</p>
        <p>This page tests navigation from the demo guest portal. It is not a booking-platform review form and has no review-submission action.</p>
        <ul>
          <li>Opening this page does not confirm that private feedback was saved.</li>
          <li>Private feedback is saved only when the guest portal confirms the save.</li>
          <li>No rating or comment is published to an external review platform from this page.</li>
        </ul>
        <p className="muted">Return to your original guest-portal tab to continue testing. If this opened in a new tab, you can close this tab.</p>
      </section>
    </main>
  );
}

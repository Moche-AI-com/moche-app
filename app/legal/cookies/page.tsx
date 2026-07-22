import { LegalDocHeader } from '@/components/legal/LegalDocHeader';

export default function CookiesPage() {
  return (
    <article>
      <LegalDocHeader slug="cookies" />

      <p>
        This policy describes the cookies and similar technologies used by Moche.AI and how consent
        is handled. It supplements our <a href="/legal/privacy">Privacy Policy</a>.
      </p>

      <h2>Cookies &amp; trackers we use</h2>
      <table>
        <thead>
          <tr><th>Name / provider</th><th>Category</th><th>Purpose</th></tr>
        </thead>
        <tbody>
          <tr><td>Supabase auth session</td><td>Strictly necessary</td><td>Keeps a host signed in; secures the session.</td></tr>
          <tr><td>Cloudflare Turnstile</td><td>Strictly necessary</td><td>Bot mitigation on guest verification.</td></tr>
          <tr><td>PostHog</td><td>Analytics</td><td>Pseudonymous product analytics for host-side usage.</td></tr>
        </tbody>
      </table>

      <h2>Consent (EU/UK)</h2>
      <p>
        Strictly-necessary cookies are set without consent because the Service cannot function
        without them. Where required in the EU/UK, non-essential analytics are used only on a
        lawful basis and can be declined; declining does not affect access to the core Service.
        Guests interacting with a concierge are not required to accept analytics cookies.
      </p>

      <h2>Managing cookies</h2>
      <p>
        You can control cookies through your browser settings. Blocking strictly-necessary cookies
        may prevent sign-in or guest verification from working.
      </p>
    </article>
  );
}

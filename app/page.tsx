import Link from 'next/link';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth/guards';
import { Logo } from '@/components/Logo';
import { DomeMark } from '@/components/Logo';

export default async function Home() {
  const user = await getUser();
  if (user) redirect('/dashboard');

  return (
    <main>
      {/* Header */}
      <header
        className="wrap"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 72 }}
      >
        <Logo />
        <div style={{ display: 'flex', gap: '.75rem' }}>
          <Link href="/login" className="btn btn-ghost btn-sm">Sign in</Link>
          <Link href="/signup" className="btn btn-primary btn-sm">Get started</Link>
        </div>
      </header>

      {/* Hero */}
      <section className="wrap landing-hero">
        <div style={{ minWidth: 0 }}>
          <span className="badge badge-teal" style={{ marginBottom: '1.25rem' }}>
            Property Brain · Guest Concierge
          </span>
          <h1 style={{ fontSize: 'clamp(2.2rem,5vw,4rem)', lineHeight: 1.05, marginBottom: '1.25rem' }}>
            Your property&apos;s <span className="gradient-text">brain</span>.<br />
            Your guests&apos; first stop.
          </h1>
          <p className="muted" style={{ fontSize: '1.12rem', maxWidth: 520, marginBottom: '2rem' }}>
            Every property gets an AI concierge trained on your own documents. Guests scan a QR code,
            ask in any language, and get instant, grounded answers — no app, no login, no PMS.
          </p>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <Link href="/signup" className="btn btn-primary btn-lg">Create your host account</Link>
            <Link href="/login" className="btn btn-ghost btn-lg">Sign in</Link>
          </div>
          <p className="faint" style={{ fontSize: '.82rem', marginTop: '1rem' }}>
            Free to set up your first property. No credit card to get started.
          </p>
        </div>

        <div style={{ minWidth: 0, position: 'relative' }}>
          <div
            style={{
              position: 'relative',
              borderRadius: 'var(--radius-xl)',
              overflow: 'hidden',
              border: '1px solid var(--border-strong)',
              boxShadow: '0 30px 80px -30px var(--glow-teal)',
              aspectRatio: '4 / 3',
            }}
          >
            <Image
              src="/landing/hero.png"
              alt="A guest asking the Moche.AI concierge about check-in time and getting an instant answer"
              fill
              priority
              sizes="(max-width: 900px) 100vw, 50vw"
              style={{ objectFit: 'cover' }}
            />
          </div>
        </div>
      </section>

      {/* Trust / value strip */}
      <section className="wrap" style={{ paddingBottom: '3rem' }}>
        <div
          className="card"
          style={{
            padding: 'clamp(1.25rem,3vw,2rem)',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))',
            gap: '1.5rem',
            textAlign: 'center',
          }}
        >
          <Stat value="Instant" label="answers, any hour" />
          <Stat value="Any language" label="guests type, we translate" />
          <Stat value="Zero apps" label="just a QR code or link" />
          <Stat value="Your words" label="grounded in your own docs" />
        </div>
      </section>

      {/* How it works */}
      <section className="wrap" style={{ padding: 'clamp(3rem,6vw,5rem) 0' }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <span className="badge badge-coral" style={{ marginBottom: '1rem' }}>How it works</span>
          <h2 style={{ fontSize: 'clamp(1.8rem,4vw,2.6rem)' }}>Live in an afternoon</h2>
          <p className="muted" style={{ maxWidth: 560, margin: '0.5rem auto 0' }}>
            No integrations to wire up. Build the Brain once, print the QR, and let it answer.
          </p>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))',
            gap: '1.25rem',
          }}
        >
          <Step
            n="1"
            title="Build the Brain"
            body="Paste your listing URL, upload the house manual, or type the essentials. We clean, structure, and index everything automatically."
          />
          <Step
            n="2"
            title="Curate the local scene"
            body="Auto-find nearby restaurants, cafes, and essentials from open map data. Approve your favorites and hide the rest — in a couple of clicks."
          />
          <Step
            n="3"
            title="Share the QR code"
            body="Guests scan and ask anything, in their language. The concierge answers from your Brain and quietly flags maintenance for you."
          />
        </div>
      </section>

      {/* Features */}
      <section className="wrap" style={{ padding: 'clamp(1rem,3vw,2rem) 0 clamp(3rem,6vw,5rem)' }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <h2 style={{ fontSize: 'clamp(1.8rem,4vw,2.6rem)' }}>
            One <span className="gradient-text">Brain</span>, every guest question
          </h2>
        </div>
        <div className="landing-features">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '1rem' }}>
            <Feature title="Grounded answers" body="Replies come from your own documents — never made up. Low-confidence questions escalate to you." />
            <Feature title="Local recommendations" body="Host-curated nearby places. Mark favorites, add notes, hide what you don't love." />
            <Feature title="Appliance help" body="Type a make and model; get guest-friendly troubleshooting you can review and save." />
            <Feature title="Maintenance tickets" body="When a guest reports a problem, a ticket is opened and you're notified automatically." />
            <Feature title="Any language" body="Guests ask in their language and read the answer in it. No settings to touch." />
            <Feature title="No app, no login" body="A QR code or link is all a guest needs. Nothing to download, nothing to remember." />
          </div>
          <div style={{ position: 'relative', minWidth: 0 }}>
            <div
              style={{
                position: 'relative',
                borderRadius: 'var(--radius-xl)',
                overflow: 'hidden',
                aspectRatio: '1 / 1',
                border: '1px solid var(--border)',
              }}
            >
              <Image
                src="/landing/brain.png"
                alt="An illustration of the Property Brain: a network of connected home and document nodes"
                fill
                sizes="(max-width: 900px) 100vw, 40vw"
                style={{ objectFit: 'cover' }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="wrap" style={{ paddingBottom: 'clamp(3rem,6vw,5rem)' }}>
        <div
          className="card"
          style={{
            padding: 'clamp(2rem,5vw,3.5rem)',
            textAlign: 'center',
            background: 'var(--grad-warm)',
            border: 'none',
          }}
        >
          <h2 style={{ fontSize: 'clamp(1.6rem,4vw,2.4rem)', color: '#04121a', marginBottom: '.75rem' }}>
            Give every guest a concierge
          </h2>
          <p style={{ color: '#04121a', opacity: 0.85, maxWidth: 520, margin: '0 auto 1.5rem' }}>
            Set up your first property today and see how many questions answer themselves.
          </p>
          <Link
            href="/signup"
            className="btn btn-lg"
            style={{ background: '#04121a', color: '#EAF1FA' }}
          >
            Create your host account
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer
        className="wrap"
        style={{
          borderTop: '1px solid var(--border)',
          padding: '2rem 0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
          <DomeMark size={26} variant="mono" />
          <span className="muted" style={{ fontSize: '.9rem' }}>Moche.AI</span>
        </div>
        <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
          <Link href="/login" className="muted" style={{ fontSize: '.9rem' }}>Sign in</Link>
          <Link href="/signup" className="muted" style={{ fontSize: '.9rem' }}>Get started</Link>
        </div>
        <p className="faint" style={{ fontSize: '.85rem', margin: 0 }}>Built in Somerville, MA</p>
      </footer>
    </main>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="gradient-text" style={{ fontSize: '1.4rem', fontWeight: 700 }}>{value}</div>
      <div className="muted" style={{ fontSize: '.88rem' }}>{label}</div>
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          background: 'var(--surface-2)',
          border: '1px solid var(--border-strong)',
          color: 'var(--teal)',
          fontWeight: 700,
          marginBottom: '1rem',
        }}
      >
        {n}
      </div>
      <h3 style={{ fontSize: '1.15rem', marginBottom: '.5rem' }}>{title}</h3>
      <p className="muted" style={{ fontSize: '.92rem', margin: 0 }}>{body}</p>
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="card" style={{ padding: '1.1rem 1.25rem' }}>
      <h3 style={{ fontSize: '1rem', marginBottom: '.35rem' }}>{title}</h3>
      <p className="muted" style={{ fontSize: '.88rem', margin: 0 }}>{body}</p>
    </div>
  );
}

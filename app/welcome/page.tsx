import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { LAUNCH_DATE_LABEL, FOUNDING_DISCOUNT_PERCENT, FOUNDING_DISCOUNT_MONTHS } from '@/lib/constants';
import { Logo } from '@/components/Logo';
import styles from './welcome.module.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Set up your concierge — Moche-AI',
  description:
    'Your Moche-AI account is live. Add your properties, build each Property Brain, and preview the guest portal before launch.',
  robots: { index: false, follow: false },
};

interface Step {
  id: string;
  title: string;
  body: string;
  href: string;
  cta: string;
  done: boolean;
}

/**
 * Pre-launch onboarding launchpad.
 *
 * What was here before was a holding page: it confirmed the email, said the
 * product ships on January 1 2027, and offered a short survey. A host who was
 * interested enough to create an account and click a confirmation link arrived
 * and found there was nothing they could do for about four months. That is the
 * single worst place in the funnel to hand someone a dead end, and it also cost
 * us the thing we actually want before launch: real properties, real Brains, and
 * real hosts discovering where the setup hurts.
 *
 * So the gate moved. The dashboard is open (see requireLaunchAccess in
 * lib/auth/guards.ts) and the GUEST side is what stays shut, structurally, at
 * the one transition that matters: a property cannot go `live` before the launch
 * date, and every guest surface requires `live`. This page is now the bridge into
 * that work, with real progress read from the database so it stops being a
 * checklist of things we hope the host did and becomes a status of what they have.
 *
 * Signup confirmation links point here (next=/welcome). Nothing redirects here
 * anymore, so a host who has finished the first steps is sent straight to the
 * dashboard rather than shown a page of ticks.
 */
export default async function WelcomePage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');

  const supabase = createClient();
  const accountId = ctx.account.id;

  const { data: properties } = await supabase
    .from('properties')
    .select('id, display_name')
    .eq('host_account_id', accountId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  const propertyCount = properties?.length ?? 0;
  const firstPropertyId = properties?.[0]?.id ?? null;
  const hasProfile = !!ctx.profile.full_name?.trim();

  // brain_items keys off property_id, not the account, so this needs the property
  // ids first. Skipped entirely when there are no properties, where the answer is
  // already known and a query with an empty `in` list is just a wasted round trip.
  let brainCount = 0;
  if (propertyCount > 0) {
    const { count } = await supabase
      .from('brain_items')
      .select('id', { count: 'exact', head: true })
      .in('property_id', (properties ?? []).map((p) => p.id))
      .is('deleted_at', null);
    brainCount = count ?? 0;
  }
  const hasBrain = brainCount > 0;

  const steps: Step[] = [
    {
      id: 'account',
      title: 'Create your account',
      body: 'Done. Your email is confirmed and this account is yours, with nothing billed and no card on file.',
      href: '/dashboard',
      cta: 'Open dashboard',
      done: true,
    },
    {
      id: 'profile',
      title: 'Add your name and contact details',
      body: 'This is what a guest sees when the concierge hands a question to you, and where escalations get sent. Two minutes.',
      href: '/dashboard/profile/details',
      cta: hasProfile ? 'Review details' : 'Complete profile',
      done: hasProfile,
    },
    {
      id: 'property',
      title: 'Add your first property',
      body: 'Name, address, and the basics. If you have a listing URL you can paste it and we will pull what we can as a starting point.',
      href: '/dashboard/properties/new',
      cta: propertyCount > 0 ? 'Add another property' : 'Add a property',
      done: propertyCount > 0,
    },
    {
      id: 'brain',
      title: 'Build the Property Brain',
      body: 'Check-in and check-out, door codes, wifi, house rules, appliances, parking, the local recommendations you repeat every week. This is the part that answers your guests, and the part worth doing before launch day rather than on it.',
      href: firstPropertyId ? `/dashboard/properties/${firstPropertyId}/brain` : '/dashboard/properties/new',
      cta: hasBrain ? 'Keep building' : 'Start the Brain',
      done: hasBrain,
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const nextStep = steps.find((s) => !s.done) ?? null;

  // A host who has finished setup does not need a checklist of ticks; send them
  // to the tool. Checked after the steps are built so there is one definition of
  // "finished" rather than two.
  if (!nextStep) redirect('/dashboard');

  const firstName = ctx.profile.full_name?.trim().split(/\s+/)[0] ?? null;

  return (
    <main className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.brand}>
          <Logo variant="gradient" size={40} />
        </div>

        <header className={styles.head}>
          <p className={styles.eyebrow}>Founding host</p>
          <h1 className={styles.title}>
            {firstName ? `You are in, ${firstName}.` : 'You are in.'} Let us get your concierge built.
          </h1>
          <p className={styles.lede}>
            Your account is live now, not on launch day. Add your properties and build each Property
            Brain at your own pace, preview the guest portal exactly as a guest will see it, and your
            setup switches on for real guests on {LAUNCH_DATE_LABEL}.
          </p>
          <div className={styles.progress}>
            <div className={styles.progressTrack} aria-hidden="true">
              <div
                className={styles.progressFill}
                style={{ width: `${Math.round((doneCount / steps.length) * 100)}%` }}
              />
            </div>
            <p className={styles.progressText}>
              {doneCount} of {steps.length} done
            </p>
          </div>
        </header>

        <ol className={styles.steps}>
          {steps.map((step, i) => {
            const isNext = step.id === nextStep.id;
            return (
              <li
                key={step.id}
                className={[styles.step, step.done ? styles.stepDone : '', isNext ? styles.stepNext : '']
                  .filter(Boolean)
                  .join(' ')}
              >
                <span
                  className={`${styles.stepMark} ${step.done ? styles.stepMarkDone : ''}`}
                  aria-hidden="true"
                >
                  {step.done ? '✓' : i + 1}
                </span>
                <h2 className={styles.stepTitle}>{step.title}</h2>
                <p className={styles.stepBody}>{step.body}</p>
                <p className={styles.stepAction}>
                  <Link
                    className={`btn btn-sm ${isNext ? 'btn-primary' : 'btn-secondary'}`}
                    href={step.href}
                  >
                    {step.cta}
                  </Link>
                </p>
              </li>
            );
          })}
        </ol>

        <section className={styles.note}>
          <h2 className={styles.noteTitle}>What happens on {LAUNCH_DATE_LABEL}</h2>
          <p className={styles.noteBody}>
            Guest links and QR codes switch on, and everything you built starts answering guests. You
            will get an email the day it happens. Until then the guest side is closed, so nothing you
            are still working on can reach a real guest by accident.
          </p>
          <p className={styles.noteBody}>
            Because you signed up before launch, your founding rate is already attached to this
            account: {FOUNDING_DISCOUNT_PERCENT}% off for your first {FOUNDING_DISCOUNT_MONTHS}{' '}
            months, starting the day you choose a plan at launch. Nothing is billed before then and
            we do not hold a card. Pricing is public on the{' '}
            <Link href="/#pricing">homepage</Link>.
          </p>
        </section>

        <p className={styles.footer}>
          Questions about setup? Email us at{' '}
          <Link href="/support">support</Link>. Moche-AI, built in Somerville, MA.
        </p>
      </div>
    </main>
  );
}

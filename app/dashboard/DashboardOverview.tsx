'use client';

import Link from 'next/link';
import {
  MessageCircle,
  Sparkles,
  Clock3,
  ShieldCheck,
  TrendingUp,
  Star,
  Users,
  Gauge,
  BedDouble,
  BrainCircuit,
  Quote,
  ArrowUpRight,
  ThumbsUp,
  Timer,
  type LucideIcon,
} from 'lucide-react';
import type { ValueMetrics, GuestFeedbackSummary, GuestAiFeedbackItem } from '@/lib/dashboard/overview';

function fmt(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// --- Hero value banner ----------------------------------------------------
// The first thing a host sees: a warm, gradient-lit statement of the value the
// concierge has delivered, with the headline number front and center.
export function ValueHero({
  hostName,
  metrics,
}: {
  hostName: string;
  metrics: ValueMetrics;
}) {
  const answered = metrics.questionsAnswered;
  const hasActivity = answered > 0;

  const headline = hasActivity
    ? `Your concierge answered ${fmt(answered)} guest question${answered === 1 ? '' : 's'}`
    : 'Your AI concierge is ready';
  const sub = hasActivity
    ? `That's roughly ${metrics.hoursSaved > 0 ? `${metrics.hoursSaved} hour${metrics.hoursSaved === 1 ? '' : 's'}` : 'time'} you didn't spend answering messages${
        metrics.instantAnswerRate != null ? ` — ${metrics.instantAnswerRate}% resolved instantly, no back-and-forth.` : '.'
      }`
    : 'Once guests start asking questions, this is where you\u2019ll see the value it delivers for every property.';

  return (
    <div className="dash-hero rise-in" data-testid="dashboard-value-hero">
      <div className="dash-hero-glow" aria-hidden />
      <div className="dash-hero-inner">
        <div className="dash-hero-eyebrow">
          <Sparkles size={14} aria-hidden />
          <span>Welcome back{hostName ? `, ${hostName}` : ''}</span>
        </div>
        <h1 className="dash-hero-title">{headline}</h1>
        <p className="dash-hero-sub">{sub}</p>

        {hasActivity && (
          <div className="dash-hero-chips">
            {metrics.questionsThisWeek > 0 && (
              <span className="dash-chip">
                <TrendingUp size={13} aria-hidden /> {fmt(metrics.questionsThisWeek)} this week
              </span>
            )}
            {metrics.avgResponseSeconds != null && (
              <span className="dash-chip">
                <Timer size={13} aria-hidden /> {metrics.avgResponseSeconds}s avg reply
              </span>
            )}
            {metrics.avgConfidencePct != null && (
              <span className="dash-chip">
                <Gauge size={13} aria-hidden /> {metrics.avgConfidencePct}% confidence
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Metric tile ----------------------------------------------------------
interface Metric {
  label: string;
  value: string;
  icon: LucideIcon;
  hint?: string;
  href?: string;
  tone?: 'default' | 'teal' | 'iris' | 'coral';
  attn?: boolean;
}

function MetricTile({ m }: { m: Metric }) {
  const Icon = m.icon;
  const accent =
    m.tone === 'coral' ? 'var(--coral)' : m.tone === 'iris' ? 'var(--iris)' : m.tone === 'teal' ? 'var(--teal)' : 'var(--text)';
  const inner = (
    <div className={`card card-interactive dash-metric${m.attn ? ' dash-metric-attn' : ''}`}>
      <div className="dash-metric-top">
        <span className="dash-metric-label">{m.label}</span>
        <span className="dash-metric-icon" aria-hidden>
          <Icon size={16} aria-hidden />
        </span>
      </div>
      <div className="dash-metric-value" style={{ color: m.attn ? 'var(--coral)' : accent }}>
        {m.value}
      </div>
      {m.hint && <div className="dash-metric-hint">{m.hint}</div>}
    </div>
  );
  return m.href ? (
    <Link href={m.href} style={{ display: 'block' }}>
      {inner}
    </Link>
  ) : (
    inner
  );
}

export function ValueMetricsGrid({ metrics }: { metrics: ValueMetrics }) {
  const tiles: Metric[] = [
    {
      label: 'Questions answered',
      value: fmt(metrics.questionsAnswered),
      icon: MessageCircle,
      hint: metrics.questionsThisWeek > 0 ? `+${fmt(metrics.questionsThisWeek)} this week` : 'All-time by your AI',
      tone: 'teal',
    },
    {
      label: 'Guests helped',
      value: fmt(metrics.guestsHelped),
      icon: Users,
      hint: 'Conversations handled',
      tone: 'iris',
    },
    {
      label: 'Instant-answer rate',
      value: metrics.instantAnswerRate != null ? `${metrics.instantAnswerRate}%` : '—',
      icon: ShieldCheck,
      hint: metrics.instantAnswerRate != null ? 'Resolved without you' : 'No questions yet',
      tone: 'teal',
    },
    {
      label: 'Est. hours saved',
      value: metrics.hoursSaved > 0 ? fmt(metrics.hoursSaved) : '—',
      icon: Clock3,
      hint: 'Time back for you',
      tone: 'iris',
    },
    {
      label: 'Active stays',
      value: fmt(metrics.activeStays),
      icon: BedDouble,
      hint: metrics.activeStays === 0 ? 'No guests in-house' : 'Guests in-house now',
    },
    {
      label: 'Knowledge items',
      value: fmt(metrics.knowledgeItems),
      icon: BrainCircuit,
      hint: 'Powering your concierge',
    },
    {
      label: 'Open escalations',
      value: fmt(metrics.openEscalations),
      icon: MessageCircle,
      href: '/dashboard/escalations',
      hint: metrics.openEscalations > 0 ? 'Needs your attention' : 'All clear',
      attn: metrics.openEscalations > 0,
    },
    {
      label: 'Service requests',
      value: fmt(metrics.openServiceRequests),
      icon: Gauge,
      href: '/dashboard/service-requests',
      hint: metrics.openServiceRequests > 0 ? 'Awaiting action' : 'Nothing pending',
      attn: metrics.openServiceRequests > 0,
    },
  ];

  return (
    <div className="dash-metrics-grid">
      {tiles.map((m) => (
        <div className="rise-in" key={m.label}>
          <MetricTile m={m} />
        </div>
      ))}
    </div>
  );
}

// --- Guest AI feedback feed ----------------------------------------------
function Stars({ rating }: { rating: number | null }) {
  if (rating == null) return null;
  return (
    <span className="dash-fb-stars" aria-label={`${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={13}
          aria-hidden
          style={{ fill: n <= rating ? 'currentColor' : 'transparent', opacity: n <= rating ? 1 : 0.35 }}
        />
      ))}
    </span>
  );
}

function FeedbackRow({ item }: { item: GuestAiFeedbackItem }) {
  return (
    <li className="dash-fb-item" data-testid="guest-feedback-item">
      <span className="dash-fb-quote" aria-hidden>
        <Quote size={15} aria-hidden />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="dash-fb-meta">
          <Stars rating={item.rating} />
          {item.propertyName && <span className="dash-fb-prop">{item.propertyName}</span>}
          <span className="dash-fb-time">{timeAgo(item.createdAt)}</span>
        </div>
        {item.comment ? (
          <p className="dash-fb-comment">{item.comment}</p>
        ) : (
          <p className="dash-fb-comment dash-fb-comment-muted">
            {item.rating != null && item.rating >= 4 ? 'Rated the AI concierge helpful.' : 'Left a rating for the AI concierge.'}
          </p>
        )}
      </div>
    </li>
  );
}

export function GuestFeedbackPanel({ feedback }: { feedback: GuestFeedbackSummary }) {
  const hasFeedback = feedback.count > 0;
  return (
    <section className="card dash-fb-panel rise-in" data-testid="guest-feedback-panel">
      <div className="dash-fb-header">
        <div>
          <h2 className="dash-section-title">
            <ThumbsUp size={16} aria-hidden /> Guest feedback on your AI
          </h2>
          <p className="dash-section-sub">What guests think of the concierge you set up.</p>
        </div>
        {hasFeedback && feedback.satisfactionPct != null && (
          <div className="dash-fb-score" data-testid="guest-feedback-score">
            <div className="dash-fb-score-num">{feedback.satisfactionPct}%</div>
            <div className="dash-fb-score-label">
              satisfied
              <br />
              {feedback.avgRating != null && (
                <span className="dash-fb-avg">
                  <Star size={11} aria-hidden style={{ fill: 'currentColor' }} /> {feedback.avgRating} avg · {fmt(feedback.count)} rating
                  {feedback.count === 1 ? '' : 's'}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {hasFeedback ? (
        <ul className="dash-fb-list">
          {feedback.recent.map((item) => (
            <FeedbackRow key={item.id} item={item} />
          ))}
        </ul>
      ) : (
        <div className="dash-fb-empty" data-testid="guest-feedback-empty">
          <span className="dash-fb-empty-icon" aria-hidden>
            <Sparkles size={22} aria-hidden />
          </span>
          <p className="dash-fb-empty-title">No guest feedback yet</p>
          <p className="dash-fb-empty-sub">
            As soon as guests rate an answer in their portal, their feedback lands here — so you can see the AI earning its keep.
          </p>
        </div>
      )}
    </section>
  );
}

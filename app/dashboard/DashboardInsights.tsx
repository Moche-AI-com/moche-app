'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BedDouble,
  BrainCircuit,
  CheckCircle2,
  ConciergeBell,
  Gauge,
  MessageCircle,
  PieChart,
  RotateCcw,
  Sparkles,
  Star,
  TrendingDown,
  TrendingUp,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { ActivityTrend, TopicRow, FeedEvent, FeedKind } from '@/lib/dashboard/insights';
import { summarizeTrend } from '@/lib/dashboard/trend-summary';
import { CollapseToggle, CollapsibleBody } from '@/components/dashboard/CollapsibleCard';
import { useCollapsedCards, useDismissedFeedItems } from '@/lib/dashboard/use-dashboard-ui-state';

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

// --- Attention strip -------------------------------------------------------
// Everything that needs the host to act, surfaced above the fold. When there is
// nothing to do it flips to a calm "all clear" state rather than disappearing —
// the absence of work is itself reassuring information.

export function AttentionStrip({
  openEscalations,
  openServiceRequests,
  lowRatings,
}: {
  openEscalations: number;
  openServiceRequests: number;
  lowRatings: number;
}) {
  const items = [
    {
      n: openEscalations,
      label: openEscalations === 1 ? 'guest question needs an answer' : 'guest questions need answers',
      href: '/dashboard/escalations',
      icon: MessageCircle,
    },
    {
      n: openServiceRequests,
      label: openServiceRequests === 1 ? 'service request open' : 'service requests open',
      href: '/dashboard/service-requests',
      icon: Wrench,
    },
    { n: lowRatings, label: lowRatings === 1 ? 'low AI rating to review' : 'low AI ratings to review', href: null, icon: Star },
  ].filter((i) => i.n > 0);

  if (items.length === 0) {
    return (
      <div className="dash-attn dash-attn-clear rise-in" data-testid="attention-strip-clear">
        <span className="dash-attn-icon dash-attn-icon-clear" aria-hidden>
          <CheckCircle2 size={16} aria-hidden />
        </span>
        <div className="dash-attn-body">
          <strong className="dash-attn-title">You&rsquo;re all caught up</strong>
          <span className="dash-attn-sub">No open escalations or service requests. Your concierge is handling things.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="dash-attn rise-in" data-testid="attention-strip">
      <span className="dash-attn-icon" aria-hidden>
        <AlertTriangle size={16} aria-hidden />
      </span>
      <div className="dash-attn-body">
        <strong className="dash-attn-title">Needs your attention</strong>
        <div className="dash-attn-chips">
          {items.map((i) => {
            const Icon = i.icon;
            const content = (
              <>
                <Icon size={13} aria-hidden />
                <strong>{i.n}</strong> {i.label}
              </>
            );
            return i.href ? (
              <Link key={i.label} href={i.href} className="dash-attn-chip dash-attn-chip-link">
                {content}
                <ArrowRight size={13} aria-hidden />
              </Link>
            ) : (
              <span key={i.label} className="dash-attn-chip">
                {content}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// --- Activity trend chart --------------------------------------------------
// Hand-rolled SVG bar chart: no charting dependency, no client-side layout
// thrash, and it degrades honestly when a host has only a few data points.
// Bars (not a smoothed area) because daily counts are discrete and mostly
// small — interpolating between them would invent activity that never happened.

const RANGES = [7, 14] as const;
type Range = (typeof RANGES)[number];

export function ActivityTrendCard({ trend }: { trend: ActivityTrend }) {
  // The server always loads the full 14-day window, so switching range is a
  // local slice — instant, no refetch, no loading state to design around.
  const [range, setRange] = useState<Range>(14);
  const { isCollapsed, toggle } = useCollapsedCards();
  const collapsed = isCollapsed('concierge-activity');

  const days = useMemo(() => trend.days.slice(-range), [trend.days, range]);
  // Re-derive the headline numbers for the visible window, using the same
  // helper the server uses, so the stats always agree with the bars.
  const { peakQuestions, totalQuestions, totalAnswers, totalEscalations, deltaPct, busiestDay } = useMemo(
    () => summarizeTrend(days),
    [days],
  );
  const hasData = totalQuestions > 0 || totalAnswers > 0;
  // Keep the empty state keyed to the whole window, not the slice: a host with
  // activity 10 days ago should see "nothing in the last 7 days", not the
  // first-run onboarding copy that tells them to go share a link.
  const hasDataInWindow = trend.totalQuestions > 0 || trend.totalAnswers > 0;

  // Chart geometry in viewBox units. preserveAspectRatio="none" lets it stretch
  // to any container width; non-scaling strokes keep hairlines crisp.
  const W = 100;
  const H = 34;
  const gap = 1.1;
  const barW = Math.max((W - gap * (days.length - 1)) / days.length, 0.5);
  const scale = Math.max(peakQuestions, 1);

  return (
    <section className="card dash-panel rise-in" data-testid="activity-trend-card">
      <div className="dash-panel-head">
        <div>
          <h2 className="dash-section-title">
            <Activity size={16} aria-hidden /> Concierge activity
          </h2>
          <p className="dash-section-sub">Guest questions handled over the last {days.length} days.</p>
        </div>
        <div className="dash-panel-head-aside">
          <div className="dash-range" role="group" aria-label="Activity date range" data-testid="trend-range">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                className={`dash-range-btn${r === range ? ' dash-range-btn-active' : ''}`}
                aria-pressed={r === range}
                onClick={() => setRange(r)}
                data-testid={`trend-range-${r}`}
              >
                {r}d
              </button>
            ))}
          </div>
          {deltaPct != null ? (
            <span className={`dash-delta ${deltaPct >= 0 ? 'dash-delta-up' : 'dash-delta-down'}`} data-testid="trend-delta">
              {deltaPct >= 0 ? <TrendingUp size={13} aria-hidden /> : <TrendingDown size={13} aria-hidden />}
              {deltaPct >= 0 ? '+' : ''}
              {deltaPct}%
            </span>
          ) : (
            hasData && (
              // No prior half-window to compare against, so a percentage would be
              // meaningless. Say "new activity" rather than showing a fake +100%.
              <span className="dash-delta dash-delta-up" data-testid="trend-delta-new">
                <ConciergeBell size={13} aria-hidden /> New activity
              </span>
            )
          )}
          <CollapseToggle collapsed={collapsed} onToggle={() => toggle('concierge-activity')} panelId="concierge-activity-body" label="Concierge activity" />
        </div>
      </div>

      <CollapsibleBody id="concierge-activity-body" collapsed={collapsed}>
      {hasData ? (
        <>
          <div className="dash-chart-stats">
            <div className="dash-chart-stat">
              <span className="dash-chart-stat-num">{fmt(totalQuestions)}</span>
              <span className="dash-chart-stat-lbl">questions asked</span>
            </div>
            <div className="dash-chart-stat">
              <span className="dash-chart-stat-num">{fmt(totalAnswers)}</span>
              <span className="dash-chart-stat-lbl">AI answers sent</span>
            </div>
            {busiestDay && busiestDay.questions > 0 && (
              <div className="dash-chart-stat">
                <span className="dash-chart-stat-num">{busiestDay.label}</span>
                <span className="dash-chart-stat-lbl">busiest day</span>
              </div>
            )}
          </div>

          <div className="dash-chart-wrap">
            <svg
              className="dash-chart"
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              role="img"
              aria-label={`Daily guest questions for the last ${days.length} days. Total ${totalQuestions}.`}
            >
              <defs>
                <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--teal)" stopOpacity="0.95" />
                  <stop offset="100%" stopColor="var(--iris)" stopOpacity="0.55" />
                </linearGradient>
              </defs>
              {/* baseline */}
              <line x1="0" y1={H} x2={W} y2={H} stroke="var(--border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              {days.map((d, i) => {
                const x = i * (barW + gap);
                const h = d.questions > 0 ? Math.max((d.questions / scale) * (H - 4), 1.5) : 0;
                return (
                  <g key={d.date}>
                    {/* Full-height track so zero-activity days still read as days.
                        Uses --chart-track (not surface-2, which is invisible on a card). */}
                    <rect x={x} y={2} width={barW} height={H - 2} fill="var(--chart-track)" rx="0.6" />
                    {h > 0 && <rect x={x} y={H - h} width={barW} height={h} fill="url(#barGrad)" rx="0.6" />}
                    {d.escalations > 0 && <circle cx={x + barW / 2} cy={1.6} r="1.1" fill="var(--coral)" />}
                    <title>{`${d.label}: ${d.questions} question${d.questions === 1 ? '' : 's'}, ${d.answers} answer${
                      d.answers === 1 ? '' : 's'
                    }${d.escalations > 0 ? `, ${d.escalations} escalated` : ''}`}</title>
                  </g>
                );
              })}
            </svg>
            <div className="dash-chart-axis" aria-hidden>
              <span>{days[0]?.label}</span>
              <span>{days[days.length - 1]?.label}</span>
            </div>
          </div>

          {totalEscalations > 0 && (
            <p className="dash-chart-legend">
              <span className="dash-legend-dot" aria-hidden /> Coral dots mark days a question was escalated to you.
            </p>
          )}
        </>
      ) : (
        <div className="dash-panel-empty" data-testid="activity-trend-empty">
          <span className="dash-panel-empty-icon" aria-hidden>
            <Activity size={20} aria-hidden />
          </span>
          <p className="dash-panel-empty-title">
            {hasDataInWindow ? `Nothing in the last ${range} days` : 'No guest activity yet'}
          </p>
          <p className="dash-panel-empty-sub">
            {hasDataInWindow
              ? 'Your concierge was quiet this stretch. Switch to 14 days to see earlier activity.'
              : 'Share a property link with a guest and this chart fills in as your concierge starts fielding questions.'}
          </p>
        </div>
      )}
      </CollapsibleBody>
    </section>
  );
}

// --- Topic breakdown ------------------------------------------------------

export function TopTopicsCard({ topics, brainHref }: { topics: TopicRow[]; brainHref?: string }) {
  const { isCollapsed, toggle } = useCollapsedCards();
  const collapsed = isCollapsed('top-topics');
  return (
    <section className="card dash-panel rise-in" data-testid="top-topics-card">
      <div className="dash-panel-head">
        <div>
          <h2 className="dash-section-title">
            <PieChart size={16} aria-hidden /> What guests ask about
          </h2>
          <p className="dash-section-sub">Your most common question topics.</p>
        </div>
        <div className="dash-panel-head-aside">
          <CollapseToggle collapsed={collapsed} onToggle={() => toggle('top-topics')} panelId="top-topics-body" label="What guests ask about" />
        </div>
      </div>

      <CollapsibleBody id="top-topics-body" collapsed={collapsed}>
      {topics.length > 0 ? (
        <>
          <ul className="dash-topics">
            {topics.map((t) => (
              <li key={t.intent} className="dash-topic" data-testid={`topic-${t.intent}`}>
                <div className="dash-topic-row">
                  <span className="dash-topic-label">{t.label}</span>
                  <span className="dash-topic-count">
                    {t.count} <span className="faint">· {t.pct}%</span>
                  </span>
                </div>
                <div className="dash-topic-track">
                  <div className="dash-topic-fill" style={{ width: `${Math.max(t.pct, 3)}%` }} />
                </div>
              </li>
            ))}
          </ul>
          {brainHref && (
            <Link href={brainHref} className="dash-panel-link">
              Strengthen your Brain on these topics <ArrowUpRight size={14} aria-hidden />
            </Link>
          )}
        </>
      ) : (
        <div className="dash-panel-empty" data-testid="top-topics-empty">
          <span className="dash-panel-empty-icon" aria-hidden>
            <Sparkles size={20} aria-hidden />
          </span>
          <p className="dash-panel-empty-title">No topics yet</p>
          <p className="dash-panel-empty-sub">
            Once guests start asking, we group their questions here so you can see exactly what to document next.
          </p>
        </div>
      )}
      </CollapsibleBody>
    </section>
  );
}

// --- Activity feed --------------------------------------------------------

const FEED_ICON: Record<FeedKind, LucideIcon> = {
  escalation: MessageCircle,
  service_request: Wrench,
  stay: BedDouble,
  feedback: Star,
  brain: BrainCircuit,
};

const FEED_TONE: Record<FeedKind, string> = {
  escalation: 'var(--coral)',
  service_request: 'var(--iris)',
  stay: 'var(--teal)',
  feedback: 'var(--iris)',
  brain: 'var(--teal)',
};

function FeedRow({
  event,
  exiting,
  onDismiss,
}: {
  event: FeedEvent;
  exiting: boolean;
  onDismiss: (id: string) => void;
}) {
  const Icon = FEED_ICON[event.kind] ?? Gauge;
  const body = (
    <>
      <span className="dash-feed-icon" style={{ color: FEED_TONE[event.kind] }} aria-hidden>
        <Icon size={14} aria-hidden />
      </span>
      <span className="dash-feed-main">
        <span className="dash-feed-title">
          {event.title}
          {event.actionable && <span className="dash-feed-flag">Action needed</span>}
        </span>
        {event.detail && <span className="dash-feed-detail">{event.detail}</span>}
        <span className="dash-feed-meta">
          {event.propertyName && <span className="dash-feed-prop">{event.propertyName}</span>}
          <span>{timeAgo(event.createdAt)}</span>
        </span>
      </span>
      {event.href && (
        <span className="dash-feed-arrow" aria-hidden>
          <ArrowUpRight size={14} aria-hidden />
        </span>
      )}
    </>
  );

  return (
    <li
      className={`dash-feed-item${event.actionable ? ' dash-feed-item-attn' : ''}${exiting ? ' dash-feed-item-exiting' : ''}`}
      data-testid="feed-item"
    >
      {/* Dismiss lives as a sibling of the link, not nested inside it — an
          interactive button inside an anchor is invalid HTML and would fire
          the row's navigation on every click. */}
      <div className="dash-feed-row">
        {event.href ? (
          <Link href={event.href} className="dash-feed-link">
            {body}
          </Link>
        ) : (
          <div className="dash-feed-link dash-feed-link-static">{body}</div>
        )}
        <button
          type="button"
          className="dash-feed-dismiss"
          onClick={() => onDismiss(event.id)}
          aria-label={`Clear activity: ${event.title}`}
          data-testid="feed-item-dismiss"
        >
          <X size={14} aria-hidden />
        </button>
      </div>
    </li>
  );
}

export function ActivityFeedCard({ events }: { events: FeedEvent[] }) {
  const { isCollapsed, toggle } = useCollapsedCards();
  const collapsed = isCollapsed('recent-activity');
  const { dismissedIds, dismiss, restore } = useDismissedFeedItems();
  // Two-phase removal: mark exiting so the row can animate out, then actually
  // drop it from the list once the animation finishes. Doing this in one step
  // would just make items vanish, which reads as a glitch rather than a clear.
  const [exitingIds, setExitingIds] = useState<Set<string>>(new Set());

  const visibleEvents = events.filter((e) => !dismissedIds.includes(e.id));
  const clearedCount = events.length - visibleEvents.length;

  const handleDismiss = (id: string) => {
    setExitingIds((prev) => new Set(prev).add(id));
    window.setTimeout(() => {
      dismiss(id);
      setExitingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 220);
  };

  return (
    <section className="card dash-panel rise-in" data-testid="activity-feed-card">
      <div className="dash-panel-head">
        <div>
          <h2 className="dash-section-title">
            <Activity size={16} aria-hidden /> Recent activity
          </h2>
          <p className="dash-section-sub">Everything happening across your properties.</p>
        </div>
        <div className="dash-panel-head-aside">
          {clearedCount > 0 && (
            <button type="button" className="dash-feed-restore" onClick={restore} data-testid="feed-restore">
              <RotateCcw size={12} aria-hidden /> {clearedCount} cleared
            </button>
          )}
          <CollapseToggle collapsed={collapsed} onToggle={() => toggle('recent-activity')} panelId="recent-activity-body" label="Recent activity" />
        </div>
      </div>

      <CollapsibleBody id="recent-activity-body" collapsed={collapsed}>
      {visibleEvents.length > 0 ? (
        <ul className="dash-feed">
          {visibleEvents.map((e) => (
            <FeedRow key={e.id} event={e} exiting={exitingIds.has(e.id)} onDismiss={handleDismiss} />
          ))}
        </ul>
      ) : (
        <div className="dash-panel-empty" data-testid="activity-feed-empty">
          <span className="dash-panel-empty-icon" aria-hidden>
            <Activity size={20} aria-hidden />
          </span>
          <p className="dash-panel-empty-title">{clearedCount > 0 ? 'All caught up' : 'Nothing has happened yet'}</p>
          <p className="dash-panel-empty-sub">
            {clearedCount > 0 ? (
              <>
                You cleared everything in this list.{' '}
                <button type="button" className="dash-panel-empty-link" onClick={restore}>
                  Restore cleared activity
                </button>
              </>
            ) : (
              'Stays, guest questions, service requests, and Brain updates will all stream into this feed.'
            )}
          </p>
        </div>
      )}
      </CollapsibleBody>
    </section>
  );
}

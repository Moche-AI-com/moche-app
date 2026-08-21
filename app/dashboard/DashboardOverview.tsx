'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  MessageCircle,
  Sparkles,
  Clock3,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Star,
  Users,
  Gauge,
  BedDouble,
  BrainCircuit,
  Quote,
  ArrowUpRight,
  ThumbsUp,
  Timer,
  CalendarClock,
  Activity,
  type LucideIcon,
} from 'lucide-react';
import type { ValueMetrics, GuestFeedbackSummary, GuestAiFeedbackItem } from '@/lib/dashboard/overview';
import { CollapseToggle, CollapsibleBody } from '@/components/dashboard/CollapsibleCard';
import { useCollapsedCards } from '@/lib/dashboard/use-dashboard-ui-state';
import styles from './overview.module.css';

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

// "Today" / "Tomorrow" / "Jul 30" — short, scannable date labels for arrival hints.
function dayLabel(iso: string): string {
  const target = new Date(iso);
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOf(target) - startOf(new Date())) / 86400000);
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  return target.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export interface NextArrival {
  guestName: string;
  propertyName: string | null;
  checkIn: string;
}

// --- Count-up hook ----------------------------------------------------------
// Numbers ease from 0 to their real value on mount — a small moment of polish
// that makes the value band feel alive. Disabled under prefers-reduced-motion.
function useCountUp(target: number, durationMs = 700): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return value;
}

// --- Value band -------------------------------------------------------------
// Replaces the old full-width hero + separate metrics grid with one compact,
// scannable band: a short greeting, four grounded value tiles (every number
// traces to a real query — nothing invented), a "right now" operations strip,
// and a latest-win quote pulled from real guest feedback.

function DeltaChip({ thisWeek, prevWeek }: { thisWeek: number; prevWeek: number }) {
  if (prevWeek <= 0 && thisWeek <= 0) return null;
  // No prior-week baseline means a percentage would be meaningless — say "new"
  // rather than showing a fake +100%.
  if (prevWeek <= 0) {
    return (
      <span className={`${styles.vbDelta} ${styles.vbDeltaUp}`}>
        <TrendingUp size={12} aria-hidden /> New this week
      </span>
    );
  }
  const pct = Math.round(((thisWeek - prevWeek) / prevWeek) * 100);
  if (pct === 0) return <span className={`${styles.vbDelta} ${styles.vbDeltaFlat}`}>Level vs last week</span>;
  const up = pct > 0;
  return (
    <span className={`${styles.vbDelta} ${up ? styles.vbDeltaUp : styles.vbDeltaFlat}`}>
      {up ? <TrendingUp size={12} aria-hidden /> : <TrendingDown size={12} aria-hidden />}
      {up ? '+' : ''}
      {pct}% vs last week
    </span>
  );
}

interface ValueTileSpec {
  label: string;
  value: number | null; // null renders an honest em dash, never a fake zero
  suffix?: string;
  icon: LucideIcon;
  hint: string;
  delta?: { thisWeek: number; prevWeek: number };
  href?: string;
}

function ValueTile({ spec }: { spec: ValueTileSpec }) {
  const animated = useCountUp(spec.value ?? 0);
  const Icon = spec.icon;
  const body = (
    <div className={styles.vbTile}>
      <div className={styles.vbTileTop}>
        <p className={styles.vbLabel}>{spec.label}</p>
        <span className={styles.vbIcon} aria-hidden>
          <Icon size={15} aria-hidden />
        </span>
      </div>
      <p className={styles.vbValue}>{spec.value == null ? '—' : `${fmt(animated)}${spec.suffix ?? ''}`}</p>
      {spec.delta ? <DeltaChip thisWeek={spec.delta.thisWeek} prevWeek={spec.delta.prevWeek} /> : null}
      <p className={styles.vbSub}>{spec.hint}</p>
    </div>
  );
  return spec.href ? (
    <Link href={spec.href} style={{ display: 'block' }}>
      {body}
    </Link>
  ) : (
    body
  );
}

export function ValueBand({
  hostName,
  metrics,
  feedback,
  activeStaysHref,
  knowledgeItemsHref,
  upcomingCheckIns,
  nextArrival,
  avgBrainHealthPct,
  propertiesNeedingAttention,
}: {
  hostName: string;
  metrics: ValueMetrics;
  feedback: GuestFeedbackSummary;
  activeStaysHref?: string;
  knowledgeItemsHref?: string;
  upcomingCheckIns?: number;
  nextArrival?: NextArrival | null;
  avgBrainHealthPct?: number | null;
  propertiesNeedingAttention?: number;
}) {
  const hasActivity = metrics.questionsAnswered > 0;
  // Latest win: the newest real guest comment with a 4-5 star rating. If none
  // exists the strip simply doesn't render — no placeholder praise.
  const win = feedback.recent.find((r) => r.rating != null && r.rating >= 4 && r.comment);

  const tiles: ValueTileSpec[] = [
    {
      label: 'Questions answered',
      value: metrics.questionsAnswered,
      icon: MessageCircle,
      hint: 'All-time by your AI',
      delta: { thisWeek: metrics.questionsThisWeek, prevWeek: metrics.questionsPrevWeek },
    },
    {
      label: 'Guests helped',
      value: metrics.guestsHelped,
      icon: Users,
      hint: metrics.guestsThisWeek > 0 ? `+${fmt(metrics.guestsThisWeek)} this week` : 'Conversations handled',
    },
    {
      label: 'Resolved without you',
      value: metrics.instantAnswerRate,
      suffix: '%',
      icon: ShieldCheck,
      hint: metrics.instantAnswerRate != null ? 'No back-and-forth needed' : 'No questions yet',
    },
    {
      label: 'Est. hours saved',
      value: metrics.hoursSaved > 0 ? metrics.hoursSaved : null,
      icon: Clock3,
      hint: 'At ~4 min per answered question',
    },
  ];

  const nowChips: { label: string; value: string; icon: LucideIcon; href?: string; attn?: boolean }[] = [
    { label: 'active stays', value: fmt(metrics.activeStays), icon: BedDouble, href: activeStaysHref },
  ];
  if (upcomingCheckIns != null) {
    nowChips.push({
      label: nextArrival ? `check-ins · next ${dayLabel(nextArrival.checkIn)}` : 'check-ins (3d)',
      value: fmt(upcomingCheckIns),
      icon: CalendarClock,
      href: activeStaysHref,
    });
  }
  if (avgBrainHealthPct != null) {
    const lagging = propertiesNeedingAttention ?? 0;
    nowChips.push({
      label: lagging > 0 ? `brain health · ${lagging} need${lagging === 1 ? 's' : ''} attention` : 'brain health',
      value: `${avgBrainHealthPct}%`,
      icon: Activity,
      href: knowledgeItemsHref,
      attn: lagging > 0,
    });
  }
  nowChips.push({ label: 'knowledge items', value: fmt(metrics.knowledgeItems), icon: BrainCircuit, href: knowledgeItemsHref });
  if (metrics.avgResponseSeconds != null) nowChips.push({ label: 'avg reply', value: `${metrics.avgResponseSeconds}s`, icon: Timer });
  if (metrics.avgConfidencePct != null) nowChips.push({ label: 'confidence', value: `${metrics.avgConfidencePct}%`, icon: Gauge });

  return (
    <section className={styles.vbSection} data-testid="dashboard-value-band" aria-label="Value summary">
      <div className={styles.vbHead}>
        <p className={styles.vbGreeting}>
          <Sparkles size={14} aria-hidden /> Welcome back{hostName ? `, ${hostName}` : ''}
        </p>
        <p className={styles.vbHeadSub}>
          {hasActivity
            ? 'The value your concierge has delivered across your properties.'
            : 'Your AI concierge is ready — as guests start asking questions, the value it delivers lands here.'}
        </p>
      </div>

      <div className={styles.vbBand}>
        {tiles.map((t) => (
          <ValueTile key={t.label} spec={t} />
        ))}
      </div>

      <div className={styles.vbNow} aria-label="Right now">
        {nowChips.map((c) => {
          const Icon = c.icon;
          const inner = (
            <>
              <Icon size={13} aria-hidden />
              <strong>{c.value}</strong>
              <span>{c.label}</span>
            </>
          );
          const cls = `${styles.vbNowChip}${c.attn ? ` ${styles.vbNowChipAttn}` : ''}`;
          return c.href ? (
            <Link key={c.label} href={c.href} className={cls}>
              {inner}
            </Link>
          ) : (
            <span key={c.label} className={cls}>
              {inner}
            </span>
          );
        })}
      </div>

      {win ? (
        <p className={styles.vbWin}>
          <span className={styles.vbWinLabel}>Latest win</span>
          <span>
            &ldquo;{win.comment}&rdquo; — {win.propertyName ?? 'A guest'}
            {win.rating != null ? ` · ${win.rating}/5` : ''} · {timeAgo(win.createdAt)}
          </span>
        </p>
      ) : null}
    </section>
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
  const { isCollapsed, toggle } = useCollapsedCards();
  const collapsed = isCollapsed('guest-feedback');
  return (
    <section className="card dash-fb-panel rise-in" data-testid="guest-feedback-panel">
      <div className="dash-fb-header">
        <div>
          <h2 className="dash-section-title">
            <ThumbsUp size={16} aria-hidden /> Guest feedback on your AI
          </h2>
          <p className="dash-section-sub">What guests think of the concierge you set up.</p>
        </div>
        <div className="dash-panel-head-aside">
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
          <CollapseToggle collapsed={collapsed} onToggle={() => toggle('guest-feedback')} panelId="guest-feedback-body" label="Guest feedback on your AI" />
        </div>
      </div>

      <CollapsibleBody id="guest-feedback-body" collapsed={collapsed}>
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
      </CollapsibleBody>
    </section>
  );
}

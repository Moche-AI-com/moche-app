/**
 * Pure trend math, shared by the server loader and the client range toggle.
 *
 * This lives outside `insights.ts` on purpose: that module is `server-only`
 * (it reaches for the service-role Supabase client), but the dashboard chart
 * lets hosts flip between a 7- and 14-day window without a round trip. The
 * client slices the series it already has and re-summarises it, so both paths
 * must run byte-identical logic or the headline numbers would disagree with
 * the bars they sit above.
 */

export interface TrendDay {
  date: string; // ISO yyyy-mm-dd (UTC day bucket)
  label: string; // short display label, e.g. "Jul 14"
  questions: number; // guest turns that day
  answers: number; // assistant turns that day
  escalations: number; // escalations opened that day
}

export interface TrendSummary {
  totalQuestions: number;
  totalAnswers: number;
  totalEscalations: number;
  /** Max questions in a single day — the chart's y-scale. */
  peakQuestions: number;
  /**
   * % change in questions, latter half of the window vs. the former half.
   * null when the former half is empty: a percentage against a zero baseline
   * is not a number worth showing a host.
   */
  deltaPct: number | null;
  busiestDay: TrendDay | null;
}

export function summarizeTrend(days: TrendDay[]): TrendSummary {
  const totalQuestions = days.reduce((a, d) => a + d.questions, 0);
  const totalAnswers = days.reduce((a, d) => a + d.answers, 0);
  const totalEscalations = days.reduce((a, d) => a + d.escalations, 0);
  const peakQuestions = days.reduce((a, d) => Math.max(a, d.questions), 0);

  const mid = Math.floor(days.length / 2);
  const prev = days.slice(0, mid).reduce((a, d) => a + d.questions, 0);
  const curr = days.slice(mid).reduce((a, d) => a + d.questions, 0);
  const deltaPct = prev > 0 ? Math.round(((curr - prev) / prev) * 100) : null;

  const busiestDay = days.reduce<TrendDay | null>(
    (best, d) => (d.questions > (best?.questions ?? 0) ? d : best),
    null,
  );

  return { totalQuestions, totalAnswers, totalEscalations, peakQuestions, deltaPct, busiestDay };
}

/**
 * Height of a bar in a chart, as a percentage of the tallest value in its series.
 *
 * A period with no activity must draw as empty. The previous inline floors were
 * written as `Math.max(4, (value / max) * 100)`, which applied the 4% minimum to
 * zero values as well, so an empty day or an empty month rendered as a short but
 * clearly visible bar and read as real activity. That is misleading on a
 * dashboard, where a quiet period and a busy one must never look alike.
 *
 * A small floor is still applied to genuinely non-zero values, so a real figure
 * stays visible next to a much larger peak. Only zero stays at zero.
 */
/**
 * Axis ceiling rounded up to a round number, so the top grid line always
 * carries the ceiling and the tallest mark reaches it. Steps are divisible by
 * four so the quarter grid lines land on whole numbers.
 *
 * Shared by every chart that draws an axis (the dashboard's bar plot and the
 * area trend) — a second copy of this in a component would let the two charts
 * disagree about their scale.
 */
const AXIS_STEPS = [4, 8, 20, 40, 100, 200, 400, 1000];

export function niceAxisMax(highest) {
  const target = Math.max(1, Number.isFinite(highest) ? highest : 1);
  return AXIS_STEPS.find((step) => target <= step) ?? Math.ceil(target / 1000) * 1000;
}

/** Five evenly spaced tick values from the ceiling down to zero. */
export function axisTicks(max) {
  return [max, (max * 3) / 4, max / 2, max / 4, 0];
}

export function barHeightPercent(value, max, minVisiblePercent = 4) {
  if (!Number.isFinite(value) || value <= 0) return 0;

  const tallest = Number.isFinite(max) && max > 0 ? max : 1;
  const percent = (value / tallest) * 100;

  return Math.min(100, Math.max(minVisiblePercent, percent));
}

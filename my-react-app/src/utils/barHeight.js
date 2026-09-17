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
export function barHeightPercent(value, max, minVisiblePercent = 4) {
  if (!Number.isFinite(value) || value <= 0) return 0;

  const tallest = Number.isFinite(max) && max > 0 ? max : 1;
  const percent = (value / tallest) * 100;

  return Math.min(100, Math.max(minVisiblePercent, percent));
}

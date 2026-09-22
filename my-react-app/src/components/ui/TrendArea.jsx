import React from 'react';
import { niceAxisMax, axisTicks } from '../../utils/barHeight';

/**
 * Area/line trend for a CONTINUOUS series (hours, days).
 *
 * Discrete periods keep the bar plot — a bar per named day is the right shape.
 * A run of hourly or daily points is a trend, and a line reads it correctly, so
 * this is deliberately its own primitive rather than a bar chart with thin
 * bars.
 *
 * Dependency-free SVG. Strokes use `non-scaling-stroke` so the shape can
 * stretch to any card width without thickening or thin lines. Per-point detail
 * is a native <title> tooltip, so there is no hover state to keep in sync and
 * the chart still works without JavaScript interaction. The axis scale comes
 * from the shared `niceAxisMax`/`axisTicks` helpers, so this chart and the bar
 * plot can never disagree about their ceiling.
 */
export default function TrendArea({
  points = [],
  color = '#390955',
  reference = null,
  height = 140,
  valueSuffix = '',
  ariaLabel,
  className = '',
}) {
  if (!points.length) return null;

  const values = points.map((p) => Number(p.value) || 0);
  const ceiling = niceAxisMax(Math.max(...values, reference?.value || 0, 1));
  const total = values.reduce((a, b) => a + b, 0);
  const n = points.length;

  const xAt = (i) => (n === 1 ? 50 : (i / (n - 1)) * 100);
  const yAt = (v) => 100 - (Math.max(0, Number(v) || 0) / ceiling) * 100;

  const line = points.map((p, i) => `${xAt(i)},${yAt(p.value)}`).join(' ');
  const area = `M0,100 L ${points.map((p, i) => `${xAt(i)},${yAt(p.value)}`).join(' L ')} L 100,100 Z`;
  const ticks = axisTicks(ceiling);

  const showReference = reference && reference.value > 0 && reference.value <= ceiling;
  // More than eight points would crowd the labels, so thin them to
  // first / middle / last and keep the rest as gaps.
  const labelled = n > 8 ? new Set([0, Math.floor((n - 1) / 2), n - 1]) : null;

  return (
    <div
      className={`ed-area ${className}`}
      style={{ '--area-h': `${height}px` }}
      role="img"
      aria-label={ariaLabel || `Trend across ${n} periods, ${total}${valueSuffix ? ` ${valueSuffix}` : ''} in total.`}
    >
      <div aria-hidden="true">
        <div className="ed-area-body">
          <div className="ed-area-y">
            {ticks.map((tick) => (
              <span key={tick}>{tick}{valueSuffix}</span>
            ))}
          </div>
          <div className="ed-area-plot">
            <svg className="ed-area-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
              {ticks.map((tick) => (
                <line
                  key={tick}
                  x1="0" x2="100" y1={yAt(tick)} y2={yAt(tick)}
                  stroke={tick === 0 ? '#d5cbe4' : '#f0eaf8'}
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {showReference && (
                <line
                  x1="0" x2="100" y1={yAt(reference.value)} y2={yAt(reference.value)}
                  stroke="rgba(243, 112, 33, 0.55)"
                  strokeWidth="2"
                  strokeDasharray="4 3"
                  vectorEffect="non-scaling-stroke"
                />
              )}
              <path d={area} fill={color} fillOpacity="0.12" />
              <polyline
                points={line}
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
              {points.map((point, i) => (
                <rect
                  key={`${point.label}-${i}`}
                  x={n === 1 ? 0 : Math.max(0, xAt(i) - 50 / n)}
                  y="0"
                  width={n === 1 ? 100 : 100 / n}
                  height="100"
                  fill="transparent"
                  pointerEvents="all"
                >
                  <title>{`${point.label}: ${point.value}${valueSuffix ? ` ${valueSuffix}` : ''}`}</title>
                </rect>
              ))}
            </svg>
            {showReference && reference.label && (
              <span className="ed-area-ref" style={{ bottom: `${100 - yAt(reference.value)}%` }}>
                {reference.label}
              </span>
            )}
          </div>
        </div>
        <div className="ed-area-x">
          {points.map((point, i) => (
            <span key={`${point.label}-${i}`}>{labelled && !labelled.has(i) ? '' : point.label}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

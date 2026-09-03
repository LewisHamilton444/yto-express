import React, { useRef, useState, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import './Tooltip.css';

const GAP = 8;
const DEFAULT_DELAY = 180;

/**
 * Reusable hover/focus hint. Renders `content` as a small dark pill (same
 * family as the collapsed-sidebar rail tooltip) when the child control is
 * hovered or keyboard-focused.
 *
 * The child is cloned (not wrapped) so its layout, flex semantics, and
 * surrounding spacing are never disturbed — Tooltip can wrap a `flex: 1`
 * grid child, a table-cell badge, or an icon button without side effects.
 *
 * The bubble is rendered through a portal onto <body> and positioned from
 * the trigger's viewport rect, so it is never clipped by overflow containers
 * (tables, scroll areas) and survives transformed ancestors (modal pop-ins).
 * It flips to the opposite side when the preferred side would overflow and
 * repositions on scroll/resize.
 *
 *   <Tooltip content="Notifications — 3 unread">
 *     <button>...</button>
 *   </Tooltip>
 */
export default function Tooltip({ content, children, side = 'top', delay = DEFAULT_DELAY, className = '' }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null); // null = placing (hidden)
  const [placedSide, setPlacedSide] = useState(side);
  const childRef = useRef(null);
  const tipRef = useRef(null);
  const timerRef = useRef(null);
  const coordsRef = useRef(coords);
  coordsRef.current = coords;

  const clearTimer = () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } };

  const hide = useCallback(() => {
    clearTimer();
    setOpen(false);
    setCoords(null);
  }, []);

  const show = useCallback(() => {
    clearTimer();
    setOpen(true);
  }, []);

  const showDelayed = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(show, delay);
  }, [delay, show]);

  // Measure + position the bubble after it mounts, and keep it glued to the
  // trigger while open (scroll anywhere or viewport resize).
  useLayoutEffect(() => {
    if (!open) return;
    const position = () => {
      const trigger = childRef.current;
      const tip = tipRef.current;
      if (!trigger || !tip) return;
      const tr = trigger.getBoundingClientRect();
      const br = tip.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const G = GAP + 4; // +4 safety margin
      let chosen = side;
      let top = 0;
      let left = 0;
      const fitsTop    = tr.top - br.height - G >= 4;
      const fitsBottom = tr.bottom + br.height + G <= vh - 4;
      const fitsLeft   = tr.left - br.width - G >= 4;
      const fitsRight  = tr.right + br.width + G <= vw - 4;
      if (side === 'top'    && !fitsTop    && fitsBottom) chosen = 'bottom';
      if (side === 'bottom' && !fitsBottom && fitsTop)    chosen = 'top';
      if (side === 'left'   && !fitsLeft   && fitsRight)  chosen = 'right';
      if (side === 'right'  && !fitsRight  && fitsLeft)   chosen = 'left';
      if (chosen === 'top')    { top = tr.top - br.height - G;  left = tr.left + tr.width / 2 - br.width / 2; }
      else if (chosen === 'bottom') { top = tr.bottom + G;      left = tr.left + tr.width / 2 - br.width / 2; }
      else if (chosen === 'left')   { top = tr.top + tr.height / 2 - br.height / 2; left = tr.left - br.width - G; }
      else                        { top = tr.top + tr.height / 2 - br.height / 2; left = tr.right + G; }
      // Clamp so it never leaves the viewport.
      left = Math.max(4, Math.min(left, vw - br.width - 4));
      top = Math.max(4, Math.min(top, vh - br.height - 4));
      setPlacedSide(chosen);
      setCoords({ top, left });
    };
    if (!coordsRef.current) requestAnimationFrame(position);
    else position();
    window.addEventListener('scroll', position, true);
    window.addEventListener('resize', position);
    return () => {
      window.removeEventListener('scroll', position, true);
      window.removeEventListener('resize', position);
    };
  }, [open, side]);

  // Merge our handlers with any the child already declares.
  const merge = (ours, theirs) => (e) => { if (theirs) theirs(e); ours(e); };

  const handleBlur = (e) => {
    // Keep it open if focus merely moved inside the same control.
    if (e.currentTarget.contains(e.relatedTarget)) return;
    hide();
  };

  const child = React.Children.only(children);
  const trigger = React.cloneElement(child, {
    ref: childRef,
    onMouseEnter: merge(showDelayed, child.props.onMouseEnter),
    onMouseLeave: merge(hide, child.props.onMouseLeave),
    onFocus:      merge(show, child.props.onFocus),
    onBlur:       merge(handleBlur, child.props.onBlur),
    onMouseDown:  merge(hide, child.props.onMouseDown),
  });

  return (
    <React.Fragment>
      {trigger}
      {open && content &&
        createPortal(
          <span
            ref={tipRef}
            role="tooltip"
            className={`yt-tip__bubble yt-tip__bubble--${placedSide}${coords ? ' yt-tip__bubble--visible' : ''}${className ? ' ' + className : ''}`}
            style={coords ? { top: coords.top, left: coords.left } : undefined}
          >
            {content}
          </span>,
          document.body
        )}
    </React.Fragment>
  );
}

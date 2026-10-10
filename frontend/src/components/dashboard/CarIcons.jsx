/**
 * Car control glyphs Phosphor doesn't have, drawn like the symbols on real
 * dashboard buttons. Stroke 1.5 to match Phosphor's regular weight.
 */

const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true",
};

/**
 * Hazard symbol: two nested triangles. The inner one is the outer scaled to
 * 0.42 about the centroid so the gap is even on all sides.
 */
export function HazardIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <path d="M12 3.4 21.6 19.9 H2.4 Z" />
      <path d="M12 9.78 16.03 16.71 H7.97 Z" />
    </svg>
  );
}

/** Front defogger: wavy arrows in a windscreen. */
export function FrontDefogIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <path d="M3.5 17.5 C 5 9.5, 8 6.5, 12 6.5 C 16 6.5, 19 9.5, 20.5 17.5 Z" />
      <path d="M8.5 15.5 c 0 -1.2 1.2 -1.4 1.2 -2.6 s -1.2 -1.4 -1.2 -2.6" />
      <path d="M12 15.5 c 0 -1.2 1.2 -1.4 1.2 -2.6 s -1.2 -1.4 -1.2 -2.6" />
      <path d="M15.5 15.5 c 0 -1.2 1.2 -1.4 1.2 -2.6 s -1.2 -1.4 -1.2 -2.6" />
    </svg>
  );
}

/** Rear defogger: wavy arrows in a rear window. */
export function RearDefogIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <rect x="3.5" y="6.5" width="17" height="11" rx="2.5" />
      <path d="M8.5 15 c 0 -1.1 1.2 -1.3 1.2 -2.5 s -1.2 -1.4 -1.2 -2.5" />
      <path d="M12 15 c 0 -1.1 1.2 -1.3 1.2 -2.5 s -1.2 -1.4 -1.2 -2.5" />
      <path d="M15.5 15 c 0 -1.1 1.2 -1.3 1.2 -2.5 s -1.2 -1.4 -1.2 -2.5" />
    </svg>
  );
}

/**
 * Front fog lamp: lamp facing left, beams angled down, crossed by a wavy line.
 */
export function FrontFogIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <path d="M14.5 6 C 20.5 6, 20.5 18, 14.5 18 Z" />
      <path d="M11.5 7.5 L 3.5 9.5" />
      <path d="M11.5 12 L 3.5 14" />
      <path d="M11.5 16.5 L 3.5 18.5" />
      <path d="M8 5 q -1.4 2.3 0 4.7 q 1.4 2.3 0 4.6 q -1.4 2.3 0 4.7" />
    </svg>
  );
}

/** Rear fog lamp: lamp facing right, level beams. */
export function RearFogIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <path d="M9.5 6 C 3.5 6, 3.5 18, 9.5 18 Z" />
      <path d="M12.5 8 H 20.5" />
      <path d="M12.5 12 H 20.5" />
      <path d="M12.5 16 H 20.5" />
      <path d="M16.5 5 q -1.4 2.3 0 4.7 q 1.4 2.3 0 4.6 q -1.4 2.3 0 4.7" />
    </svg>
  );
}

/** Wipers: an arm across a windscreen. */
export function WiperIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <path d="M3.5 18 C 5 10.5, 8 7.5, 12 7.5 C 16 7.5, 19 10.5, 20.5 18 Z" />
      <g className="wiper-arm">
        <path d="M6.5 18 L 15.5 9" />
        <path d="M15 8.5 l 1.6 1.6" />
      </g>
      <path d="M10 4.6 c 0.9 -0.7 1.9 -0.7 2.8 0" />
      <path d="M13.8 3.4 c 0.9 -0.7 1.9 -0.7 2.8 0" />
    </svg>
  );
}

/** Heated seat in profile; the small side indicator identifies the seat. */
export function SeatSideIcon({ side = "left", size = 16 }) {
  const isLeft = side === "left";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <path d="M5 4.5 7.5 15 H17 M6 18 H18 M9 18 V21 M16 18 V21" />
      <path d="M11 12 c-1.5-1.5 1.5-2.5 0-4 M15 12 c-1.5-1.5 1.5-2.5 0-4 M19 12 c-1.5-1.5 1.5-2.5 0-4" />
      <path d={isLeft ? "M3 9 H1.5" : "M21 15 H22.5"} strokeWidth="2.5" />
    </svg>
  );
}

/**
 * Automotive glyphs lucide does not carry.
 *
 * Drawn to match the symbols moulded onto real dashboard buttons, because a
 * driver already knows those shapes — a generic "wind" or "droplet" icon would
 * make them read the tooltip instead. Stroke-only and currentColor, so they
 * inherit button state and theme like every lucide icon beside them.
 */

const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true",
};

/**
 * The hazard symbol: one triangle nested inside another.
 *
 * Not lucide's TriangleAlert, which puts an exclamation mark inside a single
 * triangle — that is a generic warning sign. The moulded button in a car is
 * two bare outlined triangles, and that is the shape a driver's eye is looking
 * for.
 *
 * The inner triangle is the outer one scaled to 0.42 about their shared
 * centroid, which keeps the gap equal on all three sides — picking the
 * coordinates by eye left the two bases closer together than the stroke was
 * wide, so they merged into one thick line. That leaves 3.2 units between the
 * centrelines, about 1.3px of daylight once both strokes are drawn at 18px.
 *
 * Stroke is 1.5 rather than the shared 1.75: two nested outlines in an 18px
 * box need the extra room, and at this size the difference is invisible
 * beside the other glyphs.
 */
export function HazardIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={1.5}>
      <path d="M12 3.4 21.6 19.9 H2.4 Z" />
      <path d="M12 9.78 16.03 16.71 H7.97 Z" />
    </svg>
  );
}

/** Three wavy arrows rising inside a raked windscreen. */
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

/** The same waves inside the squarer outline of a rear screen. */
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

/** A wiper arm sweeping a windscreen, with the spray it clears. */
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

/**
 * Which seat a heater button belongs to: two cushions seen from above, the
 * controlled one filled. Cheaper to read at a glance than an L/R letter.
 */
export function SeatSideIcon({ side = "left", size = 16 }) {
  const isLeft = side === "left";
  return (
    <svg width={size} height={size * 0.62} viewBox="0 0 16 10" aria-hidden="true">
      <rect
        x="0.75" y="0.75" width="6" height="8.5" rx="1.6"
        fill={isLeft ? "currentColor" : "none"}
        stroke="currentColor" strokeWidth="1.2" opacity={isLeft ? 1 : 0.45}
      />
      <rect
        x="9.25" y="0.75" width="6" height="8.5" rx="1.6"
        fill={isLeft ? "none" : "currentColor"}
        stroke="currentColor" strokeWidth="1.2" opacity={isLeft ? 0.45 : 1}
      />
    </svg>
  );
}

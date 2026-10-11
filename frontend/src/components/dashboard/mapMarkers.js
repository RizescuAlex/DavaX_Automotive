// Map marker icons in the theme's colours. Glyph paths from Phosphor.

const GAS_PUMP =
  "M241,69.66,221.66,50.34a8,8,0,0,0-11.32,11.32L229.66,81A8,8,0,0,1,232,86.63V168a8,8,0,0,1-16,0V128a24,24,0,0,0-24-24H176V56a24,24,0,0,0-24-24H72A24,24,0,0,0,48,56V208H32a8,8,0,0,0,0,16H192a8,8,0,0,0,0-16H176V120h16a8,8,0,0,1,8,8v40a24,24,0,0,0,48,0V86.63A23.85,23.85,0,0,0,241,69.66ZM64,208V56a8,8,0,0,1,8-8h80a8,8,0,0,1,8,8V208Zm80-96a8,8,0,0,1-8,8H88a8,8,0,0,1,0-16h48A8,8,0,0,1,144,112Z";
const WARNING =
  "M236.8,188.09,149.35,36.22h0a24.76,24.76,0,0,0-42.7,0L19.2,188.09a23.51,23.51,0,0,0,0,23.72A24.35,24.35,0,0,0,40.55,224h174.9a24.35,24.35,0,0,0,21.33-12.19A23.51,23.51,0,0,0,236.8,188.09ZM120,104a8,8,0,0,1,16,0v40a8,8,0,0,1-16,0Zm8,88a12,12,0,1,1,12-12A12,12,0,0,1,128,192Z";
function icon(svg, width, height, anchorX, anchorY) {
  const { maps } = window.google;
  return {
    url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg),
    scaledSize: new maps.Size(width, height),
    anchor: new maps.Point(anchorX, anchorY),
  };
}

function badge({ fill, ring, glyph, glyphColor }) {
  return icon(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <rect x="1.5" y="1.5" width="29" height="29" rx="9" fill="${fill}" stroke="${ring}" stroke-width="2"/>
      <path transform="translate(7 7) scale(0.0703)" d="${glyph}" fill="${glyphColor}"/>
    </svg>`,
    32, 32, 16, 16
  );
}

/** @param {(name: string) => string} token  reads a CSS custom property */
export function destinationIcon(token) {
  return icon(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42">
      <path d="M16 40C16 40 3.5 25 3.5 15a12.5 12.5 0 0 1 25 0C28.5 25 16 40 16 40Z"
        fill="${token("--text-primary")}" stroke="${token("--surface-base")}" stroke-width="2"/>
      <circle cx="16" cy="15" r="4.5" fill="${token("--surface-base")}"/>
    </svg>`,
    32, 42, 16, 40
  );
}

// Planned stops are solid, suggested ones outlined.
export function fuelStopIcon(token, planned = true) {
  return planned
    ? badge({
        fill: token("--text-primary"),
        ring: token("--surface-base"),
        glyph: GAS_PUMP,
        glyphColor: token("--surface-base"),
      })
    : badge({
        fill: token("--surface-secondary"),
        ring: token("--border-strong"),
        glyph: GAS_PUMP,
        glyphColor: token("--text-primary"),
      });
}


export function weatherIcon(token) {
  return badge({ fill: token("--surface-secondary"), ring: token("--color-warning"), glyph: WARNING, glyphColor: token("--color-warning") });
}

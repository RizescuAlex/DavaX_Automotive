/**
 * A dock control's setting as lit segments: seat heat and A/C, both 0–3.
 *
 * It sits where the other dock buttons carry their word, so every button in
 * the strip reads the same way: an icon, then what it is set to. Segments
 * take the button's text colour — heat orange on a warm seat, dark on the
 * solid face of a running A/C — and unlit ones stay faintly visible, so the
 * control always shows it has steps rather than looking like an on/off.
 */
export default function LevelMeter({ level, max }) {
  return (
    <span className="level-meter" aria-hidden="true">
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < level ? "lit" : ""} />
      ))}
    </span>
  );
}

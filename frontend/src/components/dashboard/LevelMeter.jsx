/**
 * Setting level as segments (seat heat, A/C). Segments use the button's text
 * colour; unlit ones stay faint so the steps are always visible.
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

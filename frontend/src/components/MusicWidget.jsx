import { Pause, Play, Volume2 } from "lucide-react";
export default function MusicWidget({
  track,
  isPlaying,
  onTogglePlay,
  volume,
  onVolumeChange,
}) {
  return (
    <section className="music-widget" aria-label="Current music">
      <div className="album-art">
        {track.image_url ? (
          <img src={track.image_url} alt={`${track.album} album cover`} />
        ) : (
          track.album
        )}
      </div>
      <div className="music-widget-copy">
        <strong>{track.title}</strong>
        <span>{track.artist}</span>
      </div>
      <button
        className="widget-play"
        type="button"
        onClick={onTogglePlay}
        aria-label={isPlaying ? "Pause music" : "Play music"}
      >
        {isPlaying ? (
          <Pause size={15} fill="currentColor" />
        ) : (
          <Play size={15} fill="currentColor" />
        )}
      </button>
      <div className="volume-control">
        <Volume2 size={14} />
        <input
          aria-label="Volume"
          type="range"
          min="0"
          max="100"
          value={volume}
          onChange={(event) => onVolumeChange(Number(event.target.value))}
        />
      </div>
    </section>
  );
}

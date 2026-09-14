import { Heart, ListMusic, SkipBack, SkipForward } from "lucide-react";
export default function MusicPage({
  track,
  isPlaying,
  onTogglePlay,
  onNextTrack,
  onPreviousTrack,
  isChangingTrack,
  onSeek,
}) {

  function formatTime(milliseconds = 0) {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = String(totalSeconds % 60).padStart(2, "0");

    return `${minutes}:${seconds}`;
  }

  return (
    <aside className="app-panel music-panel">
      <div className="panel-header">
        <div>
          <p className="panel-kicker">Now playing</p>
          <h1>Music</h1>
        </div>
        <button className="ghost-icon" type="button" aria-label="Music queue">
          <ListMusic size={19} />
        </button>
      </div>
      <div className="music-hero-art">
        {track.image_url ? (
          <img src={track.image_url} alt={`${track.album} album cover`} />
        ) : (
          track.album
        )}
      </div>
      <div className="music-now">
        <div>
          <h2>{track.title}</h2>
          <p>{track.artist}</p>
        </div>
        <button className="ghost-icon" type="button" aria-label="Like track">
          <Heart size={19} />
        </button>
      </div>
      <div className="music-progress">
        <input
          type="range"
          min="0"
          max={track.duration_ms || 1}
          value={Math.min(track.progress_ms || 0, track.duration_ms || 1)}
          onChange={(event) => onSeek(Number(event.target.value))}
          aria-label="Track progress"
        />
        <div>
          <span>{formatTime(track.progress_ms)}</span>
          <span>{formatTime(track.duration_ms)}</span>
        </div>
      </div>
      <div className="music-controls">
        <button
          className="ghost-icon"
          type="button"
          aria-label="Previous track"
          onClick={onPreviousTrack}
          disabled={isChangingTrack}
        >
          <SkipBack size={20} fill="currentColor" />
        </button>
        <button
          className="main-play"
          type="button"
          onClick={onTogglePlay}
          aria-label={isPlaying ? "Pause music" : "Play music"}
        >
          {isPlaying ? "Ⅱ" : "▶"}
        </button>
        <button
          className="ghost-icon"
          type="button"
          aria-label="Next track"
          onClick={onNextTrack}
          disabled={isChangingTrack}
        >
          <SkipForward size={20} fill="currentColor" />
        </button>
      </div>
    </aside>
  );
}

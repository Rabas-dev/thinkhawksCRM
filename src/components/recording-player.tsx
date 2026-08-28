"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause } from "lucide-react";
import { cn } from "@/lib/utils";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Replaces the browser's native <audio controls> for call recordings — its
 * built-in seek bar renders at only a few pixels tall inside our compact
 * h-8 footprint, making it effectively undraggable. This drives a hidden
 * <audio> element with a full-width, deliberately oversized range input
 * instead, so the whole recording is reachable with one drag.
 */
export function RecordingPlayer({ src, className }: { src: string; className?: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seeking, setSeeking] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => {
      if (!seeking) setCurrent(audio.currentTime);
    };
    const onLoaded = () => setDuration(audio.duration || 0);
    const onEnd = () => setPlaying(false);
    const onError = () => setLoadError(true);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("ended", onEnd);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("ended", onEnd);
      audio.removeEventListener("error", onError);
    };
  }, [seeking]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play();
      setPlaying(true);
    }
  }

  function onSeekInput(e: React.ChangeEvent<HTMLInputElement>) {
    setSeeking(true);
    setCurrent(Number(e.target.value));
  }

  function commitSeek(e: React.SyntheticEvent<HTMLInputElement>) {
    const audio = audioRef.current;
    const value = Number((e.target as HTMLInputElement).value);
    if (audio) audio.currentTime = value;
    setSeeking(false);
  }

  if (loadError) {
    return <span className={cn("text-xs text-muted", className)}>Recording unavailable</span>;
  }

  return (
    <div className={cn("flex items-center gap-2 rounded-lg border border-border bg-surface px-2 py-1.5", className)}>
      <audio ref={audioRef} src={src} preload="metadata" className="hidden" />
      <button
        type="button"
        onClick={togglePlay}
        title={playing ? "Pause" : "Play"}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-white cursor-pointer"
      >
        {playing ? <Pause size={11} /> : <Play size={11} className="ml-0.5" />}
      </button>
      <span className="w-9 shrink-0 font-mono text-[10px] tabular-nums text-muted">{formatTime(current)}</span>
      <input
        type="range"
        min={0}
        max={duration || 0}
        step={0.05}
        value={Math.min(current, duration || 0)}
        onChange={onSeekInput}
        onMouseUp={commitSeek}
        onTouchEnd={commitSeek}
        onKeyUp={commitSeek}
        aria-label="Seek recording"
        className="recording-seek min-w-0 flex-1"
      />
      <span className="w-9 shrink-0 font-mono text-[10px] tabular-nums text-muted">{formatTime(duration)}</span>
    </div>
  );
}

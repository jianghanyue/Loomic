"use client";

import { useCallback, useRef, useState } from "react";
import { Play } from "lucide-react";

type VideoCanvasElementProps = {
  src: string;
  width: number;
  height: number;
};

/**
 * Lightweight inline video player rendered inside Excalidraw embeddable elements.
 *
 * Behavior:
 * - Hover-to-play: auto-play (muted) on mouse enter, pause on mouse leave
 * - Click-to-toggle: clicking toggles play/pause
 * - Play icon overlay when paused
 * - Keeps playback clicks local while allowing the React Flow node to be selected
 */
export function VideoCanvasElement({
  src,
  width,
  height,
}: VideoCanvasElementProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  const play = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.play().catch(() => {
      // Autoplay may be blocked by the browser; fail silently
    });
    setPlaying(true);
  }, []);

  const pause = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    setPlaying(false);
  }, []);

  const handleMouseEnter = useCallback(() => {
    play();
  }, [play]);

  const handleMouseLeave = useCallback(() => {
    pause();
  }, [pause]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (playing) {
        pause();
      } else {
        play();
      }
    },
    [playing, play, pause],
  );

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    if (playing) pause();
    else play();
  }, [pause, play, playing]);

  const stopWheelPropagation = useCallback((e: React.SyntheticEvent) => {
    e.stopPropagation();
  }, []);

  return (
    <div
      style={{ width, height }}
      className="relative flex items-center justify-center overflow-hidden rounded-lg bg-black"
      onWheel={stopWheelPropagation}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
    >
      <video
        ref={videoRef}
        src={src}
        muted
        loop
        playsInline
        preload="metadata"
        className="h-full w-full object-contain"
      />

      {/* Play icon overlay — visible when paused */}
      {!playing && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20 transition-opacity duration-200">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm">
            <Play className="h-5 w-5 text-white" fill="white" />
          </div>
        </div>
      )}
    </div>
  );
}

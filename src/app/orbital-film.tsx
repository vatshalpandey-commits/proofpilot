"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

/** Decorative footage: never represents agent activity or tool execution. */
export function OrbitalFilm({ transition = false }: { transition?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    let visible = false;
    let expired = false;
    let disposed = false;
    const sync = () => {
      if (disposed) return;
      if (paused || !visible || expired || document.hidden || motion.matches || connection?.saveData) {
        element.pause();
        return;
      }
      if (!element.getAttribute("src")) element.src = "/motion/orbit.mp4";
      void element.play().catch(() => {
        // Autoplay may be denied; the poster remains available.
      });
    };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); }, { threshold: .05 });
    observer.observe(element);
    motion.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    const timer = transition ? window.setTimeout(() => { expired = true; element.pause(); }, 850) : undefined;
    return () => {
      disposed = true;
      observer.disconnect();
      motion.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
      if (timer !== undefined) window.clearTimeout(timer);
      element.pause();
    };
  }, [paused, transition]);

  return <div className={transition ? "orbital-transition" : "orbital-film"} aria-hidden={transition || undefined}>
    <video ref={video} muted playsInline loop={!transition} preload="none" poster="/motion/orbit-poster.webp" aria-hidden="true" tabIndex={-1} />
    {!transition && <>
      <div className="film-caption"><span>Perspective changes everything.</span><small>An original orbital study · Decorative motion</small></div>
      <button className="film-control" aria-label={paused ? "Play decorative film" : "Pause decorative film"} aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? <Play size={15}/> : <Pause size={15}/>}</button>
    </>}
  </div>;
}

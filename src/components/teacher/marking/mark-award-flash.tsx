"use client";

import { useSyncExternalStore } from "react";

export type MarkFlashPayload = {
  /** Number selected, or "NA". */
  value: number | "NA";
  token: number;
};

function subscribeReducedMotion(onChange: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Temporary centre-of-viewer mark confirmation — number only inside a large circle.
 * Parent should be a non-scrolling overlay (or sticky equivalent) over the viewer.
 * pointer-events: none so it never blocks further marking.
 */
export function MarkAwardFlash({
  flash,
}: {
  flash: MarkFlashPayload | null;
}) {
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotion,
    () => false,
  );

  if (!flash) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none absolute inset-0 z-[15] flex items-center justify-center"
    >
      <div
        key={flash.token}
        className={
          reducedMotion
            ? "animate-[markFade_500ms_ease-out_forwards]"
            : "animate-[markPop_780ms_ease-out_forwards]"
        }
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: "7.5rem",
          height: "7.5rem",
          borderRadius: "9999px",
          background: "rgba(15, 23, 42, 0.94)",
          color: "#fff",
          fontSize: flash.value === "NA" ? "2.25rem" : "3rem",
          fontWeight: 700,
          letterSpacing: "0.02em",
          boxShadow: "0 10px 32px rgba(15, 23, 42, 0.32)",
        }}
      >
        <span className="tabular-nums">{flash.value}</span>
      </div>
      <style>{`
        @keyframes markPop {
          0% { opacity: 0; transform: scale(0.85); }
          35% { opacity: 1; transform: scale(1.12); }
          55% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(0.96); }
        }
        @keyframes markFade {
          0% { opacity: 0; }
          20% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

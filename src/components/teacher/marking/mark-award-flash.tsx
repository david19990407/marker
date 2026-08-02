"use client";

import { useSyncExternalStore } from "react";
import { formatMarksLabel } from "@/lib/marking/annotation-types";

export type MarkFlashPayload = {
  awarded: number;
  maximum: number;
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
 * Temporary centre-of-viewer mark confirmation.
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
          minWidth: "5.5rem",
          padding: "0.65rem 1.25rem",
          borderRadius: "0.75rem",
          background: "rgba(15, 23, 42, 0.92)",
          color: "#fff",
          fontSize: "2rem",
          fontWeight: 700,
          letterSpacing: "0.02em",
          boxShadow: "0 8px 28px rgba(15, 23, 42, 0.28)",
        }}
      >
        <span className="tabular-nums">
          {formatMarksLabel(flash.awarded)} / {formatMarksLabel(flash.maximum)}
        </span>
      </div>
      <style>{`
        @keyframes markPop {
          0% { opacity: 0; transform: scale(0.85); }
          35% { opacity: 1; transform: scale(1.1); }
          55% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(1); }
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

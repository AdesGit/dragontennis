"use client";

import { useEffect, useState } from "react";

type CountdownProps = {
  startTime: number;
  endTime: number;
  durationMin: number;
  /** Diameter of the progress ring in px. Set 0 to hide the ring. */
  size?: number;
};

/** Live remaining-time display: ticks every second, with a circular progress ring. */
export function Countdown({ startTime, endTime, durationMin, size = 44 }: CountdownProps) {
  const [now, setNow] = useState<number>(startTime);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remainingMs = Math.max(0, endTime - now);
  const totalMs = durationMin * 60 * 1000;
  const pct = totalMs > 0 ? Math.max(0, Math.min(1, remainingMs / totalMs)) : 0;
  const mins = Math.floor(remainingMs / 60000);
  const secs = Math.floor((remainingMs % 60000) / 1000);

  const stroke = 4;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;

  return (
    <div className="flex items-center gap-2">
      {size > 0 && (
        <svg width={size} height={size} className="-rotate-90 shrink-0">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            strokeWidth={stroke}
            className="fill-none stroke-muted"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - pct)}
            className="fill-none stroke-accent transition-[stroke-dashoffset] duration-1000 ease-linear"
          />
        </svg>
      )}
      <span className="tabular-nums text-sm font-medium">
        {mins} min {secs.toString().padStart(2, "0")} s
      </span>
    </div>
  );
}

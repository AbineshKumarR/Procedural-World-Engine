// src/components/FPSChart.jsx
import React, { useEffect, useState } from 'react';

/**
 * Lightweight SVG sparkline of FPS using simRef.recentSamples.
 * Props:
 *  - simRef: React ref to SimulationController
 *  - width, height: size in px
 */
export default function FPSChart({ simRef, width = 200, height = 48 }) {
  const [points, setPoints] = useState([]);

  useEffect(() => {
    let mounted = true;
    const tick = () => {
      const sim = simRef?.current;
      if (!sim) return;
      const samples = sim.recentSamples || [];
      const fpsVals = samples.map((s) => s.fps || 0).slice(-120);
      if (mounted) setPoints(fpsVals);
    };
    const id = setInterval(tick, 250);
    tick();
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [simRef]);

  if (!points || points.length === 0) {
    return (
      <div className="flex items-center gap-2">
        <svg width={width} height={height}>
          <rect width={width} height={height} fill="rgba(255,255,255,0.03)" />
        </svg>
        <div className="text-xs text-slate-300">FPS (warming up)</div>
      </div>
    );
  }

  const max = Math.max(...points, 60);
  const min = Math.min(...points, 0);
  const len = points.length;
  const stepX = width / Math.max(1, len - 1);
  const path = points
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / Math.max(1e-6, max - min)) * height;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');

  const latest = Math.round(points[points.length - 1]);

  return (
    <div className="flex items-center gap-3">
      <svg width={width} height={height} className="rounded bg-white/3" style={{ padding: 4 }}>
        <path
          d={path}
          fill="none"
          stroke="rgba(99,102,241,0.95)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div>
        <div className="text-sm font-semibold">{latest} FPS</div>
        <div className="text-xs text-slate-300">
          min {Math.round(min)} — max {Math.round(max)}
        </div>
      </div>
    </div>
  );
}

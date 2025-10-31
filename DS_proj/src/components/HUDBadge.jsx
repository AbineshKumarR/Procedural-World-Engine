// src/components/HUDBadge.jsx
import React, { useEffect, useState } from 'react';

function Sparkline({ values = [], w = 120, h = 28, color = 'rgba(99,102,241,0.95)' }) {
  if (!values.length)
    return (
      <svg width={w} height={h}>
        <rect width={w} height={h} fill="rgba(255,255,255,0.02)" />
      </svg>
    );
  const max = Math.max(...values);
  const min = Math.min(...values);
  const len = values.length;
  const step = w / Math.max(1, len - 1);
  const path = values
    .map((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / Math.max(1e-6, max - min)) * h;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
  return (
    <svg width={w} height={h}>
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export default function HUDBadge({ simRef, poll = 250 }) {
  const [metrics, setMetrics] = useState({
    fps: 0,
    chunksLoaded: 0,
    entityCount: 0,
    poolStats: {},
    recentSamples: [],
  });

  useEffect(() => {
    let mounted = true;
    const tick = () => {
      const sim = simRef?.current;
      if (!sim) return;
      const m = sim.getMetrics ? sim.getMetrics() : {};
      if (!mounted) return;
      setMetrics((prev) => ({ ...prev, ...m }));
    };
    tick();
    const id = setInterval(tick, poll);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [simRef, poll]);

  const fpsSeries = (metrics.recentSamples || []).map((s) => s.fps || 0).slice(-120);
  const qtSeries = (metrics.recentSamples || []).map((s) => s.queryTime || 0).slice(-120);
  const entSeries = (metrics.recentSamples || []).map((s) => s.entities || 0).slice(-120);

  return (
    <div className="fixed top-4 right-4 z-50">
      <div className="bg-black/50 backdrop-blur px-3 py-2 rounded-lg text-sm text-white shadow-lg border border-white/10">
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <div className="text-xs text-slate-300">FPS</div>
            <div className="text-lg font-mono">{Math.round(metrics.fps || 0)}</div>
            <div className="mt-1">
              <Sparkline values={fpsSeries} w={140} h={30} />
            </div>
          </div>

          <div className="flex flex-col">
            <div className="text-xs text-slate-300">Query</div>
            <div className="text-lg font-mono">{(metrics.queryTime || 0).toFixed(2)} ms</div>
            <div className="mt-1">
              <Sparkline values={qtSeries} w={120} h={30} color={'rgba(249,115,22,0.95)'} />
            </div>
          </div>

          <div className="flex flex-col">
            <div className="text-xs text-slate-300">Entities</div>
            <div className="text-lg font-mono">{metrics.entityCount ?? 0}</div>
            <div className="mt-1">
              <Sparkline values={entSeries} w={100} h={30} color={'rgba(16,185,129,0.95)'} />
            </div>
          </div>
        </div>

        <div className="mt-2 text-xs text-slate-300">
          Chunks: {metrics.chunksLoaded} • Index: {metrics.indexType}
        </div>
        <div className="mt-2 flex gap-2">
          <button
            onClick={() => {
              const sim = simRef?.current;
              if (sim) sim.toggleDebug && sim.toggleDebug();
            }}
            className="px-2 py-1 bg-slate-700 rounded text-xs"
          >
            Toggle Debug
          </button>
          <button
            onClick={() => {
              const sim = simRef?.current;
              if (sim) sim.centerCameraOnPlayer && sim.centerCameraOnPlayer();
            }}
            className="px-2 py-1 bg-slate-700 rounded text-xs"
          >
            Center
          </button>
        </div>
      </div>
    </div>
  );
}

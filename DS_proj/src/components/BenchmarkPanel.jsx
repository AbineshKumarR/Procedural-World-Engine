import React, { useEffect, useState } from 'react';

function TinyLineChart({ data = [], width = 320, height = 160 }) {
  // data: [{t, fps, q}]
  if (!data || data.length === 0) {
    return <div className="text-xs text-slate-400">No samples yet</div>;
  }
  const pad = 8;
  const w = width - pad * 2;
  const h = height - pad * 2;

  // fps scale (left): compute domain
  const fpsVals = data.map((d) => d.fps);
  const qVals = data.map((d) => d.q);
  const maxFps = Math.max(...fpsVals, 60);
  const minFps = Math.min(...fpsVals, 0);
  const maxQ = Math.max(...qVals, 1);
  const minQ = Math.min(...qVals, 0);

  const xScale = (i) => pad + (i / (data.length - 1 || 1)) * w;
  const yScaleF = (val) => pad + h - ((val - minFps) / Math.max(1e-6, maxFps - minFps)) * h;
  const yScaleQ = (val) => pad + h - ((val - minQ) / Math.max(1e-6, maxQ - minQ)) * h;

  const fpsPath = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScaleF(d.fps)}`)
    .join(' ');
  const qPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScaleQ(d.q)}`).join(' ');

  return (
    <svg width={width} height={height} className="rounded">
      <rect x="0" y="0" width={width} height={height} fill="#0b1624" rx="6" />
      <path d={fpsPath} stroke="#10b981" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path
        d={qPath}
        stroke="#f97316"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        opacity="0.9"
      />
      {/* small legend */}
      <circle cx={width - 80} cy={12} r="5" fill="#10b981" />
      <text x={width - 72} y={16} fontSize="10" fill="#cbd5e1">
        FPS
      </text>
      <circle cx={width - 40} cy={12} r="5" fill="#f97316" />
      <text x={width - 32} y={16} fontSize="10" fill="#cbd5e1">
        Query
      </text>
    </svg>
  );
}

export default function BenchmarkPanel({ simRef }) {
  const [fps, setFps] = useState('--');
  const [queryMs, setQueryMs] = useState('--');
  const [entities, setEntities] = useState('--');
  const [candidates, setCandidates] = useState('--');
  const [indexType, setIndexType] = useState('--');
  const [samples, setSamples] = useState([]);

  useEffect(() => {
    let mounted = true;
    const t = setInterval(() => {
      const sim = simRef.current;
      if (!sim || !mounted) return;
      const m = sim.getMetrics();
      setFps(m.fps.toFixed(1));
      setQueryMs(m.queryTime.toFixed(3));
      setEntities(m.entityCount);
      setCandidates(m.lastCandidateCount ?? '--');
      setIndexType(m.indexType ?? '--');

      // get recent samples from sim
      const rec = m.recentSamples || [];
      // map for chart: {t, fps, q}
      const chart = rec
        .slice(-120)
        .map((s) => ({
          t: s.t,
          fps: parseFloat(s.fps.toFixed(1)),
          q: parseFloat(Number(s.queryTime).toFixed(3)),
        }));
      setSamples(chart);
    }, 300);
    return () => {
      mounted = false;
      clearInterval(t);
    };
  }, [simRef]);

  return (
    <div>
      <h2 className="text-lg font-semibold mb-2">Benchmark</h2>
      <div className="bg-slate-800 p-3 rounded mb-3">
        <div className="mb-2">
          FPS: <span className="font-mono">{fps}</span>
        </div>
        <div className="mb-2">
          Query Time: <span className="font-mono">{queryMs} ms</span>
        </div>
        <div className="mb-2">
          Entities: <span className="font-mono">{entities}</span>
        </div>
        <div className="mb-2">
          Candidates (sum): <span className="font-mono">{candidates}</span>
        </div>
        <div>
          Index: <span className="font-mono">{indexType}</span>
        </div>
      </div>

      <div className="bg-slate-800 p-2 rounded">
        <TinyLineChart data={samples} width={320} height={180} />
      </div>

      <div className="mt-3 text-sm text-slate-400">
        Live FPS and broad-phase query time (green = FPS, orange = query ms). Use Advanced controls
        to tune.
      </div>
    </div>
  );
}

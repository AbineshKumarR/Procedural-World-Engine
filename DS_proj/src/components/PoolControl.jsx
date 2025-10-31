// src/components/PoolControl.jsx
import React, { useEffect, useState } from 'react';

export default function PoolControl({ world, pollInterval = 1000 }) {
  const [stats, setStats] = useState(world ? world.getPoolStats() : {});
  const [target, setTarget] = useState(
    stats.maxWorkers || (navigator.hardwareConcurrency || 2) - 1
  );
  const [verbose, setVerbose] = useState(false);

  useEffect(() => {
    let t = null;
    if (!world) return;
    setStats(world.getPoolStats());
    t = setInterval(() => setStats(world.getPoolStats()), pollInterval);
    return () => clearInterval(t);
  }, [world, pollInterval]);

  const apply = () => {
    const n = Math.max(1, parseInt(target, 10) || 1);
    world.setPoolSize(n);
    // set verbose by reinitializing pool with verbose flag (WorldManager handles verbose on its console)
  };

  return (
    <div className="bg-slate-900 p-3 rounded-md text-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="font-semibold">Worker Pool</div>
        <div className="text-xs text-slate-400">
          hw: {stats.hw || navigator.hardwareConcurrency || '—'}
        </div>
      </div>

      <div className="text-xs text-slate-200 mb-1">
        Workers: {stats.maxWorkers} (active: {stats.activeWorkers}, idle: {stats.idleWorkers})
      </div>
      <div className="text-xs text-slate-200 mb-2">
        Queue: {stats.queuedJobs}, Pending: {stats.pendingJobs}
      </div>

      <div className="flex gap-2 mb-2">
        <input
          type="number"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="flex-1 p-1 rounded bg-slate-800 text-white text-sm"
        />
        <button onClick={apply} className="px-3 py-1 bg-indigo-600 rounded">
          Set
        </button>
      </div>

      <div className="text-xs text-slate-400">
        Tip: Increase workers to speed chunk gen (but each worker uses a CPU core).
      </div>
    </div>
  );
}

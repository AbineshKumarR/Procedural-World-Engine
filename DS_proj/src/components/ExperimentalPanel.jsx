import React, { useState } from 'react';

export default function ExperimentalPanel({ simRef }) {
  const [running, setRunning] = useState(false);
  const [indexType, setIndexType] = useState('grid');
  const [entityCount, setEntityCount] = useState(500);
  const [distribution, setDistribution] = useState('uniform');
  const [results, setResults] = useState(null);
  const [benchmarkScores, setBenchmarkScores] = useState(null);

  const distributions = [
    { value: 'uniform', label: 'Uniform Distribution' },
    { value: 'cluster', label: 'Clustered Distribution' },
    { value: 'line', label: 'Line Distribution' },
    { value: 'mixed', label: 'Mixed Distribution' },
  ];

  const benchmarkPresets = [
    { name: 'Ultra Light (100)', count: 100, dist: 'uniform' },
    { name: 'Light (500)', count: 500, dist: 'uniform' },
    { name: 'Medium (1000)', count: 1000, dist: 'uniform' },
    { name: 'Heavy (2000)', count: 2000, dist: 'uniform' },
    { name: 'Very Heavy (4000)', count: 4000, dist: 'uniform' },
    { name: 'Clustered Heavy (1500)', count: 1500, dist: 'cluster' },
  ];

  const onRun = async () => {
    if (!simRef.current) return;

    setRunning(true);
    try {
      const result = await simRef.current.runExperiment({
        name: `test_${indexType}_${entityCount}_${distribution}`,
        indexType,
        entityCount: parseInt(entityCount),
        preset: distribution,
        warmup: 60, // 1 second
        duration: 300, // 5 seconds
      });
      setResults(result);
    } catch (error) {
      console.error('Experiment failed:', error);
      alert(`Experiment failed: ${error.message}`);
    } finally {
      setRunning(false);
    }
  };

  const onRunAllBenchmarks = async () => {
    if (!simRef.current) return;

    setRunning(true);
    try {
      const allResults = [];

      for (const preset of benchmarkPresets) {
        // ADD BVH TO THE DATA STRUCTURES TESTED
        for (const ds of ['grid', 'quadtree', 'kdtree', 'bvh']) {
          console.log(`Running ${preset.name} with ${ds}`);

          const result = await simRef.current.runExperiment({
            name: `benchmark_${ds}_${preset.count}`,
            indexType: ds,
            entityCount: preset.count,
            preset: preset.dist,
            warmup: 90,
            duration: 300,
          });

          allResults.push({
            preset: preset.name,
            dataStructure: ds,
            entityCount: preset.count,
            ...result.summary,
          });
        }
      }

      setBenchmarkScores(allResults);
      exportBenchmarkResults(allResults);
    } catch (error) {
      console.error('Benchmark failed:', error);
    } finally {
      setRunning(false);
    }
  };

  const exportBenchmarkResults = (scores) => {
    const csvContent = [
      'Benchmark,Data Structure,Entity Count,Average FPS,Min FPS,Max FPS,Average Query Time',
      ...scores.map(
        (s) =>
          `${s.preset},${s.dataStructure},${s.entityCount},${s.averageFPS?.toFixed(2) || 0},${
            s.minFPS || 0
          },${s.maxFPS || 0},${s.averageQueryTime?.toFixed(4) || 0}`
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `benchmark_comparison_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Function to use data structure without experiment (NORMAL USAGE)
  const onSetDataStructure = (type) => {
    if (!simRef.current) return;
    simRef.current.setIndexType(type);
    setIndexType(type);
    console.log(`Data Structure set to: ${type} (Normal Mode)`);
  };

  return (
    <div className="bg-slate-800 p-4 rounded-lg">
      <h3 className="text-lg font-semibold mb-4">Data Structure Controls</h3>

      {/* NORMAL DATA STRUCTURE USAGE */}
      <div className="mb-6 p-3 bg-slate-700 rounded">
        <h4 className="text-sm font-medium mb-2">Normal Usage (No Experiment)</h4>
        <div className="flex gap-2 mb-3 flex-wrap">
          <button
            onClick={() => onSetDataStructure('grid')}
            className={`px-3 py-2 rounded text-sm ${
              indexType === 'grid' ? 'bg-green-600' : 'bg-slate-600'
            }`}
          >
            Spatial Grid
          </button>
          <button
            onClick={() => onSetDataStructure('quadtree')}
            className={`px-3 py-2 rounded text-sm ${
              indexType === 'quadtree' ? 'bg-green-600' : 'bg-slate-600'
            }`}
          >
            Quadtree
          </button>
          <button
            onClick={() => onSetDataStructure('kdtree')}
            className={`px-3 py-2 rounded text-sm ${
              indexType === 'kdtree' ? 'bg-green-600' : 'bg-slate-600'
            }`}
          >
            KD-Tree
          </button>
          <button
            onClick={() => onSetDataStructure('bvh')}
            className={`px-3 py-2 rounded text-sm ${
              indexType === 'bvh' ? 'bg-green-600' : 'bg-slate-600'
            }`}
          >
            BVH (NEW)
          </button>
        </div>
        <p className="text-xs text-slate-300">
          Click above to switch data structures for normal gameplay without running experiments.
        </p>
      </div>

      {/* EXPERIMENT RUNNER */}
      <div className="mb-4">
        <h4 className="text-sm font-medium mb-2">Experiment Runner</h4>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-300">Data Structure</label>
            <select
              value={indexType}
              onChange={(e) => setIndexType(e.target.value)}
              className="w-full p-2 rounded bg-slate-700 text-sm"
            >
              <option value="grid">Spatial Hash Grid</option>
              <option value="quadtree">Quadtree</option>
              <option value="kdtree">KD-Tree</option>
              <option value="bvh">Bounding Volume Hierarchy (BVH)</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-slate-300">Entity Count</label>
            <input
              type="number"
              value={entityCount}
              onChange={(e) => setEntityCount(e.target.value)}
              className="w-full p-2 rounded bg-slate-700 text-sm"
            />
          </div>

          <div>
            <label className="text-xs text-slate-300">Distribution</label>
            <select
              value={distribution}
              onChange={(e) => setDistribution(e.target.value)}
              className="w-full p-2 rounded bg-slate-700 text-sm"
            >
              {distributions.map((dist) => (
                <option key={dist.value} value={dist.value}>
                  {dist.label}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={onRun}
            disabled={running}
            className="w-full py-2 bg-indigo-600 rounded disabled:opacity-50"
          >
            {running ? 'Running Experiment...' : 'Run Single Experiment'}
          </button>
        </div>
      </div>

      {/* 6 BENCHMARK SCORES */}
      <div className="mb-4">
        <h4 className="text-sm font-medium mb-2">Comprehensive Benchmarks (6 Scenarios)</h4>
        <button
          onClick={onRunAllBenchmarks}
          disabled={running}
          className="w-full py-2 bg-purple-600 rounded disabled:opacity-50 mb-3"
        >
          {running ? 'Running All Benchmarks...' : 'Run All 6 Benchmark Scenarios'}
        </button>
        <p className="text-xs text-slate-300">
          Tests all 4 data structures across 6 different scenarios for comprehensive comparison.
        </p>
      </div>

      {/* RESULTS DISPLAY */}
      {results && (
        <div className="mt-4 p-3 bg-slate-700 rounded">
          <h4 className="text-sm font-medium mb-2">Last Experiment Results</h4>
          <div className="text-xs space-y-1">
            <div>Avg FPS: {results.summary.averageFPS?.toFixed(2)}</div>
            <div>Avg Query Time: {results.summary.averageQueryTime?.toFixed(4)}ms</div>
            <div>Entities: {results.summary.entityCount}</div>
          </div>
        </div>
      )}

      {benchmarkScores && (
        <div className="mt-4 p-3 bg-slate-700 rounded">
          <h4 className="text-sm font-medium mb-2">Benchmark Comparison</h4>
          <div className="text-xs max-h-40 overflow-y-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-600">
                  <th className="text-left">Scenario</th>
                  <th className="text-left">DS</th>
                  <th className="text-right">FPS</th>
                </tr>
              </thead>
              <tbody>
                {benchmarkScores.map((score, i) => (
                  <tr key={i} className="border-b border-slate-600">
                    <td className="py-1">{score.preset}</td>
                    <td className="py-1">{score.dataStructure}</td>
                    <td className="py-1 text-right">{score.averageFPS?.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

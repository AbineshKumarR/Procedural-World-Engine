// export default class PerfRecorder {
//   constructor() {
//     this.samples = [];
//     this.running = false;
//     this.startTime = 0;
//     this.currentRun = 1;
//     this.experimentName = 'experiment';

//     this._headers = [
//       't',
//       'fps',
//       'queryTime',
//       'entityCount',
//       'chunks',
//       'indexType',
//       'seed',
//       'run',
//       'projectiles',
//       'playerX',
//       'playerY',
//     ];
//   }

//   start(experimentName = 'experiment') {
//     this.samples.length = 0;
//     this.running = true;
//     this.startTime = performance.now();
//     this.experimentName = experimentName;
//     console.log(`PerfRecorder: Started recording for ${experimentName}`);
//   }

//   stop() {
//     this.running = false;
//     console.log(`PerfRecorder: Stopped recording. ${this.samples.length} samples collected.`);
//   }

//   record(sample) {
//     if (!this.running) return;

//     const t = performance.now() - this.startTime;
//     const row = {
//       t: Number((t / 1000).toFixed(3)),
//       fps: Number((sample.fps || 0).toFixed(2)),
//       queryTime: Number((sample.queryTime || 0).toFixed(4)),
//       entityCount: Number(sample.entityCount || 0),
//       chunks: Number(sample.chunks || 0),
//       indexType: String(sample.indexType || ''),
//       seed: String(sample.seed || 'default'),
//       run: Number(sample.run || this.currentRun),
//       projectiles: Number(sample.projectiles || 0),
//       playerX: Number((sample.playerX || 0).toFixed(2)),
//       playerY: Number((sample.playerY || 0).toFixed(2)),
//     };

//     this.samples.push(row);
//   }

//   exportCSV(filename = null) {
//     if (!this.samples.length) {
//       console.warn('PerfRecorder: No samples to export');
//       return false;
//     }

//     const actualFilename = filename || `${this.experimentName}_run${this.currentRun}.csv`;
//     const header = this._headers.join(',');
//     const rows = this.samples.map((s) =>
//       this._headers
//         .map((h) => {
//           const v = s[h];
//           if (typeof v === 'string' && v.includes(',')) {
//             return `"${v.replace(/"/g, '""')}"`;
//           }
//           return String(v);
//         })
//         .join(',')
//     );

//     const csv = [header, ...rows].join('\n');
//     const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });

//     try {
//       const link = document.createElement('a');
//       const url = URL.createObjectURL(blob);
//       link.setAttribute('href', url);
//       link.setAttribute('download', actualFilename);
//       link.style.visibility = 'hidden';
//       document.body.appendChild(link);
//       link.click();
//       document.body.removeChild(link);
//       URL.revokeObjectURL(url);

//       console.log(
//         `PerfRecorder: Successfully exported ${this.samples.length} samples to ${actualFilename}`
//       );
//       return true;
//     } catch (error) {
//       console.error('PerfRecorder: CSV export failed', error);
//       return false;
//     }
//   }

//   // Enhanced benchmarking with 6 scenarios
//   generateBenchmarkScenarios() {
//     return {
//       uniform: {
//         name: 'Uniform Distribution',
//         description: 'Entities evenly spread across the world',
//         entityCounts: [100, 500, 1000, 2000, 4000, 8000],
//         distribution: 'uniform',
//       },
//       clustered: {
//         name: 'Clustered Distribution',
//         description: 'Entities grouped in dense clusters',
//         entityCounts: [100, 500, 1000, 2000, 4000, 8000],
//         distribution: 'clustered',
//         clusterCount: 5,
//       },
//       linear: {
//         name: 'Linear Distribution',
//         description: 'Entities arranged in straight lines',
//         entityCounts: [100, 500, 1000, 2000, 4000, 8000],
//         distribution: 'linear',
//       },
//       movingCluster: {
//         name: 'Moving Cluster',
//         description: 'Dense cluster moving across world',
//         entityCounts: [1000, 2000, 4000],
//         distribution: 'moving',
//       },
//       mixedDensity: {
//         name: 'Mixed Density',
//         description: 'Combination of sparse and dense areas',
//         entityCounts: [1500, 3000, 6000],
//         distribution: 'mixed',
//       },
//       realWorld: {
//         name: 'Real World Simulation',
//         description: 'Simulates real-world entity distribution',
//         entityCounts: [2000, 4000, 8000],
//         distribution: 'realworld',
//       },
//     };
//   }

//   getBenchmarkScores() {
//     if (!this.samples.length) return null;

//     const scenarios = Object.keys(this.generateBenchmarkScenarios());
//     const scores = {};

//     scenarios.forEach((scenario) => {
//       const scenarioSamples = this.samples.filter(
//         (s) => s.entityCount > 0 && this._matchesScenario(s, scenario)
//       );

//       if (scenarioSamples.length > 0) {
//         scores[scenario] = {
//           avgFPS: this._calculateAverage(scenarioSamples, 'fps'),
//           avgQueryTime: this._calculateAverage(scenarioSamples, 'queryTime'),
//           minFPS: Math.min(...scenarioSamples.map((s) => s.fps)),
//           maxFPS: Math.max(...scenarioSamples.map((s) => s.fps)),
//           sampleCount: scenarioSamples.length,
//         };
//       }
//     });

//     return scores;
//   }

//   _matchesScenario(sample, scenario) {
//     // Implementation depends on how you tag samples during experiments
//     return true; // Simplified
//   }

//   _calculateAverage(samples, field) {
//     return samples.reduce((sum, s) => sum + s[field], 0) / samples.length;
//   }
// }

export default class PerfRecorder {
  constructor() {
    this.samples = [];
    this.running = false;
    this.startTime = 0;
    this.currentRun = 1;
    this.experimentName = 'experiment';

    this._headers = [
      't',
      'fps',
      'queryTime',
      'entityCount',
      'chunks',
      'indexType',
      'seed',
      'run',
      'projectiles',
      'playerX',
      'playerY',
    ];
  }

  start(experimentName = 'experiment') {
    this.samples = [];
    this.samples.length = 0;
    this.running = true;
    this.startTime = performance.now();
    this.experimentName = experimentName;
    console.log(`PerfRecorder: Started recording for ${experimentName}`);
  }

  stop() {
    this.running = false;
    console.log(`PerfRecorder: Stopped recording. ${this.samples.length} samples collected.`);
    return this.samples;
  }

  record(sample) {
    if (!this.running) return;

    const t = performance.now() - this.startTime;
    const row = {
      t: Number((t / 1000).toFixed(3)),
      fps: Number((sample.fps || 0).toFixed(2)),
      queryTime: Number((sample.queryTime || 0).toFixed(4)),
      entityCount: Number(sample.entityCount || 0),
      chunks: Number(sample.chunks || 0),
      indexType: String(sample.indexType || ''),
      seed: String(sample.seed || 'default'),
      run: Number(sample.run || this.currentRun),
      projectiles: Number(sample.projectiles || 0),
      playerX: Number((sample.playerX || 0).toFixed(2)),
      playerY: Number((sample.playerY || 0).toFixed(2)),
    };

    this.samples.push(row);
  }

  getSamples() {
    return this.samples;
  }

  exportCSV(filename = null) {
    if (!this.samples.length) {
      console.warn('PerfRecorder: No samples to export');
      return false;
    }

    const actualFilename = filename || `${this.experimentName}_run${this.currentRun}.csv`;
    const header = this._headers.join(',');
    const rows = this.samples.map((s) =>
      this._headers
        .map((h) => {
          const v = s[h];
          if (typeof v === 'string' && v.includes(',')) {
            return `"${v.replace(/"/g, '""')}"`;
          }
          return String(v);
        })
        .join(',')
    );

    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });

    try {
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', actualFilename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      console.log(
        `PerfRecorder: Successfully exported ${this.samples.length} samples to ${actualFilename}`
      );
      return true;
    } catch (error) {
      console.error('PerfRecorder: CSV export failed', error);
      return false;
    }
  }

  // Enhanced benchmarking with 6 scenarios
  generateBenchmarkScenarios() {
    return {
      uniform: {
        name: 'Uniform Distribution',
        description: 'Entities evenly spread across the world',
        entityCounts: [100, 500, 1000, 2000, 4000, 8000],
        distribution: 'uniform',
      },
      clustered: {
        name: 'Clustered Distribution',
        description: 'Entities grouped in dense clusters',
        entityCounts: [100, 500, 1000, 2000, 4000, 8000],
        distribution: 'clustered',
        clusterCount: 5,
      },
      linear: {
        name: 'Linear Distribution',
        description: 'Entities arranged in straight lines',
        entityCounts: [100, 500, 1000, 2000, 4000, 8000],
        distribution: 'linear',
      },
      movingCluster: {
        name: 'Moving Cluster',
        description: 'Dense cluster moving across world',
        entityCounts: [1000, 2000, 4000],
        distribution: 'moving',
      },
      mixedDensity: {
        name: 'Mixed Density',
        description: 'Combination of sparse and dense areas',
        entityCounts: [1500, 3000, 6000],
        distribution: 'mixed',
      },
      realWorld: {
        name: 'Real World Simulation',
        description: 'Simulates real-world entity distribution',
        entityCounts: [2000, 4000, 8000],
        distribution: 'realworld',
      },
    };
  }

  getBenchmarkScores() {
    if (!this.samples.length) return null;

    const scenarios = Object.keys(this.generateBenchmarkScenarios());
    const scores = {};

    scenarios.forEach((scenario) => {
      const scenarioSamples = this.samples.filter(
        (s) => s.entityCount > 0 && this._matchesScenario(s, scenario)
      );

      if (scenarioSamples.length > 0) {
        scores[scenario] = {
          avgFPS: this._calculateAverage(scenarioSamples, 'fps'),
          avgQueryTime: this._calculateAverage(scenarioSamples, 'queryTime'),
          minFPS: Math.min(...scenarioSamples.map((s) => s.fps)),
          maxFPS: Math.max(...scenarioSamples.map((s) => s.fps)),
          stability: this._calculateStability(scenarioSamples, 'fps'),
          sampleCount: scenarioSamples.length,
        };
      }
    });

    return scores;
  }

  _matchesScenario(sample, scenario) {
    // Implementation depends on how you tag samples during experiments
    return true; // Simplified
  }

  _calculateAverage(samples, field) {
    return samples.reduce((sum, s) => sum + s[field], 0) / samples.length;
  }

  _categorizeSamples() {
    const scenarios = {};

    this.samples.forEach((sample) => {
      const entityCount = sample.entityCount;
      let scenario = 'unknown';

      if (entityCount <= 100) scenario = 'ultra_light';
      else if (entityCount <= 500) scenario = 'light';
      else if (entityCount <= 1000) scenario = 'medium';
      else if (entityCount <= 2000) scenario = 'heavy';
      else if (entityCount <= 4000) scenario = 'very_heavy';
      else scenario = 'extreme';

      if (!scenarios[scenario]) scenarios[scenario] = [];
      scenarios[scenario].push(sample);
    });

    return scenarios;
  }

  _calculateStability(samples, field) {
    const avg = this._calculateAverage(samples, field);
    const variance =
      samples.reduce((sum, s) => sum + Math.pow(s[field] - avg, 2), 0) / samples.length;
    return Math.sqrt(variance);
  }
}

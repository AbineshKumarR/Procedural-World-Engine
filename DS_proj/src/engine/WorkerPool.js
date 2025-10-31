// src/engine/WorkerPool.js
export default class WorkerPool {
  constructor(workerModuleURL, options = {}) {
    const hw =
      typeof navigator !== 'undefined' && navigator.hardwareConcurrency
        ? navigator.hardwareConcurrency
        : 2;
    this.hw = hw; // expose for UI
    this.maxWorkers = Math.max(1, options.workers || Math.max(1, hw - 1));
    this.workerURL = workerModuleURL;
    this.workers = [];
    this.idle = [];
    this.jobs = new Map();
    this.queue = [];
    this._nextJobId = 1;
    this.jobTimeoutMs = options.jobTimeoutMs || 20000;
    this.verbose = !!options.verbose;
    this._initWorkers();
  }

  _log(...args) {
    if (this.verbose) console.log('[WorkerPool]', ...args);
  }

  _initWorkers() {
    // cleanup any existing
    for (const w of this.workers) {
      try {
        w.terminate();
      } catch (e) {}
    }
    this.workers = [];
    this.idle = [];
    for (let i = 0; i < this.maxWorkers; i++) {
      try {
        const w = new Worker(this.workerURL, { type: 'module' });
        const idx = this.workers.length;
        this.workers.push(w);
        this.idle.push(idx);
        w.onmessage = (ev) => this._handleWorkerMessage(idx, ev.data);
        w.onerror = (err) => this._handleWorkerError(idx, err);
        this._log(`spawned worker #${idx}`);
      } catch (err) {
        console.warn('WorkerPool: worker spawn failed', err);
        break;
      }
    }
    if (this.workers.length === 0) {
      console.warn('WorkerPool: no workers available — fallback to synchronous generation');
    }
  }

  // call to change pool size at runtime
  resize(newCount) {
    const safe = Math.max(1, Math.floor(newCount));
    this._log('resizing pool', this.maxWorkers, '=>', safe);
    if (safe === this.maxWorkers) return;
    this.maxWorkers = safe;
    this._initWorkers();
  }

  // status for UI
  getStats() {
    return {
      hw: this.hw,
      maxWorkers: this.maxWorkers,
      activeWorkers: this.workers.length - this.idle.length,
      idleWorkers: this.idle.length,
      queuedJobs: this.queue.length,
      pendingJobs: this.jobs.size,
    };
  }

  _handleWorkerMessage(workerIndex, data) {
    if (!data) return;
    if (data.cmd === 'generated') {
      const jid = data.jobId;
      const job = this.jobs.get(jid);
      if (job) {
        clearTimeout(job.timeoutId);
        this._log(`job ${jid} completed (worker ${workerIndex})`);
        job.resolve(data.args);
        this.jobs.delete(jid);
      }
    } else if (data.cmd === 'error') {
      console.error('WorkerPool worker error', data.error, data.stack);
    } else {
      this._log('worker message', data);
    }

    if (!this.idle.includes(workerIndex)) this.idle.push(workerIndex);
    this._processQueue();
  }

  _handleWorkerError(workerIndex, err) {
    console.error('WorkerPool worker error', workerIndex, err);
    if (!this.idle.includes(workerIndex)) this.idle.push(workerIndex);
    this._processQueue();
  }

  _processQueue() {
    if (!this.queue.length) return;
    if (!this.idle.length) return;
    const workerIndex = this.idle.shift();
    const job = this.queue.shift();
    this._sendJobToWorker(workerIndex, job.jid, job.args, job.resolve, job.reject);
  }

  _sendJobToWorker(workerIndex, jid, args, resolve, reject) {
    try {
      const w = this.workers[workerIndex];
      const timeoutId = setTimeout(() => {
        if (this.jobs.has(jid)) {
          this.jobs.get(jid).reject(new Error('WorkerPool: job timeout'));
          this.jobs.delete(jid);
          this._log(`job ${jid} timed out`);
        }
        if (!this.idle.includes(workerIndex)) this.idle.push(workerIndex);
        this._processQueue();
      }, this.jobTimeoutMs);

      this.jobs.set(jid, { resolve, reject, timeoutId, workerIndex });
      this._log(`sending job ${jid} to worker ${workerIndex}`);
      w.postMessage({ cmd: 'generate', jobId: jid, args });
    } catch (err) {
      reject(err);
      if (!this.idle.includes(workerIndex)) this.idle.push(workerIndex);
      this._processQueue();
    }
  }

  enqueue(args) {
    return new Promise((resolve, reject) => {
      const jid = this._nextJobId++;
      this._log(`enqueue job ${jid}`);
      if (this.idle.length > 0) {
        const workerIndex = this.idle.shift();
        this._sendJobToWorker(workerIndex, jid, args, resolve, reject);
      } else if (this.workers.length > 0) {
        this.queue.push({ jid, args, resolve, reject });
        this._log(`queued job ${jid} (queue length ${this.queue.length})`);
      } else {
        reject(new Error('WorkerPool: no workers available'));
      }
    });
  }

  terminate() {
    for (const w of this.workers) {
      try {
        w.terminate();
      } catch (e) {}
    }
    this.workers = [];
    this.idle = [];
    this.jobs.clear();
    this.queue = [];
  }
}

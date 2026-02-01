/**
 * A fixed-size pool of Web Workers with a task queue.
 *
 * Tasks are distributed round-robin to the least-busy worker.
 * Each `queueTask` call returns a Promise that resolves with the
 * worker's response.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PendingTask {
  data: unknown;
  transferList?: Transferable[];
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

interface WorkerEntry {
  worker: Worker;
  busy: boolean;
}

// ---------------------------------------------------------------------------
// WorkerPool
// ---------------------------------------------------------------------------

export class WorkerPool {
  private workers: WorkerEntry[] = [];
  private queue: PendingTask[] = [];
  private resolvers: Map<Worker, PendingTask> = new Map();

  /**
   * @param workerFactory  A function that creates a new Worker instance.
   *                       Example: `() => new Worker(new URL('./ChunkMeshWorker.ts', import.meta.url), { type: 'module' })`
   * @param poolSize       Number of workers. Defaults to `max(1, navigator.hardwareConcurrency - 2)`.
   */
  constructor(
    workerFactory: () => Worker,
    poolSize: number = Math.max(1, (navigator.hardwareConcurrency ?? 4) - 2),
  ) {
    for (let i = 0; i < poolSize; i++) {
      const worker = workerFactory();
      const entry: WorkerEntry = { worker, busy: false };

      worker.onmessage = (evt: MessageEvent) => {
        const task = this.resolvers.get(worker);
        if (task) {
          this.resolvers.delete(worker);
          entry.busy = false;
          task.resolve(evt.data);
        }
        // Dispatch next queued task to this now-idle worker
        this.dispatchNext(entry);
      };

      worker.onerror = (err: ErrorEvent) => {
        const task = this.resolvers.get(worker);
        if (task) {
          this.resolvers.delete(worker);
          entry.busy = false;
          task.reject(err);
        }
        this.dispatchNext(entry);
      };

      this.workers.push(entry);
    }
  }

  /**
   * Enqueue a task to be processed by one of the workers.
   *
   * @param data          The message payload to post to the worker.
   * @param transferList  Optional Transferable objects for zero-copy transfer.
   * @returns A promise that resolves with the worker's response message data.
   */
  queueTask(data: unknown, transferList?: Transferable[]): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const task: PendingTask = { data, transferList, resolve, reject };

      // Try to find an idle worker immediately
      const idle = this.workers.find((w) => !w.busy);
      if (idle) {
        this.dispatch(idle, task);
      } else {
        this.queue.push(task);
      }
    });
  }

  /**
   * Terminate all workers and clear the queue.
   */
  dispose(): void {
    for (const entry of this.workers) {
      entry.worker.terminate();
    }
    this.workers.length = 0;
    // Reject any pending tasks
    for (const task of this.queue) {
      task.reject(new Error('WorkerPool disposed'));
    }
    this.queue.length = 0;
    this.resolvers.clear();
  }

  /** Return the number of tasks currently waiting in the queue. */
  get pendingCount(): number {
    return this.queue.length;
  }

  /** Return the number of workers currently executing a task. */
  get busyCount(): number {
    return this.workers.filter((w) => w.busy).length;
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private dispatch(entry: WorkerEntry, task: PendingTask): void {
    entry.busy = true;
    this.resolvers.set(entry.worker, task);
    if (task.transferList && task.transferList.length > 0) {
      entry.worker.postMessage(task.data, task.transferList);
    } else {
      entry.worker.postMessage(task.data);
    }
  }

  private dispatchNext(entry: WorkerEntry): void {
    if (this.queue.length > 0 && !entry.busy) {
      const next = this.queue.shift()!;
      this.dispatch(entry, next);
    }
  }
}

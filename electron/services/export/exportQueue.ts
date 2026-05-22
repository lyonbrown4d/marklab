type QueuedExportTask<T> = {
  reject: (error: unknown) => void
  resolve: (value: T) => void
  task: () => Promise<T>
}

export class ExportQueue {
  private readonly pending: Array<QueuedExportTask<unknown>> = []
  private running = 0

  constructor(private readonly concurrency = 1) {}

  enqueue<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.pending.push({
        reject,
        resolve: (value) => resolve(value as T),
        task,
      })
      this.drain()
    })
  }

  private drain(): void {
    while (this.running < this.concurrency && this.pending.length > 0) {
      const item = this.pending.shift()
      if (!item) return
      this.running += 1
      void item
        .task()
        .then((value) => item.resolve(value))
        .catch((error) => item.reject(error))
        .finally(() => {
          this.running -= 1
          this.drain()
        })
    }
  }
}

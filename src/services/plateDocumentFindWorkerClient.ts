import PlateDocumentFindWorker from '@/workers/plateDocumentFindWorker?worker'
import { WorkerRpcClient, type RpcWorker } from '@/services/workerRpcClient'
import type { PlateDocumentFindWorkerApi } from '@/workers/plateDocumentFindWorkerApi'
import type {
  PlateDocumentFindWorkerMatch,
  PlateDocumentFindWorkerScan,
} from '@/workers/plateDocumentFindWorkerProtocol'

export type PlateDocumentFindWorkerPort = RpcWorker

export class PlateDocumentFindWorkerClient {
  private readonly rpc: WorkerRpcClient<PlateDocumentFindWorkerApi>
  private readonly timeoutMs: number

  constructor(
    createWorker: () => PlateDocumentFindWorkerPort = () => new PlateDocumentFindWorker(),
    timeoutMs = 2_000,
  ) {
    this.rpc = new WorkerRpcClient(createWorker, 'Document find worker')
    this.timeoutMs = timeoutMs
  }

  scan = (
    request: PlateDocumentFindWorkerScan,
    signal?: AbortSignal,
  ): Promise<PlateDocumentFindWorkerMatch[]> =>
    this.rpc.call((remote) => remote.scan(request), signal, this.timeoutMs)

  terminate = (): void => this.rpc.terminate()
}

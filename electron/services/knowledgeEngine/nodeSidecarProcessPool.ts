import type { ForkOptions } from 'electron'

import { NodeSidecarRpcClient } from '@electron/services/knowledgeEngine/nodeSidecarRpcClient'
import {
  resolveNodeSidecarEntry,
  waitForNodeSidecarSpawn,
  type ForkUtilityProcess,
  type NodeUtilityProcess,
} from '@electron/services/knowledgeEngine/nodeSidecarProcess'
import type { WorkspaceSidecarIdentity } from '@electron/services/knowledgeEngine/workspaceIdentity'
import type {
  StartedWorkspaceSidecar,
  WorkspaceSidecarProcess,
} from '@electron/services/knowledgeEngine/workspaceSidecarTypes'
import type { Logger } from '@electron/services/logger'

type NodeSidecarProcessPoolOptions = {
  entryPath?: string
  fork?: ForkUtilityProcess
}

type ProcessHost = {
  exited: boolean
  leases: Set<ProcessLease>
  process: NodeUtilityProcess
}

type ProcessLease = {
  client: NodeSidecarRpcClient
  exitListeners: Set<(code: number) => void>
  host: ProcessHost
  released: boolean
}

export class NodeSidecarProcessPool {
  private host: ProcessHost | null = null
  private hostStart: Promise<ProcessHost> | null = null
  private disposed = false

  constructor(
    private readonly logger: Logger,
    private readonly options: NodeSidecarProcessPoolOptions = {},
  ) {}

  async acquire(identity: WorkspaceSidecarIdentity): Promise<StartedWorkspaceSidecar> {
    if (this.disposed) throw new Error('Knowledge utility process pool is disposed.')
    const host = await this.ensureHost()
    if (this.disposed || host.exited) {
      throw new Error('Knowledge utility process exited before workspace acquisition.')
    }
    const lease: ProcessLease = {
      client: new NodeSidecarRpcClient(host.process, identity),
      exitListeners: new Set(),
      host,
      released: false,
    }
    host.leases.add(lease)
    return {
      address: 'node:utility-process',
      child: this.createLeaseHandle(lease),
      client: lease.client,
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    const host = this.host
    this.host = null
    if (!host) return
    const hadLeases = host.leases.size > 0
    for (const lease of [...host.leases]) this.release(lease)
    if (!hadLeases && !host.exited) host.process.kill()
  }

  private createLeaseHandle(lease: ProcessLease): WorkspaceSidecarProcess {
    return {
      get killed() {
        return lease.released || lease.host.exited
      },
      kill: () => this.release(lease),
      onExit: (listener) => lease.exitListeners.add(listener),
      get pid() {
        return lease.host.process.pid
      },
    }
  }

  private ensureHost(): Promise<ProcessHost> {
    if (this.hostStart) return this.hostStart
    if (this.host && !this.host.exited) return Promise.resolve(this.host)
    const starting = this.startHost().finally(() => {
      if (this.hostStart === starting) this.hostStart = null
    })
    this.hostStart = starting
    return starting
  }

  private async startHost(): Promise<ProcessHost> {
    const entryPath = this.options.entryPath ?? resolveNodeSidecarEntry(import.meta.url)
    const fork = this.options.fork ?? (await import('electron')).utilityProcess.fork
    if (this.disposed) throw new Error('Knowledge utility process pool is disposed.')
    const process = fork(entryPath, [], processOptions())
    const host: ProcessHost = { exited: false, leases: new Set(), process }
    this.host = host
    process.on('exit', (code) => this.handleExit(host, code))
    try {
      await waitForNodeSidecarSpawn(process)
      if (this.disposed) {
        if (this.host === host) this.host = null
        process.kill()
        throw new Error('Knowledge utility process pool was disposed during startup.')
      }
      return host
    } catch (error) {
      if (this.host === host) this.host = null
      throw error
    }
  }

  private handleExit(host: ProcessHost, code: number): void {
    if (host.exited) return
    host.exited = true
    if (this.host === host) this.host = null
    if (code !== 0) this.logger.warn(`Knowledge utility process exited with code ${code}.`)
    for (const lease of [...host.leases]) {
      lease.released = true
      lease.client.close()
      for (const listener of lease.exitListeners) listener(code)
      lease.exitListeners.clear()
    }
    host.leases.clear()
  }

  private release(lease: ProcessLease): boolean {
    if (lease.released) return false
    lease.released = true
    lease.client.close()
    lease.exitListeners.clear()
    lease.host.leases.delete(lease)
    if (lease.host.leases.size > 0 || lease.host.exited) return true
    if (this.host === lease.host) this.host = null
    return lease.host.process.kill()
  }
}

const processOptions = (): ForkOptions => ({
  serviceName: 'Marklab Knowledge Engine',
  stdio: 'ignore',
})

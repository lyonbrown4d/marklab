import fs from 'node:fs/promises'
import { $ } from 'zx'

export const findApplicationProcess = async (workspace: string) => {
  if (process.platform !== 'linux') throw new Error('This native process probe requires Linux')
  const result = await $({ quiet: true, nothrow: true })`pgrep -x marklab-desktop`
  const candidates = result.stdout
    .trim()
    .split(/\s+/)
    .map(Number)
    .filter((pid) => pid > 0)
  const matches = await Promise.all(
    candidates.map(async (pid) => {
      const args = await fs.readFile(`/proc/${pid}/cmdline`, 'utf8').catch(() => '')
      return args.split('\0').includes(workspace) ? pid : null
    }),
  )
  const owners = matches.filter((pid): pid is number => pid !== null)
  if (owners.length !== 1) throw new Error('Cannot identify the isolated performance process')
  const ticks = Number((await $({ quiet: true })`getconf CLK_TCK`).stdout.trim())
  if (!Number.isFinite(ticks) || ticks <= 0) throw new Error('Invalid process clock frequency')
  return { pid: owners[0]!, ticks }
}

export const sampleProcessTree = async (root: number, ticks: number) => {
  const pids = new Set([root])
  // procfs has no process-tree bulk read. Each owned child is visited once;
  // no unrelated process memory or command line is collected.
  for (const pid of pids) {
    const children = await fs.readFile(`/proc/${pid}/task/${pid}/children`, 'utf8').catch(() => '')
    for (const child of children.trim().split(/\s+/).map(Number)) if (child > 0) pids.add(child)
    if (pids.size > 64) throw new Error('Unexpected native process tree size')
  }
  const rows = await Promise.all(
    [...pids].map(async (pid) => {
      try {
        const [status, stat, smaps] = await Promise.all([
          fs.readFile(`/proc/${pid}/status`, 'utf8'),
          fs.readFile(`/proc/${pid}/stat`, 'utf8'),
          fs.readFile(`/proc/${pid}/smaps_rollup`, 'utf8').catch(() => null),
        ])
        const fields = stat
          .slice(stat.lastIndexOf(')') + 2)
          .trim()
          .split(/\s+/)
        const rss = Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1]) * 1024
        const pss = smaps?.match(/^Pss:\s+(\d+)/m)?.[1]
        return {
          pid,
          rssBytes: Number.isFinite(rss) ? rss : null,
          pssBytes: pss === undefined ? null : Number(pss) * 1024,
          cpuMs: ((Number(fields[11]) + Number(fields[12])) / ticks) * 1000,
        }
      } catch {
        return null
      }
    }),
  )
  const processes = rows.filter((row) => row !== null)
  if (!processes.some((row) => row.pid === root))
    throw new Error('Native application exited during measurement')
  return {
    processes,
    rssBytes: processes.every((row) => row.rssBytes !== null)
      ? processes.reduce((total, row) => total + (row.rssBytes ?? 0), 0)
      : null,
    pssBytes: processes.every((row) => row.pssBytes !== null)
      ? processes.reduce((total, row) => total + (row.pssBytes ?? 0), 0)
      : null,
    cpuMs: processes.reduce((total, row) => total + row.cpuMs, 0),
  }
}

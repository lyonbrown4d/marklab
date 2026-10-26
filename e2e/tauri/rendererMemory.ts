import fs from 'node:fs/promises'
// eslint-disable-next-line no-restricted-imports -- Native E2E bundle selection only.
import { applicationBinary } from './application.ts'
import os from 'node:os'
import path from 'node:path'
import pLimit from 'p-limit'
import { z } from 'zod'
import { $ } from 'zx'

const footprintReport = z.object({
  unit: z.literal('byte'),
  'bytes per unit': z.literal(1),
  errors: z.array(z.unknown()).length(0),
  processes: z.array(
    z.object({
      pid: z.number().int().positive(),
      auxiliary: z.object({ phys_footprint: z.number().int().nonnegative() }),
    }),
  ),
})

const readPhysicalFootprint = async (pid: number): Promise<number | null> => {
  let directory: string | undefined
  try {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-footprint-'))
    const output = path.join(directory, 'memory.json')
    await $({
      quiet: true,
      timeout: '2s',
      timeoutSignal: 'SIGKILL',
    })`/usr/bin/footprint --pid ${pid} --noCategories --format bytes --json ${output}`
    const report: unknown = JSON.parse(await fs.readFile(output, 'utf8'))
    const parsed = footprintReport.parse(report)
    return parsed.processes.find((entry) => entry.pid === pid)?.auxiliary.phys_footprint ?? null
  } catch {
    // A vanished process, denied read, timeout or invalid report is unavailable,
    // never a zero-byte sample. Do not log tool output or process metadata.
    return null
  } finally {
    if (directory) await fs.rm(directory, { recursive: true, force: true })
  }
}

export const readRendererMemory = async (fixtureRoot: string) => {
  const previous = await fs.readFile(path.join(fixtureRoot, 'processes-before.txt'), 'utf8')
  const before = new Set(previous.split('\n').map((line) => line.trim().split(/\s+/)[0]))
  const { stdout } = await $({ quiet: true })`/bin/ps -axo pid=,rss=,comm=`
  const processes = stdout
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
    .filter(([pid]) => pid && !before.has(pid))
  const webContent = processes.filter((row) => row.slice(2).join(' ').includes('Helper (Renderer)'))
  const native = processes.filter((row) =>
    /^marklab-desktop(?:-uninstrumented|-baseline|-react-profiler)?$/.test(
      path.basename(row.slice(2).join(' ')),
    ),
  )
  const rss = {
    webContentProcesses: webContent.length,
    webContentRssMiB: webContent.reduce((sum, row) => sum + Number(row[1]) / 1024, 0),
    nativeProcesses: native.length,
    nativeRssMiB: native.reduce((sum, row) => sum + Number(row[1]) / 1024, 0),
  }
  if (process.platform !== 'darwin' || webContent.length === 0) {
    return {
      ...rss,
      webContentPhysicalFootprintMiB: null,
      webContentPhysicalFootprintFailedProcesses: 0,
      nativePhysicalFootprintMiB: null,
      measuredCombinedPhysicalFootprintMiB: null,
      webContentPhysicalFootprintError:
        process.platform !== 'darwin' ? 'unsupported-platform' : 'no-webcontent-processes',
    }
  }
  // Separate reports preserve per-PID failures; cap simultaneous Apple tools.
  const limit = pLimit(2)
  const sampleGroup = async (rows: string[][]) => {
    const samples = await Promise.allSettled(
      rows.map(([pid]) => limit(() => readPhysicalFootprint(Number(pid)))),
    )
    let total = 0
    let failures = 0
    for (const sample of samples) {
      if (sample.status === 'rejected' || sample.value === null) failures += 1
      else total += sample.value
    }
    return { failures, miB: failures || !rows.length ? null : total / 1024 / 1024 }
  }
  const [webSample, nativeSample] = await Promise.all([
    sampleGroup(webContent),
    sampleGroup(native),
  ])
  return {
    ...rss,
    webContentPhysicalFootprintMiB: webSample.miB,
    webContentPhysicalFootprintFailedProcesses: webSample.failures,
    webContentPhysicalFootprintError: webSample.failures ? 'footprint-read-failed' : null,
    nativePhysicalFootprintMiB: nativeSample.miB,
    // This sum covers the native app and its WebContent processes, not shared
    // system GPU/network services. Preserve missing samples rather than zeroing them.
    measuredCombinedPhysicalFootprintMiB:
      webSample.miB === null || nativeSample.miB === null ? null : webSample.miB + nativeSample.miB,
  }
}

// Bring the existing owner forward through production single-instance handling.
// The secondary process exits before sampling; no native test-only focus API.
export const presentProfileOwner = async () => {
  const binary = applicationBinary()
  await $({
    quiet: true,
    timeout: '15s',
    env: { ...process.env },
  })`${binary}`
}

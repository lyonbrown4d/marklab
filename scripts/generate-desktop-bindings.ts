import { createHash, randomUUID } from 'node:crypto'
import { glob, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { $ } from 'zx'

const root = fileURLToPath(new URL('../', import.meta.url))
const directory = path.join(root, 'src/generated/desktop')
const bindings = path.join(directory, 'bindings.ts')
const cache = path.join(directory, '.generation.json')

const digest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')

const fingerprint = async () => {
  const files = [
    'src-tauri/Cargo.toml',
    'src-tauri/Cargo.lock',
    'scripts/generate-desktop-bindings.ts',
  ]
  for await (const file of glob('src-tauri/src/**/*.rs', { cwd: root })) files.push(file)
  const hash = createHash('sha256')
  for (const file of files.sort()) {
    hash
      .update(file)
      .update('\0')
      .update(await readFile(path.join(root, file)))
      .update('\0')
  }
  return hash.digest('hex')
}

const isCurrent = async (input: string) => {
  try {
    const recorded: unknown = JSON.parse(await readFile(cache, 'utf8'))
    return (
      typeof recorded === 'object' &&
      recorded !== null &&
      'input' in recorded &&
      recorded.input === input &&
      'output' in recorded &&
      recorded.output === digest(await readFile(bindings))
    )
  } catch {
    return false
  }
}

export const generateDesktopBindings = async (signal?: AbortSignal) => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    signal?.throwIfAborted()
    const input = await fingerprint()
    if (await isCurrent(input)) return
    console.info('Generating desktop IPC bindings from Rust…')
    await mkdir(directory, { recursive: true })
    // Keep all native outputs inside this checkout, including code generation.
    const run = $({
      cwd: root,
      stdio: 'inherit',
      signal,
      env: { ...process.env, CARGO_TARGET_DIR: path.join(root, 'src-tauri/target') },
    })
    const pending = path.join(directory, `.bindings-${process.pid}-${randomUUID()}.ts`)
    try {
      await run`cargo run --manifest-path src-tauri/Cargo.toml --locked --jobs 2 --features ipc-codegen --bin generate-desktop-bindings -- ${pending}`
      // Publish only a stable source snapshot; Vite must not observe an interim
      // contract from a backend edit that arrived while Cargo was compiling.
      if ((await fingerprint()) !== input) continue
      // Hash our own snapshot before publishing. Another process may replace
      // the public file immediately after rename; its bytes belong to its input.
      const output = digest(await readFile(pending))
      await rename(pending, bindings)
      const temporary = `${cache}.${randomUUID()}.tmp`
      try {
        await writeFile(temporary, JSON.stringify({ input, output }))
        await rename(temporary, cache)
      } finally {
        await rm(temporary, { force: true })
      }
      return
    } finally {
      await rm(pending, { force: true })
    }
  }
  throw new Error('Rust contracts changed during generation. Retry once backend edits finish.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await generateDesktopBindings()
}

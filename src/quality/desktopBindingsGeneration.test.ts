// @vitest-environment node
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const io = vi.hoisted(() => ({
  files: new Map<string, string>(),
  outputs: [] as string[],
  published: [] as string[],
  foreignPublish: false,
  cargo: vi.fn(),
}))
vi.mock('node:fs/promises', () => ({
  glob: async function* (pattern: string) {
    yield pattern.startsWith('src-tauri/')
      ? 'src-tauri/src/contracts.rs'
      : 'crates/marklab-document/src/types.rs'
  },
  mkdir: vi.fn(),
  readFile: vi.fn(async (file: string, encoding?: string) => {
    const value = io.files.get(file)
    if (value === undefined) throw new Error('ENOENT')
    return encoding ? value : Buffer.from(value)
  }),
  writeFile: vi.fn(async (file: string, value: string) => {
    io.files.set(file, value)
  }),
  rename: vi.fn(async (from: string, to: string) => {
    const value = io.files.get(from)
    if (value === undefined) throw new Error('ENOENT')
    io.files.set(to, value)
    io.files.delete(from)
    if (to.endsWith('/bindings.ts')) io.published.push(value)
    // Simulate a competing generator publishing after our atomic rename.
    if (io.foreignPublish && to.endsWith('/bindings.ts')) io.files.set(to, 'foreign output')
  }),
  rm: vi.fn(async (file: string) => {
    io.files.delete(file)
  }),
}))
vi.mock('zx', () => ({ $: () => io.cargo }))
// eslint-disable-next-line no-restricted-imports -- Verifies the build-only contract generation lifecycle.
import { generateDesktopBindings } from '../../scripts/generate-desktop-bindings.ts'

const bindings = path.join(process.cwd(), 'src/generated/desktop/bindings.ts')
const source = path.join(process.cwd(), 'src-tauri/src/contracts.rs')

describe('desktop contract generation cache', () => {
  beforeEach(() => {
    io.files.clear()
    io.outputs.length = 0
    io.published.length = 0
    io.foreignPublish = false
    for (const file of [
      'src-tauri/Cargo.toml',
      'Cargo.toml',
      'Cargo.lock',
      'crates/marklab-document/Cargo.toml',
      'crates/marklab-document/src/types.rs',
      'scripts/generate-desktop-bindings.ts',
      'src-tauri/src/contracts.rs',
    ])
      io.files.set(path.join(process.cwd(), file), file)
    io.cargo
      .mockReset()
      .mockImplementation(async (_template: TemplateStringsArray, output: string) => {
        io.outputs.push(output)
        io.files.set(output, `bindings for ${io.files.get(source)}`)
      })
  })

  it('generates missing bindings, reuses matching output, and repairs deleted or edited output', async () => {
    await generateDesktopBindings()
    expect(io.files.get(bindings)).toBe(`bindings for ${io.files.get(source)}`)
    await generateDesktopBindings()
    expect(io.cargo).toHaveBeenCalledTimes(1)
    io.files.delete(bindings)
    await generateDesktopBindings()
    io.files.set(bindings, 'manually edited output')
    await generateDesktopBindings()
    expect(io.cargo).toHaveBeenCalledTimes(3)
    expect(io.files.get(bindings)).toBe(`bindings for ${io.files.get(source)}`)
  })

  it.each([
    'Cargo.toml',
    'Cargo.lock',
    'crates/marklab-document/Cargo.toml',
    'crates/marklab-document/src/types.rs',
  ])('invalidates cached bindings after changing %s', async (file) => {
    await generateDesktopBindings()
    io.files.set(path.join(process.cwd(), file), `updated ${file}`)
    await generateDesktopBindings()
    expect(io.cargo).toHaveBeenCalledTimes(2)
    expect(io.files.get(bindings)).toBe(`bindings for ${io.files.get(source)}`)
  })

  it('retries a changed source snapshot before publishing the contract', async () => {
    io.cargo.mockImplementationOnce(async (_template: TemplateStringsArray, output: string) => {
      io.outputs.push(output)
      io.files.set(output, 'stale bindings')
      io.files.set(source, 'updated Rust contracts')
    })
    await generateDesktopBindings()
    expect(io.cargo).toHaveBeenCalledTimes(2)
    expect(io.files.get(bindings)).toBe('bindings for updated Rust contracts')
    expect(io.published).toEqual(['bindings for updated Rust contracts'])
    expect(io.outputs.every((file) => !io.files.has(file))).toBe(true)
  })

  it('does not cache another process output as its own source snapshot', async () => {
    io.foreignPublish = true
    await generateDesktopBindings()
    expect(io.files.get(bindings)).toBe('foreign output')
    io.foreignPublish = false
    await generateDesktopBindings()
    expect(io.cargo).toHaveBeenCalledTimes(2)
    expect(io.files.get(bindings)).toBe(`bindings for ${io.files.get(source)}`)
  })

  it('uses independent temporary files for concurrent calls in one process', async () => {
    await Promise.all([generateDesktopBindings(), generateDesktopBindings()])
    expect(new Set(io.outputs).size).toBe(2)
    expect(io.outputs.every((file) => !io.files.has(file))).toBe(true)
    expect(io.files.get(bindings)).toBe(`bindings for ${io.files.get(source)}`)
  })

  it('keeps the last valid contract and removes partial output after a failed generation', async () => {
    await generateDesktopBindings()
    const previous = io.files.get(bindings)
    io.files.set(source, 'changed Rust contracts')
    io.cargo.mockImplementationOnce(async (_template: TemplateStringsArray, output: string) => {
      io.outputs.push(output)
      io.files.set(output, 'partial output')
      throw new Error('Compilation failed')
    })
    await expect(generateDesktopBindings()).rejects.toThrow('Compilation failed')
    expect(io.files.get(bindings)).toBe(previous)
    expect(io.outputs.every((file) => !io.files.has(file))).toBe(true)
  })
})

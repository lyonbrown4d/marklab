import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parse } from 'smol-toml'
import { z } from 'zod'
import { $ } from 'zx'

const [mode = 'run', ...arguments_] = process.argv.slice(2)
if (arguments_[0] === '--') arguments_.shift()
const target = mode === 'run' ? undefined : arguments_[0]
if (target && !/^[a-z0-9_-]+$/.test(target)) throw new Error('Invalid Rust target.')
const targetArgs = target ? ['--target', target] : []
const run = $({ stdio: 'inherit' })
if (mode === 'run') {
  await run`cargo run -p marklab-cli --locked -- ${arguments_}`
} else if (mode === 'build') {
  await run`cargo build -p marklab-cli --release --locked ${targetArgs}`
} else if (mode === 'test') {
  await run`cargo test -p marklab-document -p marklab-cli --locked ${targetArgs}`
} else if (mode === 'package') {
  if (!target) throw new Error('Packaging requires an explicit Rust target.')
  const manifest = z.object({ package: z.object({ version: z.string().regex(/^\d+\.\d+\.\d+$/) }) })
  const {
    package: { version },
  } = manifest.parse(parse(await readFile('crates/marklab-cli/Cargo.toml', 'utf8')))
  const releaseEnvironment = z
    .object({ GITHUB_REF_TYPE: z.string().optional(), GITHUB_REF_NAME: z.string().optional() })
    .parse(process.env)
  if (
    releaseEnvironment.GITHUB_REF_TYPE === 'tag' &&
    releaseEnvironment.GITHUB_REF_NAME !== `cli-v${version}`
  ) {
    throw new Error(`CLI release tag must match cli-v${version}.`)
  }
  await run`cargo build -p marklab-cli --release --locked ${targetArgs}`
  const name = `marklab-cli-${version}-${target}`
  const staging = path.join('.tmp', name)
  await rm(staging, { force: true, recursive: true })
  await mkdir(staging, { recursive: true })
  await mkdir('dist/cli', { recursive: true })
  const binary = target.includes('windows') ? 'marklab.exe' : 'marklab'
  await copyFile(
    path.join('src-tauri/target', target, 'release', binary),
    path.join(staging, binary),
  )
  await copyFile('crates/marklab-cli/README.md', path.join(staging, 'README.md'))
  await mkdir(path.join(staging, 'completions'), { recursive: true })
  const executable = path.resolve(staging, binary)
  for (const [shell, file] of [
    ['zsh', '_marklab'],
    ['bash', 'marklab.bash'],
    ['fish', 'marklab.fish'],
    ['powershell', 'marklab.ps1'],
    ['elvish', 'marklab.elv'],
  ]) {
    const completion = await $({ quiet: true })`${executable} completions ${shell}`
    await writeFile(path.join(staging, 'completions', file), completion.stdout)
  }
  const archive = path.join('dist/cli', `${name}.tar.gz`)
  await run`tar -czf ${archive} -C ${staging} .`
  const digest = createHash('sha256')
    .update(await readFile(archive))
    .digest('hex')
  await writeFile(`${archive}.sha256`, `${digest}  ${path.basename(archive)}\n`)
  await rm(staging, { force: true, recursive: true })
} else {
  throw new Error('Expected run, build, test, or package mode.')
}

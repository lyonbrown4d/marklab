import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { z } from 'zod'
import { $ } from 'zx'

const { values } = parseArgs({
  options: { deb: { type: 'string' }, output: { type: 'string' }, help: { type: 'boolean' } },
})
if (values.help) {
  console.log('pnpm dist:flatpak --deb <Marklab_amd64.deb> [--output <directory>]')
  process.exit(0)
}
if (process.platform !== 'linux' || process.arch !== 'x64')
  throw new Error('Flatpak packaging currently requires Linux x86_64.')
if (!values.deb) throw new Error('Provide --deb <Marklab_amd64.deb>. Build pnpm dist:linux first.')

const root = resolve(import.meta.dirname, '..')
const assets = join(root, 'resources/flatpak')
const config = z
  .object({
    id: z.string(),
    runtime: z.string(),
    runtimeVersion: z.string(),
    base: z.string(),
    baseVersion: z.string(),
    branch: z.string(),
    finishArgs: z.array(z.string()),
  })
  .parse(JSON.parse(await readFile(join(assets, 'config.json'), 'utf8')))
const { version } = z
  .object({ version: z.string().regex(/^\d+\.\d+\.\d+$/) })
  .parse(JSON.parse(await readFile(join(root, 'package.json'), 'utf8')))
const deb = resolve(values.deb)
const output = resolve(values.output ?? join(root, 'release/flatpak'))
const run = $({ stdio: 'inherit' })
const capture = $({ quiet: true })

// Validate before initializing a runtime or exporting any release artifact.
const field = async (name: string) => (await capture`dpkg-deb --field ${deb} ${name}`).stdout.trim()
const [name, debVersion, arch] = await Promise.all([
  field('Package'),
  field('Version'),
  field('Architecture'),
])
if (name !== 'marklab' || debVersion !== version || arch !== 'amd64')
  throw new Error(`Expected marklab ${version} amd64, received ${name} ${debVersion} ${arch}.`)

const temporary = await mkdtemp(join(tmpdir(), 'marklab-flatpak-'))
try {
  const source = join(temporary, 'source')
  const build = join(temporary, 'build')
  const repository = join(temporary, 'repo')
  await run`dpkg-deb --extract ${deb} ${source}`
  const application = join(source, 'usr/share/Marklab')
  // Reject incomplete CEF bundles rather than shipping a package that cannot start.
  await Promise.all(
    ['marklab-desktop', 'libcef.so', 'resources.pak', 'icudtl.dat', 'locales/en-US.pak'].map(
      async (file) => {
        const info = await stat(join(application, file))
        if (!info.isFile() || !info.size) throw new Error(`Empty CEF bundle file: ${file}`)
      },
    ),
  )
  await run`flatpak info ${config.runtime}//${config.runtimeVersion}`
  await run`flatpak info ${config.base}//${config.baseVersion}`
  // This repack only needs the Platform: no compiler or SDK is used in the sandbox.
  await run`flatpak build-init --arch=x86_64 --base=${config.base} --base-version=${config.baseVersion} ${build} ${config.id} ${config.runtime} ${config.runtime} ${config.runtimeVersion}`
  const files = join(build, 'files')
  const destination = join(files, 'marklab/bin')
  await cp(application, destination, { recursive: true })
  // Tauri resolves resources relative to the real executable, not the launcher.
  await cp(join(source, 'usr/lib/Marklab'), join(files, 'marklab/lib/Marklab'), { recursive: true })
  await cp(join(assets, 'marklab'), join(files, 'bin/marklab'))
  await chmod(join(files, 'bin/marklab'), 0o755)
  const share = join(files, 'share')
  await mkdir(join(share, 'applications'), { recursive: true })
  const desktop = (await readFile(join(source, 'usr/share/applications/Marklab.desktop'), 'utf8'))
    .replace(/^Exec=.*$/m, 'Exec=marklab %U')
    .replace(/^Icon=.*$/m, `Icon=${config.id}`)
  await writeFile(join(share, `applications/${config.id}.desktop`), desktop)
  const icons = join(source, 'usr/share/icons/hicolor')
  // There are only the fixed application icon sizes; copy them with bounded I/O.
  for (const size of await readdir(icons)) {
    // Flatpak's export validator accepts raster icons up to 512 pixels.
    if (!/^(\d+)x\1$/.test(size) || Number(size.split('x')[0]) > 512) continue
    const target = join(share, `icons/hicolor/${size}/apps/${config.id}.png`)
    await mkdir(dirname(target), { recursive: true })
    await cp(join(icons, size, 'apps/marklab-desktop.png'), target)
  }
  await mkdir(join(share, 'metainfo'), { recursive: true })
  await cp(
    join(assets, `${config.id}.metainfo.xml`),
    join(share, `metainfo/${config.id}.metainfo.xml`),
  )
  await mkdir(join(share, 'mime/packages'), { recursive: true })
  await cp(
    join(source, 'usr/share/mime/packages/marklab.xml'),
    join(share, `mime/packages/${config.id}.xml`),
  )
  // Check against the actual Platform ABI, not the build host's libraries.
  await run`flatpak build --runtime ${build} sh -ec ${'result=$(ldd /app/marklab/bin/marklab-desktop); printf "%s\\n" "$result"; ! printf "%s\\n" "$result" | grep -E "not found|version .* not found"'}`
  await run`flatpak build-finish --command=marklab --require-version=1.12.0 ${config.finishArgs} ${build}`
  await run`flatpak build-export ${repository} ${build} ${config.branch}`
  await mkdir(output, { recursive: true })
  const artifact = join(output, `Marklab_${version}_x86_64.flatpak`)
  const pending = join(output, `.${basename(temporary)}.flatpak`)
  try {
    await run`flatpak build-bundle --runtime-repo=https://dl.flathub.org/repo/flathub.flatpakrepo ${repository} ${pending} ${config.id} ${config.branch}`
    await rename(pending, artifact)
  } finally {
    await rm(pending, { force: true })
  }
  console.log(`Flatpak bundle: ${artifact}`)
} finally {
  await rm(temporary, { recursive: true, force: true })
}

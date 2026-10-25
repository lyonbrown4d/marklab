import { appendFile, readFile, writeFile } from 'node:fs/promises'
import { parse } from 'smol-toml'
import { z } from 'zod'

const environment = z
  .object({
    GITHUB_REPOSITORY: z.string().optional(),
    GITHUB_REF_TYPE: z.string().optional(),
    GITHUB_REF_NAME: z.string().optional(),
    GITHUB_OUTPUT: z.string().optional(),
    REQUESTED_TAG: z.string().optional(),
    TAURI_RELEASE_CONFIG: z.string().optional(),
    TAURI_SIGNING_PUBLIC_KEY: z.string().optional(),
    TAURI_SIGNING_PRIVATE_KEY: z.string().optional(),
    RELEASE_PLATFORM: z.string().optional(),
    APPLE_CERTIFICATE: z.string().optional(),
    APPLE_CERTIFICATE_PASSWORD: z.string().optional(),
    APPLE_SIGNING_IDENTITY: z.string().optional(),
    APPLE_ID: z.string().optional(),
    APPLE_PASSWORD: z.string().optional(),
    APPLE_TEAM_ID: z.string().optional(),
  })
  .parse(process.env)

const repository = 'lyonbrown4d/marklab'
if (environment.GITHUB_REPOSITORY !== repository) {
  throw new Error(`Release workflow must run from ${repository}.`)
}
const [packageText, configText, cargoText, documentText, cliText] = await Promise.all([
  readFile('package.json', 'utf8'),
  readFile('src-tauri/tauri.conf.json', 'utf8'),
  readFile('src-tauri/Cargo.toml', 'utf8'),
  readFile('crates/marklab-document/Cargo.toml', 'utf8'),
  readFile('crates/marklab-cli/Cargo.toml', 'utf8'),
])
const versionSchema = z.object({ version: z.string().regex(/^\d+\.\d+\.\d+$/) })
const { version } = versionSchema.parse(JSON.parse(packageText))
const configVersion = versionSchema.parse(JSON.parse(configText)).version
const cargoVersion = z.object({ package: versionSchema }).parse(parse(cargoText)).package.version
const sharedVersions = [documentText, cliText].map(
  (text) => z.object({ package: versionSchema }).parse(parse(text)).package.version,
)
if (
  version !== configVersion ||
  version !== cargoVersion ||
  sharedVersions.some((value) => value !== version)
) {
  throw new Error('package.json, tauri.conf.json, and all Rust package versions must match.')
}
const expectedTag = `app-v${version}`
const tag =
  environment.GITHUB_REF_TYPE === 'tag'
    ? environment.GITHUB_REF_NAME
    : environment.REQUESTED_TAG?.trim() || expectedTag
if (tag !== expectedTag) throw new Error(`Release tag must exactly match ${expectedTag}.`)
if (environment.GITHUB_OUTPUT) {
  await appendFile(environment.GITHUB_OUTPUT, `tag=${tag}\n`)
}

const mode = process.argv[2]
if (mode === 'configure') {
  const required = [
    'TAURI_RELEASE_CONFIG',
    'TAURI_SIGNING_PUBLIC_KEY',
    'TAURI_SIGNING_PRIVATE_KEY',
    ...(environment.RELEASE_PLATFORM === 'macos'
      ? [
          'APPLE_CERTIFICATE',
          'APPLE_CERTIFICATE_PASSWORD',
          'APPLE_SIGNING_IDENTITY',
          'APPLE_ID',
          'APPLE_PASSWORD',
          'APPLE_TEAM_ID',
        ]
      : []),
  ] as (keyof typeof environment)[]
  const missing = required.filter((name) => !environment[name]?.trim())
  if (missing.length) throw new Error(`Missing release configuration: ${missing.join(', ')}.`)
  const output = environment.TAURI_RELEASE_CONFIG
  if (!output) throw new Error('Missing TAURI_RELEASE_CONFIG.')
  await writeFile(
    output,
    JSON.stringify(
      {
        bundle: { createUpdaterArtifacts: true },
        plugins: {
          updater: {
            pubkey: environment.TAURI_SIGNING_PUBLIC_KEY?.trim(),
            endpoints: [`https://github.com/${repository}/releases/latest/download/latest.json`],
          },
        },
      },
      null,
      2,
    ) + '\n',
  )
} else if (mode !== 'validate') {
  throw new Error('Expected validate or configure mode.')
}

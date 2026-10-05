import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const FIXTURE_PREFIX = 'marklab-workspace-product-'
const MARKDOWN_FILE_COUNT = 20

export type WorkspaceProductFixture = {
  generated: boolean
  homeFileName: string
  root: string
  workspaceName: string
}

const writeFile = (root: string, relativePath: string, content: string) => {
  const target = path.join(root, relativePath)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content, 'utf8')
}

const createHomeDocument = () => {
  const topics = Array.from({ length: MARKDOWN_FILE_COUNT - 1 }, (_, index) => {
    const number = String(index + 1).padStart(2, '0')
    return `- [Topic ${number}](./Topic-${number}.md)`
  })
  return [
    '# Home',
    '',
    'A deterministic workspace used to verify the map as a real product surface.',
    '',
    '## Topics',
    '',
    ...topics,
    '',
    '## Resources',
    '',
    '- [Pipeline configuration](./pipeline.yml)',
    '- ![Architecture diagram](./assets/architecture.svg)',
    '- [Marklab documentation](https://example.com/?resource=marklab-docs)',
    '',
  ].join('\n')
}

const createTopicDocument = (index: number) => {
  const number = String(index).padStart(2, '0')
  const nextNumber = String(index === MARKDOWN_FILE_COUNT - 1 ? 1 : index + 1).padStart(2, '0')
  const externalLinks = Array.from(
    { length: 3 },
    (_, linkIndex) =>
      `- [External reference ${number}.${linkIndex + 1}](https://example.com/?topic=${number}&ref=${linkIndex + 1})`,
  )
  return [
    `# Topic ${number}`,
    '',
    `Topic ${number} contains enough content for a meaningful embedded preview.`,
    '',
    `Previous context lives in [Home](./Home.md), and work continues in [Topic ${nextNumber}](./Topic-${nextNumber}.md).`,
    '',
    '## References',
    '',
    ...externalLinks,
    '',
  ].join('\n')
}

const createGeneratedWorkspace = (): WorkspaceProductFixture => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), FIXTURE_PREFIX))
  writeFile(root, 'Home.md', createHomeDocument())
  for (let index = 1; index < MARKDOWN_FILE_COUNT; index += 1) {
    const number = String(index).padStart(2, '0')
    writeFile(root, `Topic-${number}.md`, createTopicDocument(index))
  }
  writeFile(
    root,
    'pipeline.yml',
    [
      'name: product-readiness',
      'steps:',
      '  - run: pnpm test:electron',
      '  - run: pnpm build',
    ].join('\n'),
  )
  writeFile(
    root,
    'assets/architecture.svg',
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="120"><rect width="320" height="120" rx="16" fill="#18181b"/><text x="160" y="68" fill="#fafafa" text-anchor="middle" font-family="sans-serif" font-size="20">Workspace map</text></svg>',
  )
  return { generated: true, homeFileName: 'Home.md', root, workspaceName: path.basename(root) }
}

export const resolveWorkspaceProductFixture = (): WorkspaceProductFixture => {
  const configuredRoot = process.env.MARKLAB_E2E_WORKSPACE?.trim()
  if (!configuredRoot) return createGeneratedWorkspace()
  const root = path.resolve(configuredRoot)
  if (!fs.statSync(root).isDirectory()) {
    throw new Error(`MARKLAB_E2E_WORKSPACE must point to a directory: ${root}`)
  }
  return { generated: false, homeFileName: 'Home.md', root, workspaceName: path.basename(root) }
}

export const removeWorkspaceProductFixture = (fixture: WorkspaceProductFixture | undefined) => {
  if (!fixture?.generated) return
  const temporaryRoot = path.resolve(os.tmpdir())
  const fixtureRoot = path.resolve(fixture.root)
  if (
    path.dirname(fixtureRoot) !== temporaryRoot ||
    !path.basename(fixtureRoot).startsWith(FIXTURE_PREFIX)
  ) {
    throw new Error(`Refusing to remove an unexpected workspace fixture path: ${fixtureRoot}`)
  }
  fs.rmSync(fixtureRoot, { recursive: true, force: true })
}

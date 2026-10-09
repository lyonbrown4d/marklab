import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const FIXTURE_PREFIX = 'marklab-plate-block-drag-'
const DOCUMENT_NAME = 'Block-drag.md'
const BLOCK_COUNT = 42

export type PlateBlockDragFixture = {
  documentName: string
  documentPath: string
  markers: string[]
  root: string
}

const createDocument = (markers: string[]) =>
  markers
    .map(
      (marker) =>
        `${marker} keeps a deterministic paragraph long enough to exercise visible block geometry and editor scrolling.`,
    )
    .join('\n\n')

export const createPlateBlockDragFixture = (): PlateBlockDragFixture => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), FIXTURE_PREFIX))
  const markers = Array.from(
    { length: BLOCK_COUNT },
    (_, index) => `DRAG-BLOCK-${String(index + 1).padStart(2, '0')}`,
  )
  const documentPath = path.join(root, DOCUMENT_NAME)
  fs.writeFileSync(documentPath, createDocument(markers), 'utf8')
  return { documentName: DOCUMENT_NAME, documentPath, markers, root }
}

export const readPersistedBlockOrder = (documentPath: string) =>
  Array.from(
    fs.readFileSync(documentPath, 'utf8').matchAll(/DRAG-BLOCK-\d{2}/g),
    ([marker]) => marker,
  )

export const removePlateBlockDragFixture = (fixture: PlateBlockDragFixture | undefined) => {
  if (!fixture) return
  const fixtureRoot = path.resolve(fixture.root)
  if (
    path.dirname(fixtureRoot) !== path.resolve(os.tmpdir()) ||
    !path.basename(fixtureRoot).startsWith(FIXTURE_PREFIX)
  ) {
    throw new Error(`Refusing to remove an unexpected fixture path: ${fixtureRoot}`)
  }
  fs.rmSync(fixtureRoot, { force: true, recursive: true })
}

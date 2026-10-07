import { describe, expect, it } from 'vitest'
import { createEditorTextPatch } from '@/components/editorTextPatch'

describe('editor text patch', () => {
  it('creates one bounded replacement for a localized snapshot change', () => {
    expect(createEditorTextPatch('prefix old suffix', 'prefix new suffix')).toEqual([
      { offset: 7, delete_length: 3, insert_text: 'new' },
    ])
  })

  it('uses a checkpoint when a patch would carry almost the whole snapshot', () => {
    expect(createEditorTextPatch('a'.repeat(1_000), 'b'.repeat(1_000))).toBeNull()
  })

  it('uses a checkpoint when inserted text exceeds the patch protocol limit', () => {
    const unchanged = 'x'.repeat(1_100_000)
    expect(
      createEditorTextPatch(
        unchanged + 'old' + unchanged,
        unchanged + 'y'.repeat(1_048_577) + unchanged,
      ),
    ).toBeNull()
  })
})

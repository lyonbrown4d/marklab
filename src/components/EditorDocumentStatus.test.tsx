import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { EditorDocumentStatus } from '@/components/EditorDocumentStatus'
import { AppStatusBarProvider, EditorStatusBarSlot } from '@/components/EditorStatusBar'
import {
  clearActiveHeading,
  clearDocumentNavigation,
  setActiveHeading,
  setDocumentScrollProgress,
} from '@/utils/editorNavigation'

describe('EditorDocumentStatus', () => {
  afterEach(() => {
    clearActiveHeading('guide.md')
    clearDocumentNavigation('guide.md')
  })

  it('shows the active section and scroll progress for the current rich document', () => {
    setActiveHeading('guide.md', {
      blockIndex: 2,
      level: 2,
      slug: 'details',
      text: 'Details',
    })
    setDocumentScrollProgress('guide.md', 42)

    render(
      <AppStatusBarProvider activePath="guide.md" viewMode="wysiwyg">
        <EditorStatusBarSlot label="Document status" />
        <EditorDocumentStatus
          activePath="guide.md"
          stats={{ characters: 12, lines: 2, words: 2 }}
          value={'# Guide\nDetails'}
          viewMode="wysiwyg"
        />
      </AppStatusBarProvider>,
    )

    expect(screen.getByText('# Details')).toBeVisible()
    expect(screen.getByText('42%')).toBeVisible()
  })
})

// @ts-expect-error Vitest executes this style contract test in Node.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readStyle = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8') as string

const terminalStyles = readStyle('./app/_terminal.scss')

describe('terminal dock trigger styles', () => {
  it('keeps hover, active, and focus states anchored to the same border box', () => {
    expect(terminalStyles).toContain('&:focus-visible')
    expect(terminalStyles).not.toMatch(
      /&:(?:hover|active|focus-visible)\s*{[^}]*(?:transform|padding|width|height|border-width)\s*:/s,
    )
  })
})

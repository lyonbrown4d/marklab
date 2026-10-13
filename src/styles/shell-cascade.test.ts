import { readFileSync } from 'node:fs'
import { parse, type Declaration } from 'postcss'
import { compileString } from 'sass'
import { compile } from 'tailwindcss'
import ts from 'typescript'
import { beforeAll, describe, expect, it } from 'vitest'
import { chromeButtonClassName } from '@/components/titlebar/chromeStyles'

const componentClasses = (file: string) => {
  const classes: string[] = []
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const collect = (node: ts.Node) => {
    if (ts.isStringLiteral(node)) classes.push(...node.text.split(/\s+/))
    ts.forEachChild(node, collect)
  }
  collect(source)
  return classes
}

const classes = {
  tabs: componentClasses('src/components/TabsBarVirtualList.tsx'),
  terminal: componentClasses('src/components/TerminalPanel.tsx'),
  command: componentClasses('src/components/titlebar/TitlebarCommandCenter.tsx'),
  windows: componentClasses('src/components/WindowControls.tsx'),
}
let styles: ReturnType<typeof parse>

beforeAll(async () => {
  const compiler = await compile(
    '@theme { --spacing: 0.25rem; } @custom-variant dark (&:is(.dark *)); @layer utilities { @tailwind utilities; }',
  )
  const utilities = compiler.build([
    ...chromeButtonClassName.split(' '),
    ...Object.values(classes).flat(),
  ])
  const base = compileString(readFileSync('src/styles/app/_base.scss', 'utf8')).css
  styles = parse(`${utilities}\n${base}`)
})

const importantDeclarations = (candidates: string[], property: string) => {
  const declarations: Declaration[] = []
  styles.walkRules((rule) => {
    if (!candidates.some((candidate) => rule.selector.includes(`.${CSS.escape(candidate)}`))) return
    rule.walkDecls(property, (declaration) => {
      if (declaration.important) declarations.push(declaration)
    })
  })
  return declarations
}

describe('shell utilities with the unlayered app foundations', () => {
  it('preserves chrome hover, open, pressed, and focused shadows over the global focus ring', () => {
    const button = document.createElement('button')
    button.className = chromeButtonClassName
    // Simulate the browser pseudo states while retaining each generated selector's specificity.
    const shadowFor = (state: {
      focused?: boolean
      hovered?: boolean
      open?: boolean
      pressed?: boolean
    }) => {
      button.toggleAttribute('data-test-focus', Boolean(state.focused))
      button.toggleAttribute('data-test-hover', Boolean(state.hovered))
      button.setAttribute('data-state', state.open ? 'open' : 'closed')
      button.setAttribute('aria-pressed', String(Boolean(state.pressed)))
      const shadows: { value: string; priority: number }[] = []
      styles.walkRules((rule) => {
        const selector = rule.selector
          .replace(/(?<!\\):focus-visible/g, '[data-test-focus]')
          .replace(/(?<!\\):hover/g, '[data-test-hover]')
        if (!button.matches(selector)) return
        rule.walkDecls('box-shadow', (declaration) => {
          if (declaration.important) {
            shadows.push({
              value: declaration.value,
              priority: rule.selector.includes(':not(:disabled):hover') ? 3 : 2,
            })
          }
        })
      })
      return shadows.sort((a, b) => a.priority - b.priority).at(-1)?.value
    }
    expect(shadowFor({ focused: true })).toContain('hsl(var(--foreground)) 8%')
    expect(shadowFor({ focused: true, open: true })).toContain('hsl(var(--primary)) 20%')
    expect(shadowFor({ focused: true, pressed: true })).toContain('hsl(var(--primary)) 20%')
    expect(shadowFor({ focused: true, open: true, hovered: true })).toContain(
      'hsl(var(--foreground)) 8%',
    )
    expect(shadowFor({})).toBeUndefined()
  })

  it('keeps command and Windows caption buttons on the global focus ring', () => {
    expect(importantDeclarations(classes.command, 'box-shadow')).toHaveLength(0)
    expect(importantDeclarations(classes.windows, 'box-shadow')).toHaveLength(0)
    let globalFocusShadow: Declaration | undefined
    styles.walkRules((rule) => {
      if (!rule.selectors.includes('button:focus-visible')) return
      rule.walkDecls('box-shadow', (declaration) => {
        globalFocusShadow = declaration
      })
    })
    expect(globalFocusShadow?.important).toBeFalsy()
    expect(globalFocusShadow?.value).toContain('hsl(var(--ring)) 46%')
  })

  it('preserves compact tab and terminal scrollbars over the global scrollbar defaults', () => {
    const tabHeights = importantDeclarations(classes.tabs, 'height')
    const terminalHeights = importantDeclarations(classes.terminal, 'height')
    expect(tabHeights.map((declaration) => declaration.value)).toContain(
      'calc(var(--spacing) * 1.5)',
    )
    expect(terminalHeights.map((declaration) => declaration.value)).toContain('var(--spacing)')
    expect(
      importantDeclarations(classes.tabs, 'background-color').some((declaration) =>
        declaration.value.includes('hsl(var(--foreground)) 22%'),
      ),
    ).toBe(true)
    expect(
      importantDeclarations(classes.terminal, 'background-color').some((declaration) =>
        declaration.value.includes('hsl(var(--foreground)) 18%'),
      ),
    ).toBe(true)
    expect(
      importantDeclarations(classes.terminal, 'scrollbar-color').map(
        (declaration) => declaration.value,
      ),
    ).toContain('color-mix(in srgb,hsl(var(--foreground)) 18%,transparent) transparent')
  })
})

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss, { type Declaration, type Root } from 'postcss'
import tailwindcss from '@tailwindcss/postcss'
import { compileString } from 'sass'
import { beforeAll, describe, expect, it } from 'vitest'

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
const settingsStyles = readSource('src/styles/app/_settings.scss')
const baseStyles = postcss.parse(compileString(readSource('src/styles/app/_base.scss')).css)
const settingsDialogSource = readSource('src/components/settings/SettingsDialogLoading.tsx')
let generated: Root

beforeAll(async () => {
  const result = await postcss([tailwindcss()]).process(
    "@import 'tailwindcss' source(none);\n" +
      ['SettingsDialogLoading', 'CustomThemesSettingsSection', 'AppearanceSettingsPage']
        .map((file) => `@source '../components/settings/${file}.tsx';`)
        .join('\n'),
    { from: resolve('src/styles/settings-rendering.generated.css') },
  )
  generated = result.root
  expect(result.warnings()).toEqual([])
})

const declarationsFor = (selector: string) => {
  const declarations: Record<string, string> = {}
  generated.walkRules(selector, (rule) => {
    rule.walkDecls((declaration) => {
      declarations[declaration.prop] = declaration.value
    })
  })
  return declarations
}

// A scoped important utility beats the normal unlayered base declaration regardless
// of selector specificity. Check generated declarations, including nested fallbacks.
const expectScopedOverride = (
  selectorPart: string,
  property: string,
  value: string,
  baseSelector: string,
) => {
  const scoped: Declaration[] = []
  generated.walkRules((rule) => {
    if (rule.selector.includes(selectorPart)) {
      rule.walkDecls(property, (declaration) => {
        scoped.push(declaration)
      })
    }
  })
  expect(scoped.some((declaration) => declaration.value === value)).toBe(true)
  expect(scoped.every((declaration) => declaration.important)).toBe(true)
  const competing: Declaration[] = []
  baseStyles.walkRules((rule) => {
    if (rule.selector.includes(baseSelector)) {
      rule.walkDecls(property, (declaration) => {
        competing.push(declaration)
      })
    }
  })
  expect(competing.length).toBeGreaterThan(0)
  expect(competing.every((declaration) => !declaration.important)).toBe(true)
}

describe('settings rendering', () => {
  it('centers the dialog without retaining a transformed GPU layer', () => {
    expect(settingsDialogSource).toContain('inset-0 m-auto translate-none transform-none')
    expect(declarationsFor('.inset-0')).toHaveProperty('inset', '0px')
    expect(declarationsFor('.m-auto')).toHaveProperty('margin', 'auto')
    expect(declarationsFor('.translate-none')).toHaveProperty('translate', 'none')
    expect(declarationsFor('.transform-none')).toHaveProperty('transform', 'none')
    expect(declarationsFor('.will-change-auto')).toHaveProperty('will-change', 'auto')
    expect(settingsStyles).not.toMatch(/\.settings-dialog-content\s*\{/)
  })

  it('uses opacity-only dialog motion so text stays crisp after opening', () => {
    const animationNames: string[] = []
    generated.walkDecls('animation-name', (declaration) => {
      animationNames.push(declaration.value)
    })
    expect(animationNames).toEqual(
      expect.arrayContaining(['settings-dialog-content-in', 'settings-dialog-content-out']),
    )
    expect(settingsStyles).toMatch(
      /@keyframes settings-dialog-content-in\s*\{(?:(?!transform:)[\s\S])*?\}/,
    )
    expect(settingsStyles).toMatch(
      /@keyframes settings-dialog-content-out\s*\{(?:(?!transform:)[\s\S])*?\}/,
    )
  })

  it('shares native scrollbar utilities between the loaded dialog and fallback', () => {
    for (const file of ['SettingsDialog', 'SettingsDialogFallback']) {
      expect(readSource(`src/components/${file}.tsx`)).toContain(
        'className={settingsScrollViewportClassName}',
      )
    }
    const scrollbarWidths: string[] = []
    generated.walkRules((rule) => {
      if (rule.selector.includes('::-webkit-scrollbar')) {
        rule.walkDecls('width', (declaration) => {
          scrollbarWidths.push(declaration.value)
        })
      }
    })
    expect(scrollbarWidths).toContain('6px')
    expect(settingsStyles).not.toContain('.settings-scroll-viewport')
  })

  it('preserves scoped scrollbar width and thumb color over unlayered global rules', () => {
    expectScopedOverride('::-webkit-scrollbar', 'width', '6px', '*::-webkit-scrollbar')
    // Background-color overrides the global background shorthand's color component.
    const thumb: Declaration[] = []
    generated.walkRules((rule) => {
      if (rule.selector.includes('::-webkit-scrollbar-thumb')) {
        rule.walkDecls('background-color', (declaration) => {
          thumb.push(declaration)
        })
      }
    })
    expect(
      thumb.some(
        (declaration) =>
          declaration.value === 'color-mix(in srgb,hsl(var(--foreground)) 22%,transparent)',
      ),
    ).toBe(true)
    expect(thumb.every((declaration) => declaration.important)).toBe(true)
    const baseThumb: Declaration[] = []
    baseStyles.walkRules('*::-webkit-scrollbar-thumb', (rule) => {
      rule.walkDecls('background', (declaration) => {
        baseThumb.push(declaration)
      })
    })
    expect(baseThumb.map((declaration) => declaration.value)).toContain(
      'color-mix(in srgb, hsl(var(--foreground)) 24%, transparent)',
    )
    expect(baseThumb.every((declaration) => !declaration.important)).toBe(true)
  })

  it('preserves the local custom theme focus shadow', () => {
    expectScopedOverride(
      'focus-visible',
      'box-shadow',
      '0 0 0 2px color-mix(in srgb,hsl(var(--ring)) 26%,transparent)',
      'button:focus-visible',
    )
  })

  it('keeps shortcut category labels in the component utility styles', () => {
    expect(readSource('src/components/settings/ShortcutsSettingsPage.tsx')).toContain(
      'text-xs font-medium text-muted-foreground',
    )
    expect(settingsStyles).not.toContain('.settings-shortcut-')
  })
})

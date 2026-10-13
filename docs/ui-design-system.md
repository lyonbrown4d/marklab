# Marklab UI design system

This document records the current UI foundation decisions so future UI work uses one source of truth instead of local color fixes.

## Theme foundation

- `src/index.scss` is the global stylesheet and the shadcn theme entry.
- `components.json` points shadcn to `src/index.scss`.
- `paper` is the default light theme.
- `ink` is the default dark theme.
- Existing theme preset names remain available, but new UI work should not add compatibility layers for older token values.

## Visual direction

- Keep the default interface clean, quiet, and high contrast.
- Use neutral surfaces with a teal primary accent.
- Reserve warm accent colors for destructive, warning, or explicitly emphasized actions.
- Keep editor content visually dominant and reduce chrome weight around it.
- Prefer spacing, type hierarchy, and subtle separators over heavy card borders.

## Token rules

- Use semantic tokens first: `background`, `foreground`, `card`, `muted`, `accent`, `primary`, `border`, `ring`, and `sidebar-*`.
- Do not use raw Tailwind colors for product UI states.
- Do not add `dark:` color overrides for shared components.
- Add new semantic tokens in `src/index.scss` only when multiple features need the same meaning.
- Keep shadcn components unmodified; compose wrappers around them when Marklab needs product-specific behavior.

## Default palette intent

- Light defaults use a near-white green-neutral background, white surfaces, dark green-black text, and visible low-noise borders.
- Dark defaults use a near-black green-neutral background, clear elevated surfaces, soft high-contrast text, and a brighter teal primary.
- Sidebar colors are slightly separated from content colors so the workspace shell is readable without feeling heavy.

## Implementation guardrails

- Prefer shadcn/Radix primitives before custom markup.
- Use Tailwind utilities first for ordinary layout, spacing, typography, semantic
  colors, and interaction states, both in new work and existing-style migrations.
- Keep downloaded `src/components/ui/**` components unchanged during styling
  migrations. Compose classes at business call sites and reuse the existing `cn`
  helper and components for shared variants.
- Keep custom CSS focused on theme tokens, animation keyframes, global browser
  and accessibility defaults, and necessary third-party/native integration.
- Remove replaced rules after checking every consumer. Verify the final CSS
  cascade against retained global and library rules; use narrowly scoped
  important utilities only when needed to preserve the existing behavior.
- Keep settings, shell, graph, and editor styles connected to the same theme tokens.
- Every UI iteration should run typecheck and tests before handoff.

## Existing-style migration

The 2026-10-14 migration covers loading/splash, standalone preview entries, shell
and titlebar business components, tabs and status bars, terminal chrome, settings
and theme previews, graph nodes, and workspace-map nodes. Layout and interaction
utilities live with their consumers. Shared loading keyframes, palette tokens,
native drag regions, xterm/React Flow integration, and global accessibility rules
remain focused stylesheets.

Source/editor surfaces and shortcut styles shared with the concurrent Vim-mode
work remain for a later scoped migration. Menu primitives and their shared
styles remain unchanged. New Vim UI follows the same Tailwind-first convention.

The 22 changed or removed custom stylesheets shrink from 3158 to 1588 lines;
this source-line comparison excludes generated CSS and unchanged editor styles.
Actual Chrome comparisons cover 22 light/dark interaction states against the
previous CSS, including focus/open/hover combinations, native scrollbar
declarations, and graph/map selection. The development-mode Electron startup
test also preserves native bounds and the complete 260ms main-window entrance.
These checks use source generation and tests without a production build. Windows
glyph declarations are checked in Chrome; Windows font availability and native
window behavior still require that operating system.

Regression validation passes 858 test files and 4601 tests with the per-file 85%
critical coverage gate. The final loading-font correction is separately checked
after that run: actual rendered classes must generate both the monospace font
family and bold weight in normal and compact indicators. Arbitrary font-family
utilities need an explicit `family-name:` hint so `cn` preserves them alongside
font-weight utilities. Settings dialog bounds and 150ms opacity animation also
match the previous version in actual Chrome.

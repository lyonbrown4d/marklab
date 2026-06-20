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
- Use class names for layout, not for overriding component colors.
- Keep settings, shell, graph, and editor styles connected to the same theme tokens.
- Every UI iteration should run typecheck and tests before handoff.

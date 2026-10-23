import { all, createLowlight } from 'lowlight'

// Rich-text code blocks and source previews share grammar registration and the
// compiled-language caches, including the editor's existing shell alias.
export const codeHighlighter = createLowlight({ ...all, shell: all.bash })

/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_REACT_DEVTOOLS?: string
  readonly VITE_REACT_SCAN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

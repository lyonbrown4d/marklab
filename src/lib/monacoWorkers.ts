type MonacoWorkerModule = { default: new () => Worker }
type WorkerLoader = () => Promise<MonacoWorkerModule>

const workerLoaders = {
  editor: () => import('monaco-editor/editor/editor.worker.js?worker'),
  css: () => import('monaco-editor/languages/features/css/css.worker.js?worker'),
  html: () => import('monaco-editor/languages/features/html/html.worker.js?worker'),
  json: () => import('monaco-editor/languages/features/json/json.worker.js?worker'),
  typescript: () => import('monaco-editor/languages/features/typescript/ts.worker.js?worker'),
} satisfies Record<string, WorkerLoader>

export const loadMonacoWorker = async (_workerId: string, label: string): Promise<Worker> => {
  let load: WorkerLoader = workerLoaders.editor
  if (label === 'json') load = workerLoaders.json
  if (label === 'css' || label === 'scss' || label === 'less') load = workerLoaders.css
  if (label === 'html' || label === 'handlebars' || label === 'razor') load = workerLoaders.html
  if (label === 'typescript' || label === 'javascript') load = workerLoaders.typescript
  const worker = await load()
  return new worker.default()
}

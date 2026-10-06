import type { MermaidValidator } from '@electron/services/mermaidLanguage/types.js'
import { MermaidValidationWorkerClient } from '@electron/services/mermaidLanguage/validationWorkerClient.js'

const validationWorker = new MermaidValidationWorkerClient()

export const validateMermaidSyntax: MermaidValidator = async (document, options) => {
  if (!document.text.trim()) return []
  return validationWorker.validate(document, options)
}

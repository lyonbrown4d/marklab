import type { Value } from 'platejs'
import type { PlateEditor } from 'platejs/react'
import { useCallback, useEffect, useRef, type RefObject } from 'react'
import {
  commitPlateEditorHydrationState,
  finalizePatchedPlateEditorValue,
  patchPlateEditorValue,
  reconcilePlateEditorValue,
  restorePlateEditorValue,
  splitPlateHydrationChunk,
  yieldToPlateHydrationTask,
} from '@/components/plate/plateEditorValueHydration'
import { streamPlateMarkdown } from '@/services/plateMarkdownWorkerClient'

type UsePlateExternalValueLoaderOptions = {
  editor: PlateEditor
  externalApplyRef: RefObject<boolean>
}

const EXTERNAL_HYDRATION_CHUNK_NODES = 12

export const usePlateExternalValueLoader = ({
  editor,
  externalApplyRef,
}: UsePlateExternalValueLoaderOptions) => {
  const abortRef = useRef<AbortController | null>(null)
  const activeGenerationRef = useRef<number | null>(null)
  const generationRef = useRef(0)
  const stableChildrenRef = useRef<Value | null>(null)
  const copiedStableIndexesRef = useRef<Set<number>>(new Set())

  const cancel = useCallback(() => {
    generationRef.current += 1
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  const load = useCallback(
    async (markdown: string, canApply: () => boolean) => {
      cancel()
      const generation = generationRef.current
      const controller = new AbortController()
      abortRef.current = controller
      if (activeGenerationRef.current === null) {
        stableChildrenRef.current = [...(editor.children as Value)]
        copiedStableIndexesRef.current.clear()
      }
      activeGenerationRef.current = generation
      const originalChildren = [...editor.children] as Value
      let appliedNodeCount = 0
      let expectedChildren = editor.children
      let mutated = false

      const rollbackIfOwned = async (force = false) => {
        if (activeGenerationRef.current !== generation) return
        const stableChildren = stableChildrenRef.current
        if ((mutated || force) && stableChildren) {
          await restorePlateEditorValue(editor, stableChildren, externalApplyRef)
        }
        activeGenerationRef.current = null
        stableChildrenRef.current = null
        copiedStableIndexesRef.current.clear()
      }

      try {
        await streamPlateMarkdown(
          editor,
          markdown,
          async (chunk) => {
            for (const rendererChunk of splitPlateHydrationChunk(
              chunk,
              EXTERNAL_HYDRATION_CHUNK_NODES,
            )) {
              if (
                controller.signal.aborted ||
                generation !== generationRef.current ||
                editor.children !== expectedChildren ||
                !canApply()
              ) {
                controller.abort()
                return
              }
              const reconciledChunk = reconcilePlateEditorValue(
                originalChildren,
                rendererChunk,
                appliedNodeCount,
              )
              const stableChildren = stableChildrenRef.current
              reconciledChunk.forEach((node, index) => {
                const stableIndex = appliedNodeCount + index
                if (
                  !stableChildren?.[stableIndex] ||
                  copiedStableIndexesRef.current.has(stableIndex) ||
                  editor.children[stableIndex] === node
                ) {
                  return
                }
                stableChildren[stableIndex] = structuredClone(stableChildren[stableIndex])
                copiedStableIndexesRef.current.add(stableIndex)
              })
              mutated =
                (await patchPlateEditorValue(
                  editor,
                  reconciledChunk,
                  appliedNodeCount,
                  externalApplyRef,
                )) || mutated
              appliedNodeCount += rendererChunk.length
              expectedChildren = editor.children
              await yieldToPlateHydrationTask()
            }
          },
          controller.signal,
        )
        if (
          controller.signal.aborted ||
          generation !== generationRef.current ||
          editor.children !== expectedChildren ||
          !canApply()
        ) {
          controller.abort()
          await rollbackIfOwned()
          return false
        }
        mutated =
          (await finalizePatchedPlateEditorValue(editor, appliedNodeCount, externalApplyRef)) ||
          mutated
        if (!canApply()) {
          controller.abort()
          await rollbackIfOwned()
          return false
        }
        if (mutated) await commitPlateEditorHydrationState(editor, externalApplyRef)
        if (activeGenerationRef.current === generation) {
          activeGenerationRef.current = null
          stableChildrenRef.current = null
          copiedStableIndexesRef.current.clear()
        }
        return true
      } catch (error) {
        const currentGeneration = generation === generationRef.current
        await rollbackIfOwned(true)
        if (controller.signal.aborted || !currentGeneration) return false
        throw error
      } finally {
        if (abortRef.current === controller) abortRef.current = null
      }
    },
    [cancel, editor, externalApplyRef],
  )

  useEffect(
    () => () => {
      cancel()
      activeGenerationRef.current = null
      stableChildrenRef.current = null
      copiedStableIndexesRef.current.clear()
    },
    [cancel, editor],
  )

  return { cancel, load }
}

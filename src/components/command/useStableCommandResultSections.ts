import { useState } from 'react'
import { orderByStableResultIds } from '@/components/command/commandResultStability'

type StableRow = { id: string }
type StableSection<Row extends StableRow> = { id: string; rows: Row[] }

export const useStableCommandResultSections = <
  Row extends StableRow,
  Section extends StableSection<Row>,
>(
  stabilityKey: string,
  sections: Section[],
): Section[] => {
  const sourceSignature = JSON.stringify(
    sections.map((section) => [section.id, section.rows.map((row) => row.id)]),
  )
  const [stableState, setStableState] = useState(() => ({
    idsBySection: new Map(
      sections.map((section) => [section.id, section.rows.map((row) => row.id)]),
    ),
    key: stabilityKey,
    sourceSignature,
  }))
  const stableSections = sections.map((section) => ({
    ...section,
    rows: orderByStableResultIds(
      stableState.key === stabilityKey ? (stableState.idsBySection.get(section.id) ?? []) : [],
      section.rows,
      (row) => row.id,
    ),
  }))

  if (stableState.key !== stabilityKey || stableState.sourceSignature !== sourceSignature) {
    setStableState({
      idsBySection: new Map(
        stableSections.map((section) => [section.id, section.rows.map((row) => row.id)]),
      ),
      key: stabilityKey,
      sourceSignature,
    })
  }

  return stableSections
}

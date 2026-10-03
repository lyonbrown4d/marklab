import { FileDown, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { menuItemStyles, menuSurfaceStyles } from '@/components/overlay/overlayStyles'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { ExportFormat } from '@/services/exportApi'
import { useState } from 'react'
import { useNativeSurfaceOcclusion } from '@/app/nativeSurfaceOcclusion'

type TitlebarExportMenuProps = {
  disabled: boolean
  exportLabel: string
  exportPdfLabel: string
  exportDocxLabel: string
  onExport: (format: Extract<ExportFormat, 'pdf' | 'docx'>) => void
}

export const TitlebarExportMenu = ({
  disabled,
  exportLabel,
  exportPdfLabel,
  exportDocxLabel,
  onExport,
}: TitlebarExportMenuProps) => {
  const [open, setOpen] = useState(false)
  useNativeSurfaceOcclusion('export-menu', open)
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={exportLabel}
          title={exportLabel}
          className="chrome-button size-8 rounded-full"
          data-no-drag
          disabled={disabled}
        >
          <FileDown aria-hidden="true" className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className={menuSurfaceStyles({ className: 'w-52' })}
        sideOffset={7}
      >
        <DropdownMenuItem className={menuItemStyles()} onSelect={() => onExport('pdf')}>
          <FileText aria-hidden="true" />
          {exportPdfLabel}
        </DropdownMenuItem>
        <DropdownMenuItem className={menuItemStyles()} onSelect={() => onExport('docx')}>
          <FileText aria-hidden="true" />
          {exportDocxLabel}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

import { FileDown, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { ExportFormat } from '@/services/exportApi'

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
}: TitlebarExportMenuProps) => (
  <DropdownMenu>
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
    <DropdownMenuContent align="end" className="w-52 rounded-xl p-2" sideOffset={7}>
      <DropdownMenuItem className="rounded-lg" onSelect={() => onExport('pdf')}>
        <FileText aria-hidden="true" />
        {exportPdfLabel}
      </DropdownMenuItem>
      <DropdownMenuItem className="rounded-lg" onSelect={() => onExport('docx')}>
        <FileText aria-hidden="true" />
        {exportDocxLabel}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
)

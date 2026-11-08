import { FileJson, FolderOpen, History } from 'lucide-react'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'

type ViewerHeaderProps = {
  currentName: string
  recent: File[]
  onOpen: () => void
  onRecent: (file: File) => void
}

export function ViewerHeader({
  currentName,
  recent,
  onOpen,
  onRecent,
}: ViewerHeaderProps) {
  return (
    <>
      <header className="col-start-1 row-start-1 flex items-center gap-4 border-b border-border bg-card px-4 text-card-foreground max-[700px]:gap-2 max-[700px]:px-2.5">
        <div className="flex items-center gap-2 whitespace-nowrap font-[650] tracking-[-0.02em]">
          <span className="grid size-7 place-items-center">
            <img className="size-full object-contain" src="/event-tape-icon.png" alt="" />
          </span>
          <span className="max-[700px]:hidden">Event Tape</span>
        </div>
        <span className="hidden">Recording workspace</span>
        <Button variant="secondary" size="sm" className="ml-auto cursor-pointer max-[700px]:px-2" type="button" onClick={onOpen}>
          <FolderOpen data-icon="inline-start" aria-hidden="true" />
          <span className="max-[700px]:sr-only">Open file</span>
        </Button>
      </header>
      <div className="pointer-events-none z-1 col-start-1 row-start-1 mx-0 mr-[135px] ml-[210px] flex min-w-0 items-center gap-4 max-[700px]:mr-[50px] max-[700px]:ml-[52px] max-[700px]:gap-2">
        <div className="pointer-events-auto flex min-w-0 flex-1 items-center gap-2 text-xs font-semibold max-[700px]:text-[11px]">
          <FileJson size={15} className="shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate" title={currentName}>{currentName}</span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="pointer-events-auto cursor-pointer gap-[7px] max-[700px]:gap-[3px]" />}>
            <History data-icon="inline-start" aria-hidden="true" />
            <span className="max-[700px]:sr-only">Recent files</span>
            <span className="rounded bg-secondary px-1.5 py-0.5 text-secondary-foreground">{recent.length}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[260px] max-w-[calc(100vw-20px)]">
            <DropdownMenuGroup>
              {recent.length ? (
                recent.map((file, index) => (
                  <DropdownMenuItem
                    className="min-w-0 cursor-pointer"
                    key={`${file.name}-${index}`}
                    onClick={() => onRecent(file)}
                  >
                    <FileJson aria-hidden="true" />
                    <span className="truncate">{file.name}</span>
                  </DropdownMenuItem>
                ))
              ) : (
                <p className="mx-2 my-1 text-xs leading-[1.55] text-muted-foreground">Files you open in this session will appear here.</p>
              )}
              <DropdownMenuItem className="cursor-pointer font-semibold" onClick={onOpen}>
                Open a recording
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  )
}

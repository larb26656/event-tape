import { Button } from '@/components/ui/button'

type RecordingHeaderProps = {
  onChooseFile: (file?: File) => void
}

export function RecordingHeader({ onChooseFile }: RecordingHeaderProps) {
  return (
    <header className="mx-auto mb-8 flex max-w-5xl items-center justify-between">
      <div>
        <p className="text-muted-foreground font-mono text-sm">EVENT TAPE</p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Recording viewer
        </h1>
      </div>
      <Button
        variant="outline"
        onClick={() => document.getElementById('recording-file')?.click()}
      >
        Open recording
      </Button>
      <input
        id="recording-file"
        className="hidden"
        type="file"
        accept=".jsonl,application/x-ndjson"
        onChange={(event) => onChooseFile(event.target.files?.[0])}
      />
    </header>
  )
}

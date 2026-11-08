import { Button } from './ui/button'

type EmptyRecordingProps = {
  onOpen: () => void
}

export function EmptyRecording({ onOpen }: EmptyRecordingProps) {
  return (
    <div className="col-start-1 row-start-2 flex min-h-0 flex-col items-center justify-center overflow-auto px-6 py-12 text-center">
      <div className="grid size-[52px] place-items-center rounded-xl bg-secondary text-[10px] font-[750] tracking-[0.04em] text-secondary-foreground" aria-hidden="true">JSONL</div>
      <h1 className="mt-5 text-2xl font-[650] tracking-[-0.02em] text-foreground">Open a recording</h1>
      <p className="mt-2 max-w-[320px] text-sm leading-normal text-muted-foreground">Choose a JSONL recording to explore its events and play them back.</p>
      <Button className="mt-[22px] cursor-pointer" type="button" onClick={onOpen}>Open recording</Button>
      <span className="mt-3.5 text-xs text-muted-foreground">Files stay on your device.</span>
    </div>
  )
}

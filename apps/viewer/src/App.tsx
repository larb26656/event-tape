import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { RecordingEnvelope } from '@event-tape/recording-format'

type WorkerResult = { events?: RecordingEnvelope[]; error?: string }

export default function App() {
  const [events, setEvents] = useState<RecordingEnvelope[]>([])
  const [selected, setSelected] = useState(0)
  const [error, setError] = useState('')
  useEffect(() => {
    const worker = new Worker(new URL('./recording.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (message: MessageEvent<WorkerResult>) => {
      if (message.data.error) setError(message.data.error)
      else setEvents(message.data.events ?? [])
    }
    fetch('/recording.jsonl').then((response) => response.text()).then((text) => worker.postMessage({ text })).catch((reason: unknown) => setError(String(reason)))
    return () => worker.terminate()
  }, [])
  const chooseFile = (file?: File) => {
    if (!file) return
    setError('')
    setEvents([])
    const worker = new Worker(new URL('./recording.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (message: MessageEvent<WorkerResult>) => {
      if (message.data.error) setError(message.data.error)
      else setEvents(message.data.events ?? [])
      worker.terminate()
    }
    worker.postMessage(file)
  }
  const event = events[selected]
  return (
    <main className="min-h-svh bg-background p-6 text-foreground md:p-10">
      <header className="mx-auto mb-8 flex max-w-5xl items-center justify-between">
        <div><p className="font-mono text-sm text-muted-foreground">EVENT TAPE</p><h1 className="text-3xl font-semibold tracking-tight">Recording viewer</h1></div>
        <Button variant="outline" onClick={() => document.getElementById('recording-file')?.click()}>Open recording</Button>
        <input id="recording-file" className="hidden" type="file" accept=".jsonl,application/x-ndjson" onChange={(e) => chooseFile(e.target.files?.[0])} />
      </header>
      <section className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-5"><h2 className="mb-4 text-lg font-medium">Timeline <span className="text-sm text-muted-foreground">({events.length} events)</span></h2>
          {error && <p role="alert" className="text-destructive">{error}</p>}
          {!error && events.length === 0 && <p className="text-muted-foreground">No events in this recording.</p>}
          <ol className="max-h-[65vh] space-y-2 overflow-auto">{events.map((item, index) => <li key={item.seq}><button className={`w-full rounded-lg border p-3 text-left transition-colors hover:bg-accent ${selected === index ? 'bg-accent' : ''}`} onClick={() => setSelected(index)}><span className="font-mono text-xs text-muted-foreground">#{item.seq} · {item.elapsedMs.toFixed(2)} ms</span><p className="mt-1 font-medium">{item.source}{item.direction ? ` · ${item.direction}` : ''}</p><p className="truncate text-sm text-muted-foreground">{JSON.stringify(item.payload)}</p></button></li>)}</ol>
        </div>
        <div className="rounded-xl border bg-card p-5"><h2 className="mb-4 text-lg font-medium">Raw JSON</h2>{event ? <pre className="max-h-[65vh] overflow-auto rounded-lg bg-muted p-4 text-xs leading-relaxed">{JSON.stringify(event, null, 2)}</pre> : <p className="text-muted-foreground">Select an event to inspect its envelope and payload.</p>}</div>
      </section>
    </main>
  )
}

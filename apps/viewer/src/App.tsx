import { useEffect, useMemo, useRef, useState } from 'react'
import { EventDetailsPanel } from './components/EventDetailsPanel'
import { EmptyRecording } from './components/EmptyRecording'
import { EventList } from './components/EventList'
import { ViewerHeader } from './components/ViewerHeader'
import { TimelinePanel } from './components/TimelinePanel'
import { usePlaybackStore as playback } from './stores/playback'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from './components/ui/resizable'
import { createRecordingLoader } from './recording-loading'
import type { RecordingLoader } from './recording-loading'


export default function App() {
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 700px)').matches)
  useEffect(() => {
    const query = window.matchMedia('(max-width: 700px)')
    const update = () => setNarrow(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  const events = playback((state) => state.events)
  const playing = playback((state) => state.playing)
  const range = playback((state) => state.range)
  const visibleCount = useMemo(() => range
    ? events.filter((event) => event.elapsedMs >= range[0] && event.elapsedMs <= range[1]).length
    : events.length, [events, range])
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')
  const [loading, setLoading] = useState(true)
  const loaderRef = useRef<RecordingLoader | null>(null)
  const [currentName, setCurrentName] = useState('No file open')
  const [hasRecording, setHasRecording] = useState(false)
  const [recent, setRecent] = useState<File[]>([])

  useEffect(() => {
    if (!playing) return
    let previous = performance.now()
    let frame = 0
    const tick = (now: number) => {
      playback.getState().advance(now - previous)
      previous = now
      if (playback.getState().playing) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing])

  useEffect(() => {
    playback.setState(playback.getInitialState(), true)
    const loader = createRecordingLoader((update) => {
      if (update.type === 'loading') {
        setError('')
        setWarning('')
        setLoading(true)
        setHasRecording(false)
        setCurrentName('No file open')
        playback.getState().setEvents([])
      } else if (update.type === 'empty') {
        setLoading(false)
      } else if (update.type === 'error') {
        setError(update.error)
        setWarning('')
        setLoading(false)
        playback.getState().setEvents([])
      } else {
        playback.getState().setEvents(update.events)
        setHasRecording(true)
        setCurrentName(update.name)
        setRecent((previous) => [
          update.file,
          ...previous.filter((item) => !(item.name === update.file.name && item.size === update.file.size && item.lastModified === update.file.lastModified)),
        ])
        setWarning(update.warning)
        setLoading(false)
      }
    })
    loaderRef.current = loader
    void loader.loadInitial(import.meta.env.DEV)
    return () => {
      loader.dispose()
      if (loaderRef.current === loader) loaderRef.current = null
      playback.setState(playback.getInitialState(), true)
    }
  }, [])

  const chooseFile = (file?: File) => {
    if (file) loaderRef.current?.loadFile(file)
  }

  const openFile = () => document.getElementById('recording-file')?.click()

  return (
    <main className="grid h-dvh min-h-0 grid-rows-[48px_minmax(0,1fr)] overflow-hidden bg-background text-foreground">
      <ViewerHeader currentName={currentName} recent={recent} onOpen={openFile} onRecent={chooseFile} />
      <input id="recording-file" className="hidden" type="file" accept=".jsonl,application/x-ndjson" onChange={(change) => {
        chooseFile(change.target.files?.[0])
        change.target.value = ''
      }} />
      {!hasRecording && !loading && !error ? <EmptyRecording onOpen={openFile} /> : (
        <div className="col-start-1 row-start-2 flex min-h-0 min-w-0 flex-col overflow-hidden">
          <ResizablePanelGroup className="min-h-0 flex-1" orientation={narrow ? 'vertical' : 'horizontal'}>
            <ResizablePanel defaultSize={narrow ? '50%' : '320px'} minSize={narrow ? '15%' : '180px'}><section id="recording-events-panel" aria-labelledby="recording-events-heading" className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-card p-4 max-[700px]:border-b">
              <h2 id="recording-events-heading" className="mb-4 text-lg font-medium">
                Recording events <span className="text-muted-foreground text-sm">({visibleCount})</span>
              </h2>
              <EventList loading={loading} error={error} />
            </section></ResizablePanel>
            <ResizableHandle withHandle aria-label="Resize recording events panel" />
            <ResizablePanel minSize={narrow ? '15%' : '180px'}><EventDetailsPanel /></ResizablePanel>
          </ResizablePanelGroup>
          <div className="min-w-0 flex-none">
            <TimelinePanel
              error={error}
              warning={warning}
              loading={loading}
            />
          </div>
        </div>
      )}
    </main>
  )
}

type EmptyRecordingProps = {
  onOpen: () => void
}

export function EmptyRecording({ onOpen }: EmptyRecordingProps) {
  return (
    <div className="viewer-welcome">
      <div className="viewer-welcome-icon" aria-hidden="true">JSONL</div>
      <h1>Open a recording</h1>
      <p>Choose a JSONL recording to explore its events and play them back.</p>
      <button className="viewer-welcome-action" type="button" onClick={onOpen}>Open recording</button>
      <span>Files stay on your device.</span>
    </div>
  )
}

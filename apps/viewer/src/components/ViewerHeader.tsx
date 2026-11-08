import { FileJson, FolderOpen, History, Radio } from 'lucide-react'

type ViewerHeaderProps = {
  currentName: string
  recent: File[]
  onOpen: () => void
  onRecent: (file: File) => void
}

export function ViewerHeader({ currentName, recent, onOpen, onRecent }: ViewerHeaderProps) {
  return (
    <>
      <header className="viewer-top">
        <div className="viewer-brand"><span className="viewer-mark"><Radio size={16} aria-hidden="true" /></span><span>event tape</span><small> / viewer</small></div>
        <span className="viewer-context">Recording workspace</span>
        <button className="viewer-open" type="button" onClick={onOpen}><FolderOpen size={15} aria-hidden="true" /><span className="viewer-open-label">Open file</span></button>
      </header>
      <div className="viewer-file-bar">
        <div className="viewer-file-label"><FileJson size={15} aria-hidden="true" /><span title={currentName}>{currentName}</span></div>
        <details className="viewer-recent">
          <summary><History size={15} aria-hidden="true" /><span className="viewer-recent-label">Recent files</span><span>{recent.length}</span></summary>
          <div className="viewer-recent-list">
            {recent.length ? recent.map((file, index) => (
              <button type="button" className="viewer-recent-file" key={`${file.name}-${index}`} onClick={(event) => {
                event.currentTarget.closest('details')?.removeAttribute('open')
                onRecent(file)
              }}><FileJson size={16} aria-hidden="true" /><span>{file.name}</span></button>
            )) : <p>Files you open in this session will appear here.</p>}
            <button type="button" className="viewer-recent-open" onClick={onOpen}>Open a recording</button>
          </div>
        </details>
      </div>
    </>
  )
}

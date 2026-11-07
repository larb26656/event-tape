import { Button } from '@/components/ui/button'

export default function App() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-8 text-foreground">
      <section className="max-w-lg space-y-4 text-center">
        <p className="font-mono text-sm text-muted-foreground">EVENT TAPE</p>
        <h1 className="text-4xl font-semibold tracking-tight">Viewer workspace ready</h1>
        <p className="text-muted-foreground">The development foundation is in place. Recording and playback features are not part of this initialization.</p>
        <Button variant="outline">Foundation initialized</Button>
      </section>
    </main>
  )
}

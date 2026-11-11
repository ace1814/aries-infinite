import { useEffect, useState } from 'react'
import { SHELL_ONLY } from './config'
import { Canvas } from './canvas/Canvas'
import { getEditor } from './canvas/editorRef'
import { WIDGETS, type WidgetKind } from './content/widgets'
import { GlossaryDrawer } from './help/Glossary'
import { Onboarding } from './onboarding/Onboarding'
import { placeAll } from './onboarding/actions'
import { widgetShapes } from './canvas/ops'
import { startFeed, useStore } from './store'
import { track } from './store/events'
import { Chrome, startPlacing } from './ui/Chrome'
import { CommandBar } from './ui/CommandBar'
import { AckModal, FirstSteps, Footer, Hotspot, MobileGate, PositionsDock, Shortcuts, SymbolPrompt, Toasts } from './ui/Overlays'
import { PlacementGhost } from './ui/PlacementGhost'

const SHORTCUT_KINDS = Object.values(WIDGETS).filter((w) => w.shortcut) as { shortcut: string; kind: WidgetKind }[]

function isTyping(t: EventTarget | null) {
  const el = t as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
}

export default function App() {
  const [narrow, setNarrow] = useState(() => window.innerWidth < 900)
  const explain = useStore((s) => s.help.explainMode)
  const level = useStore((s) => s.level)

  useEffect(() => {
    const r = () => setNarrow(window.innerWidth < 900)
    window.addEventListener('resize', r)
    return () => window.removeEventListener('resize', r)
  }, [])

  useEffect(() => {
    startFeed()
    // A returning user who finished onboarding but has an empty canvas gets their layout back.
    const t = setTimeout(() => {
      const s = useStore.getState()
      if (!SHELL_ONLY && s.onboarding.status === 'done' && !widgetShapes().length) placeAll()
    }, 300)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    document.body.classList.toggle('explain-on', explain)
    document.body.dataset.level = level
  }, [explain, level])

  // Global shortcuts (PRD §7.2, §6.5, §7A.3). Capture phase so the canvas doesn't also act.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState()
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        e.stopPropagation()
        s.setUi({ commandOpen: !s.ui.commandOpen })
        return
      }
      if (isTyping(e.target)) return
      if (mod && e.key.toLowerCase() === 'z') {
        const done = e.shiftKey ? s.redo() : s.undo()
        if (done) {
          e.preventDefault()
          e.stopPropagation()
        } else {
          e.preventDefault()
          e.stopPropagation()
          const ed = getEditor()
          if (e.shiftKey) ed?.redo()
          else ed?.undo()
        }
        return
      }
      if (e.altKey && !mod) {
        const hit = SHORTCUT_KINDS.find((w) => w.shortcut === e.code)
        if (hit) {
          e.preventDefault()
          e.stopPropagation()
          startPlacing(hit.kind)
          return
        }
      }
      if (e.key === '?' && !mod) {
        e.preventDefault()
        e.stopPropagation()
        s.setHelp({ glossaryOpen: !s.help.glossaryOpen, glossaryTerm: null })
        track('glossary_opened', { from: 'shortcut' })
      }
      if (e.key === 'Escape') {
        if (s.help.glossaryOpen) s.setHelp({ glossaryOpen: false })
        if (s.ui.hotspot) s.setUi({ hotspot: null })
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  if (narrow) return <MobileGate />

  return (
    <div className="app">
      <Canvas />
      <Chrome />
      <PlacementGhost />
      {!SHELL_ONLY && (
        <>
          <Hotspot />
          <PositionsDock />
          <FirstSteps />
          <Onboarding />
        </>
      )}
      <GlossaryDrawer />
      <CommandBar />
      <SymbolPrompt />
      <AckModal />
      <Shortcuts />
      <Toasts />
      {!SHELL_ONLY && <Footer />}
    </div>
  )
}

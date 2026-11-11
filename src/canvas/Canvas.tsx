import { useCallback, type DragEvent } from 'react'
import { Tldraw, type Editor, type TLComponents } from 'tldraw'
import 'tldraw/tldraw.css'
import { useStore } from '../store'
import { getEditor, setEditor } from './editorRef'
import { SHELL_ONLY } from '../config'
import { zoomToContent, layoutSnapshot, onUserDeletedShape, rememberStrategyPos, restoreLayout, SHAPE_TYPE, syncStrategiesToCanvas } from './ops'
import { AriesWidgetUtil, type AriesWidgetShape } from './WidgetShape'
import { LEG_MIME } from './widgets/chain'
import { handleLegDrop, LEGCARD_MIME } from './widgets/strategy'

const shapeUtils = [AriesWidgetUtil]

// Keep tldraw's canvas, hide its own chrome: Aries' floating bars replace it.
const components: TLComponents = {
  ContextMenu: null,
  ActionsMenu: null,
  HelpMenu: null,
  ZoomMenu: null,
  MainMenu: null,
  Minimap: null,
  StylePanel: null,
  PageMenu: null,
  NavigationPanel: null,
  Toolbar: null,
  KeyboardShortcutsDialog: null,
  QuickActions: null,
  HelperButtons: null,
  DebugPanel: null,
  DebugMenu: null,
  SharePanel: null,
  MenuPanel: null,
  TopPanel: null,
}

function isOurDrag(e: DragEvent) {
  const t = e.dataTransfer?.types ?? []
  return t.includes(LEG_MIME) || t.includes(LEGCARD_MIME)
}

function dragSymbol(e: DragEvent): string | null {
  const t = [...(e.dataTransfer?.types ?? [])].find((x) => x.startsWith('x-aries-sym-'))
  return t ? t.slice('x-aries-sym-'.length).toUpperCase() : null
}

export function Canvas() {
  const onMount = useCallback((editor: Editor) => {
    setEditor(editor)
    if (import.meta.env.DEV) (window as unknown as { __dbg?: unknown }).__dbg = { useStore, layoutSnapshot, syncStrategiesToCanvas, mounts: ((window as unknown as { __mounts?: number }).__mounts = ((window as unknown as { __mounts?: number }).__mounts ?? 0) + 1) }
    editor.user.updateUserPreferences({ colorScheme: 'dark', isSnapMode: true })
    editor.updateInstanceState({ isGridMode: true })
    editor.setCurrentTool('select')

    if (!SHELL_ONLY) {
      restoreLayout(useStore.getState().layout)
      syncStrategiesToCanvas()
      setTimeout(() => zoomToContent({ animate: false }), 60)
    }

    const unsubStore = useStore.subscribe((s, prev) => {
      if (s.strategies !== prev.strategies) syncStrategiesToCanvas()
    })
    const offDelete = editor.sideEffects.registerAfterDeleteHandler('shape', (shape) => {
      if (shape.type === SHAPE_TYPE) onUserDeletedShape(shape as AriesWidgetShape)
    })
    // Persist the layout (debounced) and remember block positions for undo.
    let t: number | undefined
    const offListen = editor.store.listen(
      () => {
        clearTimeout(t)
        t = window.setTimeout(() => {
          for (const s of editor.getCurrentPageShapes()) if (s.type === SHAPE_TYPE) rememberStrategyPos(s as AriesWidgetShape)
          useStore.setState({ layout: layoutSnapshot() })
        }, 400)
      },
      { scope: 'document', source: 'user' },
    )
    return () => {
      unsubStore()
      offDelete()
      offListen()
      setEditor(null)
    }
  }, [])

  const onDragOver = (e: DragEvent) => {
    if (!isOurDrag(e)) return
    e.preventDefault()
    e.stopPropagation()
    const el = (e.target as Element).closest?.('[data-strategy-drop]')
    const id = el?.getAttribute('data-strategy-drop') ?? null
    const s = useStore.getState()
    let over: string | null = id
    if (id) {
      const st = s.strategies[id]
      const sym = dragSymbol(e)
      const fromSame = e.dataTransfer.types.includes(LEGCARD_MIME)
      if (st?.symbol && st.legs.length && sym && st.symbol !== sym && st.status !== 'filled') {
        over = '!' + id
        e.dataTransfer.dropEffect = 'none'
      } else e.dataTransfer.dropEffect = fromSame ? 'move' : 'copy'
    } else e.dataTransfer.dropEffect = e.dataTransfer.types.includes(LEGCARD_MIME) ? 'move' : 'copy'
    if (s.ui.dragOver !== over) s.setUi({ dragOver: over })
  }

  const onDrop = (e: DragEvent) => {
    if (!isOurDrag(e)) return
    e.preventDefault()
    e.stopPropagation()
    const s = useStore.getState()
    s.setUi({ dragOver: null })
    const el = (e.target as Element).closest?.('[data-strategy-drop]')
    const id = el?.getAttribute('data-strategy-drop') ?? null
    const page = getPagePoint(e.clientX, e.clientY)
    handleLegDrop(e, id, page)
  }

  return (
    <div
      className="canvas-wrap"
      onDragOverCapture={onDragOver}
      onDropCapture={onDrop}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) useStore.getState().setUi({ dragOver: null })
      }}
      onDragEndCapture={() => useStore.getState().setUi({ dragOver: null })}
    >
      <Tldraw shapeUtils={shapeUtils} components={components} onMount={onMount} hideUi cameraOptions={{ zoomSteps: [0.25, 0.4, 0.55, 0.7, 0.85, 1, 1.25, 1.5] }} />
    </div>
  )
}

function getPagePoint(x: number, y: number) {
  const e = getEditor()
  return e ? e.screenToPage({ x, y }) : null
}

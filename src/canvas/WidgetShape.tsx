import { useRef, useState, type ReactNode } from 'react'
import { BaseBoxShapeUtil, HTMLContainer, T, resizeBox, useEditor, type RecordProps, type TLBaseShape, type TLResizeInfo } from 'tldraw'
import { SYMBOLS, type Sym } from '../config'
import { WIDGETS, type WidgetKind } from '../content/widgets'
import { Info } from '../help/Info'
import { useStore } from '../store'
import { Badge, Floating, rectOf, stop, useWheelStop, type AnchorRect } from '../ui/primitives'
import { useWidgetSymbol } from '../ui/hooks'
import { Icon, WidgetIcon } from '../ui/icons'
import { WidgetBody } from './widgets'

export type AriesWidgetShape = TLBaseShape<
  'aries-widget',
  {
    w: number
    h: number
    kind: WidgetKind
    refId: string
    linked: boolean
    symbol: string
    expiry: string
    filter: string
    layout: string
  }
>

export class AriesWidgetUtil extends BaseBoxShapeUtil<AriesWidgetShape> {
  static override type = 'aries-widget' as const
  static override props: RecordProps<AriesWidgetShape> = {
    w: T.number,
    h: T.number,
    kind: T.string as unknown as RecordProps<AriesWidgetShape>['kind'],
    refId: T.string,
    linked: T.boolean,
    symbol: T.string,
    expiry: T.string,
    filter: T.string,
    layout: T.string,
  }

  override getDefaultProps(): AriesWidgetShape['props'] {
    return { w: 360, h: 280, kind: 'keystats', refId: '', linked: true, symbol: '', expiry: '', filter: '', layout: '' }
  }
  override canEdit() {
    return false
  }
  override hideRotateHandle() {
    return true
  }
  override canBind() {
    return false
  }
  override onResize(shape: AriesWidgetShape, info: TLResizeInfo<AriesWidgetShape>) {
    const min = shape.props.kind === 'strategy' ? { minWidth: 460, minHeight: 640 } : shape.props.kind === 'chain' ? { minWidth: 420, minHeight: 360 } : { minWidth: 240, minHeight: 170 }
    return resizeBox(shape, info, min)
  }
  override component(shape: AriesWidgetShape) {
    return (
      <HTMLContainer style={{ pointerEvents: 'all', width: shape.props.w, height: shape.props.h }}>
        <WidgetFrame shape={shape} />
      </HTMLContainer>
    )
  }
  override indicator(shape: AriesWidgetShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={12} ry={12} />
  }
}

function WidgetFrame({ shape }: { shape: AriesWidgetShape }) {
  const def = WIDGETS[shape.props.kind]
  const sym = useWidgetSymbol(shape.props.linked, shape.props.symbol)
  const stale = useStore((s) => s.feedStale)
  const dragOver = useStore((s) => s.ui.dragOver === shape.props.refId && shape.props.kind === 'strategy')
  const reject = useStore((s) => s.ui.rejectFlash === shape.props.refId && shape.props.kind === 'strategy')
  const dragReject = useStore((s) => s.ui.dragOver === '!' + shape.props.refId)
  const bodyRef = useRef<HTMLDivElement>(null)
  useWheelStop(bodyRef)
  if (shape.props.kind === 'strategy') {
    return (
      <div
        className={`widget widget-strategy ${dragOver ? 'drag-over' : ''} ${reject || dragReject ? 'drag-reject' : ''} ${reject ? 'reject-shake' : ''}`}
        data-kind="strategy"
        data-strategy-drop={shape.props.refId}
        onPointerDownCapture={() => useStore.getState().setActiveStrategy(shape.props.refId)}
      >
        <WidgetBody shape={shape} sym={sym} />
        {(dragReject || reject) && <div className="reject-note">Legs must share an underlying</div>}
      </div>
    )
  }
  return (
    <div className={`widget ${stale && def.kind !== 'watchlist' ? 'is-stale' : ''}`} data-kind={def.kind}>
      <WidgetHeader shape={shape} sym={sym} />
      <div className="w-body" ref={bodyRef} onPointerDown={stop}>
        <WidgetBody shape={shape} sym={sym} />
        {stale && <div className="stale-veil" aria-hidden />}
      </div>
    </div>
  )
}

export function WidgetHeader({ shape, sym, title, extra }: { shape: AriesWidgetShape; sym?: Sym; title?: ReactNode; extra?: ReactNode }) {
  const def = WIDGETS[shape.props.kind]
  const stale = useStore((s) => s.feedStale)
  const spot = useStore((s) => (sym ? s.spots[sym] : 0))
  const prev = useRef(spot)
  const dir = spot > prev.current ? 'up' : spot < prev.current ? 'down' : ''
  prev.current = spot
  return (
    <header className="w-head">
      <span className="w-icon" aria-hidden><WidgetIcon kind={shape.props.kind} size={15} /></span>
      <span className="w-title">{title ?? def.title}</span>
      <Info term={def.term} label={def.title} onOpen={() => useStore.getState().completeStep('readWidget')} />
      {def.linked && sym && <SymbolChip shape={shape} sym={sym} />}
      {def.linked && sym && (
        <span className={`price-chip ${dir}`} key={spot}>
          {spot.toFixed(2)}
        </span>
      )}
      {def.sample && (
        <span className="sample-wrap">
          <Badge tone="sample">Sample data</Badge>
          <Info term="sampleData" label="sample data" />
        </span>
      )}
      {stale && <Badge tone="warn">Cached</Badge>}
      <span className="w-spacer" />
      {extra}
      <WidgetMenu shape={shape} />
    </header>
  )
}

function SymbolChip({ shape, sym }: { shape: AriesWidgetShape; sym: Sym }) {
  const editor = useEditor()
  const [open, setOpen] = useState<AnchorRect | null>(null)
  const ref = useRef<HTMLButtonElement>(null)
  const pick = (s: Sym) => {
    setOpen(null)
    if (shape.props.linked) useStore.getState().setActiveSymbol(s)
    else editor.updateShape<AriesWidgetShape>({ id: shape.id, type: 'aries-widget', props: { symbol: s } })
  }
  const toggleLink = () => {
    const linked = !shape.props.linked
    editor.updateShape<AriesWidgetShape>({ id: shape.id, type: 'aries-widget', props: { linked, symbol: linked ? '' : sym } })
  }
  return (
    <span className="sym-chip-wrap">
      <button ref={ref} type="button" className={`sym-chip ${shape.props.linked ? 'linked' : ''}`} onPointerDown={stop} onClick={() => setOpen(open ? null : rectOf(ref.current))} aria-label={`Symbol ${sym}. Change symbol`}>
        {sym} <span aria-hidden>▾</span>
      </button>
      <button type="button" className={`link-btn ${shape.props.linked ? 'on' : ''}`} onPointerDown={stop} onClick={toggleLink} title={shape.props.linked ? 'Linked to the canvas symbol. Click to unlink.' : 'Unlinked. Click to link to the canvas symbol.'} aria-label={shape.props.linked ? 'Unlink ticker' : 'Link ticker'}>
        {shape.props.linked ? <Icon.link /> : <Icon.unlink />}
      </button>
      {open && (
        <Floating anchor={open} onClose={() => setOpen(null)} className="menu" width={200}>
          <div className="menu-label">{shape.props.linked ? 'Linked: all widgets follow' : 'Unlinked widget'}</div>
          {SYMBOLS.map((s) => (
            <button type="button" key={s} className={`menu-item ${s === sym ? 'on' : ''}`} onClick={() => pick(s)}>
              <span className="mono">{s}</span>
              <span className="muted small">{useStore.getState().spots[s].toFixed(2)}</span>
            </button>
          ))}
        </Floating>
      )}
    </span>
  )
}

export function WidgetMenu({ shape, children }: { shape: AriesWidgetShape; children?: ReactNode }) {
  const editor = useEditor()
  const def = WIDGETS[shape.props.kind]
  const [open, setOpen] = useState<AnchorRect | null>(null)
  const [about, setAbout] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button ref={ref} type="button" className="icon-btn" aria-label={`${def.title} menu`} onPointerDown={stop} onClick={() => { setAbout(false); setOpen(open ? null : rectOf(ref.current)) }}>
        <Icon.more />
      </button>
      {open && (
        <Floating anchor={open} onClose={() => setOpen(null)} className="menu" width={about ? 280 : 220}>
          {about ? (
            <div className="about">
              <strong>About {def.title}</strong>
              <p>{def.about}</p>
            </div>
          ) : (
            <>
              <button type="button" className="menu-item" onClick={() => { setAbout(true); useStore.getState().completeStep('readWidget') }}>
                About this widget
              </button>
              {children}
              <button
                type="button"
                className="menu-item danger"
                onClick={() => {
                  setOpen(null)
                  editor.deleteShapes([shape.id])
                }}
              >
                Remove widget
              </button>
            </>
          )}
        </Floating>
      )}
    </>
  )
}

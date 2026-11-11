import { EXPLORER_MAX_WIDGETS } from '../config'
import { QUESTIONS, researchWidgets, type Answers, type Question } from '../content/questions'
import { WIDGETS, type WidgetKind } from '../content/widgets'
import type { Level } from '../engine/types'
import { Info } from '../help/Info'
import { track } from '../store/events'
import { Icon, WidgetIcon } from '../ui/icons'
import { planDashboard } from './layout'

export function toggleAnswer(q: Question, answers: Answers, id: string): Answers {
  const cur = answers[q.id] ?? []
  let next: string[]
  if (id === '__notsure') next = q.notSure
  else if (q.multi) next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
  else next = [id]
  track('checklist_answered', { question: q.id, answer: id })
  return { ...answers, [q.id]: next }
}

export function QuestionView({ q, answers, onChange, compact }: { q: Question; answers: Answers; onChange: (a: Answers) => void; compact?: boolean }) {
  const cur = answers[q.id] ?? []
  const notSure = cur.length > 0 && cur.length === q.notSure.length && q.notSure.every((x) => cur.includes(x)) && q.notSure.length > 0
  return (
    <fieldset className={`question ${compact ? 'compact' : ''}`}>
      <legend>
        {q.title}
        <span className="why"><Info term="whyAsk" label="why we ask" /></span>
      </legend>
      <div className="muted small">{q.multi ? 'Pick any that apply.' : 'Pick one.'}</div>
      <div className="answer-grid">
        {q.cards.map((c) => {
          const on = cur.includes(c.id)
          return (
            <div className="answer-wrap" key={c.id}>
              <button
                type="button"
                className={`answer ${on ? 'on' : ''} ${c.comingSoon ? 'soon' : ''}`}
                aria-pressed={on}
                disabled={c.comingSoon}
                onClick={() => onChange(toggleAnswer(q, answers, c.id))}
              >
                <span className="answer-check" aria-hidden>{on ? <Icon.check /> : null}</span>
                <span className="answer-text">
                  <b>{c.label}</b>
                  <span className="muted small">{c.comingSoon ? 'Coming soon' : c.line}</span>
                </span>
              </button>
              {c.term && (
                <span className="answer-info">
                  <Info term={c.term} />
                </span>
              )}
            </div>
          )
        })}
        <button type="button" className={`answer notsure ${notSure ? 'on' : ''}`} aria-pressed={notSure} onClick={() => onChange(toggleAnswer(q, answers, '__notsure'))}>
          <span className="answer-check" aria-hidden>{notSure ? <Icon.check /> : null}</span>
          <span className="answer-text">
            <b>Not sure</b>
            <span className="muted small">Use a recommended starter set.</span>
          </span>
        </button>
      </div>
    </fieldset>
  )
}

/** Miniature canvas: widget thumbnails appear and disappear as answers change (PRD §5.3 Step 3). */
export function DashboardPreview({ level, answers }: { level: Level; answers: Answers }) {
  const research = researchWidgets(level, answers)
  const plan = planDashboard(level, research)
  const placedResearch = plan.place.filter((k) => WIDGETS[k].group !== 'trade' && k !== 'chain')
  const trade = plan.place.filter((k) => WIDGETS[k].group === 'trade')
  const Thumb = ({ k, later }: { k: WidgetKind; later?: boolean }) => (
    <div className={`thumb ${later ? 'later' : ''}`} key={k}>
      <WidgetIcon kind={k} size={14} /> {WIDGETS[k].title}
      {later && <span className="later-tag">Add later</span>}
    </div>
  )
  return (
    <div className="preview" aria-label="Your dashboard preview">
      <div className="preview-head">
        <span className="label">Your dashboard</span>
        <span className="muted small">{plan.place.length} widgets{plan.later.length ? ` · ${plan.later.length} for later` : ''}</span>
      </div>
      <div className="preview-canvas">
        <div className="zone">
          <div className="zone-label">Research</div>
          {placedResearch.length === 0 && <div className="thumb ghosty">Pick what you check →</div>}
          {placedResearch.map((k) => <Thumb key={k} k={k} />)}
          {plan.later.map((k) => <Thumb key={'l' + k} k={k} later />)}
        </div>
        <div className="zone">
          <div className="zone-label">Premiums</div>
          <Thumb k="chain" />
        </div>
        <div className="zone">
          <div className="zone-label">Trade</div>
          {trade.map((k) => <Thumb key={k} k={k} />)}
        </div>
      </div>
      {level === 'explorer' && <p className="muted small">Explorer starts with at most {EXPLORER_MAX_WIDGETS} widgets so the first canvas stays calm. Extras wait in the toolbar.</p>}
    </div>
  )
}

export function AllQuestions({ level, answers, onChange }: { level: Level; answers: Answers; onChange: (a: Answers) => void }) {
  return (
    <div className="stack-16">
      {QUESTIONS[level].map((q) => (
        <QuestionView key={q.id} q={q} answers={answers} onChange={onChange} compact />
      ))}
    </div>
  )
}

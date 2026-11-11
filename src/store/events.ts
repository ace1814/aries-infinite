// Local-only instrumentation (PRD §11). Console and in-memory. No network, no personal data.

export type EventName =
  | 'onboarding_step_viewed'
  | 'level_selected'
  | 'widgets_selected'
  | 'widget_placed'
  | 'leg_added'
  | 'strategy_recognized'
  | 'ticket_submitted'
  | 'requote_shown'
  | 'command_opened'
  | 'command_parsed'
  | 'command_confirmed'
  | 'time_to_first_trade'
  | 'checklist_answered'
  | 'dashboard_preview_toggled'
  | 'ticker_linked_changed'
  | 'hotspot_opened'
  | 'helper_direction_selected'
  | 'info_opened'
  | 'glossary_opened'

export interface LoggedEvent {
  name: EventName
  at: number
  props?: Record<string, unknown>
}

const log: LoggedEvent[] = []
const started = Date.now()

export function track(name: EventName, props?: Record<string, unknown>) {
  const e = { name, at: Date.now(), props }
  log.push(e)
  if (log.length > 500) log.shift()
  console.debug('[event]', name, props ?? '')
}

export function trackFirstTrade() {
  if (log.some((e) => e.name === 'time_to_first_trade')) return
  track('time_to_first_trade', { seconds: Math.round((Date.now() - started) / 1000) })
}

declare global {
  interface Window {
    __ariesEvents?: LoggedEvent[]
  }
}
if (typeof window !== 'undefined') window.__ariesEvents = log

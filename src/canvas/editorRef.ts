import type { Editor } from 'tldraw'
import { useSyncExternalStore } from 'react'

let current: Editor | null = null
const subs = new Set<() => void>()

export function setEditor(e: Editor | null) {
  current = e
  if (import.meta.env.DEV) (window as unknown as { __editor?: Editor | null }).__editor = e
  subs.forEach((f) => f())
}

export function getEditor(): Editor | null {
  return current
}

export function useEditorRef(): Editor | null {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => current,
  )
}

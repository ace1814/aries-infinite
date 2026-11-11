// The official Aries logo goes in /reference/brand/ (SVG preferred). PRD §0.5.
// Do not alter the logo. If no file is present, a text placeholder is shown.
const files = import.meta.glob('/reference/brand/*.{svg,png}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
export const LOGO_URL: string | null = Object.values(files)[0] ?? null

export function Logo({ size = 22 }: { size?: number }) {
  if (LOGO_URL) return <img src={LOGO_URL} alt="Aries" height={size} className="logo-img" />
  // TODO_LOGO: drop the official SVG into /reference/brand/ and this placeholder disappears.
  return (
    <span className="logo-text" data-todo="TODO_LOGO" aria-label="Aries">
      Aries
    </span>
  )
}

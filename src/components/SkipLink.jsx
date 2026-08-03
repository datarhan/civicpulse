/**
 * "Saltar al contenido" — WCAG 2.4.1 Bypass Blocks (Level A).
 *
 * Both shells put a lot of chrome ahead of the content: the landing has 112
 * focusable stops before the editorial column, the first of which is a weather
 * chip. Without this, reaching the actual page by keyboard means tabbing
 * through the entire nav rail and topbar on every navigation.
 *
 * Invisible until focused, then it pins itself to the top-left — the standard
 * pattern, and the reason it can't be `display:none` (that would take it out of
 * the tab order and defeat the purpose).
 *
 * The target is `#contenido`, which carries `tabIndex={-1}` so the browser will
 * actually move focus there rather than only scrolling.
 */
import { useT } from '../i18n'

export function SkipLink() {
  const t = useT()
  return (
    <a href="#contenido" className="cp-skip-link">
      {t('a11y.skipToContent')}
    </a>
  )
}

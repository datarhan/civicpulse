import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Scroll a `#fragment` into view once the element it names actually exists.
 *
 * The browser's own fragment handling runs on load, finds nothing, and never
 * tries again. On an SPA that reads its content from static JSON that is always
 * the wrong moment: `/hallazgos#f-2026-…` mounts its 52 finding cards several
 * hundred milliseconds after the document is parsed. So every permalink we
 * publish — the card's own «enlace permanente», the Cmd+K result, the
 * `#anchor` links on /metodologia — dropped the reader at the top of the page
 * with no indication anything had gone wrong.
 *
 * Deliberate choices:
 *
 *   · It waits for the element via MutationObserver instead of a fixed sleep,
 *     and gives up after GIVE_UP_MS. A permalink to a retracted finding must
 *     stop trying, not observe the DOM for the rest of the session.
 *   · It offsets by the real measured height of the sticky topbar. Hard-coding
 *     52 would silently misplace every target the day the topbar changes.
 *   · A reader who scrolls first has taken over, and we abort. Yanking the
 *     viewport out from under someone who started reading is worse than
 *     landing them at the top.
 */
const GIVE_UP_MS = 8000
const BREATHING_ROOM = 12

function headerOffset() {
  const header = document.querySelector('.cp-shell-topbar')
  if (!header) return 0
  const { position } = window.getComputedStyle(header)
  if (position !== 'sticky' && position !== 'fixed') return 0
  return header.getBoundingClientRect().height + BREATHING_ROOM
}

export function useHashScroll() {
  const { hash, key } = useLocation()

  useEffect(() => {
    if (!hash || hash.length < 2) return undefined

    let id
    try {
      id = decodeURIComponent(hash.slice(1))
    } catch {
      // A malformed fragment is not worth an exception on every route change.
      return undefined
    }

    let done = false
    let observer
    let timer

    const stop = () => {
      done = true
      observer?.disconnect()
      if (timer) clearTimeout(timer)
      window.removeEventListener('wheel', takeOver)
      window.removeEventListener('touchmove', takeOver)
      window.removeEventListener('keydown', takeOver)
    }

    function takeOver() {
      stop()
    }

    const attempt = () => {
      if (done) return true
      const el = document.getElementById(id)
      if (!el) return false
      const top = el.getBoundingClientRect().top + window.scrollY - headerOffset()
      window.scrollTo({ top: Math.max(0, top), behavior: 'auto' })
      stop()
      return true
    }

    if (attempt()) return stop

    window.addEventListener('wheel', takeOver, { passive: true })
    window.addEventListener('touchmove', takeOver, { passive: true })
    window.addEventListener('keydown', takeOver)

    observer = new MutationObserver(() => attempt())
    observer.observe(document.body, { childList: true, subtree: true })
    timer = setTimeout(stop, GIVE_UP_MS)

    return stop
    // `key` is in the deps so re-navigating to the SAME hash (a second click on
    // the same permalink) scrolls again instead of being a no-op.
  }, [hash, key])
}

export default useHashScroll

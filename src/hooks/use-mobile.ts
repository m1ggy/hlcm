import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  // Starts false unconditionally — matches what the server always renders
  // (there's no `window` there) — and is corrected to the real value
  // inside the effect below, once mounted. The previous version read
  // `window` directly in the state initializer
  // (`typeof window !== "undefined" && window.innerWidth < ...`), which
  // runs during the client's hydration render too — computing `true` on
  // any narrow viewport before hydration had even reconciled against the
  // server's (always-desktop) HTML. That's a textbook hydration mismatch:
  // caught live, it threw a real "Hydration failed" error on every
  // navigation at a mobile viewport, immediately followed by an internal
  // Next.js runtime crash ("Cannot read properties of null (reading
  // 'parentNode')") — the kind of tree-level corruption that can leave
  // unrelated descendants (dialogs, their event handlers) in a broken
  // state afterward, not just the sidebar itself.
  const [isMobile, setIsMobile] = React.useState(false)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => setIsMobile(mql.matches)
    onChange()
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return isMobile
}

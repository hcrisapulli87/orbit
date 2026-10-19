import { useData } from '../data/DataProvider'

/**
 * The last change, and the way to take it back.
 *
 * Floats just above the dock rather than inside it: the dock's height is
 * measured and published as --dock-h, and a toast that changed that height
 * would shove every screen's bottom padding up and down as it came and went.
 *
 * A live region, so a screen reader hears "Done: pay rego" the way a sighted
 * person sees it, and the Undo button is a real button in the tab order.
 */
export function Toast() {
  const { toast, undoToast, dismissToast } = useData()

  return (
    <div className="toast-region" role="status" aria-live="polite">
      {toast && (
        <div className="toast" key={toast.id}>
          <span className="toast__msg">{toast.message}</span>
          {toast.undo && (
            <button className="toast__undo" onClick={() => void undoToast()}>
              Undo
            </button>
          )}
          <button className="toast__close" onClick={dismissToast} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}
    </div>
  )
}

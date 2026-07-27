import { useEffect, useState } from 'react'

/**
 * Says so when the network is gone.
 *
 * The app shell is precached, so Orbit opens fine on the train — which is
 * exactly the problem: it looks completely normal while every write silently
 * fails. There's no offline queue (conflict resolution against realtime is a
 * real project), so the honest thing is to say that changes won't save.
 */
export function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  if (online) return null

  return (
    <div className="offline" role="status">
      Offline — you can read, but changes won’t save
    </div>
  )
}

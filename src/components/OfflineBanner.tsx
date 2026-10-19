import { useEffect, useState } from 'react'
import { useData } from '../data/DataProvider'

/**
 * Says so when the network is gone, and what still works.
 *
 * The app shell is precached, so Orbit opens fine on the train — which is
 * exactly the problem: it looks completely normal. New captures are queued and
 * sent when the connection comes back (data/DataProvider, domain/outbox.ts);
 * edits to anything already saved still need the network, because merging
 * them against realtime is a real project. The banner says both.
 */
export function OfflineBanner() {
  const { pendingIds } = useData()
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

  const waiting = pendingIds.size
  return (
    <div className="offline" role="status">
      Offline — new things you add are kept
      {waiting > 0 ? ` (${waiting} waiting)` : ''} and saved when you’re back.
      Other changes won’t save.
    </div>
  )
}

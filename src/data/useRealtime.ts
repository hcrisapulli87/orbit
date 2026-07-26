import { useEffect } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Subscribe to changes on a set of tables and call `onChange` when any fires.
 *
 * The payload is deliberately discarded: this is an invalidation signal, not a
 * data source. The consumer re-fetches for truth, which keeps one code path for
 * loading rather than a second, subtly different one for patching state.
 *
 * `tables.join(',')` gives a stable dep so an inline array literal doesn't
 * resubscribe on every render. `onChange` must be wrapped in useCallback.
 */
export function useRealtime(tables: string[], onChange: () => void) {
  const key = tables.join(',')
  useEffect(() => {
    const channel = supabase.channel(`orbit:${key}`)
    for (const table of tables) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => onChange(),
      )
    }
    channel.subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [key, onChange])
}

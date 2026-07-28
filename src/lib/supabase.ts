import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createDemoClient } from '../demo/fakeSupabase'

// The single Supabase client for the app. The publishable key is a *public*
// browser key; the database is protected by Row-Level Security, not by hiding it.
const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

/**
 * Demo mode (`npm run demo`) swaps the whole client for an in-memory fake.
 *
 * Everything above this line — every screen, the provider, the planner, the
 * recurrence engine — is untouched and runs exactly as it does in production.
 * Only the I/O boundary moves, which is the one place a demo can be faked
 * without the demo and the real app drifting apart.
 */
export const DEMO = import.meta.env.VITE_DEMO === '1'

if (!DEMO && (!url || !publishableKey || url.includes('placeholder'))) {
  // Loud, early signal rather than a confusing failure on the first query.
  console.warn(
    '[orbit] Supabase env not configured. Copy .env.example to .env and set ' +
      'VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (Supabase → Project Settings → API).',
  )
}

export const supabase: SupabaseClient = DEMO
  ? (createDemoClient() as unknown as SupabaseClient)
  : createClient(url, publishableKey)

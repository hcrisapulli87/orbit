import { createClient } from '@supabase/supabase-js'

// The single Supabase client for the app. The publishable key is a *public*
// browser key; the database is protected by Row-Level Security, not by hiding it.
const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !publishableKey || url.includes('placeholder')) {
  // Loud, early signal rather than a confusing failure on the first query.
  console.warn(
    '[orbit] Supabase env not configured. Copy .env.example to .env and set ' +
      'VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (Supabase → Project Settings → API).',
  )
}

export const supabase = createClient(url, publishableKey)

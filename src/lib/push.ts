import { supabase } from './supabase'

// Web push, client half.
//
// iOS is the awkward one: notifications only work for a PWA that has been added
// to the home screen (16.4+), permission must be requested from a real user
// gesture, and permission is lost if the app is removed from the home screen.
// That fragility is exactly why the Discord digest exists alongside this rather
// than as belt-and-braces duplication.

export type PushState = 'unsupported' | 'not-configured' | 'denied' | 'off' | 'on'

const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

/** VAPID keys are base64url; PushManager wants raw bytes. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

export async function pushState(): Promise<PushState> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported'
  if (!vapidPublicKey) return 'not-configured'
  if (Notification.permission === 'denied') return 'denied'

  const registration = await navigator.serviceWorker.getRegistration()
  const existing = await registration?.pushManager.getSubscription()
  return existing ? 'on' : 'off'
}

/**
 * Ask for permission and register this device. Must be called from a click —
 * both Safari and Chrome refuse a permission prompt without a user gesture.
 */
export async function enablePush(ownerId: string): Promise<PushState> {
  if (!vapidPublicKey) return 'not-configured'

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off'

  const registration = await navigator.serviceWorker.ready
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
    }))

  const json = subscription.toJSON()
  const { error } = await supabase.from('task_push_subscriptions').upsert(
    {
      owner_id: ownerId,
      endpoint: subscription.endpoint,
      p256dh: json.keys?.p256dh ?? '',
      auth: json.keys?.auth ?? '',
      user_agent: navigator.userAgent,
      // A device that starts working again should not stay written off.
      failure_count: 0,
    },
    { onConflict: 'endpoint' },
  )
  if (error) throw error

  return 'on'
}

/** Unsubscribe this device and forget it server-side. */
export async function disablePush(): Promise<PushState> {
  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) return 'off'

  await supabase.from('task_push_subscriptions').delete().eq('endpoint', subscription.endpoint)
  await subscription.unsubscribe()
  return 'off'
}

/** True when the page is an installed PWA — iOS requires this before push works. */
export function isInstalled(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  )
}

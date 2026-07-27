/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching'

// The one structural divergence from Tandem and Tally.
//
// Those use vite-plugin-pwa's generateSW, which produces a service worker we
// can't add code to. A push listener has to live INSIDE the service worker, so
// Orbit uses injectManifest and owns this file. Everything else about the PWA
// setup stays identical to its siblings.

declare const self: ServiceWorkerGlobalScope

interface PushPayload {
  title: string
  body?: string
  taskId?: string
  tag?: string
}

precacheAndRoute(self.__WB_MANIFEST)

// registerType: 'autoUpdate' installs a new worker silently; these two make it
// take over immediately rather than waiting for every tab to close.
self.addEventListener('install', () => {
  void self.skipWaiting()
})
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  // A push with no readable payload still has to show something: browsers
  // revoke permission from sites that receive a push and display nothing.
  let payload: PushPayload = { title: 'Orbit' }
  try {
    if (event.data) payload = { ...payload, ...(event.data.json() as PushPayload) }
  } catch {
    payload = { title: 'Orbit', body: event.data?.text() }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/pwa-192.png',
      badge: '/pwa-192.png',
      // Tagging by task means a re-sent reminder replaces the old one instead
      // of stacking up three copies of the same nag.
      tag: payload.tag ?? payload.taskId ?? 'orbit',
      data: { taskId: payload.taskId },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const taskId = (event.notification.data as { taskId?: string } | undefined)?.taskId
  const url = taskId ? `/task/${taskId}` : '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Reuse an open window if there is one — opening a second copy of an
      // installed PWA is disorienting.
      for (const client of clients) {
        if ('focus' in client) {
          void client.navigate(url)
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})

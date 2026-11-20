// Push notification handling, loaded into the generated service worker (see workbox.importScripts in vite.config.ts).
// A push always shows a notification: browsers (iOS especially) revoke permission for silent pushes.

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (e) {
    data = { body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'EPC Construction'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/favicon-64.png',
      tag: data.tag || undefined,
      lang: data.lang || 'en',
      dir: data.lang === 'ur' ? 'rtl' : 'ltr',
      data: { url: data.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const w of windows) {
        if (new URL(w.url).origin === self.location.origin) {
          await w.focus()
          if ('navigate' in w) {
            try {
              await w.navigate(target)
            } catch (e) {
              /* the focused window stays where it is */
            }
          }
          return
        }
      }
      await self.clients.openWindow(target)
    })(),
  )
})

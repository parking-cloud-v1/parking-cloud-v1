self.addEventListener('push', function (event) {
  var data = {}
  try { data = event.data ? event.data.json() : {} } catch (_) {}
  var title = data.title || '月租候補通知'
  var options = {
    body: data.body || '有新的月租候補資料，請至系統查看。',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: data.tag || 'monthly-waitlist',
    renotify: true,
    data: { url: data.url || '/dashboard/monthly-rentals/waiting-list' }
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  var url = (event.notification.data && event.notification.data.url) || '/dashboard/monthly-rentals/waiting-list'
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
    for (var i = 0; i < clientList.length; i++) {
      var client = clientList[i]
      if ('focus' in client) {
        client.navigate(url)
        return client.focus()
      }
    }
    if (clients.openWindow) return clients.openWindow(url)
  }))
})

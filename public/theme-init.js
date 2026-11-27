// Apply the saved theme before the first paint, so a dark page never flashes white.
// This stays in a separate same-origin file so production can enforce script-src 'self'
// without allowing arbitrary inline JavaScript.
(function () {
  try {
    var preference = localStorage.getItem('epc.theme')
    var dark =
      preference === 'dark' ||
      (preference !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)
    var root = document.documentElement
    if (dark) {
      root.classList.add('dark')
      root.style.colorScheme = 'dark'
    }
    var themeColor = document.querySelector('meta[name="theme-color"]')
    if (themeColor && dark) themeColor.setAttribute('content', '#0a0a0a')
  } catch (_) {
    // Storage can be unavailable in private/restricted browsing; the app still loads normally.
  }
})()

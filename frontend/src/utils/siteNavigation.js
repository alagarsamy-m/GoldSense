export const HOME_NAV_ITEMS = [
  { label: 'Predictor', hash: '#predictor' },
  { label: 'Weekly Forecast', hash: '#weekly-forecast' },
  { label: 'Accuracy', hash: '#accuracy' },
]

export function scrollToHash(hash, offset = 104) {
  if (!hash) return false

  const id = hash.replace('#', '')
  const element = document.getElementById(id)
  if (!element) return false

  const top = element.getBoundingClientRect().top + window.scrollY - offset
  window.scrollTo({ top, behavior: 'smooth' })
  window.history.replaceState(null, '', `/${hash}`)
  return true
}

export function navigateToHomeSection(navigate, location, hash, offset = 104) {
  if (location.pathname === '/' && scrollToHash(hash, offset)) {
    return
  }
  navigate(`/${hash}`)
}

const SNAPSHOT_BASE = '/snapshots'

async function readSnapshot(name) {
  const response = await fetch(`${SNAPSHOT_BASE}/${name}.json`, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Snapshot ${name} unavailable`)
  }
  return response.json()
}

export const getHomeSnapshot = () => readSnapshot('home')
export const getTodaySnapshot = () => readSnapshot('today')
export const getTomorrowSnapshot = () => readSnapshot('tomorrow')
export const getWeekSnapshot = () => readSnapshot('week')
export const getAccuracySnapshot = () => readSnapshot('accuracy')

export const FOOTPRINT_STORAGE_KEY = 'pretext-footprint-v1'
export const FOOTPRINT_MESSAGE_TYPE = 'pretext-footprint-updated'

export function readFootprintState() {
  try {
    const raw = window.localStorage.getItem(FOOTPRINT_STORAGE_KEY)
    if (!raw) {
      return { completed: {} }
    }

    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || parsed.completed === null || typeof parsed.completed !== 'object') {
      return { completed: {} }
    }

    return { completed: { ...parsed.completed } }
  } catch {
    return { completed: {} }
  }
}

export function isBuildingCompleted(buildingId) {
  return Boolean(readFootprintState().completed[buildingId])
}

export function markBuildingCompleted(building) {
  const state = readFootprintState()
  const existing = state.completed[building.id]
  if (existing) {
    return { changed: false, entry: existing, state }
  }

  const entry = createFootprintEntry(building)
  const nextState = {
    completed: {
      ...state.completed,
      [building.id]: entry,
    },
  }

  try {
    window.localStorage.setItem(FOOTPRINT_STORAGE_KEY, JSON.stringify(nextState))
  } catch {
    return { changed: false, entry, state }
  }

  return { changed: true, entry, state: nextState }
}

export function postFootprintUpdate(entry) {
  if (window.parent === window) return
  window.parent.postMessage(
    {
      type: FOOTPRINT_MESSAGE_TYPE,
      payload: entry,
    },
    window.location.origin,
  )
}

function createFootprintEntry(building) {
  return {
    id: building.id,
    name: building.name,
    region: building.region,
    number: building.catalog.number,
    dynasty: building.catalog.dynasty,
    typology: building.catalog.typology,
    structure: building.catalog.structure,
    yearLabel: building.catalog.yearLabel,
    stampCn: building.stamp.componentCn,
    stampEn: building.stamp.componentEn,
    completedAt: new Date().toISOString(),
  }
}

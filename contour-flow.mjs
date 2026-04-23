function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

export function computeLineFlowOffset({
  mask,
  bandTop,
  bandBottom,
  viewportWidth,
  viewportHeight,
  occupiedInterval,
  slot,
  lineX,
  lineWidth,
  options = {},
}) {
  if (occupiedInterval === null) return { x: 0, y: 0, angle: 0, tracking: 0 }

  const maxDistance = options.maxDistance ?? 150
  const normalShift = options.normalShift ?? 8
  const tangentShift = options.tangentShift ?? 6
  const verticalShift = options.verticalShift ?? 2
  const threshold = options.threshold ?? 26

  const lineCenter = lineX + lineWidth * 0.5
  let side = null
  let distance = Infinity

  if (lineCenter <= occupiedInterval.left) {
    side = 'left'
    distance = occupiedInterval.left - lineCenter
  } else if (lineCenter >= occupiedInterval.right) {
    side = 'right'
    distance = lineCenter - occupiedInterval.right
  }

  if (side === null || distance > maxDistance) {
    return { x: 0, y: 0, angle: 0, tracking: 0 }
  }

  const edge = sampleBoundarySlope({
    mask,
    bandTop,
    bandBottom,
    viewportWidth,
    viewportHeight,
    side,
    threshold,
  })

  const weight = Math.pow(1 - distance / maxDistance, 1.25)
  const sideDirection = side === 'left' ? -1 : 1
  const contourDriftX = clamp(edge.slope * tangentShift * sideDirection, -tangentShift, tangentShift) * weight
  const contourDriftY = clamp(edge.curvature * verticalShift, -verticalShift, verticalShift) * weight
  const retreatX = sideDirection * normalShift * weight
  const tuckY = edge.lean * 1.5 * weight
  const angle = clamp(edge.slope * 15 * sideDirection, -15, 15) * weight
  const tracking = clamp(edge.curvature * -2, -1, 1.5) * weight

  return {
    x: contourDriftX + retreatX,
    y: contourDriftY + tuckY,
    angle,
    tracking,
  }
}

function sampleBoundarySlope({
  mask,
  bandTop,
  bandBottom,
  viewportWidth,
  viewportHeight,
  side,
  threshold,
}) {
  const { data, width, height } = mask
  const top = clamp(Math.floor((bandTop / viewportHeight) * height), 0, height - 1)
  const bottom = clamp(Math.ceil((bandBottom / viewportHeight) * height), 0, height - 1)
  const samples = []

  for (let y = top; y <= bottom; y += 1) {
    let edgeX = -1
    if (side === 'left') {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4
        if ((data[offset] ?? 0) < threshold) continue
        edgeX = x
        break
      }
    } else {
      for (let x = width - 1; x >= 0; x -= 1) {
        const offset = (y * width + x) * 4
        if ((data[offset] ?? 0) < threshold) continue
        edgeX = x
        break
      }
    }

    if (edgeX >= 0) {
      samples.push({ x: edgeX, y })
    }
  }

  if (samples.length < 2) {
    return { slope: 0, curvature: 0, lean: 0 }
  }

  const first = samples[0]
  const middle = samples[Math.floor(samples.length * 0.5)]
  const last = samples[samples.length - 1]
  const dy = Math.max(1, last.y - first.y)
  const dx = last.x - first.x
  const upperDx = middle.x - first.x
  const lowerDx = last.x - middle.x

  return {
    slope: dx / dy,
    curvature: clamp((lowerDx - upperDx) / dy, -1, 1),
    lean: clamp((middle.x - (first.x + last.x) * 0.5) / Math.max(1, dy * 0.5), -1, 1),
  }
}

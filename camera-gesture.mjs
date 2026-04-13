import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'

const WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm'
const MODEL_ASSET_PATH = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
const PALM_INDICES = [0, 5, 9, 13, 17]
const THUMB_TIP_INDEX = 4
const INDEX_TIP_INDEX = 8
const PALM_SMOOTHING = 0.24
const PINCH_SMOOTHING = 0.22
const DEAD_ZONE_X = 0.025
const DEAD_ZONE_Y = 0.03
const DEAD_ZONE_PINCH = 0.012
const MISSING_FRAME_RESET = 12
const PITCH_BASELINE_EASE = 0.035
const DEBUG_CAMERA_GESTURE = false
const DEBUG_INTERVAL_MS = 240

export function createCameraGestureController({ getOrbitTargets, onTargetsChange }) {
  const video = document.createElement('video')
  video.autoplay = true
  video.muted = true
  video.playsInline = true

  const state = {
    handLandmarker: null,
    lastVideoTime: -1,
    missingFrames: 0,
    neutralOrbit: null,
    neutralPalm: null,
    neutralPinch: null,
    smoothedPalm: null,
    smoothedPinch: null,
    lastDebugAt: 0,
  }

  let rafId = 0

  return {
    async start() {
      try {
        await startVideo(video)
        state.handLandmarker = await createHandLandmarker()
        rafId = requestAnimationFrame(processFrame)
      } catch (error) {
        console.error(error)
      }
    },
    stop() {
      cancelAnimationFrame(rafId)
      const stream = video.srcObject
      if (stream instanceof MediaStream) {
        for (const track of stream.getTracks()) track.stop()
      }
    },
  }

  async function processFrame() {
    rafId = requestAnimationFrame(processFrame)
    if (state.handLandmarker === null) return
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return
    if (video.currentTime === state.lastVideoTime) return

    state.lastVideoTime = video.currentTime
    const result = state.handLandmarker.detectForVideo(video, performance.now())
    const landmarks = result.landmarks?.[0]

    if (!landmarks) {
      handleMissingHand()
      return
    }

    state.missingFrames = 0
    const palm = smoothPalm(getPalmCenter(landmarks))
    const pinch = smoothPinch(getPinchDistance(landmarks))

    if (state.neutralPalm === null || state.neutralPinch === null || state.neutralOrbit === null) {
      state.neutralPalm = palm
      state.neutralPinch = pinch
      state.neutralOrbit = getOrbitTargets()
      return
    }

    const dx = applyDeadZone(palm.x - state.neutralPalm.x, DEAD_ZONE_X)
    const dy = applyDeadZone(palm.y - state.neutralPalm.y, DEAD_ZONE_Y)
    const pinchDelta = applyDeadZone(pinch - state.neutralPinch, DEAD_ZONE_PINCH)
    state.neutralPalm.y = lerp(state.neutralPalm.y, palm.y, PITCH_BASELINE_EASE)

    const nextTargets = {
      yaw: clamp(state.neutralOrbit.yaw + dx * 1.8, 0, 1),
      pitch: clamp(state.neutralOrbit.pitch - dy * 0.72, 0.18, 0.82),
      zoom: clamp(state.neutralOrbit.zoom + pinchDelta * 4.2, 0.05, 0.95),
    }

    debugGesture({
      palmY: palm.y,
      neutralPalmY: state.neutralPalm.y,
      dy,
      pitchTarget: nextTargets.pitch,
    })
    onTargetsChange(nextTargets)
  }

  function handleMissingHand() {
    state.missingFrames += 1
    if (state.missingFrames < MISSING_FRAME_RESET) return
    state.neutralOrbit = null
    state.neutralPalm = null
    state.neutralPinch = null
    state.smoothedPalm = null
    state.smoothedPinch = null
  }

  function smoothPalm(nextPalm) {
    if (state.smoothedPalm === null) {
      state.smoothedPalm = nextPalm
      return nextPalm
    }

    state.smoothedPalm = {
      x: lerp(state.smoothedPalm.x, nextPalm.x, PALM_SMOOTHING),
      y: lerp(state.smoothedPalm.y, nextPalm.y, PALM_SMOOTHING),
    }
    return state.smoothedPalm
  }

  function smoothPinch(nextPinch) {
    if (state.smoothedPinch === null) {
      state.smoothedPinch = nextPinch
      return nextPinch
    }

    state.smoothedPinch = lerp(state.smoothedPinch, nextPinch, PINCH_SMOOTHING)
    return state.smoothedPinch
  }

  function debugGesture(payload) {
    if (!DEBUG_CAMERA_GESTURE) return
    const now = performance.now()
    if (now - state.lastDebugAt < DEBUG_INTERVAL_MS) return
    state.lastDebugAt = now
    console.log('[camera-gesture]', payload)
  }
}

async function createHandLandmarker() {
  const vision = await FilesetResolver.forVisionTasks(WASM_ROOT)
  return HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: MODEL_ASSET_PATH,
    },
    runningMode: 'VIDEO',
    numHands: 1,
    minHandDetectionConfidence: 0.6,
    minHandPresenceConfidence: 0.6,
    minTrackingConfidence: 0.6,
  })
}

async function startVideo(video) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: 'user',
      width: { ideal: 640 },
      height: { ideal: 480 },
    },
  })
  video.srcObject = stream
  await video.play()
}

function getPalmCenter(landmarks) {
  let x = 0
  let y = 0

  for (const index of PALM_INDICES) {
    x += 1 - landmarks[index].x
    y += landmarks[index].y
  }

  return {
    x: x / PALM_INDICES.length,
    y: y / PALM_INDICES.length,
  }
}

function getPinchDistance(landmarks) {
  const thumb = landmarks[THUMB_TIP_INDEX]
  const index = landmarks[INDEX_TIP_INDEX]
  return Math.hypot(index.x - thumb.x, index.y - thumb.y)
}

function applyDeadZone(value, deadZone) {
  if (Math.abs(value) <= deadZone) return 0
  return value
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

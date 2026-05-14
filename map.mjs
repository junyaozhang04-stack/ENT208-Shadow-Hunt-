import * as THREE from 'three'
import { ambientSites, buildings } from './building-data.mjs'
import { FOOTPRINT_MESSAGE_TYPE, FOOTPRINT_STORAGE_KEY, readFootprintState } from './footprint-store.mjs'

const MAP_WIDTH = 13.2
const MAP_HEIGHT = 8.6
const INTRO_MS = 2600
const FIRST_MOVE_MS = 1800
const CAMERA_EASE = 0.075
const POINTER_EASE = 0.16
const ONBOARDING_KEY = 'pretext-map-onboarding-seen'
const GROUPING_CONFIG = {
  dynasty: {
    eyebrow: 'Grouped by Dynasty',
    getValue: building => building.catalog.dynasty,
    order: ['Tang Dynasty', 'Southern Song', 'Qing Dynasty'],
  },
  typology: {
    eyebrow: 'Grouped by Typology',
    getValue: building => building.catalog.typology,
    order: ['Monastery', 'Confucian Temple', 'Pagoda'],
  },
  structure: {
    eyebrow: 'Grouped by Structure',
    getValue: building => building.catalog.structure,
    order: ['Hip-and-gable timber hall', 'Ritual courtyard hall', 'Hexagonal brick tower'],
  },
}

const app = requireRoot('.immersive-app')
const stage = requireElement('map-canvas-stage')
const labelLayer = requireElement('marker-label-layer')
const loadingVeil = requireElement('loading-veil')
const mapModeButton = requireElement('map-mode-button')
const indexModeButton = requireElement('index-mode-button')
const footprintModeButton = requireElement('footprint-mode-button')
const overviewButton = requireElement('overview-button')
const primaryInteractionHint = requireElement('primary-interaction-hint')
const focusInteractionHint = requireElement('focus-interaction-hint')
const onboarding = requireElement('map-onboarding')
const onboardingCopy = requireElement('map-onboarding-copy')
const onboardingDismiss = requireElement('map-onboarding-dismiss')
const architecturalIndex = requireElement('architectural-index')
const personalFootprint = requireElement('personal-footprint')
const indexSearchInput = requireElement('index-search-input')
const indexResults = requireElement('index-results')
const indexModalOverlay = requireElement('index-modal-overlay')
const modalCloseBtn = requireElement('modal-close-btn')
const modalEyebrow = requireElement('modal-eyebrow')
const modalTitle = requireElement('modal-title')
const modalTags = requireElement('modal-tags')
const modalSummary = requireElement('modal-summary')
const modalFacts = requireElement('modal-facts')
const modalBtnMap = requireElement('modal-btn-map')
const modalBtn3D = requireElement('modal-btn-3d')
const footprintCollectedCount = requireElement('footprint-collected-count')
const footprintRemainingCount = requireElement('footprint-remaining-count')
const footprintCompletionRate = requireElement('footprint-completion-rate')
const footprintSpotlightKicker = requireElement('footprint-spotlight-kicker')
const footprintSpotlightName = requireElement('footprint-spotlight-name')
const footprintSpotlightStamp = requireElement('footprint-spotlight-stamp')
const footprintSpotlightSummary = requireElement('footprint-spotlight-summary')
const footprintShowMapButton = requireElement('footprint-show-map-button')
const footprintOpenDetailButton = requireElement('footprint-open-detail-button')
const footprintStampGrid = requireElement('footprint-stamp-grid')
const detailLaunch = requireElement('detail-launch')
const pretextPortal = requireElement('pretext-portal')
const portalClose = requireElement('portal-close')
const pretextFrame = requireElement('pretext-frame')
const region = requireElement('building-region')
const name = requireElement('building-name')
const summary = requireElement('building-summary')

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2(10, 10)
const clock = new THREE.Clock()
const cameraTarget = new THREE.Vector3(0, 0, 0)
const desiredTarget = new THREE.Vector3(0, 0, 0)
const desiredCamera = new THREE.Vector3(0, 6.4, 7.8)
const markerGroups = new Map()
const hitTargets = []
const labels = new Map()
const ambientGroups = []
const ambientHitTargets = []
const groupButtons = Array.from(document.querySelectorAll('[data-group-by]')).filter(element => element instanceof HTMLButtonElement)

let viewportWidth = 1
let viewportHeight = 1
let footprintTrailMesh = null
let trailAnimationTime = 0
let ambientLight = null
let focusLight = null
let focusTarget = null
let selectedId = buildings[0].id
let isOverview = true
let hoveredId = null
let hoveredAmbient = null
let introStart = performance.now()
let introDone = false
let firstMoveStart = 0
let firstMoveDone = false
let interactionStarted = false
let dragState = null
let orbitYaw = 0
let orbitPitch = 0
let userZoom = 0
let activePointers = new Map()
let pinchState = null
let activeView = 'map'
let activeGrouping = 'dynasty'
let indexQuery = ''
let footprintState = readFootprintState()

init()

function init() {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  stage.appendChild(renderer.domElement)

  scene.background = new THREE.Color(0x17100a)
  scene.fog = new THREE.FogExp2(0x17100a, 0.064)

  camera.position.set(0, 12.8, 13.4)
  cameraTarget.set(0, 0.1, 0)
  camera.lookAt(cameraTarget)

  addLights()
  addWorld()
  createMarkers()
  createAmbientSites()
  addDust()
  renderArchitecturalIndex()
  renderPersonalFootprint()
  renderDetails()
  selectBuilding(selectedId, { immediate: true })
  setView('map')
  resize()

  window.addEventListener('resize', resize)
  window.addEventListener('message', handleFootprintMessage)
  window.addEventListener('storage', handleFootprintStorage)
  mapModeButton.addEventListener('click', () => setView('map'))
  indexModeButton.addEventListener('click', () => setView('index'))
  footprintModeButton.addEventListener('click', () => setView('footprint'))
  overviewButton.addEventListener('click', returnToOverview)
  onboardingDismiss.addEventListener('click', () => dismissOnboarding({ remember: true }))
  indexSearchInput.addEventListener('input', handleIndexSearch)
  indexResults.addEventListener('click', handleIndexResultsClick)
  modalCloseBtn.addEventListener('click', closeIndexModal)
  modalBtnMap.addEventListener('click', () => {
    closeIndexModal()
    handleIndexShowMap()
  })
  modalBtn3D.addEventListener('click', openPretextDetail)
  footprintStampGrid.addEventListener('click', handleFootprintGridClick)
  footprintShowMapButton.addEventListener('click', handleFootprintShowMap)
  footprintOpenDetailButton.addEventListener('click', openPretextDetail)
  for (const button of groupButtons) {
    button.addEventListener('click', () => setIndexGrouping(button.dataset.groupBy ?? 'dynasty'))
  }
  detailLaunch.addEventListener('click', openPretextDetail)
  portalClose.addEventListener('click', closePretextDetail)
  renderer.domElement.addEventListener('wheel', handleWheel, { passive: false })
  renderer.domElement.addEventListener('pointermove', handlePointerMove)
  renderer.domElement.addEventListener('pointerleave', handlePointerLeave)
  renderer.domElement.addEventListener('pointerdown', handlePointerDown)
  renderer.domElement.addEventListener('pointerup', handlePointerUp)
  renderer.domElement.addEventListener('pointercancel', handlePointerUp)
  renderer.domElement.addEventListener('lostpointercapture', handlePointerUp)
  setupTouchCopy()
  requestAnimationFrame(tick)
}

function addLights() {
  ambientLight = new THREE.HemisphereLight(0xf1dec0, 0x24170d, 1.25)

  const sun = new THREE.DirectionalLight(0xf8df9b, 3.4)
  sun.position.set(-4, 9, 5)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.near = 1
  sun.shadow.camera.far = 24
  sun.shadow.camera.left = -8
  sun.shadow.camera.right = 8
  sun.shadow.camera.top = 8
  sun.shadow.camera.bottom = -8

  const rim = new THREE.DirectionalLight(0xc68f54, 1.05)
  rim.position.set(6, 3.8, -5)

  focusTarget = new THREE.Object3D()
  scene.add(focusTarget)

  focusLight = new THREE.SpotLight(0xc5a35a, 0, 4.6, 0.45, 0.82, 1.4)
  focusLight.position.set(0, 4.6, 0)
  focusLight.target = focusTarget
  scene.add(ambientLight, sun, rim, focusTarget, focusLight)
}

function addWorld() {
  const textureUrl = new URL('./hand_drawn_map.svg', import.meta.url).href
  const texture = new THREE.TextureLoader().load(textureUrl, () => {
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy()
  })

  const geometry = new THREE.PlaneGeometry(MAP_WIDTH, MAP_HEIGHT, 180, 118)
  geometry.rotateX(-Math.PI / 2)
  const position = geometry.attributes.position
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index)
    const z = position.getZ(index)
    const ridge = Math.sin(x * 1.8) * Math.cos(z * 1.45) * 0.035
    const shore = Math.sin((x + z) * 2.8) * 0.018
    position.setY(index, ridge + shore)
  }
  geometry.computeVertexNormals()

  const terrain = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      map: texture,
      color: 0xf0ddad,
      roughness: 0.92,
      metalness: 0.02,
      emissive: 0x1e1710,
      emissiveIntensity: 0.08,
    }),
  )
  terrain.receiveShadow = true
  scene.add(terrain)

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(MAP_WIDTH + 0.32, 0.18, MAP_HEIGHT + 0.32),
    new THREE.MeshStandardMaterial({ color: 0x18140f, roughness: 0.86, metalness: 0.08 }),
  )
  base.position.y = -0.14
  base.receiveShadow = true
  scene.add(base)

  const grid = new THREE.GridHelper(14, 18, 0x7e6a42, 0x473d2b)
  grid.position.y = 0.024
  grid.material.transparent = true
  grid.material.opacity = 0.11
  scene.add(grid)
}

function createMarkers() {
  for (const building of buildings) {
    const group = new THREE.Group()
    const world = toWorldPosition(building.position)
    group.position.set(world.x, 0.14, world.z)
    group.userData = { id: building.id, baseY: group.position.y, lift: 0 }

    const aura = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.24, 0.01, 48),
      new THREE.MeshBasicMaterial({
        color: building.accent,
        transparent: true,
        opacity: 0.18,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    )
    aura.position.y = 0.018
    aura.userData.markerGroup = group
    group.add(aura)

    const hitTarget = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.22, 0.22, 24),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    )
    hitTarget.position.y = 0.18
    hitTarget.userData.markerGroup = group
    group.add(hitTarget)

    const symbol = createNavigationSymbol(building)
    symbol.position.y = 0.18
    group.add(symbol)

    group.userData.aura = aura
    group.userData.symbol = symbol
    scene.add(group)
    markerGroups.set(building.id, group)
    hitTargets.push(hitTarget, aura)
    symbol.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return
      child.userData.markerGroup = group
      hitTargets.push(child)
    })

    const label = document.createElement('div')
    label.className = 'marker-label'
    label.textContent = building.name
    labelLayer.appendChild(label)
    labels.set(building.id, label)
  }
}

function createNavigationSymbol(building) {
  const group = new THREE.Group()
  const coreMaterial = new THREE.MeshBasicMaterial({
    color: building.accent,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const lineMaterial = new THREE.MeshBasicMaterial({
    color: building.accent,
    transparent: true,
    opacity: 0.24,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  })

  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.08, 24, 16), coreMaterial)
  glow.position.y = 0.28

  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.24, 24, 16), coreMaterial.clone())
  halo.material.opacity = 0.13
  halo.position.y = 0.28

  const lowerRing = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.005, 8, 72), lineMaterial)
  lowerRing.rotation.x = Math.PI * 0.5
  lowerRing.position.y = 0.04

  const upperRing = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.004, 8, 72), lineMaterial.clone())
  upperRing.rotation.x = Math.PI * 0.5
  upperRing.position.y = 0.22

  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.045, 1.45, 24, 1, true), lineMaterial.clone())
  beam.material.opacity = 0.16
  beam.position.y = 0.82
  group.add(glow, halo, lowerRing, upperRing, beam)
  return group
}

function createAmbientSites() {
  const dotMaterial = new THREE.MeshBasicMaterial({
    color: 0xc5a35a,
    transparent: true,
    opacity: 0.28,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0xc5a35a,
    transparent: true,
    opacity: 0.08,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })

  for (const site of ambientSites) {
    const world = toWorldPosition(site.position)
    const group = new THREE.Group()
    group.position.set(world.x, 0.08, world.z)
    group.userData.phase = Math.random() * Math.PI * 2

    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 14, 10), dotMaterial.clone())
    dot.position.y = 0.1
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.004, 8, 32), ringMaterial.clone())
    ring.rotation.x = Math.PI * 0.5
    ring.position.y = 0.055
    dot.userData.ambientGroup = group
    ring.userData.ambientGroup = group
    group.add(dot, ring)
    scene.add(group)
    ambientGroups.push(group)
    ambientHitTargets.push(dot, ring)

    const label = document.createElement('div')
    label.className = 'marker-label ambient-label'
    label.textContent = `${site.name} · archive point`
    labelLayer.appendChild(label)
    group.userData.label = label
    group.userData.name = site.name
  }
}

function addDust() {
  const geometry = new THREE.BufferGeometry()
  const count = 520
  const positions = new Float32Array(count * 3)
  for (let index = 0; index < count; index += 1) {
    positions[index * 3] = (Math.random() - 0.5) * 16
    positions[index * 3 + 1] = 0.3 + Math.random() * 5.9
    positions[index * 3 + 2] = (Math.random() - 0.5) * 11
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

  const dust = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: 0xd8b976,
      size: 0.018,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  )
  dust.name = 'dust'
  scene.add(dust)
}

function tick(now) {
  requestAnimationFrame(tick)

  const elapsed = clock.getElapsedTime()
  if (footprintTrailMesh && activeView === 'footprint') {
    trailAnimationTime += 0.02
    footprintTrailMesh.material.opacity = 0.4 + Math.sin(trailAnimationTime) * 0.4
  }
  animateDust(elapsed)
  updateHover()
  updateMarkerState(elapsed)
  updateAmbientSites(elapsed)
  updateCamera(now)
  updateLabels()
  renderer.render(scene, camera)
}

function updateCamera(now) {
  if (!introDone) {
    const progress = Math.min((now - introStart) / INTRO_MS, 1)
    const eased = easeInOutCubic(progress)
    camera.position.lerpVectors(new THREE.Vector3(0, 12.8, 13.4), desiredCamera, eased)
    cameraTarget.lerpVectors(new THREE.Vector3(0, 1.6, 0), desiredTarget, eased)
    if (progress >= 1) {
      introDone = true
      firstMoveStart = now
      loadingVeil.classList.add('is-hidden')
      showOnboarding()
    }
  } else {
    applyFirstMove(now)
    const orbitOffset = new THREE.Vector3(
      Math.sin(orbitYaw) * 1.8,
      Math.sin(orbitPitch) * 0.9,
      Math.cos(orbitYaw) * 0.9,
    )
    const nextPosition = desiredCamera.clone().add(orbitOffset)
    applyUserZoom(nextPosition)
    camera.position.lerp(nextPosition, CAMERA_EASE)
    cameraTarget.lerp(desiredTarget, CAMERA_EASE)
  }

  camera.lookAt(cameraTarget)
}

function applyFirstMove(now) {
  if (firstMoveDone || interactionStarted) return

  const progress = Math.min((now - firstMoveStart) / FIRST_MOVE_MS, 1)
  const wave = Math.sin(progress * Math.PI)
  orbitYaw = wave * 0.18
  orbitPitch = -wave * 0.05
  userZoom = -wave * 0.22

  if (progress >= 1) {
    firstMoveDone = true
    orbitYaw = 0
    orbitPitch = 0
    userZoom = 0
  }
}

function applyUserZoom(nextPosition) {
  if (Math.abs(userZoom) < 0.001) return
  const direction = nextPosition.clone().sub(desiredTarget).normalize()
  nextPosition.addScaledVector(direction, userZoom)
}

function animateDust(elapsed) {
  const dust = scene.getObjectByName('dust')
  if (!dust) return
  dust.rotation.y = elapsed * 0.018
  dust.position.x = Math.sin(elapsed * 0.12) * 0.18
  dust.position.y = Math.sin(elapsed * 0.08) * 0.08
}

function updateHover() {
  raycaster.setFromCamera(pointer, camera)
  const [hit] = raycaster.intersectObjects(hitTargets, false)
  const group = hit?.object?.userData?.markerGroup
  hoveredId = group?.userData?.id ?? null

  const [ambientHit] = hoveredId === null ? raycaster.intersectObjects(ambientHitTargets, false) : []
  hoveredAmbient = ambientHit?.object?.userData?.ambientGroup ?? null
}

function updateMarkerState(elapsed) {
  for (const building of buildings) {
    const group = markerGroups.get(building.id)
    const selected = !isOverview && building.id === selectedId
    const collected = isBuildingCollected(building.id)
    const active = selected || building.id === hoveredId
    const lift = active ? 0.22 : collected ? 0.08 : 0
    group.userData.lift += (lift - group.userData.lift) * POINTER_EASE
    group.position.y = group.userData.baseY + group.userData.lift + Math.sin(elapsed * 1.6 + group.position.x) * 0.014
    group.scale.setScalar(1 + group.userData.lift * 0.18)
    group.userData.symbol.children[2].rotation.z = elapsed * 0.42
    group.userData.symbol.children[3].rotation.z = -elapsed * 0.58

    const beam = group.userData.symbol.children[4]
    if (beam instanceof THREE.Mesh) {
      beam.material.opacity = selected ? 0.28 : collected ? 0.2 : active ? 0.2 : 0.16
    }

    const label = labels.get(building.id)
    label.classList.toggle('is-active', active)
    label.classList.toggle('is-collected', collected)
    group.userData.aura.material.opacity = selected ? 0.3 : collected ? 0.24 : active ? 0.22 : 0.18
    group.userData.aura.scale.setScalar(
      selected
        ? 1.45 + Math.sin(elapsed * 2.3) * 0.08
        : active
          ? 1.16
          : collected
            ? 1.14 + Math.sin(elapsed * 1.7 + group.position.z) * 0.04
            : 1,
    )
  }
}

function updateAmbientSites(elapsed) {
  for (const group of ambientGroups) {
    const active = group === hoveredAmbient
    const pulse = 1 + Math.sin(elapsed * 1.8 + group.userData.phase) * 0.08
    group.scale.setScalar(active ? 1.35 : pulse)
    group.children[0].material.opacity = active ? 0.52 : 0.22
    group.children[1].material.opacity = active ? 0.2 : 0.07

    const label = group.userData.label
    const screen = group.position.clone()
    screen.y += 0.42
    screen.project(camera)
    const x = (screen.x * 0.5 + 0.5) * viewportWidth
    const y = (-screen.y * 0.5 + 0.5) * viewportHeight
    label.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(12px, -16px)`
    label.classList.toggle('is-active', active)
    label.style.visibility = active && screen.z < 1 ? 'visible' : 'hidden'
  }
}

function updateLabels() {
  for (const building of buildings) {
    const group = markerGroups.get(building.id)
    const label = labels.get(building.id)
    const screen = group.position.clone()
    screen.y += 0.9
    screen.project(camera)

    const x = (screen.x * 0.5 + 0.5) * viewportWidth
    const y = (-screen.y * 0.5 + 0.5) * viewportHeight
    label.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(14px, -18px)`
    label.style.visibility = screen.z < 1 ? 'visible' : 'hidden'
  }
}

function handlePointerMove(event) {
  if (activePointers.has(event.pointerId)) {
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  }

  const rect = renderer.domElement.getBoundingClientRect()
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1)

  if (pinchState && activePointers.size >= 2) {
    const [first, second] = Array.from(activePointers.values())
    const distance = Math.hypot(second.x - first.x, second.y - first.y)
    const delta = (pinchState.distance - distance) / Math.max(rect.width, rect.height, 1)
    userZoom = THREE.MathUtils.clamp(pinchState.zoom + delta * 6, -1.2, 1.55)
    return
  }

  if (!dragState) return
  const dx = (event.clientX - dragState.x) / Math.max(rect.width, 1)
  const dy = (event.clientY - dragState.y) / Math.max(rect.height, 1)
  orbitYaw = THREE.MathUtils.clamp(dragState.yaw - dx * 1.6, -0.48, 0.48)
  orbitPitch = THREE.MathUtils.clamp(dragState.pitch + dy * 1.2, -0.45, 0.28)
}

function handlePointerLeave() {
  hoveredId = null
  hoveredAmbient = null
  pointer.set(10, 10)
}

function handlePointerDown(event) {
  interactionStarted = true
  dismissOnboarding({ remember: true })
  renderer.domElement.setPointerCapture(event.pointerId)
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY })

  if (activePointers.size >= 2) {
    const [first, second] = Array.from(activePointers.values())
    pinchState = {
      distance: Math.hypot(second.x - first.x, second.y - first.y),
      zoom: userZoom,
    }
    dragState = null
    return
  }

  dragState = {
    x: event.clientX,
    y: event.clientY,
    yaw: orbitYaw,
    pitch: orbitPitch,
  }
}

function handlePointerUp(event) {
  if (renderer.domElement.hasPointerCapture(event.pointerId)) {
    renderer.domElement.releasePointerCapture(event.pointerId)
  }

  activePointers.delete(event.pointerId)
  if (activePointers.size < 2) {
    pinchState = null
  }

  if (!dragState) return

  const moved = Math.hypot(event.clientX - dragState.x, event.clientY - dragState.y) > 8
  dragState = null
  if (!moved && hoveredId) {
    selectBuilding(hoveredId)
  } else if (!moved && hoveredAmbient) {
    renderPendingSite(hoveredAmbient.userData.name)
  } else if (!moved) {
    returnToOverview()
  }
}

function handleWheel(event) {
  event.preventDefault()
  interactionStarted = true
  dismissOnboarding({ remember: true })
  userZoom = THREE.MathUtils.clamp(userZoom + event.deltaY * 0.0025, -1.2, 1.55)
}

function selectBuilding(id, options = {}) {
  selectedId = id
  isOverview = Boolean(options.immediate)
  const building = buildings.find(item => item.id === selectedId) ?? buildings[0]
  const world = toWorldPosition(building.position)
  desiredTarget.set(world.x, 0.46, world.z)
  desiredCamera.set(world.x + 2.35, 3.25, world.z + 2.8)
  orbitYaw = 0
  orbitPitch = 0
  if (!options.immediate) {
    updateFocusLight(building, world)
  }
  renderDetails()

  if (options.immediate) {
    desiredTarget.set(0, 0.22, 0)
    desiredCamera.set(0, 5.8, 7.4)
    camera.position.set(0, 12.8, 13.4)
    cameraTarget.set(0, 1.6, 0)
    if (ambientLight) ambientLight.intensity = 1.25
    if (focusLight) focusLight.intensity = 0
  }
}

function returnToOverview() {
  isOverview = true
  desiredTarget.set(0, 0.22, 0)
  desiredCamera.set(0, 5.8, 7.4)
  orbitYaw = 0
  orbitPitch = 0
  userZoom = 0
  if (ambientLight) ambientLight.intensity = 1.25
  if (focusLight) focusLight.intensity = 0
}

function setView(nextView) {
  const previousView = activeView
  activeView = nextView
  const indexVisible = nextView === 'index'
  const footprintVisible = nextView === 'footprint'
  if (!indexVisible) {
    closeIndexModal()
  }
  app.classList.toggle('is-index-open', indexVisible)
  app.classList.toggle('is-footprint-open', footprintVisible)
  architecturalIndex.classList.toggle('is-visible', indexVisible)
  architecturalIndex.setAttribute('aria-hidden', String(!indexVisible))
  personalFootprint.classList.toggle('is-visible', footprintVisible)
  personalFootprint.setAttribute('aria-hidden', String(!footprintVisible))
  mapModeButton.classList.toggle('is-active', nextView === 'map')
  mapModeButton.setAttribute('aria-pressed', String(nextView === 'map'))
  indexModeButton.classList.toggle('is-active', indexVisible)
  indexModeButton.setAttribute('aria-pressed', String(indexVisible))
  footprintModeButton.classList.toggle('is-active', footprintVisible)
  footprintModeButton.setAttribute('aria-pressed', String(footprintVisible))
  if (indexVisible || footprintVisible) {
    dismissOnboarding({ remember: true })
  }
  if (indexVisible) {
    renderArchitecturalIndex()
  }
  if (footprintVisible) {
    isOverview = true
    orbitYaw = 0
    userZoom = 0
    desiredTarget.set(0, 0, 0)
    desiredCamera.set(0, 14, 4)
    orbitPitch = 0.5
    trailAnimationTime = 0
    if (ambientLight) ambientLight.intensity = 1.25
    if (focusLight) focusLight.intensity = 0
    renderPersonalFootprint()
    if (footprintTrailMesh) {
      footprintTrailMesh.visible = true
    }
  } else {
    if (footprintTrailMesh) {
      footprintTrailMesh.visible = false
    }
    if (previousView === 'footprint' && nextView === 'map') {
      returnToOverview()
    }
  }
}

function setIndexGrouping(grouping) {
  if (!(grouping in GROUPING_CONFIG)) return
  activeGrouping = grouping
  renderArchitecturalIndex()
}

function handleIndexSearch(event) {
  if (!(event.currentTarget instanceof HTMLInputElement)) return
  indexQuery = event.currentTarget.value.trim().toLowerCase()
  renderArchitecturalIndex()
}

function handleIndexResultsClick(event) {
  const target = event.target
  if (!(target instanceof HTMLElement)) return
  const card = target.closest('.index-card')
  if (!(card instanceof HTMLButtonElement)) return
  const id = card.dataset.buildingId
  if (!id) return
  selectBuilding(id)
  renderArchitecturalIndex()
  openIndexModal(id)
}

function handleIndexShowMap() {
  setView('map')
  selectBuilding(selectedId)
}

function handleFootprintGridClick(event) {
  const target = event.target
  if (!(target instanceof HTMLElement)) return
  const card = target.closest('.footprint-stamp')
  if (!(card instanceof HTMLButtonElement)) return
  const id = card.dataset.buildingId
  if (!id) return
  selectBuilding(id)
  renderPersonalFootprint()
}

function handleFootprintShowMap() {
  setView('map')
  selectBuilding(selectedId)
}

function renderArchitecturalIndex() {
  syncGroupingButtons()
  const filteredBuildings = buildings.filter(matchesIndexQuery)

  if (filteredBuildings.length === 0) {
    indexResults.innerHTML = '<p class="index-empty">No monuments match this search. Try a dynasty, region, or structural term.</p>'
    return
  }

  const config = GROUPING_CONFIG[activeGrouping]
  const groups = groupBuildings(filteredBuildings, config)
  indexResults.innerHTML = groups.map(([groupName, items]) => renderIndexGroup(config.eyebrow, groupName, items)).join('')
}

function renderIndexGroup(eyebrow, title, items) {
  return `
    <section class="index-group">
      <header class="index-group__header">
        <div>
          <p class="index-group__eyebrow">${escapeHtml(eyebrow)}</p>
          <h3 class="index-group__title">${escapeHtml(title)}</h3>
        </div>
        <p class="index-group__count">${items.length} monument${items.length === 1 ? '' : 's'}</p>
      </header>
      <div class="index-card-grid">
        ${items.map(renderIndexCard).join('')}
      </div>
    </section>
  `
}

function renderIndexCard(building) {
  const structure = building.catalog.structure
  const selected = building.id === selectedId
  const collected = isBuildingCollected(building.id)
  const title = building.pretextTitle
    .split(/\n+/)
    .map(line => escapeHtml(line))
    .join('<br>')
  const stampHtml = collected
    ? '<div style="position:absolute; top:20px; right:20px; color:#c5a35a; font-size:10px; border:1px solid rgba(197, 163, 90, 0.4); padding:4px 8px; border-radius:4px; letter-spacing:0.1em; text-transform:uppercase; background: rgba(20, 18, 13, 0.8);">Collected</div>'
    : ''
  return `
    <button type="button" class="index-card${selected ? ' is-selected' : ''}${collected ? ' is-collected' : ''}" data-building-id="${escapeHtml(building.id)}">
      <div class="index-card__plate">
        ${stampHtml}
        <p class="index-card__number">Atlas ${escapeHtml(building.catalog.number)}</p>
        <h4 class="index-card__title">${title}</h4>
      </div>
      <div class="index-card__body">
        <p class="index-card__structure">${escapeHtml(structure)}</p>
        <p class="index-card__meta">${escapeHtml(building.catalog.dynasty)} / ${escapeHtml(building.region)}</p>
        <p class="index-card__summary">${escapeHtml(building.summary)}</p>
      </div>
    </button>
  `
}

function openIndexModal(buildingId) {
  const building = buildings.find(item => item.id === buildingId) ?? buildings[0]
  const completion = footprintState.completed[building.id]

  modalEyebrow.textContent = `${building.catalog.dynasty} / ${building.catalog.yearLabel}`
  modalTitle.textContent = building.name
  modalSummary.textContent = building.summary

  modalTags.innerHTML = [
    building.catalog.typology,
    building.catalog.structure,
    building.region,
  ].map(value => `<span>${escapeHtml(value)}</span>`).join('')

  modalFacts.innerHTML = [
    ['Catalog', `Atlas ${building.catalog.number}`],
    ['Period', building.catalog.dynasty],
    ['Structure', building.catalog.structure],
    ['Stamp', completion ? `${completion.stampEn} collected` : 'Not yet collected'],
    ['Access', building.modelUrl ? '3D detail available' : 'Model pending'],
  ].map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`).join('')

  modalBtn3D.disabled = !building.modelUrl
  modalBtn3D.textContent = building.modelUrl ? 'Enter 3D Detail' : '3D Model Pending'

  indexModalOverlay.classList.add('is-open')
  indexModalOverlay.setAttribute('aria-hidden', 'false')
}

function closeIndexModal() {
  indexModalOverlay.classList.remove('is-open')
  indexModalOverlay.setAttribute('aria-hidden', 'true')
}

function renderPersonalFootprint() {
  const completedEntries = getCompletedEntries()
  const total = buildings.length
  const collected = completedEntries.length

  footprintCollectedCount.textContent = String(collected)
  footprintRemainingCount.textContent = String(Math.max(total - collected, 0))
  footprintCompletionRate.textContent = `${Math.round((collected / Math.max(total, 1)) * 100)}%`
  renderFootprintSpotlight()

  footprintStampGrid.innerHTML = buildings.map(renderFootprintStampCard).join('')

  if (footprintTrailMesh) {
    scene.remove(footprintTrailMesh)
    footprintTrailMesh.geometry.dispose()
    footprintTrailMesh.material.dispose()
    footprintTrailMesh = null
  }

  if (collected < 2) {
    trailAnimationTime = 0
    return
  }

  const points = []
  const orderedEntries = [...completedEntries].reverse()
  for (const entry of orderedEntries) {
    const building = buildings.find(item => item.id === entry.id)
    if (!building) continue
    const worldPos = toWorldPosition(building.position)
    points.push(new THREE.Vector3(worldPos.x, 0.4, worldPos.z))
  }

  if (points.length < 2) return

  const curve = new THREE.CatmullRomCurve3(points, false, 'chordal')
  const tubeGeometry = new THREE.TubeGeometry(curve, 64 * points.length, 0.04, 8, false)
  const material = new THREE.MeshBasicMaterial({
    color: 0xc5a35a,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })

  footprintTrailMesh = new THREE.Mesh(tubeGeometry, material)
  footprintTrailMesh.visible = activeView === 'footprint'
  trailAnimationTime = 0
  scene.add(footprintTrailMesh)
}

function renderFootprintStampCard(building) {
  const entry = footprintState.completed[building.id]
  const selected = building.id === selectedId
  const locked = entry === undefined
  const summary = locked
    ? 'Complete a full 3D reading circuit to receive this construction seal.'
    : building.summary
  return `
    <button type="button" class="footprint-stamp${selected ? ' is-selected' : ''}${locked ? ' is-locked' : ''}" data-building-id="${escapeHtml(building.id)}">
      <div class="footprint-stamp__seal">
        <p class="footprint-stamp__eyebrow">Atlas ${escapeHtml(building.catalog.number)}</p>
        <p class="footprint-stamp__english">${escapeHtml(building.stamp.componentEn)}</p>
        <h4 class="footprint-stamp__component">${escapeHtml(building.stamp.componentCn)}</h4>
      </div>
      <p class="footprint-stamp__date">${locked ? 'Awaiting seal issue' : formatCompletionDate(entry.completedAt)}</p>
      <p class="footprint-stamp__meta">${escapeHtml(building.catalog.dynasty)} / ${escapeHtml(building.name)} / ${escapeHtml(building.catalog.structure)}</p>
      <p class="footprint-stamp__summary">${escapeHtml(summary)}</p>
    </button>
  `
}

function renderFootprintSpotlight() {
  const building = buildings.find(item => item.id === selectedId) ?? buildings[0]
  const entry = footprintState.completed[building.id]
  footprintSpotlightKicker.textContent = `${building.catalog.dynasty} / ${building.catalog.yearLabel}`
  footprintSpotlightName.textContent = building.name
  footprintSpotlightStamp.textContent = entry
    ? entry.stampEn
    : `Seal pending: ${building.stamp.componentEn}`
  footprintSpotlightSummary.textContent = entry
    ? `Collected on ${formatCompletionDate(entry.completedAt)}. ${building.summary}`
    : 'This page is still blank. Read the entire monument in the 3D room and explore multiple viewing angles to issue the seal.'
  footprintOpenDetailButton.disabled = !building.modelUrl
  footprintOpenDetailButton.textContent = building.modelUrl ? (entry ? 'Re-enter 3D Detail' : 'Continue in 3D') : '3D Model Pending'
}

function syncGroupingButtons() {
  for (const button of groupButtons) {
    const active = button.dataset.groupBy === activeGrouping
    button.classList.toggle('is-active', active)
  }
}

function matchesIndexQuery(building) {
  if (!indexQuery) return true
  const haystack = [
    building.name,
    building.region,
    building.summary,
    building.catalog.dynasty,
    building.catalog.typology,
    building.catalog.structure,
  ].join(' ').toLowerCase()
  return haystack.includes(indexQuery)
}

function groupBuildings(items, config) {
  const buckets = new Map()
  for (const building of items) {
    const key = config.getValue(building)
    const list = buckets.get(key) ?? []
    list.push(building)
    buckets.set(key, list)
  }

  return [...buckets.entries()]
    .sort((left, right) => compareGroupNames(left[0], right[0], config.order))
    .map(([groupName, groupedItems]) => [groupName, [...groupedItems].sort((a, b) => a.name.localeCompare(b.name))])
}

function compareGroupNames(left, right, preferredOrder) {
  const leftIndex = preferredOrder.indexOf(left)
  const rightIndex = preferredOrder.indexOf(right)
  if (leftIndex !== -1 || rightIndex !== -1) {
    if (leftIndex === -1) return 1
    if (rightIndex === -1) return -1
    return leftIndex - rightIndex
  }
  return left.localeCompare(right)
}

function getCompletedEntries() {
  return Object.values(footprintState.completed).sort((left, right) => {
    return new Date(right.completedAt).getTime() - new Date(left.completedAt).getTime()
  })
}

function isBuildingCollected(buildingId) {
  return Boolean(footprintState.completed[buildingId])
}

function refreshFootprintState() {
  footprintState = readFootprintState()
  renderArchitecturalIndex()
  renderPersonalFootprint()
  renderDetails()
  if (indexModalOverlay.classList.contains('is-open')) {
    openIndexModal(selectedId)
  }
}

function handleFootprintMessage(event) {
  if (event.origin !== window.location.origin) return
  if (event.data?.type !== FOOTPRINT_MESSAGE_TYPE) return
  if (typeof event.data.payload?.id === 'string') {
    selectedId = event.data.payload.id
  }
  refreshFootprintState()
}

function handleFootprintStorage(event) {
  if (event.key !== FOOTPRINT_STORAGE_KEY) return
  refreshFootprintState()
}

function formatCompletionDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Seal issued'
  }

  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function showOnboarding() {
  if (localStorage.getItem(ONBOARDING_KEY) === '1') return
  onboarding.classList.add('is-visible')
}

function dismissOnboarding(options = {}) {
  if (options.remember) {
    localStorage.setItem(ONBOARDING_KEY, '1')
  }
  if (!onboarding.classList.contains('is-visible')) return
  onboarding.classList.add('is-dismissing')
  onboarding.classList.remove('is-visible')
  window.setTimeout(() => {
    onboarding.classList.remove('is-dismissing')
  }, 380)
}

function setupTouchCopy() {
  const touchCapable = window.matchMedia('(pointer: coarse)').matches
  if (!touchCapable) return
  primaryInteractionHint.textContent = 'Swipe to orbit'
  focusInteractionHint.textContent = 'Tap a beacon to focus'
  onboardingCopy.textContent = 'Swipe to orbit the 3D map. Pinch to zoom, then tap a beacon to focus.'
}

function updateFocusLight(building, world) {
  isOverview = false
  if (ambientLight) ambientLight.intensity = 0.78
  if (!focusLight || !focusTarget) return

  focusLight.color.setHex(building.accent)
  focusLight.intensity = 4.6
  focusLight.position.set(world.x + 0.45, 4.2, world.z + 0.55)
  focusTarget.position.set(world.x, 0.18, world.z)
}

function renderDetails() {
  const building = buildings.find(item => item.id === selectedId) ?? buildings[0]
  region.textContent = building.region
  name.textContent = building.name
  summary.textContent = building.summary
  detailLaunch.disabled = !building.modelUrl
  detailLaunch.textContent = building.modelUrl ? 'Enter 3D Detail' : '3D Model Pending'
  detailLaunch.title = building.modelUrl ? 'Open the 3D detail view' : `Expected model: ${building.expectedModelUrl}`
  renderFootprintSpotlight()
}

function renderPendingSite(siteName) {
  region.textContent = 'Archive point'
  name.textContent = siteName
  summary.textContent = 'A quiet reference point in the atlas. Detailed 3D documentation has not been added yet.'
  detailLaunch.disabled = true
  detailLaunch.textContent = '3D Model Pending'
  detailLaunch.title = 'This archive point does not have a 3D model yet.'
}

function openPretextDetail() {
  const building = buildings.find(item => item.id === selectedId) ?? buildings[0]
  if (!building.modelUrl) return

  const url = new URL('./index.html', window.location.href)
  url.searchParams.set('building', building.id)
  pretextFrame.setAttribute('src', url.pathname + url.search)
  pretextPortal.classList.add('is-open')
  pretextPortal.setAttribute('aria-hidden', 'false')
}

function closePretextDetail() {
  pretextPortal.classList.remove('is-open')
  pretextPortal.setAttribute('aria-hidden', 'true')
  pretextFrame.removeAttribute('src')
}

function resize() {
  const rect = stage.getBoundingClientRect()
  viewportWidth = Math.max(rect.width, 1)
  viewportHeight = Math.max(rect.height, 1)
  camera.aspect = viewportWidth / viewportHeight
  camera.updateProjectionMatrix()
  renderer.setSize(viewportWidth, viewportHeight, false)
}

function toWorldPosition(position) {
  return {
    x: (position.x / 100 - 0.5) * MAP_WIDTH,
    z: (position.y / 100 - 0.5) * MAP_HEIGHT,
  }
}

function easeInOutCubic(value) {
  return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2
}

function requireRoot(selector) {
  const element = document.querySelector(selector)
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing ${selector}`)
  }
  return element
}

function requireElement(id) {
  const element = document.getElementById(id)
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing #${id}`)
  }
  return element
}

function escapeHtml(value) {
  if (!value) return ''

  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

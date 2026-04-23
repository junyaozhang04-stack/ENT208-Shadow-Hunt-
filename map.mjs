import * as THREE from 'three'
import { ambientSites, buildings } from './building-data.mjs'

const MAP_WIDTH = 13.2
const MAP_HEIGHT = 8.6
const INTRO_MS = 2600
const CAMERA_EASE = 0.075
const POINTER_EASE = 0.16

const stage = requireElement('map-canvas-stage')
const labelLayer = requireElement('marker-label-layer')
const loadingVeil = requireElement('loading-veil')
const overviewButton = requireElement('overview-button')
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

let viewportWidth = 1
let viewportHeight = 1
let ambientLight = null
let focusLight = null
let focusTarget = null
let selectedId = buildings[0].id
let isOverview = true
let hoveredId = null
let hoveredAmbient = null
let introStart = performance.now()
let introDone = false
let dragState = null
let orbitYaw = 0
let orbitPitch = 0

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
  renderDetails()
  selectBuilding(selectedId, { immediate: true })
  resize()

  window.addEventListener('resize', resize)
  overviewButton.addEventListener('click', returnToOverview)
  detailLaunch.addEventListener('click', openPretextDetail)
  portalClose.addEventListener('click', closePretextDetail)
  renderer.domElement.addEventListener('pointermove', handlePointerMove)
  renderer.domElement.addEventListener('pointerleave', handlePointerLeave)
  renderer.domElement.addEventListener('pointerdown', handlePointerDown)
  renderer.domElement.addEventListener('pointerup', handlePointerUp)
  renderer.domElement.addEventListener('pointercancel', handlePointerUp)
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
  const texture = new THREE.TextureLoader().load('./Gemini_Generated_Image_3852yl3852yl3852.svg', () => {
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
      loadingVeil.classList.add('is-hidden')
    }
  } else {
    const orbitOffset = new THREE.Vector3(
      Math.sin(orbitYaw) * 1.8,
      Math.sin(orbitPitch) * 0.9,
      Math.cos(orbitYaw) * 0.9,
    )
    camera.position.lerp(desiredCamera.clone().add(orbitOffset), CAMERA_EASE)
    cameraTarget.lerp(desiredTarget, CAMERA_EASE)
  }

  camera.lookAt(cameraTarget)
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
    const active = selected || building.id === hoveredId
    const lift = active ? 0.22 : 0
    group.userData.lift += (lift - group.userData.lift) * POINTER_EASE
    group.position.y = group.userData.baseY + group.userData.lift + Math.sin(elapsed * 1.6 + group.position.x) * 0.014
    group.scale.setScalar(1 + group.userData.lift * 0.18)
    group.userData.symbol.children[2].rotation.z = elapsed * 0.42
    group.userData.symbol.children[3].rotation.z = -elapsed * 0.58

    const label = labels.get(building.id)
    label.classList.toggle('is-active', active)
    group.userData.aura.scale.setScalar(selected ? 1.45 + Math.sin(elapsed * 2.3) * 0.08 : active ? 1.16 : 1)
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
  const rect = renderer.domElement.getBoundingClientRect()
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1)

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
  renderer.domElement.setPointerCapture(event.pointerId)
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
  if (ambientLight) ambientLight.intensity = 1.25
  if (focusLight) focusLight.intensity = 0
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

function requireElement(id) {
  const element = document.getElementById(id)
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing #${id}`)
  }
  return element
}

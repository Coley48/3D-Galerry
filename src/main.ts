import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import featuredArtworkUrl from './assets/red-umbrella.png';
import './style.css';

type Artwork = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  position: [number, number, number];
  rotationY: number;
  featured?: boolean;
};

type Zone = {
  name: string;
  center: THREE.Vector3;
  radius: number;
  group: THREE.Group;
};

type OcclusionWall = {
  mesh: THREE.Mesh;
  axis: 'x' | 'y' | 'z';
  plane: number;
  outerSign: 1 | -1;
};

const ROOM = {
  interiorWidth: 19.6,
  interiorDepth: 17,
  wallHeight: 7,
  wallThickness: 0.32,
  trimDepth: 0.07,
  trimClearance: 0.012,
} as const;

const FRAME_DEPTH = 0.16;
const WALL_HANG_CLEARANCE = 0.02;
const WALL_HANG_OFFSET = FRAME_DEPTH / 2 + WALL_HANG_CLEARANCE;

const artworks: Artwork[] = [
  {
    id: 'red-umbrella',
    title: '雨后的红伞',
    subtitle: '原创测试作品 · 2026',
    description: '雾气把远山推到画面背后，一把红伞让潮湿的石径有了温度。',
    position: [0, 3.4, -ROOM.interiorDepth / 2 + WALL_HANG_OFFSET],
    rotationY: 0,
    featured: true,
  },
  {
    id: 'waterline',
    title: '水线',
    subtitle: '作品位预留 · 2026',
    description: '这是一个内容位。接入 CMS 后可替换为照片、视频、音频或互动作品。',
    position: [-ROOM.interiorWidth / 2 + WALL_HANG_OFFSET, 3, -1.9],
    rotationY: Math.PI / 2,
  },
  {
    id: 'mist',
    title: '雾的边界',
    subtitle: '作品位预留 · 2026',
    description: '这是一个内容位。场景将只在访客靠近展区时加载高清内容。',
    position: [ROOM.interiorWidth / 2 - WALL_HANG_OFFSET, 3, -2.2],
    rotationY: -Math.PI / 2,
  },
  {
    id: 'after-rain',
    title: '风经过以后',
    subtitle: '作品位预留 · 2026',
    description: '这是一个内容位。可扩展为系列作品、策展说明或作者访谈。',
    position: [-4.7, 1.86, 4.4],
    rotationY: -0.55,
  },
  {
    id: 'quiet-night',
    title: '静水深流',
    subtitle: '作品位预留 · 2026',
    description: '这是一个内容位。支持按需获取更高分辨率的详情图。',
    position: [4.7, 1.86, 4.4],
    rotationY: 0.55,
  },
];

const canvas = document.querySelector<HTMLCanvasElement>('#gallery-canvas');
if (!canvas) throw new Error('Gallery canvas is missing.');

const welcomePanel = document.querySelector<HTMLElement>('#welcome-panel')!;
const dialog = document.querySelector<HTMLElement>('#artwork-dialog')!;
const dialogTitle = document.querySelector<HTMLElement>('#artwork-title')!;
const dialogMeta = document.querySelector<HTMLElement>('#artwork-meta')!;
const dialogDescription = document.querySelector<HTMLElement>('#artwork-description')!;
const caption = document.querySelector<HTMLElement>('#tour-caption')!;
const enterButton = document.querySelector<HTMLButtonElement>('#enter-gallery')!;
const tourButton = document.querySelector<HTMLButtonElement>('#toggle-tour')!;
const qualityButton = document.querySelector<HTMLButtonElement>('#toggle-quality')!;
const resetButton = document.querySelector<HTMLButtonElement>('#reset-view')!;
const closeButton = document.querySelector<HTMLButtonElement>('#close-dialog')!;
const focusButton = document.querySelector<HTMLButtonElement>('#focus-artwork')!;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#111410');
scene.fog = new THREE.Fog('#111410', 16, 43);

const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 70);
const entryCamera = new THREE.Vector3(0, 2.15, 8.4);
const entryTarget = new THREE.Vector3(0, 2.1, -2.6);
camera.position.copy(entryCamera);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const controls = new OrbitControls(camera, canvas);
controls.target.copy(entryTarget);
controls.enableDamping = true;
controls.dampingFactor = 0.075;
controls.enablePan = false;
controls.minDistance = 2.6;
controls.maxDistance = 22;
controls.maxPolarAngle = Math.PI * 0.48;
controls.minPolarAngle = Math.PI * 0.19;

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const clock = new THREE.Clock();
const clickableObjects: THREE.Object3D[] = [];
const zones: Zone[] = [];
const occlusionWalls: OcclusionWall[] = [];
let activeArtwork: Artwork | undefined;
let guidedTour = false;
let qualityMode = false;
let introComplete = false;
let targetCamera: THREE.Vector3 | null = null;
let targetLookAt: THREE.Vector3 | null = null;
let imageTexture: THREE.Texture | null = null;
let singleClickTimer: number | null = null;

const galleryRoot = new THREE.Group();
scene.add(galleryRoot);

function createCanvasTexture(title: string, accent: string): THREE.CanvasTexture {
  const card = document.createElement('canvas');
  card.width = 1024;
  card.height = 1320;
  const ctx = card.getContext('2d')!;
  const bg = ctx.createLinearGradient(0, 0, 1024, 1320);
  bg.addColorStop(0, '#27312b');
  bg.addColorStop(0.52, '#17211f');
  bg.addColorStop(1, '#0f1514');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, card.width, card.height);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  ctx.strokeRect(42, 42, card.width - 84, card.height - 84);
  ctx.globalAlpha = 0.2;
  for (let x = -300; x < 1220; x += 95) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 440, card.height);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#f2eadb';
  ctx.font = '500 48px "Noto Serif SC", serif';
  ctx.fillText('作品预留', 80, 114);
  ctx.fillStyle = accent;
  ctx.font = '500 26px Inter, sans-serif';
  ctx.fillText(title.toUpperCase(), 80, 170);
  const texture = new THREE.CanvasTexture(card);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function addFrame(artwork: Artwork, texture: THREE.Texture) {
  const ratio = artwork.featured ? 0.735 : 0.79;
  const height = artwork.featured ? 4.6 : 3.15;
  const width = height * ratio;
  const isFreestanding = !artwork.featured && Math.abs(artwork.rotationY) < 1;
  const group = new THREE.Group();
  group.position.set(...artwork.position);
  group.rotation.y = artwork.rotationY;

  // 独立作品在画架上略向后靠；画架本体保持落地，避免以整体旋转造成脚部悬空。
  const frameAssembly = new THREE.Group();
  if (isFreestanding) frameAssembly.rotation.x = -0.11;
  group.add(frameAssembly);

  const borderSize = 0.14;
  const frameMaterial = new THREE.MeshStandardMaterial({ color: '#211b16', roughness: 0.32, metalness: 0.42 });
  const rails = [
    { size: [width + borderSize * 2, borderSize, FRAME_DEPTH], position: [0, height / 2 + borderSize / 2, 0] },
    { size: [width + borderSize * 2, borderSize, FRAME_DEPTH], position: [0, -height / 2 - borderSize / 2, 0] },
    { size: [borderSize, height, FRAME_DEPTH], position: [-width / 2 - borderSize / 2, 0, 0] },
    { size: [borderSize, height, FRAME_DEPTH], position: [width / 2 + borderSize / 2, 0, 0] },
  ];
  rails.forEach((rail) => {
    const frameRail = new THREE.Mesh(
      new THREE.BoxGeometry(rail.size[0], rail.size[1], rail.size[2]),
      frameMaterial,
    );
    frameRail.position.set(rail.position[0], rail.position[1], rail.position[2]);
    frameRail.castShadow = true;
    frameRail.receiveShadow = true;
    frameAssembly.add(frameRail);
  });

  const art = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, side: THREE.FrontSide }),
  );
  art.position.z = 0.006;
  art.userData.artwork = artwork;
  frameAssembly.add(art);
  clickableObjects.push(art);

  const backboard = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ color: '#faf8f0', side: THREE.BackSide }),
  );
  backboard.position.z = -0.006;
  backboard.userData.artwork = artwork;
  frameAssembly.add(backboard);
  clickableObjects.push(backboard);

  if (isFreestanding) {
    addEaselSupport(group, width, height);
  }
  return group;
}

function addEaselSupport(group: THREE.Group, width: number, height: number) {
  const supportMaterial = new THREE.MeshStandardMaterial({ color: '#b98b58', roughness: 0.62, metalness: 0.05 });
  const woodWidth = 0.12;
  const floorY = -group.position.y + 0.035;
  const topY = height / 2 + 0.46;

  const addBeam = (from: THREE.Vector3, to: THREE.Vector3, thickness = woodWidth) => {
    const direction = to.clone().sub(from);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(thickness, direction.length(), thickness), supportMaterial);
    beam.position.copy(from).add(to).multiplyScalar(0.5);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    beam.castShadow = true;
    beam.receiveShadow = true;
    group.add(beam);
  };

  // 所有支撑构件均在画框背面，前腿的前表面仍与画框留出净空，避免穿插画布。
  const frontTopLeft = new THREE.Vector3(-width * 0.12, topY, -0.4);
  const frontTopRight = new THREE.Vector3(width * 0.12, topY, -0.4);
  addBeam(frontTopLeft, new THREE.Vector3(-width * 0.44, floorY, -0.06));
  addBeam(frontTopRight, new THREE.Vector3(width * 0.44, floorY, -0.06));

  // 后腿接入顶部铰座；它的连接点低于前腿顶部，因此是较短的后支撑。
  addBeam(new THREE.Vector3(0, topY - 0.3, -0.52), new THREE.Vector3(0, floorY, -1.08));

  // 顶部横撑、画框承托横档与下部拉杆让结构既稳固又符合简易木画架的轮廓。
  const topBrace = new THREE.Mesh(new THREE.BoxGeometry(width * 0.38, woodWidth, woodWidth), supportMaterial);
  topBrace.position.set(0, topY - 0.25, -0.4);
  topBrace.castShadow = true;
  group.add(topBrace);

  // 顶部铰座覆盖前架横撑与后腿端头，消除视觉上的断开感。
  const rearHinge = new THREE.Mesh(new THREE.BoxGeometry(width * 0.22, 0.17, 0.28), supportMaterial);
  rearHinge.position.set(0, topY - 0.27, -0.46);
  rearHinge.castShadow = true;
  rearHinge.receiveShadow = true;
  group.add(rearHinge);

  const shelf = new THREE.Mesh(new THREE.BoxGeometry(width * 0.9, 0.12, 0.32), supportMaterial);
  // 横木的上表面只与画框下沿接触，不进入画框的包围体。
  // 其两端同时搭接前腿，形成完整的底部承重连接。
  shelf.position.set(0, -group.position.y + 0.085, 0);
  shelf.castShadow = true;
  shelf.receiveShadow = true;
  group.add(shelf);

  const lowerBrace = new THREE.Mesh(new THREE.BoxGeometry(width * 0.68, 0.09, 0.1), supportMaterial);
  lowerBrace.position.set(0, -height / 2 + height * 0.29, -0.2);
  lowerBrace.castShadow = true;
  group.add(lowerBrace);
}

function addArchitecture() {
  const architecture = new THREE.Group();
  galleryRoot.add(architecture);

  const halfInteriorWidth = ROOM.interiorWidth / 2;
  const halfInteriorDepth = ROOM.interiorDepth / 2;
  const outerWidth = ROOM.interiorWidth + ROOM.wallThickness * 2;
  const outerDepth = ROOM.interiorDepth + ROOM.wallThickness * 2;

  const floorMaterial = new THREE.MeshStandardMaterial({ color: '#27302a', roughness: 0.79, metalness: 0.05, transparent: true });
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM.interiorWidth, ROOM.interiorDepth),
    floorMaterial,
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  architecture.add(floor);
  occlusionWalls.push({ mesh: floor, axis: 'y', plane: 0, outerSign: -1 });

  const inlay = new THREE.Mesh(
    new THREE.RingGeometry(4.75, 4.82, 96),
    new THREE.MeshBasicMaterial({ color: '#8b7558', transparent: true, opacity: 0.72 }),
  );
  inlay.rotation.x = -Math.PI / 2;
  inlay.position.y = 0.012;
  architecture.add(inlay);

  const wallMaterial = new THREE.MeshStandardMaterial({ color: '#ded8ca', roughness: 0.88, metalness: 0.01 });
  const darkWallMaterial = new THREE.MeshStandardMaterial({ color: '#1b211d', roughness: 0.92 });
  const walls = [
    // Front and back run across the full exterior width. The side walls end exactly at
    // their interior faces, so volumes touch at edges but never overlap.
    { position: [0, ROOM.wallHeight / 2, -halfInteriorDepth - ROOM.wallThickness / 2], size: [outerWidth, ROOM.wallHeight, ROOM.wallThickness], material: wallMaterial, axis: 'z' as const, plane: -halfInteriorDepth, outerSign: -1 as const },
    { position: [-halfInteriorWidth - ROOM.wallThickness / 2, ROOM.wallHeight / 2, 0], size: [ROOM.wallThickness, ROOM.wallHeight, ROOM.interiorDepth], material: wallMaterial, axis: 'x' as const, plane: -halfInteriorWidth, outerSign: -1 as const },
    { position: [halfInteriorWidth + ROOM.wallThickness / 2, ROOM.wallHeight / 2, 0], size: [ROOM.wallThickness, ROOM.wallHeight, ROOM.interiorDepth], material: wallMaterial, axis: 'x' as const, plane: halfInteriorWidth, outerSign: 1 as const },
    { position: [0, ROOM.wallHeight / 2, halfInteriorDepth + ROOM.wallThickness / 2], size: [outerWidth, ROOM.wallHeight, ROOM.wallThickness], material: darkWallMaterial, axis: 'z' as const, plane: halfInteriorDepth, outerSign: 1 as const },
  ];
  walls.forEach((wallSpec) => {
    const material = wallSpec.material.clone();
    material.transparent = true;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(wallSpec.size[0], wallSpec.size[1], wallSpec.size[2]), material);
    wall.position.set(wallSpec.position[0], wallSpec.position[1], wallSpec.position[2]);
    wall.receiveShadow = true;
    wall.castShadow = true;
    architecture.add(wall);
    occlusionWalls.push({ mesh: wall, axis: wallSpec.axis, plane: wallSpec.plane, outerSign: wallSpec.outerSign });
  });

  const ceilingMaterial = new THREE.MeshStandardMaterial({ color: '#d5cfbf', roughness: 0.96, transparent: true });
  const ceiling = new THREE.Mesh(
    new THREE.BoxGeometry(outerWidth, ROOM.wallThickness, outerDepth),
    ceilingMaterial,
  );
  ceiling.position.set(0, ROOM.wallHeight + ROOM.wallThickness / 2, 0);
  architecture.add(ceiling);
  occlusionWalls.push({ mesh: ceiling, axis: 'y', plane: ROOM.wallHeight, outerSign: 1 });

  const plinth = new THREE.Mesh(
    new THREE.CylinderGeometry(2.25, 2.55, 0.32, 64),
    new THREE.MeshStandardMaterial({ color: '#d8cfbd', roughness: 0.62, metalness: 0.08 }),
  );
  // 雕塑移至中央展台，和右侧落地画架保持清晰的观展与移动间距。
  plinth.position.set(0, 0.16, 1.2);
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  architecture.add(plinth);

  const sculpture = new THREE.Mesh(
    new THREE.TorusKnotGeometry(0.82, 0.16, 160, 20),
    new THREE.MeshStandardMaterial({ color: '#a78255', roughness: 0.29, metalness: 0.74 }),
  );
  sculpture.position.set(0, 1.43, 1.2);
  sculpture.rotation.set(-0.2, 0.38, 0.08);
  sculpture.castShadow = true;
  architecture.add(sculpture);

  const trims = new THREE.Group();
  const trimZ = -halfInteriorDepth + ROOM.trimDepth / 2 + ROOM.trimClearance;
  for (let x = -halfInteriorWidth + 0.42; x <= halfInteriorWidth - 0.42; x += 2.35) {
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 6.6, ROOM.trimDepth),
      new THREE.MeshStandardMaterial({ color: '#b99d71', roughness: 0.35, metalness: 0.48 }),
    );
    strip.position.set(x, 3.45, trimZ);
    trims.add(strip);
  }
  architecture.add(trims);
}

function addLights() {
  scene.add(new THREE.HemisphereLight('#dae5dc', '#14150f', 1.75));

  const keyLight = new THREE.DirectionalLight('#fff4df', 2.45);
  keyLight.position.set(-4, 8, 5);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1536, 1536);
  keyLight.shadow.camera.left = -15;
  keyLight.shadow.camera.right = 15;
  keyLight.shadow.camera.top = 15;
  keyLight.shadow.camera.bottom = -15;
  scene.add(keyLight);

  const warmLight = new THREE.PointLight('#dcae73', 36, 13, 2);
  warmLight.position.set(0, 4.8, -5.6);
  scene.add(warmLight);

  artworks.forEach((artwork) => {
    const spotlight = new THREE.SpotLight(artwork.featured ? '#fff1db' : '#f7e8ce', artwork.featured ? 27 : 16, 9.5, 0.56, 0.6, 1.45);
    spotlight.position.set(artwork.position[0], 5.9, artwork.position[2] + (artwork.rotationY === Math.PI ? 2.6 : 0));
    spotlight.target.position.set(artwork.position[0], artwork.position[1], artwork.position[2]);
    scene.add(spotlight, spotlight.target);
  });
}

function addZone(name: string, center: [number, number, number], radius: number, objects: THREE.Object3D[]) {
  const group = new THREE.Group();
  objects.forEach((object) => group.add(object));
  galleryRoot.add(group);
  zones.push({ name, center: new THREE.Vector3(...center), radius, group });
}

function initialiseGallery() {
  addArchitecture();
  addLights();

  const textureLoader = new THREE.TextureLoader();
  textureLoader.load(featuredArtworkUrl, (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 6);
    imageTexture = texture;
    const featured = artworks.find((artwork) => artwork.featured)!;
    const entryArt = addFrame(featured, texture);
    addZone('主展墙', [0, 2, -6.7], 10, [entryArt]);
  });

  const placeholderWorks = artworks.filter((artwork) => !artwork.featured).map((artwork, index) => {
    const palette = ['#d9a56a', '#9bb5a7', '#c78374', '#b5a58d'];
    return addFrame(artwork, createCanvasTexture(artwork.title, palette[index]));
  });
  addZone('两翼作品区', [0, 2, 0], 17, placeholderWorks);
}

function setFocus(position: THREE.Vector3, target: THREE.Vector3) {
  targetCamera = position;
  targetLookAt = target;
}

function focusArtwork(artwork: Artwork) {
  const normal = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), artwork.rotationY);
  const point = new THREE.Vector3(...artwork.position);
  setFocus(point.clone().add(normal.multiplyScalar(5.2)).add(new THREE.Vector3(0, 0.3, 0)), point.clone().add(new THREE.Vector3(0, 0.1, 0)));
}

function openArtwork(artwork: Artwork) {
  activeArtwork = artwork;
  dialogTitle.textContent = artwork.title;
  dialogMeta.textContent = artwork.subtitle;
  dialogDescription.textContent = artwork.description;
  dialog.classList.add('is-visible');
  dialog.setAttribute('aria-hidden', 'false');
}

function closeArtwork() {
  dialog.classList.remove('is-visible');
  dialog.setAttribute('aria-hidden', 'true');
}

function resetView() {
  guidedTour = false;
  tourButton.setAttribute('aria-pressed', 'false');
  tourButton.textContent = '导览';
  closeArtwork();
  introComplete = false;
  welcomePanel.classList.remove('is-hidden');
  setFocus(entryCamera.clone(), entryTarget.clone());
  caption.textContent = '入口大厅 · 向前探索';
}

function cancelCameraAutomation() {
  const hasActiveTransition = Boolean(targetCamera || targetLookAt || guidedTour);
  if (!hasActiveTransition) return;

  targetCamera = null;
  targetLookAt = null;
  if (guidedTour) {
    guidedTour = false;
    tourButton.setAttribute('aria-pressed', 'false');
    tourButton.textContent = '导览';
  }
  caption.textContent = '自由探索中 · 拖动可环视，滚动可缩放';
}

function updateZones() {
  zones.forEach((zone) => {
    // Keep a zone alive throughout the camera's full orbit range. A pure short-distance
    // cutoff hides artworks when the visitor steps just outside a transparent room wall.
    // Production streaming should use room/portal visibility, not distance alone.
    const isNear = camera.position.distanceTo(zone.center) < zone.radius + controls.maxDistance + 4;
    zone.group.visible = isNear;
  });
}

function updateOcclusionWalls(delta: number) {
  occlusionWalls.forEach((wall) => {
    const cameraAxisPosition = wall.axis === 'x'
      ? camera.position.x
      : wall.axis === 'y'
        ? camera.position.y
        : camera.position.z;
    const exteriorDistance = (cameraAxisPosition - wall.plane) * wall.outerSign;
    const material = wall.mesh.material as THREE.MeshStandardMaterial;
    const targetOpacity = exteriorDistance > 0.01 ? 0.13 : 1;
    material.opacity = THREE.MathUtils.damp(material.opacity, targetOpacity, 11, delta);
    material.depthWrite = material.opacity > 0.94;
  });
}

function updateGuidedTour(elapsed: number) {
  if (!guidedTour) return;
  const orbit = elapsed * 0.085;
  const radius = 9.6;
  const desired = new THREE.Vector3(Math.sin(orbit) * radius, 2.7 + Math.sin(orbit * 1.8) * 0.18, Math.cos(orbit) * radius - 0.4);
  camera.position.lerp(desired, 0.011);
  controls.target.lerp(new THREE.Vector3(0, 2.1, -1.1), 0.02);
  caption.textContent = '自动导览中 · 点击“导览”可停止';
}

function updateCameraFocus() {
  if (!targetCamera || !targetLookAt) return;
  camera.position.lerp(targetCamera, 0.07);
  controls.target.lerp(targetLookAt, 0.075);
  if (camera.position.distanceToSquared(targetCamera) < 0.004 && controls.target.distanceToSquared(targetLookAt) < 0.004) {
    targetCamera = null;
    targetLookAt = null;
  }
}

function onPointerMove(event: PointerEvent) {
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(clickableObjects, false)[0];
  canvas!.style.cursor = hit ? 'pointer' : 'grab';
}

function getArtworkAtPointer(event: MouseEvent) {
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(clickableObjects, false)[0];
  return hit?.object.userData.artwork as Artwork | undefined;
}

function onCanvasClick(event: PointerEvent) {
  const artwork = getArtworkAtPointer(event);
  if (!artwork) return;
  if (singleClickTimer) window.clearTimeout(singleClickTimer);
  singleClickTimer = window.setTimeout(() => {
    openArtwork(artwork);
    singleClickTimer = null;
  }, 230);
}

function onCanvasDoubleClick(event: MouseEvent) {
  if (singleClickTimer) {
    window.clearTimeout(singleClickTimer);
    singleClickTimer = null;
  }
  const artwork = getArtworkAtPointer(event);
  if (!artwork) return;
  introComplete = true;
  welcomePanel.classList.add('is-hidden');
  closeArtwork();
  focusArtwork(artwork);
  caption.textContent = `正在聚焦 · ${artwork.title}`;
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

enterButton.addEventListener('click', () => {
  introComplete = true;
  welcomePanel.classList.add('is-hidden');
  setFocus(new THREE.Vector3(0, 2.3, 8.5), new THREE.Vector3(0, 2.1, -3.6));
  caption.textContent = '主展墙 · 点击《雨后的红伞》查看详情';
});

tourButton.addEventListener('click', () => {
  guidedTour = !guidedTour;
  tourButton.setAttribute('aria-pressed', String(guidedTour));
  tourButton.textContent = guidedTour ? '停止导览' : '导览';
  if (guidedTour) closeArtwork();
});

qualityButton.addEventListener('click', () => {
  qualityMode = !qualityMode;
  qualityButton.setAttribute('aria-pressed', String(qualityMode));
  qualityButton.textContent = qualityMode ? '高画质' : '性能模式';
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, qualityMode ? 1 : 1.75));
  renderer.shadowMap.enabled = !qualityMode;
});

resetButton.addEventListener('click', resetView);
closeButton.addEventListener('click', closeArtwork);
focusButton.addEventListener('click', () => activeArtwork && focusArtwork(activeArtwork));
controls.addEventListener('start', cancelCameraAutomation);
canvas!.addEventListener('pointermove', onPointerMove);
canvas!.addEventListener('pointerdown', cancelCameraAutomation);
canvas!.addEventListener('wheel', cancelCameraAutomation, { passive: true });
canvas!.addEventListener('click', onCanvasClick);
canvas!.addEventListener('dblclick', onCanvasDoubleClick);
window.addEventListener('resize', onResize);
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeArtwork();
});

initialiseGallery();
controls.update();

function animate() {
  const delta = clock.getDelta();
  const elapsed = clock.elapsedTime;
  if (introComplete) updateGuidedTour(elapsed);
  updateCameraFocus();
  controls.update();
  updateZones();
  updateOcclusionWalls(delta);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();

// `imageTexture` is intentionally retained by the resource layer. When a zone is unloaded in
// production, dispose its texture and material here to release GPU memory deterministically.
void imageTexture;

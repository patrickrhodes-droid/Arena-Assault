import * as THREE from "three";
import { OrbitControls }    from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { GLTFLoader }       from "three/addons/loaders/GLTFLoader.js";

// ── Default data mirrors scene.js hardcoded values ────────────────────────────
const DEFAULT_BODY = {
  torso:     { pos: [0,  1.2,   0], size: [0.70, 0.80, 0.40] },
  headGroup: { posY: 1.9 },
  visor:     { pos: [0,  1.92, -0.18], size: [0.30, 0.12, 0.02] },
  leftArm:   { pos: [-0.55, 1.3, 0], size: [0.20, 0.65, 0.20] },
  rightArm:  { pos: [ 0.55, 1.3, 0], size: [0.20, 0.65, 0.20] },
  leftLeg:   { pos: [-0.20, 0.4, 0], size: [0.25, 0.70, 0.25] },
  rightLeg:  { pos: [ 0.20, 0.4, 0], size: [0.25, 0.70, 0.25] },
  leftBoot:  { pos: [-0.20, 0.08, 0], size: [0.28, 0.16, 0.35] },
  rightBoot: { pos: [ 0.20, 0.08, 0], size: [0.28, 0.16, 0.35] },
};

const DEFAULT_CHARS = {
  iestyn:  { headScale: 1, headRotY: 0 },
  patrick: { headScale: 1, headRotY: 0 },
  will:    { headScale: 1, headRotY: 0 },
  matt:    { headScale: 1, headRotY: 0 },
};

const DEFAULT_WEAPONS = {
  pistol:  { fpPos:[0.22,-0.24,-0.42], fpAdsPos:[0.01,-0.12,-0.34], fpScale:[0.8,0.8,0.72],  tpPos:[0.48,1.3,-0.22],  tpScale:[0.8,0.8,0.7],  tpMuzzleZ:-0.38, fpMuzzleZ:-0.38, glbScale:0.125, glbRotY:0,           glbPosY:0,    glbPosZ:0   },
  assault: { fpPos:[0.25,-0.20,-0.50], fpAdsPos:[0.02,-0.10,-0.36], fpScale:[1,1,1],          tpPos:[0.50,1.35,-0.30], tpScale:[1,1,1],         tpMuzzleZ:-0.60, fpMuzzleZ:-0.60, glbScale:0.125, glbRotY:0,           glbPosY:0,    glbPosZ:0   },
  shotgun: { fpPos:[0.28,-0.18,-0.58], fpAdsPos:[0.00,-0.08,-0.35], fpScale:[1.3,1.08,1.02], tpPos:[0.54,1.32,-0.28], tpScale:[1.28,1.1,0.95], tpMuzzleZ:-0.74, fpMuzzleZ:-0.74, glbScale:0.125, glbRotY:1.5708,      glbPosY:0,    glbPosZ:0.4 },
  sniper:  { fpPos:[0.20,-0.15,-0.72], fpAdsPos:[0.00,-0.09,-0.28], fpScale:[0.92,0.95,1.85], tpPos:[0.56,1.38,-0.36], tpScale:[0.9,0.95,1.8],  tpMuzzleZ:-0.88, fpMuzzleZ:-0.88, glbScale:0.125, glbRotY:1.5708,      glbPosY:0,    glbPosZ:0.4 },
  sword:   { fpPos:[0.40,-0.40,-0.60], fpAdsPos:[0.10,-0.20,-0.50], fpScale:[1,1,1],          tpPos:[0.50,1.20,-0.20], tpScale:[1,1,1],         tpMuzzleZ:-0.20, fpMuzzleZ:0,     glbScale:0.16,  glbRotY:3.14159,     glbPosY:-0.6, glbPosZ:0   },
  bazooka: { fpPos:[0.18,-0.16,-0.38], fpAdsPos:[0.00,-0.08,-0.30], fpScale:[1,1,1],          tpPos:[0.55,1.32,-0.32], tpScale:[1,1,1],         tpMuzzleZ:-0.75, fpMuzzleZ:-0.75, glbScale:0.38,  glbRotY:0,           glbPosY:0,    glbPosZ:0   },
  grapple: { fpPos:[0.22,-0.24,-0.42], fpAdsPos:[0.01,-0.12,-0.34], fpScale:[0.8,0.8,0.72],  tpPos:[0.48,1.30,-0.22], tpScale:[0.8,0.8,0.7],  tpMuzzleZ:-0.38, fpMuzzleZ:-0.38, glbScale:0.375, glbRotY:1.5708,      glbPosY:0,    glbPosZ:0   },
  minigun: { fpPos:[0.25,-0.20,-0.50], fpAdsPos:[0.02,-0.10,-0.36], fpScale:[1,1,1],          tpPos:[0.50,1.35,-0.30], tpScale:[1,1,1],         tpMuzzleZ:-0.70, fpMuzzleZ:-0.70, glbScale:0.28,  glbRotY:3.14159,     glbPosY:0,    glbPosZ:0   },
};

const WEAPON_GLB_FILES = {
  pistol:  '/assets/models/Pistol.glb',
  assault: '/assets/models/Assault Rifle.glb',
  shotgun: '/assets/models/Shotgun.glb',
  sniper:  '/assets/models/Sniper Rifle.glb',
  sword:   '/assets/models/Katana.glb',
  bazooka: '/assets/models/Bazooka.glb',
  grapple: '/assets/models/Lure.glb',
  minigun: '/assets/models/gatling_gun.glb',
};

const HEAD_GLB_FILES = {
  iestyn:  '/assets/models/iestynhead.glb',
  patrick: '/assets/models/PatrickHead.glb',
  will:    '/assets/models/WillHead.glb',
};

const HEAD_FALLBACK_COLORS = { iestyn: 0xff5544, patrick: 0x55aaff, will: 0x66dd66, matt: 0xffcc33 };

// ── State ─────────────────────────────────────────────────────────────────────
const st = {
  tab:         'character',   // 'character' | 'weapon'
  character:   'iestyn',
  weapon:      'pistol',
  weaponView:  'fp',          // 'fp' | 'tp'
  adsMode:     'idle',        // 'idle' | 'ads'
  selectedPart: null,         // mesh or group
  selectedPartKey: null,      // string key
  animating:   false,
  walkTime:    0,
  // Deep-copy of overrides; written to on change, saved to server on save
  body:        JSON.parse(JSON.stringify(DEFAULT_BODY)),
  chars:       JSON.parse(JSON.stringify(DEFAULT_CHARS)),
  weapons:     JSON.parse(JSON.stringify(DEFAULT_WEAPONS)),
  glbCache:    new Map(),
};

// ── Three.js setup ────────────────────────────────────────────────────────────
const canvas    = document.getElementById('viewport');
const renderer  = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.8;

const scene  = new THREE.Scene();
scene.background = new THREE.Color(0x3a4554);
scene.fog = new THREE.FogExp2(0x3a4554, 0.008);

const camera = new THREE.PerspectiveCamera(58, 1, 0.05, 120);
camera.position.set(0, 2.2, 5);
camera.rotation.order = 'YXZ';

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.target.set(0, 1.2, 0);
orbit.enableDamping = true;
orbit.dampingFactor = 0.08;

const transform = new TransformControls(camera, renderer.domElement);
transform.setTranslationSnap(0.01);
transform.setRotationSnap(THREE.MathUtils.degToRad(5));
transform.setScaleSnap(0.05);
scene.add(transform);

const gltfLoader = new GLTFLoader();

// Lighting
scene.add(new THREE.HemisphereLight(0xd8e4ff, 0x55624c, 1.8));
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const sun = new THREE.DirectionalLight(0xffffff, 3.2);
sun.position.set(3, 8, 4);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
scene.add(sun);
const fillLight = new THREE.DirectionalLight(0xaac6ff, 1.4);
fillLight.position.set(-3, 2, -3);
scene.add(fillLight);
const backLight = new THREE.DirectionalLight(0xffffff, 1.0);
backLight.position.set(0, 4, -6);
scene.add(backLight);

// Floor grid
const grid = new THREE.GridHelper(10, 20, 0x2a3444, 0x1e2830);
scene.add(grid);
const floorMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(10, 10),
  new THREE.MeshStandardMaterial({ color: 0x1a2228, roughness: 0.95 }),
);
floorMesh.rotation.x = -Math.PI / 2;
floorMesh.receiveShadow = true;
scene.add(floorMesh);

// Axes helper (hidden by default)
const axesHelper = new THREE.AxesHelper(1.5);
axesHelper.visible = false;
scene.add(axesHelper);

// FPS viewmodel camera (used in weapon FP mode)
const fpsCamera = new THREE.PerspectiveCamera(70, 1, 0.01, 60);
fpsCamera.rotation.order = 'YXZ';
scene.add(fpsCamera);

// ── Character rig scene objects ────────────────────────────────────────────────
const rig = {
  group:       null,
  torso:       null,
  headGroup:   null,
  visor:       null,
  leftArm:     null,
  rightArm:    null,
  leftLeg:     null,
  rightLeg:    null,
  leftBoot:    null,
  rightBoot:   null,
};

const bodyMat  = new THREE.MeshStandardMaterial({ color: 0x3a4a30, roughness: 0.8 });
const legMat   = new THREE.MeshStandardMaterial({ color: 0x2a3820, roughness: 0.85 });
const bootMat  = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
const visorMat = new THREE.MeshStandardMaterial({ color: 0x00ccaa, emissive: 0x00ccaa, emissiveIntensity: 1.2 });

// Weapon scene objects
const weaponRig = {
  fpGroup:  null,
  tpGroup:  null,
  fpMuzzle: null,
  tpMuzzle: null,
};

let _weaponScene = null; // root group for weapon mode

// ── DOM helpers ───────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const els = {
  statusText:   $('status-text'),
  selName:      $('sel-name'),
  selInfo:      $('sel-info'),
  charSelect:   $('char-select'),
  weaponSelect: $('weapon-select'),
  animToggle:   $('anim-toggle'),
  axesToggle:   $('show-axes-toggle'),
  snapToggle:   $('snap-toggle'),
  saveConfig:   $('save-config'),
  copyConfig:   $('copy-config'),
  resetConfig:  $('reset-config'),
  saveStatus:   $('save-status'),
  headControls: $('head-controls'),
  headScale:    $('head-scale'),
  headRotY:     $('head-rot-y'),
  weaponPosCtrl: $('weapon-pos-controls'),
  jsonOut:      $('json-out'),
};

function setStatus(msg) { els.statusText.textContent = msg; }

// ── Build character rig ────────────────────────────────────────────────────────
function makeBox(w, h, d, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function buildRig() {
  if (rig.group) {
    scene.remove(rig.group);
    rig.group.traverse((c) => { c.geometry?.dispose(); });
  }

  const Y = -0.06;
  const b = st.body;
  const ch = st.chars[st.character] || {};

  rig.group = new THREE.Group();

  const torso    = makeBox(...b.torso.size,    bodyMat);
  const leftArm  = makeBox(...b.leftArm.size,  bodyMat);
  const rightArm = makeBox(...b.rightArm.size, bodyMat);
  const leftLeg  = makeBox(...b.leftLeg.size,  legMat);
  const rightLeg = makeBox(...b.rightLeg.size, legMat);
  const leftBoot = makeBox(...b.leftBoot.size, bootMat);
  const rightBoot= makeBox(...b.rightBoot.size,bootMat);
  const visor    = makeBox(...b.visor.size,    visorMat);

  torso.position.set(    b.torso.pos[0],     b.torso.pos[1]+Y,     b.torso.pos[2]);
  leftArm.position.set(  b.leftArm.pos[0],  b.leftArm.pos[1]+Y,  b.leftArm.pos[2]);
  rightArm.position.set( b.rightArm.pos[0], b.rightArm.pos[1]+Y, b.rightArm.pos[2]);
  leftLeg.position.set(  b.leftLeg.pos[0],  b.leftLeg.pos[1]+Y,  b.leftLeg.pos[2]);
  rightLeg.position.set( b.rightLeg.pos[0], b.rightLeg.pos[1]+Y, b.rightLeg.pos[2]);
  leftBoot.position.set( b.leftBoot.pos[0], b.leftBoot.pos[1]+Y, b.leftBoot.pos[2]);
  rightBoot.position.set(b.rightBoot.pos[0],b.rightBoot.pos[1]+Y,b.rightBoot.pos[2]);
  visor.position.set(    b.visor.pos[0],    b.visor.pos[1]+Y,    b.visor.pos[2]);

  const headGroup = new THREE.Group();
  headGroup.position.y = (b.headGroup.posY || 1.9) + Y;

  rig.group.add(torso, leftArm, rightArm, leftLeg, rightLeg, leftBoot, rightBoot, visor, headGroup);
  scene.add(rig.group);

  Object.assign(rig, { torso, headGroup, visor, leftArm, rightArm, leftLeg, rightLeg, leftBoot, rightBoot });

  // Register selectRoot on each mesh
  [torso, leftArm, rightArm, leftLeg, rightLeg, leftBoot, rightBoot, visor].forEach((m) => {
    m.traverse((n) => { n.userData.selectRoot = m; });
  });
  headGroup.traverse((n) => { n.userData.selectRoot = headGroup; });

  applyHeadModel(st.character);
}

function applyHeadModel(characterId) {
  const hg = rig.headGroup;
  if (!hg) return;
  while (hg.children.length) {
    const c = hg.children[0];
    hg.remove(c);
    c.geometry?.dispose();
    if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
    else c.material?.dispose();
  }

  const ch = st.chars[characterId] || {};
  const headScale = ch.headScale ?? 1;
  const headRotY  = THREE.MathUtils.degToRad(ch.headRotY ?? 0);

  const file = HEAD_GLB_FILES[characterId];
  if (file) {
    loadGlb(file).then((gltf) => {
      const model = gltf.scene.clone(true);
      model.rotation.y = headRotY;
      const bbox = new THREE.Box3().setFromObject(model);
      const dims = new THREE.Vector3(); bbox.getSize(dims);
      const largestAxis = Math.max(dims.x, dims.y, dims.z) || 1;
      const s = (0.5 * headScale * 1.6) / largestAxis;
      model.scale.setScalar(s);
      const center = new THREE.Vector3(); bbox.getCenter(center);
      model.position.sub(center.multiplyScalar(s));
      model.traverse((n) => {
        if (n.isMesh) { n.castShadow = true; n.userData.selectRoot = hg; }
      });
      hg.add(model);
    });
  } else {
    const sz = 0.35 * headScale;
    const m = makeBox(sz, sz, sz, new THREE.MeshStandardMaterial({ color: HEAD_FALLBACK_COLORS[characterId] || 0xaaaaaa, roughness: 0.7 }));
    m.userData.selectRoot = hg;
    hg.add(m);
  }
}

// ── Build weapon rig ──────────────────────────────────────────────────────────
function buildWeaponRig(weaponId) {
  // Clear previous fps-camera children (fpGroup from last call)
  while (fpsCamera.children.length > 0) {
    const c = fpsCamera.children[0];
    fpsCamera.remove(c);
    c.traverse((n) => { n.geometry?.dispose(); });
  }
  if (_weaponScene) {
    scene.remove(_weaponScene);
    _weaponScene.traverse((c) => { c.geometry?.dispose(); });
  }

  _weaponScene = new THREE.Group();
  scene.add(_weaponScene);

  const wd = st.weapons[weaponId];

  // FPS group — child of fpsCamera
  const fpGroup = new THREE.Group();
  fpsCamera.add(fpGroup);
  fpGroup.position.fromArray(st.adsMode === 'ads' ? wd.fpAdsPos : wd.fpPos);
  fpGroup.scale.fromArray(wd.fpScale);

  const fpMuzzle = new THREE.Object3D();
  fpMuzzle.position.z = wd.fpMuzzleZ;
  fpGroup.add(fpMuzzle);

  // FPS muzzle helper sphere
  const muzzleSphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.015, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xff4400, emissive: 0xff4400, emissiveIntensity: 1 }),
  );
  fpMuzzle.add(muzzleSphere);

  // TP group — in world space at tpPos
  const tpGroup = new THREE.Group();
  tpGroup.position.fromArray(wd.tpPos);
  tpGroup.scale.fromArray(wd.tpScale);
  _weaponScene.add(tpGroup);

  const tpMuzzle = new THREE.Object3D();
  tpMuzzle.position.z = wd.tpMuzzleZ;
  tpGroup.add(tpMuzzle);

  Object.assign(weaponRig, { fpGroup, tpGroup, fpMuzzle, tpMuzzle });

  // Register select roots
  fpGroup.traverse((n) => { n.userData.selectRoot = fpGroup; });
  tpGroup.traverse((n) => { n.userData.selectRoot = tpGroup; });

  // Load GLB into both groups
  const file = WEAPON_GLB_FILES[weaponId];
  if (file) {
    loadGlb(file).then((gltf) => {
      const fpCopy = gltf.scene.clone(true);
      fpCopy.scale.setScalar(wd.glbScale);
      fpCopy.rotation.y = wd.glbRotY;
      fpCopy.position.set(0, wd.glbPosY, wd.glbPosZ);
      fpCopy.traverse((n) => { if (n.isMesh) { n.castShadow = true; n.userData.selectRoot = fpGroup; } });
      fpGroup.add(fpCopy);

      const tpCopy = gltf.scene.clone(true);
      tpCopy.scale.setScalar(wd.glbScale);
      tpCopy.rotation.y = wd.glbRotY;
      tpCopy.position.set(0, wd.glbPosY, wd.glbPosZ);
      tpCopy.traverse((n) => { if (n.isMesh) { n.castShadow = true; n.userData.selectRoot = tpGroup; } });
      tpGroup.add(tpCopy);
    });
  }

  // Character silhouette for TP context
  if (st.weaponView === 'tp') {
    buildRig(); // show character with weapon
  }

  updateWeaponViewMode();
}

function updateWeaponViewMode() {
  const isFP = st.weaponView === 'fp';
  // In FP mode: camera locked at origin, weapon attached to fpsCamera
  // In TP mode: standard orbit camera
  if (isFP) {
    camera.position.set(0, 0, 0);
    camera.rotation.set(0, 0, 0);
    orbit.enabled = false;
    if (rig.group) rig.group.visible = false;
    if (weaponRig.fpGroup) weaponRig.fpGroup.visible = true;
    if (weaponRig.tpGroup) weaponRig.tpGroup.visible = false;
  } else {
    orbit.target.set(0.5, 1.35, 0);
    orbit.enabled = true;
    if (rig.group) rig.group.visible = true;
    if (weaponRig.fpGroup) weaponRig.fpGroup.visible = false;
    if (weaponRig.tpGroup) weaponRig.tpGroup.visible = true;
  }
}

// ── GLB cache ─────────────────────────────────────────────────────────────────
function loadGlb(file) {
  if (st.glbCache.has(file)) return Promise.resolve(st.glbCache.get(file));
  return new Promise((resolve, reject) => {
    gltfLoader.load(file, (gltf) => {
      st.glbCache.set(file, gltf);
      resolve(gltf);
    }, undefined, reject);
  });
}

// ── Selection ─────────────────────────────────────────────────────────────────
const PART_KEY_MAP = {
  torso:     'torso',
  headGroup: 'headGroup',
  visor:     'visor',
  leftArm:   'leftArm',
  rightArm:  'rightArm',
  leftLeg:   'leftLeg',
  rightLeg:  'rightLeg',
  leftBoot:  'leftBoot',
  rightBoot: 'rightBoot',
};

function selectPart(mesh, key) {
  st.selectedPart    = mesh;
  st.selectedPartKey = key;
  transform.detach();
  if (mesh) transform.attach(mesh);
  refreshPartList();
  refreshInspector();
}

function selectPartByKey(key) {
  const mesh = rig[key] || weaponRig[key] || null;
  selectPart(mesh, key);
}

function refreshPartList() {
  document.querySelectorAll('.part-row[data-part]').forEach((row) => {
    row.classList.toggle('selected', row.dataset.part === st.selectedPartKey);
  });
  document.querySelectorAll('.part-row[data-wpart]').forEach((row) => {
    row.classList.toggle('selected', row.dataset.wpart === st.selectedPartKey);
  });
}

// ── Inspector ─────────────────────────────────────────────────────────────────
function r(v) { return Math.round(v * 10000) / 10000; }
function deg(rad) { return Math.round(THREE.MathUtils.radToDeg(rad) * 100) / 100; }

function refreshInspector() {
  const mesh = st.selectedPart;
  els.selName.textContent = st.selectedPartKey || '—';
  els.selInfo.textContent = '';

  // Character head special controls
  const isHead = st.tab === 'character' && st.selectedPartKey === 'headGroup';
  els.headControls.style.display = isHead ? '' : 'none';
  if (isHead) {
    const ch = st.chars[st.character];
    els.headScale.value = ch.headScale ?? 1;
    els.headRotY.value  = ch.headRotY  ?? 0;
  }

  // Weapon position controls shown when in weapon tab
  els.weaponPosCtrl.style.display = st.tab === 'weapon' ? '' : 'none';
  if (st.tab === 'weapon') {
    refreshWeaponInspector();
  }

  if (!mesh) {
    ['px','py','pz','rx','ry','rz','sx','sy','sz'].forEach((f) => {
      const el = document.querySelector(`[data-field="${f}"]`);
      if (el) el.value = '';
    });
    return;
  }

  // Position
  setField('px', r(mesh.position.x));
  setField('py', r(mesh.position.y));
  setField('pz', r(mesh.position.z));
  // Rotation
  setField('rx', deg(mesh.rotation.x));
  setField('ry', deg(mesh.rotation.y));
  setField('rz', deg(mesh.rotation.z));
  // Scale / size
  const key = st.selectedPartKey;
  if (key && key !== 'headGroup' && st.body[key]?.size) {
    const sz = st.body[key].size;
    setField('sx', sz[0]);
    setField('sy', sz[1]);
    setField('sz', sz[2]);
  } else {
    setField('sx', r(mesh.scale.x));
    setField('sy', r(mesh.scale.y));
    setField('sz', r(mesh.scale.z));
  }
}

function refreshWeaponInspector() {
  const wd = st.weapons[st.weapon];
  if (!wd) return;
  const setW = (field, val) => {
    const el = document.querySelector(`[data-wfield="${field}"]`);
    if (el) el.value = r(val);
  };
  ['0','1','2'].forEach((i) => {
    setW(`fpPos.${i}`,    wd.fpPos?.[i]    ?? 0);
    setW(`fpAdsPos.${i}`, wd.fpAdsPos?.[i] ?? 0);
    setW(`fpScale.${i}`,  wd.fpScale?.[i]  ?? 1);
    setW(`tpPos.${i}`,    wd.tpPos?.[i]    ?? 0);
    setW(`tpScale.${i}`,  wd.tpScale?.[i]  ?? 1);
  });
  setW('glbScale', wd.glbScale ?? 0.125);
  setW('glbRotY',  deg(wd.glbRotY ?? 0));
  setW('glbPosY',  wd.glbPosY ?? 0);
  setW('glbPosZ',  wd.glbPosZ ?? 0);
}

function setField(name, val) {
  const el = document.querySelector(`[data-field="${name}"]`);
  if (el && document.activeElement !== el) el.value = val;
}

// ── TransformControls ↔ data sync ─────────────────────────────────────────────
transform.addEventListener('dragging-changed', (e) => { orbit.enabled = !e.value; });

transform.addEventListener('objectChange', () => {
  const mesh = st.selectedPart;
  const key  = st.selectedPartKey;
  if (!mesh || !key) return;

  if (transform.getMode() === 'scale') {
    // Bake scale into size data, reset mesh scale
    if (st.tab === 'character' && st.body[key]?.size) {
      const sz = st.body[key].size;
      sz[0] = Math.max(0.001, r(sz[0] * mesh.scale.x));
      sz[1] = Math.max(0.001, r(sz[1] * mesh.scale.y));
      sz[2] = Math.max(0.001, r(sz[2] * mesh.scale.z));
      mesh.scale.set(1, 1, 1);
      // Rebuild geometry
      const newGeo = new THREE.BoxGeometry(sz[0], sz[1], sz[2]);
      mesh.geometry.dispose();
      mesh.geometry = newGeo;
    }
  }

  // Sync position back to data
  if (st.tab === 'character') {
    const Y = -0.06;
    if (key === 'headGroup') {
      st.body.headGroup.posY = r(mesh.position.y - Y);
    } else if (st.body[key]) {
      st.body[key].pos = [r(mesh.position.x), r(mesh.position.y - Y), r(mesh.position.z)];
    }
  } else if (st.tab === 'weapon') {
    syncWeaponFromMesh(key, mesh);
  }

  refreshInspector();
  updateJsonOut();
});

function syncWeaponFromMesh(key, mesh) {
  const wd = st.weapons[st.weapon];
  if (!wd) return;
  if (key === 'fpGroup') {
    if (st.adsMode === 'idle') wd.fpPos    = [r(mesh.position.x), r(mesh.position.y), r(mesh.position.z)];
    else                       wd.fpAdsPos = [r(mesh.position.x), r(mesh.position.y), r(mesh.position.z)];
    wd.fpScale = [r(mesh.scale.x), r(mesh.scale.y), r(mesh.scale.z)];
  } else if (key === 'tpGroup') {
    wd.tpPos   = [r(mesh.position.x), r(mesh.position.y), r(mesh.position.z)];
    wd.tpScale = [r(mesh.scale.x), r(mesh.scale.y), r(mesh.scale.z)];
  } else if (key === 'fpMuzzle') {
    wd.fpMuzzleZ = r(mesh.position.z);
  } else if (key === 'tpMuzzle') {
    wd.tpMuzzleZ = r(mesh.position.z);
  }
}

// ── Inspector field changes ────────────────────────────────────────────────────
function onFieldChange(event) {
  const el = event.target;
  const field = el.dataset.field;
  const wfield = el.dataset.wfield;
  if (!field && !wfield) return;

  const val = parseFloat(el.value);
  if (isNaN(val)) return;

  if (field) {
    handleCharFieldChange(field, val);
  } else if (wfield) {
    handleWeaponFieldChange(wfield, val);
  }

  refreshInspector();
  updateJsonOut();
}

function handleCharFieldChange(field, val) {
  const mesh = st.selectedPart;
  const key  = st.selectedPartKey;
  const Y = -0.06;

  if (!mesh) return;

  if (field === 'px') { mesh.position.x = val; if (key && st.body[key]?.pos) st.body[key].pos[0] = val; }
  else if (field === 'py') {
    mesh.position.y = val;
    if (key === 'headGroup') st.body.headGroup.posY = val - Y;
    else if (key && st.body[key]?.pos) st.body[key].pos[1] = val - Y;
  }
  else if (field === 'pz') { mesh.position.z = val; if (key && st.body[key]?.pos) st.body[key].pos[2] = val; }
  else if (field === 'rx') { mesh.rotation.x = THREE.MathUtils.degToRad(val); }
  else if (field === 'ry') { mesh.rotation.y = THREE.MathUtils.degToRad(val); }
  else if (field === 'rz') { mesh.rotation.z = THREE.MathUtils.degToRad(val); }
  else if (['sx','sy','sz'].includes(field)) {
    const idx = { sx:0, sy:1, sz:2 }[field];
    if (key && st.body[key]?.size) {
      st.body[key].size[idx] = Math.max(0.001, val);
      const sz = st.body[key].size;
      const newGeo = new THREE.BoxGeometry(sz[0], sz[1], sz[2]);
      mesh.geometry.dispose();
      mesh.geometry = newGeo;
    } else if (st.tab === 'weapon') {
      // Weapon parts are Groups (no geometry) — scale the group itself.
      const axis = field[1]; // 'x' | 'y' | 'z'
      mesh.scale[axis] = Math.max(0.001, val);
    }
  }
  // The Selected: Position/Scale inputs only touch the mesh by default. For
  // weapon parts the underlying data lives in st.weapons[id], so push the
  // change there too — otherwise saving and toggling Idle/ADS reverts it.
  if (st.tab === 'weapon' && key) {
    syncWeaponFromMesh(key, mesh);
  }
  transform.detach();
  transform.attach(mesh);
}

function handleWeaponFieldChange(wfield, val) {
  const wd = st.weapons[st.weapon];
  if (!wd) return;
  const [prop, idx] = wfield.split('.');
  if (idx !== undefined) {
    wd[prop] ||= [0,0,0];
    // Uniform-scale checkbox: when ticked, editing any axis of fpScale/tpScale
    // mirrors the value across all three axes.
    const uniformCb = document.querySelector(`input[data-uniform="${prop}"]`);
    if (uniformCb?.checked && (prop === 'fpScale' || prop === 'tpScale')) {
      wd[prop][0] = val;
      wd[prop][1] = val;
      wd[prop][2] = val;
    } else {
      wd[prop][parseInt(idx)] = val;
    }
  } else {
    if (prop === 'glbRotY') val = THREE.MathUtils.degToRad(val);
    wd[prop] = val;
  }
  // Rebuild weapon with new data
  buildWeaponRig(st.weapon);
  selectPartByKey(st.selectedPartKey);
}

// Head-specific controls
els.headScale?.addEventListener('input', () => {
  const v = parseFloat(els.headScale.value);
  if (isNaN(v)) return;
  st.chars[st.character].headScale = v;
  applyHeadModel(st.character);
  updateJsonOut();
});

els.headRotY?.addEventListener('input', () => {
  const v = parseFloat(els.headRotY.value);
  if (isNaN(v)) return;
  st.chars[st.character].headRotY = v;
  applyHeadModel(st.character);
  updateJsonOut();
});

// ── Raycasting for viewport clicks ────────────────────────────────────────────
const raycaster = new THREE.Raycaster();
const pointer   = new THREE.Vector2();

canvas.addEventListener('pointerdown', (e) => {
  if (e.target !== canvas || transform.dragging) return;
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width)  *  2 - 1;
  pointer.y = ((e.clientY - rect.top)  / rect.height) * -2 + 1;

  const useCam = (st.tab === 'weapon' && st.weaponView === 'fp') ? fpsCamera : camera;
  raycaster.setFromCamera(pointer, useCam);

  const pickTargets = [];
  if (st.tab === 'character' && rig.group) {
    rig.group.traverse((n) => { if (n.isMesh) pickTargets.push(n); });
  } else if (st.tab === 'weapon') {
    const grp = st.weaponView === 'fp' ? weaponRig.fpGroup : weaponRig.tpGroup;
    if (grp) grp.traverse((n) => { if (n.isMesh) pickTargets.push(n); });
  }

  const hits = raycaster.intersectObjects(pickTargets, false);
  if (hits.length > 0) {
    const root = hits[0].object.userData.selectRoot || hits[0].object;
    // Find which rig key this mesh belongs to
    let foundKey = null;
    for (const [k, m] of Object.entries(rig)) {
      if (m === root) { foundKey = k; break; }
    }
    if (!foundKey) {
      for (const [k, m] of Object.entries(weaponRig)) {
        if (m === root || root?.parent === m) { foundKey = k; break; }
      }
    }
    if (foundKey) selectPart(root, foundKey);
  }
});

// ── Tabs ──────────────────────────────────────────────────────────────────────
function switchTab(tab) {
  st.tab = tab;
  document.querySelectorAll('.tab-btn[data-tab]').forEach((b) => {
    b.classList.toggle('selected', b.dataset.tab === tab);
  });
  $('tab-character').style.display = tab === 'character' ? '' : 'none';
  $('tab-weapon').style.display    = tab === 'weapon'    ? '' : 'none';

  selectPart(null, null);

  if (tab === 'character') {
    orbit.target.set(0, 1.2, 0);
    orbit.enabled = true;
    buildRig();
    if (_weaponScene) { scene.remove(_weaponScene); _weaponScene = null; }
    while (fpsCamera.children.length > 0) fpsCamera.remove(fpsCamera.children[0]);
  } else {
    buildWeaponRig(st.weapon);
  }

  refreshInspector();
  updateJsonOut();
}

document.querySelectorAll('.tab-btn[data-tab]').forEach((b) => {
  b.addEventListener('click', () => switchTab(b.dataset.tab));
});

// ── View mode (FP/TP) for weapons ─────────────────────────────────────────────
document.querySelectorAll('.tab-btn[data-view]').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn[data-view]').forEach((x) => {
      x.classList.toggle('selected', x === b);
    });
    st.weaponView = b.dataset.view;
    buildWeaponRig(st.weapon);
    selectPart(null, null);
  });
});

document.querySelectorAll('.tab-btn[data-ads]').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn[data-ads]').forEach((x) => {
      x.classList.toggle('selected', x === b);
    });
    st.adsMode = b.dataset.ads;
    if (weaponRig.fpGroup) {
      const wd = st.weapons[st.weapon];
      weaponRig.fpGroup.position.fromArray(st.adsMode === 'ads' ? wd.fpAdsPos : wd.fpPos);
    }
    refreshInspector();
  });
});

// ── Transform mode buttons ─────────────────────────────────────────────────────
document.querySelectorAll('[data-mode]').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelectorAll('[data-mode]').forEach((x) => {
      x.classList.toggle('selected', x === b);
    });
    transform.setMode(b.dataset.mode);
  });
});

// Snap toggle
els.snapToggle?.addEventListener('change', () => {
  const on = els.snapToggle.checked;
  transform.setTranslationSnap(on ? 0.01 : null);
  transform.setRotationSnap(on ? THREE.MathUtils.degToRad(5) : null);
  transform.setScaleSnap(on ? 0.05 : null);
});

// ── Character / weapon selectors ──────────────────────────────────────────────
els.charSelect?.addEventListener('change', () => {
  st.character = els.charSelect.value;
  buildRig();
  selectPart(null, null);
  refreshInspector();
  updateJsonOut();
});

els.weaponSelect?.addEventListener('change', () => {
  st.weapon = els.weaponSelect.value;
  buildWeaponRig(st.weapon);
  selectPart(null, null);
  refreshInspector();
  updateJsonOut();
});

// ── Part list clicks ───────────────────────────────────────────────────────────
document.querySelectorAll('.part-row[data-part]').forEach((row) => {
  row.addEventListener('click', () => selectPartByKey(row.dataset.part));
});
document.querySelectorAll('.part-row[data-wpart]').forEach((row) => {
  row.addEventListener('click', () => selectPartByKey(row.dataset.wpart));
});

// ── Inspector field listeners ─────────────────────────────────────────────────
document.querySelectorAll('[data-field], [data-wfield]').forEach((el) => {
  el.addEventListener('change', onFieldChange);
  el.addEventListener('input',  onFieldChange);
});

// ── Animation toggle ───────────────────────────────────────────────────────────
els.animToggle?.addEventListener('change', () => {
  st.animating = els.animToggle.checked;
  if (!st.animating) {
    ['leftLeg','rightLeg','leftArm','rightArm'].forEach((k) => {
      if (rig[k]) rig[k].rotation.x = 0;
    });
    if (rig.torso) rig.torso.position.y = st.body.torso.pos[1] - 0.06;
  }
});

// ── Axes toggle ────────────────────────────────────────────────────────────────
els.axesToggle?.addEventListener('change', () => {
  axesHelper.visible = els.axesToggle.checked;
});

// ── Save/Copy/Reset ────────────────────────────────────────────────────────────
function buildConfigJson() {
  return {
    version: 1,
    characters: st.chars,
    playerBody:  st.body,
    weapons:     st.weapons,
    weaponGlbs: Object.fromEntries(
      Object.entries(st.weapons).map(([k, w]) => [k, {
        scale: w.glbScale, rotY: w.glbRotY, posY: w.glbPosY, posZ: w.glbPosZ,
      }]),
    ),
  };
}

function updateJsonOut() {
  const cfg = buildConfigJson();
  els.jsonOut.value = JSON.stringify(cfg, null, 2);
}

els.saveConfig?.addEventListener('click', async () => {
  const cfg = buildConfigJson();
  els.saveStatus.textContent = 'Saving…';
  try {
    const res = await fetch('/api/character-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg),
    });
    if (res.ok) {
      els.saveStatus.textContent = 'Saved ✓';
      setStatus('Config saved');
    } else {
      els.saveStatus.textContent = 'Save failed';
    }
  } catch (e) {
    els.saveStatus.textContent = `Error: ${e.message}`;
  }
  setTimeout(() => { els.saveStatus.textContent = ''; }, 3000);
});

els.copyConfig?.addEventListener('click', () => {
  navigator.clipboard?.writeText(els.jsonOut.value);
  els.saveStatus.textContent = 'Copied ✓';
  setTimeout(() => { els.saveStatus.textContent = ''; }, 2000);
});

els.resetConfig?.addEventListener('click', () => {
  if (!confirm('Reset all values to game defaults?')) return;
  st.body    = JSON.parse(JSON.stringify(DEFAULT_BODY));
  st.chars   = JSON.parse(JSON.stringify(DEFAULT_CHARS));
  st.weapons = JSON.parse(JSON.stringify(DEFAULT_WEAPONS));
  if (st.tab === 'character') buildRig();
  else buildWeaponRig(st.weapon);
  selectPart(null, null);
  refreshInspector();
  updateJsonOut();
  setStatus('Reset to defaults');
});

// ── Load existing config from server ─────────────────────────────────────────
async function loadConfig() {
  try {
    const res = await fetch('/api/character-config');
    if (!res.ok) return;
    const cfg = await res.json();
    if (cfg.playerBody) Object.assign(st.body,    cfg.playerBody);
    if (cfg.characters) Object.assign(st.chars,   cfg.characters);
    if (cfg.weapons)    Object.assign(st.weapons,  cfg.weapons);
    // Merge glbOverrides back into weapon data
    if (cfg.weaponGlbs) {
      for (const [id, ov] of Object.entries(cfg.weaponGlbs)) {
        if (st.weapons[id]) {
          if (typeof ov.scale === 'number') st.weapons[id].glbScale = ov.scale;
          if (typeof ov.rotY  === 'number') st.weapons[id].glbRotY  = ov.rotY;
          if (typeof ov.posY  === 'number') st.weapons[id].glbPosY  = ov.posY;
          if (typeof ov.posZ  === 'number') st.weapons[id].glbPosZ  = ov.posZ;
        }
      }
    }
    setStatus('Loaded existing config');
  } catch { /* server not running — fresh start */ }
}

// ── Fullscreen ────────────────────────────────────────────────────────────────
$('fullscreen-btn')?.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.();
  } else {
    document.exitFullscreen?.();
  }
});

// ── Resize ────────────────────────────────────────────────────────────────────
function onResize() {
  const wrap = canvas.parentElement.getBoundingClientRect();
  renderer.setSize(wrap.width, wrap.height, false);
  camera.aspect = wrap.width / wrap.height;
  camera.updateProjectionMatrix();
  fpsCamera.aspect = wrap.width / wrap.height;
  fpsCamera.updateProjectionMatrix();
}

window.addEventListener('resize', onResize);

// ── Animate walk (character tab) ──────────────────────────────────────────────
function animateBody(dt) {
  if (!st.animating || !rig.group) return;
  st.walkTime += dt * 8;
  const swing = Math.sin(st.walkTime) * 0.45;
  if (rig.leftLeg)  rig.leftLeg.rotation.x  =  swing;
  if (rig.rightLeg) rig.rightLeg.rotation.x = -swing;
  if (rig.leftArm)  rig.leftArm.rotation.x  = -swing * 0.5;
  if (rig.rightArm) rig.rightArm.rotation.x =  swing * 0.5;
  if (rig.torso)    rig.torso.position.y = (st.body.torso.pos[1] - 0.06) + Math.abs(Math.sin(st.walkTime)) * 0.05;
}

// ── Render loop ───────────────────────────────────────────────────────────────
let lastTime = performance.now();

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt  = Math.min(0.05, (now - lastTime) / 1000);
  lastTime  = now;

  orbit.update();
  animateBody(dt);

  // In FP weapon mode, sync fpsCamera to main camera position
  if (st.tab === 'weapon' && st.weaponView === 'fp') {
    fpsCamera.position.copy(camera.position);
    fpsCamera.rotation.copy(camera.rotation);
    renderer.render(scene, fpsCamera);
  } else {
    renderer.render(scene, camera);
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  await loadConfig();
  onResize();
  buildRig();
  updateJsonOut();
  setStatus('Ready — click a part or select from list');
  animate();
}

init();

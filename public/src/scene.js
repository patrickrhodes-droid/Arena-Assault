import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

import { ARENA_SIZE, CHARACTERS, HALF, MAP_DEFS, WALL_H } from "./config.js";
import { game } from "./state.js";
import { disposeObject3D } from "./utils.js";

export function applyCharacterHead(headGroup, characterId, options = {}) {
  for (let i = headGroup.children.length - 1; i >= 0; i -= 1) {
    const child = headGroup.children[i];
    headGroup.remove(child);
    disposeObject3D(child);
  }

  const character = CHARACTERS[characterId];
  const gltf = game.shared?.characterHeadGltfs?.[characterId];
  let usedGlb = false;

  if (gltf) {
    const model = gltf.scene.clone(true);
    model.rotation.y = Math.PI; // face forward (GLB imports facing +Z)
    const bbox = new THREE.Box3().setFromObject(model);
    const dims = new THREE.Vector3();
    bbox.getSize(dims);
    const largestAxis = Math.max(dims.x, dims.y, dims.z) || 1;
    // 60% bigger than the box-head target size.
    const targetSize = 0.5 * (character?.headScale ?? 1.0) * 1.6;
    const scale = targetSize / largestAxis;
    model.scale.setScalar(scale);
    // Recenter so the mesh's bbox origin sits at the headGroup anchor.
    const center = new THREE.Vector3();
    bbox.getCenter(center);
    model.position.sub(center.multiplyScalar(scale));
    // Put every head mesh on layer 1 (in addition to 0) and tune its material
    // to reflect more light — no emissive, just a slightly brighter diffuse
    // response and lower roughness so the fill light shows up.
    model.traverse((node) => {
      if (node.isMesh) {
        node.castShadow = true;
        node.receiveShadow = true;
        node.layers.enable(1);
        const mat = node.material;
        if (mat && mat.color && !mat.userData.__tunedForHeadLight) {
          const tuned = mat.clone();
          if ("roughness" in tuned) tuned.roughness = Math.min(tuned.roughness ?? 1, 0.55);
          if ("metalness" in tuned) tuned.metalness = Math.min(tuned.metalness ?? 0, 0.05);
          // Clear any emissive the source model shipped with — we want pure reflection.
          if (tuned.emissive) tuned.emissive.setScalar(0);
          tuned.emissiveIntensity = 0;
          tuned.userData.__tunedForHeadLight = true;
          node.material = tuned;
        }
      }
    });
    headGroup.add(model);

    // Dedicated reflective fill light: only affects meshes on layer 1, so the
    // head is visibly brighter without altering any other object in the scene.
    const fillLight = new THREE.PointLight(0xffffff, 2.4, 2.5, 1.6);
    fillLight.position.set(0, 0.15, -0.25); // slightly above + in front of the face
    fillLight.layers.set(1);
    headGroup.add(fillLight);

    // Soft ambient kicker so the back/sides of the head aren't pitch black
    // when the fill light is occluded by the face geometry itself.
    const softBounce = new THREE.PointLight(0xffffff, 0.9, 1.5, 2);
    softBounce.position.set(0, 0, 0.2);
    softBounce.layers.set(1);
    headGroup.add(softBounce);

    usedGlb = true;
  } else {
    const color = character ? character.headColor : 0x3a4a30;
    const boxScale = character ? character.headScale : 1.0;
    const size = 0.35 * boxScale;
    const headMat = new THREE.MeshStandardMaterial({ color, roughness: 0.78 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), headMat);
    mesh.castShadow = true;
    headGroup.add(mesh);
  }

  headGroup.userData.characterId = characterId || null;
  headGroup.userData.usedGlb = usedGlb;

  // Visor sits at head height and looks wrong over a detailed face model. Hide
  // it when a GLB head is in use.
  if (options.visor) {
    options.visor.visible = !usedGlb;
  }
}

export function initScene() {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x1b2734, 0.005);
  scene.background = new THREE.Color(0x1b2734);

  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 12, 30);
  camera.rotation.order = "YXZ";

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.28;
  game.dom.gameContainer.appendChild(renderer.domElement);

  game.scene = scene;
  game.camera = camera;
  game.renderer = renderer;

  addPermanentLighting();
  buildPlayer();
  buildWeaponVisuals();
  buildGrappleVisuals();
  buildSharedRuntimeAssets();
  rebuildArena("arena"); // default lobby scene
}

function buildGrappleVisuals() {
  // Lure body: elongated orange sphere like a fishing lure
  const lureMat = new THREE.MeshStandardMaterial({ color: 0xff6600, roughness: 0.25, metalness: 0.7, emissive: 0xff3300, emissiveIntensity: 0.3 });
  const lureGeo = new THREE.SphereGeometry(0.07, 8, 6);
  const hookMesh = new THREE.Mesh(lureGeo, lureMat);
  hookMesh.scale.set(1, 2.2, 1);
  hookMesh.visible = false;
  game.scene.add(hookMesh);

  // Rope: a Line between two points updated every frame
  const ropeGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(6); // two Vector3s
  ropeGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const ropeMat = new THREE.LineBasicMaterial({ color: 0xaaaaaa });
  const rope = new THREE.Line(ropeGeo, ropeMat);
  rope.visible = false;
  rope.frustumCulled = false;
  game.scene.add(rope);

  game.visuals.grapple = { hookMesh, rope };
}

export function rebuildArena(mapId) {
  // Remove old arena objects.
  if (game.arenaGroup) {
    game.scene.remove(game.arenaGroup);
    disposeObject3D(game.arenaGroup);
  }
  for (const light of game.arenaLights) {
    game.scene.remove(light);
  }
  game.arenaLights = [];
  game.oBs.length = 0;
  game.ladders.length = 0;

  game.arenaGroup = new THREE.Group();
  game.scene.add(game.arenaGroup);

  const map = MAP_DEFS[mapId] || MAP_DEFS.arena;
  if (mapId === "desert") {
    buildArenaDesert();
  } else if (mapId === "city") {
    buildArenaCity();
  } else {
    buildArenaOriginal();
  }
}

function addPermanentLighting() {
  // Hemisphere always present — per-map sun and accents are added in rebuildArena.
  game.scene.add(new THREE.HemisphereLight(0x8fb7ff, 0x24303c, 0.55));
}

function addSun(color, intensity, px, py, pz) {
  const dirLight = new THREE.DirectionalLight(color, intensity);
  dirLight.position.set(px, py, pz);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(2048, 2048);
  dirLight.shadow.camera.left = -80;
  dirLight.shadow.camera.right = 80;
  dirLight.shadow.camera.top = 80;
  dirLight.shadow.camera.bottom = -80;
  dirLight.shadow.camera.near = 1;
  dirLight.shadow.camera.far = 160;
  dirLight.shadow.bias = -0.001;
  game.scene.add(dirLight);
  game.arenaLights.push(dirLight);
}

function buildArenaOriginal() {
  game.scene.fog = new THREE.FogExp2(0x1b2734, 0.005);
  game.scene.background = new THREE.Color(0x1b2734);
  addSun(0xfff5e0, 1.65, 40, 60, 20);

  // Cyan accent floor lights.
  for (let index = 0; index < 20; index += 1) {
    const x = (Math.random() - 0.5) * 120;
    const z = (Math.random() - 0.5) * 120;
    const pointLight = new THREE.PointLight(0x55e6cc, 1.15, 30);
    pointLight.position.set(x, 0.3, z);
    game.scene.add(pointLight);
    game.arenaLights.push(pointLight);

    const decal = new THREE.Mesh(
      new THREE.CircleGeometry(0.3, 12),
      new THREE.MeshStandardMaterial({ color: 0x00ccaa, emissive: 0x00ccaa, emissiveIntensity: 0.5 }),
    );
    decal.rotation.x = -Math.PI / 2;
    decal.position.set(x, 0.01, z);
    game.arenaGroup.add(decal);
  }

  const groundCanvas = document.createElement("canvas");
  groundCanvas.width = 512;
  groundCanvas.height = 512;
  const groundContext = groundCanvas.getContext("2d");
  groundContext.fillStyle = "#313a44";
  groundContext.fillRect(0, 0, 512, 512);
  groundContext.strokeStyle = "#465463";
  groundContext.lineWidth = 1;

  for (let index = 0; index <= 8; index += 1) {
    const point = index * 64;
    groundContext.beginPath();
    groundContext.moveTo(point, 0);
    groundContext.lineTo(point, 512);
    groundContext.stroke();
    groundContext.beginPath();
    groundContext.moveTo(0, point);
    groundContext.lineTo(512, point);
    groundContext.stroke();
  }

  const imageData = groundContext.getImageData(0, 0, 512, 512);
  for (let index = 0; index < imageData.data.length; index += 4) {
    const noise = (Math.random() - 0.5) * 18;
    imageData.data[index] += noise;
    imageData.data[index + 1] += noise;
    imageData.data[index + 2] += noise;
  }
  groundContext.putImageData(imageData, 0, 0);

  const groundTexture = new THREE.CanvasTexture(groundCanvas);
  groundTexture.wrapS = THREE.RepeatWrapping;
  groundTexture.wrapT = THREE.RepeatWrapping;
  groundTexture.repeat.set(12, 12);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA_SIZE, ARENA_SIZE),
    new THREE.MeshStandardMaterial({ map: groundTexture, color: 0xc8d2db, roughness: 0.92 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  game.arenaGroup.add(ground);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x46515d, roughness: 0.82 });
  const stripMat = new THREE.MeshStandardMaterial({
    color: 0x3ce6cb,
    emissive: 0x3ce6cb,
    emissiveIntensity: 1.15,
  });

  buildWalls(wallMat, stripMat);

  const crateMat = new THREE.MeshStandardMaterial({ color: 0x8b6b47, roughness: 0.92 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x7c90a3, roughness: 0.35, metalness: 0.62 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x3a424d, roughness: 0.58, metalness: 0.22 });

  game.shared.worldMaterials = { crateMat, metalMat, darkMat };

  // ─── Center hub — 4 metal barriers in a cross ───
  addWorldBox(0, 1.0, -14, 5, 2, 0.4, metalMat);
  addWorldBox(0, 1.0, 14, 5, 2, 0.4, metalMat);
  addWorldBox(-14, 1.0, 0, 0.4, 2, 5, metalMat);
  addWorldBox(14, 1.0, 0, 0.4, 2, 5, metalMat);

  // ─── Inner metal staircase (center-right) ───
  addWorldBox(-11, 0.55, 16, 3.2, 1.1, 3.2, metalMat);
  addWorldBox(-3, 1.05, 16, 3.2, 2.1, 3.2, metalMat);
  addWorldBox(5, 1.55, 16, 3.2, 3.1, 3.2, metalMat);

  // ─── Inner dark staircase (center-left) ───
  addWorldBox(-5, 0.55, -16, 3.2, 1.1, 3.2, darkMat);
  addWorldBox(3, 1.05, -16, 3.2, 2.1, 3.2, darkMat);
  addWorldBox(11, 1.55, -16, 3.2, 3.1, 3.2, darkMat);

  // ─── Inner crate cluster NW ───
  addWorldBox(-27, 0.75, -27, 1.5, 1.5, 1.5, crateMat);
  addWorldBox(-25.5, 0.75, -27, 1.5, 1.5, 1.5, crateMat);
  addWorldBox(-27, 0.75, -25.5, 1.5, 1.5, 1.5, crateMat);
  addWorldBox(-27, 1.5, -27, 1.5, 1.5, 1.5, crateMat);

  // ─── Inner crate cluster SE ───
  addWorldBox(27, 0.75, 27, 1.5, 1.5, 1.5, crateMat);
  addWorldBox(25.5, 0.75, 27, 1.5, 1.5, 1.5, crateMat);
  addWorldBox(27, 0.75, 25.5, 1.5, 1.5, 1.5, crateMat);

  // ─── Mid barriers (cover at range) ───
  addWorldBox(0, 0.6, -22, 3, 1.2, 0.4, metalMat);
  addWorldBox(14, 0.6, 9, 3, 1.2, 0.4, metalMat);
  addWorldBox(-32, 0.6, 0, 0.4, 1.2, 3, metalMat);
  addWorldBox(9, 0.6, -46, 3, 1.2, 0.4, metalMat);
  addWorldBox(-9, 0.6, 28, 0.4, 1.2, 3, metalMat);
  addWorldBox(22, 0.6, -14, 3, 1.2, 0.4, metalMat);
  addWorldBox(-15, 0.6, -36, 3, 1.2, 0.4, metalMat);
  addWorldBox(15, 0.6, 36, 3, 1.2, 0.4, metalMat);
  addWorldBox(-36, 0.6, 15, 0.4, 1.2, 3, metalMat);
  addWorldBox(36, 0.6, -15, 0.4, 1.2, 3, metalMat);

  // ─── North bunker (open toward player spawn area) ───
  addWorldBox(-6, 1.2, -50, 0.4, 2.4, 9, metalMat);
  addWorldBox(6, 1.2, -50, 0.4, 2.4, 9, metalMat);
  addWorldBox(0, 1.2, -54, 12, 2.4, 0.4, metalMat);
  addWorldBox(0, 0.75, -48, 1.5, 1.5, 1.5, crateMat);

  // ─── South bunker ───
  addWorldBox(-6, 1.2, 50, 0.4, 2.4, 9, metalMat);
  addWorldBox(6, 1.2, 50, 0.4, 2.4, 9, metalMat);
  addWorldBox(0, 1.2, 54, 12, 2.4, 0.4, metalMat);

  // ─── East tower (3-tiered dark pillar) ───
  addWorldBox(50, 0.7, 0, 4.5, 1.4, 4.5, darkMat);
  addWorldBox(50, 2.3, 0, 3.2, 4.6, 3.2, darkMat);
  addWorldBox(50, 5.5, 0, 2.2, 11.0, 2.2, darkMat);

  // ─── West tower ───
  addWorldBox(-50, 0.7, 0, 4.5, 1.4, 4.5, darkMat);
  addWorldBox(-50, 2.3, 0, 3.2, 4.6, 3.2, darkMat);
  addWorldBox(-50, 5.5, 0, 2.2, 11.0, 2.2, darkMat);

  // ─── NE dark staircase ───
  addWorldBox(36, 0.7, -36, 3.6, 1.4, 3.6, darkMat);
  addWorldBox(44, 1.15, -36, 3.6, 2.3, 3.6, darkMat);
  addWorldBox(52, 1.55, -36, 3.6, 3.1, 3.6, darkMat);

  // ─── SW crate staircase ───
  addWorldBox(-40, 0.5, 36, 2.6, 1.0, 2.6, crateMat);
  addWorldBox(-33, 0.95, 36, 2.6, 1.9, 2.6, crateMat);
  addWorldBox(-27, 1.35, 36, 2.6, 2.7, 2.6, crateMat);

  // ─── NW crate staircase ───
  addWorldBox(-40, 0.5, -12, 2.6, 1.0, 2.6, crateMat);
  addWorldBox(-33, 0.95, -12, 2.6, 1.9, 2.6, crateMat);
  addWorldBox(-27, 1.35, -12, 2.6, 2.7, 2.6, crateMat);

  // ─── SE metal staircase ───
  addWorldBox(28, 0.55, 38, 3.2, 1.1, 3.2, metalMat);
  addWorldBox(36, 1.05, 38, 3.2, 2.1, 3.2, metalMat);
  addWorldBox(44, 1.55, 38, 3.2, 3.1, 3.2, metalMat);

  // ─── Outer diagonal cover (mid-outer ring) ───
  addWorldBox(-28, 0.6, 28, 4, 1.2, 0.4, metalMat);
  addWorldBox(28, 0.6, -28, 4, 1.2, 0.4, metalMat);
  addWorldBox(-28, 0.6, -28, 0.4, 1.2, 4, metalMat);
  addWorldBox(28, 0.6, 28, 0.4, 1.2, 4, metalMat);

  // ─── Outer wall barriers ───
  addWorldBox(60, 0.6, -24, 0.4, 1.2, 10, metalMat);
  addWorldBox(-60, 0.6, 24, 0.4, 1.2, 10, metalMat);
  addWorldBox(24, 0.6, 62, 10, 1.2, 0.4, metalMat);
  addWorldBox(-24, 0.6, -62, 10, 1.2, 0.4, metalMat);
  addWorldBox(-62, 0.6, -24, 0.4, 1.2, 10, metalMat);
  addWorldBox(62, 0.6, 24, 0.4, 1.2, 10, metalMat);

  // ─── Sniper perch pillars in far corners (2x) ───
  addWorldBox(58, 5.0, -58, 5.0, 10.0, 5.0, darkMat);
  addWorldBox(-58, 5.0, 58, 5.0, 10.0, 5.0, darkMat);
  addWorldBox(58, 5.0, 58, 5.0, 10.0, 5.0, darkMat);
  addWorldBox(-58, 5.0, -58, 5.0, 10.0, 5.0, darkMat);

  // ─── Ladders on sniper towers ───
  // Each tower is 5.0×10.0×5.0. Ladder on the inner face (toward arena centre).
  function addTowerLadder(tx, tz, faceSign) {
    const faceZ = tz + faceSign * 2.5;
    const lz = faceZ + faceSign * 0.07;

    addWorldBox(tx - 0.72, 5.0, lz, 0.09, 10.0, 0.09, metalMat, false, false);
    addWorldBox(tx + 0.72, 5.0, lz, 0.09, 10.0, 0.09, metalMat, false, false);

    for (let i = 0; i < 16; i += 1) {
      addWorldBox(tx, 0.4 + i * 0.62, lz, 1.44, 0.07, 0.09, metalMat, false, false);
    }

    const zMin = faceSign > 0 ? faceZ - 0.3 : faceZ - 1.8;
    const zMax = faceSign > 0 ? faceZ + 1.8 : faceZ + 0.3;
    game.ladders.push({ xMin: tx - 1.4, xMax: tx + 1.4, zMin, zMax, yMax: 10.3 });
  }

  addTowerLadder(58, -58, 1);
  addTowerLadder(-58, -58, 1);
  addTowerLadder(58, 58, -1);
  addTowerLadder(-58, 58, -1);

  // ─── Scattered mid-field crates ───
  addWorldBox(-35, 0.75, 20, 1.5, 1.5, 1.5, crateMat);
  addWorldBox(-33.5, 0.75, 20, 1.5, 1.5, 1.5, crateMat);
  addWorldBox(-35, 1.5, 20, 1.5, 1.5, 1.5, crateMat);
  addWorldBox(35, 0.75, -20, 1.5, 1.5, 1.5, crateMat);
  addWorldBox(33.5, 0.75, -20, 1.5, 1.5, 1.5, crateMat);
  addWorldBox(20, 0.75, 38, 1.5, 1.5, 1.5, crateMat);
  addWorldBox(21.5, 0.75, 38, 1.5, 1.5, 1.5, crateMat);
  addWorldBox(-20, 0.75, -38, 1.5, 1.5, 1.5, crateMat);
  addWorldBox(-21.5, 0.75, -38, 1.5, 1.5, 1.5, crateMat);
}

function buildArenaDesert() {
  game.scene.fog = new THREE.FogExp2(0xdbb07d, 0.004);
  game.scene.background = new THREE.Color(0xe3c4a1);
  addSun(0xfffef0, 2.5, 50, 80, 10);

  // Warm amber fill lights — scattered lanterns.
  for (let i = 0; i < 14; i += 1) {
    const x = (Math.random() - 0.5) * 110;
    const z = (Math.random() - 0.5) * 110;
    const pl = new THREE.PointLight(0xff9933, 1.6, 28);
    pl.position.set(x, 0.5, z);
    game.scene.add(pl);
    game.arenaLights.push(pl);
  }

  // Sandy ground.
  const groundMat = new THREE.MeshStandardMaterial({ color: 0xD4A46A, roughness: 0.95 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(ARENA_SIZE, ARENA_SIZE), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  game.arenaGroup.add(ground);

  const sandMat = new THREE.MeshStandardMaterial({ color: 0xC2906A, roughness: 0.9 });
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x9B7350, roughness: 0.85 });
  const ruinMat = new THREE.MeshStandardMaterial({ color: 0x8B6848, roughness: 0.88 });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xB8844E, roughness: 0.82 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0xff8822, emissive: 0xff6600, emissiveIntensity: 0.7 });

  buildWalls(wallMat, accentMat);

  // ─── Central ruined archway pillars ───
  addWorldBox(-6, 3, 0, 2.5, 6, 2.5, stoneMat);
  addWorldBox(6, 3, 0, 2.5, 6, 2.5, stoneMat);
  addWorldBox(0, 6.5, 0, 15, 1.2, 2.5, stoneMat);

  // ─── Sand dune ridges (low cover mounds) ───
  addWorldBox(-22, 0.8, 18, 14, 1.6, 3.5, sandMat);
  addWorldBox(22, 0.8, -18, 14, 1.6, 3.5, sandMat);
  addWorldBox(-18, 0.8, -22, 3.5, 1.6, 14, sandMat);
  addWorldBox(18, 0.8, 22, 3.5, 1.6, 14, sandMat);
  addWorldBox(0, 0.6, 32, 10, 1.2, 3, sandMat);
  addWorldBox(0, 0.6, -32, 10, 1.2, 3, sandMat);
  addWorldBox(32, 0.6, 0, 3, 1.2, 10, sandMat);
  addWorldBox(-32, 0.6, 0, 3, 1.2, 10, sandMat);

  // ─── Ruined oasis walls (N and S compounds) ───
  addWorldBox(-8, 1.4, -46, 0.6, 2.8, 12, ruinMat);
  addWorldBox(8, 1.4, -46, 0.6, 2.8, 12, ruinMat);
  addWorldBox(0, 1.4, -52, 18, 2.8, 0.6, ruinMat);
  addWorldBox(-8, 1.4, 46, 0.6, 2.8, 12, ruinMat);
  addWorldBox(8, 1.4, 46, 0.6, 2.8, 12, ruinMat);
  addWorldBox(0, 1.4, 52, 18, 2.8, 0.6, ruinMat);

  // ─── Stone pillar clusters (mid-field) ───
  addWorldBox(-38, 2, 10, 3, 4, 3, stoneMat);
  addWorldBox(-42, 2, 14, 2, 4, 2, stoneMat);
  addWorldBox(38, 2, -10, 3, 4, 3, stoneMat);
  addWorldBox(42, 2, -14, 2, 4, 2, stoneMat);
  addWorldBox(12, 2, 38, 3, 4, 3, stoneMat);
  addWorldBox(-12, 2, -38, 3, 4, 3, stoneMat);

  // ─── Stepped pyramid platforms (sniper positions, NE and SW) ───
  addWorldBox(50, 1.1, -50, 8, 2.2, 8, stoneMat);
  addWorldBox(52, 3.3, -52, 4.5, 2.2, 4.5, stoneMat);
  addWorldBox(53, 5.4, -53, 2.5, 2.2, 2.5, stoneMat);
  game.ladders.push({ xMin: 46, xMax: 54, zMin: -54, zMax: -46, yMax: 6.5 });

  addWorldBox(-50, 1.1, 50, 8, 2.2, 8, stoneMat);
  addWorldBox(-52, 3.3, 52, 4.5, 2.2, 4.5, stoneMat);
  addWorldBox(-53, 5.4, 53, 2.5, 2.2, 2.5, stoneMat);
  game.ladders.push({ xMin: -54, xMax: -46, zMin: 46, zMax: 54, yMax: 6.5 });

  // ─── Scattered rubble ───
  addWorldBox(-55, 0.5, -10, 2, 1, 2, ruinMat);
  addWorldBox(55, 0.5, 10, 2, 1, 2, ruinMat);
  addWorldBox(-14, 0.5, 55, 2, 1, 2, ruinMat);
  addWorldBox(14, 0.5, -55, 2, 1, 2, ruinMat);
  addWorldBox(-30, 0.5, 45, 1.5, 1, 1.5, sandMat);
  addWorldBox(30, 0.5, -45, 1.5, 1, 1.5, sandMat);
  addWorldBox(45, 0.5, 30, 1.5, 1, 1.5, sandMat);
  addWorldBox(-45, 0.5, -30, 1.5, 1, 1.5, sandMat);
}

function buildArenaCity() {
  game.scene.fog = new THREE.FogExp2(0xb1c9e8, 0.003);
  game.scene.background = new THREE.Color(0xc9e4ff);
  // Bright midday sun.
  addSun(0xffffff, 2.6, 30, 85, -20);
  // Second fill from the opposite side so buildings are lit on both faces.
  addSun(0xddeeff, 1.2, -40, 50, 30);
  // Extra city-specific ambient hemisphere — well-lit urban sky.
  const cityHemi = new THREE.HemisphereLight(0xcae4ff, 0x7788aa, 1.4);
  game.scene.add(cityHemi);
  game.arenaLights.push(cityHemi);

  // Street-lamp fill lights — more of them, higher intensity, bigger range.
  const lampPositions = [
    [-30, -30], [30, -30], [-30, 30], [30, 30],
    [0, -48], [0, 48], [-48, 0], [48, 0],
    [-15, -15], [15, -15], [-15, 15], [15, 15],
    [0, 0], [-50, -50], [50, -50], [-50, 50], [50, 50],
  ];
  for (const [x, z] of lampPositions) {
    const pl = new THREE.PointLight(0xCCEEFF, 4.5, 40);
    pl.position.set(x, 6, z);
    game.scene.add(pl);
    game.arenaLights.push(pl);
  }
  // Neon accent lights — brighter and wider range.
  for (const [x, z, col] of [
    [-15, 0, 0x4488ff], [15, 0, 0xff3366],
    [0, -15, 0x44ffaa], [0, 15, 0xff8800],
    [-40, -40, 0x66aaff], [40, 40, 0xff44aa],
    [40, -40, 0x44ffcc], [-40, 40, 0xffaa33],
  ]) {
    const nl = new THREE.PointLight(col, 2.5, 30);
    nl.position.set(x, 2, z);
    game.scene.add(nl);
    game.arenaLights.push(nl);
  }

  // Brighter asphalt ground.
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.85 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(ARENA_SIZE, ARENA_SIZE), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  game.arenaGroup.add(ground);

  const concreteMat = new THREE.MeshStandardMaterial({ color: 0x555566, roughness: 0.82 });
  const darkConcrete = new THREE.MeshStandardMaterial({ color: 0x3c3c50, roughness: 0.85 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x445566, roughness: 0.4, metalness: 0.65 });
  const neonMat = new THREE.MeshStandardMaterial({ color: 0x4488ff, emissive: 0x4488ff, emissiveIntensity: 1.0 });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x2c3040, roughness: 0.85 });

  buildWalls(wallMat, neonMat);

  // ─── Central plaza: low circular fountain base ───
  addWorldBox(0, 0.6, 0, 8, 1.2, 8, concreteMat);
  addWorldBox(0, 1.3, 0, 5, 0.2, 5, metalMat);     // fountain lip
  addWorldBox(-3.5, 1.2, 0, 0.4, 1.8, 3.5, concreteMat);
  addWorldBox(3.5, 1.2, 0, 0.4, 1.8, 3.5, concreteMat);
  addWorldBox(0, 1.2, -3.5, 3.5, 1.8, 0.4, concreteMat);
  addWorldBox(0, 1.2, 3.5, 3.5, 1.8, 0.4, concreteMat);

  // ─── City blocks (4 quadrant buildings, climbable from street side) ───
  // NW building
  addWorldBox(-38, 5, -38, 16, 10, 16, darkConcrete);
  addWorldBox(-38, 10.5, -38, 10, 1, 10, concreteMat);
  // NE building
  addWorldBox(38, 5, -38, 16, 10, 16, darkConcrete);
  addWorldBox(38, 10.5, -38, 10, 1, 10, concreteMat);
  // SW building
  addWorldBox(-38, 5, 38, 16, 10, 16, darkConcrete);
  addWorldBox(-38, 10.5, 38, 10, 1, 10, concreteMat);
  // SE building
  addWorldBox(38, 5, 38, 16, 10, 16, darkConcrete);
  addWorldBox(38, 10.5, 38, 10, 1, 10, concreteMat);

  // ─── Fire escape staircases on each building (toward centre) ───
  addWorldBox(-30.5, 0.7, -28, 3, 1.4, 3, metalMat);
  addWorldBox(-30.5, 2.1, -30, 3, 4.2, 3, metalMat);
  game.ladders.push({ xMin: -32, xMax: -29, zMin: -32, zMax: -26, yMax: 10.5 });

  addWorldBox(30.5, 0.7, -28, 3, 1.4, 3, metalMat);
  addWorldBox(30.5, 2.1, -30, 3, 4.2, 3, metalMat);
  game.ladders.push({ xMin: 29, xMax: 32, zMin: -32, zMax: -26, yMax: 10.5 });

  addWorldBox(-30.5, 0.7, 28, 3, 1.4, 3, metalMat);
  addWorldBox(-30.5, 2.1, 30, 3, 4.2, 3, metalMat);
  game.ladders.push({ xMin: -32, xMax: -29, zMin: 26, zMax: 32, yMax: 10.5 });

  addWorldBox(30.5, 0.7, 28, 3, 1.4, 3, metalMat);
  addWorldBox(30.5, 2.1, 30, 3, 4.2, 3, metalMat);
  game.ladders.push({ xMin: 29, xMax: 32, zMin: 26, zMax: 32, yMax: 10.5 });

  // ─── Jersey barriers (main-road cover) ───
  addWorldBox(-14, 0.65, -14, 5, 1.3, 1.2, concreteMat);
  addWorldBox(14, 0.65, -14, 5, 1.3, 1.2, concreteMat);
  addWorldBox(-14, 0.65, 14, 5, 1.3, 1.2, concreteMat);
  addWorldBox(14, 0.65, 14, 5, 1.3, 1.2, concreteMat);
  addWorldBox(-14, 0.65, 0, 1.2, 1.3, 5, concreteMat);
  addWorldBox(14, 0.65, 0, 1.2, 1.3, 5, concreteMat);
  addWorldBox(0, 0.65, -48, 12, 1.3, 1.2, concreteMat);
  addWorldBox(0, 0.65, 48, 12, 1.3, 1.2, concreteMat);
  addWorldBox(-48, 0.65, 0, 1.2, 1.3, 12, concreteMat);
  addWorldBox(48, 0.65, 0, 1.2, 1.3, 12, concreteMat);

  // ─── Dumpsters / debris ───
  addWorldBox(-20, 0.7, -8, 2, 1.4, 3.5, darkConcrete);
  addWorldBox(20, 0.7, 8, 2, 1.4, 3.5, darkConcrete);
  addWorldBox(8, 0.7, -20, 3.5, 1.4, 2, darkConcrete);
  addWorldBox(-8, 0.7, 20, 3.5, 1.4, 2, darkConcrete);
  addWorldBox(-55, 0.7, -20, 2.5, 1.4, 2.5, darkConcrete);
  addWorldBox(55, 0.7, 20, 2.5, 1.4, 2.5, darkConcrete);
  addWorldBox(20, 0.7, -55, 2.5, 1.4, 2.5, darkConcrete);
  addWorldBox(-20, 0.7, 55, 2.5, 1.4, 2.5, darkConcrete);

  // ─── Neon accent strips on buildings ───
  for (const [x, z] of [[-38, -30], [38, -30], [-38, 30], [38, 30]]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3, 0.1), neonMat);
    strip.position.set(x, 7, z);
    game.arenaGroup.add(strip);
  }
}

function buildWalls(wallMat, accentMat) {
  const wallData = [
    { position: [0, WALL_H / 2, -HALF], size: [ARENA_SIZE, WALL_H, 1] },
    { position: [0, WALL_H / 2, HALF], size: [ARENA_SIZE, WALL_H, 1] },
    { position: [-HALF, WALL_H / 2, 0], size: [1, WALL_H, ARENA_SIZE] },
    { position: [HALF, WALL_H / 2, 0], size: [1, WALL_H, ARENA_SIZE] },
  ];

  wallData.forEach((wall) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...wall.size), wallMat);
    mesh.position.set(...wall.position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    game.arenaGroup.add(mesh);
    game.oBs.push({
      min: { x: wall.position[0] - wall.size[0] / 2, z: wall.position[2] - wall.size[2] / 2 },
      max: { x: wall.position[0] + wall.size[0] / 2, z: wall.position[2] + wall.size[2] / 2 },
      h: wall.size[1],
    });

    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(
        wall.size[0] * 0.99,
        0.25,
        wall.size[2] > 1 ? 0.25 : wall.size[2] * 0.99,
      ),
      accentMat,
    );
    strip.position.set(wall.position[0], WALL_H - 0.5, wall.position[2]);
    game.arenaGroup.add(strip);
  });
}

function addWorldBox(x, y, z, width, height, depth, material, castShadow = true, collidable = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  game.arenaGroup.add(mesh);
  if (collidable) {
    game.oBs.push({
      min: { x: x - width / 2, z: z - depth / 2 },
      max: { x: x + width / 2, z: z + depth / 2 },
      h: height,
    });
  }
  return mesh;
}

function buildPlayer() {
  const playerGroup = new THREE.Group();
  game.scene.add(playerGroup);

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3a4a30, roughness: 0.8 });
  const legMat = new THREE.MeshStandardMaterial({ color: 0x2a3820, roughness: 0.85 });
  const bootMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  const visorMat = new THREE.MeshStandardMaterial({
    color: 0x00ccaa,
    emissive: 0x00ccaa,
    emissiveIntensity: 1.2,
  });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 0.4), bodyMat);
  torso.position.y = 1.2;
  playerGroup.add(torso);

  const headGroup = new THREE.Group();
  headGroup.position.y = 1.9;
  playerGroup.add(headGroup);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.02), visorMat);
  visor.position.set(0, 1.92, -0.18);
  playerGroup.add(visor);

  applyCharacterHead(headGroup, game.myCharacter, { visor });

  const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.65, 0.2), bodyMat);
  leftArm.position.set(-0.55, 1.3, 0);
  playerGroup.add(leftArm);

  const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.65, 0.2), bodyMat);
  rightArm.position.set(0.55, 1.3, 0);
  playerGroup.add(rightArm);

  const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.7, 0.25), legMat);
  leftLeg.position.set(-0.2, 0.4, 0);
  playerGroup.add(leftLeg);

  const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.7, 0.25), legMat);
  rightLeg.position.set(0.2, 0.4, 0);
  playerGroup.add(rightLeg);

  const leftBoot = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.35), bootMat);
  leftBoot.position.set(-0.2, 0.08, 0);
  playerGroup.add(leftBoot);

  const rightBoot = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.35), bootMat);
  rightBoot.position.set(0.2, 0.08, 0);
  playerGroup.add(rightBoot);

  game.visuals.player = {
    playerGroup,
    bodyMat,
    legMat, // This line was not changed, but was included in the original diff.
    visorMat,
    torso,
    headGroup,
    visor,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    leftBoot,
    rightBoot,
  };
}

function buildWeaponVisuals() {
  const firstPersonGun = new THREE.Group();
  firstPersonGun.position.set(0.25, -0.2, -0.5);
  firstPersonGun.visible = false;
  game.camera.add(firstPersonGun);
  game.scene.add(game.camera);

  const fpMuzzle = new THREE.Object3D();
  fpMuzzle.position.set(0, 0, -0.6);
  firstPersonGun.add(fpMuzzle);

  const tpMuzzle = new THREE.Object3D();
  tpMuzzle.position.set(0.5, 1.35, -0.8);
  game.visuals.player.playerGroup.add(tpMuzzle);

  const flashMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xffff88 }),
  );
  flashMesh.visible = false;
  game.scene.add(flashMesh);

  const flashLight = new THREE.PointLight(0xffaa44, 3, 5);
  flashLight.visible = false;
  game.scene.add(flashLight);

  game.visuals.weapon = {
    firstPersonGun,
    tpMuzzle,
    fpMuzzle,
    flashMesh,
    flashLight,
    weaponModels: {
      pistol: {
        tpPos: [0.48, 1.3, -0.22],
        tpScale: [0.8, 0.8, 0.7],
        tpMuzzleZ: -0.38,
        fpPos: [0.22, -0.24, -0.42],
        fpAdsPos: [0.01, -0.12, -0.34],
        fpScale: [0.8, 0.8, 0.72],
        fpMuzzleZ: -0.38,
      },
      sword: {
        tpPos: [0.5, 1.2, -0.2],
        tpScale: [1, 1, 1],
        tpMuzzleZ: -0.2,
        fpPos: [0.4, -0.4, -0.6],
        fpAdsPos: [0.1, -0.2, -0.5],
        fpScale: [1, 1, 1],
        fpMuzzleZ: 0,
      },
      assault: {
        tpPos: [0.5, 1.35, -0.3],
        tpScale: [1, 1, 1],
        tpMuzzleZ: -0.6,
        fpPos: [0.25, -0.2, -0.5],
        fpAdsPos: [0.02, -0.1, -0.36],
        fpScale: [1, 1, 1],
        fpMuzzleZ: -0.6,
      },
      shotgun: {
        tpPos: [0.54, 1.32, -0.28],
        tpScale: [1.28, 1.1, 0.95],
        tpMuzzleZ: -0.74,
        fpPos: [0.28, -0.18, -0.58],
        fpAdsPos: [0.0, -0.08, -0.35],
        fpScale: [1.3, 1.08, 1.02],
        fpMuzzleZ: -0.74,
      },
      sniper: {
        tpPos: [0.56, 1.38, -0.36],
        tpScale: [0.9, 0.95, 1.8],
        tpMuzzleZ: -0.88,
        fpPos: [0.2, -0.15, -0.72],
        fpAdsPos: [0.0, -0.09, -0.28],
        fpScale: [0.92, 0.95, 1.85],
        fpMuzzleZ: -0.88,
      },
    },
  };

  const weaponGlbDefs = {
    pistol:  { file: "/assets/models/Pistol.glb",        scale: 0.125, rotY: 0 },
    assault: { file: "/assets/models/Assault Rifle.glb", scale: 0.125, rotY: 0 },
    shotgun: { file: "/assets/models/Shotgun.glb",       scale: 0.125, rotY: Math.PI / 2, posZ: 0.4 },
    sniper:  { file: "/assets/models/Sniper Rifle.glb",  scale: 0.125, rotY: Math.PI / 2, posZ: 0.4 },
    sword:   { file: "/assets/models/Katana.glb",        scale: 0.16,  rotY: Math.PI, posY: -0.6 },
  };

  const glbGroups = {};
  for (const [key, { file, scale, rotY, posY = 0, posZ = 0 }] of Object.entries(weaponGlbDefs)) {
    const fpGroup = new THREE.Group();
    fpGroup.visible = false;
    firstPersonGun.add(fpGroup);

    const tpGroup = new THREE.Group();
    tpGroup.visible = false;
    game.visuals.player.playerGroup.add(tpGroup);

    glbGroups[key] = { fpGroup, tpGroup, loaded: false };

    new GLTFLoader().load(file, (gltf) => {
      const fpCopy = gltf.scene.clone(true);
      fpCopy.scale.setScalar(scale);
      fpCopy.rotation.y = rotY;
      fpCopy.position.set(0, posY, posZ);
      fpGroup.add(fpCopy);

      const tpCopy = gltf.scene.clone(true);
      tpCopy.scale.setScalar(scale);
      tpCopy.rotation.y = rotY;
      tpCopy.position.set(0, posY, posZ);
      tpGroup.add(tpCopy);

      glbGroups[key].loaded = true;
      if (game.currentWeapon === key) applyWeaponModel();
    });
  }

  game.visuals.weapon.glbGroups = glbGroups;
}

// Swaps an enemy's placeholder box children for a GLB model and starts its walk animation.
function applyEnemyGlb(enemy, gltf, scale) {
  // Remove existing placeholder meshes
  while (enemy.group.children.length > 0) {
    const child = enemy.group.children[0];
    enemy.group.remove(child);
    child.geometry?.dispose();
    if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
    else child.material?.dispose();
  }

  const model = cloneSkinnedScene(gltf.scene);
  model.scale.setScalar(scale);
  model.rotation.y = Math.PI;
  model.traverse((node) => { if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; } });
  enemy.group.add(model);

  const mixer = new THREE.AnimationMixer(model);
  if (gltf.animations?.length > 0) {
    const walkClip = gltf.animations.find((a) => a.name === "Walk")
      ?? gltf.animations.find((a) => a.name === "CharacterArmature|Run")
      ?? gltf.animations.find((a) => /walk|run|gallop/i.test(a.name))
      ?? gltf.animations[0];
    mixer.clipAction(walkClip).play();
  }
  enemy.mixer = mixer;
  enemy.flashPart = null; // can't flash individual GLB meshes easily
}

function buildSharedRuntimeAssets() {
  game.shared.skeletonGltf = null;
  new GLTFLoader().load("/assets/models/Skeleton.glb", (gltf) => {
    game.shared.skeletonGltf = gltf;
  });

  game.shared.swatGltf = null;
  new GLTFLoader().load("/assets/models/SWAT.glb", (gltf) => {
    game.shared.swatGltf = gltf;
    // Swap in the GLB model on any soldiers already in the scene
    for (const enemy of game.enemies) {
      if (enemy.type === "soldier" && !enemy.mixer) {
        applyEnemyGlb(enemy, gltf, 1.0);
      }
    }
  });

  game.shared.wolfGltf = null;
  new GLTFLoader().load("/assets/models/Wolf.glb", (gltf) => {
    game.shared.wolfGltf = gltf;
    // Swap in the GLB model on any dogs already in the scene
    for (const enemy of game.enemies) {
      if (enemy.type === "dog" && !enemy.mixer) {
        applyEnemyGlb(enemy, gltf, 1.0);
      }
    }
  });

  game.shared.characterHeadGltfs = {};
  const characterHeadDefs = {
    patrick: { file: "/assets/models/PatrickHead.glb" },
    iestyn: { file: "/assets/models/iestynhead.glb" }, // Assuming IestynHead.glb exists
    will: { file: "/assets/models/WillHead.glb" },     // Assuming WillHead.glb exists
  };
  for (const [characterId, def] of Object.entries(characterHeadDefs)) {
    new GLTFLoader().load(def.file, (gltf) => {
      game.shared.characterHeadGltfs[characterId] = gltf;
      if (game.myCharacter === characterId && game.visuals?.player?.headGroup) {
        applyCharacterHead(game.visuals.player.headGroup, characterId, { visor: game.visuals.player.visor });
      }
      for (const remote of Object.values(game.remotePlayers)) {
        if (remote.character === characterId && remote.headGroup) {
          applyCharacterHead(remote.headGroup, characterId, { visor: remote.visor });
        }
      }
    });
  }

  game.shared.bulletGeo = new THREE.SphereGeometry(0.06, 6, 6);
  game.shared.trailGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.4, 4);
  game.shared.trailGeo.rotateX(Math.PI / 2);
  game.shared.playerBulletMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc });
  game.shared.enemyBulletMat = new THREE.MeshBasicMaterial({ color: 0xff5533 });
  game.shared.partGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
  game.shared.hpBgGeo = new THREE.PlaneGeometry(1.2, 0.1);
  game.shared.hpFgGeo = new THREE.PlaneGeometry(1.2, 0.08);
  game.shared.hpFgGeo.translate(0.6, 0, 0);
  game.shared.hpBgMat = new THREE.MeshBasicMaterial({ color: 0x331111, side: THREE.DoubleSide });
  game.shared.hpFgMatSoldier = new THREE.MeshBasicMaterial({ color: 0xff2244, side: THREE.DoubleSide });
  game.shared.hpFgMatDog = new THREE.MeshBasicMaterial({ color: 0xff8833, side: THREE.DoubleSide });
  game.shared.hpFgMatSkeleton = new THREE.MeshBasicMaterial({ color: 0xc0ccff, side: THREE.DoubleSide });
}

function createNametag(name) { // Made this function internal to scene.js
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 56;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgba(0,0,0,0.52)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = "bold 30px Rajdhani, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#00ffcc";
  ctx.fillText((name || "?").toUpperCase(), canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.7, 0.37, 1);
  sprite.position.set(0, 2.4, 0);
  return sprite;
}

export function updateRemotePlayerNametag(remotePlayer, newName) {
  if (remotePlayer.nametag) {
    remotePlayer.group.remove(remotePlayer.nametag);
    // Dispose of the old nametag's texture and material to prevent memory leaks
    if (remotePlayer.nametag.material.map) {
      remotePlayer.nametag.material.map.dispose();
    }
    remotePlayer.nametag.material.dispose();
    // Sprites don't typically have geometry, but dispose if it exists for robustness
    remotePlayer.nametag.geometry?.dispose();
  }
  remotePlayer.nametag = createNametag(newName);
  remotePlayer.group.add(remotePlayer.nametag);
}

export function createRemotePlayer(id, initialData = {}) {
  if (game.remotePlayers[id]) {
    return game.remotePlayers[id];
  }

  const { bodyMat, legMat, visorMat } = game.visuals.player;
  const gunMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.3, metalness: 0.8 });
  const group = new THREE.Group();

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 0.4), bodyMat);
  torso.position.y = 1.2;
  group.add(torso);

  const headGroup = new THREE.Group();
  headGroup.position.y = 1.9;
  group.add(headGroup);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.02), visorMat);
  visor.position.set(0, 1.92, -0.18);
  group.add(visor);

  applyCharacterHead(headGroup, initialData.character || null, { visor });

  const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.65, 0.2), bodyMat);
  leftArm.position.set(-0.55, 1.3, 0);
  group.add(leftArm);

  const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.65, 0.2), bodyMat);
  rightArm.position.set(0.55, 1.3, 0);
  group.add(rightArm);

  const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.7, 0.25), legMat);
  leftLeg.position.set(-0.2, 0.4, 0);
  group.add(leftLeg);

  const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.7, 0.25), legMat);
  rightLeg.position.set(0.2, 0.4, 0);
  group.add(rightLeg);

  const remoteGun = new THREE.Group();
  remoteGun.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.3), gunMat));
  const remoteBarrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.5), gunMat);
  remoteBarrel.position.set(0, 0, -0.35);
  remoteGun.add(remoteBarrel);
  remoteGun.position.set(0.5, 1.35, -0.3);
  group.add(remoteGun);

  const playerName = initialData.playerName || `Player ${id.slice(0, 8)}`;
  const nametag = createNametag(playerName);
  group.add(nametag);

  group.position.set(initialData.x ?? 0, initialData.y ?? 0, initialData.z ?? 0);
  game.scene.add(group);

  game.remotePlayers[id] = {
    group,
    headGroup,
    visor,
    remoteGun,
    torso,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    nametag,
    character: initialData.character || null,
    currentWeapon: initialData.currentWeapon || "pistol",
    isCrouching: false,
    walkT: 0,
    prevX: 0,
    prevZ: 0,
    isAlive: initialData.isAlive ?? true,
    isDowned: initialData.isDowned ?? false,
    isSpectating: initialData.isSpectating ?? false,
    hp: initialData.hp ?? 100,
    kills: initialData.kills ?? 0,
    dogKills: initialData.dogKills ?? 0,
    bossKills: initialData.bossKills ?? 0,
    totalKills: initialData.totalKills ?? initialData.kills ?? 0,
    score: initialData.score ?? 0,
    wave: initialData.wave ?? 0,
    playerName,
    playerId: id,
    stats: initialData.stats || {},
  };

  return game.remotePlayers[id];
}

export function updateRemotePlayerVisuals() {
  for (const remote of Object.values(game.remotePlayers)) {
    const pos = remote.group.position;
    const prevX = remote.prevX ?? pos.x;
    const prevZ = remote.prevZ ?? pos.z;
    const dx = pos.x - prevX;
    const dz = pos.z - prevZ;
    const speed = game.dt > 0 ? Math.hypot(dx, dz) / game.dt : 0;
    remote.prevX = pos.x;
    remote.prevZ = pos.z;

    // Walk cycle — drive leg + arm swings from speed, fall-off when idle.
    if (remote.isAlive && !remote.pvpDying && speed > 0.6) {
      const rate = remote.isSprinting || speed > 10 ? 12 : 8;
      remote.walkT = (remote.walkT || 0) + game.dt * rate;
      const swing = Math.sin(remote.walkT) * 0.45;
      if (remote.leftLeg) remote.leftLeg.rotation.x = swing;
      if (remote.rightLeg) remote.rightLeg.rotation.x = -swing;
      if (remote.leftArm) remote.leftArm.rotation.x = -swing * 0.4;
      if (remote.rightArm) remote.rightArm.rotation.x = swing * 0.4;
    } else {
      if (remote.leftLeg) remote.leftLeg.rotation.x *= 0.88;
      if (remote.rightLeg) remote.rightLeg.rotation.x *= 0.88;
      if (remote.leftArm) remote.leftArm.rotation.x *= 0.88;
      if (remote.rightArm) remote.rightArm.rotation.x *= 0.88;
    }

    // Crouch: smoothly squish Y scale.
    const crouchTarget = remote.isCrouching ? 0.65 : 1.0;
    remote.group.scale.y += (crouchTarget - remote.group.scale.y) * Math.min(1, 14 * game.dt);

    // PvP death tilt: rotate torso forward over ~0.9s.
    if (remote.pvpDying) {
      remote.group.rotation.x += (Math.PI / 2 - remote.group.rotation.x) * Math.min(1, 5 * game.dt);
    } else if (Math.abs(remote.group.rotation.x) > 0.01) {
      remote.group.rotation.x += (0 - remote.group.rotation.x) * Math.min(1, 10 * game.dt);
    }

    // Sword swing animation.
    if (remote.currentWeapon === "sword" && remote.swordSwingProgress > 0 && remote.swordSwingProgress < 1) {
      const s = Math.sin(remote.swordSwingProgress * Math.PI);
      if (remote.swordMesh) remote.swordMesh.rotation.set(s * -0.3, s * 2, 0.8);
      if (remote.rightArm) remote.rightArm.rotation.x = -1.0 + s * 1.8;
    } else if (remote.swordMesh) {
      remote.swordMesh.rotation.set(0, 0, 0);
    }

    // Downed remote: tilt toward ground.
    if (remote.isDowned && !remote.pvpDying) {
      remote.group.rotation.x += (Math.PI / 2 - remote.group.rotation.x) * Math.min(1, 6 * game.dt);
    }
  }
}

export function removeRemotePlayer(id) {
  const remotePlayer = game.remotePlayers[id];
  if (!remotePlayer) {
    return;
  }

  game.scene.remove(remotePlayer.group);
  delete game.remotePlayers[id];
}

export function applyWeaponModel() {
  const model = game.visuals.weapon.weaponModels[game.currentWeapon];
  const wv = game.visuals.weapon;

  wv.firstPersonGun.position.set(...model.fpPos);
  wv.firstPersonGun.scale.set(1, 1, 1);
  wv.firstPersonGun.rotation.set(0, 0, 0);
  wv.fpMuzzle.position.set(0, 0, model.fpMuzzleZ);
  wv.tpMuzzle.position.set(model.tpPos[0], model.tpPos[1], model.tpPos[2] + model.tpMuzzleZ);

  if (wv.glbGroups) {
    for (const [key, g] of Object.entries(wv.glbGroups)) {
      const active = key === game.currentWeapon && g.loaded;
      g.fpGroup.visible = active;
      g.tpGroup.visible = active;
      if (active) {
        g.tpGroup.position.set(...model.tpPos);
        g.tpGroup.scale.set(1, 1, 1);
      }
    }
  }
}

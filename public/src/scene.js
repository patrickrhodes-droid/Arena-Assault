import * as THREE from "three";

import { ARENA_SIZE, HALF, WALL_H } from "./config.js";
import { game } from "./state.js";

export function initScene() {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x1b2734, 0.008);
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

  addLighting();
  buildArena();
  buildPlayer();
  buildWeaponVisuals();
  buildSharedRuntimeAssets();
}

function addLighting() {
  const dirLight = new THREE.DirectionalLight(0xfff5e0, 1.65);
  dirLight.position.set(20, 30, 10);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(2048, 2048);
  dirLight.shadow.camera.left = -40;
  dirLight.shadow.camera.right = 40;
  dirLight.shadow.camera.top = 40;
  dirLight.shadow.camera.bottom = -40;
  dirLight.shadow.camera.near = 1;
  dirLight.shadow.camera.far = 80;
  dirLight.shadow.bias = -0.001;
  game.scene.add(dirLight);

  game.scene.add(new THREE.HemisphereLight(0x8fb7ff, 0x24303c, 0.8));

  for (let index = 0; index < 9; index += 1) {
    const x = (Math.random() - 0.5) * 60;
    const z = (Math.random() - 0.5) * 60;
    const pointLight = new THREE.PointLight(0x55e6cc, 1.15, 18);
    pointLight.position.set(x, 0.3, z);
    game.scene.add(pointLight);

    const decal = new THREE.Mesh(
      new THREE.CircleGeometry(0.3, 12),
      new THREE.MeshStandardMaterial({ color: 0x00ccaa, emissive: 0x00ccaa, emissiveIntensity: 0.5 }),
    );
    decal.rotation.x = -Math.PI / 2;
    decal.position.set(x, 0.01, z);
    game.scene.add(decal);
  }
}

function buildArena() {
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
  game.scene.add(ground);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x46515d, roughness: 0.82 });
  const stripMat = new THREE.MeshStandardMaterial({
    color: 0x3ce6cb,
    emissive: 0x3ce6cb,
    emissiveIntensity: 1.15,
  });

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
    game.scene.add(mesh);

    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(
        wall.size[0] * 0.99,
        0.25,
        wall.size[2] > 1 ? 0.25 : wall.size[2] * 0.99,
      ),
      stripMat,
    );
    strip.position.set(wall.position[0], WALL_H - 0.5, wall.position[2]);
    game.scene.add(strip);
  });

  const crateMat = new THREE.MeshStandardMaterial({ color: 0x8b6b47, roughness: 0.92 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x7c90a3, roughness: 0.35, metalness: 0.62 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x3a424d, roughness: 0.58, metalness: 0.22 });

  game.shared.worldMaterials = { crateMat, metalMat, darkMat };

  addWorldBox(-15, 0.75, -15, 1.5, 1.5, 1.5, crateMat);
  addWorldBox(-13.5, 0.75, -15, 1.5, 1.5, 1.5, crateMat);
  addWorldBox(-15, 0.75, -13.5, 1.5, 1.5, 1.5, crateMat);
  addWorldBox(15, 0.75, 10, 1.5, 1.5, 1.5, crateMat);
  addWorldBox(16.5, 0.75, 10, 1.5, 1.5, 1.5, crateMat);
  addWorldBox(-10, 0.75, 20, 1.5, 1.5, 1.5, crateMat);
  addWorldBox(-8.5, 0.75, 20, 1.5, 1.5, 1.5, crateMat);
  addWorldBox(-10, 0.75, 21.5, 1.5, 1.5, 1.5, crateMat);
  addWorldBox(20, 0.75, -20, 1.5, 1.5, 1.5, crateMat);
  addWorldBox(21.5, 0.75, -20, 1.5, 1.5, 1.5, crateMat);

  addWorldBox(0, 0.6, -12, 3, 1.2, 0.3, metalMat);
  addWorldBox(8, 0.6, 5, 3, 1.2, 0.3, metalMat);
  addWorldBox(-18, 0.6, 0, 0.3, 1.2, 3, metalMat);
  addWorldBox(5, 0.6, -25, 3, 1.2, 0.3, metalMat);
  addWorldBox(-5, 0.6, 15, 0.3, 1.2, 3, metalMat);
  addWorldBox(12, 0.6, -8, 3, 1.2, 0.3, metalMat);

  addWorldBox(-6, 0.55, 8, 3.2, 1.1, 3.2, metalMat);
  addWorldBox(-1.5, 1.05, 8, 3.2, 2.1, 3.2, metalMat);
  addWorldBox(3, 1.55, 8, 3.2, 3.1, 3.2, metalMat);
  addWorldBox(9, 0.7, 18, 3.6, 1.4, 3.6, darkMat);
  addWorldBox(14, 1.15, 18, 3.6, 2.3, 3.6, darkMat);
  addWorldBox(19, 1.55, 18, 3.6, 3.1, 3.6, darkMat);
  addWorldBox(-22, 0.5, -6, 2.6, 1.0, 2.6, crateMat);
  addWorldBox(-18.5, 0.95, -6, 2.6, 1.9, 2.6, crateMat);
  addWorldBox(-15, 1.35, -6, 2.6, 2.7, 2.6, crateMat);
}

function addWorldBox(x, y, z, width, height, depth, material, castShadow = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  game.scene.add(mesh);
  game.oBs.push({
    min: { x: x - width / 2, z: z - depth / 2 },
    max: { x: x + width / 2, z: z + depth / 2 },
    h: height,
  });
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

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), bodyMat);
  head.position.y = 1.9;
  playerGroup.add(head);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.02), visorMat);
  visor.position.set(0, 1.92, -0.18);
  playerGroup.add(visor);

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
    legMat,
    visorMat,
    torso,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    leftBoot,
    rightBoot,
  };
}

function buildWeaponVisuals() {
  const gunMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.3, metalness: 0.8 });
  const sightMat = new THREE.MeshStandardMaterial({
    color: 0xffcc66,
    emissive: 0xffb347,
    emissiveIntensity: 0.65,
    transparent: true,
    opacity: 0.42,
  });

  const thirdPersonGun = new THREE.Group();
  const tpBarrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.5), gunMat);
  tpBarrel.position.set(0, 0, -0.35);
  thirdPersonGun.add(tpBarrel);
  thirdPersonGun.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.3), gunMat));

  const tpGrip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.04), gunMat);
  tpGrip.position.set(0, -0.12, 0.05);
  thirdPersonGun.add(tpGrip);

  const tpSight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.035, 0.02), sightMat);
  tpSight.position.set(0, 0.07, -0.1);
  thirdPersonGun.add(tpSight);

  const tpMag = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.06), gunMat);
  tpMag.position.set(0, -0.08, 0.05);
  thirdPersonGun.add(tpMag);
  thirdPersonGun.position.set(0.5, 1.35, -0.3);

  game.visuals.player.playerGroup.add(thirdPersonGun);

  const tpMuzzle = new THREE.Object3D();
  tpMuzzle.position.set(0, 0, -0.6);
  thirdPersonGun.add(tpMuzzle);

  const firstPersonGun = new THREE.Group();
  const fpBarrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.5), gunMat);
  fpBarrel.position.set(0, 0, -0.35);
  firstPersonGun.add(fpBarrel);
  firstPersonGun.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.3), gunMat));

  const fpGrip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.04), gunMat);
  fpGrip.position.set(0, -0.12, 0.05);
  firstPersonGun.add(fpGrip);

  const fpSight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.035, 0.02), sightMat);
  fpSight.position.set(0, 0.07, -0.1);
  firstPersonGun.add(fpSight);

  const fpMag = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.06), gunMat);
  fpMag.position.set(0, -0.08, 0.05);
  firstPersonGun.add(fpMag);
  firstPersonGun.position.set(0.25, -0.2, -0.5);
  firstPersonGun.visible = false;
  game.camera.add(firstPersonGun);
  game.scene.add(game.camera);

  const fpMuzzle = new THREE.Object3D();
  fpMuzzle.position.set(0, 0, -0.6);
  firstPersonGun.add(fpMuzzle);

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
    gunMat,
    sightMat,
    thirdPersonGun,
    firstPersonGun,
    tpMuzzle,
    fpMuzzle,
    tpBarrel,
    fpBarrel,
    tpSight,
    fpSight,
    flashMesh,
    flashLight,
    weaponModels: {
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
        fpAdsPos: [0.03, -0.11, -0.5],
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
}

function buildSharedRuntimeAssets() {
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
}

export function createRemotePlayer(id, initialData = {}) {
  if (game.remotePlayers[id]) {
    return game.remotePlayers[id];
  }

  const { bodyMat, legMat, visorMat } = game.visuals.player;
  const gunMat = game.visuals.weapon.gunMat;
  const group = new THREE.Group();

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 0.4), bodyMat);
  torso.position.y = 1.2;
  group.add(torso);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), bodyMat);
  head.position.y = 1.9;
  group.add(head);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.02), visorMat);
  visor.position.set(0, 1.92, -0.18);
  group.add(visor);

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

  group.position.set(initialData.x ?? 0, initialData.y ?? 0, initialData.z ?? 0);
  game.scene.add(group);

  game.remotePlayers[id] = {
    group,
    leftLeg,
    rightLeg,
    walkT: 0,
    isAlive: initialData.isAlive ?? true,
    isDowned: initialData.isDowned ?? false,
    isSpectating: initialData.isSpectating ?? false,
    kills: initialData.kills ?? 0,
    dogKills: initialData.dogKills ?? 0,
    bossKills: initialData.bossKills ?? 0,
    totalKills: initialData.totalKills ?? initialData.kills ?? 0,
    score: initialData.score ?? 0,
    wave: initialData.wave ?? 0,
    playerName: initialData.playerName || `Player ${id.slice(0, 8)}`,
    playerId: id,
    stats: initialData.stats || {},
  };

  return game.remotePlayers[id];
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
  const weaponVisuals = game.visuals.weapon;

  weaponVisuals.thirdPersonGun.position.set(...model.tpPos);
  weaponVisuals.thirdPersonGun.scale.set(...model.tpScale);
  weaponVisuals.tpMuzzle.position.set(0, 0, model.tpMuzzleZ);

  weaponVisuals.firstPersonGun.position.set(...model.fpPos);
  weaponVisuals.firstPersonGun.scale.set(...model.fpScale);
  weaponVisuals.firstPersonGun.rotation.set(0, 0, 0);
  weaponVisuals.fpMuzzle.position.set(0, 0, model.fpMuzzleZ);

  if (game.currentWeapon === "sword") {
    weaponVisuals.fpBarrel.scale.set(0.2, 2.5, 0.05);
    weaponVisuals.fpBarrel.position.set(0, 0.2, -0.4);
  } else {
    weaponVisuals.fpBarrel.scale.set(1, 1, 1);
    weaponVisuals.fpBarrel.position.set(0, 0, -0.35);
  }

  weaponVisuals.sightMat.emissiveIntensity =
    game.currentWeapon === "sniper" ? 0.75 : game.currentWeapon === "shotgun" ? 0.24 : 0.38;
  weaponVisuals.tpSight.scale.setScalar(game.currentWeapon === "sniper" ? 0.68 : 0.88);
  weaponVisuals.fpSight.scale.setScalar(game.currentWeapon === "sniper" ? 0.52 : 0.72);
}

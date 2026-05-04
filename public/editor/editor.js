import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const ARENA_SIZE = 144;
const HALF = ARENA_SIZE / 2;

const materials = {
  metal: new THREE.MeshStandardMaterial({ color: 0x7ba1ac, roughness: 0.42, metalness: 0.45 }),
  crate: new THREE.MeshStandardMaterial({ color: 0x8a6648, roughness: 0.88 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0x9ca3a6, roughness: 0.82 }),
  sandstone: new THREE.MeshStandardMaterial({ color: 0xc2906a, roughness: 0.9 }),
  blacksite: new THREE.MeshStandardMaterial({ color: 0x273234, roughness: 0.74, metalness: 0.2 }),
  ladder: new THREE.MeshStandardMaterial({ color: 0xe0bd64, roughness: 0.45, metalness: 0.35 }),
  spawnPlayer: new THREE.MeshStandardMaterial({ color: 0x2de1d0, emissive: 0x0b7068, roughness: 0.55 }),
  spawnEnemy: new THREE.MeshStandardMaterial({ color: 0xff5a67, emissive: 0x62141b, roughness: 0.55 }),
  ghost: new THREE.MeshStandardMaterial({ color: 0x8db7ff, transparent: true, opacity: 0.38, roughness: 0.5 }),
};

const state = {
  map: { version: 2, name: "sandbox", theme: "arena", objects: [] },
  objects: [],
  selected: null,
  glbCache: new Map(),
  mapNames: [],
  assets: [],
  showCollision: false,
};

const els = {
  canvas: document.querySelector("#viewport"),
  mapSelect: document.querySelector("#map-select"),
  mapName: document.querySelector("#map-name"),
  loadMap: document.querySelector("#load-map"),
  saveMap: document.querySelector("#save-map"),
  saveAsMap: document.querySelector("#save-as-map"),
  objectList: document.querySelector("#object-list"),
  objectFilter: document.querySelector("#object-filter"),
  selectedLabel: document.querySelector("#selected-label"),
  objectType: document.querySelector("#object-type"),
  materialSelect: document.querySelector("#material-select"),
  assetSelect: document.querySelector("#asset-select"),
  spawnType: document.querySelector("#spawn-type"),
  triggerRadius: document.querySelector("#trigger-radius"),
  colliderRow: document.querySelector("#collider-row"),
  collidableToggle: document.querySelector("#collidable-toggle"),
  collisionVisToggle: document.querySelector("#collision-vis-toggle"),
  fullscreenBtn: document.querySelector("#fullscreen-btn"),
  duplicateObject: document.querySelector("#duplicate-object"),
  deleteObject: document.querySelector("#delete-object"),
  copyJson: document.querySelector("#copy-json"),
  downloadJson: document.querySelector("#download-json"),
  snapToggle: document.querySelector("#snap-toggle"),
  statusText: document.querySelector("#status-text"),
  objectCount: document.querySelector("#object-count"),
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x10141a);
scene.fog = new THREE.FogExp2(0x10141a, 0.004);

const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 500);
camera.position.set(34, 42, 54);

const renderer = new THREE.WebGLRenderer({ canvas: els.canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.target.set(0, 0, 0);
orbit.enableDamping = true;
orbit.maxPolarAngle = Math.PI * 0.49;

const transform = new TransformControls(camera, renderer.domElement);
transform.setTranslationSnap(0.5);
transform.setRotationSnap(THREE.MathUtils.degToRad(15));
transform.setScaleSnap(0.25);
scene.add(transform);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const gltfLoader = new GLTFLoader();

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(ARENA_SIZE, ARENA_SIZE, 16, 16),
  new THREE.MeshStandardMaterial({ color: 0x26313b, roughness: 0.92 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(ARENA_SIZE, ARENA_SIZE / 4, 0x3f5366, 0x27333f);
scene.add(grid);

const bounds = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(ARENA_SIZE, 0.2, ARENA_SIZE)),
  new THREE.LineBasicMaterial({ color: 0x2de1d0 }),
);
bounds.position.y = 0.1;
scene.add(bounds);

scene.add(new THREE.HemisphereLight(0x9ecbff, 0x1d252e, 0.9));
const sun = new THREE.DirectionalLight(0xffffff, 2.1);
sun.position.set(34, 72, 24);
sun.castShadow = true;
sun.shadow.camera.left = -80;
sun.shadow.camera.right = 80;
sun.shadow.camera.top = 80;
sun.shadow.camera.bottom = -80;
scene.add(sun);

transform.addEventListener("dragging-changed", (event) => {
  orbit.enabled = !event.value;
});

transform.addEventListener("objectChange", () => {
  if (!state.selected) return;
  syncDataFromMesh(state.selected);
  refreshInspector();
  refreshList();
});

function uid(type) {
  return `${type}_${Math.random().toString(36).slice(2, 8)}`;
}

function setStatus(text) {
  els.statusText.textContent = text;
}

function normalizeObject(obj) {
  const type = obj.type || "box";
  // Preserve any unknown fields so future metadata is not dropped on save.
  const known = ["id","type","label","position","rotation","size","scale","material",
                 "model","collidable","spawnType","triggerRadius","bounds","collider"];
  const extra = {};
  for (const k of Object.keys(obj)) { if (!known.includes(k)) extra[k] = obj[k]; }
  return {
    ...extra,
    id: obj.id || uid(type),
    type,
    label: obj.label || type,
    position: obj.position || [0, type === "box" ? 1 : 0, 0],
    rotation: obj.rotation || [0, 0, 0],
    size: obj.size || [2, 2, 2],
    // Props and destructibles use scale; boxes ignore it.
    scale: obj.scale || (Array.isArray(obj.scale) ? obj.scale : [1, 1, 1]),
    material: obj.material || "metal",
    model: obj.model || state.assets[0] || "",
    collidable: obj.collidable ?? (type === "box" || type === "prop" || type === "destructible"),
    spawnType: obj.spawnType || "player",
    triggerRadius: obj.triggerRadius ?? 2.2,
    ...(obj.bounds ? { bounds: obj.bounds } : {}),
    ...(obj.collider ? { collider: obj.collider } : {}),
  };
}

function createMesh(data) {
  const group = new THREE.Group();
  group.userData.mapObject = data;

  if ((data.type === "prop" || data.type === "destructible") && data.model) {
    addPropPreview(group, data);
    addCollisionGhost(group, data);
  } else if (data.type === "ladder") {
    const railGeo = new THREE.BoxGeometry(0.08, data.size[1], 0.08);
    const rungGeo = new THREE.BoxGeometry(data.size[0], 0.06, 0.08);
    const left = new THREE.Mesh(railGeo, materials.ladder);
    const right = new THREE.Mesh(railGeo, materials.ladder);
    left.position.x = -data.size[0] * 0.5;
    right.position.x = data.size[0] * 0.5;
    group.add(left, right);
    for (let y = -data.size[1] * 0.45; y <= data.size[1] * 0.45; y += 0.55) {
      const rung = new THREE.Mesh(rungGeo, materials.ladder);
      rung.position.y = y;
      group.add(rung);
    }
  } else if (data.type === "spawn") {
    const mat = data.spawnType === "enemy" || data.spawnType === "boss" ? materials.spawnEnemy : materials.spawnPlayer;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(data.size[0] * 0.5, data.size[0] * 0.5, 0.12, 24), mat);
    mesh.position.y = 0.06;
    mesh.castShadow = true;
    group.add(mesh);
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.7, 16), mat);
    arrow.rotation.x = Math.PI / 2;
    arrow.position.set(0, 0.22, -0.55);
    group.add(arrow);
  } else {
    const mat = materials[data.material] || materials.metal;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(data.size[0], data.size[1], data.size[2]), mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  group.position.fromArray(data.position);
  group.rotation.set(...data.rotation);
  group.traverse((child) => {
    child.userData.selectRoot = group;
  });
  scene.add(group);
  return group;
}

function addCollisionGhost(group, data) {
  if (!data.collidable) return;
  const sz = data.collider?.size || data.size;
  const ghost = new THREE.Mesh(new THREE.BoxGeometry(sz[0], sz[1], sz[2]), materials.ghost);
  ghost.position.y = sz[1] * 0.5;
  ghost.visible = state.showCollision;
  ghost.userData.isCollisionGhost = true;
  group.add(ghost);
}

function addPropPreview(group, data) {
  const cached = state.glbCache.get(data.model);
  if (cached) {
    addGltfClone(group, cached, data);
    return;
  }

  gltfLoader.load(data.model, (gltf) => {
    state.glbCache.set(data.model, gltf);
    if (group.parent) addGltfClone(group, gltf, data);
  }, undefined, () => {
    const fallback = new THREE.Mesh(new THREE.BoxGeometry(data.size[0], data.size[1], data.size[2]), materials.ghost);
    fallback.position.y = data.size[1] * 0.5;
    group.add(fallback);
  });
}

function addGltfClone(group, gltf, data) {
  const clone = gltf.scene.clone(true);
  // Props/destructibles use `scale`; fall back to size[0] for old objects.
  const s = Array.isArray(data.scale) ? data.scale[0] : (data.scale ?? data.size[0] ?? 1);
  clone.scale.setScalar(s);
  clone.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = true;
      node.receiveShadow = true;
      node.userData.selectRoot = group;
    }
  });
  group.add(clone);
}

function rebuildObjectView() {
  for (const item of state.objects) {
    scene.remove(item.mesh);
    item.mesh.traverse((child) => {
      child.geometry?.dispose?.();
    });
  }
  state.objects = state.map.objects.map((obj) => {
    const data = normalizeObject(obj);
    return { data, mesh: createMesh(data) };
  });
  state.map.objects = state.objects.map((item) => item.data);
  selectObject(state.objects[0] || null);
  refreshList();
}

function syncDataFromMesh(item) {
  const data = item.data;
  data.position = item.mesh.position.toArray().map(round);
  data.rotation = [item.mesh.rotation.x, item.mesh.rotation.y, item.mesh.rotation.z].map(round);

  if (transform.getMode() === "scale") {
    data.size = [
      Math.max(0.1, data.size[0] * item.mesh.scale.x),
      Math.max(0.1, data.size[1] * item.mesh.scale.y),
      Math.max(0.1, data.size[2] * item.mesh.scale.z),
    ].map(round);
    item.mesh.scale.set(1, 1, 1);
    rebuildObjectMesh(item);
  }
}

function rebuildObjectMesh(item) {
  const wasSelected = state.selected === item;
  scene.remove(item.mesh);
  item.mesh.traverse((child) => child.geometry?.dispose?.());
  item.mesh = createMesh(item.data);
  if (wasSelected) selectObject(item);
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function selectObject(item) {
  state.selected = item;
  transform.detach();
  if (item) transform.attach(item.mesh);
  refreshInspector();
  refreshList();
}

function refreshList() {
  const filter = els.objectFilter?.value || "all";
  els.objectList.innerHTML = "";
  let shown = 0;
  for (const item of state.objects) {
    const t = item.data.type;
    if (filter !== "all") {
      if (filter === "collidable" && !item.data.collidable) continue;
      else if (filter !== "collidable" && t !== filter) continue;
    }
    shown++;
    const row = document.createElement("div");
    row.className = `object-row${item === state.selected ? " selected" : ""}`;
    row.innerHTML = `<strong></strong><span></span>`;
    row.querySelector("strong").textContent = item.data.label || item.data.id;
    row.querySelector("span").textContent = t;
    row.addEventListener("click", () => selectObject(item));
    els.objectList.append(row);
  }
  els.objectCount.textContent = `${shown}/${state.objects.length} object${state.objects.length === 1 ? "" : "s"}`;
}

function refreshInspector() {
  const item = state.selected;
  const disabled = !item;
  for (const el of document.querySelectorAll("#right-panel input, #right-panel select, #right-panel button")) {
    el.disabled = disabled && !["copy-json", "download-json"].includes(el.id);
  }
  if (!item) {
    els.selectedLabel.value = "";
    return;
  }

  const data = item.data;
  els.selectedLabel.value = data.label || "";
  els.objectType.value = data.type;
  els.materialSelect.value = data.material || "metal";
  els.assetSelect.value = data.model || "";
  els.spawnType.value = data.spawnType || "player";
  els.collidableToggle.checked = !!data.collidable;

  // Show trigger radius only for destructibles
  if (els.triggerRadius) {
    const isDestr = data.type === "destructible";
    const d = isDestr ? "" : "none";
    els.triggerRadius.style.display = d;
    const lbl = document.querySelector("#trigger-radius-label");
    if (lbl) lbl.style.display = d;
    if (isDestr) els.triggerRadius.value = data.triggerRadius ?? 2.2;
  }

  // Collider size row — visible for props and destructibles
  const hasPropCollider = data.type === "prop" || data.type === "destructible";
  if (els.colliderRow) {
    els.colliderRow.style.display = hasPropCollider ? "" : "none";
    if (hasPropCollider) {
      const csize = data.collider?.size || [1, 1, 1];
      document.querySelectorAll("[data-collider]").forEach((input) => {
        input.value = csize[Number(input.dataset.collider)] ?? 1;
      });
    }
  }

  for (const input of document.querySelectorAll("[data-field]")) {
    const field = input.dataset.field;
    const index = Number(input.dataset.index);
    // For props/destructibles, show scale in the size inputs for ergonomics
    const useScale = (field === "size") && (data.type === "prop" || data.type === "destructible") && Array.isArray(data.scale);
    const source = useScale ? data.scale : (data[field] || [0, 0, 0]);
    input.value = field === "rotation"
      ? Math.round(THREE.MathUtils.radToDeg(source[index] || 0))
      : source[index] ?? 0;
  }
}

function addObject(type) {
  const data = normalizeObject({
    type,
    label: `${type} ${state.objects.length + 1}`,
    position: [0, type === "box" ? 1 : 0, 0],
    size: type === "ladder" ? [1.4, 6, 0.2] : type === "spawn" ? [1.4, 0.1, 1.4] : [2, 2, 2],
    scale: [1, 1, 1],
    material: type === "box" ? "metal" : "crate",
    collidable: type === "box" || type === "prop" || type === "destructible",
    triggerRadius: type === "destructible" ? 2.2 : undefined,
  });
  state.map.objects.push(data);
  const item = { data, mesh: createMesh(data) };
  state.objects.push(item);
  selectObject(item);
  refreshList();
  setStatus(`Added ${type}`);
}

function deleteSelected() {
  const item = state.selected;
  if (!item) return;
  const index = state.objects.indexOf(item);
  scene.remove(item.mesh);
  item.mesh.traverse((child) => child.geometry?.dispose?.());
  state.objects.splice(index, 1);
  state.map.objects = state.objects.map((entry) => entry.data);
  selectObject(state.objects[Math.min(index, state.objects.length - 1)] || null);
  setStatus("Deleted object");
}

function duplicateSelected() {
  const item = state.selected;
  if (!item) return;
  const copy = normalizeObject(JSON.parse(JSON.stringify(item.data)));
  copy.id = uid(copy.type);
  copy.label = `${copy.label || copy.type} Copy`;
  copy.position[0] += 1;
  copy.position[2] += 1;
  state.map.objects.push(copy);
  const newItem = { data: copy, mesh: createMesh(copy) };
  state.objects.push(newItem);
  selectObject(newItem);
  refreshList();
  setStatus("Duplicated object");
}

function serializeMap() {
  // Preserve all top-level metadata from the loaded map (fog, background, etc.)
  return {
    ...state.map,
    version: 2,
    name: els.mapName.value.trim() || state.map.name || "sandbox",
    objects: state.objects.map((item) => item.data),
  };
}

async function loadMapsList() {
  const res = await fetch("/api/maps");
  const { maps } = await res.json();
  state.mapNames = maps;
  els.mapSelect.innerHTML = "";
  for (const map of maps) {
    const option = document.createElement("option");
    option.value = map;
    option.textContent = map;
    els.mapSelect.append(option);
  }
  if (maps.includes("sandbox")) els.mapSelect.value = "sandbox";
}

async function loadAssets() {
  const res = await fetch("/api/assets");
  const { assets } = await res.json();
  state.assets = assets;
  els.assetSelect.innerHTML = "";
  for (const asset of assets) {
    const option = document.createElement("option");
    option.value = asset;
    option.textContent = asset.split("/").pop();
    els.assetSelect.append(option);
  }
}

async function loadMap(name) {
  const res = await fetch(`/api/maps/${encodeURIComponent(name)}`);
  if (!res.ok) {
    setStatus("Map load failed");
    return;
  }
  state.map = await res.json();
  state.map.objects ||= [];
  els.mapName.value = state.map.name || name;
  rebuildObjectView();
  setStatus(`Loaded ${name}`);
}

async function saveMap() {
  const map = serializeMap();
  const res = await fetch(`/api/maps/${encodeURIComponent(map.name)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(map),
  });
  if (!res.ok) {
    setStatus("Save failed");
    return;
  }
  await loadMapsList();
  els.mapSelect.value = map.name;
  setStatus(`Saved ${map.name}`);
}

function updateSelectedFromInspector(event) {
  const item = state.selected;
  if (!item) return;
  const data = item.data;
  const target = event.target;

  if (target === els.selectedLabel) data.label = target.value;
  if (target === els.objectType) data.type = target.value;
  if (target === els.materialSelect) data.material = target.value;
  if (target === els.assetSelect) data.model = target.value;
  if (target === els.spawnType) data.spawnType = target.value;
  if (target === els.collidableToggle) data.collidable = target.checked;
  if (target === els.triggerRadius) data.triggerRadius = Number(target.value) || 2.2;

  if (target.dataset.collider !== undefined) {
    const index = Number(target.dataset.collider);
    const value = Math.max(0.1, Number(target.value) || 0.1);
    data.collider ||= { type: "box", position: [...data.position], size: [1, 1, 1] };
    data.collider.size[index] = value;
    // Keep collider position in sync with object position
    data.collider.position = [...data.position];
  } else if (target.dataset.field) {
    const field = target.dataset.field;
    const index = Number(target.dataset.index);
    const value = Number(target.value) || 0;
    // For props/destructibles, size inputs control scale
    if (field === "size" && (data.type === "prop" || data.type === "destructible")) {
      data.scale ||= [1, 1, 1];
      data.scale[index] = value;
    } else {
      data[field] ||= [0, 0, 0];
      data[field][index] = field === "rotation" ? THREE.MathUtils.degToRad(value) : value;
    }
    // If position changed and a collider exists, keep it centred
    if (field === "position" && data.collider) {
      data.collider.position = [...data.position];
    }
  }

  rebuildObjectMesh(item);
  refreshInspector();
  refreshList();
}

function copyJson() {
  navigator.clipboard?.writeText(JSON.stringify(serializeMap(), null, 2));
  setStatus("Copied JSON");
}

function downloadJson() {
  const map = serializeMap();
  const blob = new Blob([`${JSON.stringify(map, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${map.name}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function pickObject(event) {
  if (event.target !== renderer.domElement || transform.dragging) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const roots = state.objects.map((item) => item.mesh);
  const hits = raycaster.intersectObjects(roots, true);
  const root = hits[0]?.object?.userData?.selectRoot;
  const item = state.objects.find((entry) => entry.mesh === root);
  if (item) selectObject(item);
}

function onResize() {
  const rect = els.canvas.parentElement.getBoundingClientRect();
  renderer.setSize(rect.width, rect.height, false);
  camera.aspect = rect.width / rect.height;
  camera.updateProjectionMatrix();
}

function animate() {
  requestAnimationFrame(animate);
  orbit.update();
  renderer.render(scene, camera);
}

document.querySelectorAll("[data-add]").forEach((button) => {
  button.addEventListener("click", () => addObject(button.dataset.add));
});

document.querySelectorAll("[data-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-mode]").forEach((el) => el.classList.toggle("selected", el === button));
    transform.setMode(button.dataset.mode);
  });
});

els.snapToggle.addEventListener("change", () => {
  const enabled = els.snapToggle.checked;
  transform.setTranslationSnap(enabled ? 0.5 : null);
  transform.setRotationSnap(enabled ? THREE.MathUtils.degToRad(15) : null);
  transform.setScaleSnap(enabled ? 0.25 : null);
});

els.loadMap.addEventListener("click", () => loadMap(els.mapSelect.value));
els.saveMap.addEventListener("click", saveMap);
els.saveAsMap?.addEventListener("click", async () => {
  const newName = prompt("Save as (new map name):", els.mapName.value + "_copy");
  if (!newName) return;
  els.mapName.value = newName.trim();
  await saveMap();
});
els.objectFilter?.addEventListener("change", refreshList);
els.collisionVisToggle?.addEventListener("change", () => {
  state.showCollision = els.collisionVisToggle.checked;
  for (const item of state.objects) {
    item.mesh.traverse((child) => {
      if (child.userData.isCollisionGhost) child.visible = state.showCollision;
    });
  }
});
els.duplicateObject.addEventListener("click", duplicateSelected);
els.deleteObject.addEventListener("click", deleteSelected);
els.copyJson.addEventListener("click", copyJson);
els.downloadJson.addEventListener("click", downloadJson);
els.canvas.addEventListener("pointerdown", pickObject);

for (const input of document.querySelectorAll("#right-panel input, #right-panel select")) {
  input.addEventListener("change", updateSelectedFromInspector);
  input.addEventListener("input", (event) => {
    const t = event.target;
    if (t === els.selectedLabel || t === els.triggerRadius || t.dataset.field || t.dataset.collider !== undefined) {
      updateSelectedFromInspector(event);
    }
  });
}

els.fullscreenBtn?.addEventListener("click", () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
    els.fullscreenBtn.textContent = "⛶";
  } else {
    document.exitFullscreen();
  }
});

document.addEventListener("fullscreenchange", () => {
  if (els.fullscreenBtn) {
    els.fullscreenBtn.textContent = document.fullscreenElement ? "✕" : "⛶";
    els.fullscreenBtn.title = document.fullscreenElement ? "Exit fullscreen" : "Toggle fullscreen";
  }
});

window.addEventListener("keydown", (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
  if (event.key === "Delete" || event.key === "Backspace") deleteSelected();
  if (event.key.toLowerCase() === "d" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    duplicateSelected();
  }
  if (event.key.toLowerCase() === "w") transform.setMode("translate");
  if (event.key.toLowerCase() === "e") transform.setMode("rotate");
  if (event.key.toLowerCase() === "r") transform.setMode("scale");
});

window.addEventListener("resize", onResize);

await loadAssets();
await loadMapsList();
await loadMap(els.mapSelect.value || "sandbox");
onResize();
animate();

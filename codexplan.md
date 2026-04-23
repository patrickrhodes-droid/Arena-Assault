Add these changes :alert when someone is down and alert on minimap (minimap should be bigger) 
nametags above head 
inventory display at the bottom of screen
teammates health and status in top left in list under your health
boss health is too low , sniper should take at least 15 shots
the regular enemies no longer shoot at anyone since the refactor only the dogs are doing damage right now
respawn next round doesnt work right now 
the sword should 1hko the regular enemies and dogs add a pistol and make it be in slot 1
2:18 PM


I’m mapping the requested gameplay and UI changes onto the current modules first, then I’ll patch the files in one pass and update the README to match. The main areas are weapon config/combat, enemy damage flow, HUD/UI, and the respawn/network path.


Ran 6 commands
I’ve isolated the main work: the soldier damage regression, the next-wave respawn path, and the HUD expansion. I’m pulling the remaining multiplayer and rendering files now so I can patch the flow coherently and update the README in the same pass.


Ran 6 commands
I’ve got the change list translated into concrete patches. Before editing, I’m checking server.js for the player state fields so the teammate health/status panel and respawn fixes use the same network schema.

Ran Get-Content server.js
I’m editing the gameplay and HUD files now. This patch adds the new pistol/loadout UI, teammate health and down alerts, fixes soldier bullet hit detection, raises boss durability, adds nametags, and updates the README to match the current game state.

The first patch hit a context mismatch in index.html, so I’m switching to smaller targeted edits to keep the changes precise and avoid clobbering unrelated markup.

Ran rg -n "1 2 3 4|minimap|health-bar-wrap|wave-announce|revive-prompt-hud" public/index.html public/src/config.js public/src/combat.js public/src/player.js public/src/enemies.js public/src/scene.js public/src/ui.js server.js README.md
Ran Get-Content public/index.html | Select-Object -First 130
Edited file
combat.js
+22
-9


import { B_SPD_E, DEFAULT_WEAPON, P_MAX_HP, WEAPON_DEFS } from "./config.js";
import { B_SPD_E, DEFAULT_WEAPON, P_MAX_HP, WEAPON_DEFS, WEAPON_ORDER } from "./config.js";
import { game } from "./state.js";
export function cycleWeapon() {
  const order = ["assault", "shotgun", "sniper"];
  const index = order.indexOf(game.currentWeapon);
  return setWeapon(order[(index + 1) % order.length]);
  const index = WEAPON_ORDER.indexOf(game.currentWeapon);
  return setWeapon(WEAPON_ORDER[(index + 1) % WEAPON_ORDER.length]);
}
    const step = bullet.spd * game.dt;
    const previousPosition = bullet.mesh.position.clone();
    bullet.mesh.position.addScaledVector(bullet.dir, step);
      const playerGroup = game.visuals.player.playerGroup;
      const playerY = playerGroup.position.y + 1.2;
      const dx = position.x - playerGroup.position.x;
      const dy = position.y - playerY;
      const dz = position.z - playerGroup.position.z;
      const playerCenter = new THREE.Vector3(
        playerGroup.position.x,
        playerGroup.position.y + 1.2,
        playerGroup.position.z,
      );

      if (dx * dx + dy * dy + dz * dz < 0.81) {
      if (distanceSqPointToSegment(playerCenter, previousPosition, position) < 1.1) {
        if (game.localPlayerIsAlive && !game.localPlayerIsDowned) {
}

function distanceSqPointToSegment(point, start, end) {
  const segment = end.clone().sub(start);
  const segmentLengthSq = segment.lengthSq();
  if (segmentLengthSq <= 0.000001) {
    return point.distanceToSquared(start);
  }

  const t = Math.max(0, Math.min(1, point.clone().sub(start).dot(segment) / segmentLengthSq));
  const projection = start.clone().addScaledVector(segment, t);
  return point.distanceToSquared(projection);
}
Edited file
config.js
+22
-3

export const EPS = 0.0001;
export const DEFAULT_WEAPON = "assault";
export const DEFAULT_WEAPON = "pistol";
export const WEAPON_ORDER = ["pistol", "assault", "shotgun", "sniper", "sword"];

export const WEAPON_DEFS = {
  pistol: {
    label: "SERVICE PISTOL",
    mag: 14,
    fireRate: 0.18,
    reload: 1.2,
    pellets: 1,
    damage: 34,
    spreadHip: 0.018,
    spreadAim: 0.007,
    bulletSpeed: 96,
    bulletLife: 2.7,
    aimFov: 62,
    aimCamDist: 6.2,
    recoilZ: 0.05,
    recoilRX: 0.04,
    shake: 0.04,
    mode: "pistol",
  },
  assault: {
    pellets: 1,
    damage: 999,
    damage: 240,
    spreadHip: 0.012,
    pellets: 0,
    damage: 85,
    damage: 999,
    range: 4.5,
Edited file
enemies.js
+5
-5


  const hpMax = 50 + game.wave * 10;
  const hpMax = 58 + game.wave * 12;
  const { hpBar, hpFill } = createHealthBar(game.shared.hpFgMatSoldier);

  const hpMax = 40 + game.wave * 8;
  const hpMax = 46 + game.wave * 10;
  const { hpBar, hpFill } = createHealthBar(game.shared.hpFgMatDog);

  const hpMax = 1800;
  const hpMax = 3600;
  const hpBar = new THREE.Mesh(game.shared.hpBgGeo, game.shared.hpBgMat);
          ndx + (Math.random() - 0.5) * 0.24,
          (targetAimY - enemyAimY) + (Math.random() - 0.5) * 0.12,
          ((targetAimY - enemyAimY) / Math.max(distance, 1)) + (Math.random() - 0.5) * 0.03,
          ndz + (Math.random() - 0.5) * 0.24,
    if (toEnemy.dot(cameraDirection) > 0.8) {
      processHit(enemy, 85, enemy.group.position.clone().setY(1.5));
      processHit(enemy, enemy.type === "boss" ? 160 : 9999, enemy.group.position.clone().setY(1.5));
    }
Edited file
player.js
+6
-4


    if (event.code === "Digit1") actions.setWeapon("assault");
    if (event.code === "Digit2") actions.setWeapon("shotgun");
    if (event.code === "Digit3") actions.setWeapon("sniper");
    if (event.code === "Digit4") actions.setWeapon("sword");
    if (event.code === "Digit1") actions.setWeapon("pistol");
    if (event.code === "Digit2") actions.setWeapon("assault");
    if (event.code === "Digit3") actions.setWeapon("shotgun");
    if (event.code === "Digit4") actions.setWeapon("sniper");
    if (event.code === "Digit5") actions.setWeapon("sword");
    if (event.code === "KeyQ") {
    wave: game.wave,
    hp: game.hp,
    isAlive: game.localPlayerIsAlive,
Edited file
state.js
+1
-0

  enemyPingTmr: 0,
  teammateAlertPulse: 0,
  menuOrbit: 0,
5 files changed
+56
-21
Undo

Review
public/src/combat.js
public/src/config.js
public/src/enemies.js
public/src/player.js
public/src/state.js

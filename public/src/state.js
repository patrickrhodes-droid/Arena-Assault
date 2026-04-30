import {
  BASE_FOV,
  DEFAULT_WEAPON,
  P_MAX_HP,
  createStats,
  createWeaponAmmo,
} from "./config.js";

export const game = {
  socket: null,
  state: "MENU",
  mode: "COOP",
  selectedMap: "arena",
  arenaGroup: null,
  arenaLights: [],
  myCharacter: null,
  pvpKills: 0,
  pvpWeaponIdx: 0,
  pvpSwordKills: 0,
  pvpStandings: {},
  pvpSpawnAssignments: {},
  score: 0,
  wave: 0,
  hp: P_MAX_HP,
  effectiveMaxHP: P_MAX_HP,
  ammo: createWeaponAmmo()[DEFAULT_WEAPON],
  stats: createStats(),
  isHost: false,
  canCopyJoinLink: false,
  joinLink: "",
  clientIp: "",
  copyJoinLinkMessage: "",
  playerName: "Soldier",
  isReloading: false,
  reloadTmr: 0,
  fireTmr: 0,
  isSprinting: false,
  isFPS: true,
  isAiming: false,
  camTheta: 0,
  camPhi: 0.6,
  camDist: 8,
  sens: 0.003,
  shakeAmt: 0,
  walkTime: 0,
  isMoving: false,
  playerVelY: 0,
  isGrounded: true,
  waveState: "WAIT",
  waveTmr: 2.5,
  worldPaused: false,
  startingWave: 1,
  invincibilityMode: false,
  isCrouching: false,
  isOnLadder: false,
  ladderCooldown: 0,
  ladders: [],
  enemiesToSpawn: 0,
  skeletonGroupsToSpawn: 0,
  spawnTmr: 0,
  localPlayerIsAlive: true,
  localPlayerIsDowned: false,
  localPlayerIsSpectating: false,
  waveElapsed: 0,
  nextEnemyPing: 60,
  enemyPingTmr: 0,
  teammateAlertPulse: 0,
  sprintLocked: false,
  wLastTapTime: 0,
  menuOrbit: 0,
  lastTime: 0,
  mouseDown: false,
  mouseClicked: false,
  damageTimeout: null,
  copyJoinLinkTimeout: null,
  bossImperviousTimeout: null,
  fpRecoilZ: 0,
  fpRecoilRX: 0,
  currentWeapon: DEFAULT_WEAPON,
  weaponAmmo: createWeaponAmmo(),
  enemies: [],
  skeletonCorpses: [],
  bullets: [],
  particles: [],
  oBs: [],
  healthPacks: [],
  remotePlayers: {},
  reviveProgress: {},
  reviveHoldTime: 0,
  reviveTarget: null,
  reviveTimeout: null,
  downedTime: 0,
  netSyncTmr: 0,
  swordSwingProgress: 0,
  muzzleTmr: 0,
  knockbackX: 0,
  knockbackZ: 0,
  grappleState: "idle",   // "idle" | "hooked"
  grapplePoint: null,     // THREE.Vector3 when hooked
  grappleEnemyId: null,
  grappleCooldown: 0,
  keys: {},
  scene: null,
  camera: null,
  renderer: null,
  dom: null,
  audio: null,
  visuals: {},
  shared: {},
  runtime: {
    baseFov: BASE_FOV,
  },
};

export function resetSessionState() {
  game.score = 0;
  game.wave = 0;
  game.effectiveMaxHP = P_MAX_HP;
  game.hp = P_MAX_HP;
  game.stats = createStats();
  game.currentWeapon = DEFAULT_WEAPON;
  game.weaponAmmo = createWeaponAmmo();
  game.ammo = game.weaponAmmo[DEFAULT_WEAPON];
  game.isReloading = false;
  game.reloadTmr = 0;
  game.fireTmr = 0;
  game.isSprinting = false;
  game.isAiming = false;
  game.shakeAmt = 0;
  game.camTheta = 0;
  game.camPhi = 0.45;
  game.camDist = 8;
  game.walkTime = 0;
  game.isMoving = false;
  game.playerVelY = 0;
  game.isGrounded = true;
  game.localPlayerIsAlive = true;
  game.localPlayerIsDowned = false;
  game.localPlayerIsSpectating = false;
  game.grappleState = "idle";
  game.grapplePoint = null;
  game.grappleEnemyId = null;
  game.grappleCooldown = 0;
  game.waveState = "WAIT";
  game.waveTmr = 2.5;
  game.worldPaused = false;
  game.isCrouching = false;
  game.isOnLadder = false;
  game.ladderCooldown = 0;
  game.enemiesToSpawn = 0;
  game.skeletonGroupsToSpawn = 0;
  game.spawnTmr = 0;
  game.waveElapsed = 0;
  game.nextEnemyPing = 60;
  game.enemyPingTmr = 0;
  game.sprintLocked = false;
  game.wLastTapTime = 0;
  game.downedTime = 0;
  game.netSyncTmr = 0;
  game.reviveHoldTime = 0;
  game.swordSwingProgress = 0;
  game.muzzleTmr = 0;
  game.knockbackX = 0;
  game.knockbackZ = 0;
  game.fpRecoilZ = 0;
  game.fpRecoilRX = 0;
  game.pvpKills = 0;
  game.pvpWeaponIdx = 0;
  game.pvpSwordKills = 0;
  game.pvpStandings = {};
}

export function addShake(amount) {
  game.shakeAmt = Math.max(game.shakeAmt, amount);
}

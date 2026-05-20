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
  gpSens: 3.0,
  campaignMapStartWave: 0,
  gpForward: false,
  gpBack: false,
  gpLeft: false,
  gpRight: false,
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
  recoilOffset: 0,  // auto-recovering camera pitch kick (radians, applied on top of camPhi)
  particlesEnabled: true, // toggled in graphics settings
  damageNumbersEnabled: true, // toggled in HUD settings — floating combat text
  // Server-pushed career data for the local player. Null until the server
  // sends us a 'careerStats' event after we've registered a name.
  career: null,
  // socketId → level map for everyone currently connected. Populated by the
  // 'playerLevels' broadcast; consumed by the lobby list and nameplate.
  playerLevels: {},
  coyoteTmr: 0,
  jumpBufferTmr: 0,
  hitStopTmr: 0,
  killSlowTmr: 0,
  displayHp: 0,
  lastDamageAngle: 0,
  lastDamageTmr: 0,
  waveSpawnedTotal: 0,
  currentWeapon: DEFAULT_WEAPON,
  weaponAmmo: createWeaponAmmo(),
  enemies: [],
  skeletonCorpses: [],
  bullets: [],
  particles: [],
  oBs: [],
  destructibles: [], // { id, mesh, x, z, triggerRadius, obsEntry, alive }
  healthPacks: [],
  remotePlayers: {},
  reviveHoldTime: 0,
  reviveTarget: null,
  reviveTimeout: null,
  downedTime: 0,
  netSyncTmr: 0,
  frameIndex: 0, // increments each animate() call; used to decouple slow updates
  swordSwingProgress: 0,
  weaponPickups: [],
  collectedWeapons: new Set(['pistol']),
  gameMode: 'endless',     // 'campaign' | 'endless' — set by server on match start
  selectedGameMode: '',    // 'campaign' | 'endless' | 'pvp' | 'ffa' — set when host clicks a mode card
  ffaTimeLeft: 0,          // seconds remaining in an FFA match
  ffaDuration: 300,        // chosen FFA duration in seconds
  ffaKills: 0,             // local player's kill count in FFA
  // ── Survival mode ──
  terrainSeed: 0,          // shared with server; drives all heights / props / biomes
  dayTimeSec: 0,           // seconds into the current 180s day-night cycle
  dayTimeSyncedAt: 0,      // performance.now() at last `worldTime` sync
  bloodMoon: false,        // server-flagged blood moon active
  money: 0,                // current run currency
  bestMoney: 0,            // career best (mirrored from server)
  inventory: [],           // Survival hotbar+stash; null or { itemId, qty }
  activeSlot: 0,           // 0-8 hotbar slot active
  backpackTier: 0,         // 0|1|2 → 9|18|27 inventory length
  effects: {},             // active potion timers (speed/jump/damage)
  hasJetpack: false,
  jetpackActive: false,
  jetpackFuel: 100,
  spaceLastTapTime: 0,
  chunks: new Map(),       // chunkKey -> client chunk record
  shopOpen: false,
  shopCatalog: [],
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
  composer: null,
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
  game.displayHp = P_MAX_HP;
  game.hitStopTmr = 0;
  game.killSlowTmr = 0;
  game.jumpBufferTmr = 0;
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
  game.knockbackX = 0;
  game.knockbackZ = 0;
  game.fpRecoilZ = 0;
  game.fpRecoilRX = 0;
  game.recoilOffset = 0;
  game.coyoteTmr = 0;
  game.lastDamageAngle = 0;
  game.lastDamageTmr = 0;
  game.waveSpawnedTotal = 0;
  game.pvpKills = 0;
  game.pvpWeaponIdx = 0;
  game.pvpSwordKills = 0;
  game.pvpStandings = {};
}

export function addShake(amount) {
  game.shakeAmt = Math.max(game.shakeAmt, amount);
}

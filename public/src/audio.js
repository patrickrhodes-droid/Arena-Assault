export function createAudioController() {
  let context = null;
  let musicIntro = null;
  let musicLoop = null;
  let musicResumeTarget = null;
  let musicToken = 0;

  let masterVolume  = 0.8;
  let musicVolume   = 0.6;
  let sfxVolume     = 0.8;
  const BASE_MUSIC  = 0.12;   // base level before user volume scaling
  const MUSIC_DIR = "/assets/Background%20music";
  const MULTIPLAYER_MODE_ALIASES = ["multiplayer", "multiplyer"];

  function init() {
    if (!context) {
      context = new (window.AudioContext || window.webkitAudioContext)();
    }

    if (context.state === "suspended") {
      context.resume();
    }
  }

  function stopElement(element) {
    if (!element) return;
    element.pause();
    element.currentTime = 0;
    element.onended = null;
  }

  function stopBackgroundMusic() {
    musicToken += 1;
    stopElement(musicIntro);
    stopElement(musicLoop);
    musicIntro = null;
    musicLoop = null;
    musicResumeTarget = null;
  }

  function pauseBackgroundMusic() {
    if (musicIntro && !musicIntro.paused) {
      musicIntro.pause();
      musicResumeTarget = musicIntro;
      return;
    }

    if (musicLoop && !musicLoop.paused) {
      musicLoop.pause();
      musicResumeTarget = musicLoop;
    }
  }

  function resumeBackgroundMusic() {
    if (!musicResumeTarget) return;
    musicResumeTarget.play().catch(() => {});
    musicResumeTarget = null;
  }

  function effectiveVol(base) {
    return Math.max(0, Math.min(1, base * masterVolume));
  }

  function createMusicElement(src, loop = false) {
    const audio = new window.Audio(src);
    audio.preload = "auto";
    audio.loop = loop;
    audio.volume = effectiveVol(BASE_MUSIC * musicVolume);
    return audio;
  }

  function setVolumes(master, music, sfx) {
    masterVolume = master;
    musicVolume  = music;
    sfxVolume    = sfx;
    // Update live music elements
    const vol = effectiveVol(BASE_MUSIC * musicVolume);
    if (musicIntro) musicIntro.volume = vol;
    if (musicLoop)  musicLoop.volume  = vol;
    // Persist to localStorage
    try {
      localStorage.setItem("arena_vol_master", master);
      localStorage.setItem("arena_vol_music",  music);
      localStorage.setItem("arena_vol_sfx",    sfx);
    } catch {}
  }

  function loadVolumes() {
    try {
      const m  = parseFloat(localStorage.getItem("arena_vol_master") ?? "0.8");
      const mu = parseFloat(localStorage.getItem("arena_vol_music")  ?? "0.6");
      const s  = parseFloat(localStorage.getItem("arena_vol_sfx")    ?? "0.8");
      masterVolume = isNaN(m)  ? 0.8 : m;
      musicVolume  = isNaN(mu) ? 0.6 : mu;
      sfxVolume    = isNaN(s)  ? 0.8 : s;
    } catch {}
  }
  loadVolumes();

  function buildMusicCandidates(mapId, mode, type) {
    const modeAliases = mode === "multiplayer" ? MULTIPLAYER_MODE_ALIASES : [mode];
    return modeAliases.map((modeName) => `${MUSIC_DIR}/${mapId}${modeName}${type}.mp3`);
  }

  function playMusicCandidate(audio, candidates, token, index = 0, onExhausted = null) {
    if (token !== musicToken) return;
    if (index >= candidates.length) {
      onExhausted?.();
      return;
    }

    audio.onerror = () => {
      playMusicCandidate(audio, candidates, token, index + 1, onExhausted);
    };
    audio.src = candidates[index];
    audio.play().catch(() => {
      playMusicCandidate(audio, candidates, token, index + 1, onExhausted);
    });
  }

  function startBackgroundMusic(mapId, gameMode) {
    if (!mapId || !gameMode) return;

    const mode = gameMode === "PVP" ? "multiplayer" : "wave";
    const introCandidates = buildMusicCandidates(mapId, mode, "intro");
    const loopCandidates = buildMusicCandidates(mapId, mode, "loop");

    stopBackgroundMusic();
    const token = ++musicToken;

    musicLoop = createMusicElement(loopCandidates[0], true);
    musicIntro = createMusicElement(introCandidates[0], false);

    musicIntro.onended = () => {
      if (token !== musicToken || !musicLoop) return;
      musicResumeTarget = null;
      playMusicCandidate(musicLoop, loopCandidates, token);
    };

    playMusicCandidate(musicIntro, introCandidates, token, 0, () => {
      if (token !== musicToken || !musicLoop) return;
      playMusicCandidate(musicLoop, loopCandidates, token);
    });
  }

  function noiseBuffer(duration, decay) {
    const length = Math.floor(context.sampleRate * duration);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);

    for (let index = 0; index < length; index += 1) {
      data[index] = (Math.random() * 2 - 1) * Math.exp(-index / (context.sampleRate * decay));
    }

    return buffer;
  }

  function playNoise(duration, decay, volume) {
    if (!context) return;
    const v = effectiveVol(volume * sfxVolume);
    if (v < 0.001) return;
    const time = context.currentTime;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer(duration, decay);
    const gain = context.createGain();
    gain.gain.setValueAtTime(v, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    source.connect(gain).connect(context.destination);
    source.start(time);
    source.stop(time + duration);
  }

  function playSweep(from, to, duration, volume, type = "sine") {
    if (!context) return;
    const v = effectiveVol(volume * sfxVolume);
    if (v < 0.001) return;
    const time = context.currentTime;
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, time);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), time + duration);
    const gain = context.createGain();
    gain.gain.setValueAtTime(v, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(time);
    oscillator.stop(time + duration);
  }

  function gunshot() {
    playNoise(0.07, 0.015, 0.3);
    playSweep(90, 20, 0.08, 0.35);
  }

  function shotgun() {
    playNoise(0.11, 0.02, 0.45);
    playSweep(120, 35, 0.12, 0.5, "triangle");
  }

  function sniper() {
    playNoise(0.16, 0.03, 0.32);
    playSweep(240, 45, 0.18, 0.55, "sawtooth");
  }

  function hit() {
    playNoise(0.04, 0.012, 0.2);
  }

  function death() {
    playNoise(0.25, 0.06, 0.35);
  }

  function damage() {
    playNoise(0.12, 0.03, 0.25);
  }

  function reload() {
    playSweep(400, 600, 0.15, 0.15, "triangle");
  }

  function reviveStart() {
    playSweep(200, 400, 0.1, 0.15, "sine");
  }

  function reviveProgress() {
    playSweep(300, 500, 0.05, 0.08, "triangle");
  }

  function reviveComplete() {
    playSweep(600, 1200, 0.2, 0.25, "sine");
  }

  function sword() {
    if (!context) {
      return;
    }

    const time = context.currentTime;
    const oscillator = context.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(500, time);
    oscillator.frequency.exponentialRampToValueAtTime(100, time + 0.1);

    const gain = context.createGain();
    gain.gain.setValueAtTime(0.2, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);

    oscillator.connect(gain).connect(context.destination);
    oscillator.start(time);
    oscillator.stop(time + 0.1);
  }

  function playWeapon(definition) {
    if (definition.mode === "sniper") {
      sniper();
      return;
    }

    if (definition.mode === "shotgun") {
      shotgun();
      return;
    }

    gunshot();
  }

  // ── File-based SFX (buffer-cached, lazy-loaded) ───────────────────────────
  const _bufCache = new Map();

  async function _loadBuf(path) {
    if (_bufCache.has(path)) return _bufCache.get(path);
    try {
      const resp = await fetch(path);
      if (!resp.ok) throw new Error(resp.status);
      const buf = await context.decodeAudioData(await resp.arrayBuffer());
      _bufCache.set(path, buf);
      return buf;
    } catch { _bufCache.set(path, null); return null; }
  }

  function _playBuf(buf, vol) {
    if (!buf || !context) return;
    const src = context.createBufferSource();
    src.buffer = buf;
    const g = context.createGain();
    g.gain.setValueAtTime(effectiveVol(vol * sfxVolume), context.currentTime);
    src.connect(g).connect(context.destination);
    src.start();
  }

  function _playFile(path, vol = 0.5) {
    if (!context) return;
    _loadBuf(path).then(buf => _playBuf(buf, vol));
  }

  const SFX = '/assets/SFX/';
  const UI  = '/assets/UISFX/';
  function _rnd(n) { return Math.floor(Math.random() * n); }
  function _sfx(name, count = 5, vol = 0.5) {
    _playFile(`${SFX}${name}_${String(_rnd(count)).padStart(3, '0')}.ogg`, vol);
  }

  function footstep(surface = 'concrete') { _sfx(`footstep_${surface}`, 5, 0.22); }
  function wallImpact()  { _sfx('impactMetal_medium', 5, 0.30); }
  function enemyHit(type) {
    if (type === 'boss' || type === 'miniboss') _sfx('impactPlate_heavy', 5, 0.38);
    else _sfx('impactSoft_medium', 5, 0.32);
  }
  function meleeDamage(light = false) {
    _sfx(light ? 'impactPunch_medium' : 'impactPunch_heavy', 5, 0.55);
  }
  function propBreak()   { _sfx('impactWood_heavy',  5, 0.55); }
  function killBell()    { _sfx('impactBell_heavy',  5, 0.55); }
  function grappleHit()  { _sfx('impactMetal_heavy', 5, 0.40); }
  function land(hard = false) {
    hard ? _sfx('impactMetal_heavy', 5, 0.45) : _sfx('impactGeneric_light', 5, 0.35);
  }
  function emptyMag()    { _sfx('impactMetal_light',  5, 0.40); }
  function weaponPickup(){ _sfx('impactTin_medium',   5, 0.45); }
  function healthPickup(){ _sfx('impactGeneric_light', 5, 0.40); }
  function swordHit()    { _sfx('impactPlank_medium', 5, 0.50); }
  function bossStep()    { _sfx('impactMining',        5, 0.30); }

  function uiClick()   { _playFile(`${UI}click${1 + _rnd(5)}.ogg`,     0.45); }
  function uiHover()   { _playFile(`${UI}rollover${1 + _rnd(6)}.ogg`,  0.20); }
  function uiConfirm() { _playFile(`${UI}mouseclick1.ogg`,              0.55); }
  function uiSwitch()  { _playFile(`${UI}switch${1 + _rnd(10)}.ogg`,   0.35); }

  function dialogueTick() {
    if (!context) return;
    const v = effectiveVol(0.028 * sfxVolume);
    if (v < 0.001) return;
    const time = context.currentTime;
    const osc = context.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(760, time);
    const gain = context.createGain();
    gain.gain.setValueAtTime(v, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.02);
    osc.connect(gain).connect(context.destination);
    osc.start(time);
    osc.stop(time + 0.02);
  }

  return {
    init,
    startBackgroundMusic,
    stopBackgroundMusic,
    pauseBackgroundMusic,
    resumeBackgroundMusic,
    playWeapon,
    dialogueTick,
    hit,
    death,
    damage,
    reload,
    reviveStart,
    reviveProgress,
    reviveComplete,
    sword,
    setVolumes,
    getVolumes: () => ({ master: masterVolume, music: musicVolume, sfx: sfxVolume }),
    // File-based SFX
    footstep,
    wallImpact,
    enemyHit,
    meleeDamage,
    propBreak,
    killBell,
    grappleHit,
    land,
    emptyMag,
    weaponPickup,
    healthPickup,
    swordHit,
    bossStep,
    uiClick,
    uiHover,
    uiConfirm,
    uiSwitch,
  };
}

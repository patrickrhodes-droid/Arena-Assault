export function createAudioController() {
  let context = null;
  let musicIntro = null;
  let musicLoop = null;
  let musicResumeTarget = null;
  let musicToken = 0;

  const MUSIC_VOLUME = 0.12;
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

  function createMusicElement(src, loop = false) {
    const audio = new window.Audio(src);
    audio.preload = "auto";
    audio.loop = loop;
    audio.volume = MUSIC_VOLUME;
    return audio;
  }

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
    if (!context) {
      return;
    }

    const time = context.currentTime;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer(duration, decay);

    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    source.connect(gain).connect(context.destination);
    source.start(time);
    source.stop(time + duration);
  }

  function playSweep(from, to, duration, volume, type = "sine") {
    if (!context) {
      return;
    }

    const time = context.currentTime;
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, time);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), time + duration);

    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, time);
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

  return {
    init,
    startBackgroundMusic,
    stopBackgroundMusic,
    pauseBackgroundMusic,
    resumeBackgroundMusic,
    playWeapon,
    hit,
    death,
    damage,
    reload,
    reviveStart,
    reviveProgress,
    reviveComplete,
    sword,
  };
}

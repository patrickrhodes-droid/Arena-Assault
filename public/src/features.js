// ─────────────────────────────────────────────────────────────────────────────
// Game-feel features layered on top of the core gameplay loop:
//   - Multikill announcer (Double/Triple/Quad/Rampage HUD popups)
//   - Persistent career stats stored in localStorage
//   - Career stats panel (rendered into the existing pause/menu UI)
// All are additive: nothing here changes combat numbers or networking.
// ─────────────────────────────────────────────────────────────────────────────

// ── Multikill announcer ──────────────────────────────────────────────────────
const COMBO_WINDOW_MS = 4000; // kills within this gap chain together
const COMBO_TIERS = [
  { count: 2, label: "DOUBLE KILL",   rampage: false },
  { count: 3, label: "TRIPLE KILL",   rampage: false },
  { count: 4, label: "QUAD KILL",     rampage: false },
  { count: 5, label: "RAMPAGE!",      rampage: true  },
  { count: 7, label: "UNSTOPPABLE!",  rampage: true  },
  { count: 10, label: "GODLIKE!!",    rampage: true  },
];

let _comboCount    = 0;
let _comboLastTime = 0;
let _comboTier     = 0; // which tier we last announced for this chain

export function registerKillForCombo() {
  const now = performance.now();
  if (now - _comboLastTime > COMBO_WINDOW_MS) {
    _comboCount = 1;
    _comboTier  = 0;
  } else {
    _comboCount += 1;
  }
  _comboLastTime = now;

  // Find the highest tier we've reached on THIS chain that we haven't
  // announced yet. Iterating largest-first so a single double→triple jump
  // shows TRIPLE rather than DOUBLE.
  for (let i = COMBO_TIERS.length - 1; i >= 0; i -= 1) {
    const tier = COMBO_TIERS[i];
    if (_comboCount >= tier.count && tier.count > _comboTier) {
      _comboTier = tier.count;
      flashMultikill(tier.label, tier.rampage);
      return;
    }
  }
}

function flashMultikill(text, rampage) {
  const el = document.getElementById("multikill-announce");
  if (!el) return;
  el.textContent = text;
  el.classList.toggle("rampage", !!rampage);
  // Re-trigger the CSS transition each time
  el.classList.remove("show");
  void el.offsetWidth;
  el.classList.add("show");
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => el.classList.remove("show"), 1400);
}

export function resetComboState() {
  _comboCount = 0;
  _comboTier  = 0;
  _comboLastTime = 0;
}

// ── Persistent career stats ──────────────────────────────────────────────────
const CAREER_KEY = "arena_career_stats";

function loadCareer() {
  try {
    const raw = localStorage.getItem(CAREER_KEY);
    if (!raw) return defaultCareer();
    const parsed = JSON.parse(raw);
    return { ...defaultCareer(), ...parsed };
  } catch {
    return defaultCareer();
  }
}

function defaultCareer() {
  return {
    kills: 0,
    bossKills: 0,
    matchesPlayed: 0,
    wins: 0,
    pvpWins: 0,
    ffaWins: 0,
    bestWave: 0,
    bestScore: 0,
    deaths: 0,
  };
}

function saveCareer(data) {
  try { localStorage.setItem(CAREER_KEY, JSON.stringify(data)); } catch {}
}

export function bumpCareerStat(field, by = 1) {
  const c = loadCareer();
  c[field] = (c[field] || 0) + by;
  saveCareer(c);
}

export function recordMatchResult({ wave, score, mode, won }) {
  const c = loadCareer();
  c.matchesPlayed = (c.matchesPlayed || 0) + 1;
  if (typeof wave === "number" && wave > (c.bestWave || 0)) c.bestWave = wave;
  if (typeof score === "number" && score > (c.bestScore || 0)) c.bestScore = score;
  if (won) {
    c.wins = (c.wins || 0) + 1;
    if (mode === "PVP") c.pvpWins = (c.pvpWins || 0) + 1;
    if (mode === "FFA") c.ffaWins = (c.ffaWins || 0) + 1;
  }
  saveCareer(c);
}

export function getCareerStats() {
  return loadCareer();
}

// ── Career stats panel ──────────────────────────────────────────────────────
// Builds a small panel into a host element. Re-rendered on every open so
// it always shows current numbers.
export function renderCareerStatsInto(containerEl) {
  if (!containerEl) return;
  const c = loadCareer();
  containerEl.innerHTML = `
    <div class="career-stats-grid">
      <div class="cs-row"><span>TOTAL KILLS</span><b>${c.kills}</b></div>
      <div class="cs-row"><span>BOSSES DEFEATED</span><b>${c.bossKills}</b></div>
      <div class="cs-row"><span>MATCHES PLAYED</span><b>${c.matchesPlayed}</b></div>
      <div class="cs-row"><span>WINS</span><b>${c.wins}</b></div>
      <div class="cs-row"><span>PVP WINS</span><b>${c.pvpWins}</b></div>
      <div class="cs-row"><span>FFA WINS</span><b>${c.ffaWins}</b></div>
      <div class="cs-row"><span>BEST WAVE</span><b>${c.bestWave}</b></div>
      <div class="cs-row"><span>BEST SCORE</span><b>${c.bestScore}</b></div>
    </div>
  `;
}

import express from "express";
import { createServer } from "http";
import { dirname, extname, join, relative, resolve } from "path";
import { fileURLToPath } from "url";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { mkdir, readdir, readFile, writeFile } from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = Number(process.env.MAP_EDITOR_PORT || 3002);
const publicDir = join(__dirname, "public");
const editorDir = join(publicDir, "editor");
const mapsDir = join(publicDir, "maps");
const modelsDir = join(publicDir, "assets", "models");

const app = express();
const http = createServer(app);

app.use(express.json({ limit: "10mb" }));
app.use("/assets", express.static(join(publicDir, "assets")));
app.use("/editor", express.static(editorDir));

function safeMapName(name) {
  const clean = String(name || "").trim().replace(/\.json$/i, "");
  if (!/^[a-z0-9_-]{1,64}$/i.test(clean)) {
    return null;
  }
  return clean;
}

async function walkGlbs(dir, out = []) {
  if (!existsSync(dir)) return out;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkGlbs(fullPath, out);
    } else if (extname(entry.name).toLowerCase() === ".glb") {
      const rel = relative(publicDir, fullPath).replaceAll("\\", "/");
      out.push(`/${rel}`);
    }
  }
  return out;
}

async function ensureMapsDir() {
  await mkdir(mapsDir, { recursive: true });
}

app.get("/", (req, res) => {
  res.sendFile(join(editorDir, "index.html"));
});

app.get("/api/assets", async (req, res) => {
  try {
    const assets = await walkGlbs(modelsDir);
    assets.sort((a, b) => a.localeCompare(b));
    res.json({ assets });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/maps", async (req, res) => {
  try {
    await ensureMapsDir();
    const entries = await readdir(mapsDir, { withFileTypes: true });
    const maps = entries
      .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === ".json")
      .map((entry) => entry.name.replace(/\.json$/i, ""))
      .sort((a, b) => a.localeCompare(b));
    res.json({ maps });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/maps/:name", async (req, res) => {
  const name = safeMapName(req.params.name);
  if (!name) {
    res.status(400).json({ error: "Invalid map name" });
    return;
  }

  try {
    const file = resolve(mapsDir, `${name}.json`);
    if (!file.startsWith(resolve(mapsDir))) {
      res.status(400).json({ error: "Invalid path" });
      return;
    }
    const text = await readFile(file, "utf8");
    res.type("json").send(text);
  } catch {
    res.status(404).json({ error: "Map not found" });
  }
});

app.put("/api/maps/:name", async (req, res) => {
  const name = safeMapName(req.params.name);
  if (!name) {
    res.status(400).json({ error: "Invalid map name" });
    return;
  }

  const map = req.body;
  if (!map || typeof map !== "object" || !Array.isArray(map.objects)) {
    res.status(400).json({ error: "Map JSON must include an objects array" });
    return;
  }

  try {
    await ensureMapsDir();
    const file = resolve(mapsDir, `${name}.json`);
    if (!file.startsWith(resolve(mapsDir))) {
      res.status(400).json({ error: "Invalid path" });
      return;
    }
    map.name = map.name || name;
    map.updatedAt = new Date().toISOString();
    await writeFile(file, `${JSON.stringify(map, null, 2)}\n`, "utf8");
    res.json({ ok: true, file: `/maps/${name}.json` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Character config API ──────────────────────────────────────────────────────
const charConfigFile = join(publicDir, "assets", "characterConfig.json");

app.get("/api/character-config", (_req, res) => {
  try {
    const text = existsSync(charConfigFile) ? readFileSync(charConfigFile, "utf8") : "{}";
    res.json(JSON.parse(text));
  } catch { res.json({}); }
});

app.put("/api/character-config", async (req, res) => {
  try {
    await writeFile(charConfigFile, `${JSON.stringify(req.body, null, 2)}\n`, "utf8");
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve character editor HTML directly at /character
app.get("/character", (_req, res) => {
  res.sendFile(join(publicDir, "editor", "character.html"));
});

http.listen(PORT, () => {
  console.log(`Arena Assault map editor running at http://localhost:${PORT}`);
  console.log(`Character editor running at http://localhost:${PORT}/editor/character.html`);
});

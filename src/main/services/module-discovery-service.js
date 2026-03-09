const path = require("path");
const fs = require("fs/promises");
const { pathToFileURL } = require("url");
const { app } = require("electron");

function getModulesRootPath() {
  return path.join(app.getPath("appData"), "SME", "modules");
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeModuleManifest(manifest = {}, directoryPath) {
  if (!isObject(manifest)) {
    return null;
  }

  const id = String(manifest.id || "").trim();
  const entry = String(manifest.entry || "index.js").trim();
  if (!id || !entry) {
    return null;
  }

  const entryPath = path.resolve(directoryPath, entry);
  return {
    id,
    name: String(manifest.name || id).trim() || id,
    version: String(manifest.version || "0.0.0").trim() || "0.0.0",
    description: String(manifest.description || "").trim(),
    source: "user",
    directoryPath,
    manifestPath: path.join(directoryPath, "module.json"),
    entryPath,
    entryUrl: pathToFileURL(entryPath).href,
  };
}

function createModuleDiscoveryService() {
  async function ensureModulesRoot() {
    const modulesRoot = getModulesRootPath();
    await fs.mkdir(modulesRoot, { recursive: true });
    return modulesRoot;
  }

  async function listUserModules() {
    const modulesRoot = await ensureModulesRoot();
    const entries = await fs.readdir(modulesRoot, { withFileTypes: true });
    const modules = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const directoryPath = path.join(modulesRoot, entry.name);
      const manifestPath = path.join(directoryPath, "module.json");

      try {
        const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
        const normalized = normalizeModuleManifest(manifest, directoryPath);
        if (normalized) {
          modules.push(normalized);
        }
      } catch {
        continue;
      }
    }

    return modules.sort((left, right) => left.id.localeCompare(right.id));
  }

  return {
    getModulesRootPath,
    listUserModules,
  };
}

module.exports = {
  createModuleDiscoveryService,
  getModulesRootPath,
};

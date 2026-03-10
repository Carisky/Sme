const path = require("path");
const fs = require("fs/promises");
const { pathToFileURL } = require("url");
const { app } = require("electron");

function getMiniAppsRootPath() {
  return path.join(app.getAppPath(), "mini_apps");
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeMiniAppManifest(manifest = {}, directoryPath) {
  if (!isObject(manifest)) {
    return null;
  }

  const id = String(manifest.id || "").trim();
  const page = String(manifest.page || "index.html").trim();
  if (!id || !page) {
    return null;
  }

  const icon = String(manifest.icon || "").trim();
  const version = String(manifest.version || "0.0.0").trim() || "0.0.0";
  const pagePath = path.resolve(directoryPath, page);

  return {
    id,
    name: String(manifest.name || id).trim() || id,
    description: String(manifest.description || "").trim(),
    version,
    order: Number.isFinite(Number(manifest.order)) ? Number(manifest.order) : 999,
    directoryPath,
    manifestPath: path.join(directoryPath, "mini-app.json"),
    pagePath,
    pageUrl: pathToFileURL(pagePath).href,
    iconPath: icon ? path.resolve(directoryPath, icon) : "",
    iconUrl: icon ? pathToFileURL(path.resolve(directoryPath, icon)).href : "",
  };
}

function sortMiniApps(left, right) {
  if (left.order !== right.order) {
    return left.order - right.order;
  }

  return left.name.localeCompare(right.name, "pl");
}

function createMiniAppDiscoveryService() {
  async function listMiniApps() {
    const miniAppsRoot = getMiniAppsRootPath();
    let entries = [];

    try {
      entries = await fs.readdir(miniAppsRoot, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") {
        return [];
      }

      throw error;
    }

    const miniApps = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const directoryPath = path.join(miniAppsRoot, entry.name);
      const manifestPath = path.join(directoryPath, "mini-app.json");

      try {
        const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
        const normalized = normalizeMiniAppManifest(manifest, directoryPath);
        if (normalized) {
          miniApps.push(normalized);
        }
      } catch {
        continue;
      }
    }

    return miniApps.sort(sortMiniApps);
  }

  async function getMiniAppById(miniAppId) {
    const normalizedId = String(miniAppId || "").trim();
    if (!normalizedId) {
      return null;
    }

    const miniApps = await listMiniApps();
    return miniApps.find((entry) => entry.id === normalizedId) || null;
  }

  return {
    getMiniAppsRootPath,
    getMiniAppById,
    listMiniApps,
  };
}

module.exports = {
  createMiniAppDiscoveryService,
  getMiniAppsRootPath,
};

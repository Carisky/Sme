const path = require("path");
const fs = require("fs/promises");
const { app } = require("electron");
const { listMiniAppsFromRoot } = require("../../mini-app-common");

function getBundledMiniAppsRootPath() {
  return path.join(app.getAppPath(), "mini_apps");
}

function getInstalledMiniAppsRootPath() {
  return path.join(
    app.getPath("appData"),
    "SME",
    app.isPackaged ? "installed_mini_apps" : "dev_mini_apps"
  );
}

function createMiniAppDiscoveryService() {
  async function ensureInstalledMiniAppsRoot() {
    const miniAppsRoot = getInstalledMiniAppsRootPath();
    await fs.mkdir(miniAppsRoot, { recursive: true });
    return miniAppsRoot;
  }

  function mergeLaunchableMiniApps(bundledMiniApps = [], installedMiniApps = []) {
    const merged = new Map();

    for (const miniApp of installedMiniApps) {
      merged.set(miniApp.id, miniApp);
    }

    for (const miniApp of bundledMiniApps) {
      merged.set(miniApp.id, miniApp);
    }

    return Array.from(merged.values()).sort((left, right) => {
      if (left.order !== right.order) {
        return left.order - right.order;
      }

      return left.name.localeCompare(right.name, "pl");
    });
  }

  async function listBundledMiniApps() {
    return listMiniAppsFromRoot(getBundledMiniAppsRootPath(), {
      source: "bundled",
    });
  }

  async function listInstalledMiniApps() {
    const miniAppsRoot = await ensureInstalledMiniAppsRoot();
    return listMiniAppsFromRoot(miniAppsRoot, {
      source: "installed",
    });
  }

  async function listMiniApps() {
    const [bundledMiniApps, installedMiniApps] = await Promise.all([
      listBundledMiniApps(),
      listInstalledMiniApps(),
    ]);
    return mergeLaunchableMiniApps(bundledMiniApps, installedMiniApps);
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
    ensureInstalledMiniAppsRoot,
    getBundledMiniAppsRootPath,
    getInstalledMiniAppsRootPath,
    getMiniAppById,
    listBundledMiniApps,
    listInstalledMiniApps,
    listMiniApps,
  };
}

module.exports = {
  createMiniAppDiscoveryService,
  getBundledMiniAppsRootPath,
  getInstalledMiniAppsRootPath,
};

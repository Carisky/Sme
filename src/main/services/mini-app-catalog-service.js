const { compareVersions } = require("../../update-common");
const { sortMiniApps } = require("../../mini-app-common");

function createMiniAppCatalogService({
  miniAppDiscoveryService,
  miniAppRegistryService,
}) {
  async function loadCatalogSources(options = {}) {
    const [bundledMiniApps, installedMiniApps] = await Promise.all([
      miniAppDiscoveryService.listBundledMiniApps(),
      miniAppDiscoveryService.listInstalledMiniApps(),
    ]);

    let registryMiniApps = [];
    let registryError = null;

    try {
      registryMiniApps = await miniAppRegistryService.listRegistryMiniApps(options);
    } catch (error) {
      registryError = error;
      registryMiniApps = [];
    }

    return {
      bundledMiniApps,
      installedMiniApps,
      registryMiniApps,
      registryError,
    };
  }

  function buildTileRecord({
    bundledMiniApp,
    installedMiniApp,
    registryMiniApp,
  }) {
    const launchableMiniApp = bundledMiniApp || installedMiniApp || null;
    const localVersion = String(launchableMiniApp?.version || "").trim();
    const availableVersion = String(
      registryMiniApp?.version || launchableMiniApp?.version || "0.0.0"
    ).trim();
    const updateAvailable = Boolean(
      installedMiniApp &&
        !bundledMiniApp &&
        registryMiniApp &&
        compareVersions(registryMiniApp.version, installedMiniApp.version) > 0
    );
    const canLaunch = Boolean(launchableMiniApp);
    const canInstall = Boolean(!launchableMiniApp && registryMiniApp);
    const canUpdate = Boolean(updateAvailable);

    let status = "unavailable";
    let statusLabel = "Niedostepny";

    if (bundledMiniApp) {
      status = "bundled";
      statusLabel = `Wbudowany v${bundledMiniApp.version}`;
    } else if (canUpdate) {
      status = "update-available";
      statusLabel = `Aktualizacja ${installedMiniApp.version} -> ${registryMiniApp.version}`;
    } else if (installedMiniApp) {
      status = "installed";
      statusLabel = `Zainstalowany v${installedMiniApp.version}`;
    } else if (registryMiniApp) {
      status = "available";
      statusLabel = `Dostepny w rejestrze v${registryMiniApp.version}`;
    }

    return {
      id:
        bundledMiniApp?.id ||
        installedMiniApp?.id ||
        registryMiniApp?.id ||
        "",
      name:
        bundledMiniApp?.name ||
        installedMiniApp?.name ||
        registryMiniApp?.name ||
        "",
      description:
        bundledMiniApp?.description ||
        installedMiniApp?.description ||
        registryMiniApp?.description ||
        "",
      order:
        bundledMiniApp?.order ??
        installedMiniApp?.order ??
        registryMiniApp?.order ??
        999,
      iconUrl:
        bundledMiniApp?.iconUrl ||
        installedMiniApp?.iconUrl ||
        registryMiniApp?.iconUrl ||
        "",
      canLaunch,
      canInstall,
      canUpdate,
      status,
      statusLabel,
      localVersion,
      availableVersion,
      hasRegistryEntry: Boolean(registryMiniApp),
    };
  }

  function mergeCatalogMiniApps({
    bundledMiniApps,
    installedMiniApps,
    registryMiniApps,
  }) {
    const bundledById = new Map(bundledMiniApps.map((entry) => [entry.id, entry]));
    const installedById = new Map(installedMiniApps.map((entry) => [entry.id, entry]));
    const registryById = new Map(registryMiniApps.map((entry) => [entry.id, entry]));
    const allIds = new Set([
      ...bundledById.keys(),
      ...installedById.keys(),
      ...registryById.keys(),
    ]);

    return Array.from(allIds)
      .map((id) =>
        buildTileRecord({
          bundledMiniApp: bundledById.get(id) || null,
          installedMiniApp: installedById.get(id) || null,
          registryMiniApp: registryById.get(id) || null,
        })
      )
      .filter((entry) => entry.id)
      .sort(sortMiniApps);
  }

  async function listCatalog(options = {}) {
    const sources = await loadCatalogSources(options);

    return {
      miniApps: mergeCatalogMiniApps(sources),
      registryError: sources.registryError?.message || "",
    };
  }

  async function getLaunchableMiniAppById(miniAppId) {
    return miniAppDiscoveryService.getMiniAppById(miniAppId);
  }

  async function installMiniApp(miniAppId) {
    const registryMiniApps = await miniAppRegistryService.listRegistryMiniApps({
      forceRefresh: true,
    });
    const registryMiniApp =
      registryMiniApps.find((entry) => entry.id === String(miniAppId || "").trim()) || null;

    if (!registryMiniApp) {
      throw new Error(`Nie znaleziono modulu ${miniAppId} w rejestrze.`);
    }

    await miniAppRegistryService.installMiniApp(registryMiniApp);
    return listCatalog({ forceRefresh: true });
  }

  return {
    getLaunchableMiniAppById,
    installMiniApp,
    listCatalog,
  };
}

module.exports = {
  createMiniAppCatalogService,
};

const { compareVersions } = require("../../update-common");
const { pickPreferredMiniApp, sortMiniApps } = require("../../mini-app-common");

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

  function mergeLocalMiniApps(bundledMiniApps = [], installedMiniApps = []) {
    const merged = new Map();

    for (const miniApp of bundledMiniApps) {
      merged.set(miniApp.id, pickPreferredMiniApp(merged.get(miniApp.id), miniApp));
    }

    for (const miniApp of installedMiniApps) {
      merged.set(miniApp.id, pickPreferredMiniApp(merged.get(miniApp.id), miniApp));
    }

    return merged;
  }

  function buildTileRecord({
    bundledMiniApp,
    installedMiniApp,
    registryMiniApp,
  }) {
    const launchableMiniApp = pickPreferredMiniApp(bundledMiniApp, installedMiniApp);
    const localVersion = String(launchableMiniApp?.version || "").trim();
    const availableVersion = String(
      registryMiniApp?.version || launchableMiniApp?.version || "0.0.0"
    ).trim();
    const updateAvailable = Boolean(
      launchableMiniApp &&
        registryMiniApp &&
        compareVersions(registryMiniApp.version, launchableMiniApp.version) > 0
    );
    const canLaunch = Boolean(launchableMiniApp);
    const canInstall = Boolean(!launchableMiniApp && registryMiniApp);
    const canUpdate = Boolean(updateAvailable);

    let status = "unavailable";
    let statusLabel = "Niedostępny";

    if (canUpdate) {
      status = "update-available";
      statusLabel = `Aktualizacja ${launchableMiniApp.version} -> ${registryMiniApp.version}`;
    } else if (launchableMiniApp?.source === "installed") {
      status = "installed";
      statusLabel = `Zainstalowany v${launchableMiniApp.version}`;
    } else if (bundledMiniApp) {
      status = "bundled";
      statusLabel = `Wbudowany v${bundledMiniApp.version}`;
    } else if (registryMiniApp) {
      status = "available";
      statusLabel = `Dostępny w rejestrze v${registryMiniApp.version}`;
    }

    return {
      id:
        launchableMiniApp?.id ||
        registryMiniApp?.id ||
        bundledMiniApp?.id ||
        installedMiniApp?.id ||
        "",
      name:
        launchableMiniApp?.name ||
        registryMiniApp?.name ||
        bundledMiniApp?.name ||
        installedMiniApp?.name ||
        "",
      description:
        launchableMiniApp?.description ||
        registryMiniApp?.description ||
        bundledMiniApp?.description ||
        installedMiniApp?.description ||
        "",
      order:
        launchableMiniApp?.order ??
        registryMiniApp?.order ??
        bundledMiniApp?.order ??
        installedMiniApp?.order ??
        999,
      iconUrl:
        launchableMiniApp?.iconUrl ||
        registryMiniApp?.iconUrl ||
        bundledMiniApp?.iconUrl ||
        installedMiniApp?.iconUrl ||
        "",
      canLaunch,
      canInstall,
      canUpdate,
      status,
      statusLabel,
      localVersion,
      availableVersion,
      localSource: launchableMiniApp?.source || "",
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

  function buildCatalogResult(sources, syncSummary = null) {
    return {
      miniApps: mergeCatalogMiniApps(sources),
      registryError: sources.registryError?.message || "",
      syncSummary,
    };
  }

  function buildSyncSummary({
    sources,
    candidates,
    results,
  }) {
    const updated = results.filter((entry) => entry.status === "updated").length;
    const failed = results.filter((entry) => entry.status === "failed").length;

    if (sources.registryError) {
      return {
        checked: 0,
        attempted: 0,
        updated: 0,
        failed: 0,
        results: [],
        message:
          "Nie udało się połączyć z rejestrem modułów. Automatyczna synchronizacja została pominięta.",
      };
    }

    if (!candidates.length) {
      return {
        checked: sources.registryMiniApps.length,
        attempted: 0,
        updated: 0,
        failed: 0,
        results: [],
        message:
          sources.registryMiniApps.length > 0
            ? "Wszystkie zainstalowane moduły są aktualne."
            : "Rejestr modułów nie zawiera jeszcze żadnych publikacji.",
      };
    }

    if (failed > 0) {
      return {
        checked: sources.registryMiniApps.length,
        attempted: candidates.length,
        updated,
        failed,
        results,
        message: `Zaktualizowano moduły: ${updated}. Nieudane aktualizacje: ${failed}.`,
      };
    }

    return {
      checked: sources.registryMiniApps.length,
      attempted: candidates.length,
      updated,
      failed: 0,
      results,
      message: `Zaktualizowano moduły na ekranie startowym: ${updated}.`,
    };
  }

  function collectSyncCandidates(sources) {
    if (sources.registryError) {
      return [];
    }

    const localMiniApps = mergeLocalMiniApps(
      sources.bundledMiniApps,
      sources.installedMiniApps
    );

    return sources.registryMiniApps
      .map((registryMiniApp) => {
        const localMiniApp = localMiniApps.get(registryMiniApp.id) || null;
        if (!localMiniApp) {
          return null;
        }

        if (compareVersions(registryMiniApp.version, localMiniApp.version) <= 0) {
          return null;
        }

        return {
          id: registryMiniApp.id,
          fromVersion: localMiniApp.version,
          toVersion: registryMiniApp.version,
          registryMiniApp,
        };
      })
      .filter(Boolean)
      .sort((left, right) => sortMiniApps(left.registryMiniApp, right.registryMiniApp));
  }

  async function listCatalog(options = {}) {
    const sources = await loadCatalogSources(options);
    return buildCatalogResult(sources);
  }

  async function bootstrapCatalog(options = {}) {
    const sources = await loadCatalogSources({
      ...options,
      forceRefresh: options.forceRefresh ?? true,
    });
    const candidates = collectSyncCandidates(sources);
    const results = [];

    for (const candidate of candidates) {
      try {
        await miniAppRegistryService.installMiniApp(candidate.registryMiniApp);
        results.push({
          id: candidate.id,
          fromVersion: candidate.fromVersion,
          toVersion: candidate.toVersion,
          status: "updated",
        });
      } catch (error) {
        results.push({
          id: candidate.id,
          fromVersion: candidate.fromVersion,
          toVersion: candidate.toVersion,
          status: "failed",
          message: error.message,
        });
      }
    }

    const finalSources =
      results.some((entry) => entry.status === "updated")
        ? await loadCatalogSources(options)
        : sources;
    const syncSummary = buildSyncSummary({
      sources,
      candidates,
      results,
    });

    return buildCatalogResult(finalSources, syncSummary);
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
      throw new Error(`Nie znaleziono modułu ${miniAppId} w rejestrze.`);
    }

    await miniAppRegistryService.installMiniApp(registryMiniApp);
    return listCatalog({ forceRefresh: true });
  }

  return {
    bootstrapCatalog,
    getLaunchableMiniAppById,
    installMiniApp,
    listCatalog,
  };
}

module.exports = {
  createMiniAppCatalogService,
};

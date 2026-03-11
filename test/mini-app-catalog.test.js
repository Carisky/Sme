const assert = require("node:assert/strict");
const { createMiniAppCatalogService } = require("../src/main/services/mini-app-catalog-service");

function createDiscoveryService({ bundledMiniApps, installedMiniApps }) {
  return {
    async listBundledMiniApps() {
      return bundledMiniApps.map((entry) => ({ ...entry }));
    },
    async listInstalledMiniApps() {
      return installedMiniApps.map((entry) => ({ ...entry }));
    },
    async getMiniAppById(miniAppId) {
      return (
        installedMiniApps.find((entry) => entry.id === miniAppId) ||
        bundledMiniApps.find((entry) => entry.id === miniAppId) ||
        null
      );
    },
  };
}

async function main() {
  const bundledMiniApps = [
    {
      id: "sme",
      name: "SME",
      description: "Core module",
      version: "1.0.0",
      order: 1,
      source: "bundled",
      iconUrl: "",
    },
    {
      id: "wct-cen",
      name: "WCT CEN",
      description: "Lookup module",
      version: "0.1.0",
      order: 20,
      source: "bundled",
      iconUrl: "",
    },
  ];
  const installedMiniApps = [];
  const registryMiniApps = [
    {
      id: "sme",
      name: "SME",
      description: "Core module",
      version: "1.1.0",
      order: 1,
      source: "registry",
      iconUrl: "",
      bundle: {
        name: "sme.tar.gz",
        downloadUrl: "https://example.invalid/sme.tar.gz",
        sha256: "abc",
        size: 123,
        format: "tar.gz",
      },
    },
    {
      id: "wct-cen",
      name: "WCT CEN",
      description: "Lookup module",
      version: "0.2.0",
      order: 20,
      source: "registry",
      iconUrl: "",
      bundle: {
        name: "wct-cen.tar.gz",
        downloadUrl: "https://example.invalid/wct-cen.tar.gz",
        sha256: "def",
        size: 456,
        format: "tar.gz",
      },
    },
    {
      id: "new-module",
      name: "New module",
      description: "Optional module",
      version: "0.3.0",
      order: 30,
      source: "registry",
      iconUrl: "",
      bundle: {
        name: "new-module.tar.gz",
        downloadUrl: "https://example.invalid/new-module.tar.gz",
        sha256: "ghi",
        size: 789,
        format: "tar.gz",
      },
    },
  ];
  const installedById = new Map();

  const miniAppCatalogService = createMiniAppCatalogService({
    miniAppDiscoveryService: createDiscoveryService({
      bundledMiniApps,
      installedMiniApps,
    }),
    miniAppRegistryService: {
      async listRegistryMiniApps() {
        return registryMiniApps.map((entry) => ({ ...entry }));
      },
      async installMiniApp(entry) {
        if (entry.id === "wct-cen") {
          throw new Error("Simulated wct-cen failure");
        }

        installedById.set(entry.id, {
          ...entry,
          source: "installed",
        });

        const existingIndex = installedMiniApps.findIndex((candidate) => candidate.id === entry.id);
        if (existingIndex >= 0) {
          installedMiniApps[existingIndex] = installedById.get(entry.id);
        } else {
          installedMiniApps.push(installedById.get(entry.id));
        }

        return installedById.get(entry.id);
      },
    },
  });

  const listResult = await miniAppCatalogService.listCatalog();
  const smeTile = listResult.miniApps.find((entry) => entry.id === "sme");
  const newModuleTile = listResult.miniApps.find((entry) => entry.id === "new-module");
  assert.equal(smeTile.canLaunch, true);
  assert.equal(smeTile.canUpdate, true);
  assert.equal(smeTile.localVersion, "1.0.0");
  assert.equal(smeTile.availableVersion, "1.1.0");
  assert.equal(newModuleTile.canInstall, true);
  assert.equal(newModuleTile.canLaunch, false);

  const bootstrapResult = await miniAppCatalogService.bootstrapCatalog();
  const syncedSme = bootstrapResult.miniApps.find((entry) => entry.id === "sme");
  const failedWctCen = bootstrapResult.miniApps.find((entry) => entry.id === "wct-cen");

  assert.equal(bootstrapResult.syncSummary.attempted, 2);
  assert.equal(bootstrapResult.syncSummary.updated, 1);
  assert.equal(bootstrapResult.syncSummary.failed, 1);
  assert.equal(
    bootstrapResult.syncSummary.results.find((entry) => entry.id === "sme").status,
    "updated"
  );
  assert.equal(
    bootstrapResult.syncSummary.results.find((entry) => entry.id === "wct-cen").status,
    "failed"
  );
  assert.equal(syncedSme.status, "installed");
  assert.equal(syncedSme.localVersion, "1.1.0");
  assert.equal(syncedSme.canUpdate, false);
  assert.equal(failedWctCen.canUpdate, true);

  console.log("mini app catalog tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

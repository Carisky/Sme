const { app, BrowserWindow } = require("electron");
const packageJson = require("../../package.json");
const { disconnectOreCatalog } = require("../ore-catalog");
const { createWindowController } = require("./window-controller");
const { createCatalogService } = require("./services/catalog-service");
const { createCenImtreksService } = require("./services/cen-imtreks-service");
const { createImportService } = require("./services/import-service");
const { createMiniAppCatalogService } = require("./services/mini-app-catalog-service");
const { createMiniAppDiscoveryService } = require("./services/mini-app-discovery-service");
const { createMiniAppRegistryService } = require("./services/mini-app-registry-service");
const { createModuleDiscoveryService } = require("./services/module-discovery-service");
const { createPrintService } = require("./services/print-service");
const { createProjectService } = require("./services/project-service");
const { createRejContService } = require("./services/rej-cont-service");
const { createUpdateService } = require("./services/update-service");
const { createWctCenService } = require("./services/wct-cen-service");
const { registerIpcHandlers } = require("./ipc/register-ipc-handlers");

function bootstrapMainApp() {
  let shutdownInProgress = false;
  const windowController = createWindowController();
  const catalogService = createCatalogService();
  const projectService = createProjectService({ windowController });
  const importService = createImportService({ windowController });
  const miniAppDiscoveryService = createMiniAppDiscoveryService();
  const miniAppRegistryService = createMiniAppRegistryService({
    packageJson,
    miniAppDiscoveryService,
  });
  const miniAppCatalogService = createMiniAppCatalogService({
    miniAppDiscoveryService,
    miniAppRegistryService,
  });
  const printService = createPrintService({ windowController });
  const moduleDiscoveryService = createModuleDiscoveryService();
  const cenImtreksService = createCenImtreksService({
    windowController,
    catalogService,
  });
  const rejContService = createRejContService();
  const wctCenService = createWctCenService({ windowController });
  const updateService = createUpdateService({
    windowController,
    catalogService,
    packageJson,
  });

  registerIpcHandlers({
    windowController,
    projectService,
    catalogService,
    importService,
    miniAppCatalogService,
    printService,
    updateService,
    moduleDiscoveryService,
    cenImtreksService,
    rejContService,
    wctCenService,
  });

  app.whenReady().then(() => {
    windowController.createMainWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        windowController.createMainWindow();
      }
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("before-quit", (event) => {
    if (shutdownInProgress) {
      return;
    }

    shutdownInProgress = true;
    event.preventDefault();

    (async () => {
      try {
        await cenImtreksService.backupConfiguredDatabase();
      } catch {
        // Ignore backup errors on shutdown to avoid blocking quit.
      }

      try {
        await disconnectOreCatalog();
      } catch {
        // Ignore catalog disconnect errors on shutdown.
      }

      try {
        const { disconnectRejContPrisma } = require("../rej-cont/prisma");
        await disconnectRejContPrisma();
      } catch {
        // Ignore rej-cont disconnect errors on shutdown.
      }

      app.exit(0);
    })();
  });
}

module.exports = {
  bootstrapMainApp,
};

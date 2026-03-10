const { app, BrowserWindow } = require("electron");
const packageJson = require("../../package.json");
const { disconnectOreCatalog } = require("../ore-catalog");
const { createWindowController } = require("./window-controller");
const { createCatalogService } = require("./services/catalog-service");
const { createImportService } = require("./services/import-service");
const { createMiniAppCatalogService } = require("./services/mini-app-catalog-service");
const { createMiniAppDiscoveryService } = require("./services/mini-app-discovery-service");
const { createMiniAppRegistryService } = require("./services/mini-app-registry-service");
const { createModuleDiscoveryService } = require("./services/module-discovery-service");
const { createPrintService } = require("./services/print-service");
const { createProjectService } = require("./services/project-service");
const { createUpdateService } = require("./services/update-service");
const { createWctCenProjectService } = require("./services/wct-cen-project-service");
const { createWctCenService } = require("./services/wct-cen-service");
const { registerIpcHandlers } = require("./ipc/register-ipc-handlers");

function bootstrapMainApp() {
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
  const wctCenProjectService = createWctCenProjectService({ windowController });
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
    wctCenProjectService,
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

  app.on("before-quit", () => {
    disconnectOreCatalog().catch(() => {});
  });
}

module.exports = {
  bootstrapMainApp,
};

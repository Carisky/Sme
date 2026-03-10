const { app, BrowserWindow } = require("electron");
const packageJson = require("../../package.json");
const { disconnectOreCatalog } = require("../ore-catalog");
const { createWindowController } = require("./window-controller");
const { createCatalogService } = require("./services/catalog-service");
const { createImportService } = require("./services/import-service");
const { createMiniAppDiscoveryService } = require("./services/mini-app-discovery-service");
const { createModuleDiscoveryService } = require("./services/module-discovery-service");
const { createPrintService } = require("./services/print-service");
const { createProjectService } = require("./services/project-service");
const { createUpdateService } = require("./services/update-service");
const { registerIpcHandlers } = require("./ipc/register-ipc-handlers");

function bootstrapMainApp() {
  const windowController = createWindowController();
  const catalogService = createCatalogService();
  const projectService = createProjectService({ windowController });
  const importService = createImportService({ windowController });
  const miniAppDiscoveryService = createMiniAppDiscoveryService();
  const printService = createPrintService({ windowController });
  const moduleDiscoveryService = createModuleDiscoveryService();
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
    miniAppDiscoveryService,
    printService,
    updateService,
    moduleDiscoveryService,
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

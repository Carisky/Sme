const { app, dialog, ipcMain } = require("electron");

function registerIpcHandlers({
  windowController,
  projectService,
  catalogService,
  importService,
  miniAppCatalogService,
  printService,
  updateService,
  moduleDiscoveryService,
  cenImtreksService,
  wctCenService,
}) {
  let cachedShellBootstrap = null;
  let pendingShellBootstrap = null;

  async function loadShellBootstrap() {
    if (cachedShellBootstrap) {
      return cachedShellBootstrap;
    }

    if (pendingShellBootstrap) {
      return pendingShellBootstrap;
    }

    pendingShellBootstrap = (async () => {
      const [catalog, updateGate] = await Promise.all([
        miniAppCatalogService.bootstrapCatalog({
          forceRefresh: true,
        }),
        updateService.evaluateUpdateGate({
          forceRefresh: true,
        }),
      ]);

      cachedShellBootstrap = {
        ...catalog,
        updateGate,
      };
      return cachedShellBootstrap;
    })();

    try {
      return await pendingShellBootstrap;
    } finally {
      pendingShellBootstrap = null;
    }
  }

  ipcMain.handle("shell:bootstrap", async () => {
    return loadShellBootstrap();
  });

  ipcMain.handle("shell:open-home", async () => {
    return windowController.loadHomePage();
  });

  ipcMain.handle("shell:open-mini-app", async (_event, miniAppId) => {
    const miniApp = await miniAppCatalogService.getLaunchableMiniAppById(miniAppId);
    if (!miniApp) {
      throw new Error(`Nie znaleziono modulu ${miniAppId}.`);
    }

    return windowController.loadFile(miniApp.pagePath);
  });

  ipcMain.handle("shell:install-mini-app", async (_event, miniAppId) => {
    const catalog = await miniAppCatalogService.installMiniApp(miniAppId);
    if (cachedShellBootstrap) {
      cachedShellBootstrap = {
        ...cachedShellBootstrap,
        ...catalog,
      };
    }

    return catalog;
  });

  ipcMain.handle("app:bootstrap", async () => {
    const cachedUpdateGate = updateService.getCachedUpdateGate();
    const [bootstrapData, updateGate, userModules] = await Promise.all([
      catalogService.loadBootstrapData(),
      cachedUpdateGate
        ? Promise.resolve(cachedUpdateGate)
        : updateService.evaluateUpdateGate(),
      moduleDiscoveryService.listUserModules(),
    ]);

    return {
      ...bootstrapData,
      updateGate,
      userModules,
    };
  });

  ipcMain.handle("project:open", async () => {
    return projectService.openProject();
  });

  ipcMain.handle("project:save", async (_event, state, modules, appId, currentPath) => {
    return projectService.saveProject(state, modules, appId, currentPath);
  });

  ipcMain.handle("project:saveAs", async (_event, state, modules, appId) => {
    return projectService.saveProjectAs(state, modules, appId);
  });

  ipcMain.handle("source:import", async (_event, currentState) => {
    return importService.importFromDialog(currentState);
  });

  ipcMain.handle("catalog:save-customs-office", async (_event, office) => {
    return catalogService.saveCustomsOffice(office);
  });

  ipcMain.handle("catalog:save-origin-country", async (_event, country) => {
    return catalogService.saveOriginCountry(country);
  });

  ipcMain.handle("settings:save", async (_event, settings) => {
    return catalogService.saveAppSettings(settings);
  });

  ipcMain.handle("dialog:choose-directory", async (_event, defaultPath) => {
    const result = await dialog.showOpenDialog(windowController.getMainWindow(), {
      title: "Wybierz folder dla PDF po wydruku",
      defaultPath: defaultPath || app.getPath("documents"),
      properties: ["openDirectory", "createDirectory"],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true };
    }

    return {
      canceled: false,
      filePath: result.filePaths[0],
    };
  });

  ipcMain.handle("print:to-default-printer", async (_event, state) => {
    return printService.printCurrentPreviewToDefaultPrinter(state);
  });

  ipcMain.handle("update:check", async () => {
    const updateGate = await updateService.evaluateUpdateGate({ forceRefresh: true });
    if (cachedShellBootstrap) {
      cachedShellBootstrap = {
        ...cachedShellBootstrap,
        updateGate,
      };
    }

    return updateGate;
  });

  ipcMain.handle("update:download-and-install", async () => {
    return updateService.downloadAndInstallLatestRelease();
  });

  ipcMain.handle("modules:list", async () => {
    return moduleDiscoveryService.listUserModules();
  });

  ipcMain.handle("modules:storage:get", async (_event, moduleId) => {
    return catalogService.loadModuleStorage(moduleId);
  });

  ipcMain.handle("modules:storage:set", async (_event, moduleId, value) => {
    return catalogService.saveModuleStorage(moduleId, value);
  });

  ipcMain.handle("cen-imtreks:project:list", async (_event, dbPath, options) => {
    return cenImtreksService.listProjects(dbPath, options);
  });

  ipcMain.handle("cen-imtreks:project:open", async (_event, dbPath, selector) => {
    return cenImtreksService.openProject(dbPath, selector);
  });

  ipcMain.handle("cen-imtreks:project:save", async (_event, dbPath, state, options) => {
    return cenImtreksService.saveProject(dbPath, state, options);
  });

  ipcMain.handle("cen-imtreks:project:saveAs", async (_event, dbPath, state, options) => {
    return cenImtreksService.saveProject(dbPath, state, {
      ...options,
      createOnly: true,
    });
  });

  ipcMain.handle("cen-imtreks:import", async (_event, currentState) => {
    return cenImtreksService.importFromDialog(currentState);
  });

  ipcMain.handle("cen-imtreks:update", async (_event, currentState, dbPath, options) => {
    return cenImtreksService.updateProjectState(currentState, dbPath, options);
  });

  ipcMain.handle("cen-imtreks:update:cancel", async (_event, updateId) => {
    return cenImtreksService.cancelProjectUpdate(updateId);
  });

  ipcMain.handle("cen-imtreks:db:default", async () => {
    return {
      filePath: cenImtreksService.getDefaultDbPath(),
    };
  });

  ipcMain.handle("cen-imtreks:db:choose", async (_event, currentPath) => {
    return cenImtreksService.chooseDatabasePath(currentPath);
  });

  ipcMain.handle("cen-imtreks:db:list", async (_event, dbPath, options) => {
    return cenImtreksService.listDbRecords(dbPath, options);
  });

  ipcMain.handle("cen-imtreks:db:save", async (_event, dbPath, record) => {
    return cenImtreksService.saveDbRecord(dbPath, record);
  });

  ipcMain.handle("wct-cen:project:list", async (_event, dbPath, options) => {
    return wctCenService.listProjects(dbPath, options);
  });

  ipcMain.handle("wct-cen:project:open", async (_event, dbPath, selector) => {
    return wctCenService.openProject(dbPath, selector);
  });

  ipcMain.handle("wct-cen:project:save", async (_event, dbPath, state, options) => {
    return wctCenService.saveProject(dbPath, state, options);
  });

  ipcMain.handle("wct-cen:project:saveAs", async (_event, dbPath, state, options) => {
    return wctCenService.saveProject(dbPath, state, {
      ...options,
      createOnly: true,
    });
  });

  ipcMain.handle("wct-cen:import", async (_event, currentState) => {
    return wctCenService.importFromDialog(currentState);
  });

  ipcMain.handle("wct-cen:update", async (_event, currentState, dbPath) => {
    return wctCenService.updateProjectState(currentState, dbPath);
  });

  ipcMain.handle("wct-cen:db:default", async () => {
    return {
      filePath: wctCenService.getDefaultDbPath(),
    };
  });

  ipcMain.handle("wct-cen:db:choose", async (_event, currentPath) => {
    return wctCenService.chooseDatabasePath(currentPath);
  });

  ipcMain.handle("wct-cen:db:list", async (_event, dbPath, options) => {
    return wctCenService.listDbRecords(dbPath, options);
  });

  ipcMain.handle("wct-cen:db:save", async (_event, dbPath, record) => {
    return wctCenService.saveDbRecord(dbPath, record);
  });

  ipcMain.on("window:set-title", (_event, title) => {
    windowController.setTitle(title);
  });
}

module.exports = {
  registerIpcHandlers,
};

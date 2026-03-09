const { app, dialog, ipcMain } = require("electron");

function registerIpcHandlers({
  windowController,
  projectService,
  catalogService,
  importService,
  printService,
  updateService,
  moduleDiscoveryService,
}) {
  ipcMain.handle("app:bootstrap", async () => {
    const [bootstrapData, updateGate, userModules] = await Promise.all([
      catalogService.loadBootstrapData(),
      updateService.evaluateUpdateGate(),
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

  ipcMain.handle("project:save", async (_event, state, modules, currentPath) => {
    return projectService.saveProject(state, modules, currentPath);
  });

  ipcMain.handle("project:saveAs", async (_event, state, modules) => {
    return projectService.saveProjectAs(state, modules);
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
    return updateService.evaluateUpdateGate({ forceRefresh: true });
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

  ipcMain.on("window:set-title", (_event, title) => {
    windowController.setTitle(title);
  });
}

module.exports = {
  registerIpcHandlers,
};

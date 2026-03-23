const { contextBridge, ipcRenderer } = require("electron");
const {
  APP_SETTINGS_PATHS,
  DOCUMENT_PRESETS,
  MAX_LINES,
  ORE_TYPES,
  computeSnapshot,
  createEmptyState,
  extractAppSettings,
  getDocumentPreset,
  normalizeState,
  suggestProjectName,
} = require("./src/core");

contextBridge.exposeInMainWorld("bridge", {
  meta: {
    maxLines: MAX_LINES,
    oreTypes: ORE_TYPES,
    documentTypes: Object.keys(DOCUMENT_PRESETS),
    persistedSettingsPaths: APP_SETTINGS_PATHS,
  },
  bootstrapShell: () => ipcRenderer.invoke("shell:bootstrap"),
  openHome: () => ipcRenderer.invoke("shell:open-home"),
  openMiniApp: (miniAppId) => ipcRenderer.invoke("shell:open-mini-app", miniAppId),
  installMiniApp: (miniAppId) => ipcRenderer.invoke("shell:install-mini-app", miniAppId),
  computeSnapshot,
  createEmptyState,
  extractAppSettings,
  getDocumentPreset,
  normalizeState,
  suggestProjectName,
  bootstrap: () => ipcRenderer.invoke("app:bootstrap"),
  openProject: () => ipcRenderer.invoke("project:open"),
  saveProject: (state, currentPath) =>
    ipcRenderer.invoke(
      "project:save",
      state?.state || state,
      state?.modules || {},
      state?.appId || "sme",
      currentPath
    ),
  saveProjectAs: (state) =>
    ipcRenderer.invoke(
      "project:saveAs",
      state?.state || state,
      state?.modules || {},
      state?.appId || "sme"
    ),
  importSourceWorkbook: (state) =>
    ipcRenderer.invoke("source:import", state),
  saveOreKind: (oreKind) =>
    ipcRenderer.invoke("catalog:save-ore-kind", oreKind),
  deleteOreKind: (oreKindId) =>
    ipcRenderer.invoke("catalog:delete-ore-kind", oreKindId),
  saveCustomsOffice: (office) =>
    ipcRenderer.invoke("catalog:save-customs-office", office),
  saveOriginCountry: (country) =>
    ipcRenderer.invoke("catalog:save-origin-country", country),
  saveAppSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  chooseDirectory: (defaultPath) =>
    ipcRenderer.invoke("dialog:choose-directory", defaultPath),
  printToDefaultPrinter: (state) =>
    ipcRenderer.invoke("print:to-default-printer", state),
  savePreviewAsDocx: (state, context) =>
    ipcRenderer.invoke("print:save-docx", state, context),
  checkForUpdates: () => ipcRenderer.invoke("update:check"),
  downloadAndInstallUpdate: () =>
    ipcRenderer.invoke("update:download-and-install"),
  listModules: () => ipcRenderer.invoke("modules:list"),
  loadModuleStorage: (moduleId) =>
    ipcRenderer.invoke("modules:storage:get", moduleId),
  saveModuleStorage: (moduleId, value) =>
    ipcRenderer.invoke("modules:storage:set", moduleId, value),
  listCenImtreksProjects: (dbPath, options) =>
    ipcRenderer.invoke("cen-imtreks:project:list", dbPath, options),
  openCenImtreksProject: (dbPath, selector) =>
    ipcRenderer.invoke("cen-imtreks:project:open", dbPath, selector),
  saveCenImtreksProject: (dbPath, state, options) =>
    ipcRenderer.invoke("cen-imtreks:project:save", dbPath, state, options),
  saveCenImtreksProjectAs: (dbPath, state, options) =>
    ipcRenderer.invoke("cen-imtreks:project:saveAs", dbPath, state, options),
  importCenImtreksWorkbook: (state) =>
    ipcRenderer.invoke("cen-imtreks:import", state),
  importCenImtreksComparisonWorkbook: (selection) =>
    ipcRenderer.invoke("cen-imtreks:comparison:import", selection),
  inspectCenImtreksComparisonWorkbook: (filePath) =>
    ipcRenderer.invoke("cen-imtreks:comparison:inspect", filePath),
  selectCenImtreksComparisonWorkbook: (filePath, selection) =>
    ipcRenderer.invoke("cen-imtreks:comparison:select", filePath, selection),
  exportCenImtreksVisibleRows: (state, rows, options) =>
    ipcRenderer.invoke("cen-imtreks:export-visible", state, rows, options),
  exportCenImtreksComparisonRows: (state, rows, options) =>
    ipcRenderer.invoke("cen-imtreks:comparison:export", state, rows, options),
  updateCenImtreksProject: (state, dbPath, options) =>
    ipcRenderer.invoke("cen-imtreks:update", state, dbPath, options),
  cancelCenImtreksProjectUpdate: (updateId) =>
    ipcRenderer.invoke("cen-imtreks:update:cancel", updateId),
  getDefaultCenImtreksDatabasePath: () =>
    ipcRenderer.invoke("cen-imtreks:db:default"),
  chooseCenImtreksDatabasePath: (currentPath) =>
    ipcRenderer.invoke("cen-imtreks:db:choose", currentPath),
  listCenImtreksLookupRecords: (dbPath, options) =>
    ipcRenderer.invoke("cen-imtreks:db:list", dbPath, options),
  saveCenImtreksLookupRecord: (dbPath, record) =>
    ipcRenderer.invoke("cen-imtreks:db:save", dbPath, record),
  repairCenImtreksLookupT1: (dbPath) =>
    ipcRenderer.invoke("cen-imtreks:db:repair-t1", dbPath),
  listCenImtreksDatabaseBackups: (dbPath) =>
    ipcRenderer.invoke("cen-imtreks:db:backups:list", dbPath),
  restoreCenImtreksDatabaseBackup: (dbPath, backupId) =>
    ipcRenderer.invoke("cen-imtreks:db:backups:restore", dbPath, backupId),
  onCenImtreksStatus: (callback) => {
    ipcRenderer.removeAllListeners("cen-imtreks:status");
    ipcRenderer.on("cen-imtreks:status", (_event, payload) => callback(payload));
  },
  listWctCenProjects: (dbPath, options) =>
    ipcRenderer.invoke("wct-cen:project:list", dbPath, options),
  openWctCenProject: (dbPath, selector) =>
    ipcRenderer.invoke("wct-cen:project:open", dbPath, selector),
  saveWctCenProject: (dbPath, state, options) =>
    ipcRenderer.invoke("wct-cen:project:save", dbPath, state, options),
  saveWctCenProjectAs: (dbPath, state, options) =>
    ipcRenderer.invoke("wct-cen:project:saveAs", dbPath, state, options),
  importWctCenWorkbook: (state) =>
    ipcRenderer.invoke("wct-cen:import", state),
  updateWctCenProject: (state, dbPath) =>
    ipcRenderer.invoke("wct-cen:update", state, dbPath),
  getDefaultWctCenDatabasePath: () =>
    ipcRenderer.invoke("wct-cen:db:default"),
  chooseWctCenDatabasePath: (currentPath) =>
    ipcRenderer.invoke("wct-cen:db:choose", currentPath),
  listWctCenLookupRecords: (dbPath, options) =>
    ipcRenderer.invoke("wct-cen:db:list", dbPath, options),
  saveWctCenLookupRecord: (dbPath, record) =>
    ipcRenderer.invoke("wct-cen:db:save", dbPath, record),
  onPrintStatus: (callback) => {
    ipcRenderer.removeAllListeners("print:status");
    ipcRenderer.on("print:status", (_event, payload) => callback(payload));
  },
  onUpdateStatus: (callback) => {
    ipcRenderer.removeAllListeners("update:status");
    ipcRenderer.on("update:status", (_event, payload) => callback(payload));
  },
  setWindowTitle: (title) => ipcRenderer.send("window:set-title", title),
});

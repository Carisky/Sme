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
  saveCustomsOffice: (office) =>
    ipcRenderer.invoke("catalog:save-customs-office", office),
  saveOriginCountry: (country) =>
    ipcRenderer.invoke("catalog:save-origin-country", country),
  saveAppSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  chooseDirectory: (defaultPath) =>
    ipcRenderer.invoke("dialog:choose-directory", defaultPath),
  printToDefaultPrinter: (state) =>
    ipcRenderer.invoke("print:to-default-printer", state),
  checkForUpdates: () => ipcRenderer.invoke("update:check"),
  downloadAndInstallUpdate: () =>
    ipcRenderer.invoke("update:download-and-install"),
  listModules: () => ipcRenderer.invoke("modules:list"),
  loadModuleStorage: (moduleId) =>
    ipcRenderer.invoke("modules:storage:get", moduleId),
  saveModuleStorage: (moduleId, value) =>
    ipcRenderer.invoke("modules:storage:set", moduleId, value),
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

const { contextBridge, ipcRenderer } = require("electron");
const {
  DOCUMENT_PRESETS,
  MAX_LINES,
  ORE_TYPES,
  computeSnapshot,
  createEmptyState,
  getDocumentPreset,
  normalizeState,
  suggestProjectName,
} = require("./src/core");

contextBridge.exposeInMainWorld("bridge", {
  meta: {
    maxLines: MAX_LINES,
    oreTypes: ORE_TYPES,
    documentTypes: Object.keys(DOCUMENT_PRESETS),
  },
  computeSnapshot,
  createEmptyState,
  getDocumentPreset,
  normalizeState,
  suggestProjectName,
  bootstrap: () => ipcRenderer.invoke("app:bootstrap"),
  openProject: () => ipcRenderer.invoke("project:open"),
  saveProject: (state, currentPath) =>
    ipcRenderer.invoke("project:save", state, currentPath),
  saveProjectAs: (state) => ipcRenderer.invoke("project:saveAs", state),
  importSourceWorkbook: (state) =>
    ipcRenderer.invoke("source:import", state),
  setWindowTitle: (title) => ipcRenderer.send("window:set-title", title),
});

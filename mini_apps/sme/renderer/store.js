import { bridge, cloneValue } from "./bridge.js";

function normalizeProjectModules(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  return cloneValue(input);
}

export function createAppStore() {
  const state = {
    state: null,
    snapshot: null,
    currentProjectPath: null,
    dirty: false,
    activeTab: "dane",
    lastWorkTab: "dane",
    oreKinds: [],
    oreKindDraftId: null,
    customsOffices: [],
    originCountries: [],
    officeDraftId: null,
    originCountryDraftId: null,
    isPrinting: false,
    pendingPrintLayout: null,
    printLayoutVersion: 0,
    settingsSaveTimer: null,
    projectModules: {},
    userModules: [],
    loadedModules: [],
    updateGate: {
      locked: false,
      busy: false,
      status: "idle",
      manifest: null,
    },
    moduleStorageCache: new Map(),
  };

  return {
    state,
    applyCatalogs(result = {}) {
      state.oreKinds = result.oreKinds || state.oreKinds;
      state.customsOffices = result.customsOffices || state.customsOffices;
      state.originCountries = result.originCountries || state.originCountries;
    },
    normalizeProjectModules,
    setProjectModules(modules = {}) {
      state.projectModules = normalizeProjectModules(modules);
    },
    getProjectPayload() {
      return {
        state: bridge.normalizeState(state.state),
        modules: normalizeProjectModules(state.projectModules),
      };
    },
    getProjectModuleData(moduleId, fallback = null) {
      if (!moduleId) {
        return cloneValue(fallback);
      }

      if (!Object.prototype.hasOwnProperty.call(state.projectModules, moduleId)) {
        return cloneValue(fallback);
      }

      return cloneValue(state.projectModules[moduleId]);
    },
    setProjectModuleData(moduleId, value) {
      if (!moduleId) {
        return null;
      }

      state.projectModules[moduleId] = cloneValue(value ?? null);
      return cloneValue(state.projectModules[moduleId]);
    },
    setUserModules(modules = []) {
      state.userModules = Array.isArray(modules)
        ? modules.map((entry) => ({ ...entry }))
        : [];
    },
    setLoadedModules(modules = []) {
      state.loadedModules = Array.isArray(modules)
        ? modules.map((entry) => ({ ...entry }))
        : [];
    },
    async loadModuleStorage(moduleId) {
      if (!moduleId) {
        return null;
      }

      if (state.moduleStorageCache.has(moduleId)) {
        return cloneValue(state.moduleStorageCache.get(moduleId));
      }

      const value = await bridge.loadModuleStorage(moduleId);
      state.moduleStorageCache.set(moduleId, cloneValue(value ?? null));
      return cloneValue(value ?? null);
    },
    async saveModuleStorage(moduleId, value) {
      if (!moduleId) {
        return null;
      }

      const saved = await bridge.saveModuleStorage(moduleId, value ?? null);
      state.moduleStorageCache.set(moduleId, cloneValue(saved ?? null));
      return cloneValue(saved ?? null);
    },
  };
}

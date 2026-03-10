const { normalizeState } = require("./core/index.cjs");

const PROJECT_SCHEMA_VERSION = 2;
const DEFAULT_PROJECT_APP_ID = "sme";

function normalizeProjectModules(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  return JSON.parse(JSON.stringify(input));
}

function normalizeProjectAppId(appId) {
  const normalized = String(appId || DEFAULT_PROJECT_APP_ID).trim();
  return normalized || DEFAULT_PROJECT_APP_ID;
}

function createProjectPayload(state, modules = {}, appId = DEFAULT_PROJECT_APP_ID) {
  return {
    version: PROJECT_SCHEMA_VERSION,
    appId: normalizeProjectAppId(appId),
    savedAt: new Date().toISOString(),
    state: normalizeState(state),
    modules: normalizeProjectModules(modules),
  };
}

function parseProjectPayload(payload = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      version: 0,
      appId: DEFAULT_PROJECT_APP_ID,
      savedAt: "",
      state: normalizeState({}),
      modules: {},
    };
  }

  const projectState =
    payload.state && typeof payload.state === "object" && !Array.isArray(payload.state)
      ? payload.state
      : payload;

  return {
    version: Number(payload.version) || 0,
    appId: normalizeProjectAppId(payload.appId),
    savedAt: String(payload.savedAt || ""),
    state: normalizeState(projectState),
    modules: normalizeProjectModules(payload.modules),
  };
}

module.exports = {
  DEFAULT_PROJECT_APP_ID,
  PROJECT_SCHEMA_VERSION,
  createProjectPayload,
  normalizeProjectModules,
  parseProjectPayload,
};

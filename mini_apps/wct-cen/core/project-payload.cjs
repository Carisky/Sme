const { DEFAULT_PROJECT_APP_ID, createEmptyState, normalizeState } = require("./index.cjs");

const PROJECT_SCHEMA_VERSION = 1;

function createProjectPayload(state, appId = DEFAULT_PROJECT_APP_ID) {
  return {
    version: PROJECT_SCHEMA_VERSION,
    appId: String(appId || DEFAULT_PROJECT_APP_ID).trim() || DEFAULT_PROJECT_APP_ID,
    savedAt: new Date().toISOString(),
    state: normalizeState(state),
  };
}

function parseProjectPayload(payload = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      version: 0,
      appId: DEFAULT_PROJECT_APP_ID,
      savedAt: "",
      state: createEmptyState(),
    };
  }

  const projectState =
    payload.state && typeof payload.state === "object" && !Array.isArray(payload.state)
      ? payload.state
      : payload;

  return {
    version: Number(payload.version) || 0,
    appId: String(payload.appId || DEFAULT_PROJECT_APP_ID).trim() || DEFAULT_PROJECT_APP_ID,
    savedAt: String(payload.savedAt || ""),
    state: normalizeState(projectState),
  };
}

module.exports = {
  DEFAULT_PROJECT_APP_ID,
  PROJECT_SCHEMA_VERSION,
  createProjectPayload,
  parseProjectPayload,
};

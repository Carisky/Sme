const { normalizeState } = require("./core");

const PROJECT_SCHEMA_VERSION = 2;

function normalizeProjectModules(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  return JSON.parse(JSON.stringify(input));
}

function createProjectPayload(state, modules = {}) {
  return {
    version: PROJECT_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    state: normalizeState(state),
    modules: normalizeProjectModules(modules),
  };
}

function parseProjectPayload(payload = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      version: 0,
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
    savedAt: String(payload.savedAt || ""),
    state: normalizeState(projectState),
    modules: normalizeProjectModules(payload.modules),
  };
}

module.exports = {
  PROJECT_SCHEMA_VERSION,
  createProjectPayload,
  normalizeProjectModules,
  parseProjectPayload,
};

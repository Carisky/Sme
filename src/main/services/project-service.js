const path = require("path");
const fs = require("fs/promises");
const { app, dialog } = require("electron");
const { sanitizeFileName, suggestProjectName } = require("../../core");
const {
  DEFAULT_PROJECT_APP_ID,
  createProjectPayload,
  parseProjectPayload,
} = require("../../project-payload");

function normalizeAppId(appId) {
  const normalized = sanitizeFileName(appId || DEFAULT_PROJECT_APP_ID);
  return normalized || DEFAULT_PROJECT_APP_ID;
}

function createProjectService({ windowController }) {
  async function chooseProjectPath(suggestedName, appId = DEFAULT_PROJECT_APP_ID) {
    const normalizedAppId = normalizeAppId(appId);
    const defaultName = `${sanitizeFileName(suggestedName || `projekt-${normalizedAppId}`)}.${normalizedAppId}.json`;
    return dialog.showSaveDialog(windowController.getMainWindow(), {
      title: `Zapisz projekt ${normalizedAppId.toUpperCase()}`,
      defaultPath: path.join(app.getPath("documents"), defaultName),
      filters: [{ name: "Projekt aplikacji", extensions: ["json"] }],
    });
  }

  async function writeProjectFile(filePath, state, modules, appId) {
    const payload = createProjectPayload(state, modules, appId);
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
  }

  async function openProject() {
    const result = await dialog.showOpenDialog(windowController.getMainWindow(), {
      title: "Otworz projekt aplikacji",
      properties: ["openFile"],
      filters: [{ name: "Projekt aplikacji", extensions: ["json"] }],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true };
    }

    const filePath = result.filePaths[0];
    const raw = await fs.readFile(filePath, "utf8");
    const payload = parseProjectPayload(JSON.parse(raw));

    return {
      canceled: false,
      filePath,
      appId: payload.appId,
      state: payload.state,
      modules: payload.modules,
    };
  }

  async function saveProject(state, modules, appId, currentPath) {
    let targetPath = currentPath;
    const normalizedAppId = normalizeAppId(appId);

    if (!targetPath) {
      const saveDialog = await chooseProjectPath(suggestProjectName(state), normalizedAppId);
      if (saveDialog.canceled || !saveDialog.filePath) {
        return { canceled: true };
      }

      targetPath = saveDialog.filePath;
    }

    await writeProjectFile(targetPath, state, modules, normalizedAppId);
    return { canceled: false, filePath: targetPath };
  }

  async function saveProjectAs(state, modules, appId) {
    const normalizedAppId = normalizeAppId(appId);
    const saveDialog = await chooseProjectPath(suggestProjectName(state), normalizedAppId);
    if (saveDialog.canceled || !saveDialog.filePath) {
      return { canceled: true };
    }

    await writeProjectFile(saveDialog.filePath, state, modules, normalizedAppId);
    return { canceled: false, filePath: saveDialog.filePath };
  }

  return {
    openProject,
    saveProject,
    saveProjectAs,
  };
}

module.exports = {
  createProjectService,
};

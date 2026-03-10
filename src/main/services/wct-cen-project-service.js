const path = require("path");
const fs = require("fs/promises");
const { app, dialog } = require("electron");
const {
  DEFAULT_PROJECT_APP_ID,
  createProjectPayload,
  parseProjectPayload,
} = require("../../../mini_apps/wct-cen/core/project-payload.cjs");
const {
  sanitizeFileName,
  suggestProjectName,
} = require("../../../mini_apps/wct-cen/core/index.cjs");

function createWctCenProjectService({ windowController }) {
  async function chooseProjectPath(suggestedName) {
    const defaultName = `${sanitizeFileName(suggestedName || DEFAULT_PROJECT_APP_ID)}.${DEFAULT_PROJECT_APP_ID}.json`;
    return dialog.showSaveDialog(windowController.getMainWindow(), {
      title: "Zapisz projekt WCT CEN",
      defaultPath: path.join(app.getPath("documents"), defaultName),
      filters: [{ name: "Projekt WCT CEN", extensions: ["json"] }],
    });
  }

  async function writeProjectFile(filePath, state) {
    const payload = createProjectPayload(state, DEFAULT_PROJECT_APP_ID);
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
  }

  async function openProject() {
    const result = await dialog.showOpenDialog(windowController.getMainWindow(), {
      title: "Otworz projekt WCT CEN",
      properties: ["openFile"],
      filters: [{ name: "Projekt WCT CEN", extensions: ["json"] }],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true };
    }

    const filePath = result.filePaths[0];
    const raw = await fs.readFile(filePath, "utf8");
    const payload = parseProjectPayload(JSON.parse(raw));

    if (payload.appId !== DEFAULT_PROJECT_APP_ID) {
      throw new Error(`Ten projekt nalezy do modulu ${payload.appId}.`);
    }

    return {
      canceled: false,
      filePath,
      appId: payload.appId,
      state: payload.state,
    };
  }

  async function saveProject(state, currentPath) {
    let targetPath = currentPath;
    if (!targetPath) {
      const saveDialog = await chooseProjectPath(suggestProjectName(state));
      if (saveDialog.canceled || !saveDialog.filePath) {
        return { canceled: true };
      }

      targetPath = saveDialog.filePath;
    }

    await writeProjectFile(targetPath, state);
    return {
      canceled: false,
      filePath: targetPath,
    };
  }

  async function saveProjectAs(state) {
    const saveDialog = await chooseProjectPath(suggestProjectName(state));
    if (saveDialog.canceled || !saveDialog.filePath) {
      return { canceled: true };
    }

    await writeProjectFile(saveDialog.filePath, state);
    return {
      canceled: false,
      filePath: saveDialog.filePath,
    };
  }

  return {
    openProject,
    saveProject,
    saveProjectAs,
  };
}

module.exports = {
  createWctCenProjectService,
};

const path = require("path");
const fs = require("fs/promises");
const { app, dialog } = require("electron");
const { sanitizeFileName, suggestProjectName } = require("../../core");
const { createProjectPayload, parseProjectPayload } = require("../../project-payload");

function createProjectService({ windowController }) {
  async function chooseProjectPath(suggestedName) {
    const defaultName = `${sanitizeFileName(suggestedName || "projekt-sme")}.sme.json`;
    return dialog.showSaveDialog(windowController.getMainWindow(), {
      title: "Zapisz projekt SME",
      defaultPath: path.join(app.getPath("documents"), defaultName),
      filters: [{ name: "Projekt SME", extensions: ["json"] }],
    });
  }

  async function writeProjectFile(filePath, state, modules) {
    const payload = createProjectPayload(state, modules);
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
  }

  async function openProject() {
    const result = await dialog.showOpenDialog(windowController.getMainWindow(), {
      title: "Otworz projekt SME",
      properties: ["openFile"],
      filters: [{ name: "Projekt SME", extensions: ["json"] }],
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
      state: payload.state,
      modules: payload.modules,
    };
  }

  async function saveProject(state, modules, currentPath) {
    let targetPath = currentPath;

    if (!targetPath) {
      const saveDialog = await chooseProjectPath(suggestProjectName(state));
      if (saveDialog.canceled || !saveDialog.filePath) {
        return { canceled: true };
      }

      targetPath = saveDialog.filePath;
    }

    await writeProjectFile(targetPath, state, modules);
    return { canceled: false, filePath: targetPath };
  }

  async function saveProjectAs(state, modules) {
    const saveDialog = await chooseProjectPath(suggestProjectName(state));
    if (saveDialog.canceled || !saveDialog.filePath) {
      return { canceled: true };
    }

    await writeProjectFile(saveDialog.filePath, state, modules);
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

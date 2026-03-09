const { dialog } = require("electron");
const { importSourceWorkbook } = require("../../excel");

function createImportService({ windowController }) {
  async function importFromDialog(currentState) {
    const result = await dialog.showOpenDialog(windowController.getMainWindow(), {
      title: "Importuj plik zrodlowy Excel",
      properties: ["openFile"],
      filters: [{ name: "Excel", extensions: ["xls", "xlsx", "xlsm"] }],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true };
    }

    const filePath = result.filePaths[0];
    return {
      canceled: false,
      filePath,
      state: importSourceWorkbook(filePath, currentState),
    };
  }

  return {
    importFromDialog,
  };
}

module.exports = {
  createImportService,
};

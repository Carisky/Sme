const path = require("path");
const fs = require("fs/promises");
const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const {
  createEmptyState,
  normalizeState,
  sanitizeFileName,
  suggestProjectName,
} = require("./src/core");
const { SAMPLE_WORKBOOK_PATH } = require("./src/constants");
const { importSourceWorkbook, readTemplateWorkbook } = require("./src/excel");
const {
  disconnectOreCatalog,
  listCustomsOffices,
  listOreKinds,
  saveCustomsOffice,
} = require("./src/ore-catalog");

let mainWindow;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1520,
    height: 980,
    minWidth: 1180,
    minHeight: 820,
    backgroundColor: "#e6e0d2",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "app", "index.html"));
}

async function chooseProjectPath(suggestedName) {
  const defaultName = `${sanitizeFileName(suggestedName || "projekt-sme")}.sme.json`;
  return dialog.showSaveDialog(mainWindow, {
    title: "Zapisz projekt SME",
    defaultPath: path.join(app.getPath("documents"), defaultName),
    filters: [{ name: "SME Project", extensions: ["json"] }],
  });
}

async function writeProjectFile(filePath, state) {
  const payload = {
    version: 1,
    savedAt: new Date().toISOString(),
    state: normalizeState(state),
  };

  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
}

app.whenReady().then(() => {
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

ipcMain.handle("app:bootstrap", async () => {
  let oreKinds = [];
  let customsOffices = [];
  let catalogError = null;

  try {
    oreKinds = await listOreKinds();
    customsOffices = await listCustomsOffices();
  } catch (error) {
    catalogError = `Nie udalo sie odczytac slownikow aplikacji: ${error.message}`;
  }

  try {
    return {
      state: readTemplateWorkbook(SAMPLE_WORKBOOK_PATH),
      source: SAMPLE_WORKBOOK_PATH,
      oreKinds,
      customsOffices,
      catalogError,
    };
  } catch (error) {
    return {
      state: createEmptyState(),
      oreKinds,
      customsOffices,
      catalogError,
      error: `Nie udało się odczytać szablonu Trade_N.xls: ${error.message}`,
    };
  }
});

ipcMain.handle("project:open", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Otwórz projekt SME",
    properties: ["openFile"],
    filters: [{ name: "SME Project", extensions: ["json"] }],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  const filePath = result.filePaths[0];
  const raw = await fs.readFile(filePath, "utf8");
  const payload = JSON.parse(raw);

  return {
    canceled: false,
    filePath,
    state: normalizeState(payload.state || payload),
  };
});

ipcMain.handle("project:save", async (_event, state, currentPath) => {
  let targetPath = currentPath;

  if (!targetPath) {
    const saveDialog = await chooseProjectPath(suggestProjectName(state));
    if (saveDialog.canceled || !saveDialog.filePath) {
      return { canceled: true };
    }

    targetPath = saveDialog.filePath;
  }

  await writeProjectFile(targetPath, state);
  return { canceled: false, filePath: targetPath };
});

ipcMain.handle("project:saveAs", async (_event, state) => {
  const saveDialog = await chooseProjectPath(suggestProjectName(state));
  if (saveDialog.canceled || !saveDialog.filePath) {
    return { canceled: true };
  }

  await writeProjectFile(saveDialog.filePath, state);
  return { canceled: false, filePath: saveDialog.filePath };
});

ipcMain.handle("source:import", async (_event, currentState) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Importuj plik źródłowy Excel",
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
});

ipcMain.handle("catalog:save-customs-office", async (_event, office) => {
  return saveCustomsOffice(office);
});

ipcMain.handle("print:open-pdf-preview", async () => {
  if (!mainWindow) {
    throw new Error("Okno aplikacji nie jest gotowe do wydruku.");
  }

  const pdfBuffer = await mainWindow.webContents.printToPDF({
    printBackground: true,
    pageSize: "A4",
    preferCSSPageSize: true,
  });
  const pdfPath = path.join(app.getPath("temp"), `sme-preview-${Date.now()}.pdf`);

  await fs.writeFile(pdfPath, pdfBuffer);

  const openError = await shell.openPath(pdfPath);
  if (openError) {
    throw new Error(openError);
  }

  return { pdfPath };
});

ipcMain.on("window:set-title", (_event, title) => {
  if (mainWindow) {
    mainWindow.setTitle(title);
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  disconnectOreCatalog().catch(() => {});
});

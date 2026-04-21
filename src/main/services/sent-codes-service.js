const path = require("path");
const fs = require("fs/promises");
const { app, dialog } = require("electron");
const {
  importSentCodesFromWorkbook,
  inspectSentCodesWorkbook,
} = require("../../sent-codes/import-workbook");
const {
  getDefaultSentCodesDbPath,
  listSentCheckRows,
  listSentCodes,
  replaceImportedSentCodes,
  replaceSentCodes,
  resolveSentCodesDbPath,
} = require("../../sent-codes/store");

const SENT_CODES_DATA_SET_PATH = path.resolve(
  __dirname,
  "../../../mini_apps/sent-codes/data-set.json"
);

async function loadCodesFromDataSet() {
  let rawData = "";
  try {
    rawData = await fs.readFile(SENT_CODES_DATA_SET_PATH, "utf8");
  } catch (error) {
    throw new Error(
      `Nie mozna odczytac pliku rejestru SENT (${SENT_CODES_DATA_SET_PATH}): ${String(
        error?.message || error
      )}`
    );
  }

  let parsed = null;
  try {
    parsed = JSON.parse(rawData);
  } catch (error) {
    throw new Error(
      `Plik rejestru SENT ma niepoprawny JSON (${SENT_CODES_DATA_SET_PATH}): ${String(
        error?.message || error
      )}`
    );
  }

  const sourceCodes = Array.isArray(parsed?.codes) ? parsed.codes : [];
  const uniqueCodes = Array.from(
    new Set(
      sourceCodes
        .map((code) => String(code ?? "").trim())
        .filter(Boolean)
    )
  );

  return uniqueCodes;
}

function createEmptySyncState() {
  return {
    status: "idle",
    trigger: "",
    startedAt: "",
    finishedAt: "",
    dbPath: "",
    fetchedCount: 0,
    savedCount: 0,
    error: "",
    progress: 0,
    page: 0,
  };
}

function createSentCodesService({ windowController } = {}) {
  let activeRefreshPromise = null;
  let syncState = createEmptySyncState();

  function getDbPath() {
    return resolveSentCodesDbPath("", app.getPath("appData"));
  }

  function publishStatus(payload = {}) {
    if (!windowController?.send) {
      return;
    }

    windowController.send("sent-codes:status", payload);
  }

  function updateSyncState(nextState = {}) {
    syncState = {
      ...syncState,
      ...nextState,
      dbPath: syncState.dbPath || getDbPath(),
    };
  }

  async function refreshCodes(options = {}) {
    if (activeRefreshPromise) {
      return activeRefreshPromise;
    }

    const trigger = String(options.trigger || "manual").trim() || "manual";
    const startedAt = new Date().toISOString();
    const dbPath = getDbPath();

    updateSyncState({
      status: "running",
      trigger,
      startedAt,
      finishedAt: "",
      dbPath,
      fetchedCount: 0,
      savedCount: 0,
      error: "",
      progress: 0,
      page: 0,
    });

    publishStatus({
      type: "running",
      ...syncState,
    });

    activeRefreshPromise = (async () => {
      try {
        const codes = await loadCodesFromDataSet();

        updateSyncState({
          page: 1,
          fetchedCount: codes.length,
          progress: 65,
        });
        publishStatus({
          type: "progress",
          ...syncState,
        });

        const saveResult = await replaceSentCodes(dbPath, codes);
        updateSyncState({
          status: "success",
          finishedAt: new Date().toISOString(),
          fetchedCount: codes.length,
          savedCount: saveResult.savedCount,
          progress: 100,
          error: "",
        });

        publishStatus({
          type: "completed",
          ...syncState,
        });

        return { ...syncState };
      } catch (error) {
        updateSyncState({
          status: "failed",
          finishedAt: new Date().toISOString(),
          progress: 0,
          error: String(error?.message || "Sent-codes sync failed."),
        });

        publishStatus({
          type: "failed",
          ...syncState,
        });

        throw error;
      } finally {
        activeRefreshPromise = null;
      }
    })();

    return activeRefreshPromise;
  }

  async function listCodes(options = {}) {
    const dbPath = getDbPath();
    const response = await listSentCodes(dbPath, options);

    return {
      ...response,
      dbPath,
      syncState: {
        ...syncState,
        dbPath,
      },
    };
  }

  async function listCheck(options = {}) {
    const dbPath = getDbPath();
    const response = await listSentCheckRows(dbPath, options);

    return {
      ...response,
      dbPath,
      syncState: {
        ...syncState,
        dbPath,
      },
    };
  }

  async function inspectImportFromDialog() {
    if (!windowController?.getMainWindow) {
      throw new Error("Main window is not ready.");
    }

    const result = await dialog.showOpenDialog(windowController.getMainWindow(), {
      title: "Wybierz plik Excel do importu HS Code",
      properties: ["openFile"],
      filters: [{ name: "Excel", extensions: ["xlsx", "xlsm", "xls"] }],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true };
    }

    const filePath = path.resolve(result.filePaths[0]);
    return {
      canceled: false,
      filePath,
      workbook: inspectSentCodesWorkbook(filePath),
    };
  }

  async function importCheckFromWorkbook(request = {}) {
    const dbPath = getDbPath();
    const filePath = path.resolve(String(request.filePath || "").trim());
    if (!filePath) {
      throw new Error("Brak sciezki do pliku Excel.");
    }

    const importResult = importSentCodesFromWorkbook(filePath, {
      sheetName: request.sheetName,
      columnIndex: request.columnIndex,
    });

    const stored = await replaceImportedSentCodes(dbPath, importResult.entries, {
      fileName: importResult.fileName,
      filePath: importResult.filePath,
      sheetName: importResult.sheetName,
      columnName: importResult.columnName,
      columnIndex: importResult.columnIndex,
      sourceRowCount: importResult.sourceRowCount,
      nonEmptyRowCount: importResult.nonEmptyRowCount,
      totalExtracted: importResult.totalExtracted,
      uniqueCount: importResult.uniqueCount,
      invalidCellCount: importResult.invalidCellCount,
      importedAt: new Date().toISOString(),
    });

    return {
      dbPath,
      fileName: importResult.fileName,
      filePath: importResult.filePath,
      sheetName: importResult.sheetName,
      columnName: importResult.columnName,
      columnIndex: importResult.columnIndex,
      sourceRowCount: importResult.sourceRowCount,
      nonEmptyRowCount: importResult.nonEmptyRowCount,
      totalExtracted: importResult.totalExtracted,
      invalidCellCount: importResult.invalidCellCount,
      importedCount: stored.importedCount,
      uniqueCount: stored.importMeta.uniqueCount,
      importMeta: stored.importMeta,
      workbook: importResult.workbook,
      selected: importResult.selected,
    };
  }

  function getSyncState() {
    const dbPath = getDbPath();
    return {
      ...syncState,
      dbPath,
      isRunning: Boolean(activeRefreshPromise),
    };
  }

  function startStartupRefresh() {
    refreshCodes({ trigger: "startup" }).catch(() => {
      // Errors are exposed via sync state and status events.
    });
  }

  return {
    getDefaultDbPath: () => getDefaultSentCodesDbPath(app.getPath("appData")),
    getSyncState,
    importCheckFromWorkbook,
    inspectImportFromDialog,
    listCheck,
    listCodes,
    refreshCodes,
    startStartupRefresh,
  };
}

module.exports = {
  createSentCodesService,
};

const { app, dialog } = require("electron");
const {
  asText,
  normalizeContainerNumber,
  normalizeLookupRecord,
  normalizeProjectRow,
  normalizeState,
} = require("../../../mini_apps/wct-cen/core/index.cjs");
const { importWctCenWorkbook } = require("../../../mini_apps/wct-cen/core/excel.cjs");
const { lookupContainers } = require("../../wct-cen-lookup");
const {
  findLookupRecordsByContainers,
  getProjectById,
  getProjectByName,
  getDefaultWctCenDbPath,
  listLookupRecords,
  listProjectSummaries,
  resolveWctCenDbPath,
  saveLookupRecord,
  saveLookupRecords,
  saveProjectState,
} = require("../../wct-cen-db");

function createWctCenService({ windowController }) {
  function resolveDbPath(dbPath) {
    return resolveWctCenDbPath(dbPath, app.getPath("appData"));
  }

  async function chooseDatabasePath(currentPath) {
    const defaultPath = resolveDbPath(currentPath);
    const result = await dialog.showSaveDialog(windowController.getMainWindow(), {
      title: "Wybierz baze danych WCT CEN",
      defaultPath,
      filters: [{ name: "SQLite", extensions: ["sqlite", "db"] }],
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    return {
      canceled: false,
      filePath: result.filePath,
    };
  }

  async function importFromDialog(currentState) {
    const result = await dialog.showOpenDialog(windowController.getMainWindow(), {
      title: "Importuj Excel WCT CEN",
      properties: ["openFile"],
      filters: [{ name: "Excel", extensions: ["xlsx", "xlsm", "xls"] }],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true };
    }

    const filePath = result.filePaths[0];
    return {
      canceled: false,
      filePath,
      state: importWctCenWorkbook(filePath, currentState),
    };
  }

  async function listDbRecords(dbPath, options = {}) {
    const resolvedDbPath = resolveDbPath(dbPath);
    return {
      dbPath: resolvedDbPath,
      records: await listLookupRecords(resolvedDbPath, options),
    };
  }

  async function saveDbRecord(dbPath, record) {
    const resolvedDbPath = resolveDbPath(dbPath);
    return {
      dbPath: resolvedDbPath,
      record: await saveLookupRecord(resolvedDbPath, record, "manual"),
    };
  }

  async function listProjects(dbPath, options = {}) {
    const resolvedDbPath = resolveDbPath(dbPath);
    return {
      dbPath: resolvedDbPath,
      projects: await listProjectSummaries(resolvedDbPath, options),
    };
  }

  async function openProject(dbPath, selector = {}) {
    const resolvedDbPath = resolveDbPath(dbPath);
    const projectId = Number(selector?.projectId) || 0;
    const projectName = asText(selector?.projectName);
    const result = projectId > 0
      ? await getProjectById(resolvedDbPath, projectId)
      : await getProjectByName(resolvedDbPath, projectName);

    if (!result?.project?.id) {
      throw new Error(
        projectName
          ? `Nie znaleziono projektu "${projectName}".`
          : "Nie znaleziono projektu WCT CEN."
      );
    }

    return {
      canceled: false,
      dbPath: resolvedDbPath,
      project: result.project,
      state: normalizeState({
        ...result.state,
        dbPath: resolvedDbPath,
      }),
    };
  }

  async function saveProject(dbPath, currentState, options = {}) {
    const resolvedDbPath = resolveDbPath(dbPath);
    const result = await saveProjectState(
      resolvedDbPath,
      normalizeState({
        ...currentState,
        dbPath: resolvedDbPath,
      }),
      {
        projectId: options?.projectId,
        projectName: options?.projectName,
        createOnly: Boolean(options?.createOnly),
      }
    );

    return {
      canceled: false,
      dbPath: resolvedDbPath,
      project: result.project,
      state: normalizeState({
        ...result.state,
        dbPath: resolvedDbPath,
      }),
    };
  }

  async function updateProjectState(currentState, dbPath) {
    const resolvedDbPath = resolveDbPath(dbPath);
    const normalizedState = normalizeState(currentState);
    const rowsToProcess = normalizedState.rows.filter(
      (row) => row.containerNumber && !row.cen
    );

    const uniqueContainers = Array.from(
      new Set(rowsToProcess.map((row) => normalizeContainerNumber(row.containerNumber)).filter(Boolean))
    );

    const dbRecords = await findLookupRecordsByContainers(resolvedDbPath, uniqueContainers);
    const resolvedMap = new Map(
      dbRecords.map((record) => [record.containerNumber, normalizeLookupRecord(record)])
    );

    const unresolvedContainers = uniqueContainers.filter((containerNumber) => {
      const existing = resolvedMap.get(containerNumber);
      return !existing || !existing.cen;
    });

    let lookupErrors = [];
    if (unresolvedContainers.length > 0) {
      const lookupResult = await lookupContainers(unresolvedContainers);
      lookupErrors = lookupResult.errors;

      const fetchedRecords = [];
      lookupResult.map.forEach((value, containerNumber) => {
        const normalizedRecord = normalizeLookupRecord({
          containerNumber,
          cen: value.cen,
          tState: value.tState,
          stop: value.stop,
          source: "lookup",
        });
        resolvedMap.set(containerNumber, normalizedRecord);
        if (normalizedRecord.cen || normalizedRecord.stop || normalizedRecord.tState) {
          fetchedRecords.push(normalizedRecord);
        }
      });

      if (fetchedRecords.length > 0) {
        await saveLookupRecords(resolvedDbPath, fetchedRecords, "lookup");
      }
    }

    let updatedCen = 0;
    let updatedStop = 0;
    let updatedTState = 0;
    let notFound = 0;

    const nextRows = normalizedState.rows.map((row) => {
      const normalizedContainer = normalizeContainerNumber(row.containerNumber);
      if (!normalizedContainer || row.cen) {
        return row;
      }

      const record = resolvedMap.get(normalizedContainer);
      if (!record || !record.cen) {
        notFound += 1;
        return row;
      }

      if (record.cen) {
        updatedCen += 1;
      }

      if (record.stop) {
        updatedStop += 1;
      }

      if (record.tState) {
        updatedTState += 1;
      }

      return normalizeProjectRow({
        ...row,
        cen: record.cen || row.cen,
        stop: record.stop || row.stop,
        tState: record.tState || row.tState,
      });
    });

    return {
      dbPath: resolvedDbPath,
      state: normalizeState({
        ...normalizedState,
        dbPath: resolvedDbPath,
        rows: nextRows,
      }),
      stats: {
        rowsToProcess: rowsToProcess.length,
        uniqueContainers: uniqueContainers.length,
        resolvedFromDb: dbRecords.filter((record) => record.cen).length,
        resolvedFromLookup: Math.max(updatedCen - dbRecords.filter((record) => record.cen).length, 0),
        updatedCen,
        updatedStop,
        updatedTState,
        notFound,
        lookupErrors,
      },
    };
  }

  return {
    chooseDatabasePath,
    getDefaultDbPath: () => getDefaultWctCenDbPath(app.getPath("appData")),
    importFromDialog,
    listDbRecords,
    listProjects,
    openProject,
    saveDbRecord,
    saveProject,
    updateProjectState,
  };
}

module.exports = {
  createWctCenService,
};

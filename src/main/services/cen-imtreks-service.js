const { app, dialog } = require("electron");
const {
  asText,
  flattenProjectRows,
  normalizeContainerNumber,
  normalizeLookupRecord,
  normalizeProjectRow,
  normalizeProjectSheet,
  normalizeState,
} = require("../../../mini_apps/cen-imtreks/core/index.cjs");
const { importCenImtreksWorkbook } = require("../../../mini_apps/cen-imtreks/core/excel.cjs");
const { LOOKUP_URL, lookupContainers } = require("../../wct-cen-lookup");
const {
  findLookupRecordsByContainers,
  getDefaultCenImtreksDbPath,
  getProjectById,
  getProjectByName,
  listLookupRecords,
  listProjectSummaries,
  resolveCenImtreksDbPath,
  saveLookupRecord,
  saveLookupRecords,
  saveProjectState,
} = require("../../cen-imtreks-db");

const LOOKUP_BCT_URL = "http://85.11.79.242:3400/lookup-bct";
const LOOKUP_ENDPOINTS = [
  {
    label: "GDANSK_DCT",
    url: LOOKUP_URL,
    pattern: /\bGDANSK\b.*\bDCT\b/i,
  },
  {
    label: "GDYNYA_BCT",
    url: LOOKUP_BCT_URL,
    pattern: /\bGDY(?:NYA|NIA)\b.*\bBCT\b/i,
  },
];

function resolveLookupEndpoint(customsOffice) {
  const value = asText(customsOffice);
  return LOOKUP_ENDPOINTS.find((entry) => entry.pattern.test(value)) || null;
}

function clampProgress(value) {
  return Math.max(0, Math.min(Number(value) || 0, 100));
}

function createLookupNeeds() {
  return {
    needsCen: false,
    needsStatus: false,
    needsStop: false,
  };
}

function rowNeedsLookup(row) {
  return Boolean(normalizeContainerNumber(row.containerNumber)) && (!row.t1 || !row.status || !row.stop);
}

function buildLookupNeedsByContainer(rows = []) {
  const needsByContainer = new Map();

  rows.forEach((row) => {
    const containerNumber = normalizeContainerNumber(row.containerNumber);
    if (!containerNumber) {
      return;
    }

    const current = needsByContainer.get(containerNumber) || createLookupNeeds();
    if (!row.t1) {
      current.needsCen = true;
    }
    if (!row.status) {
      current.needsStatus = true;
    }
    if (!row.stop) {
      current.needsStop = true;
    }
    needsByContainer.set(containerNumber, current);
  });

  return needsByContainer;
}

function hasLookupDataForNeeds(record, needs) {
  if (!needs) {
    return true;
  }

  return (
    (!needs.needsCen || Boolean(record?.cen)) &&
    (!needs.needsStatus || Boolean(record?.tState)) &&
    (!needs.needsStop || Boolean(record?.stop))
  );
}

function createCenImtreksService({ windowController }) {
  function publishStatus(payload = {}) {
    windowController.send("cen-imtreks:status", {
      action: "update",
      ...payload,
      progress: clampProgress(payload.progress),
    });
  }

  function resolveDbPath(dbPath) {
    return resolveCenImtreksDbPath(dbPath, app.getPath("appData"));
  }

  async function chooseDatabasePath(currentPath) {
    const defaultPath = resolveDbPath(currentPath);
    const result = await dialog.showSaveDialog(windowController.getMainWindow(), {
      title: "Wybierz baze danych CEN IMTREKS",
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
      title: "Importuj Excel CEN IMTREKS",
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
      state: importCenImtreksWorkbook(filePath, currentState),
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
          : "Nie znaleziono projektu CEN IMTREKS."
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
    const allRows = flattenProjectRows(normalizedState);
    const rowsToProcess = allRows.filter(rowNeedsLookup);
    const lookupNeedsByContainer = buildLookupNeedsByContainer(rowsToProcess);
    const uniqueContainers = Array.from(lookupNeedsByContainer.keys());

    publishStatus({
      stage: "scan",
      progress: 6,
      message:
        rowsToProcess.length > 0
          ? `Analiza projektu: ${rowsToProcess.length} wierszy wymaga uzupelnienia.`
          : "Analiza projektu: brak wierszy wymagajacych uzupelnienia.",
    });

    if (uniqueContainers.length === 0) {
      return {
        dbPath: resolvedDbPath,
        state: normalizeState({
          ...normalizedState,
          dbPath: resolvedDbPath,
        }),
        stats: {
          rowsToProcess: 0,
          uniqueContainers: 0,
          resolvedFromDb: 0,
          resolvedFromLookup: 0,
          updatedT1: 0,
          updatedStatus: 0,
          updatedStop: 0,
          notFound: 0,
          skippedTerminalRows: 0,
          lookupErrors: [],
        },
      };
    }

    publishStatus({
      stage: "db",
      progress: 16,
      message: `Sprawdzanie lokalnej bazy dla ${uniqueContainers.length} kontenerow.`,
    });
    const dbRecords = await findLookupRecordsByContainers(resolvedDbPath, uniqueContainers);
    const resolvedMap = new Map(
      dbRecords.map((record) => [record.containerNumber, normalizeLookupRecord(record)])
    );
    const unresolvedByEndpoint = new Map(LOOKUP_ENDPOINTS.map((entry) => [entry.label, new Set()]));
    let skippedTerminalRows = 0;

    rowsToProcess.forEach((row) => {
      const containerNumber = normalizeContainerNumber(row.containerNumber);
      const existing = resolvedMap.get(containerNumber);
      const lookupNeeds = lookupNeedsByContainer.get(containerNumber);
      if (hasLookupDataForNeeds(existing, lookupNeeds)) {
        return;
      }

      const endpoint = resolveLookupEndpoint(row.customsOffice);
      if (!endpoint) {
        skippedTerminalRows += 1;
        return;
      }

      unresolvedByEndpoint.get(endpoint.label)?.add(containerNumber);
    });

    const lookupErrors = [];
    const fetchedRecords = [];
    const totalLookupContainers = LOOKUP_ENDPOINTS.reduce(
      (sum, endpoint) => sum + (unresolvedByEndpoint.get(endpoint.label)?.size || 0),
      0
    );
    let processedLookupContainers = 0;

    if (totalLookupContainers === 0) {
      publishStatus({
        stage: "lookup",
        progress: 72,
        message: "Lookup nie jest potrzebny. Wykorzystuje dane z lokalnej bazy.",
      });
    }

    for (const endpoint of LOOKUP_ENDPOINTS) {
      const containers = Array.from(unresolvedByEndpoint.get(endpoint.label) || []);
      if (containers.length === 0) {
        continue;
      }

      publishStatus({
        stage: "lookup",
        progress: 20 + Math.round((processedLookupContainers / totalLookupContainers) * 52),
        message: `Lookup ${endpoint.label}: 0/${containers.length} kontenerow.`,
      });
      const lookupResult = await lookupContainers(containers, {
        url: endpoint.url,
        onProgress: (progressInfo) => {
          if (progressInfo.phase !== "end-chunk") {
            return;
          }

          const completedContainers = processedLookupContainers + progressInfo.processedContainers;
          publishStatus({
            stage: "lookup",
            progress: 20 + Math.round((completedContainers / totalLookupContainers) * 52),
            message: `Lookup ${endpoint.label}: ${progressInfo.processedContainers}/${containers.length} kontenerow.`,
          });
        },
      });
      lookupErrors.push(
        ...lookupResult.errors.map((message) => `${endpoint.label}: ${message}`)
      );

      lookupResult.map.forEach((value, containerNumber) => {
        const normalizedRecord = normalizeLookupRecord({
          containerNumber,
          cen: value.cen,
          tState: value.tState,
          stop: value.stop,
          source: "lookup",
        });
        resolvedMap.set(containerNumber, normalizedRecord);

        if (normalizedRecord.cen || normalizedRecord.tState || normalizedRecord.stop) {
          fetchedRecords.push(normalizedRecord);
        }
      });

      processedLookupContainers += containers.length;
    }

    if (fetchedRecords.length > 0) {
      publishStatus({
        stage: "save-lookup",
        progress: 80,
        message: `Zapisywanie ${fetchedRecords.length} rekordow lookup do bazy.`,
      });
      await saveLookupRecords(resolvedDbPath, fetchedRecords, "lookup");
    }

    let updatedT1 = 0;
    let updatedStatus = 0;
    let updatedStop = 0;
    let notFound = 0;

    publishStatus({
      stage: "apply",
      progress: 88,
      message: "Uzupelnianie danych w projekcie.",
    });
    const nextSheets = normalizedState.sheets.map((sheet) =>
      normalizeProjectSheet({
        ...sheet,
        rows: sheet.rows.map((row) => {
          const containerNumber = normalizeContainerNumber(row.containerNumber);
          if (!containerNumber) {
            return row;
          }

          const needsT1 = !row.t1;
          const needsStatus = !row.status;
          const needsStop = !row.stop;
          if (!needsT1 && !needsStatus && !needsStop) {
            return row;
          }

          const record = resolvedMap.get(containerNumber);
          const canFillT1 = needsT1 && Boolean(record?.cen);
          const canFillStatus = needsStatus && Boolean(record?.tState);
          const canFillStop = needsStop && Boolean(record?.stop);

          if (!canFillT1 && !canFillStatus && !canFillStop) {
            notFound += 1;
            return row;
          }

          let nextRow = row;
          let changed = false;

          if (canFillT1) {
            nextRow = {
              ...nextRow,
              t1: record.cen,
            };
            updatedT1 += 1;
            changed = true;
          }

          if (canFillStatus) {
            nextRow = {
              ...nextRow,
              status: record.tState,
            };
            updatedStatus += 1;
            changed = true;
          }

          if (canFillStop) {
            nextRow = {
              ...nextRow,
              stop: record.stop,
            };
            updatedStop += 1;
            changed = true;
          }

          return changed ? normalizeProjectRow(nextRow) : row;
        }),
      })
    );

    publishStatus({
      stage: "finalize",
      progress: 94,
      message: "Aktualizacja lookup zakonczona. Zapisywanie stanu projektu.",
    });

    return {
      dbPath: resolvedDbPath,
      state: normalizeState({
        ...normalizedState,
        dbPath: resolvedDbPath,
        sheets: nextSheets,
      }),
      stats: {
        rowsToProcess: rowsToProcess.length,
        uniqueContainers: uniqueContainers.length,
        resolvedFromDb: dbRecords.filter((record) => record.cen || record.tState || record.stop).length,
        resolvedFromLookup: fetchedRecords.length,
        updatedT1,
        updatedStatus,
        updatedStop,
        notFound,
        skippedTerminalRows,
        lookupErrors,
      },
    };
  }

  return {
    chooseDatabasePath,
    getDefaultDbPath: () => getDefaultCenImtreksDbPath(app.getPath("appData")),
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
  createCenImtreksService,
};

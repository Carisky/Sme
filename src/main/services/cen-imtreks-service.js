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

function createUpdateStats() {
  return {
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
  };
}

function normalizeUpdateRequestId(value) {
  return (
    asText(value) ||
    `cen-imtreks-update-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
}

function createCanceledError() {
  const error = new Error("Aktualizacja anulowana.");
  error.code = "UPDATE_CANCELED";
  return error;
}

function hasContainer(row) {
  return Boolean(normalizeContainerNumber(row.containerNumber));
}

function buildRowsToProcess(rows = [], force = false) {
  return rows.filter((row) => (force ? hasContainer(row) : rowNeedsLookup(row)));
}

function normalizeTargetRowIds(targetRowIds = []) {
  return new Set(
    (Array.isArray(targetRowIds) ? targetRowIds : [])
      .map((rowId) => asText(rowId))
      .filter(Boolean)
  );
}

function filterRowsByTargetIds(rows = [], targetRowIds = new Set()) {
  if (!(targetRowIds instanceof Set) || targetRowIds.size === 0) {
    return rows;
  }

  return rows.filter((row) => targetRowIds.has(asText(row.id)));
}

function mergeStats(target, delta = {}) {
  target.updatedT1 += Number(delta.updatedT1) || 0;
  target.updatedStatus += Number(delta.updatedStatus) || 0;
  target.updatedStop += Number(delta.updatedStop) || 0;
}

function applyResolvedRecordsToState(currentState, resolvedMap, options = {}) {
  const force = Boolean(options.force);
  const targetRowIds = normalizeTargetRowIds(options.targetRowIds);
  const targetContainers = options.targetContainers
    ? new Set(options.targetContainers.map(normalizeContainerNumber).filter(Boolean))
    : null;
  const changedRows = [];
  const changedContainers = new Set();
  let updatedT1 = 0;
  let updatedStatus = 0;
  let updatedStop = 0;

  const nextSheets = currentState.sheets.map((sheet) =>
    normalizeProjectSheet({
      ...sheet,
      rows: sheet.rows.map((row) => {
        const containerNumber = normalizeContainerNumber(row.containerNumber);
        if (
          !containerNumber ||
          (targetRowIds.size > 0 && !targetRowIds.has(asText(row.id))) ||
          (targetContainers && !targetContainers.has(containerNumber))
        ) {
          return row;
        }

        const record = resolvedMap.get(containerNumber);
        if (!record) {
          return row;
        }

        let nextRow = row;
        let changed = false;

        if (record.cen && ((force && row.t1 !== record.cen) || (!force && !row.t1))) {
          nextRow = {
            ...nextRow,
            t1: record.cen,
          };
          updatedT1 += 1;
          changed = true;
        }

        if (
          record.tState &&
          ((force && row.status !== record.tState) || (!force && !row.status))
        ) {
          nextRow = {
            ...nextRow,
            status: record.tState,
          };
          updatedStatus += 1;
          changed = true;
        }

        if (record.stop && ((force && row.stop !== record.stop) || (!force && !row.stop))) {
          nextRow = {
            ...nextRow,
            stop: record.stop,
          };
          updatedStop += 1;
          changed = true;
        }

        if (!changed) {
          return row;
        }

        const normalizedRow = normalizeProjectRow(nextRow);
        changedRows.push({
          sheetId: sheet.id,
          row: normalizedRow,
        });
        changedContainers.add(containerNumber);
        return normalizedRow;
      }),
    })
  );

  return {
    state: normalizeState({
      ...currentState,
      sheets: nextSheets,
    }),
    changedRows,
    changedContainers: Array.from(changedContainers),
    statsDelta: {
      updatedT1,
      updatedStatus,
      updatedStop,
    },
  };
}

function countNotFoundRows(initialRows = [], finalState, options = {}) {
  const force = Boolean(options.force);
  const matchedContainers = options.matchedContainers || new Set();
  const finalRowsById = new Map(
    flattenProjectRows(finalState).map((row) => [row.id, row])
  );

  if (force) {
    return initialRows.filter(
      (row) => !matchedContainers.has(normalizeContainerNumber(row.containerNumber))
    ).length;
  }

  return initialRows.filter((row) => {
    const finalRow = finalRowsById.get(row.id) || row;
    const t1Resolved = row.t1 ? true : Boolean(finalRow.t1);
    const statusResolved = row.status ? true : Boolean(finalRow.status);
    const stopResolved = row.stop ? true : Boolean(finalRow.stop);
    return !t1Resolved && !statusResolved && !stopResolved;
  }).length;
}

function createCenImtreksService({ windowController }) {
  const activeUpdates = new Map();

  function publishStatus(payload = {}) {
    windowController.send("cen-imtreks:status", {
      type: "status",
      action: "update",
      ...payload,
      progress: clampProgress(payload.progress),
    });
  }

  function publishPatch(updateId, changes = []) {
    if (!Array.isArray(changes) || changes.length === 0) {
      return;
    }

    windowController.send("cen-imtreks:status", {
      type: "patch",
      action: "update",
      updateId,
      changes,
    });
  }

  function publishFailure(updateId, error, payload = {}) {
    windowController.send("cen-imtreks:status", {
      type: "failed",
      action: "update",
      updateId,
      message: error?.message || "Aktualizacja nieudana.",
      ...payload,
    });
  }

  function createUpdateSession(requestId) {
    const updateId = normalizeUpdateRequestId(requestId);
    const session = {
      updateId,
      abortController: new AbortController(),
      canceled: false,
    };
    activeUpdates.set(updateId, session);
    return session;
  }

  function assertActive(session) {
    if (!session || session.canceled || session.abortController.signal.aborted) {
      throw createCanceledError();
    }
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

  async function updateProjectState(currentState, dbPath, options = {}) {
    const session = createUpdateSession(options.requestId);
    const resolvedDbPath = resolveDbPath(dbPath);
    const force = Boolean(options.force);
    const targetRowIds = normalizeTargetRowIds(options.targetRowIds);
    let workingState = normalizeState(currentState);
    const stats = createUpdateStats();
    const matchedLookupContainers = new Set();
    const resolvedFromDbContainers = new Set();
    const resolvedFromLookupContainers = new Set();
    const fetchedRecords = [];
    const resolvedMap = new Map();

    try {
      const allRows = flattenProjectRows(workingState);
      const selectedRows = filterRowsByTargetIds(allRows, targetRowIds);
      const rowsToProcess = buildRowsToProcess(selectedRows, force);
      stats.rowsToProcess = rowsToProcess.length;

      publishStatus({
        updateId: session.updateId,
        stage: "scan",
        progress: 6,
        message:
          rowsToProcess.length > 0
            ? force
              ? `Force update: ${rowsToProcess.length} wierszy zostanie odswiezonych.`
              : `Analiza projektu: ${rowsToProcess.length} wierszy wymaga uzupelnienia.`
            : "Analiza projektu: brak wierszy wymagajacych uzupelnienia.",
      });

      if (rowsToProcess.length === 0) {
        return {
          canceled: false,
          updateId: session.updateId,
          dbPath: resolvedDbPath,
          state: normalizeState({
            ...workingState,
            dbPath: resolvedDbPath,
          }),
          stats,
        };
      }

      const uniqueContainers = Array.from(
        new Set(rowsToProcess.map((row) => normalizeContainerNumber(row.containerNumber)).filter(Boolean))
      );
      stats.uniqueContainers = uniqueContainers.length;

      assertActive(session);
      if (!force) {
        publishStatus({
          updateId: session.updateId,
          stage: "db",
          progress: 16,
          message: `Sprawdzanie lokalnej bazy dla ${uniqueContainers.length} kontenerow.`,
        });
        const dbRecords = await findLookupRecordsByContainers(resolvedDbPath, uniqueContainers);
        dbRecords.forEach((record) => {
          resolvedMap.set(record.containerNumber, normalizeLookupRecord(record));
        });

        const dbApplication = applyResolvedRecordsToState(workingState, resolvedMap, {
          targetRowIds: rowsToProcess.map((row) => row.id),
          targetContainers: uniqueContainers,
          force: false,
        });
        workingState = dbApplication.state;
        mergeStats(stats, dbApplication.statsDelta);
        dbApplication.changedContainers.forEach((containerNumber) => {
          resolvedFromDbContainers.add(containerNumber);
        });
        publishPatch(session.updateId, dbApplication.changedRows);
      }

      assertActive(session);
      const rowsRemainingForLookup = buildRowsToProcess(
        filterRowsByTargetIds(flattenProjectRows(workingState), targetRowIds),
        force
      );
      const lookupNeedsByContainer = force
        ? new Map(
            rowsRemainingForLookup.map((row) => [
              normalizeContainerNumber(row.containerNumber),
              {
                needsCen: true,
                needsStatus: true,
                needsStop: true,
              },
            ])
          )
        : buildLookupNeedsByContainer(rowsRemainingForLookup);
      const unresolvedByEndpoint = new Map(LOOKUP_ENDPOINTS.map((entry) => [entry.label, new Set()]));

      rowsRemainingForLookup.forEach((row) => {
        const containerNumber = normalizeContainerNumber(row.containerNumber);
        if (!containerNumber) {
          return;
        }

        if (!force) {
          const existing = resolvedMap.get(containerNumber);
          const lookupNeeds = lookupNeedsByContainer.get(containerNumber);
          if (hasLookupDataForNeeds(existing, lookupNeeds)) {
            return;
          }
        }

        const endpoint = resolveLookupEndpoint(row.customsOffice);
        if (!endpoint) {
          stats.skippedTerminalRows += 1;
          return;
        }

        unresolvedByEndpoint.get(endpoint.label)?.add(containerNumber);
      });

      const totalLookupContainers = LOOKUP_ENDPOINTS.reduce(
        (sum, endpoint) => sum + (unresolvedByEndpoint.get(endpoint.label)?.size || 0),
        0
      );
      let processedLookupContainers = 0;

      if (totalLookupContainers === 0) {
        publishStatus({
          updateId: session.updateId,
          stage: "lookup",
          progress: 72,
          message: force
            ? "Force update nie znalazl kontenerow z obslugiwanym terminalem."
            : "Lookup nie jest potrzebny. Wykorzystuje dane z lokalnej bazy.",
        });
      }

      for (const endpoint of LOOKUP_ENDPOINTS) {
        assertActive(session);
        const containers = Array.from(unresolvedByEndpoint.get(endpoint.label) || []);
        if (containers.length === 0) {
          continue;
        }

        publishStatus({
          updateId: session.updateId,
          stage: "lookup",
          progress: 20 + Math.round((processedLookupContainers / totalLookupContainers) * 52),
          message: `Lookup ${endpoint.label}: 0/${containers.length} kontenerow.`,
        });

        const lookupResult = await lookupContainers(containers, {
          url: endpoint.url,
          signal: session.abortController.signal,
          onProgress: (progressInfo) => {
            if (progressInfo.phase !== "end-chunk") {
              return;
            }

            const completedContainers = processedLookupContainers + progressInfo.processedContainers;
            publishStatus({
              updateId: session.updateId,
              stage: "lookup",
              progress: 20 + Math.round((completedContainers / totalLookupContainers) * 52),
              message: `Lookup ${endpoint.label}: ${progressInfo.processedContainers}/${containers.length} kontenerow.`,
            });
          },
          onChunkResult: ({ containers: chunkContainers, map }) => {
            assertActive(session);

            map.forEach((value, containerNumber) => {
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
                matchedLookupContainers.add(containerNumber);
                resolvedFromLookupContainers.add(containerNumber);
              }
            });

            const chunkApplication = applyResolvedRecordsToState(workingState, resolvedMap, {
              targetRowIds: rowsRemainingForLookup
                .filter((row) => chunkContainers.includes(normalizeContainerNumber(row.containerNumber)))
                .map((row) => row.id),
              targetContainers: chunkContainers,
              force,
            });
            workingState = chunkApplication.state;
            mergeStats(stats, chunkApplication.statsDelta);
            publishPatch(session.updateId, chunkApplication.changedRows);
          },
        });

        stats.lookupErrors.push(
          ...lookupResult.errors.map((message) => `${endpoint.label}: ${message}`)
        );
        processedLookupContainers += containers.length;
      }

      if (fetchedRecords.length > 0) {
        publishStatus({
          updateId: session.updateId,
          stage: "save-lookup",
          progress: 80,
          message: `Zapisywanie ${fetchedRecords.length} rekordow lookup do bazy.`,
        });
        await saveLookupRecords(resolvedDbPath, fetchedRecords, "lookup");
      }

      publishStatus({
        updateId: session.updateId,
        stage: "finalize",
        progress: 94,
        message: "Aktualizacja lookup zakonczona. Zapisywanie stanu projektu.",
      });

      stats.resolvedFromDb = resolvedFromDbContainers.size;
      stats.resolvedFromLookup = resolvedFromLookupContainers.size;
      stats.notFound = countNotFoundRows(rowsToProcess, workingState, {
        force,
        matchedContainers: matchedLookupContainers,
      });

      return {
        canceled: false,
        updateId: session.updateId,
        dbPath: resolvedDbPath,
        state: normalizeState({
          ...workingState,
          dbPath: resolvedDbPath,
        }),
        stats,
      };
    } catch (error) {
      if (error?.code === "UPDATE_CANCELED" || error?.name === "AbortError") {
        stats.resolvedFromDb = resolvedFromDbContainers.size;
        stats.resolvedFromLookup = resolvedFromLookupContainers.size;
        stats.notFound = countNotFoundRows(
          buildRowsToProcess(
            filterRowsByTargetIds(flattenProjectRows(normalizeState(currentState)), targetRowIds),
            force
          ),
          workingState,
          {
            force,
            matchedContainers: matchedLookupContainers,
          }
        );

        publishStatus({
          updateId: session.updateId,
          stage: "canceled",
          progress: stats.updatedT1 || stats.updatedStatus || stats.updatedStop ? 100 : 0,
          message: "Aktualizacja zostala anulowana.",
        });

        return {
          canceled: true,
          updateId: session.updateId,
          dbPath: resolvedDbPath,
          state: normalizeState({
            ...workingState,
            dbPath: resolvedDbPath,
          }),
          stats,
        };
      }

      publishFailure(session.updateId, error, {
        progress: clampProgress(stats.updatedT1 || stats.updatedStatus || stats.updatedStop ? 100 : 0),
      });
      throw error;
    } finally {
      activeUpdates.delete(session.updateId);
    }
  }

  async function cancelProjectUpdate(updateId) {
    const normalizedId = asText(updateId);
    const session = activeUpdates.get(normalizedId);
    if (!session) {
      return {
        canceled: false,
        updateId: normalizedId,
      };
    }

    session.canceled = true;
    session.abortController.abort(createCanceledError());
    return {
      canceled: true,
      updateId: normalizedId,
    };
  }

  return {
    cancelProjectUpdate,
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

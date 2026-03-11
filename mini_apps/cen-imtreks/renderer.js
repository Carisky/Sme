import {
  DEFAULT_SHEET_NAME,
  asText,
  basename,
  buildProjectNameKey,
  createEmptyState,
  createLookupRecord,
  createRow,
  deriveProjectName,
  flattenRows,
  getActiveSheet,
  normalizeContainerNumber,
  normalizeLookupRecord,
  normalizeProjectOption,
  normalizeRow,
  normalizeSheet,
  normalizeState,
} from "./renderer-model.js";
import {
  renderAll,
  renderProjectIndicator,
  renderLookupRows,
  renderMonthTabs,
  renderRecordDraft,
  renderRows,
  renderSummary,
} from "./renderer-view.js";

const bridge = window.bridge;
const MODULE_STORAGE_KEY = "cen-imtreks.settings";
const AUTOSAVE_DELAY_MS = 450;

const elements = {
  projectIndicator: document.getElementById("project-indicator"),
  projectName: document.getElementById("project-name"),
  projectNameOptions: document.getElementById("project-name-options"),
  statusText: document.getElementById("status-text"),
  inlineUpdateStatus: document.getElementById("inline-update-status"),
  inlineUpdateText: document.getElementById("inline-update-text"),
  inlineUpdateFill: document.getElementById("inline-update-fill"),
  inlineUpdateValue: document.getElementById("inline-update-value"),
  monthTabs: document.getElementById("month-tabs"),
  activeMonthLabel: document.getElementById("active-month-label"),
  projectRows: document.getElementById("project-rows"),
  projectSearch: document.getElementById("project-search"),
  forceUpdate: document.getElementById("force-update"),
  lookupRows: document.getElementById("lookup-rows"),
  dbPath: document.getElementById("db-path"),
  lookupSearch: document.getElementById("lookup-search"),
  recordContainer: document.getElementById("record-container"),
  recordCen: document.getElementById("record-cen"),
  recordTState: document.getElementById("record-t-state"),
  recordStop: document.getElementById("record-stop"),
  summaryProjectTitle: document.getElementById("summary-project-title"),
  summaryProjectSync: document.getElementById("summary-project-sync"),
  summarySourceFile: document.getElementById("summary-source-file"),
  summaryActiveMonth: document.getElementById("summary-active-month"),
  summaryMonthCount: document.getElementById("summary-month-count"),
  summaryRowCount: document.getElementById("summary-row-count"),
  summaryFilledCount: document.getElementById("summary-filled-count"),
  summaryPendingCount: document.getElementById("summary-pending-count"),
  summaryManualCount: document.getElementById("summary-manual-count"),
  summaryDbPath: document.getElementById("summary-db-path"),
  summaryDbStatus: document.getElementById("summary-db-status"),
};

const stateRef = {
  currentProjectId: null,
  currentProjectSummary: null,
  projectNameDraft: "",
  dirty: false,
  activeTab: "dane",
  state: createEmptyState(),
  lookupRecords: [],
  projectOptions: [],
  recordDraft: createLookupRecord(),
  autosaveTimer: null,
  autosavePromise: null,
  changeToken: 0,
  busyAction: "",
  busyMessage: "",
  busyProgress: 0,
  projectSearchTerm: "",
  forceUpdateEnabled: false,
  updateSession: null,
  pendingProjectRender: 0,
};

const UPDATE_BUTTON_LABEL = "Zaktualizuj";
const CANCEL_UPDATE_BUTTON_LABEL = "Anuluj aktualizacje";

function getActiveProjectTitle() {
  const currentName = asText(stateRef.state.projectName);
  if (currentName) {
    return currentName;
  }

  if (!stateRef.currentProjectId && stateRef.projectNameDraft) {
    return stateRef.projectNameDraft;
  }

  return deriveProjectName(stateRef.state);
}

function setStatus(message) {
  elements.statusText.textContent = message;
}

function getUpdateButton() {
  return document.querySelector('[data-action="update"]');
}

function createUpdateRequestId() {
  return `cen-imtreks-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatUpdateSummary(result = {}) {
  const stats = result.stats || {};
  const lookupErrors =
    Array.isArray(stats.lookupErrors) && stats.lookupErrors.length > 0
      ? ` Bledy lookup: ${stats.lookupErrors.join(" | ")}`
      : "";
  const skippedInfo = stats.skippedTerminalRows
    ? `, pominiete terminale: ${stats.skippedTerminalRows}`
    : "";
  const canceledPrefix = result.canceled ? "Aktualizacja przerwana. " : "";
  return (
    `${canceledPrefix}Uzupelniono T1: ${stats.updatedT1 || 0}, Status: ${stats.updatedStatus || 0}, Stop: ${
      stats.updatedStop || 0
    }, bez wyniku: ${stats.notFound || 0}${skippedInfo}.${lookupErrors}`
  );
}

function renderProjectData() {
  renderProjectIndicator(elements, stateRef, bridge, getActiveProjectTitle);
  renderSummary(elements, stateRef, getActiveProjectTitle);
  renderRows(elements, stateRef);
  elements.projectSearch.value = stateRef.projectSearchTerm;
  elements.forceUpdate.checked = stateRef.forceUpdateEnabled;
  applyBusyState();
}

function queueProjectDataRender() {
  if (stateRef.pendingProjectRender) {
    return;
  }

  stateRef.pendingProjectRender = window.requestAnimationFrame(() => {
    stateRef.pendingProjectRender = 0;
    renderProjectData();
  });
}

function applyProjectRowPatches(changes = []) {
  if (!Array.isArray(changes) || changes.length === 0) {
    return;
  }

  const rowMap = new Map(
    changes
      .filter((entry) => entry?.row?.id)
      .map((entry) => [entry.row.id, normalizeRow(entry.row)])
  );
  if (rowMap.size === 0) {
    return;
  }

  stateRef.state.sheets = stateRef.state.sheets.map((sheet) =>
    normalizeSheet({
      ...sheet,
      rows: sheet.rows.map((row) => rowMap.get(row.id) || row),
    })
  );
  stateRef.dirty = true;
  queueProjectDataRender();
}

function applyBusyState() {
  const isBusy = Boolean(stateRef.busyAction);
  const normalizedProgress = Math.max(0, Math.min(Number(stateRef.busyProgress) || 0, 100));

  document.body.classList.toggle("is-busy", isBusy);
  document.querySelectorAll("button, input").forEach((node) => {
    node.disabled = isBusy ? node.dataset.busyAllow !== "true" : false;
  });

  const updateButton = getUpdateButton();
  if (updateButton) {
    updateButton.textContent =
      isBusy && stateRef.busyAction === "update"
        ? CANCEL_UPDATE_BUTTON_LABEL
        : UPDATE_BUTTON_LABEL;
  }

  elements.inlineUpdateStatus.hidden = !isBusy;

  if (isBusy) {
    elements.inlineUpdateText.textContent = stateRef.busyMessage || "Trwa operacja.";
    elements.inlineUpdateFill.style.width = `${Math.max(6, normalizedProgress)}%`;
    elements.inlineUpdateValue.textContent = `${normalizedProgress}%`;
    return;
  }

  elements.inlineUpdateFill.style.width = "0%";
  elements.inlineUpdateValue.textContent = "";
}

function setBusyState({ action, message, progress } = {}) {
  const nextAction = action !== undefined ? action || "" : stateRef.busyAction;
  if (action !== undefined) {
    stateRef.busyAction = nextAction;
  }
  if (message !== undefined) {
    stateRef.busyMessage = asText(message);
  }
  if (progress !== undefined) {
    const nextProgress = Math.max(0, Math.min(Number(progress) || 0, 100));
    stateRef.busyProgress =
      stateRef.busyAction && nextAction === stateRef.busyAction
        ? Math.max(stateRef.busyProgress, nextProgress)
        : nextProgress;
  }
  applyBusyState();
}

function clearBusyState() {
  stateRef.busyAction = "";
  stateRef.busyMessage = "";
  stateRef.busyProgress = 0;
  applyBusyState();
}

function flushUi() {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

function resetUpdateSession() {
  stateRef.updateSession = null;
}

async function finalizeCanceledUpdate(result) {
  const session = stateRef.updateSession;
  resetUpdateSession();
  clearBusyState();

  const keepPartial = window.confirm(
    "Aktualizacja zostala anulowana. Zachowac czesciowo uzupelnione dane w widoku?"
  );

  if (!keepPartial && session?.baseState) {
    setState(session.baseState, {
      currentProject: stateRef.currentProjectSummary,
      projectNameDraft: session.projectNameDraft,
      dirty: session.baseDirty,
    });
    setStatus("Aktualizacja anulowana. Czesciowe zmiany odrzucono.");
    return result;
  }

  stateRef.dirty = true;
  renderAllApp();
  setStatus(
    "Aktualizacja anulowana. Czesciowe zmiany pozostaly w widoku i czekaja na zapis."
  );
  return result;
}

async function finalizeFailedUpdate(error) {
  const session = stateRef.updateSession;
  resetUpdateSession();
  clearBusyState();

  const keepPartial = window.confirm(
    `Aktualizacja nieudana: ${error.message}\n\nZachowac czesciowo uzupelnione dane w widoku?`
  );

  if (!keepPartial && session?.baseState) {
    setState(session.baseState, {
      currentProject: stateRef.currentProjectSummary,
      projectNameDraft: session.projectNameDraft,
      dirty: session.baseDirty,
    });
    return false;
  }

  stateRef.dirty = true;
  renderAllApp();
  return true;
}

function renderAllApp() {
  renderAll(elements, stateRef, bridge, getActiveProjectTitle);
  elements.projectSearch.value = stateRef.projectSearchTerm;
  elements.forceUpdate.checked = stateRef.forceUpdateEnabled;
  applyBusyState();
}

function markDirty(value = true) {
  stateRef.dirty = Boolean(value);
  renderSummary(elements, stateRef, getActiveProjectTitle);
  renderAll(elements, stateRef, bridge, getActiveProjectTitle);
}

function setCurrentProject(project) {
  if (!project) {
    stateRef.currentProjectId = null;
    stateRef.currentProjectSummary = null;
    return;
  }

  stateRef.currentProjectSummary = normalizeProjectOption(project);
  stateRef.currentProjectId = stateRef.currentProjectSummary.id || null;
}

function clearCurrentProject() {
  setCurrentProject(null);
}

function setState(nextState, options = {}) {
  stateRef.state = normalizeState(nextState);
  if (options.currentProject !== undefined) {
    setCurrentProject(options.currentProject);
  }
  if (options.projectNameDraft !== undefined) {
    stateRef.projectNameDraft = asText(options.projectNameDraft);
  } else if (!stateRef.projectNameDraft) {
    stateRef.projectNameDraft = getActiveProjectTitle();
  }
  if (options.dirty !== undefined) {
    stateRef.dirty = Boolean(options.dirty);
  }
  renderAllApp();
}

function hasProjectContent(state = stateRef.state) {
  const normalized = normalizeState(state);
  return Boolean(
    normalized.sheets.length ||
      normalized.sourceFileName ||
      normalized.sourceFilePath ||
      normalized.fileName ||
      normalized.projectName ||
      asText(stateRef.projectNameDraft)
  );
}

function upsertProjectOption(project) {
  const normalized = normalizeProjectOption(project);
  if (!normalized.projectName) {
    return;
  }

  stateRef.projectOptions = [normalized, ...stateRef.projectOptions]
    .filter((entry, index, source) => {
      if (!entry.projectName) {
        return false;
      }

      return (
        index ===
        source.findIndex((candidate) => {
          if (normalized.id > 0 && candidate.id > 0) {
            return candidate.id === entry.id;
          }

          return buildProjectNameKey(candidate.projectName) === buildProjectNameKey(entry.projectName);
        })
      );
    })
    .sort((left, right) =>
      String(right.updatedAt || right.createdAt || "").localeCompare(
        String(left.updatedAt || left.createdAt || "")
      )
    )
    .slice(0, 30);
}

function getRequestedProjectName({ allowDraftForExisting = false } = {}) {
  const draft = asText(stateRef.projectNameDraft);
  const currentName = asText(stateRef.state.projectName);
  if (!stateRef.currentProjectId || allowDraftForExisting) {
    return draft || currentName || deriveProjectName(stateRef.state);
  }

  return currentName || draft || deriveProjectName(stateRef.state);
}

function cancelScheduledAutosave() {
  if (stateRef.autosaveTimer) {
    window.clearTimeout(stateRef.autosaveTimer);
    stateRef.autosaveTimer = null;
  }
}

function scheduleProjectSave(delay = AUTOSAVE_DELAY_MS) {
  if (!hasProjectContent()) {
    return;
  }

  cancelScheduledAutosave();
  stateRef.autosaveTimer = window.setTimeout(() => {
    stateRef.autosaveTimer = null;
    persistCurrentProject({ silent: true }).catch((error) => {
      console.error(error);
      setStatus(`Autozapis nieudany: ${error.message}`);
    });
  }, delay);
}

function registerProjectMutation({ rerender = "summary", autosave = true } = {}) {
  stateRef.changeToken += 1;
  stateRef.dirty = true;

  if (rerender === "all") {
    renderAllApp();
  } else {
    renderProjectIndicator(elements, stateRef, bridge, getActiveProjectTitle);
    renderSummary(elements, stateRef, getActiveProjectTitle);
    applyBusyState();
  }

  if (autosave) {
    scheduleProjectSave();
  }
}

async function persistSettings() {
  await bridge.saveModuleStorage(MODULE_STORAGE_KEY, {
    dbPath: stateRef.state.dbPath,
  });
}

async function ensureDbPath() {
  if (stateRef.state.dbPath) {
    return stateRef.state.dbPath;
  }

  const fallback = await bridge.getDefaultCenImtreksDatabasePath();
  stateRef.state.dbPath = asText(fallback?.filePath);
  await persistSettings();
  renderSummary(elements, stateRef, getActiveProjectTitle);
  return stateRef.state.dbPath;
}

async function refreshLookupRecords() {
  const dbPath = await ensureDbPath();
  const result = await bridge.listCenImtreksLookupRecords(dbPath, {
    search: elements.lookupSearch.value,
    limit: 200,
  });
  stateRef.state.dbPath = asText(result.dbPath) || dbPath;
  stateRef.lookupRecords = Array.isArray(result.records)
    ? result.records.map(normalizeLookupRecord)
    : [];
  renderSummary(elements, stateRef, getActiveProjectTitle);
  renderLookupRows(elements, stateRef);
}

async function refreshProjectOptions(search = stateRef.projectNameDraft) {
  const dbPath = await ensureDbPath();
  const result = await bridge.listCenImtreksProjects(dbPath, {
    search,
    limit: 30,
  });
  stateRef.state.dbPath = asText(result.dbPath) || dbPath;
  stateRef.projectOptions = Array.isArray(result.projects)
    ? result.projects.map(normalizeProjectOption)
    : [];
  renderAllApp();
}

async function persistCurrentProject(options = {}) {
  cancelScheduledAutosave();
  if (stateRef.autosavePromise) {
    await stateRef.autosavePromise;
  }

  if (!options.force && !options.createOnly && !stateRef.dirty) {
    return null;
  }

  const dbPath = await ensureDbPath();
  const requestedProjectName = asText(
    options.projectName ||
      getRequestedProjectName({
        allowDraftForExisting: Boolean(options.allowDraftForExisting),
      })
  );
  const snapshot = normalizeState({
    ...stateRef.state,
    projectName: requestedProjectName,
    dbPath,
  });

  if (!hasProjectContent(snapshot)) {
    stateRef.dirty = false;
    renderAllApp();
    return null;
  }

  const changeToken = stateRef.changeToken;
  const savePromise = options.createOnly
    ? bridge.saveCenImtreksProjectAs(dbPath, snapshot, {
        projectName: requestedProjectName,
      })
    : bridge.saveCenImtreksProject(dbPath, snapshot, {
        projectId: stateRef.currentProjectId,
        projectName: requestedProjectName,
      });

  stateRef.autosavePromise = savePromise;

  try {
    const result = await savePromise;
    const normalizedResultState = normalizeState(result.state || snapshot);
    stateRef.state = normalizeState({
      ...stateRef.state,
      ...normalizedResultState,
      dbPath: asText(result.dbPath) || dbPath,
    });
    setCurrentProject(result.project || null);
    stateRef.projectNameDraft = asText(normalizedResultState.projectName) || requestedProjectName;
    upsertProjectOption(result.project || {});

    if (changeToken === stateRef.changeToken) {
      stateRef.dirty = false;
    } else {
      stateRef.dirty = true;
      scheduleProjectSave(200);
    }

    renderAllApp();
    if (!options.silent) {
      setStatus(options.statusMessage || `Zapisano projekt ${stateRef.projectNameDraft}.`);
    }

    return result;
  } finally {
    if (stateRef.autosavePromise === savePromise) {
      stateRef.autosavePromise = null;
    }
  }
}

async function flushAutosave(options = {}) {
  cancelScheduledAutosave();

  if (stateRef.autosavePromise) {
    await stateRef.autosavePromise;
  }

  if (!stateRef.dirty) {
    return null;
  }

  return persistCurrentProject({
    ...options,
    force: true,
  });
}

async function chooseDbPath() {
  await flushAutosave({ silent: true });

  const currentPath = stateRef.state.dbPath || (await ensureDbPath());
  const result = await bridge.chooseCenImtreksDatabasePath(currentPath);
  if (result.canceled) {
    return null;
  }

  stateRef.state.dbPath = asText(result.filePath);
  clearCurrentProject();
  await persistSettings();
  stateRef.dirty = hasProjectContent();
  renderAllApp();
  await Promise.all([refreshLookupRecords(), refreshProjectOptions()]);
  if (hasProjectContent()) {
    await persistCurrentProject({ silent: true });
  }
  setStatus(`Wybrano baze ${basename(result.filePath)}.`);
  return result.filePath;
}

async function saveLookupRecord() {
  const dbPath = await ensureDbPath();
  const record = normalizeLookupRecord({
    containerNumber: elements.recordContainer.value,
    cen: elements.recordCen.value,
    tState: elements.recordTState.value,
    stop: elements.recordStop.value,
    source: "manual",
  });

  if (!record.containerNumber) {
    window.alert("Container Number jest wymagany.");
    return null;
  }

  const result = await bridge.saveCenImtreksLookupRecord(dbPath, record);
  stateRef.state.dbPath = asText(result.dbPath) || dbPath;
  stateRef.recordDraft = normalizeLookupRecord(result.record);

  stateRef.state.sheets = stateRef.state.sheets.map((sheet) =>
    normalizeSheet({
      ...sheet,
      rows: sheet.rows.map((row) =>
        row.containerNumber === stateRef.recordDraft.containerNumber
          ? normalizeRow({
              ...row,
              t1: row.t1 || stateRef.recordDraft.cen,
              status: row.status || stateRef.recordDraft.tState,
              stop: row.stop || stateRef.recordDraft.stop,
            })
          : row
      ),
    })
  );

  await persistSettings();
  registerProjectMutation({ rerender: "all", autosave: false });
  await Promise.all([refreshLookupRecords(), persistCurrentProject({ silent: true })]);
  setStatus(`Zapisano rekord ${stateRef.recordDraft.containerNumber}.`);
  return result;
}

function resetRecordDraft() {
  stateRef.recordDraft = createLookupRecord();
  renderRecordDraft(elements, stateRef);
}

async function createNewProject() {
  await flushAutosave({ silent: true });

  const settings = (await bridge.loadModuleStorage(MODULE_STORAGE_KEY)) || {};
  const fallback = await bridge.getDefaultCenImtreksDatabasePath();
  clearCurrentProject();
  setState(
    createEmptyState({
      dbPath: asText(settings.dbPath) || asText(fallback.filePath),
    }),
    {
      currentProject: null,
      projectNameDraft: "",
      dirty: false,
    }
  );
  resetRecordDraft();
  await Promise.all([refreshLookupRecords(), refreshProjectOptions("")]);
  setStatus("Utworzono nowy projekt CEN IMTREKS.");
  return true;
}

async function openProject() {
  await flushAutosave({ silent: true });

  const dbPath = await ensureDbPath();
  const selectedProjectName = asText(stateRef.projectNameDraft);
  if (!selectedProjectName) {
    await refreshProjectOptions("");
    window.alert("Wpisz lub wybierz nazwe projektu.");
    return null;
  }

  const result = await bridge.openCenImtreksProject(dbPath, {
    projectName: selectedProjectName,
  });

  setState(result.state, {
    currentProject: result.project,
    projectNameDraft: result.project?.projectName || selectedProjectName,
    dirty: false,
  });
  await persistSettings();
  await Promise.all([refreshLookupRecords(), refreshProjectOptions(result.project?.projectName)]);
  setStatus(`Otworzono projekt ${result.project?.projectName || selectedProjectName}.`);
  return result;
}

async function importWorkbook() {
  const result = await bridge.importCenImtreksWorkbook(stateRef.state);
  if (result.canceled) {
    return null;
  }

  const nextState = normalizeState({
    ...result.state,
    projectName: stateRef.state.projectName,
    dbPath: stateRef.state.dbPath || result.state.dbPath,
  });
  const nextDraft =
    stateRef.currentProjectId && stateRef.state.projectName
      ? stateRef.projectNameDraft
      : asText(stateRef.projectNameDraft) || deriveProjectName(nextState);

  setState(nextState, {
    currentProject: stateRef.currentProjectSummary,
    projectNameDraft: nextDraft,
    dirty: true,
  });
  await persistSettings();
  await refreshProjectOptions(nextDraft);
  await persistCurrentProject({ silent: true });
  setStatus(`Zaimportowano dane z ${basename(result.filePath)}.`);
  return result;
}

async function startProjectUpdate() {
  await flushAutosave({ silent: true });
  const dbPath = await ensureDbPath();
  const updateId = createUpdateRequestId();
  stateRef.updateSession = {
    id: updateId,
    baseState: normalizeState(stateRef.state),
    baseDirty: stateRef.dirty,
    projectNameDraft: stateRef.projectNameDraft,
    force: Boolean(stateRef.forceUpdateEnabled),
  };

  setBusyState({
    action: "update",
    message: stateRef.forceUpdateEnabled
      ? "Force update: przygotowanie aktualizacji projektu."
      : "Przygotowanie aktualizacji projektu.",
    progress: 4,
  });
  await flushUi();

  try {
    const result = await bridge.updateCenImtreksProject(stateRef.state, dbPath, {
      requestId: updateId,
      force: stateRef.forceUpdateEnabled,
    });

    if (result.canceled) {
      return finalizeCanceledUpdate(result);
    }

    setBusyState({
      action: "update",
      message: "Odswiezanie widoku i zapisywanie projektu.",
      progress: 96,
    });
    setState(result.state, {
      currentProject: stateRef.currentProjectSummary,
      projectNameDraft: stateRef.projectNameDraft || deriveProjectName(result.state),
      dirty: true,
    });
    await persistSettings();
    await Promise.all([refreshLookupRecords(), persistCurrentProject({ silent: true })]);
    resetUpdateSession();
    clearBusyState();
    setStatus(formatUpdateSummary(result));
    return result;
  } catch (error) {
    const keptPartial = await finalizeFailedUpdate(error);
    setStatus(
      keptPartial
        ? `Aktualizacja nieudana. Czesciowe zmiany pozostaly w widoku. ${error.message}`
        : error.message
    );
    throw error;
  }
}

async function cancelProjectUpdate() {
  if (!stateRef.updateSession?.id) {
    return null;
  }

  setBusyState({
    action: "update",
    message: "Anulowanie aktualizacji...",
    progress: stateRef.busyProgress,
  });
  return bridge.cancelCenImtreksProjectUpdate(stateRef.updateSession.id);
}

async function updateProject() {
  if (stateRef.updateSession?.id) {
    return cancelProjectUpdate();
  }

  return startProjectUpdate();
}

async function saveProject() {
  const result = await persistCurrentProject({
    allowDraftForExisting: true,
    force: true,
    statusMessage: `Zapisano projekt ${stateRef.projectNameDraft || getActiveProjectTitle()}.`,
  });
  await refreshProjectOptions(stateRef.projectNameDraft);
  return result;
}

async function saveProjectAs() {
  const proposedName = window.prompt(
    "Nowa nazwa projektu:",
    stateRef.projectNameDraft || getActiveProjectTitle()
  );
  if (proposedName === null) {
    return null;
  }

  const requestedName = asText(proposedName);
  if (!requestedName) {
    window.alert("Nazwa projektu jest wymagana.");
    return null;
  }

  const result = await persistCurrentProject({
    createOnly: true,
    force: true,
    projectName: requestedName,
    allowDraftForExisting: true,
    statusMessage: `Zapisano projekt jako ${requestedName}.`,
  });
  await refreshProjectOptions(requestedName);
  return result;
}

function switchMonth(sheetId) {
  stateRef.state.activeSheetId = asText(sheetId);
  renderMonthTabs(elements, stateRef);
  renderRows(elements, stateRef);
  renderSummary(elements, stateRef, getActiveProjectTitle);
}

function updateRow(rowId, field, value) {
  stateRef.state.sheets = stateRef.state.sheets.map((sheet) =>
    normalizeSheet({
      ...sheet,
      rows: sheet.rows.map((row) =>
        row.id === rowId
          ? normalizeRow({
              ...row,
              [field]: field === "containerNumber" ? normalizeContainerNumber(value) : value,
            })
          : row
      ),
    })
  );
  registerProjectMutation({ rerender: "summary" });
}

function ensureDefaultSheet() {
  if (stateRef.state.sheets.length > 0) {
    return getActiveSheet(stateRef.state);
  }

  const sheet = normalizeSheet({
    name: DEFAULT_SHEET_NAME,
  });
  stateRef.state.sheets = [sheet];
  stateRef.state.activeSheetId = sheet.id;
  return sheet;
}

function addRow() {
  const activeSheet = ensureDefaultSheet();
  stateRef.state.sheets = stateRef.state.sheets.map((sheet) =>
    sheet.id === activeSheet.id
      ? normalizeSheet({
          ...sheet,
          rows: [...sheet.rows, createRow()],
        })
      : sheet
  );
  stateRef.state.activeSheetId = activeSheet.id;
  registerProjectMutation({ rerender: "all" });
}

function deleteRow(rowId) {
  stateRef.state.sheets = stateRef.state.sheets.map((sheet) =>
    normalizeSheet({
      ...sheet,
      rows: sheet.rows.filter((row) => row.id !== rowId),
    })
  );
  registerProjectMutation({ rerender: "all" });
}

async function handleHome() {
  await flushAutosave({ silent: true });
  return bridge.openHome();
}

function handleAction(action, payload = {}) {
  switch (action) {
    case "home":
      return handleHome();
    case "new":
      return createNewProject();
    case "open":
      return openProject();
    case "import":
      return importWorkbook();
    case "update":
      return updateProject();
    case "save":
      return saveProject();
    case "saveAs":
      return saveProjectAs();
    case "add-row":
      return addRow();
    case "delete-row":
      return deleteRow(payload.rowId);
    case "choose-db":
      return chooseDbPath();
    case "lookup-refresh":
      return refreshLookupRecords();
    case "record-new":
      return resetRecordDraft();
    case "record-save":
      return saveLookupRecord();
    default:
      return null;
  }
}

document.addEventListener("click", async (event) => {
  const actionNode = event.target.closest("[data-action]");
  if (actionNode) {
    if (stateRef.busyAction && actionNode.dataset.action !== "update") {
      return;
    }

    try {
      await handleAction(actionNode.dataset.action, {
        rowId: actionNode.dataset.rowId,
      });
    } catch (error) {
      console.error(error);
      window.alert(error.message);
      setStatus(error.message);
    }
    return;
  }

  const tabNode = event.target.closest("[data-tab]");
  if (tabNode) {
    if (stateRef.busyAction) {
      return;
    }

    stateRef.activeTab = tabNode.dataset.tab;
    document.querySelectorAll(".tab").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.tab === stateRef.activeTab);
    });
    document.querySelectorAll("[data-panel]").forEach((panel) => {
      panel.classList.toggle("is-active", panel.dataset.panel === stateRef.activeTab);
    });
    return;
  }

  const monthNode = event.target.closest("[data-month-id]");
  if (monthNode) {
    switchMonth(monthNode.dataset.monthId);
    return;
  }

  const recordRow = event.target.closest("[data-record-container]");
  if (!recordRow) {
    return;
  }

  const selected = stateRef.lookupRecords.find(
    (record) => record.containerNumber === recordRow.dataset.recordContainer
  );
  if (selected) {
    stateRef.recordDraft = normalizeLookupRecord(selected);
    renderRecordDraft(elements, stateRef);
    setStatus(`Wybrano rekord ${selected.containerNumber}.`);
  }
});

elements.projectRows.addEventListener("input", (event) => {
  if (stateRef.busyAction) {
    return;
  }

  const rowNode = event.target.closest("[data-row-id]");
  if (!rowNode || !event.target.dataset.field) {
    return;
  }

  if (event.target.dataset.field === "containerNumber") {
    event.target.value = normalizeContainerNumber(event.target.value);
  }

  updateRow(rowNode.dataset.rowId, event.target.dataset.field, event.target.value);
});

elements.projectSearch.addEventListener("input", (event) => {
  stateRef.projectSearchTerm = asText(event.target.value);
  renderRows(elements, stateRef);
  applyBusyState();
});

elements.forceUpdate.addEventListener("change", (event) => {
  if (stateRef.busyAction) {
    return;
  }

  stateRef.forceUpdateEnabled = Boolean(event.target.checked);
});

elements.projectName.addEventListener("input", async (event) => {
  if (stateRef.busyAction) {
    return;
  }

  stateRef.projectNameDraft = asText(event.target.value);
  renderSummary(elements, stateRef, getActiveProjectTitle);
  applyBusyState();

  try {
    await refreshProjectOptions(stateRef.projectNameDraft);
  } catch (error) {
    console.error(error);
    setStatus(error.message);
  }
});

elements.projectName.addEventListener("change", () => {
  if (stateRef.busyAction) {
    return;
  }

  stateRef.projectNameDraft = asText(elements.projectName.value);
  renderSummary(elements, stateRef, getActiveProjectTitle);
  applyBusyState();
});

elements.dbPath.addEventListener("change", async (event) => {
  if (stateRef.busyAction) {
    return;
  }

  stateRef.state.dbPath = asText(event.target.value);
  clearCurrentProject();
  await persistSettings();
  stateRef.dirty = hasProjectContent();
  renderAllApp();
  await Promise.all([refreshLookupRecords(), refreshProjectOptions()]);
  if (hasProjectContent()) {
    await persistCurrentProject({ silent: true });
  }
});

elements.lookupSearch.addEventListener("change", async () => {
  if (stateRef.busyAction) {
    return;
  }

  try {
    await refreshLookupRecords();
  } catch (error) {
    console.error(error);
    window.alert(error.message);
    setStatus(error.message);
  }
});

window.addEventListener("keydown", async (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    if (stateRef.busyAction) {
      return;
    }

    event.preventDefault();
    try {
      await saveProject();
    } catch (error) {
      console.error(error);
      window.alert(error.message);
      setStatus(error.message);
    }
  }
});

async function bootstrap() {
  bridge.setWindowTitle("CEN IMTREKS");
  if (typeof bridge.onCenImtreksStatus === "function") {
    bridge.onCenImtreksStatus((payload) => {
      if (!payload || payload.action !== "update") {
        return;
      }

      if (!stateRef.updateSession?.id || payload.updateId !== stateRef.updateSession.id) {
        return;
      }

      if (payload.type === "patch") {
        applyProjectRowPatches(payload.changes);
        return;
      }

      if (payload.type === "failed") {
        setStatus(payload.message || "Aktualizacja nieudana.");
        return;
      }

      setBusyState({
        action: "update",
        message: payload.message || stateRef.busyMessage,
        progress: payload.progress,
      });
    });
  }
  const settings = (await bridge.loadModuleStorage(MODULE_STORAGE_KEY)) || {};
  const defaultDb = await bridge.getDefaultCenImtreksDatabasePath();
  setState(
    createEmptyState({
      dbPath: asText(settings.dbPath) || asText(defaultDb?.filePath),
    }),
    {
      currentProject: null,
      projectNameDraft: "",
      dirty: false,
    }
  );
  await Promise.all([refreshLookupRecords(), refreshProjectOptions("")]);
  setStatus("CEN IMTREKS jest gotowy.");
}

bootstrap().catch((error) => {
  console.error(error);
  window.alert(error.message);
  setStatus(error.message);
});

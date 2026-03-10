const bridge = window.bridge;
const MODULE_STORAGE_KEY = "wct-cen.settings";
const AUTOSAVE_DELAY_MS = 450;

const elements = {
  projectIndicator: document.getElementById("project-indicator"),
  projectName: document.getElementById("project-name"),
  projectNameOptions: document.getElementById("project-name-options"),
  statusText: document.getElementById("status-text"),
  projectRows: document.getElementById("project-rows"),
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
  summaryRowCount: document.getElementById("summary-row-count"),
  summaryCenCount: document.getElementById("summary-cen-count"),
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
};

function asText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function normalizeContainerNumber(value) {
  return asText(value).replace(/[\s\u00a0]+/g, "").toUpperCase();
}

function buildProjectNameKey(value) {
  return asText(value)
    .toLocaleLowerCase("pl")
    .replace(/\s+/g, " ")
    .trim();
}

function createRow(overrides = {}) {
  return {
    id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    origin: "manual",
    sourceRowNumber: "",
    containerNumber: "",
    cen: "",
    tState: "",
    stop: "",
    t1: "",
    transportDocument: "",
    carrier: "",
    status: "",
    invoiceInfo: "",
    ...overrides,
  };
}

function normalizeRow(row = {}) {
  const id = asText(row.id) || createRow().id;
  return {
    ...createRow(row),
    id,
    origin: asText(row.origin) || "manual",
    sourceRowNumber: asText(row.sourceRowNumber),
    containerNumber: normalizeContainerNumber(row.containerNumber),
    cen: asText(row.cen),
    tState: asText(row.tState),
    stop: asText(row.stop),
    t1: asText(row.t1),
    transportDocument: asText(row.transportDocument),
    carrier: asText(row.carrier),
    status: asText(row.status),
    invoiceInfo: asText(row.invoiceInfo),
  };
}

function createEmptyState(overrides = {}) {
  return normalizeState({
    projectName: "",
    fileName: "",
    fileLocation: "",
    sourceFilePath: "",
    sourceFileName: "",
    dbPath: "",
    rows: [],
    ...overrides,
  });
}

function normalizeState(input = {}) {
  return {
    projectName: asText(input.projectName),
    fileName: asText(input.fileName),
    fileLocation: asText(input.fileLocation),
    sourceFilePath: asText(input.sourceFilePath),
    sourceFileName: asText(input.sourceFileName),
    dbPath: asText(input.dbPath),
    rows: Array.isArray(input.rows) ? input.rows.map(normalizeRow) : [],
  };
}

function createLookupRecord(overrides = {}) {
  return {
    containerNumber: "",
    cen: "",
    tState: "",
    stop: "",
    source: "manual",
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

function normalizeLookupRecord(record = {}) {
  return {
    ...createLookupRecord(record),
    containerNumber: normalizeContainerNumber(record.containerNumber),
    cen: asText(record.cen),
    tState: asText(record.tState),
    stop: asText(record.stop),
    source: asText(record.source) || "manual",
    createdAt: asText(record.createdAt),
    updatedAt: asText(record.updatedAt),
  };
}

function normalizeProjectOption(project = {}) {
  return {
    id: Number(project.id) || 0,
    projectName: asText(project.projectName),
    sourceFileName: asText(project.sourceFileName),
    rowCount: Number(project.rowCount) || 0,
    createdAt: asText(project.createdAt),
    updatedAt: asText(project.updatedAt),
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function basename(filePath) {
  return asText(filePath).split(/[\\/]/).pop() || asText(filePath);
}

function stripExtension(fileName) {
  const name = basename(fileName);
  const lastDotIndex = name.lastIndexOf(".");
  if (lastDotIndex <= 0) {
    return name;
  }

  return name.slice(0, lastDotIndex);
}

function deriveProjectName(state = {}) {
  return (
    asText(state.projectName) ||
    asText(state.fileName) ||
    stripExtension(state.sourceFileName) ||
    "Nowy projekt"
  );
}

function getRequestedProjectName({ allowDraftForExisting = false } = {}) {
  const draft = asText(stateRef.projectNameDraft);
  const currentName = asText(stateRef.state.projectName);
  if (!stateRef.currentProjectId || allowDraftForExisting) {
    return draft || currentName || deriveProjectName(stateRef.state);
  }

  return currentName || draft || deriveProjectName(stateRef.state);
}

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

function hasProjectContent(state = stateRef.state) {
  const normalized = normalizeState(state);
  return Boolean(
    normalized.rows.length ||
      normalized.sourceFileName ||
      normalized.sourceFilePath ||
      normalized.fileName ||
      normalized.projectName ||
      asText(stateRef.projectNameDraft)
  );
}

function formatTimestamp(value) {
  const raw = asText(value);
  if (!raw) {
    return "-";
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return raw;
  }

  return new Intl.DateTimeFormat("pl-PL", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function setStatus(message) {
  elements.statusText.textContent = message;
}

function markDirty(value = true) {
  stateRef.dirty = Boolean(value);
  renderProjectIndicator();
  renderSummary();
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

function renderProjectIndicator() {
  const currentTitle = getActiveProjectTitle();
  const syncLabel = stateRef.currentProjectId ? "projekt w bazie" : "nowy projekt";
  const suffix = stateRef.dirty ? " * synchronizacja w toku" : "";
  elements.projectIndicator.textContent = `${currentTitle} - ${syncLabel}${suffix}`;
  bridge.setWindowTitle(`${currentTitle}${stateRef.dirty ? " *" : ""}`);
}

function renderProjectOptions() {
  elements.projectNameOptions.innerHTML = stateRef.projectOptions
    .map((project) => {
      const details = [
        project.rowCount ? `${project.rowCount} wierszy` : "0 wierszy",
        project.updatedAt ? formatTimestamp(project.updatedAt) : "",
      ]
        .filter(Boolean)
        .join(" | ");

      return `<option value="${escapeHtml(project.projectName)}" label="${escapeHtml(details)}"></option>`;
    })
    .join("");
}

function renderSummary() {
  const rows = stateRef.state.rows;
  const cenCount = rows.filter((row) => row.cen).length;
  const pendingCount = rows.filter((row) => row.containerNumber && !row.cen).length;
  const manualCount = rows.filter((row) => row.origin === "manual").length;

  elements.summaryProjectTitle.textContent = getActiveProjectTitle();
  elements.summaryProjectSync.textContent = stateRef.dirty
    ? "Oczekuje na zapis"
    : stateRef.currentProjectSummary?.updatedAt
      ? formatTimestamp(stateRef.currentProjectSummary.updatedAt)
      : "Nowy projekt";
  elements.summarySourceFile.textContent = stateRef.state.sourceFileName || "-";
  elements.summaryRowCount.textContent = String(rows.length);
  elements.summaryCenCount.textContent = String(cenCount);
  elements.summaryPendingCount.textContent = String(pendingCount);
  elements.summaryManualCount.textContent = String(manualCount);
  elements.summaryDbPath.textContent = stateRef.state.dbPath || "-";
  elements.summaryDbStatus.textContent = stateRef.state.dbPath ? "Aktywna" : "Domyslna";
  elements.dbPath.value = stateRef.state.dbPath;

  if (document.activeElement !== elements.projectName) {
    elements.projectName.value = stateRef.projectNameDraft;
  }
}

function renderRows() {
  if (stateRef.state.rows.length === 0) {
    elements.projectRows.innerHTML = `
      <tr>
        <td colspan="12">Brak wierszy. Zaimportuj FPL_63 PLAN.xlsx lub dodaj rekord recznie.</td>
      </tr>
    `;
    return;
  }

  elements.projectRows.innerHTML = stateRef.state.rows
    .map(
      (row, index) => `
        <tr data-row-id="${escapeHtml(row.id)}">
          <td class="row-index">${index + 1}</td>
          <td><input type="text" data-field="containerNumber" value="${escapeHtml(row.containerNumber)}" /></td>
          <td><input type="text" data-field="cen" value="${escapeHtml(row.cen)}" /></td>
          <td><input type="text" data-field="tState" value="${escapeHtml(row.tState)}" /></td>
          <td><input type="text" data-field="stop" value="${escapeHtml(row.stop)}" /></td>
          <td><input type="text" data-field="t1" value="${escapeHtml(row.t1)}" /></td>
          <td><input type="text" data-field="transportDocument" value="${escapeHtml(row.transportDocument)}" /></td>
          <td><input type="text" data-field="carrier" value="${escapeHtml(row.carrier)}" /></td>
          <td><input type="text" data-field="status" value="${escapeHtml(row.status)}" /></td>
          <td><input type="text" data-field="invoiceInfo" value="${escapeHtml(row.invoiceInfo)}" /></td>
          <td>${escapeHtml(row.sourceRowNumber || row.origin || "-")}</td>
          <td class="cell-actions">
            <button type="button" data-action="delete-row" data-row-id="${escapeHtml(row.id)}">Usun</button>
          </td>
        </tr>
      `
    )
    .join("");
}

function renderLookupRows() {
  if (!stateRef.lookupRecords.length) {
    elements.lookupRows.innerHTML = `
      <tr>
        <td colspan="6">Brak rekordow w bazie.</td>
      </tr>
    `;
    return;
  }

  elements.lookupRows.innerHTML = stateRef.lookupRecords
    .map(
      (record) => `
        <tr data-record-container="${escapeHtml(record.containerNumber)}">
          <td>${escapeHtml(record.containerNumber)}</td>
          <td>${escapeHtml(record.cen)}</td>
          <td>${escapeHtml(record.tState)}</td>
          <td>${escapeHtml(record.stop)}</td>
          <td>${escapeHtml(record.source)}</td>
          <td>${escapeHtml(record.updatedAt || record.createdAt || "-")}</td>
        </tr>
      `
    )
    .join("");
}

function renderRecordDraft() {
  elements.recordContainer.value = stateRef.recordDraft.containerNumber;
  elements.recordCen.value = stateRef.recordDraft.cen;
  elements.recordTState.value = stateRef.recordDraft.tState;
  elements.recordStop.value = stateRef.recordDraft.stop;
}

function renderAll() {
  renderProjectIndicator();
  renderProjectOptions();
  renderSummary();
  renderRows();
  renderLookupRows();
  renderRecordDraft();
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
  renderAll();
}

function upsertProjectOption(project) {
  const normalized = normalizeProjectOption(project);
  if (!normalized.projectName) {
    return;
  }

  const normalizedKey = buildProjectNameKey(normalized.projectName);
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

  if (normalizedKey && !stateRef.projectNameDraft) {
    stateRef.projectNameDraft = normalized.projectName;
  }
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

async function persistSettings() {
  await bridge.saveModuleStorage(MODULE_STORAGE_KEY, {
    dbPath: stateRef.state.dbPath,
  });
}

async function ensureDbPath() {
  if (stateRef.state.dbPath) {
    return stateRef.state.dbPath;
  }

  const fallback = await bridge.getDefaultWctCenDatabasePath();
  stateRef.state.dbPath = asText(fallback?.filePath);
  await persistSettings();
  renderSummary();
  return stateRef.state.dbPath;
}

async function refreshLookupRecords() {
  const dbPath = await ensureDbPath();
  const result = await bridge.listWctCenLookupRecords(dbPath, {
    search: elements.lookupSearch.value,
    limit: 200,
  });
  stateRef.state.dbPath = asText(result.dbPath) || dbPath;
  stateRef.lookupRecords = Array.isArray(result.records)
    ? result.records.map(normalizeLookupRecord)
    : [];
  renderSummary();
  renderLookupRows();
}

async function refreshProjectOptions(search = stateRef.projectNameDraft) {
  const dbPath = await ensureDbPath();
  const result = await bridge.listWctCenProjects(dbPath, {
    search,
    limit: 30,
  });
  stateRef.state.dbPath = asText(result.dbPath) || dbPath;
  stateRef.projectOptions = Array.isArray(result.projects)
    ? result.projects.map(normalizeProjectOption)
    : [];
  renderProjectOptions();
  renderSummary();
}

function registerProjectMutation({ rerender = "summary", autosave = true } = {}) {
  stateRef.changeToken += 1;
  markDirty(true);

  if (rerender === "all") {
    renderAll();
  } else if (rerender === "summary") {
    renderSummary();
  }

  if (autosave) {
    scheduleProjectSave();
  }
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
    markDirty(false);
    return null;
  }

  const changeToken = stateRef.changeToken;
  const savePromise = options.createOnly
    ? bridge.saveWctCenProjectAs(dbPath, snapshot, {
        projectName: requestedProjectName,
      })
    : bridge.saveWctCenProject(dbPath, snapshot, {
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
    renderProjectOptions();

    if (changeToken === stateRef.changeToken) {
      markDirty(false);
    } else {
      markDirty(true);
      scheduleProjectSave(200);
    }

    if (!options.silent) {
      setStatus(options.statusMessage || `Zapisano projekt ${stateRef.projectNameDraft}.`);
    }

    return result;
  } catch (error) {
    markDirty(true);
    throw error;
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
  const result = await bridge.chooseWctCenDatabasePath(currentPath);
  if (result.canceled) {
    return null;
  }

  stateRef.state.dbPath = asText(result.filePath);
  clearCurrentProject();
  await persistSettings();
  markDirty(hasProjectContent());
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

  const result = await bridge.saveWctCenLookupRecord(dbPath, record);
  stateRef.state.dbPath = asText(result.dbPath) || dbPath;
  stateRef.recordDraft = normalizeLookupRecord(result.record);

  stateRef.state.rows = stateRef.state.rows.map((row) =>
    row.containerNumber === stateRef.recordDraft.containerNumber
      ? normalizeRow({
          ...row,
          cen: row.cen || stateRef.recordDraft.cen,
          tState: row.tState || stateRef.recordDraft.tState,
          stop: row.stop || stateRef.recordDraft.stop,
        })
      : row
  );

  await persistSettings();
  registerProjectMutation({ rerender: "all", autosave: false });
  await Promise.all([refreshLookupRecords(), persistCurrentProject({ silent: true })]);
  setStatus(`Zapisano rekord ${stateRef.recordDraft.containerNumber}.`);
  return result;
}

function resetRecordDraft() {
  stateRef.recordDraft = createLookupRecord();
  renderRecordDraft();
}

async function createNewProject() {
  await flushAutosave({ silent: true });

  const settings = (await bridge.loadModuleStorage(MODULE_STORAGE_KEY)) || {};
  const fallback = await bridge.getDefaultWctCenDatabasePath();
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
  setStatus("Utworzono nowy projekt WCT CEN.");
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

  const result = await bridge.openWctCenProject(dbPath, {
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
  const result = await bridge.importWctCenWorkbook(stateRef.state);
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

async function updateProject() {
  const dbPath = await ensureDbPath();
  const result = await bridge.updateWctCenProject(stateRef.state, dbPath);
  setState(result.state, {
    currentProject: stateRef.currentProjectSummary,
    projectNameDraft: stateRef.projectNameDraft || deriveProjectName(result.state),
    dirty: true,
  });
  await persistSettings();
  await Promise.all([
    refreshLookupRecords(),
    persistCurrentProject({ silent: true }),
  ]);

  const stats = result.stats || {};
  const lookupErrors =
    Array.isArray(stats.lookupErrors) && stats.lookupErrors.length > 0
      ? ` Bledy lookup: ${stats.lookupErrors.join(" | ")}`
      : "";
  setStatus(
    `Zaktualizowano CEN: ${stats.updatedCen || 0}, T-State: ${stats.updatedTState || 0}, Stop: ${stats.updatedStop || 0}, nie znaleziono: ${stats.notFound || 0}.${lookupErrors}`
  );
  return result;
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

function updateRow(rowId, field, value) {
  stateRef.state.rows = stateRef.state.rows.map((row) =>
    row.id === rowId
      ? normalizeRow({
          ...row,
          [field]: field === "containerNumber" ? normalizeContainerNumber(value) : value,
        })
      : row
  );
  registerProjectMutation({ rerender: "summary" });
}

function addRow() {
  stateRef.state.rows.push(createRow());
  registerProjectMutation({ rerender: "all" });
}

function deleteRow(rowId) {
  stateRef.state.rows = stateRef.state.rows.filter((row) => row.id !== rowId);
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
    stateRef.activeTab = tabNode.dataset.tab;
    document.querySelectorAll(".tab").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.tab === stateRef.activeTab);
    });
    document.querySelectorAll("[data-panel]").forEach((panel) => {
      panel.classList.toggle("is-active", panel.dataset.panel === stateRef.activeTab);
    });
    return;
  }

  const recordRow = event.target.closest("[data-record-container]");
  if (recordRow) {
    const containerNumber = recordRow.dataset.recordContainer;
    const selected = stateRef.lookupRecords.find(
      (record) => record.containerNumber === containerNumber
    );
    if (selected) {
      stateRef.recordDraft = normalizeLookupRecord(selected);
      renderRecordDraft();
      setStatus(`Wybrano rekord ${selected.containerNumber}.`);
    }
  }
});

elements.projectRows.addEventListener("input", (event) => {
  const rowNode = event.target.closest("[data-row-id]");
  if (!rowNode || !event.target.dataset.field) {
    return;
  }

  updateRow(rowNode.dataset.rowId, event.target.dataset.field, event.target.value);
});

elements.projectName.addEventListener("input", async (event) => {
  stateRef.projectNameDraft = asText(event.target.value);
  renderSummary();

  try {
    await refreshProjectOptions(stateRef.projectNameDraft);
  } catch (error) {
    console.error(error);
    setStatus(error.message);
  }
});

elements.projectName.addEventListener("change", () => {
  stateRef.projectNameDraft = asText(elements.projectName.value);
  renderSummary();
});

elements.dbPath.addEventListener("change", async (event) => {
  stateRef.state.dbPath = asText(event.target.value);
  clearCurrentProject();
  await persistSettings();
  markDirty(hasProjectContent());
  await Promise.all([refreshLookupRecords(), refreshProjectOptions()]);
  if (hasProjectContent()) {
    await persistCurrentProject({ silent: true });
  }
});

elements.lookupSearch.addEventListener("change", async () => {
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
  bridge.setWindowTitle("WCT CEN");
  const settings = (await bridge.loadModuleStorage(MODULE_STORAGE_KEY)) || {};
  const defaultDb = await bridge.getDefaultWctCenDatabasePath();
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
  setStatus("WCT CEN jest gotowy.");
}

bootstrap().catch((error) => {
  console.error(error);
  window.alert(error.message);
  setStatus(error.message);
});

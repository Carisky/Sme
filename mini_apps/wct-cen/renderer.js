const bridge = window.bridge;
const MODULE_STORAGE_KEY = "wct-cen.settings";

const elements = {
  projectIndicator: document.getElementById("project-indicator"),
  statusText: document.getElementById("status-text"),
  projectRows: document.getElementById("project-rows"),
  lookupRows: document.getElementById("lookup-rows"),
  dbPath: document.getElementById("db-path"),
  lookupSearch: document.getElementById("lookup-search"),
  recordContainer: document.getElementById("record-container"),
  recordCen: document.getElementById("record-cen"),
  recordTState: document.getElementById("record-t-state"),
  recordStop: document.getElementById("record-stop"),
  summarySourceFile: document.getElementById("summary-source-file"),
  summaryRowCount: document.getElementById("summary-row-count"),
  summaryCenCount: document.getElementById("summary-cen-count"),
  summaryPendingCount: document.getElementById("summary-pending-count"),
  summaryManualCount: document.getElementById("summary-manual-count"),
  summaryDbPath: document.getElementById("summary-db-path"),
  summaryDbStatus: document.getElementById("summary-db-status"),
};

const stateRef = {
  currentProjectPath: null,
  dirty: false,
  activeTab: "dane",
  state: createEmptyState(),
  lookupRecords: [],
  recordDraft: createLookupRecord(),
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

function setStatus(message) {
  elements.statusText.textContent = message;
}

function markDirty(value = true) {
  stateRef.dirty = value;
  renderProjectIndicator();
}

function renderProjectIndicator() {
  const suffix = stateRef.dirty ? " * niezapisane zmiany" : "";
  elements.projectIndicator.textContent = stateRef.currentProjectPath
    ? `${stateRef.currentProjectPath}${suffix}`
    : `Projekt w pamieci${suffix}`;

  const titleBase = stateRef.currentProjectPath ? basename(stateRef.currentProjectPath) : "WCT CEN";
  bridge.setWindowTitle(`${titleBase}${stateRef.dirty ? " *" : ""}`);
}

function setActiveTab(tabName) {
  stateRef.activeTab = tabName;
  document.querySelectorAll(".tab").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tab === tabName);
  });
  document.querySelectorAll("[data-panel]").forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.panel === tabName);
  });
}

function confirmDiscardIfNeeded() {
  if (!stateRef.dirty) {
    return true;
  }

  return window.confirm("Sa niezapisane zmiany. Kontynuowac?");
}

function renderSummary() {
  const rows = stateRef.state.rows;
  const cenCount = rows.filter((row) => row.cen).length;
  const pendingCount = rows.filter((row) => row.containerNumber && !row.cen).length;
  const manualCount = rows.filter((row) => row.origin === "manual").length;

  elements.summarySourceFile.textContent = stateRef.state.sourceFileName || "-";
  elements.summaryRowCount.textContent = String(rows.length);
  elements.summaryCenCount.textContent = String(cenCount);
  elements.summaryPendingCount.textContent = String(pendingCount);
  elements.summaryManualCount.textContent = String(manualCount);
  elements.summaryDbPath.textContent = stateRef.state.dbPath || "-";
  elements.summaryDbStatus.textContent = stateRef.state.dbPath ? "Aktywna" : "Domyslna";
  elements.dbPath.value = stateRef.state.dbPath;
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
  renderSummary();
  renderRows();
  renderLookupRows();
  renderRecordDraft();
}

function setState(nextState, options = {}) {
  stateRef.state = normalizeState(nextState);
  if (options.currentProjectPath !== undefined) {
    stateRef.currentProjectPath = options.currentProjectPath;
  }
  if (options.dirty !== undefined) {
    stateRef.dirty = options.dirty;
  }
  renderAll();
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
  renderAll();
}

async function chooseDbPath() {
  const currentPath = stateRef.state.dbPath || (await ensureDbPath());
  const result = await bridge.chooseWctCenDatabasePath(currentPath);
  if (result.canceled) {
    return null;
  }

  stateRef.state.dbPath = asText(result.filePath);
  await persistSettings();
  markDirty(true);
  await refreshLookupRecords();
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
  markDirty(true);
  await refreshLookupRecords();
  setStatus(`Zapisano rekord ${stateRef.recordDraft.containerNumber}.`);
  return result;
}

function resetRecordDraft() {
  stateRef.recordDraft = createLookupRecord();
  renderRecordDraft();
}

async function createNewProject() {
  if (!confirmDiscardIfNeeded()) {
    return null;
  }

  const settings = (await bridge.loadModuleStorage(MODULE_STORAGE_KEY)) || {};
  const fallback = await bridge.getDefaultWctCenDatabasePath();
  setState(
    createEmptyState({
      dbPath: asText(settings.dbPath) || asText(fallback.filePath),
    }),
    { currentProjectPath: null, dirty: false }
  );
  resetRecordDraft();
  await refreshLookupRecords();
  setStatus("Utworzono nowy projekt WCT CEN.");
  return true;
}

async function openProject() {
  if (!confirmDiscardIfNeeded()) {
    return null;
  }

  const result = await bridge.openWctCenProject();
  if (result.canceled) {
    return null;
  }

  setState(result.state, {
    currentProjectPath: result.filePath,
    dirty: false,
  });
  await persistSettings();
  await refreshLookupRecords();
  setStatus(`Otworzono ${basename(result.filePath)}.`);
  return result;
}

async function importWorkbook() {
  const result = await bridge.importWctCenWorkbook(stateRef.state);
  if (result.canceled) {
    return null;
  }

  const nextState = normalizeState({
    ...result.state,
    dbPath: stateRef.state.dbPath || result.state.dbPath,
  });
  setState(nextState, {
    currentProjectPath: stateRef.currentProjectPath,
    dirty: true,
  });
  await persistSettings();
  setStatus(`Zaimportowano dane z ${basename(result.filePath)}.`);
  return result;
}

async function updateProject() {
  const dbPath = await ensureDbPath();
  const result = await bridge.updateWctCenProject(stateRef.state, dbPath);
  setState(result.state, {
    currentProjectPath: stateRef.currentProjectPath,
    dirty: true,
  });
  await persistSettings();
  await refreshLookupRecords();

  const stats = result.stats || {};
  const lookupErrors = Array.isArray(stats.lookupErrors) && stats.lookupErrors.length > 0
    ? ` Bledy lookup: ${stats.lookupErrors.join(" | ")}`
    : "";
  setStatus(
    `Zaktualizowano CEN: ${stats.updatedCen || 0}, T-State: ${stats.updatedTState || 0}, Stop: ${stats.updatedStop || 0}, nie znaleziono: ${stats.notFound || 0}.${lookupErrors}`
  );
  return result;
}

async function saveProject() {
  const result = await bridge.saveWctCenProject(stateRef.state, stateRef.currentProjectPath);
  if (result.canceled) {
    return null;
  }

  stateRef.currentProjectPath = result.filePath;
  markDirty(false);
  setStatus(`Zapisano projekt ${basename(result.filePath)}.`);
  return result;
}

async function saveProjectAs() {
  const result = await bridge.saveWctCenProjectAs(stateRef.state);
  if (result.canceled) {
    return null;
  }

  stateRef.currentProjectPath = result.filePath;
  markDirty(false);
  setStatus(`Zapisano projekt jako ${basename(result.filePath)}.`);
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
  markDirty(true);
  renderSummary();
}

function addRow() {
  stateRef.state.rows.push(createRow());
  markDirty(true);
  renderAll();
}

function deleteRow(rowId) {
  stateRef.state.rows = stateRef.state.rows.filter((row) => row.id !== rowId);
  markDirty(true);
  renderAll();
}

function handleAction(action, payload = {}) {
  switch (action) {
    case "home":
      return bridge.openHome();
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
    setActiveTab(tabNode.dataset.tab);
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

elements.dbPath.addEventListener("change", async (event) => {
  stateRef.state.dbPath = asText(event.target.value);
  await persistSettings();
  markDirty(true);
  await refreshLookupRecords();
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
    { currentProjectPath: null, dirty: false }
  );
  await refreshLookupRecords();
  setStatus("WCT CEN jest gotowy.");
}

bootstrap().catch((error) => {
  console.error(error);
  window.alert(error.message);
  setStatus(error.message);
});

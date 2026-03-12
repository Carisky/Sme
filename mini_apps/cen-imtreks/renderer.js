import {
  collectProjectStats,
  DEFAULT_SHEET_NAME,
  asText,
  basename,
  buildProjectNameKey,
  createEmptyState,
  createLookupRecord,
  createProjectView,
  createRow,
  deriveProjectName,
  flattenRows,
  getActiveSheetFilterOptions,
  getFilteredRows,
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
  renderFilters,
  renderProjectIndicator,
  renderProjectOptions,
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
  filterVesselDateMode: document.getElementById("filter-vessel-date-mode"),
  filterVesselDateRange: document.getElementById("filter-vessel-date-range"),
  filterVesselDateList: document.getElementById("filter-vessel-date-list"),
  filterVesselDatePanel: document.querySelector("#filter-vessel-date-list .filter-multiselect__panel"),
  filterVesselDateListPanel: document.getElementById("filter-vessel-date-list-panel"),
  filterVesselDateSummary: document.getElementById("filter-vessel-date-summary"),
  filterVesselDateOptions: document.getElementById("filter-vessel-date-options"),
  filterVesselDateFrom: document.getElementById("filter-vessel-date-from"),
  filterVesselDateTo: document.getElementById("filter-vessel-date-to"),
  filterHasT1: document.getElementById("filter-has-t1"),
  filterStatus: document.getElementById("filter-status"),
  forceUpdate: document.getElementById("force-update"),
  lookupRows: document.getElementById("lookup-rows"),
  dbPath: document.getElementById("db-path"),
  lookupSearch: document.getElementById("lookup-search"),
  recordContainer: document.getElementById("record-container"),
  recordCen: document.getElementById("record-cen"),
  recordTState: document.getElementById("record-t-state"),
  recordStop: document.getElementById("record-stop"),
  summaryProjectTitle: document.getElementById("summary-project-title"),
  summaryProjectSyncInline: document.getElementById("summary-project-sync-inline"),
  summaryActiveMonthInline: document.getElementById("summary-active-month-inline"),
  summaryRowCountInline: document.getElementById("summary-row-count-inline"),
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
  summaryDbStatusInline: document.getElementById("summary-db-status-inline"),
  summaryManualCountInline: document.getElementById("summary-manual-count-inline"),
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
  vesselDateModeFilter: "range",
  vesselDateFromFilter: "",
  vesselDateToFilter: "",
  vesselDateSelectedFilter: [],
  hasT1Filter: "all",
  statusFilter: "",
  forceUpdateEnabled: false,
  rowHighlights: new Map(),
  stickyVisibleRowIds: new Set(),
  updateSession: null,
  pendingProjectRender: 0,
  pendingProjectRenderPreserveViewport: false,
  projectStats: collectProjectStats(createEmptyState()),
  lastBusyStateSignature: "",
};

const UPDATE_BUTTON_LABEL = "Zaktualizuj";
const CANCEL_UPDATE_BUTTON_LABEL = "Anuluj aktualizacje";
const VESSEL_DATE_POPOVER_GAP_PX = 8;
const VESSEL_DATE_POPOVER_VIEWPORT_PADDING_PX = 16;
const VESSEL_DATE_POPOVER_MAX_WIDTH_PX = 340;

let vesselDatePopoverPositionFrame = 0;

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

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
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

function getProjectFilters({ includeSticky = false } = {}) {
  return {
    searchTerm: stateRef.projectSearchTerm,
    vesselDateMode: stateRef.vesselDateModeFilter,
    vesselDateFrom: stateRef.vesselDateFromFilter,
    vesselDateTo: stateRef.vesselDateToFilter,
    vesselDateSelected: stateRef.vesselDateSelectedFilter,
    hasT1: stateRef.hasT1Filter,
    status: stateRef.statusFilter,
    includeRowIds: includeSticky ? Array.from(stateRef.stickyVisibleRowIds) : [],
  };
}

function createProjectViewSnapshot() {
  return createProjectView({
    searchTerm: stateRef.projectSearchTerm,
    vesselDateMode: stateRef.vesselDateModeFilter,
    vesselDateFrom: stateRef.vesselDateFromFilter,
    vesselDateTo: stateRef.vesselDateToFilter,
    vesselDateSelected: stateRef.vesselDateSelectedFilter,
    hasT1: stateRef.hasT1Filter,
    status: stateRef.statusFilter,
    forceUpdate: stateRef.forceUpdateEnabled,
  });
}

function restoreProjectViewFromState() {
  const view = createProjectView(stateRef.state.view || {});
  stateRef.projectSearchTerm = view.searchTerm;
  stateRef.vesselDateModeFilter = view.vesselDateMode;
  stateRef.vesselDateFromFilter = view.vesselDateFrom;
  stateRef.vesselDateToFilter = view.vesselDateTo;
  stateRef.vesselDateSelectedFilter = Array.isArray(view.vesselDateSelected)
    ? [...view.vesselDateSelected]
    : [];
  stateRef.hasT1Filter = view.hasT1;
  stateRef.statusFilter = view.status;
  stateRef.forceUpdateEnabled = Boolean(view.forceUpdate);
}

function syncProjectViewToState() {
  stateRef.state = {
    ...stateRef.state,
    view: createProjectViewSnapshot(),
  };
}

function getRowStatsContribution(row) {
  return {
    rowCount: 1,
    filledCount: asText(row?.t1) ? 1 : 0,
    pendingCount: asText(row?.containerNumber) && !asText(row?.t1) ? 1 : 0,
    manualCount: asText(row?.origin) === "manual" ? 1 : 0,
  };
}

function recalculateProjectStats() {
  stateRef.projectStats = collectProjectStats(stateRef.state);
}

function applyProjectStatsDelta(previousRow, nextRow) {
  if (!stateRef.projectStats) {
    recalculateProjectStats();
    return;
  }

  const previous = previousRow ? getRowStatsContribution(previousRow) : null;
  const next = nextRow ? getRowStatsContribution(nextRow) : null;
  stateRef.projectStats = {
    rowCount:
      stateRef.projectStats.rowCount - (previous?.rowCount || 0) + (next?.rowCount || 0),
    filledCount:
      stateRef.projectStats.filledCount -
      (previous?.filledCount || 0) +
      (next?.filledCount || 0),
    pendingCount:
      stateRef.projectStats.pendingCount -
      (previous?.pendingCount || 0) +
      (next?.pendingCount || 0),
    manualCount:
      stateRef.projectStats.manualCount -
      (previous?.manualCount || 0) +
      (next?.manualCount || 0),
  };
}

function syncProjectFilterControls() {
  elements.projectSearch.value = stateRef.projectSearchTerm;
  elements.filterVesselDateMode.value = stateRef.vesselDateModeFilter;
  elements.filterVesselDateFrom.value = stateRef.vesselDateFromFilter;
  elements.filterVesselDateTo.value = stateRef.vesselDateToFilter;
  elements.filterHasT1.value = stateRef.hasT1Filter;
  elements.filterStatus.value = stateRef.statusFilter;
  elements.forceUpdate.checked = stateRef.forceUpdateEnabled;
}

function renderProjectSummaryArea() {
  renderProjectIndicator(elements, stateRef, bridge, getActiveProjectTitle);
  renderSummary(elements, stateRef, getActiveProjectTitle);
}

function renderProjectFiltersArea() {
  renderFilters(elements, stateRef);
  syncProjectFilterControls();
  queueVesselDatePopoverPositionSync();
}

function renderProjectOptionsArea() {
  renderProjectOptions(elements, stateRef);
}

function renderProjectMetaArea({ includeMonthTabs = false, includeFilters = false, includeOptions = false } = {}) {
  if (includeOptions) {
    renderProjectOptionsArea();
  }

  renderProjectSummaryArea();

  if (includeMonthTabs) {
    renderMonthTabs(elements, stateRef);
  }

  if (includeFilters) {
    renderProjectFiltersArea();
  }

  applyBusyState();
}

function resetRowFeedback() {
  stateRef.rowHighlights = new Map();
  stateRef.stickyVisibleRowIds = new Set();
}

function mergeRowHighlights(entries = []) {
  entries.forEach((entry) => {
    const rowId = asText(entry?.rowId);
    const fields = Array.isArray(entry?.fields)
      ? entry.fields.map((field) => asText(field)).filter(Boolean)
      : [];

    if (!rowId || !fields.length) {
      return;
    }

    const current = stateRef.rowHighlights.get(rowId) || new Set();
    fields.forEach((field) => current.add(field));
    stateRef.rowHighlights.set(rowId, current);
    stateRef.stickyVisibleRowIds.add(rowId);
  });
}

function clearRowHighlightForField(rowId, field) {
  const normalizedRowId = asText(rowId);
  const normalizedField = asText(field);
  if (!normalizedRowId || !normalizedField) {
    return;
  }

  const current = stateRef.rowHighlights.get(normalizedRowId);
  if (!current) {
    return;
  }

  current.delete(normalizedField);
  if (current.size > 0) {
    stateRef.rowHighlights.set(normalizedRowId, current);
    return;
  }

  stateRef.rowHighlights.delete(normalizedRowId);
  stateRef.stickyVisibleRowIds.delete(normalizedRowId);
}

function getUpdatedFields(previousRow, nextRow) {
  const trackedFields = ["t1", "status", "stop"];
  return trackedFields.filter(
    (field) => asText(previousRow?.[field]) !== asText(nextRow?.[field]) && asText(nextRow?.[field])
  );
}

function captureRowHighlightsFromState(nextState) {
  const currentRowsById = new Map(flattenRows(stateRef.state).map((row) => [row.id, row]));
  const highlightEntries = flattenRows(nextState)
    .map((row) => ({
      rowId: row.id,
      fields: getUpdatedFields(currentRowsById.get(row.id), row),
    }))
    .filter((entry) => entry.fields.length > 0);

  mergeRowHighlights(highlightEntries);
  return highlightEntries.length;
}

function commitViewMutation({ rerender = "project", clearFeedback = false } = {}) {
  syncActiveSheetFilters();
  syncProjectViewToState();

  if (clearFeedback) {
    resetRowFeedback();
  }

  if (stateRef.currentProjectId || hasProjectContent()) {
    stateRef.changeToken += 1;
    stateRef.dirty = true;
    scheduleProjectSave();
  }

  if (rerender === "all") {
    renderAllApp();
    return;
  }

  queueProjectDataRender();
}

function syncActiveSheetFilters() {
  const options = getActiveSheetFilterOptions(stateRef.state);
  const vesselDateValues = new Set(
    options.vesselDateOptions.map((option) => option.value).filter(Boolean)
  );

  stateRef.vesselDateModeFilter =
    asText(stateRef.vesselDateModeFilter).toLowerCase() === "list" ? "list" : "range";

  if (!options.vesselDateFrom || !options.vesselDateTo) {
    stateRef.vesselDateFromFilter = "";
    stateRef.vesselDateToFilter = "";
    stateRef.vesselDateSelectedFilter = [];
  } else {
    if (stateRef.vesselDateFromFilter) {
      if (stateRef.vesselDateFromFilter < options.vesselDateFrom) {
        stateRef.vesselDateFromFilter = options.vesselDateFrom;
      } else if (stateRef.vesselDateFromFilter > options.vesselDateTo) {
        stateRef.vesselDateFromFilter = options.vesselDateTo;
      }
    }

    if (stateRef.vesselDateToFilter) {
      if (stateRef.vesselDateToFilter < options.vesselDateFrom) {
        stateRef.vesselDateToFilter = options.vesselDateFrom;
      } else if (stateRef.vesselDateToFilter > options.vesselDateTo) {
        stateRef.vesselDateToFilter = options.vesselDateTo;
      }
    }

    stateRef.vesselDateSelectedFilter = stateRef.vesselDateSelectedFilter.filter((value) =>
      vesselDateValues.has(asText(value))
    );
  }

  if (
    stateRef.vesselDateFromFilter &&
    stateRef.vesselDateToFilter &&
    stateRef.vesselDateFromFilter > stateRef.vesselDateToFilter
  ) {
    stateRef.vesselDateToFilter = stateRef.vesselDateFromFilter;
  }

  if (stateRef.statusFilter && !options.statuses.includes(stateRef.statusFilter)) {
    stateRef.statusFilter = "";
  }

  const normalizedHasT1 = asText(stateRef.hasT1Filter).toLowerCase();
  stateRef.hasT1Filter = ["all", "with", "without"].includes(normalizedHasT1)
    ? normalizedHasT1
    : "all";
}

function getProjectTableWrapper() {
  return elements.projectRows.closest(".table-wrapper");
}

function captureProjectTableViewport() {
  const wrapper = getProjectTableWrapper();
  const activeElement = document.activeElement;
  const activeInput =
    activeElement instanceof HTMLInputElement &&
    activeElement.closest("[data-row-id]") &&
    activeElement.closest(".table-wrapper") === wrapper
      ? activeElement
      : null;
  const rowNode = activeInput?.closest("[data-row-id]");

  return {
    scrollTop: wrapper?.scrollTop ?? 0,
    scrollLeft: wrapper?.scrollLeft ?? 0,
    windowScrollX: window.scrollX,
    windowScrollY: window.scrollY,
    rowId: rowNode?.dataset.rowId || "",
    field: activeInput?.dataset.field || "",
    selectionStart:
      typeof activeInput?.selectionStart === "number" ? activeInput.selectionStart : null,
    selectionEnd: typeof activeInput?.selectionEnd === "number" ? activeInput.selectionEnd : null,
  };
}

function restoreProjectTableViewport(snapshot) {
  if (!snapshot) {
    return;
  }

  const wrapper = getProjectTableWrapper();
  if (wrapper) {
    wrapper.scrollTop = snapshot.scrollTop;
    wrapper.scrollLeft = snapshot.scrollLeft;
  }

  if (snapshot.rowId && snapshot.field) {
    const input = elements.projectRows.querySelector(
      `[data-row-id="${snapshot.rowId}"] [data-field="${snapshot.field}"]`
    );
    if (input instanceof HTMLInputElement) {
      input.focus({ preventScroll: true });
      if (
        typeof snapshot.selectionStart === "number" &&
        typeof snapshot.selectionEnd === "number"
      ) {
        const selectionStart = Math.min(snapshot.selectionStart, input.value.length);
        const selectionEnd = Math.min(snapshot.selectionEnd, input.value.length);
        input.setSelectionRange(selectionStart, selectionEnd);
      }
    }
  }

  if (wrapper) {
    wrapper.scrollTop = snapshot.scrollTop;
    wrapper.scrollLeft = snapshot.scrollLeft;
  }
  window.scrollTo(snapshot.windowScrollX, snapshot.windowScrollY);
}

function withProjectTableViewportPreserved(callback, preserveViewport = false) {
  if (!preserveViewport) {
    callback();
    return;
  }

  const snapshot = captureProjectTableViewport();
  callback();
  restoreProjectTableViewport(snapshot);
}

function renderProjectData({ preserveProjectTableViewport = false } = {}) {
  syncActiveSheetFilters();
  syncProjectViewToState();

  withProjectTableViewportPreserved(() => {
    renderProjectMetaArea({
      includeMonthTabs: true,
      includeFilters: true,
    });
    renderRows(elements, stateRef);
    applyBusyState({ force: true });
  }, preserveProjectTableViewport);
}

function queueProjectDataRender({ preserveProjectTableViewport = false } = {}) {
  stateRef.pendingProjectRenderPreserveViewport =
    stateRef.pendingProjectRenderPreserveViewport || preserveProjectTableViewport;

  if (stateRef.pendingProjectRender) {
    return;
  }

  stateRef.pendingProjectRender = window.requestAnimationFrame(() => {
    const shouldPreserveViewport = stateRef.pendingProjectRenderPreserveViewport;
    stateRef.pendingProjectRender = 0;
    stateRef.pendingProjectRenderPreserveViewport = false;
    renderProjectData({ preserveProjectTableViewport: shouldPreserveViewport });
  });
}

function applyProjectRowPatches(changes = []) {
  if (!Array.isArray(changes) || changes.length === 0) {
    return;
  }

  const previousRowsById = new Map(flattenRows(stateRef.state).map((row) => [row.id, row]));
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
  mergeRowHighlights(
    Array.from(rowMap.values())
      .map((row) => ({
        rowId: row.id,
        fields: getUpdatedFields(previousRowsById.get(row.id), row),
      }))
      .filter((entry) => entry.fields.length > 0)
  );
  stateRef.dirty = true;
  recalculateProjectStats();
  queueProjectDataRender({ preserveProjectTableViewport: true });
}

function applyBusyState({ force = false } = {}) {
  const isBusy = Boolean(stateRef.busyAction);
  const normalizedProgress = Math.max(0, Math.min(Number(stateRef.busyProgress) || 0, 100));
  const signature = `${Number(isBusy)}|${stateRef.busyAction}|${normalizedProgress}|${stateRef.busyMessage}`;

  if (!force && signature === stateRef.lastBusyStateSignature) {
    return;
  }

  stateRef.lastBusyStateSignature = signature;

  document.body.classList.toggle("is-busy", isBusy);
  document.querySelectorAll("button, input, select").forEach((node) => {
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
    resetRowFeedback();
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
    resetRowFeedback();
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

function renderAllApp({ preserveProjectTableViewport = false } = {}) {
  syncActiveSheetFilters();
  syncProjectViewToState();

  withProjectTableViewportPreserved(() => {
    renderAll(elements, stateRef, bridge, getActiveProjectTitle);
    syncProjectFilterControls();
    applyBusyState({ force: true });
  }, preserveProjectTableViewport);
}

function markDirty(value = true) {
  stateRef.dirty = Boolean(value);
  renderProjectMetaArea({
    includeMonthTabs: true,
    includeFilters: true,
    includeOptions: true,
  });
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
  recalculateProjectStats();
  restoreProjectViewFromState();
  syncActiveSheetFilters();
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
  const normalized =
    state && typeof state === "object" && Array.isArray(state.sheets) ? state : normalizeState(state);
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

function registerProjectMutation({
  rerender = "summary",
  autosave = true,
  preserveProjectTableViewport = false,
} = {}) {
  stateRef.changeToken += 1;
  stateRef.dirty = true;

  if (rerender === "all") {
    renderAllApp({ preserveProjectTableViewport });
  } else {
    renderProjectMetaArea();
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
  renderProjectOptionsArea();
  renderProjectSummaryArea();
  applyBusyState();
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
  syncActiveSheetFilters();
  const snapshot = normalizeState({
    ...stateRef.state,
    projectName: requestedProjectName,
    dbPath,
    view: createProjectViewSnapshot(),
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

    recalculateProjectStats();
    renderProjectOptionsArea();
    renderProjectSummaryArea();
    applyBusyState();
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

  recalculateProjectStats();
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
  resetRowFeedback();
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

  resetRowFeedback();
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
    view: stateRef.state.view,
  });
  const nextDraft =
    stateRef.currentProjectId && stateRef.state.projectName
      ? stateRef.projectNameDraft
      : asText(stateRef.projectNameDraft) || deriveProjectName(nextState);

  resetRowFeedback();
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
  const activeSheet = getActiveSheet(stateRef.state);
  const filteredRows = getFilteredRows(stateRef.state, getProjectFilters());

  if (!filteredRows.length) {
    window.alert(
      "Na aktywnej zakladce nie ma wierszy spelniajacych biezace filtry do aktualizacji."
    );
    return null;
  }

  resetRowFeedback();
  const updateId = createUpdateRequestId();
  stateRef.updateSession = {
    id: updateId,
    baseState: normalizeState(stateRef.state),
    baseDirty: stateRef.dirty,
    projectNameDraft: stateRef.projectNameDraft,
    force: Boolean(stateRef.forceUpdateEnabled),
    targetRowIds: filteredRows.map((row) => row.id),
  };

  setBusyState({
    action: "update",
    message: stateRef.forceUpdateEnabled
      ? `Force update: przygotowanie ${filteredRows.length} wierszy z arkusza ${activeSheet?.name || "-"}.`
      : `Przygotowanie ${filteredRows.length} wierszy z arkusza ${activeSheet?.name || "-"}.`,
    progress: 4,
  });
  await flushUi();

  try {
    const result = await bridge.updateCenImtreksProject(stateRef.state, dbPath, {
      requestId: updateId,
      force: stateRef.forceUpdateEnabled,
      activeSheetId: stateRef.state.activeSheetId,
      targetRowIds: filteredRows.map((row) => row.id),
    });

    if (result.canceled) {
      return finalizeCanceledUpdate(result);
    }

    setBusyState({
      action: "update",
      message: "Odswiezanie widoku i zapisywanie projektu.",
      progress: 96,
    });
    captureRowHighlightsFromState(result.state);
    setState(result.state, {
      currentProject: stateRef.currentProjectSummary,
      projectNameDraft: stateRef.projectNameDraft || deriveProjectName(result.state),
      dirty: true,
    });
    await persistSettings();
    await Promise.all([refreshLookupRecords(), persistCurrentProject({ silent: true })]);
    resetUpdateSession();
    clearBusyState();
    setStatus(
      stateRef.rowHighlights.size > 0
        ? `${formatUpdateSummary(result)} Podswietlono ${stateRef.rowHighlights.size} zmienionych wierszy.`
        : formatUpdateSummary(result)
    );
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
  resetRowFeedback();
  stateRef.state.activeSheetId = asText(sheetId);
  syncActiveSheetFilters();
  renderProjectData();
}

function resetProjectFilters() {
  stateRef.projectSearchTerm = "";
  stateRef.vesselDateModeFilter = "range";
  stateRef.vesselDateFromFilter = "";
  stateRef.vesselDateToFilter = "";
  stateRef.vesselDateSelectedFilter = [];
  stateRef.hasT1Filter = "all";
  stateRef.statusFilter = "";
  elements.filterVesselDateList.open = false;
  commitViewMutation({ clearFeedback: true });
  setStatus("Wyczyszczono aktywne filtry.");
}

function findActiveSheetRowIndex(rowId) {
  const activeSheet = getActiveSheet(stateRef.state);
  if (!activeSheet) {
    return { activeSheet: null, rowIndex: -1 };
  }

  return {
    activeSheet,
    rowIndex: activeSheet.rows.findIndex((row) => row.id === rowId),
  };
}

function syncEditedRowUi(rowId, field) {
  const rowNode = elements.projectRows.querySelector(`[data-row-id="${rowId}"]`);
  if (!(rowNode instanceof HTMLTableRowElement)) {
    return;
  }

  const updatedFields = stateRef.rowHighlights.get(asText(rowId)) || new Set();
  rowNode.classList.toggle("row--updated", updatedFields.size > 0);

  const input = rowNode.querySelector(`[data-field="${field}"]`);
  if (!(input instanceof HTMLInputElement)) {
    return;
  }

  const isUpdated = updatedFields.has(asText(field));
  input.classList.toggle("row-input--updated", isUpdated);
  if (isUpdated) {
    input.title = "Uzupelnione podczas ostatniej aktualizacji";
    return;
  }

  input.removeAttribute("title");
}

function hasActiveVesselDateFilter() {
  return Boolean(
    (stateRef.vesselDateModeFilter === "range" &&
      (stateRef.vesselDateFromFilter || stateRef.vesselDateToFilter)) ||
      (stateRef.vesselDateModeFilter === "list" && stateRef.vesselDateSelectedFilter.length > 0)
  );
}

function shouldRerenderProjectRowsAfterRowEdit(rowId, field) {
  const normalizedField = asText(field);
  if (!normalizedField) {
    return false;
  }

  if (
    normalizedField === "containerNumber" &&
    (stateRef.projectSearchTerm || stateRef.stickyVisibleRowIds.has(asText(rowId)))
  ) {
    return true;
  }

  if (
    normalizedField === "vesselDate" &&
    (hasActiveVesselDateFilter() || stateRef.stickyVisibleRowIds.has(asText(rowId)))
  ) {
    return true;
  }

  if (normalizedField === "t1" && stateRef.hasT1Filter !== "all") {
    return true;
  }

  if (
    normalizedField === "status" &&
    (stateRef.statusFilter || stateRef.stickyVisibleRowIds.has(asText(rowId)))
  ) {
    return true;
  }

  return false;
}

function shouldRefreshProjectFiltersAfterRowEdit(field, previousRow, nextRow) {
  const normalizedField = asText(field);
  if (normalizedField === "status") {
    return asText(previousRow?.status) !== asText(nextRow?.status);
  }

  if (normalizedField === "vesselDate") {
    return asText(previousRow?.vesselDate) !== asText(nextRow?.vesselDate);
  }

  return false;
}

function shouldRefreshProjectSummaryAfterRowEdit(field, previousRow, nextRow) {
  const normalizedField = asText(field);
  if (!normalizedField) {
    return false;
  }

  return (
    normalizedField === "t1" ||
    normalizedField === "containerNumber" ||
    normalizedField === "status" ||
    normalizedField === "vesselDate" ||
    normalizedField === "origin" ||
    shouldRefreshProjectFiltersAfterRowEdit(normalizedField, previousRow, nextRow)
  );
}

function updateRow(rowId, field, value) {
  const { activeSheet, rowIndex } = findActiveSheetRowIndex(rowId);
  if (!activeSheet || rowIndex < 0) {
    return;
  }

  const previousRow = activeSheet.rows[rowIndex];
  const nextRow = normalizeRow({
    ...previousRow,
    [field]: field === "containerNumber" ? normalizeContainerNumber(value) : value,
  });
  activeSheet.rows[rowIndex] = nextRow;

  clearRowHighlightForField(rowId, field);
  applyProjectStatsDelta(previousRow, nextRow);

  stateRef.changeToken += 1;
  stateRef.dirty = true;
  scheduleProjectSave();

  if (shouldRerenderProjectRowsAfterRowEdit(rowId, field)) {
    renderProjectData({ preserveProjectTableViewport: true });
    return;
  }

  syncEditedRowUi(rowId, field);

  if (shouldRefreshProjectSummaryAfterRowEdit(field, previousRow, nextRow)) {
    renderProjectSummaryArea();
  } else {
    renderProjectIndicator(elements, stateRef, bridge, getActiveProjectTitle);
    applyBusyState();
  }

  if (shouldRefreshProjectFiltersAfterRowEdit(field, previousRow, nextRow)) {
    renderProjectFiltersArea();
  }
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
  const nextRow = createRow();
  stateRef.state.sheets = stateRef.state.sheets.map((sheet) =>
    sheet.id === activeSheet.id
      ? normalizeSheet({
          ...sheet,
          rows: [...sheet.rows, nextRow],
        })
      : sheet
  );
  stateRef.state.activeSheetId = activeSheet.id;
  applyProjectStatsDelta(null, nextRow);
  registerProjectMutation({ rerender: "all", preserveProjectTableViewport: true });
}

function deleteRow(rowId) {
  const removedRow = flattenRows(stateRef.state).find((row) => row.id === rowId) || null;
  stateRef.state.sheets = stateRef.state.sheets.map((sheet) =>
    normalizeSheet({
      ...sheet,
      rows: sheet.rows.filter((row) => row.id !== rowId),
    })
  );
  stateRef.rowHighlights.delete(asText(rowId));
  stateRef.stickyVisibleRowIds.delete(asText(rowId));
  applyProjectStatsDelta(removedRow, null);
  registerProjectMutation({ rerender: "all", preserveProjectTableViewport: true });
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
    case "clear-filters":
      return resetProjectFilters();
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

function clearVesselDatePopoverPosition() {
  elements.filterVesselDatePanel?.style.removeProperty("--vessel-date-popover-top");
  elements.filterVesselDatePanel?.style.removeProperty("--vessel-date-popover-left");
  elements.filterVesselDatePanel?.style.removeProperty("--vessel-date-popover-width");
  elements.filterVesselDatePanel?.style.removeProperty("--vessel-date-popover-max-height");
}

function mountVesselDatePopoverPanel() {
  if (!(elements.filterVesselDatePanel instanceof HTMLElement)) {
    return;
  }

  if (elements.filterVesselDatePanel.parentElement !== document.body) {
    document.body.append(elements.filterVesselDatePanel);
  }

  elements.filterVesselDatePanel.classList.add("filter-multiselect__panel--floating");
}

function restoreVesselDatePopoverPanel() {
  if (!(elements.filterVesselDatePanel instanceof HTMLElement)) {
    return;
  }

  if (elements.filterVesselDatePanel.parentElement !== elements.filterVesselDateList) {
    elements.filterVesselDateList.append(elements.filterVesselDatePanel);
  }

  elements.filterVesselDatePanel.classList.remove("filter-multiselect__panel--floating");
  clearVesselDatePopoverPosition();
}

function syncVesselDatePopoverPosition() {
  if (!elements.filterVesselDateList.open) {
    restoreVesselDatePopoverPanel();
    return;
  }

  const summary = elements.filterVesselDateSummary;
  const panel = elements.filterVesselDatePanel;
  if (!(summary instanceof HTMLElement) || !(panel instanceof HTMLElement)) {
    restoreVesselDatePopoverPanel();
    return;
  }

  mountVesselDatePopoverPanel();

  const summaryRect = summary.getBoundingClientRect();
  const viewportWidth = Math.max(0, window.innerWidth - VESSEL_DATE_POPOVER_VIEWPORT_PADDING_PX * 2);
  const width = Math.max(0, Math.min(VESSEL_DATE_POPOVER_MAX_WIDTH_PX, viewportWidth));
  panel.style.setProperty("--vessel-date-popover-width", `${width}px`);
  panel.style.removeProperty("--vessel-date-popover-max-height");

  const availableAbove = Math.max(
    0,
    summaryRect.top - VESSEL_DATE_POPOVER_VIEWPORT_PADDING_PX - VESSEL_DATE_POPOVER_GAP_PX
  );
  const maxHeight = Math.max(0, Math.floor(availableAbove));
  const renderedHeight = Math.min(panel.scrollHeight, maxHeight);
  const left = clamp(
    Math.round(summaryRect.right - width),
    VESSEL_DATE_POPOVER_VIEWPORT_PADDING_PX,
    Math.max(
      VESSEL_DATE_POPOVER_VIEWPORT_PADDING_PX,
      Math.round(window.innerWidth - VESSEL_DATE_POPOVER_VIEWPORT_PADDING_PX - width)
    )
  );
  const top = Math.round(
    Math.max(
      VESSEL_DATE_POPOVER_VIEWPORT_PADDING_PX,
      summaryRect.top - VESSEL_DATE_POPOVER_GAP_PX - renderedHeight
    )
  );

  panel.style.setProperty("--vessel-date-popover-top", `${top}px`);
  panel.style.setProperty("--vessel-date-popover-left", `${left}px`);
  panel.style.setProperty("--vessel-date-popover-max-height", `${maxHeight}px`);
}

function queueVesselDatePopoverPositionSync() {
  if (vesselDatePopoverPositionFrame) {
    window.cancelAnimationFrame(vesselDatePopoverPositionFrame);
  }

  vesselDatePopoverPositionFrame = window.requestAnimationFrame(() => {
    vesselDatePopoverPositionFrame = 0;
    syncVesselDatePopoverPosition();
  });
}

function isClickInsideVesselDateFilter(target) {
  return (
    target instanceof Element &&
    (Boolean(target.closest("#filter-vessel-date-list")) ||
      Boolean(target.closest(".filter-multiselect__panel--floating")))
  );
}

document.addEventListener("click", async (event) => {
  if (elements.filterVesselDateList.open && !isClickInsideVesselDateFilter(event.target)) {
    elements.filterVesselDateList.open = false;
  }

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

  const vesselDateSelectionNode = event.target.closest("[data-date-selection]");
  if (vesselDateSelectionNode) {
    if (stateRef.busyAction) {
      return;
    }

    const options = getActiveSheetFilterOptions(stateRef.state);
    stateRef.vesselDateSelectedFilter =
      vesselDateSelectionNode.dataset.dateSelection === "all"
        ? options.vesselDateOptions.map((option) => option.value)
        : [];
    commitViewMutation({ clearFeedback: true });
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
  const input = event.target instanceof HTMLInputElement ? event.target : null;
  if (!rowNode || !input?.dataset.field) {
    return;
  }

  const normalizedValue =
    input.dataset.field === "containerNumber"
      ? normalizeContainerNumber(input.value)
      : asText(input.value);
  if (input.value !== normalizedValue) {
    input.value = normalizedValue;
  }

  updateRow(rowNode.dataset.rowId, input.dataset.field, normalizedValue);
});

elements.projectSearch.addEventListener("input", (event) => {
  stateRef.projectSearchTerm = asText(event.target.value);
  commitViewMutation({ clearFeedback: true });
});

elements.filterVesselDateList.addEventListener("toggle", () => {
  if (elements.filterVesselDateList.open) {
    mountVesselDatePopoverPanel();
    queueVesselDatePopoverPositionSync();
    return;
  }

  restoreVesselDatePopoverPanel();
});

elements.filterVesselDateMode.addEventListener("change", (event) => {
  if (stateRef.busyAction) {
    return;
  }

  stateRef.vesselDateModeFilter = asText(event.target.value).toLowerCase() === "list" ? "list" : "range";
  commitViewMutation({ clearFeedback: true });
});

elements.filterVesselDateOptions.addEventListener("change", (event) => {
  if (stateRef.busyAction) {
    return;
  }

  const checkbox = event.target.closest("[data-vessel-date-value]");
  if (!checkbox) {
    return;
  }

  const selectedValues = new Set(stateRef.vesselDateSelectedFilter.map((value) => asText(value)));
  const vesselDateValue = asText(checkbox.dataset.vesselDateValue);
  if (!vesselDateValue) {
    return;
  }

  if (checkbox.checked) {
    selectedValues.add(vesselDateValue);
  } else {
    selectedValues.delete(vesselDateValue);
  }

  stateRef.vesselDateSelectedFilter = Array.from(selectedValues).sort((left, right) =>
    left.localeCompare(right, "pl")
  );
  commitViewMutation({ clearFeedback: true });
});

elements.filterVesselDateFrom.addEventListener("change", (event) => {
  if (stateRef.busyAction) {
    return;
  }

  stateRef.vesselDateFromFilter = asText(event.target.value);
  if (
    stateRef.vesselDateToFilter &&
    stateRef.vesselDateFromFilter &&
    stateRef.vesselDateFromFilter > stateRef.vesselDateToFilter
  ) {
    stateRef.vesselDateToFilter = stateRef.vesselDateFromFilter;
  }
  commitViewMutation({ clearFeedback: true });
});

elements.filterVesselDateTo.addEventListener("change", (event) => {
  if (stateRef.busyAction) {
    return;
  }

  stateRef.vesselDateToFilter = asText(event.target.value);
  if (
    stateRef.vesselDateFromFilter &&
    stateRef.vesselDateToFilter &&
    stateRef.vesselDateToFilter < stateRef.vesselDateFromFilter
  ) {
    stateRef.vesselDateFromFilter = stateRef.vesselDateToFilter;
  }
  commitViewMutation({ clearFeedback: true });
});

elements.filterHasT1.addEventListener("change", (event) => {
  if (stateRef.busyAction) {
    return;
  }

  stateRef.hasT1Filter = asText(event.target.value).toLowerCase() || "all";
  commitViewMutation({ clearFeedback: true });
});

elements.filterStatus.addEventListener("change", (event) => {
  if (stateRef.busyAction) {
    return;
  }

  stateRef.statusFilter = asText(event.target.value);
  commitViewMutation({ clearFeedback: true });
});

window.addEventListener("resize", () => {
  if (elements.filterVesselDateList.open) {
    queueVesselDatePopoverPositionSync();
  }
});

document.addEventListener(
  "scroll",
  () => {
    if (elements.filterVesselDateList.open) {
      queueVesselDatePopoverPositionSync();
    }
  },
  true
);

elements.forceUpdate.addEventListener("change", (event) => {
  if (stateRef.busyAction) {
    return;
  }

  stateRef.forceUpdateEnabled = Boolean(event.target.checked);
  commitViewMutation();
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

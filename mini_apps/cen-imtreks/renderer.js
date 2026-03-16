import {
  collectInvoiceComparisonRows,
  collectProjectStats,
  DEFAULT_SHEET_NAME,
  asText,
  basename,
  buildProjectNameKey,
  createEmptyState,
  createInvoiceComparison,
  createLookupRecord,
  createProjectView,
  createRow,
  deriveProjectName,
  buildNextSheetName,
  extractContainerNumbers,
  flattenRows,
  getActiveSheetFilterOptions,
  getFilteredRows,
  getActiveSheet,
  matchesRowFilters,
  normalizeComparisonContainers,
  normalizeContainerNumber,
  normalizeInvoiceComparison,
  normalizeLookupRecord,
  normalizeProjectOption,
  normalizeRow,
  normalizeSheet,
  normalizeState,
  shouldUseCompactStopValue,
} from "./renderer-model.js";
import {
  renderAll,
  renderFilters,
  renderInvoiceComparison,
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
  filterStatusList: document.getElementById("filter-status-list"),
  filterStatusSummary: document.getElementById("filter-status-summary"),
  filterStatusOptions: document.getElementById("filter-status-options"),
  filterRemarksList: document.getElementById("filter-remarks-list"),
  filterRemarksSummary: document.getElementById("filter-remarks-summary"),
  filterRemarksOptions: document.getElementById("filter-remarks-options"),
  filterComparison: document.getElementById("filter-comparison"),
  forceUpdate: document.getElementById("force-update"),
  comparisonHighlight: document.getElementById("comparison-highlight"),
  duplicateHighlight: document.getElementById("duplicate-highlight"),
  invoicePreviewStatus: document.getElementById("invoice-preview-status"),
  comparisonProjectCount: document.getElementById("comparison-project-count"),
  comparisonMatchedCount: document.getElementById("comparison-matched-count"),
  comparisonMissingCount: document.getElementById("comparison-missing-count"),
  comparisonBaseCount: document.getElementById("comparison-base-count"),
  comparisonSourceMeta: document.getElementById("comparison-source-meta"),
  comparisonFilePath: document.getElementById("comparison-file-path"),
  comparisonSheet: document.getElementById("comparison-sheet"),
  comparisonColumn: document.getElementById("comparison-column"),
  comparisonSheetFilter: document.getElementById("comparison-sheet-filter"),
  comparisonSheetSummary: document.getElementById("comparison-sheet-summary"),
  comparisonSheetOptions: document.getElementById("comparison-sheet-options"),
  comparisonSearch: document.getElementById("comparison-search"),
  comparisonStatusFilter: document.getElementById("comparison-status-filter"),
  comparisonStatusSort: document.getElementById("comparison-status-sort"),
  comparisonRows: document.getElementById("comparison-rows"),
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
  invoiceBatchModal: document.getElementById("invoice-batch-modal"),
  invoiceBatchModalCopy: document.getElementById("invoice-batch-modal-copy"),
  invoiceBatchInput: document.getElementById("invoice-batch-input"),
  textEntryModal: document.getElementById("text-entry-modal"),
  textEntryEyebrow: document.getElementById("text-entry-eyebrow"),
  textEntryTitle: document.getElementById("text-entry-title"),
  textEntryCopy: document.getElementById("text-entry-copy"),
  textEntryLabel: document.getElementById("text-entry-label"),
  textEntryInput: document.getElementById("text-entry-input"),
  textEntryConfirm: document.getElementById("text-entry-confirm"),
};

const stateRef = {
  currentProjectId: null,
  currentProjectSummary: null,
  projectNameDraft: "",
  dirty: false,
  activeTab: "dane",
  state: createEmptyState(),
  lookupRecords: [],
  comparisonWorkbook: null,
  projectOptions: [],
  recordDraft: createLookupRecord(),
  manualRowDraft: createManualRowDraft(),
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
  statusFilters: [],
  remarksFilters: [],
  comparisonFilter: "all",
  comparisonSearchTerm: "",
  comparisonStatusFilter: "all",
  comparisonStatusSort: "missing-first",
  comparisonSelectedSheets: [],
  comparisonHighlightEnabled: false,
  duplicateHighlightEnabled: false,
  invoicePreview: null,
  forceUpdateEnabled: false,
  rowHighlights: new Map(),
  stickyVisibleRowIds: new Set(),
  activeSheetShadow: null,
  updateSession: null,
  textEntryRequest: null,
  textEntryRestoreFocus: null,
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
const VALID_LOOKUP_T1_PATTERN = /^\d{2}PL.*$/i;
const MANUAL_DRAFT_FIELDS = [
  "sequenceNumber",
  "orderDate",
  "vesselDate",
  "folderName",
  "containerNumber",
  "blNumber",
  "customsOffice",
  "status",
  "stop",
  "t1",
  "invoiceInfo",
  "remarks",
];

let vesselDatePopoverPositionFrame = 0;

function createManualRowDraft(overrides = {}) {
  return {
    sequenceNumber: "",
    orderDate: "",
    vesselDate: "",
    folderName: "",
    containerNumber: "",
    blNumber: "",
    customsOffice: "",
    status: "",
    stop: "",
    t1: "",
    invoiceInfo: "",
    remarks: "",
    ...overrides,
  };
}

function normalizeManualDraftFieldValue(field, value) {
  const normalizedField = asText(field);
  if (!MANUAL_DRAFT_FIELDS.includes(normalizedField)) {
    return "";
  }

  if (normalizedField === "containerNumber") {
    return String(value ?? "");
  }

  return asText(value);
}

function updateManualRowDraftField(field, value) {
  const normalizedField = asText(field);
  if (!MANUAL_DRAFT_FIELDS.includes(normalizedField)) {
    return;
  }

  stateRef.manualRowDraft = {
    ...stateRef.manualRowDraft,
    [normalizedField]: normalizeManualDraftFieldValue(normalizedField, value),
  };
}

function getManualRowDraftCommonFields(draft = {}) {
  return MANUAL_DRAFT_FIELDS.filter((field) => field !== "containerNumber").reduce((acc, field) => {
    acc[field] = asText(draft?.[field]);
    return acc;
  }, {});
}

function inferManualFieldsFromContainerInput(rawInput, commonFields = {}) {
  const sourceText = String(rawInput ?? "");
  if (!sourceText) {
    return {};
  }

  const inferred = {};
  if (!asText(commonFields.blNumber)) {
    const blMatch = sourceText.match(/\bBL\s*#?\s*[:\-]?\s*([A-Z0-9-]+)/i);
    if (blMatch?.[1]) {
      inferred.blNumber = asText(blMatch[1]).toUpperCase();
    }
  }

  if (!asText(commonFields.customsOffice)) {
    const customsOfficeCode = sourceText.match(/\b[A-Z]{2}\d{6}\b/i);
    if (customsOfficeCode?.[0]) {
      inferred.customsOffice = asText(customsOfficeCode[0]).toUpperCase();
    }
  }

  return inferred;
}

function getManualRowsFromDraft(draft = {}) {
  const rawContainerInput = String(draft?.containerNumber ?? "");
  const normalizedContainerInput = asText(rawContainerInput);
  const commonFields = getManualRowDraftCommonFields(draft);
  const inferredFields = inferManualFieldsFromContainerInput(rawContainerInput, commonFields);
  const mergedCommonFields = {
    ...commonFields,
    ...inferredFields,
  };
  const containers = extractContainerNumbers(rawContainerInput);
  const hasCommonValues = Object.values(mergedCommonFields).some((value) => Boolean(asText(value)));

  if (!normalizedContainerInput && !hasCommonValues) {
    return {
      rows: [],
      reason: "empty",
      inferredFields,
    };
  }

  let resolvedContainers = [...containers];
  if (!resolvedContainers.length && normalizedContainerInput) {
    const fallbackContainer = normalizeContainerNumber(normalizedContainerInput);
    const singleTokenInput =
      !/[,\n;]/.test(normalizedContainerInput) &&
      normalizedContainerInput.trim().split(/\s+/).filter(Boolean).length <= 2;
    if (singleTokenInput && fallbackContainer) {
      resolvedContainers = [fallbackContainer];
    } else {
      return {
        rows: [],
        reason: "invalid-containers",
        inferredFields,
      };
    }
  }

  const normalizedRows = (resolvedContainers.length ? resolvedContainers : [""]).map((containerNumber) =>
    normalizeRow({
      ...createRow(),
      ...mergedCommonFields,
      containerNumber,
      origin: "manual",
    })
  );

  return {
    rows: normalizedRows,
    reason: normalizedRows.length > 1 ? "bulk" : "single",
    inferredFields,
  };
}

function buildPreservedManualDraft(previousDraft = {}, inferredFields = {}) {
  const preserved = MANUAL_DRAFT_FIELDS.filter((field) => field !== "containerNumber").reduce(
    (acc, field) => {
      acc[field] = asText(previousDraft?.[field]);
      return acc;
    },
    {}
  );

  return createManualRowDraft({
    ...preserved,
    ...inferredFields,
    containerNumber: "",
  });
}

function focusManualDraftField(field = "containerNumber", { select = true } = {}) {
  const normalizedField = asText(field);
  window.requestAnimationFrame(() => {
    const input = elements.projectRows.querySelector(
      `[data-manual-draft="true"] [data-draft-field="${normalizedField}"]`
    );
    if (!(input instanceof HTMLInputElement)) {
      return;
    }

    input.focus({ preventScroll: false });
    if (select) {
      input.select();
    }
  });
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

function createEmptyFilterOptions() {
  return {
    vesselDates: [],
    vesselDateOptions: [],
    vesselDateFrom: "",
    vesselDateTo: "",
    statuses: [],
    remarks: [],
  };
}

function createEmptyActiveSheetShadow() {
  return {
    sheetId: "",
    filterOptions: createEmptyFilterOptions(),
    rowIndexById: new Map(),
    containerCounts: new Map(),
    rowIdsByContainer: new Map(),
    duplicateContainers: new Set(),
  };
}

function buildDuplicateContainerSet(containerCounts = new Map()) {
  return new Set(
    Array.from(containerCounts.entries())
      .filter(([, count]) => count > 1)
      .map(([containerNumber]) => containerNumber)
  );
}

function buildActiveSheetShadow() {
  const activeSheet = getActiveSheet(stateRef.state);
  if (!activeSheet) {
    return createEmptyActiveSheetShadow();
  }

  const rowIndexById = new Map();
  const containerCounts = new Map();
  const rowIdsByContainer = new Map();

  activeSheet.rows.forEach((row, index) => {
    const rowId = asText(row?.id);
    if (rowId) {
      rowIndexById.set(rowId, index);
    }

    const containerNumber = normalizeContainerNumber(row?.containerNumber);
    if (!containerNumber) {
      return;
    }

    containerCounts.set(containerNumber, (containerCounts.get(containerNumber) || 0) + 1);
    const currentRowIds = rowIdsByContainer.get(containerNumber) || new Set();
    if (rowId) {
      currentRowIds.add(rowId);
    }
    rowIdsByContainer.set(containerNumber, currentRowIds);
  });

  return {
    sheetId: activeSheet.id,
    filterOptions: getActiveSheetFilterOptions(stateRef.state),
    rowIndexById,
    containerCounts,
    rowIdsByContainer,
    duplicateContainers: buildDuplicateContainerSet(containerCounts),
  };
}

function ensureActiveSheetShadow({ force = false } = {}) {
  if (
    force ||
    !stateRef.activeSheetShadow ||
    stateRef.activeSheetShadow.sheetId !== asText(stateRef.state.activeSheetId)
  ) {
    stateRef.activeSheetShadow = buildActiveSheetShadow();
  }

  return stateRef.activeSheetShadow;
}

function rebuildActiveSheetShadow() {
  return ensureActiveSheetShadow({ force: true });
}

function updateContainerShadowCount(containerCounts, containerNumber, delta) {
  const normalizedContainer = normalizeContainerNumber(containerNumber);
  if (!normalizedContainer || !delta) {
    return;
  }

  const nextCount = (containerCounts.get(normalizedContainer) || 0) + delta;
  if (nextCount <= 0) {
    containerCounts.delete(normalizedContainer);
    return;
  }

  containerCounts.set(normalizedContainer, nextCount);
}

function addRowIdToContainerShadow(rowIdsByContainer, containerNumber, rowId) {
  const normalizedContainer = normalizeContainerNumber(containerNumber);
  const normalizedRowId = asText(rowId);
  if (!normalizedContainer || !normalizedRowId) {
    return;
  }

  const rowIds = rowIdsByContainer.get(normalizedContainer) || new Set();
  rowIds.add(normalizedRowId);
  rowIdsByContainer.set(normalizedContainer, rowIds);
}

function removeRowIdFromContainerShadow(rowIdsByContainer, containerNumber, rowId) {
  const normalizedContainer = normalizeContainerNumber(containerNumber);
  const normalizedRowId = asText(rowId);
  if (!normalizedContainer || !normalizedRowId) {
    return;
  }

  const rowIds = rowIdsByContainer.get(normalizedContainer);
  if (!rowIds) {
    return;
  }

  rowIds.delete(normalizedRowId);
  if (rowIds.size === 0) {
    rowIdsByContainer.delete(normalizedContainer);
    return;
  }

  rowIdsByContainer.set(normalizedContainer, rowIds);
}

function syncActiveSheetShadowContainerChange(previousRow, nextRow) {
  const shadow = ensureActiveSheetShadow();
  const previousContainer = normalizeContainerNumber(previousRow?.containerNumber);
  const nextContainer = normalizeContainerNumber(nextRow?.containerNumber);
  const rowId = asText(nextRow?.id || previousRow?.id);

  if (!rowId || previousContainer === nextContainer) {
    return shadow;
  }

  updateContainerShadowCount(shadow.containerCounts, previousContainer, -1);
  updateContainerShadowCount(shadow.containerCounts, nextContainer, 1);
  removeRowIdFromContainerShadow(shadow.rowIdsByContainer, previousContainer, rowId);
  addRowIdToContainerShadow(shadow.rowIdsByContainer, nextContainer, rowId);
  shadow.duplicateContainers = buildDuplicateContainerSet(shadow.containerCounts);
  return shadow;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function setStatus(message) {
  elements.statusText.textContent = message;
}

function normalizeComparisonStatusFilterValue(value) {
  const normalized = asText(value).toLowerCase();
  return ["all", "matched", "missing"].includes(normalized) ? normalized : "all";
}

function normalizeComparisonStatusSortValue(value) {
  const normalized = asText(value).toLowerCase();
  return ["missing-first", "matched-first"].includes(normalized)
    ? normalized
    : "missing-first";
}

function getFilteredComparisonRows() {
  return collectInvoiceComparisonRows(stateRef.state, {
    sheetNames: stateRef.comparisonSelectedSheets,
    statusSort: stateRef.comparisonStatusSort,
  }).filter((row) => {
    if (
      stateRef.comparisonSearchTerm &&
      !row.containerNumber.includes(stateRef.comparisonSearchTerm)
    ) {
      return false;
    }

    if (stateRef.comparisonStatusFilter === "matched") {
      return row.hasComparisonMatch;
    }

    if (stateRef.comparisonStatusFilter === "missing") {
      return !row.hasComparisonMatch;
    }

    return true;
  });
}

function renderComparisonArea() {
  renderInvoiceComparison(elements, stateRef);
  applyBusyState();
}

function getVisibleProjectRowsForBatch() {
  return getFilteredRows(stateRef.state, getProjectFilters());
}

function getInvoicePreviewEntriesMap() {
  return new Map(
    Array.isArray(stateRef.invoicePreview?.entries)
      ? stateRef.invoicePreview.entries.map((entry) => [asText(entry.rowId), entry])
      : []
  );
}

function renderInvoicePreviewControls() {
  const preview = stateRef.invoicePreview;
  const hasPreview = Array.isArray(preview?.entries) && preview.entries.length > 0;
  const openButton = document.querySelector('[data-action="invoice-batch-open"]');
  const acceptButton = document.querySelector('[data-action="invoice-preview-accept"]');
  const cancelButton = document.querySelector('[data-action="invoice-preview-cancel"]');

  if (openButton) {
    openButton.hidden = hasPreview;
  }

  if (acceptButton) {
    acceptButton.hidden = !hasPreview;
  }

  if (cancelButton) {
    cancelButton.hidden = !hasPreview;
  }

  elements.invoicePreviewStatus.hidden = !hasPreview;
  elements.invoicePreviewStatus.textContent = hasPreview
    ? `Podglad: ${preview.entries.length} wierszy - ${preview.invoiceValue}`
    : "";
  document.body.classList.toggle("has-invoice-preview", hasPreview);
}

function openInvoiceBatchModal() {
  const visibleRows = getVisibleProjectRowsForBatch();
  if (!visibleRows.length) {
    window.alert("Brak widocznych wierszy do przypisania faktury.");
    return false;
  }

  const activeSheet = getActiveSheet(stateRef.state);
  elements.invoiceBatchModalCopy.textContent = `Podglad obejmie ${visibleRows.length} widocznych wierszy z arkusza ${
    activeSheet?.name || "-"
  }. Zmiany zapisza sie dopiero po kliknieciu Akceptuj fakture.`;
  elements.invoiceBatchInput.value = stateRef.invoicePreview?.invoiceValue || "";
  elements.invoiceBatchModal.hidden = false;
  window.requestAnimationFrame(() => {
    elements.invoiceBatchInput.focus();
    elements.invoiceBatchInput.select();
  });
  return true;
}

function closeInvoiceBatchModal() {
  elements.invoiceBatchModal.hidden = true;
}

function focusTextEntryInput({ select = true } = {}) {
  window.requestAnimationFrame(() => {
    if (!(elements.textEntryInput instanceof HTMLInputElement)) {
      return;
    }

    elements.textEntryInput.focus();
    if (select) {
      elements.textEntryInput.select();
    }
  });
}

function restoreTextEntryFocus() {
  const restoreNode = stateRef.textEntryRestoreFocus;
  stateRef.textEntryRestoreFocus = null;

  if (
    !(restoreNode instanceof HTMLElement) ||
    !restoreNode.isConnected ||
    restoreNode.hasAttribute("disabled")
  ) {
    return;
  }

  window.requestAnimationFrame(() => {
    restoreNode.focus({ preventScroll: true });
  });
}

function finalizeTextEntryModal(result, { canceled = false } = {}) {
  const request = stateRef.textEntryRequest;
  if (!request) {
    return null;
  }

  stateRef.textEntryRequest = null;
  elements.textEntryModal.hidden = true;
  restoreTextEntryFocus();

  if (canceled && request.cancelStatus) {
    setStatus(request.cancelStatus);
  }

  request.resolve(result);
  return result;
}

function openTextEntryModal(options = {}) {
  if (stateRef.textEntryRequest) {
    finalizeTextEntryModal(null);
  }

  const request = {
    eyebrow: asText(options.eyebrow) || "Nowa nazwa",
    title: asText(options.title) || "Wpisz nazwe",
    copy: asText(options.copy),
    label: asText(options.label) || "Nazwa",
    confirmLabel: asText(options.confirmLabel) || "Zapisz",
    placeholder: asText(options.placeholder),
    initialValue: asText(options.initialValue),
    emptyMessage: asText(options.emptyMessage) || "Wpisz nazwe.",
    cancelStatus: asText(options.cancelStatus),
  };

  stateRef.textEntryRestoreFocus =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  elements.textEntryEyebrow.textContent = request.eyebrow;
  elements.textEntryTitle.textContent = request.title;
  elements.textEntryCopy.textContent = request.copy;
  elements.textEntryCopy.hidden = !request.copy;
  elements.textEntryLabel.textContent = request.label;
  elements.textEntryInput.placeholder = request.placeholder || "";
  elements.textEntryInput.value = request.initialValue;
  elements.textEntryConfirm.textContent = request.confirmLabel;
  elements.textEntryModal.hidden = false;

  return new Promise((resolve) => {
    stateRef.textEntryRequest = {
      ...request,
      resolve,
    };
    focusTextEntryInput();
  });
}

function submitTextEntryModal() {
  const request = stateRef.textEntryRequest;
  if (!request) {
    return null;
  }

  const value = asText(elements.textEntryInput.value);
  if (!value) {
    setStatus(request.emptyMessage);
    focusTextEntryInput({ select: false });
    return null;
  }

  return finalizeTextEntryModal(value);
}

function cancelTextEntryModal() {
  return finalizeTextEntryModal(null, { canceled: true });
}

async function loadComparisonWorkbookMetadata(filePath, { silent = true } = {}) {
  const normalizedPath = asText(filePath);
  if (!normalizedPath) {
    stateRef.comparisonWorkbook = null;
    renderComparisonArea();
    return null;
  }

  try {
    const workbook = await bridge.inspectCenImtreksComparisonWorkbook(normalizedPath);
    if (asText(stateRef.state.invoiceComparison?.filePath) !== normalizedPath) {
      return null;
    }

    stateRef.comparisonWorkbook = workbook;
    renderComparisonArea();
    return workbook;
  } catch (error) {
    if (asText(stateRef.state.invoiceComparison?.filePath) === normalizedPath) {
      stateRef.comparisonWorkbook = null;
      renderComparisonArea();
    }

    if (!silent) {
      setStatus(`Nie udalo sie odczytac bazy porownawczej: ${error.message}`);
    }
    return null;
  }
}

function getUpdateButton() {
  return document.querySelector('[data-action="update"]');
}

function createUpdateRequestId() {
  return `cen-imtreks-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isValidLookupT1Value(value) {
  const normalized = asText(value);
  return !normalized || VALID_LOOKUP_T1_PATTERN.test(normalized);
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
    statuses: stateRef.statusFilters,
    remarks: stateRef.remarksFilters,
    comparisonStatus: stateRef.comparisonFilter,
    comparisonContainers: stateRef.state.invoiceComparison?.containers || [],
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
    status: stateRef.statusFilters[0] || "",
    statuses: stateRef.statusFilters,
    remarks: stateRef.remarksFilters,
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
  stateRef.statusFilters = Array.isArray(view.statuses)
    ? [...view.statuses]
    : view.status
      ? [view.status]
      : [];
  stateRef.remarksFilters = Array.isArray(view.remarks) ? [...view.remarks] : [];
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
  elements.filterComparison.value = stateRef.comparisonFilter;
  elements.comparisonHighlight.checked = stateRef.comparisonHighlightEnabled;
  elements.duplicateHighlight.checked = stateRef.duplicateHighlightEnabled;
  elements.forceUpdate.checked = stateRef.forceUpdateEnabled;
}

function renderProjectSummaryArea() {
  renderProjectIndicator(elements, stateRef, bridge, getActiveProjectTitle);
  renderSummary(elements, stateRef, getActiveProjectTitle);
}

function renderProjectFiltersArea() {
  renderFilters(elements, stateRef);
  syncProjectFilterControls();
  renderInvoicePreviewControls();
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
  const options = ensureActiveSheetShadow().filterOptions;
  const vesselDateValues = new Set(
    options.vesselDateOptions.map((option) => option.value).filter(Boolean)
  );
  const statusValues = new Set(options.statuses.map((option) => option.value));
  const remarkValues = new Set(options.remarks.map((option) => option.value));

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

  stateRef.statusFilters = stateRef.statusFilters.filter((value) => statusValues.has(asText(value)));
  stateRef.remarksFilters = stateRef.remarksFilters.filter((value) =>
    remarkValues.has(asText(value))
  );

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
  rebuildActiveSheetShadow();
  queueProjectDataRender({ preserveProjectTableViewport: true });
}

function applyBusyState({ force = false } = {}) {
  const isBusy = Boolean(stateRef.busyAction);
  const isUpdateBusy =
    isBusy && stateRef.busyAction === "update" && Boolean(stateRef.updateSession?.id);
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

  elements.inlineUpdateStatus.hidden = !isUpdateBusy;

  if (isUpdateBusy) {
    elements.inlineUpdateText.textContent = stateRef.busyMessage || "Trwa operacja.";
    elements.inlineUpdateFill.style.width = `${Math.max(6, normalizedProgress)}%`;
    elements.inlineUpdateValue.textContent = `${normalizedProgress}%`;
    return;
  }

  elements.inlineUpdateText.textContent = "Trwa aktualizacja.";
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
    renderInvoicePreviewControls();
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
  rebuildActiveSheetShadow();
  stateRef.manualRowDraft = createManualRowDraft();
  recalculateProjectStats();
  restoreProjectViewFromState();
  syncActiveSheetFilters();
  stateRef.comparisonSearchTerm = "";
  stateRef.comparisonStatusFilter = "all";
  stateRef.comparisonStatusSort = "missing-first";
  stateRef.comparisonSelectedSheets = [];
  stateRef.comparisonFilter = "all";
  stateRef.comparisonHighlightEnabled = false;
  stateRef.duplicateHighlightEnabled = false;
  stateRef.invoicePreview = null;
  closeInvoiceBatchModal();
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
  const comparisonFilePath = asText(stateRef.state.invoiceComparison?.filePath);
  if (
    !comparisonFilePath ||
    asText(stateRef.comparisonWorkbook?.filePath) !== comparisonFilePath
  ) {
    stateRef.comparisonWorkbook = null;
  }
  renderAllApp();
  if (comparisonFilePath && !stateRef.comparisonWorkbook) {
    loadComparisonWorkbookMetadata(comparisonFilePath, { silent: true }).catch((error) => {
      console.error(error);
    });
  }
}

function hasProjectContent(state = stateRef.state) {
  const normalized =
    state && typeof state === "object" && Array.isArray(state.sheets) ? state : normalizeState(state);
  const comparison = normalizeInvoiceComparison(normalized.invoiceComparison);
  return Boolean(
    normalized.sheets.length ||
      normalized.sourceFileName ||
      normalized.sourceFilePath ||
      normalized.fileName ||
      normalized.projectName ||
      comparison.fileName ||
      comparison.containers.length ||
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

function clearInvalidProjectT1Values() {
  if (!Array.isArray(stateRef.state.sheets) || stateRef.state.sheets.length === 0) {
    return 0;
  }

  let clearedCount = 0;
  let hasChanges = false;

  stateRef.state.sheets = stateRef.state.sheets.map((sheet) => {
    let sheetChanged = false;
    const nextRows = sheet.rows.map((row) => {
      if (isValidLookupT1Value(row.t1)) {
        return row;
      }

      sheetChanged = true;
      hasChanges = true;
      clearedCount += 1;
      return normalizeRow({
        ...row,
        t1: "",
      });
    });

    if (!sheetChanged) {
      return sheet;
    }

    return normalizeSheet({
      ...sheet,
      rows: nextRows,
    });
  });

  if (!hasChanges) {
    return 0;
  }

  recalculateProjectStats();
  registerProjectMutation({
    rerender: "all",
    preserveProjectTableViewport: true,
  });

  return clearedCount;
}

async function repairLookupT1() {
  const confirmed = window.confirm(
    "Naprawic T1 w bazie? Wartosci CEN, ktore nie pasuja do wzorca 2 cyfry + PL + dowolny tekst, zostana wyczyszczone."
  );
  if (!confirmed) {
    return null;
  }

  const dbPath = await ensureDbPath();
  const selectedContainer = asText(stateRef.recordDraft.containerNumber);
  const result = await bridge.repairCenImtreksLookupT1(dbPath);
  stateRef.state.dbPath = asText(result.dbPath) || dbPath;
  await persistSettings();
  await refreshLookupRecords();
  const clearedProjectRows = clearInvalidProjectT1Values();

  if (selectedContainer) {
    const selectedRecord = stateRef.lookupRecords.find(
      (record) => record.containerNumber === selectedContainer
    );
    if (selectedRecord) {
      stateRef.recordDraft = normalizeLookupRecord(selectedRecord);
      renderRecordDraft(elements, stateRef);
    }
  }

  setStatus(
    `Naprawa T1 zakonczona. Sprawdzono: ${result.scannedCount || 0}, wyczyszczono: ${
      result.clearedCount || 0
    }, w projekcie: ${clearedProjectRows}.`
  );
  return result;
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

async function importComparisonWorkbook() {
  const result = await bridge.importCenImtreksComparisonWorkbook({
    sheetName: stateRef.state.invoiceComparison?.sheetName,
    columnKey: stateRef.state.invoiceComparison?.columnKey,
  });
  if (result.canceled) {
    return null;
  }

  stateRef.comparisonWorkbook = result.workbook || null;
  stateRef.state = normalizeState({
    ...stateRef.state,
    invoiceComparison: result.comparison,
  });
  registerProjectMutation({ rerender: "all" });
  setStatus(
    `Zaimportowano baze porownawcza ${basename(result.filePath)}. Unikalne kontenery: ${
      result.uniqueCount || normalizeComparisonContainers(result.comparison?.containers).length
    }.`
  );
  return result;
}

async function applyComparisonSelection() {
  const filePath = asText(stateRef.state.invoiceComparison?.filePath);
  if (!filePath) {
    window.alert("Najpierw zaimportuj baze Excel do porownania.");
    return null;
  }

  const requestedSheetName = asText(elements.comparisonSheet.value);
  const requestedColumnKey = asText(elements.comparisonColumn.value).toUpperCase();
  if (
    requestedSheetName === asText(stateRef.state.invoiceComparison?.sheetName) &&
    requestedColumnKey === asText(stateRef.state.invoiceComparison?.columnKey).toUpperCase()
  ) {
    return null;
  }

  const result = await bridge.selectCenImtreksComparisonWorkbook(filePath, {
    sheetName: requestedSheetName,
    columnKey: requestedColumnKey,
  });
  stateRef.comparisonWorkbook = result.workbook || null;
  stateRef.state = normalizeState({
    ...stateRef.state,
    invoiceComparison: result.comparison,
  });
  registerProjectMutation({ rerender: "all" });
  setStatus(
    `Przeliczono baze porownawcza dla arkusza ${result.comparison?.sheetName || requestedSheetName}, kolumna ${
      result.comparison?.columnKey || requestedColumnKey
    }.`
  );
  return result;
}

function clearComparisonWorkbook() {
  const hadComparison =
    Boolean(asText(stateRef.state.invoiceComparison?.filePath)) ||
    normalizeComparisonContainers(stateRef.state.invoiceComparison?.containers).length > 0;
  stateRef.comparisonWorkbook = null;
  stateRef.state = normalizeState({
    ...stateRef.state,
    invoiceComparison: createInvoiceComparison(),
  });

  if (hadComparison) {
    registerProjectMutation({ rerender: "all" });
    setStatus("Wyczyszczono baze porownawcza i liste Do faktur.");
  } else {
    renderComparisonArea();
    setStatus("Brak bazy porownawczej do wyczyszczenia.");
  }
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
  const requestedName = await openTextEntryModal({
    eyebrow: "Projekt",
    title: "Zapisz projekt jako",
    copy: "Utworzy nowy zapis projektu w bazie, bez nadpisywania aktualnego rekordu.",
    label: "Nazwa projektu",
    placeholder: "Wpisz nowa nazwe projektu",
    confirmLabel: "Zapisz",
    initialValue: stateRef.projectNameDraft || getActiveProjectTitle(),
    emptyMessage: "Nazwa projektu jest wymagana.",
  });
  if (requestedName === null) {
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

async function exportVisibleRows() {
  const activeSheet = getActiveSheet(stateRef.state);
  const visibleRows = getFilteredRows(stateRef.state, getProjectFilters({ includeSticky: true }));
  if (!visibleRows.length) {
    window.alert("Brak widocznych wierszy do eksportu.");
    return null;
  }

  const result = await bridge.exportCenImtreksVisibleRows(stateRef.state, visibleRows, {
    sheetName: activeSheet?.name || "Wiersze robocze",
  });

  if (result?.canceled) {
    return null;
  }

  setStatus(`Wyeksportowano ${result.rowCount || visibleRows.length} wierszy do ${basename(result.filePath)}.`);
  return result;
}

async function exportComparisonRows() {
  const rows = getFilteredComparisonRows();
  if (!rows.length) {
    window.alert("Brak kontenerow do eksportu.");
    return null;
  }

  const result = await bridge.exportCenImtreksComparisonRows(stateRef.state, rows, {
    sheetName: "Do faktur",
  });
  if (result?.canceled) {
    return null;
  }

  setStatus(
    `Wyeksportowano ${result.rowCount || rows.length} kontenerow do ${basename(result.filePath)}.`
  );
  return result;
}

function startInvoicePreview() {
  const invoiceValue = asText(elements.invoiceBatchInput.value);
  if (!invoiceValue) {
    window.alert("Wpisz numer faktury.");
    elements.invoiceBatchInput.focus();
    return null;
  }

  const visibleRows = getVisibleProjectRowsForBatch().filter((row) => asText(row.id));
  if (!visibleRows.length) {
    window.alert("Brak widocznych wierszy do podgladu faktury.");
    return null;
  }

  stateRef.invoicePreview = {
    invoiceValue,
    entries: visibleRows.map((row) => ({
      rowId: asText(row.id),
      previousValue: asText(row.invoiceInfo),
      nextValue: invoiceValue,
    })),
  };
  closeInvoiceBatchModal();
  renderAllApp({ preserveProjectTableViewport: true });
  setStatus(
    `Przygotowano podglad faktury ${invoiceValue} dla ${visibleRows.length} widocznych wierszy.`
  );
  return stateRef.invoicePreview;
}

function cancelInvoicePreview() {
  if (!stateRef.invoicePreview) {
    closeInvoiceBatchModal();
    return false;
  }

  stateRef.invoicePreview = null;
  closeInvoiceBatchModal();
  renderAllApp({ preserveProjectTableViewport: true });
  setStatus("Cofnieto podglad faktury.");
  return true;
}

function acceptInvoicePreview() {
  const preview = stateRef.invoicePreview;
  if (!Array.isArray(preview?.entries) || preview.entries.length === 0) {
    return null;
  }

  const previewMap = new Map(preview.entries.map((entry) => [entry.rowId, entry.nextValue]));
  let updatedCount = 0;

  stateRef.state.sheets = stateRef.state.sheets.map((sheet) =>
    normalizeSheet({
      ...sheet,
      rows: sheet.rows.map((row) => {
        const nextInvoiceValue = previewMap.get(asText(row.id));
        if (nextInvoiceValue === undefined) {
          return row;
        }

        updatedCount += 1;
        return normalizeRow({
          ...row,
          invoiceInfo: nextInvoiceValue,
        });
      }),
    })
  );

  stateRef.invoicePreview = null;
  registerProjectMutation({
    rerender: "all",
    preserveProjectTableViewport: true,
  });
  setStatus(
    `Zatwierdzono fakture ${preview.invoiceValue} dla ${updatedCount} wierszy.`
  );
  return updatedCount;
}

function switchMonth(sheetId) {
  resetRowFeedback();
  stateRef.state.activeSheetId = asText(sheetId);
  rebuildActiveSheetShadow();
  syncActiveSheetFilters();
  renderProjectData();
}

async function addSheet() {
  resetRowFeedback();
  const suggestedSheetName = buildNextSheetName(stateRef.state.sheets);
  const requestedSheetName = await openTextEntryModal({
    eyebrow: "Arkusze projektu",
    title: "Dodaj zakladke",
    copy: "Nowa zakladka zostanie dodana do biezacego projektu i od razu stanie sie aktywna.",
    label: "Nazwa zakladki",
    placeholder: "Wpisz nazwe zakladki",
    confirmLabel: "Dodaj",
    initialValue: suggestedSheetName,
    emptyMessage: "Nazwa zakladki jest wymagana.",
    cancelStatus: "Anulowano dodawanie zakladki.",
  });
  if (requestedSheetName === null) {
    return null;
  }

  const nextSheetName = buildNextSheetName(stateRef.state.sheets, requestedSheetName);
  const sheet = normalizeSheet({
    name: nextSheetName,
  });

  stateRef.state.sheets = [...stateRef.state.sheets, sheet];
  stateRef.state.activeSheetId = sheet.id;
  rebuildActiveSheetShadow();
  syncActiveSheetFilters();
  registerProjectMutation({
    rerender: "all",
    preserveProjectTableViewport: false,
  });
  setStatus(`Dodano zakladke ${nextSheetName}.`);
  return sheet;
}

function resetProjectFilters() {
  stateRef.projectSearchTerm = "";
  stateRef.vesselDateModeFilter = "range";
  stateRef.vesselDateFromFilter = "";
  stateRef.vesselDateToFilter = "";
  stateRef.vesselDateSelectedFilter = [];
  stateRef.hasT1Filter = "all";
  stateRef.statusFilters = [];
  stateRef.remarksFilters = [];
  stateRef.comparisonFilter = "all";
  elements.filterVesselDateList.open = false;
  elements.filterStatusList.open = false;
  elements.filterRemarksList.open = false;
  commitViewMutation({ clearFeedback: true });
  setStatus("Wyczyszczono aktywne filtry.");
}

function findActiveSheetRowIndex(rowId) {
  const activeSheet = getActiveSheet(stateRef.state);
  if (!activeSheet) {
    return { activeSheet: null, rowIndex: -1 };
  }

  const shadow = ensureActiveSheetShadow();
  const cachedRowIndex = shadow.rowIndexById.get(asText(rowId));
  if (typeof cachedRowIndex === "number" && cachedRowIndex >= 0) {
    return {
      activeSheet,
      rowIndex: cachedRowIndex,
    };
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
  rowNode.classList.toggle("row--sticky-visible", stateRef.stickyVisibleRowIds.has(asText(rowId)));

  const input = rowNode.querySelector(`[data-field="${field}"]`);
  if (!(input instanceof HTMLInputElement)) {
    return;
  }

  const isUpdated = updatedFields.has(asText(field));
  input.classList.toggle("row-input--updated", isUpdated);
  if (asText(field) === "stop") {
    input.classList.toggle("row-input--compact", shouldUseCompactStopValue(input.value));
  }
  if (isUpdated) {
    input.title = "Uzupelnione podczas ostatniej aktualizacji";
    return;
  }

  input.removeAttribute("title");
}

function syncContainerRowDecorations(rowId) {
  const normalizedRowId = asText(rowId);
  if (!normalizedRowId) {
    return;
  }

  const rowNode = elements.projectRows.querySelector(`[data-row-id="${normalizedRowId}"]`);
  if (!(rowNode instanceof HTMLTableRowElement)) {
    return;
  }

  const { activeSheet, rowIndex } = findActiveSheetRowIndex(normalizedRowId);
  if (!activeSheet || rowIndex < 0) {
    return;
  }

  const row = activeSheet.rows[rowIndex];
  const shadow = ensureActiveSheetShadow();
  const comparisonSet = new Set(
    normalizeComparisonContainers(stateRef.state.invoiceComparison?.containers)
  );
  const hasComparisonMatch = comparisonSet.has(row.containerNumber);
  const hasDuplicateContainer = shadow.duplicateContainers.has(row.containerNumber);
  const containerInput = rowNode.querySelector('[data-field="containerNumber"]');
  const duplicateFlag = rowNode.querySelector(".row-flag");

  rowNode.classList.toggle(
    "row--comparison-highlight",
    stateRef.comparisonHighlightEnabled && hasComparisonMatch
  );
  rowNode.classList.toggle(
    "row--duplicate-highlight",
    stateRef.duplicateHighlightEnabled && hasDuplicateContainer
  );

  if (containerInput instanceof HTMLInputElement) {
    containerInput.classList.toggle(
      "row-input--comparison-match",
      stateRef.comparisonHighlightEnabled && hasComparisonMatch
    );
  }

  if (duplicateFlag instanceof HTMLElement) {
    duplicateFlag.classList.toggle("row-flag--duplicate", hasDuplicateContainer);
    if (hasDuplicateContainer) {
      duplicateFlag.title = "Duplikat kontenera w aktywnej zakladce";
      duplicateFlag.removeAttribute("aria-hidden");
    } else {
      duplicateFlag.removeAttribute("title");
      duplicateFlag.setAttribute("aria-hidden", "true");
    }
  }
}

function syncAffectedContainerRowsUi(previousRow, nextRow) {
  const shadow = ensureActiveSheetShadow();
  const affectedRowIds = new Set();
  const previousContainer = normalizeContainerNumber(previousRow?.containerNumber);
  const nextContainer = normalizeContainerNumber(nextRow?.containerNumber);
  const currentRowId = asText(nextRow?.id || previousRow?.id);

  [previousContainer, nextContainer].forEach((containerNumber) => {
    if (!containerNumber) {
      return;
    }

    const rowIds = shadow.rowIdsByContainer.get(containerNumber);
    if (!rowIds) {
      return;
    }

    rowIds.forEach((rowId) => affectedRowIds.add(asText(rowId)));
  });

  if (currentRowId) {
    affectedRowIds.add(currentRowId);
  }

  affectedRowIds.forEach((rowId) => syncContainerRowDecorations(rowId));
}

function hasActiveVesselDateFilter() {
  return Boolean(
    (stateRef.vesselDateModeFilter === "range" &&
      (stateRef.vesselDateFromFilter || stateRef.vesselDateToFilter)) ||
      (stateRef.vesselDateModeFilter === "list" && stateRef.vesselDateSelectedFilter.length > 0)
  );
}

function syncStickyVisibilityForRow(row) {
  const rowId = asText(row?.id);
  if (!rowId) {
    return;
  }

  if (matchesRowFilters(row, getProjectFilters())) {
    if (!stateRef.rowHighlights.has(rowId)) {
      stateRef.stickyVisibleRowIds.delete(rowId);
    }
    return;
  }

  stateRef.stickyVisibleRowIds.add(rowId);
}

function shouldRerenderProjectRowsAfterRowEdit(rowId, field) {
  const normalizedField = asText(field);
  if (!normalizedField) {
    return false;
  }

  if (
    normalizedField === "containerNumber" &&
    (stateRef.projectSearchTerm ||
      stateRef.stickyVisibleRowIds.has(asText(rowId)) ||
      stateRef.comparisonFilter !== "all")
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
    (stateRef.statusFilters.length > 0 || stateRef.stickyVisibleRowIds.has(asText(rowId)))
  ) {
    return true;
  }

  if (
    normalizedField === "remarks" &&
    (stateRef.remarksFilters.length > 0 || stateRef.stickyVisibleRowIds.has(asText(rowId)))
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

  if (normalizedField === "remarks") {
    return asText(previousRow?.remarks) !== asText(nextRow?.remarks);
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

  if (asText(field) === "containerNumber") {
    syncActiveSheetShadowContainerChange(previousRow, nextRow);
  } else if (["status", "remarks", "vesselDate"].includes(asText(field))) {
    rebuildActiveSheetShadow();
  }

  clearRowHighlightForField(rowId, field);
  applyProjectStatsDelta(previousRow, nextRow);
  syncStickyVisibilityForRow(nextRow);
  const shouldRefreshComparison = asText(field) === "containerNumber";

  stateRef.changeToken += 1;
  stateRef.dirty = true;
  scheduleProjectSave();

  if (shouldRerenderProjectRowsAfterRowEdit(rowId, field)) {
    renderProjectData({ preserveProjectTableViewport: true });
    if (shouldRefreshComparison) {
      renderComparisonArea();
    }
    return;
  }

  syncEditedRowUi(rowId, field);
  if (shouldRefreshComparison) {
    syncAffectedContainerRowsUi(previousRow, nextRow);
  }

  if (shouldRefreshProjectSummaryAfterRowEdit(field, previousRow, nextRow)) {
    renderProjectSummaryArea();
  } else {
    renderProjectIndicator(elements, stateRef, bridge, getActiveProjectTitle);
    applyBusyState();
  }

  if (shouldRefreshProjectFiltersAfterRowEdit(field, previousRow, nextRow)) {
    renderProjectFiltersArea();
  }

  if (shouldRefreshComparison) {
    renderComparisonArea();
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

function appendRowsToActiveSheet(
  rows = [],
  { preserveProjectTableViewport = true, keepRowsVisible = true } = {}
) {
  const normalizedRows = Array.isArray(rows) ? rows.map((row) => normalizeRow(row)) : [];
  if (!normalizedRows.length) {
    return 0;
  }

  const activeSheet = ensureDefaultSheet();
  stateRef.state.sheets = stateRef.state.sheets.map((sheet) =>
    sheet.id === activeSheet.id
      ? normalizeSheet({
          ...sheet,
          rows: [...sheet.rows, ...normalizedRows],
        })
      : sheet
  );
  stateRef.state.activeSheetId = activeSheet.id;

  normalizedRows.forEach((row) => {
    applyProjectStatsDelta(null, row);
    if (keepRowsVisible) {
      stateRef.stickyVisibleRowIds.add(asText(row.id));
    }
  });

  rebuildActiveSheetShadow();
  registerProjectMutation({ rerender: "all", preserveProjectTableViewport });
  return normalizedRows.length;
}

function formatManualInferredFieldLabel(field) {
  switch (field) {
    case "blNumber":
      return "BL";
    case "customsOffice":
      return "UC";
    default:
      return field;
  }
}

function addRowsFromManualDraft() {
  const draftSnapshot = createManualRowDraft(stateRef.manualRowDraft);
  const result = getManualRowsFromDraft(draftSnapshot);

  if (result.reason === "empty") {
    setStatus("Wypelnij dolny placeholder, aby dodac nowy wiersz.");
    focusManualDraftField("containerNumber", { select: false });
    return 0;
  }

  if (result.reason === "invalid-containers") {
    setStatus("Nie rozpoznano numerow kontenerow. Uzyj formatu ABCD1234567.");
    focusManualDraftField("containerNumber");
    return 0;
  }

  stateRef.manualRowDraft = buildPreservedManualDraft(draftSnapshot, result.inferredFields);
  const addedCount = appendRowsToActiveSheet(result.rows, {
    preserveProjectTableViewport: true,
    keepRowsVisible: true,
  });
  if (!addedCount) {
    return 0;
  }

  const inferredLabels = Object.keys(result.inferredFields || {})
    .filter((field) => asText(result.inferredFields[field]))
    .map((field) => formatManualInferredFieldLabel(field));
  const inferredInfo = inferredLabels.length
    ? ` Rozpoznano automatycznie: ${inferredLabels.join(", ")}.`
    : "";
  setStatus(
    addedCount > 1
      ? `Dodano ${addedCount} wierszy na podstawie wspolnych danych.${inferredInfo}`
      : `Dodano 1 wiersz recznie.${inferredInfo}`
  );
  focusManualDraftField("containerNumber");
  return addedCount;
}

function addRow() {
  const addedCount = appendRowsToActiveSheet([createRow()], {
    preserveProjectTableViewport: true,
    keepRowsVisible: true,
  });
  if (addedCount > 0) {
    setStatus("Dodano pusty wiersz.");
  }
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
  rebuildActiveSheetShadow();
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
    case "comparison-import":
      return importComparisonWorkbook();
    case "comparison-export":
      return exportComparisonRows();
    case "comparison-clear":
      return clearComparisonWorkbook();
    case "invoice-batch-open":
      return openInvoiceBatchModal();
    case "invoice-modal-close":
      return closeInvoiceBatchModal();
    case "invoice-preview-apply":
      return startInvoicePreview();
    case "invoice-preview-accept":
      return acceptInvoicePreview();
    case "invoice-preview-cancel":
      return cancelInvoicePreview();
    case "text-entry-confirm":
      return submitTextEntryModal();
    case "text-entry-cancel":
      return cancelTextEntryModal();
    case "clear-filters":
      return resetProjectFilters();
    case "export-visible":
      return exportVisibleRows();
    case "add-row":
      return addRow();
    case "add-sheet":
      return addSheet();
    case "add-draft-row":
      return addRowsFromManualDraft();
    case "delete-row":
      return deleteRow(payload.rowId);
    case "choose-db":
      return chooseDbPath();
    case "lookup-repair-t1":
      return repairLookupT1();
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

function isClickInsideProjectFilter(target) {
  return (
    target instanceof Element &&
    (Boolean(target.closest("#filter-vessel-date-list")) ||
      Boolean(target.closest("#filter-status-list")) ||
      Boolean(target.closest("#filter-remarks-list")) ||
      Boolean(target.closest(".filter-multiselect__panel--floating")))
  );
}

document.addEventListener("click", async (event) => {
  const isProjectFilterClick = isClickInsideProjectFilter(event.target);
  if (elements.filterVesselDateList.open && !isProjectFilterClick) {
    elements.filterVesselDateList.open = false;
  }
  if (elements.filterStatusList.open && !isProjectFilterClick) {
    elements.filterStatusList.open = false;
  }
  if (elements.filterRemarksList.open && !isProjectFilterClick) {
    elements.filterRemarksList.open = false;
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

    const options = ensureActiveSheetShadow().filterOptions;
    stateRef.vesselDateSelectedFilter =
      vesselDateSelectionNode.dataset.dateSelection === "all"
        ? options.vesselDateOptions.map((option) => option.value)
        : [];
    commitViewMutation({ clearFeedback: true });
    return;
  }

  const statusSelectionNode = event.target.closest("[data-status-selection]");
  if (statusSelectionNode) {
    if (stateRef.busyAction) {
      return;
    }

    const availableStatuses = Array.from(
      elements.filterStatusOptions.querySelectorAll("[data-status-value]")
    )
      .map((input) => asText(input.dataset.statusValue))
      .filter(Boolean);
    stateRef.statusFilters =
      statusSelectionNode.dataset.statusSelection === "all" ? availableStatuses : [];
    commitViewMutation({ clearFeedback: true });
    return;
  }

  const remarkSelectionNode = event.target.closest("[data-remark-selection]");
  if (remarkSelectionNode) {
    if (stateRef.busyAction) {
      return;
    }

    const availableRemarks = Array.from(
      elements.filterRemarksOptions.querySelectorAll("[data-remark-value]")
    )
      .map((input) => asText(input.dataset.remarkValue))
      .filter(Boolean);
    stateRef.remarksFilters =
      remarkSelectionNode.dataset.remarkSelection === "all" ? availableRemarks : [];
    commitViewMutation({ clearFeedback: true });
    return;
  }

  const comparisonSheetSelectionNode = event.target.closest("[data-comparison-sheet-selection]");
  if (comparisonSheetSelectionNode) {
    if (stateRef.busyAction) {
      return;
    }

    const availableSheets = Array.from(
      elements.comparisonSheetOptions.querySelectorAll("[data-comparison-sheet-value]")
    )
      .map((input) => asText(input.dataset.comparisonSheetValue))
      .filter(Boolean);
    stateRef.comparisonSelectedSheets =
      comparisonSheetSelectionNode.dataset.comparisonSheetSelection === "all"
        ? availableSheets
        : [];
    renderComparisonArea();
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

  const input = event.target instanceof HTMLInputElement ? event.target : null;
  if (!input) {
    return;
  }

  if (input.dataset.draftField) {
    updateManualRowDraftField(input.dataset.draftField, input.value);
    return;
  }

  const rowNode = input.closest("[data-row-id]");
  if (!rowNode || !input.dataset.field) {
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

elements.projectRows.addEventListener("keydown", (event) => {
  if (stateRef.busyAction || event.key !== "Enter") {
    return;
  }

  const input = event.target instanceof HTMLInputElement ? event.target : null;
  if (!input?.dataset.draftField) {
    return;
  }

  event.preventDefault();
  addRowsFromManualDraft();
});

elements.projectSearch.addEventListener("input", (event) => {
  stateRef.projectSearchTerm = asText(event.target.value);
  commitViewMutation({ clearFeedback: true });
});

elements.comparisonSearch.addEventListener("input", (event) => {
  stateRef.comparisonSearchTerm = normalizeContainerNumber(event.target.value);
  renderComparisonArea();
});

elements.comparisonStatusFilter.addEventListener("change", (event) => {
  stateRef.comparisonStatusFilter = normalizeComparisonStatusFilterValue(event.target.value);
  renderComparisonArea();
});

elements.comparisonStatusSort.addEventListener("change", (event) => {
  stateRef.comparisonStatusSort = normalizeComparisonStatusSortValue(event.target.value);
  renderComparisonArea();
});

elements.comparisonSheetOptions.addEventListener("change", (event) => {
  if (stateRef.busyAction) {
    return;
  }

  const checkbox = event.target.closest("[data-comparison-sheet-value]");
  if (!checkbox) {
    return;
  }

  const selectedSheets = new Set(stateRef.comparisonSelectedSheets.map((value) => asText(value)));
  const sheetName = asText(checkbox.dataset.comparisonSheetValue);
  if (!sheetName) {
    return;
  }

  if (checkbox.checked) {
    selectedSheets.add(sheetName);
  } else {
    selectedSheets.delete(sheetName);
  }

  stateRef.comparisonSelectedSheets = Array.from(selectedSheets).sort((left, right) =>
    left.localeCompare(right, "pl", { sensitivity: "base" })
  );
  renderComparisonArea();
});

elements.comparisonSheet.addEventListener("change", async () => {
  if (stateRef.busyAction) {
    return;
  }

  try {
    await applyComparisonSelection();
  } catch (error) {
    console.error(error);
    window.alert(error.message);
    setStatus(error.message);
  }
});

elements.comparisonColumn.addEventListener("change", async () => {
  if (stateRef.busyAction) {
    return;
  }

  try {
    await applyComparisonSelection();
  } catch (error) {
    console.error(error);
    window.alert(error.message);
    setStatus(error.message);
  }
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

elements.filterStatusOptions.addEventListener("change", (event) => {
  if (stateRef.busyAction) {
    return;
  }

  const checkbox = event.target.closest("[data-status-value]");
  if (!checkbox) {
    return;
  }

  const selectedStatuses = new Set(stateRef.statusFilters.map((value) => asText(value)));
  const statusValue = asText(checkbox.dataset.statusValue);
  if (!statusValue) {
    return;
  }

  if (checkbox.checked) {
    selectedStatuses.add(statusValue);
  } else {
    selectedStatuses.delete(statusValue);
  }

  stateRef.statusFilters = Array.from(selectedStatuses).sort((left, right) =>
    left.localeCompare(right, "pl", { sensitivity: "base" })
  );
  commitViewMutation({ clearFeedback: true });
});

elements.filterRemarksOptions.addEventListener("change", (event) => {
  if (stateRef.busyAction) {
    return;
  }

  const checkbox = event.target.closest("[data-remark-value]");
  if (!checkbox) {
    return;
  }

  const selectedRemarks = new Set(stateRef.remarksFilters.map((value) => asText(value)));
  const remarkValue = asText(checkbox.dataset.remarkValue);
  if (!remarkValue) {
    return;
  }

  if (checkbox.checked) {
    selectedRemarks.add(remarkValue);
  } else {
    selectedRemarks.delete(remarkValue);
  }

  stateRef.remarksFilters = Array.from(selectedRemarks).sort((left, right) =>
    left.localeCompare(right, "pl", { sensitivity: "base" })
  );
  commitViewMutation({ clearFeedback: true });
});

elements.filterComparison.addEventListener("change", (event) => {
  if (stateRef.busyAction) {
    return;
  }

  stateRef.comparisonFilter = normalizeComparisonStatusFilterValue(event.target.value);
  commitViewMutation({ clearFeedback: true });
});

elements.comparisonHighlight.addEventListener("change", (event) => {
  if (stateRef.busyAction) {
    return;
  }

  stateRef.comparisonHighlightEnabled = Boolean(event.target.checked);
  renderProjectData({ preserveProjectTableViewport: true });
});

elements.duplicateHighlight.addEventListener("change", (event) => {
  if (stateRef.busyAction) {
    return;
  }

  stateRef.duplicateHighlightEnabled = Boolean(event.target.checked);
  renderProjectData({ preserveProjectTableViewport: true });
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

elements.invoiceBatchInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") {
    return;
  }

  event.preventDefault();
  startInvoicePreview();
});

elements.textEntryInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") {
    return;
  }

  event.preventDefault();
  submitTextEntryModal();
});

window.addEventListener("keydown", async (event) => {
  if (event.key === "Escape" && !elements.textEntryModal.hidden) {
    event.preventDefault();
    cancelTextEntryModal();
    return;
  }

  if (event.key === "Escape" && !elements.invoiceBatchModal.hidden) {
    event.preventDefault();
    closeInvoiceBatchModal();
    return;
  }

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

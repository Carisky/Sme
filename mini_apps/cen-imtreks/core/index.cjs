const path = require("path");

const DEFAULT_PROJECT_APP_ID = "cen-imtreks";
const DEFAULT_SHEET_NAME = "Arkusz 1";
const DEFAULT_VESSEL_DATE_FILTER_MODE = "range";

function asText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function normalizeContainerNumber(value) {
  return asText(value).replace(/[\s\u00a0]+/g, "").toUpperCase();
}

function normalizeComparisonContainers(values = []) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [values])
        .map((value) => normalizeContainerNumber(value))
        .filter(Boolean)
    )
  ).sort((left, right) => left.localeCompare(right, "pl"));
}

function normalizeVesselDateFilterMode(value) {
  return asText(value).toLowerCase() === "list" ? "list" : DEFAULT_VESSEL_DATE_FILTER_MODE;
}

function normalizeHasT1FilterValue(value) {
  const normalized = asText(value).toLowerCase();
  return ["all", "with", "without"].includes(normalized) ? normalized : "all";
}

function normalizeMultiSelectFilterValues(values = [], normalizeValue = asText) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [values])
        .map((value) => normalizeValue(value))
        .filter(Boolean)
    )
  ).sort((left, right) => left.localeCompare(right, "pl", { sensitivity: "base" }));
}

function normalizeVesselDateSelection(values = []) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [values])
        .map((value) => asText(value))
        .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
    )
  ).sort((left, right) => left.localeCompare(right, "pl"));
}

function normalizeStatusFilterValue(value) {
  return asText(value).toLocaleUpperCase("pl");
}

function normalizeStatusFilterSelection(values = [], fallbackValue = "") {
  const sourceValues =
    Array.isArray(values) && values.length > 0
      ? values
      : asText(fallbackValue)
        ? [fallbackValue]
        : [];
  return normalizeMultiSelectFilterValues(sourceValues, normalizeStatusFilterValue);
}

function normalizeRemarkFilterValue(value) {
  return asText(value).toLocaleUpperCase("pl");
}

function normalizeRemarkFilterSelection(values = []) {
  return normalizeMultiSelectFilterValues(values, normalizeRemarkFilterValue);
}

function createProjectView(overrides = {}) {
  return {
    searchTerm: "",
    vesselDateMode: DEFAULT_VESSEL_DATE_FILTER_MODE,
    vesselDateFrom: "",
    vesselDateTo: "",
    vesselDateSelected: [],
    hasT1: "all",
    status: "",
    statuses: [],
    remarks: [],
    forceUpdate: false,
    ...overrides,
  };
}

function normalizeProjectView(view = {}) {
  const statuses = normalizeStatusFilterSelection(view.statuses, view.status);
  const legacyStatus = normalizeStatusFilterValue(view.status);
  return createProjectView({
    searchTerm: asText(view.searchTerm),
    vesselDateMode: normalizeVesselDateFilterMode(view.vesselDateMode),
    vesselDateFrom: asText(view.vesselDateFrom),
    vesselDateTo: asText(view.vesselDateTo),
    vesselDateSelected: normalizeVesselDateSelection(view.vesselDateSelected),
    hasT1: normalizeHasT1FilterValue(view.hasT1),
    status: legacyStatus || statuses[0] || "",
    statuses,
    remarks: normalizeRemarkFilterSelection(view.remarks),
    forceUpdate: Boolean(view.forceUpdate),
  });
}

function createId(prefix = "row") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createProjectRow(overrides = {}) {
  return {
    id: createId("row"),
    origin: "manual",
    sourceRowNumber: "",
    sequenceNumber: "",
    orderDate: "",
    vesselDate: "",
    folderName: "",
    containerCount: "",
    invoiceInfo: "",
    containerNumber: "",
    blNumber: "",
    customsOffice: "",
    status: "",
    vessel: "",
    t1Count: "",
    stop: "",
    t1: "",
    remarks: "",
    t1Nina: "",
    ...overrides,
  };
}

function normalizeProjectRow(row = {}) {
  const vesselDate = asText(row.vesselDate || row.vessel);
  return createProjectRow({
    id: asText(row.id) || createId("row"),
    origin: asText(row.origin) || "manual",
    sourceRowNumber: asText(row.sourceRowNumber),
    sequenceNumber: asText(row.sequenceNumber),
    orderDate: asText(row.orderDate),
    vesselDate,
    folderName: asText(row.folderName),
    containerCount: asText(row.containerCount),
    invoiceInfo: asText(row.invoiceInfo),
    containerNumber: normalizeContainerNumber(row.containerNumber),
    blNumber: asText(row.blNumber),
    customsOffice: asText(row.customsOffice),
    status: asText(row.status),
    vessel: asText(row.vessel),
    t1Count: asText(row.t1Count),
    stop: asText(row.stop),
    t1: asText(row.t1),
    remarks: asText(row.remarks),
    t1Nina: asText(row.t1Nina),
  });
}

function createProjectSheet(overrides = {}) {
  return {
    id: createId("sheet"),
    name: DEFAULT_SHEET_NAME,
    rows: [],
    ...overrides,
  };
}

function normalizeProjectSheet(sheet = {}) {
  return createProjectSheet({
    id: asText(sheet.id) || createId("sheet"),
    name: asText(sheet.name) || DEFAULT_SHEET_NAME,
    rows: Array.isArray(sheet.rows) ? sheet.rows.map(normalizeProjectRow) : [],
  });
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
  return createLookupRecord({
    containerNumber: normalizeContainerNumber(record.containerNumber),
    cen: asText(record.cen),
    tState: asText(record.tState),
    stop: asText(record.stop),
    source: asText(record.source) || "manual",
    createdAt: asText(record.createdAt),
    updatedAt: asText(record.updatedAt),
  });
}

function createInvoiceComparison(overrides = {}) {
  return {
    filePath: "",
    fileName: "",
    sheetName: "",
    columnKey: "",
    columnHeader: "",
    containers: [],
    importedAt: "",
    ...overrides,
  };
}

function normalizeInvoiceComparison(comparison = {}) {
  return createInvoiceComparison({
    filePath: asText(comparison.filePath),
    fileName: asText(comparison.fileName),
    sheetName: asText(comparison.sheetName),
    columnKey: asText(comparison.columnKey).toUpperCase(),
    columnHeader: asText(comparison.columnHeader),
    containers: normalizeComparisonContainers(comparison.containers),
    importedAt: asText(comparison.importedAt),
  });
}

function sanitizeFileName(value) {
  return (
    asText(value)
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || DEFAULT_PROJECT_APP_ID
  );
}

function buildSheetId(name) {
  return `sheet-${sanitizeFileName(name).toLocaleLowerCase("pl")}`;
}

function normalizeLegacyRows(input = {}) {
  if (!Array.isArray(input.rows) || input.rows.length === 0) {
    return [];
  }

  return [
    normalizeProjectSheet({
      id: asText(input.activeSheetId) || buildSheetId(DEFAULT_SHEET_NAME),
      name: DEFAULT_SHEET_NAME,
      rows: input.rows,
    }),
  ];
}

function normalizeState(input = {}) {
  const sheets = (
    Array.isArray(input.sheets) ? input.sheets : normalizeLegacyRows(input)
  ).map(normalizeProjectSheet);
  const activeSheetId = asText(input.activeSheetId);
  const resolvedActiveSheetId =
    (activeSheetId && sheets.some((sheet) => sheet.id === activeSheetId) && activeSheetId) ||
    sheets[0]?.id ||
    "";

  return {
    projectName: asText(input.projectName),
    fileName: asText(input.fileName),
    fileLocation: asText(input.fileLocation),
    sourceFilePath: asText(input.sourceFilePath),
    sourceFileName: asText(input.sourceFileName),
    dbPath: asText(input.dbPath),
    activeSheetId: resolvedActiveSheetId,
    view: normalizeProjectView(input.view),
    invoiceComparison: normalizeInvoiceComparison(input.invoiceComparison),
    sheets,
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
    activeSheetId: "",
    view: createProjectView(),
    invoiceComparison: createInvoiceComparison(),
    sheets: [],
    ...overrides,
  });
}

function flattenProjectRows(state = {}) {
  const normalized = normalizeState(state);
  return normalized.sheets.flatMap((sheet) => sheet.rows);
}

function countProjectRows(state = {}) {
  return flattenProjectRows(state).length;
}

function suggestProjectName(state = {}) {
  const normalized = normalizeState(state);
  const candidate =
    normalized.projectName ||
    normalized.sourceFileName ||
    normalized.fileName ||
    DEFAULT_PROJECT_APP_ID;
  return sanitizeFileName(path.parse(candidate).name || candidate);
}

module.exports = {
  DEFAULT_PROJECT_APP_ID,
  DEFAULT_SHEET_NAME,
  asText,
  buildSheetId,
  countProjectRows,
  createEmptyState,
  createLookupRecord,
  createInvoiceComparison,
  createProjectRow,
  createProjectSheet,
  flattenProjectRows,
  normalizeComparisonContainers,
  normalizeContainerNumber,
  normalizeInvoiceComparison,
  normalizeLookupRecord,
  normalizeProjectView,
  normalizeProjectRow,
  normalizeProjectSheet,
  normalizeState,
  sanitizeFileName,
  suggestProjectName,
};

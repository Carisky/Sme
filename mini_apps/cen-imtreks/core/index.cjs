const path = require("path");

const DEFAULT_PROJECT_APP_ID = "cen-imtreks";
const DEFAULT_SHEET_NAME = "Arkusz 1";

function asText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function normalizeContainerNumber(value) {
  return asText(value).replace(/[\s\u00a0]+/g, "").toUpperCase();
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
  return createProjectRow({
    id: asText(row.id) || createId("row"),
    origin: asText(row.origin) || "manual",
    sourceRowNumber: asText(row.sourceRowNumber),
    sequenceNumber: asText(row.sequenceNumber),
    orderDate: asText(row.orderDate),
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
  createProjectRow,
  createProjectSheet,
  flattenProjectRows,
  normalizeContainerNumber,
  normalizeLookupRecord,
  normalizeProjectRow,
  normalizeProjectSheet,
  normalizeState,
  sanitizeFileName,
  suggestProjectName,
};

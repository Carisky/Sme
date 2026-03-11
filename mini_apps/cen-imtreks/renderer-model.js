export const DEFAULT_SHEET_NAME = "Arkusz 1";

export function asText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

export function normalizeContainerNumber(value) {
  return asText(value).replace(/[\s\u00a0]+/g, "").toUpperCase();
}

export function createId(prefix = "row") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function buildProjectNameKey(value) {
  return asText(value)
    .toLocaleLowerCase("pl")
    .replace(/\s+/g, " ")
    .trim();
}

export function createRow(overrides = {}) {
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

export function normalizeRow(row = {}) {
  return {
    ...createRow(row),
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
  };
}

export function createSheet(overrides = {}) {
  return {
    id: createId("sheet"),
    name: DEFAULT_SHEET_NAME,
    rows: [],
    ...overrides,
  };
}

export function normalizeSheet(sheet = {}) {
  return {
    ...createSheet(sheet),
    id: asText(sheet.id) || createId("sheet"),
    name: asText(sheet.name) || DEFAULT_SHEET_NAME,
    rows: Array.isArray(sheet.rows) ? sheet.rows.map(normalizeRow) : [],
  };
}

export function normalizeState(input = {}) {
  let sheets = Array.isArray(input.sheets) ? input.sheets.map(normalizeSheet) : [];

  if (!sheets.length && Array.isArray(input.rows) && input.rows.length) {
    sheets = [
      normalizeSheet({
        name: DEFAULT_SHEET_NAME,
        rows: input.rows,
      }),
    ];
  }

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

export function createEmptyState(overrides = {}) {
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

export function flattenRows(state) {
  return normalizeState(state).sheets.flatMap((sheet) => sheet.rows);
}

export function getActiveSheet(state) {
  const normalized = normalizeState(state);
  return normalized.sheets.find((sheet) => sheet.id === normalized.activeSheetId) || normalized.sheets[0] || null;
}

export function createLookupRecord(overrides = {}) {
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

export function normalizeLookupRecord(record = {}) {
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

export function normalizeProjectOption(project = {}) {
  return {
    id: Number(project.id) || 0,
    projectName: asText(project.projectName),
    sourceFileName: asText(project.sourceFileName),
    rowCount: Number(project.rowCount) || 0,
    createdAt: asText(project.createdAt),
    updatedAt: asText(project.updatedAt),
  };
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function basename(filePath) {
  return asText(filePath).split(/[\\/]/).pop() || asText(filePath);
}

export function stripExtension(fileName) {
  const name = basename(fileName);
  const lastDotIndex = name.lastIndexOf(".");
  if (lastDotIndex <= 0) {
    return name;
  }

  return name.slice(0, lastDotIndex);
}

export function deriveProjectName(state = {}) {
  return (
    asText(state.projectName) ||
    asText(state.fileName) ||
    stripExtension(state.sourceFileName) ||
    "Nowy projekt"
  );
}

export function formatTimestamp(value) {
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

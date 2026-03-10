const path = require("path");

const DEFAULT_PROJECT_APP_ID = "wct-cen";

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
    internalRemarks: "",
    transportDocument: "",
    carrier: "",
    containerNumber: "",
    t1: "",
    preparedBy: "",
    sentBy: "",
    cen: "",
    stop: "",
    status: "",
    tState: "",
    annotation: "",
    loadType: "",
    sealNumber: "",
    etaPod: "",
    dischargedFromVessel: "",
    vessel: "",
    vesselVoyageNumber: "",
    trainNumberEu: "",
    dryPort: "",
    pin: "",
    commodityUa: "",
    hazardClass: "",
    hsCode: "",
    etsngCode: "",
    cargoGrossWeight: "",
    containerTareWeight: "",
    cargoGrossWeightAndTareWeight: "",
    packingType: "",
    numbersOfPackages: "",
    invoiceInfo: "",
    ...overrides,
  };
}

function normalizeProjectRow(row = {}) {
  return createProjectRow({
    id: asText(row.id) || createId("row"),
    origin: asText(row.origin) || "manual",
    sourceRowNumber: asText(row.sourceRowNumber),
    internalRemarks: asText(row.internalRemarks),
    transportDocument: asText(row.transportDocument),
    carrier: asText(row.carrier),
    containerNumber: normalizeContainerNumber(row.containerNumber),
    t1: asText(row.t1),
    preparedBy: asText(row.preparedBy),
    sentBy: asText(row.sentBy),
    cen: asText(row.cen),
    stop: asText(row.stop),
    status: asText(row.status),
    tState: asText(row.tState),
    annotation: asText(row.annotation),
    loadType: asText(row.loadType),
    sealNumber: asText(row.sealNumber),
    etaPod: asText(row.etaPod),
    dischargedFromVessel: asText(row.dischargedFromVessel),
    vessel: asText(row.vessel),
    vesselVoyageNumber: asText(row.vesselVoyageNumber),
    trainNumberEu: asText(row.trainNumberEu),
    dryPort: asText(row.dryPort),
    pin: asText(row.pin),
    commodityUa: asText(row.commodityUa),
    hazardClass: asText(row.hazardClass),
    hsCode: asText(row.hsCode),
    etsngCode: asText(row.etsngCode),
    cargoGrossWeight: asText(row.cargoGrossWeight),
    containerTareWeight: asText(row.containerTareWeight),
    cargoGrossWeightAndTareWeight: asText(row.cargoGrossWeightAndTareWeight),
    packingType: asText(row.packingType),
    numbersOfPackages: asText(row.numbersOfPackages),
    invoiceInfo: asText(row.invoiceInfo),
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
  const rows = Array.isArray(input.rows) ? input.rows.map(normalizeProjectRow) : [];

  return {
    projectName: asText(input.projectName),
    fileName: asText(input.fileName),
    fileLocation: asText(input.fileLocation),
    sourceFilePath: asText(input.sourceFilePath),
    sourceFileName: asText(input.sourceFileName),
    dbPath: asText(input.dbPath),
    rows,
  };
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
  asText,
  createEmptyState,
  createLookupRecord,
  createProjectRow,
  normalizeContainerNumber,
  normalizeLookupRecord,
  normalizeProjectRow,
  normalizeState,
  sanitizeFileName,
  suggestProjectName,
};

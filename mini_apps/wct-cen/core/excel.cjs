const path = require("path");
const XLSX = require("xlsx");
const {
  asText,
  createEmptyState,
  normalizeContainerNumber,
  normalizeProjectRow,
  normalizeState,
} = require("./index.cjs");

const HEADER_FIELD_MAP = {
  internalremarks: "internalRemarks",
  transportdocument: "transportDocument",
  carrier: "carrier",
  containernumber: "containerNumber",
  t1: "t1",
  ktoprzygotowal: "preparedBy",
  ktowyslal: "sentBy",
  stop: "stop",
  status: "status",
  adnotacja: "annotation",
  loadtype: "loadType",
  sealnumber: "sealNumber",
  etapod: "etaPod",
  dischargedfromvessel: "dischargedFromVessel",
  vessel: "vessel",
  vesselvoyagenumber: "vesselVoyageNumber",
  trainnumbereu: "trainNumberEu",
  dryport: "dryPort",
  pin: "pin",
  commodityua: "commodityUa",
  hazardclass: "hazardClass",
  hscode: "hsCode",
  etsngcode: "etsngCode",
  cargogrossweight: "cargoGrossWeight",
  containertareweight: "containerTareWeight",
  cargogrossweightandtareweight: "cargoGrossWeightAndTareWeight",
  packingtype: "packingType",
  numbersofpackages: "numbersOfPackages",
  invoicenumberanddate: "invoiceInfo",
};

function normalizeHeader(value) {
  return asText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function readWorkbook(filePath) {
  return XLSX.readFile(filePath, { cellFormula: false, cellNF: false, cellText: true });
}

function findHeaderRow(rows = []) {
  for (let index = 0; index < rows.length; index += 1) {
    const normalized = rows[index].map(normalizeHeader);
    if (normalized.includes("containernumber") && normalized.includes("transportdocument")) {
      return index;
    }
  }

  return -1;
}

function buildImportedRows(rows, headerRowIndex) {
  const headers = rows[headerRowIndex].map(normalizeHeader);
  const importedRows = [];

  for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const source = rows[rowIndex];
    const candidate = {};

    headers.forEach((header, columnIndex) => {
      const field = HEADER_FIELD_MAP[header];
      if (!field) {
        return;
      }

      candidate[field] = asText(source[columnIndex]);
    });

    const normalized = normalizeProjectRow({
      ...candidate,
      id: `import-${rowIndex + 1}-${normalizeContainerNumber(candidate.containerNumber) || rowIndex}`,
      origin: "imported",
      sourceRowNumber: String(rowIndex + 1),
    });

    if (!normalized.containerNumber && !normalized.transportDocument && !normalized.invoiceInfo) {
      continue;
    }

    importedRows.push(normalized);
  }

  return importedRows;
}

function mergeImportedRows(previousState, importedRows) {
  const previous = normalizeState(previousState);
  const previousByContainer = new Map();

  previous.rows.forEach((row) => {
    if (row.containerNumber) {
      previousByContainer.set(row.containerNumber, row);
    }
  });

  const merged = importedRows.map((row) => {
    const existing = previousByContainer.get(row.containerNumber);
    if (!existing) {
      return row;
    }

    return normalizeProjectRow({
      ...row,
      id: existing.id || row.id,
      cen: existing.cen || row.cen,
      tState: existing.tState || row.tState,
      stop: row.stop || existing.stop,
      status: row.status || existing.status,
    });
  });

  const manualOnly = previous.rows.filter((row) => row.origin === "manual");
  return [...merged, ...manualOnly];
}

function importWctCenWorkbook(filePath, previousState = createEmptyState()) {
  const workbook = readWorkbook(filePath);
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error("Excel nie zawiera zadnych arkuszy.");
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
  const headerRowIndex = findHeaderRow(rows);

  if (headerRowIndex < 0) {
    throw new Error(
      "Nie znaleziono naglowka arkusza WCT CEN. Oczekiwano m.in. kolumn Container Number i Transport Document."
    );
  }

  const importedRows = buildImportedRows(rows, headerRowIndex);
  const nextState = normalizeState({
    ...previousState,
    projectName: previousState.projectName || path.parse(filePath).name,
    fileName: path.parse(filePath).name,
    fileLocation: path.dirname(filePath),
    sourceFilePath: filePath,
    sourceFileName: path.basename(filePath),
    rows: mergeImportedRows(previousState, importedRows),
  });

  return nextState;
}

module.exports = {
  importWctCenWorkbook,
};

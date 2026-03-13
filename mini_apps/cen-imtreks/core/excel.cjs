const path = require("path");
const XLSX = require("xlsx");
const {
  asText,
  buildSheetId,
  createEmptyState,
  normalizeComparisonContainers,
  normalizeInvoiceComparison,
  normalizeContainerNumber,
  normalizeProjectRow,
  normalizeProjectSheet,
  normalizeState,
} = require("./index.cjs");

const HEADER_FIELD_MAP = {
  ordernumber: "sequenceNumber",
  datazlecenia: "orderDate",
  nazwafolderu: "folderName",
  ilosckontenerow: "containerCount",
  fakturaukrtransagent: "invoiceInfo",
  kontener: "containerNumber",
  nrbl: "blNumber",
  bl: "blNumber",
  ucotwarcia: "customsOffice",
  status: "status",
  datastatku: "vesselDate",
  statek: "vesselDate",
  ilosct1: "t1Count",
  stop: "stop",
  t1: "t1",
  uwagi: "remarks",
  t1nina: "t1Nina",
};

const REQUIRED_HEADERS = ["datazlecenia", "kontener", "ucotwarcia"];
const DEFAULT_EXPORT_SHEET_NAME = "Wiersze robocze";
const DEFAULT_COMPARISON_EXPORT_SHEET_NAME = "Do faktur";
const EXPORT_COLUMNS = [
  { label: "Lp.", field: "sequenceNumber", width: 8 },
  { label: "Data zlecenia", field: "orderDate", width: 14 },
  { label: "Data statku", field: "vesselDate", width: 14 },
  { label: "Folder", field: "folderName", width: 20 },
  { label: "Container", field: "containerNumber", width: 16 },
  { label: "BL", field: "blNumber", width: 14 },
  { label: "UC", field: "customsOffice", width: 16 },
  { label: "Status", field: "status", width: 14 },
  { label: "Stop", field: "stop", width: 12 },
  { label: "T1", field: "t1", width: 22 },
  { label: "Faktura", field: "invoiceInfo", width: 18 },
  { label: "Uwagi", field: "remarks", width: 20 },
  { label: "Src", field: "source", width: 10 },
];
const COMPARISON_EXPORT_COLUMNS = [
  { label: "Container", field: "containerNumber", width: 16 },
  { label: "Status", field: "statusLabel", width: 14 },
  { label: "W bazie", field: "hasComparisonMatch", width: 10 },
  { label: "Wierszy projektu", field: "rowCount", width: 16 },
  { label: "Arkusze", field: "sheetLabel", width: 28 },
];
const COMPARISON_CONTAINER_PATTERN = /\b[A-Z]{4}[\s\u00a0-]*\d{7}\b/g;

function normalizeHeader(value) {
  const source = asText(value)
    .replace(/\u2116/gu, " nr ")
    .replace(/[\u0142\u0141]/g, (character) => (character === "\u0142" ? "l" : "L"));

  if (/^\s*(nr|lp)\s*$/i.test(source)) {
    return "ordernumber";
  }

  return source
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function extractComparisonContainersFromValue(value) {
  const raw = asText(value).toUpperCase();
  if (!raw) {
    return [];
  }

  const result = [];
  const seen = new Set();
  const register = (candidate) => {
    const normalized = normalizeContainerNumber(candidate);
    if (!/^[A-Z]{4}\d{7}$/.test(normalized) || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    result.push(normalized);
  };

  register(raw);
  (raw.match(COMPARISON_CONTAINER_PATTERN) || []).forEach((candidate) => register(candidate));
  return result;
}

function getWorksheetRows(worksheet) {
  return XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
}

function findFirstPopulatedRowIndex(rows = []) {
  for (let index = 0; index < rows.length; index += 1) {
    if (Array.isArray(rows[index]) && rows[index].some((value) => asText(value))) {
      return index;
    }
  }

  return -1;
}

function getWorksheetLastColumnIndex(worksheet, rows = []) {
  if (worksheet?.["!ref"]) {
    try {
      return XLSX.utils.decode_range(worksheet["!ref"]).e.c;
    } catch {
      // Ignore malformed range metadata and fall back to row inspection.
    }
  }

  return rows.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length - 1 : -1), -1);
}

function columnHasData(rows = [], columnIndex, startRowIndex = 0) {
  for (let rowIndex = startRowIndex; rowIndex < rows.length; rowIndex += 1) {
    if (asText(rows[rowIndex]?.[columnIndex])) {
      return true;
    }
  }

  return false;
}

function buildComparisonColumns(worksheet, rows = [], headerRowIndex = 0) {
  const lastColumnIndex = getWorksheetLastColumnIndex(worksheet, rows);
  if (lastColumnIndex < 0) {
    return [];
  }

  const headerRow = Array.isArray(rows[headerRowIndex]) ? rows[headerRowIndex] : [];
  const columns = [];

  for (let columnIndex = 0; columnIndex <= lastColumnIndex; columnIndex += 1) {
    const key = XLSX.utils.encode_col(columnIndex);
    const header = asText(headerRow[columnIndex]) || `Kolumna ${key}`;
    if (!asText(headerRow[columnIndex]) && !columnHasData(rows, columnIndex, headerRowIndex + 1)) {
      continue;
    }

    columns.push({
      key,
      index: columnIndex,
      header,
    });
  }

  return columns;
}

function guessComparisonColumnKey(columns = []) {
  const preferredColumn = columns.find((column) => {
    const normalized = normalizeHeader(column.header);
    return /kontener|container|cntr|containernumber|nrkontenera|nrfkontenera/.test(normalized);
  });

  return preferredColumn?.key || columns[0]?.key || "";
}

function createComparisonSheetDescriptor(worksheet, rows, sheetName) {
  const headerRowIndex = findFirstPopulatedRowIndex(rows);
  const columns = headerRowIndex >= 0 ? buildComparisonColumns(worksheet, rows, headerRowIndex) : [];
  return {
    name: sheetName,
    headerRowIndex,
    columns,
    suggestedColumnKey: guessComparisonColumnKey(columns),
  };
}

function selectComparisonSheet(sheets = [], preferredSheetName = "") {
  return (
    sheets.find((sheet) => sheet.name === asText(preferredSheetName)) ||
    sheets.find((sheet) => sheet.columns.length > 0) ||
    sheets[0] ||
    null
  );
}

function selectComparisonColumn(columns = [], preferredColumnKey = "") {
  return (
    columns.find((column) => column.key === asText(preferredColumnKey).toUpperCase()) ||
    columns.find((column) => column.key === guessComparisonColumnKey(columns)) ||
    columns[0] ||
    null
  );
}

function stripHeaderRowIndex(sheet = {}) {
  return {
    name: asText(sheet.name),
    suggestedColumnKey: asText(sheet.suggestedColumnKey),
    columns: Array.isArray(sheet.columns)
      ? sheet.columns.map((column) => ({
          key: asText(column.key).toUpperCase(),
          index: Number(column.index) || 0,
          header: asText(column.header),
        }))
      : [],
  };
}

function readWorkbook(filePath) {
  return XLSX.readFile(filePath, { cellFormula: false, cellNF: false, cellText: true });
}

function formatExcelDate(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed?.y && parsed?.m && parsed?.d) {
      const day = String(parsed.d).padStart(2, "0");
      const month = String(parsed.m).padStart(2, "0");
      return `${day}.${month}.${parsed.y}`;
    }
  }

  return asText(value);
}

function formatFieldValue(field, value) {
  if (field === "orderDate" || field === "vesselDate") {
    return formatExcelDate(value);
  }

  return asText(value);
}

function findHeaderRow(rows = []) {
  for (let index = 0; index < rows.length; index += 1) {
    const normalizedHeaders = rows[index].map(normalizeHeader);
    if (REQUIRED_HEADERS.every((header) => normalizedHeaders.includes(header))) {
      return index;
    }
  }

  return -1;
}

function sanitizeWorkbookSheetName(value) {
  const candidate = asText(value)
    .replace(/[\\/*?:]/g, " ")
    .replace(/\[/g, " ")
    .replace(/\]/g, " ")
    .replace(/[\u0000-\u001f]/g, " ")
    .trim();
  return (candidate || DEFAULT_EXPORT_SHEET_NAME).slice(0, 31);
}

function buildExportRowCells(row = {}) {
  return EXPORT_COLUMNS.map((column) => {
    if (column.field === "source") {
      return asText(row.sourceRowNumber) || asText(row.origin) || "-";
    }

    return asText(row[column.field]);
  });
}

function buildComparisonExportRowCells(row = {}) {
  return COMPARISON_EXPORT_COLUMNS.map((column) => {
    if (column.field === "hasComparisonMatch") {
      return row.hasComparisonMatch ? "TAK" : "NIE";
    }

    if (column.field === "rowCount") {
      return Number(row.rowCount) || 0;
    }

    return asText(row[column.field]);
  });
}

function buildRowImportKey(row = {}) {
  const sourceRowNumber = asText(row.sourceRowNumber);
  const containerNumber = normalizeContainerNumber(row.containerNumber);
  const invoiceInfo = asText(row.invoiceInfo);
  return `${sourceRowNumber}|${containerNumber}|${invoiceInfo}`;
}

function buildImportedRows(sheetName, rows, headerRowIndex) {
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

      candidate[field] = formatFieldValue(field, source[columnIndex]);
    });

    const normalized = normalizeProjectRow({
      ...candidate,
      id: `import-${buildSheetId(sheetName)}-${rowIndex + 1}-${normalizeContainerNumber(candidate.containerNumber) || rowIndex}`,
      origin: "imported",
      sourceRowNumber: String(rowIndex + 1),
    });

    if (
      !normalized.containerNumber &&
      !normalized.folderName &&
      !normalized.invoiceInfo &&
      !normalized.customsOffice
    ) {
      continue;
    }

    importedRows.push(normalized);
  }

  return importedRows;
}

function mergeImportedRows(previousSheet, importedRows) {
  const previousRows = Array.isArray(previousSheet?.rows)
    ? previousSheet.rows.map(normalizeProjectRow)
    : [];
  const existingImportedByKey = new Map();
  const existingImportedByContainer = new Map();

  previousRows.forEach((row) => {
    if (row.origin === "manual") {
      return;
    }

    const importKey = buildRowImportKey(row);
    if (importKey) {
      existingImportedByKey.set(importKey, row);
    }

    if (row.containerNumber && !existingImportedByContainer.has(row.containerNumber)) {
      existingImportedByContainer.set(row.containerNumber, row);
    }
  });

  const mergedImported = importedRows.map((row) => {
    const existing =
      existingImportedByKey.get(buildRowImportKey(row)) ||
      existingImportedByContainer.get(row.containerNumber);
    if (!existing) {
      return row;
    }

    return normalizeProjectRow({
      ...row,
      id: existing.id || row.id,
      vesselDate: row.vesselDate || existing.vesselDate,
      status: row.status || existing.status,
      stop: row.stop || existing.stop,
      t1: existing.t1 || row.t1,
      remarks: row.remarks || existing.remarks,
      t1Nina: row.t1Nina || existing.t1Nina,
    });
  });

  const manualOnly = previousRows.filter((row) => row.origin === "manual");
  return [...mergedImported, ...manualOnly];
}

function inspectCenImtreksComparisonWorkbook(filePath) {
  const workbook = readWorkbook(filePath);
  if (!Array.isArray(workbook.SheetNames) || workbook.SheetNames.length === 0) {
    throw new Error("Excel nie zawiera zadnych arkuszy.");
  }

  const sheets = workbook.SheetNames.map((sheetName) =>
    createComparisonSheetDescriptor(
      workbook.Sheets[sheetName],
      getWorksheetRows(workbook.Sheets[sheetName]),
      sheetName
    )
  );
  const selectedSheet = selectComparisonSheet(sheets);
  const selectedColumn = selectComparisonColumn(
    selectedSheet?.columns || [],
    selectedSheet?.suggestedColumnKey
  );

  return {
    filePath,
    fileName: path.basename(filePath),
    sheets: sheets.map(stripHeaderRowIndex),
    selectedSheetName: asText(selectedSheet?.name),
    selectedColumnKey: asText(selectedColumn?.key).toUpperCase(),
    selectedColumnHeader: asText(selectedColumn?.header),
  };
}

function extractCenImtreksComparisonSelection(filePath, preferredSheetName = "", preferredColumnKey = "") {
  const workbook = readWorkbook(filePath);
  if (!Array.isArray(workbook.SheetNames) || workbook.SheetNames.length === 0) {
    throw new Error("Excel nie zawiera zadnych arkuszy.");
  }

  const sheets = workbook.SheetNames.map((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    return createComparisonSheetDescriptor(worksheet, getWorksheetRows(worksheet), sheetName);
  });
  const selectedSheet = selectComparisonSheet(sheets, preferredSheetName);
  if (!selectedSheet) {
    throw new Error("Nie znaleziono arkusza do porownania.");
  }

  const selectedColumn = selectComparisonColumn(selectedSheet.columns, preferredColumnKey);
  if (!selectedColumn) {
    throw new Error(`Arkusz "${selectedSheet.name}" nie zawiera zadnych kolumn do porownania.`);
  }

  const worksheet = workbook.Sheets[selectedSheet.name];
  const rows = getWorksheetRows(worksheet);
  const containers = normalizeComparisonContainers(
    rows
      .slice(selectedSheet.headerRowIndex + 1)
      .flatMap((row) => extractComparisonContainersFromValue(row?.[selectedColumn.index]))
  );

  return {
    filePath,
    fileName: path.basename(filePath),
    workbook: {
      filePath,
      fileName: path.basename(filePath),
      sheets: sheets.map(stripHeaderRowIndex),
      selectedSheetName: asText(selectedSheet.name),
      selectedColumnKey: asText(selectedColumn.key).toUpperCase(),
      selectedColumnHeader: asText(selectedColumn.header),
    },
    comparison: normalizeInvoiceComparison({
      filePath,
      fileName: path.basename(filePath),
      sheetName: selectedSheet.name,
      columnKey: selectedColumn.key,
      columnHeader: selectedColumn.header,
      containers,
      importedAt: new Date().toISOString(),
    }),
    uniqueCount: containers.length,
  };
}

function importCenImtreksWorkbook(filePath, previousState = createEmptyState()) {
  const workbook = readWorkbook(filePath);
  if (!Array.isArray(workbook.SheetNames) || workbook.SheetNames.length === 0) {
    throw new Error("Excel nie zawiera zadnych arkuszy.");
  }

  const previous = normalizeState(previousState);
  const previousByName = new Map(previous.sheets.map((sheet) => [sheet.name, sheet]));
  const importedSheets = [];

  workbook.SheetNames.forEach((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
    const headerRowIndex = findHeaderRow(rows);
    if (headerRowIndex < 0) {
      return;
    }

    const previousSheet = previousByName.get(sheetName);
    const importedRows = buildImportedRows(sheetName, rows, headerRowIndex);
    importedSheets.push(
      normalizeProjectSheet({
        id: previousSheet?.id || buildSheetId(sheetName),
        name: sheetName,
        rows: mergeImportedRows(previousSheet, importedRows),
      })
    );
  });

  if (importedSheets.length === 0) {
    throw new Error(
      "Nie znaleziono arkuszy IMTREKS z kolumnami Data zlecenia, Kontener i UC otwarcia."
    );
  }

  previous.sheets.forEach((sheet) => {
    if (!importedSheets.some((candidate) => candidate.name === sheet.name)) {
      importedSheets.push(sheet);
    }
  });

  const currentActiveName = previous.sheets.find((sheet) => sheet.id === previous.activeSheetId)?.name;
  const nextActiveSheet =
    importedSheets.find((sheet) => sheet.name === currentActiveName) || importedSheets[0];

  return normalizeState({
    ...previousState,
    projectName: previous.projectName || path.parse(filePath).name,
    fileName: path.parse(filePath).name,
    fileLocation: path.dirname(filePath),
    sourceFilePath: filePath,
    sourceFileName: path.basename(filePath),
    activeSheetId: nextActiveSheet?.id || "",
    sheets: importedSheets,
  });
}

function exportCenImtreksRowsWorkbook(filePath, rows = [], options = {}) {
  const normalizedRows = Array.isArray(rows) ? rows.map(normalizeProjectRow) : [];
  const sheetName = sanitizeWorkbookSheetName(options.sheetName);
  const worksheet = XLSX.utils.aoa_to_sheet([
    EXPORT_COLUMNS.map((column) => column.label),
    ...normalizedRows.map((row) => buildExportRowCells(row)),
  ]);
  worksheet["!cols"] = EXPORT_COLUMNS.map((column) => ({ wch: column.width }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, filePath);

  return {
    filePath,
    rowCount: normalizedRows.length,
    sheetName,
  };
}

function exportCenImtreksComparisonWorkbook(filePath, rows = [], options = {}) {
  const normalizedRows = Array.isArray(rows)
    ? rows.map((row) => ({
        containerNumber: normalizeContainerNumber(row.containerNumber),
        statusLabel: asText(row.statusLabel),
        hasComparisonMatch: Boolean(row.hasComparisonMatch),
        rowCount: Number(row.rowCount) || 0,
        sheetLabel: asText(row.sheetLabel),
      }))
    : [];
  const sheetName = sanitizeWorkbookSheetName(
    options.sheetName || DEFAULT_COMPARISON_EXPORT_SHEET_NAME
  );
  const worksheet = XLSX.utils.aoa_to_sheet([
    COMPARISON_EXPORT_COLUMNS.map((column) => column.label),
    ...normalizedRows.map((row) => buildComparisonExportRowCells(row)),
  ]);
  worksheet["!cols"] = COMPARISON_EXPORT_COLUMNS.map((column) => ({ wch: column.width }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, filePath);

  return {
    filePath,
    rowCount: normalizedRows.length,
    sheetName,
  };
}

module.exports = {
  exportCenImtreksComparisonWorkbook,
  exportCenImtreksRowsWorkbook,
  extractCenImtreksComparisonSelection,
  importCenImtreksWorkbook,
  inspectCenImtreksComparisonWorkbook,
};

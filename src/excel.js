const path = require("path");
const XLSX = require("xlsx");
const {
  createEmptyState,
  formatDateForUi,
  formatEditableNumber,
  normalizeState,
  parseNumber,
} = require("./core");
const { MAX_LINES } = require("./constants");

function readWorkbook(filePath) {
  return XLSX.readFile(filePath, { cellFormula: true });
}

function getCellText(sheet, address) {
  const cell = sheet?.[address];
  if (!cell) {
    return "";
  }

  if (cell.w !== undefined && cell.w !== null) {
    return String(cell.w).trim();
  }

  if (cell.v !== undefined && cell.v !== null) {
    return String(cell.v).trim();
  }

  return "";
}

function getCellNumber(sheet, address) {
  const cell = sheet?.[address];
  if (!cell) {
    return null;
  }

  return parseNumber(cell.v ?? cell.w);
}

function normalizeSheetName(name) {
  return String(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function findSheet(workbook, requiredTokens) {
  const match = workbook.SheetNames.find((name) => {
    const normalized = normalizeSheetName(name);
    return requiredTokens.every((token) => normalized.includes(token));
  });

  if (!match) {
    return null;
  }

  return workbook.Sheets[match];
}

function extractValueAfterColon(text) {
  const raw = String(text || "");
  const pieces = raw.split(":");
  return pieces.length > 1 ? pieces.slice(1).join(":").trim() : raw.trim();
}

function readTemplateWorkbook(filePath) {
  const workbook = readWorkbook(filePath);
  const dataSheet = workbook.Sheets.Dane;
  const printSheet = workbook.Sheets.Wydruk;

  if (!dataSheet || !printSheet) {
    throw new Error("Szablon Trade_N.xls nie zawiera arkuszy Dane i Wydruk.");
  }

  const state = createEmptyState({
    fileLocation: getCellText(dataSheet, "C5"),
    fileName:
      getCellText(dataSheet, "E3") ||
      getCellText(dataSheet, "C6").replace(/\.xls$/i, ""),
    eurRate: formatEditableNumber(getCellNumber(dataSheet, "J2"), 4),
    ownNumber: getCellText(dataSheet, "M2"),
    entryNumber: getCellText(dataSheet, "J3"),
    entryDate: getCellText(dataSheet, "J4"),
    documentType: getCellText(dataSheet, "J6") || "MRN",
    documentNumber: getCellText(dataSheet, "J5"),
    oreKind: getCellText(dataSheet, "M3"),
    oreType: getCellText(dataSheet, "M4"),
    originCountry: getCellText(dataSheet, "M5"),
    transportCost: formatEditableNumber(getCellNumber(dataSheet, "E30"), 5),
    letter: {
      printCity: getCellText(printSheet, "H2") || "Bytom",
      printDate: formatDateForUi(),
      senderCompany: getCellText(printSheet, "A4"),
      senderAddressLine1: getCellText(printSheet, "A5"),
      senderAddressLine2: getCellText(printSheet, "A6"),
      recipientOffice: getCellText(printSheet, "F4"),
      recipientAddressLine1: getCellText(printSheet, "F5"),
      recipientAddressLine2: getCellText(printSheet, "F6"),
      uniqueDocumentNumber: extractValueAfterColon(getCellText(printSheet, "A73")),
      signatory: getCellText(printSheet, "E77").replace(/^Z poważaniem\s*/i, ""),
    },
  });

  state.originalRows = Array.from({ length: MAX_LINES }, (_, index) => {
    const rowNumber = 12 + index;
    return {
      invoiceNumber: getCellText(dataSheet, `B${rowNumber}`),
      weightTons: formatEditableNumber(getCellNumber(dataSheet, `C${rowNumber}`), 3),
      priceEur: formatEditableNumber(getCellNumber(dataSheet, `D${rowNumber}`), 5),
      valueEur: formatEditableNumber(getCellNumber(dataSheet, `E${rowNumber}`), 5),
    };
  });

  state.correctionRows = Array.from({ length: MAX_LINES }, (_, index) => {
    const rowNumber = 12 + index;
    const original = state.originalRows[index];

    return {
      invoiceNumber: getCellText(dataSheet, `I${rowNumber}`) || original.invoiceNumber,
      weightTons:
        formatEditableNumber(getCellNumber(dataSheet, `J${rowNumber}`), 3) ||
        original.weightTons,
      priceEur:
        formatEditableNumber(getCellNumber(dataSheet, `K${rowNumber}`), 5) ||
        original.priceEur,
      noteNumber: getCellText(dataSheet, `M${rowNumber}`),
      noteDate: getCellText(dataSheet, `N${rowNumber}`),
    };
  });

  return normalizeState(state);
}

function mergeCorrectionRows(previousState, importedOriginalRows) {
  const currentState = normalizeState(previousState);

  return Array.from({ length: MAX_LINES }, (_, index) => {
    const previousOriginal = currentState.originalRows[index];
    const nextOriginal = importedOriginalRows[index];
    const correction = currentState.correctionRows[index];

    const currentInvoice = correction.invoiceNumber || previousOriginal.invoiceNumber;
    const currentWeight = correction.weightTons || previousOriginal.weightTons;
    const currentPrice = correction.priceEur || previousOriginal.priceEur;

    const hasUserEdit =
      currentInvoice !== previousOriginal.invoiceNumber ||
      currentWeight !== previousOriginal.weightTons ||
      currentPrice !== previousOriginal.priceEur ||
      Boolean(correction.noteNumber) ||
      Boolean(correction.noteDate);

    if (!hasUserEdit) {
      return {
        ...correction,
        invoiceNumber: nextOriginal.invoiceNumber,
        weightTons: nextOriginal.weightTons,
        priceEur: nextOriginal.priceEur,
      };
    }

    return correction;
  });
}

function importSourceWorkbook(filePath, previousState = createEmptyState()) {
  const workbook = readWorkbook(filePath);
  const valuesSheet =
    findSheet(workbook, ["oswiad", "wartos"]) ||
    findSheet(workbook, ["wartos"]);
  const transportSheet =
    findSheet(workbook, ["koszt", "transport"]) ||
    findSheet(workbook, ["transport"]);

  if (!valuesSheet) {
    throw new Error(
      "Nie znaleziono arkusza z wartościami (np. Oświad. wartości)."
    );
  }

  if (!transportSheet) {
    throw new Error(
      "Nie znaleziono arkusza kosztów transportu (np. Koszt transportu)."
    );
  }

  const originalRows = Array.from({ length: MAX_LINES }, (_, index) => {
    const sourceRow = 28 + index * 2;
    return {
      invoiceNumber: getCellText(valuesSheet, `C${sourceRow}`),
      weightTons: formatEditableNumber(getCellNumber(valuesSheet, `D${sourceRow}`), 3),
      priceEur: formatEditableNumber(getCellNumber(valuesSheet, `E${sourceRow}`), 5),
      valueEur:
        formatEditableNumber(getCellNumber(valuesSheet, `F${sourceRow}`), 5) ||
        "",
    };
  });

  const nextState = normalizeState({
    ...previousState,
    fileLocation: path.dirname(filePath),
    fileName: path.parse(filePath).name,
    transportCost: formatEditableNumber(getCellNumber(transportSheet, "G32"), 5),
    originalRows,
  });

  nextState.correctionRows = mergeCorrectionRows(previousState, originalRows);
  return normalizeState(nextState);
}

module.exports = {
  importSourceWorkbook,
  readTemplateWorkbook,
};

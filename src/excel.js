const path = require("path");
const XLSX = require("xlsx");
const {
  createEmptyState,
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

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getCellTextByOffset(sheet, address, rowOffset, columnOffset) {
  const origin = XLSX.utils.decode_cell(address);
  const nextRow = origin.r + rowOffset;
  const nextColumn = origin.c + columnOffset;

  if (nextRow < 0 || nextColumn < 0) {
    return "";
  }

  return getCellText(
    sheet,
    XLSX.utils.encode_cell({
      r: nextRow,
      c: nextColumn,
    })
  );
}

function findValueAroundLabel(sheet, labelMatcher, offsets) {
  const addresses = Object.keys(sheet || {}).filter((key) => !key.startsWith("!"));

  for (const address of addresses) {
    const text = getCellText(sheet, address);
    if (!text || !labelMatcher.test(normalizeText(text))) {
      continue;
    }

    for (const [rowOffset, columnOffset] of offsets) {
      const candidate = getCellTextByOffset(sheet, address, rowOffset, columnOffset);
      if (candidate) {
        return candidate;
      }
    }
  }

  return "";
}

function detectControlNumber(workbook) {
  const controlSheet = findSheet(workbook, ["ster"]);
  if (!controlSheet) {
    return "";
  }

  return (
    findValueAroundLabel(controlSheet, /numer\s+kontroln/, [
      [0, -1],
      [0, 1],
    ]) || getCellText(controlSheet, "A1")
  );
}

function detectOwnNumber(workbook, transportSheet) {
  const detectedFromTransport = findValueAroundLabel(
    transportSheet,
    /koszt\s+transportu\s+nr/,
    [
      [0, 1],
      [0, 2],
      [0, 3],
      [0, 4],
    ]
  );
  if (detectedFromTransport) {
    return detectedFromTransport;
  }

  const invoiceSheet = findSheet(workbook, ["faktura"]);
  return getCellText(invoiceSheet, "A1");
}

function detectOreKind(valuesSheet) {
  return (
    findValueAroundLabel(valuesSheet, /wybrany/, [
      [0, 1],
      [0, 2],
    ]) || getCellText(valuesSheet, "L6")
  );
}

function inferOreTypeFromOreKind(oreKind, fallbackOreType = "") {
  const normalized = normalizeText(oreKind);
  if (!normalized) {
    return fallbackOreType;
  }

  if (
    normalized.includes("pellet") ||
    normalized.includes("grudki") ||
    normalized.includes("agloruda") ||
    normalized.includes("sew-gok") ||
    normalized.includes("sewgok") ||
    normalized.includes("sev-gok") ||
    normalized.includes("sevgok")
  ) {
    return "aglomerowana";
  }

  if (
    normalized.includes("in-gok") ||
    normalized.includes("ingok") ||
    normalized.includes("ingulec") ||
    normalized.includes("koncentrat")
  ) {
    return "nieaglomerowana";
  }

  return fallbackOreType;
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
    throw new Error("Nie znaleziono arkusza z wartosciami (np. Oswiad. wartosci).");
  }

  if (!transportSheet) {
    throw new Error("Nie znaleziono arkusza kosztow transportu (np. Koszt transportu).");
  }

  const importedOreKind = detectOreKind(valuesSheet);
  const importedOwnNumber = detectOwnNumber(workbook, transportSheet);
  const importedControlNumber = detectControlNumber(workbook);

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
    eurRate: previousState.eurRate,
    ownNumber: importedOwnNumber || previousState.ownNumber,
    controlNumber: importedControlNumber || previousState.controlNumber,
    oreKind: importedOreKind || previousState.oreKind,
    oreType: inferOreTypeFromOreKind(importedOreKind, previousState.oreType),
    transportCost: formatEditableNumber(getCellNumber(transportSheet, "G32"), 5),
    originalRows,
  });

  nextState.correctionRows = mergeCorrectionRows(previousState, originalRows);
  return normalizeState(nextState);
}

module.exports = {
  importSourceWorkbook,
};

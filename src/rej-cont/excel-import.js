const fs = require("node:fs");
const path = require("node:path");
const XLSX = require("xlsx");
const {
  asText,
  isValidContainerNumber,
  normalizeContainerNumber,
  parseImportedTerminalName,
} = require("./store");

function columnIndexToLetter(index) {
  let current = Number(index);
  if (!Number.isInteger(current) || current < 0) {
    return "";
  }

  let result = "";
  while (current >= 0) {
    result = String.fromCharCode((current % 26) + 65) + result;
    current = Math.floor(current / 26) - 1;
  }

  return result;
}

function parseSelectedColumnIndex(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const text = asText(value);
  if (!text) {
    return null;
  }

  const parsed = Number(text);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function readWorkbook(filePath) {
  const normalizedPath = asText(filePath);
  if (!normalizedPath) {
    throw new Error("Sciezka pliku importu jest wymagana.");
  }

  if (!fs.existsSync(normalizedPath)) {
    throw new Error(`Nie znaleziono pliku importu: ${normalizedPath}`);
  }

  return XLSX.readFile(normalizedPath, {
    cellFormula: false,
    cellNF: false,
    cellText: true,
  });
}

function readSheetRows(workbook, sheetName) {
  const normalizedSheetName = asText(sheetName);
  const targetName =
    normalizedSheetName && workbook.Sheets[normalizedSheetName]
      ? normalizedSheetName
      : workbook.SheetNames.find((name) => workbook.Sheets[name]);

  if (!targetName) {
    throw new Error("Wybrany plik Excel nie zawiera zadnych arkuszy.");
  }

  const worksheet = workbook.Sheets[targetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

  return {
    sheetName: targetName,
    rows: Array.isArray(rows) ? rows : [],
  };
}

function summarizeColumn(rows, columnIndex) {
  const samples = [];
  const seenSamples = new Set();
  const seenContainers = new Set();
  let nonEmptyCount = 0;
  let containerLikeCount = 0;
  let duplicateContainerCount = 0;
  let terminalLikeCount = 0;

  rows.forEach((row) => {
    const rawValue = asText(Array.isArray(row) ? row[columnIndex] : "");
    if (!rawValue) {
      return;
    }

    nonEmptyCount += 1;
    if (samples.length < 4 && !seenSamples.has(rawValue)) {
      seenSamples.add(rawValue);
      samples.push(rawValue);
    }

    if (parseImportedTerminalName(rawValue)) {
      terminalLikeCount += 1;
    }

    const normalized = normalizeContainerNumber(rawValue);
    if (!isValidContainerNumber(normalized)) {
      return;
    }

    containerLikeCount += 1;
    if (seenContainers.has(normalized)) {
      duplicateContainerCount += 1;
      return;
    }

    seenContainers.add(normalized);
  });

  return {
    nonEmptyCount,
    containerLikeCount,
    uniqueContainerCount: seenContainers.size,
    duplicateContainerCount,
    terminalLikeCount,
    sampleValues: samples,
  };
}

function chooseBestColumn(columns) {
  if (!Array.isArray(columns) || columns.length === 0) {
    return null;
  }

  return columns.reduce((best, candidate) => {
    if (!best) {
      return candidate;
    }

    if (candidate.uniqueContainerCount !== best.uniqueContainerCount) {
      return candidate.uniqueContainerCount > best.uniqueContainerCount ? candidate : best;
    }

    if (candidate.containerLikeCount !== best.containerLikeCount) {
      return candidate.containerLikeCount > best.containerLikeCount ? candidate : best;
    }

    if (candidate.nonEmptyCount !== best.nonEmptyCount) {
      return candidate.nonEmptyCount > best.nonEmptyCount ? candidate : best;
    }

    return candidate.index < best.index ? candidate : best;
  }, null);
}

function chooseBestTerminalColumn(columns) {
  if (!Array.isArray(columns) || columns.length === 0) {
    return null;
  }

  const headerMatchColumns = columns.filter((column) => /\bterm/i.test(asText(column.header)));
  const candidates = headerMatchColumns.length > 0 ? headerMatchColumns : columns;

  return candidates.reduce((best, candidate) => {
    if (!best) {
      return candidate;
    }

    if (candidate.terminalLikeCount !== best.terminalLikeCount) {
      return candidate.terminalLikeCount > best.terminalLikeCount ? candidate : best;
    }

    if (candidate.nonEmptyCount !== best.nonEmptyCount) {
      return candidate.nonEmptyCount > best.nonEmptyCount ? candidate : best;
    }

    return candidate.index < best.index ? candidate : best;
  }, null);
}

function inspectImportWorkbook(filePath) {
  const workbook = readWorkbook(filePath);
  const sheets = workbook.SheetNames.map((sheetName) => {
    const { rows } = readSheetRows(workbook, sheetName);
    const rowCount = rows.length;
    const columnCount = rows.reduce(
      (max, row) => Math.max(max, Array.isArray(row) ? row.length : 0),
      0
    );
    const columns = Array.from({ length: columnCount }, (_entry, columnIndex) => {
      const summary = summarizeColumn(rows, columnIndex);
      const header = asText(Array.isArray(rows[0]) ? rows[0][columnIndex] : "");
      const letter = columnIndexToLetter(columnIndex);

      return {
        index: columnIndex,
        letter,
        header,
        label: header ? `${letter} - ${header}` : `Kolumna ${letter}`,
        nonEmptyCount: summary.nonEmptyCount,
        containerLikeCount: summary.containerLikeCount,
        uniqueContainerCount: summary.uniqueContainerCount,
        duplicateContainerCount: summary.duplicateContainerCount,
        terminalLikeCount: summary.terminalLikeCount,
        sampleValues: summary.sampleValues,
      };
    });

    const defaultColumn = chooseBestColumn(columns);
    const defaultTerminalColumn = chooseBestTerminalColumn(columns);

    return {
      name: sheetName,
      rowCount,
      columnCount,
      defaultColumnIndex: defaultColumn ? defaultColumn.index : 0,
      defaultTerminalColumnIndex:
        defaultTerminalColumn && defaultTerminalColumn.terminalLikeCount > 0
          ? defaultTerminalColumn.index
          : null,
      columns,
    };
  }).filter((sheet) => sheet.columnCount > 0);

  if (sheets.length === 0) {
    throw new Error("Wybrany plik Excel nie zawiera danych do importu.");
  }

  const selectedSheet = sheets.reduce((best, candidate) => {
    const candidateColumn = candidate.columns.find(
      (column) => column.index === candidate.defaultColumnIndex
    ) || null;
    const bestColumn = best?.columns.find(
      (column) => column.index === best.defaultColumnIndex
    ) || null;

    if (!best || !bestColumn) {
      return candidate;
    }

    if (!candidateColumn) {
      return best;
    }

    if (candidateColumn.uniqueContainerCount !== bestColumn.uniqueContainerCount) {
      return candidateColumn.uniqueContainerCount > bestColumn.uniqueContainerCount
        ? candidate
        : best;
    }

    if (candidateColumn.containerLikeCount !== bestColumn.containerLikeCount) {
      return candidateColumn.containerLikeCount > bestColumn.containerLikeCount
        ? candidate
        : best;
    }

    return candidate.rowCount > best.rowCount ? candidate : best;
  }, null);

  return {
    filePath,
    fileName: path.basename(asText(filePath)),
    selectedSheetName: selectedSheet?.name || sheets[0].name,
    sheets,
  };
}

function extractContainerNumbersFromWorkbook(filePath, selection = {}) {
  const workbook = readWorkbook(filePath);
  const { rows, sheetName } = readSheetRows(workbook, selection.sheetName);
  const columnIndex = parseSelectedColumnIndex(selection.columnIndex);
  const terminalColumnIndex = parseSelectedColumnIndex(selection.terminalColumnIndex);
  const hasTerminalColumn = terminalColumnIndex !== null;

  if (columnIndex === null) {
    throw new Error("Wybierz kolumne z numerami kontenerow.");
  }

  const header = asText(Array.isArray(rows[0]) ? rows[0][columnIndex] : "");
  const terminalHeader = hasTerminalColumn
    ? asText(Array.isArray(rows[0]) ? rows[0][terminalColumnIndex] : "")
    : "";
  const containers = [];
  const seen = new Set();
  const containerIndexByNumber = new Map();
  let nonEmptyCount = 0;
  let matchedCount = 0;
  let duplicateCount = 0;
  let invalidCount = 0;
  let terminalResolvedCount = 0;

  rows.forEach((row) => {
    const rawValue = asText(Array.isArray(row) ? row[columnIndex] : "");
    if (!rawValue) {
      return;
    }

    nonEmptyCount += 1;
    const normalized = normalizeContainerNumber(rawValue);
    if (!isValidContainerNumber(normalized)) {
      invalidCount += 1;
      return;
    }

    const parsedTerminalName = hasTerminalColumn
      ? parseImportedTerminalName(Array.isArray(row) ? row[terminalColumnIndex] : "")
      : null;
    matchedCount += 1;
    if (seen.has(normalized)) {
      duplicateCount += 1;
      const existingIndex = containerIndexByNumber.get(normalized);
      if (
        Number.isInteger(existingIndex) &&
        parsedTerminalName &&
        !containers[existingIndex].terminalName
      ) {
        containers[existingIndex].terminalName = parsedTerminalName;
        terminalResolvedCount += 1;
      }
      return;
    }

    seen.add(normalized);
    containerIndexByNumber.set(normalized, containers.length);
    containers.push({
      number: normalized,
      terminalName: parsedTerminalName,
    });
    if (parsedTerminalName) {
      terminalResolvedCount += 1;
    }
  });

  return {
    filePath,
    fileName: path.basename(asText(filePath)),
    sheetName,
    columnIndex,
    columnLetter: columnIndexToLetter(columnIndex),
    header,
    terminalColumnIndex: hasTerminalColumn ? terminalColumnIndex : null,
    terminalColumnLetter: hasTerminalColumn ? columnIndexToLetter(terminalColumnIndex) : "",
    terminalHeader,
    totalRows: rows.length,
    nonEmptyCount,
    matchedCount,
    duplicateCount,
    invalidCount,
    uniqueCount: containers.length,
    terminalResolvedCount,
    numbers: containers.map((container) => container.number),
    containers,
  };
}

module.exports = {
  columnIndexToLetter,
  extractContainerNumbersFromWorkbook,
  inspectImportWorkbook,
};

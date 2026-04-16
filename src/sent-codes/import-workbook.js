const path = require("path");
const XLSX = require("xlsx");
const { extractSentCodesFromCell } = require("./normalize");

function asText(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function toColumnLetter(index) {
  let value = Number(index) + 1;
  let columnLabel = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    columnLabel = String.fromCharCode(65 + remainder) + columnLabel;
    value = Math.floor((value - 1) / 26);
  }

  return columnLabel;
}

function pickDefaultColumn(columns = []) {
  const hsColumn = columns.find((column) => column.normalizedName === "hs code");
  if (hsColumn) {
    return hsColumn.index;
  }

  const bestByCodeLike = columns
    .filter((column) => Number(column.codeLikeCount) > 0)
    .sort((left, right) => {
      if (left.codeLikeCount !== right.codeLikeCount) {
        return right.codeLikeCount - left.codeLikeCount;
      }

      return right.nonEmptyCount - left.nonEmptyCount;
    })[0];

  return bestByCodeLike ? bestByCodeLike.index : columns[0]?.index ?? 0;
}

function buildSheetInfo(sheetName, rows = []) {
  const headerRow = Array.isArray(rows[0]) ? rows[0] : [];
  const contentRows = rows.slice(1);
  const columnCount = Math.max(
    headerRow.length,
    contentRows.reduce((maxValue, row) => Math.max(maxValue, Array.isArray(row) ? row.length : 0), 0)
  );

  const columns = [];
  for (let index = 0; index < columnCount; index += 1) {
    const rawHeader = asText(headerRow[index]);
    const letter = toColumnLetter(index);
    const name = rawHeader || `Kolumna ${letter}`;
    const sampleValues = [];
    let nonEmptyCount = 0;
    let codeLikeCount = 0;

    for (const row of contentRows) {
      const rawValue = Array.isArray(row) ? row[index] : "";
      const normalizedValue = asText(rawValue);
      if (!normalizedValue) {
        continue;
      }

      nonEmptyCount += 1;
      if (sampleValues.length < 8) {
        sampleValues.push(normalizedValue);
      }

      if (extractSentCodesFromCell(normalizedValue).length > 0) {
        codeLikeCount += 1;
      }
    }

    columns.push({
      index,
      letter,
      name,
      normalizedName: name.toLowerCase(),
      label: `${letter} - ${name}`,
      nonEmptyCount,
      codeLikeCount,
      sampleValues,
    });
  }

  return {
    name: asText(sheetName),
    rowCount: contentRows.length,
    columnCount,
    defaultColumnIndex: pickDefaultColumn(columns),
    columns,
  };
}

function readWorkbookRows(filePath) {
  const workbook = XLSX.readFile(filePath, {
    raw: false,
    cellDates: false,
    dense: false,
  });

  const sheets = workbook.SheetNames.map((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: "",
      blankrows: false,
      raw: false,
    });

    return buildSheetInfo(sheetName, rows);
  }).filter((sheet) => sheet.columnCount > 0);

  return {
    filePath,
    fileName: path.basename(filePath),
    sheets,
  };
}

function inspectSentCodesWorkbook(filePath) {
  const normalizedPath = path.resolve(String(filePath || "").trim());
  const workbookInfo = readWorkbookRows(normalizedPath);

  if (!Array.isArray(workbookInfo.sheets) || workbookInfo.sheets.length === 0) {
    throw new Error("Workbook does not contain readable sheets.");
  }

  return workbookInfo;
}

function resolveSheetSelection(workbookInfo, sheetName) {
  const normalizedName = asText(sheetName);
  if (!normalizedName) {
    return workbookInfo.sheets[0];
  }

  return (
    workbookInfo.sheets.find((sheet) => sheet.name === normalizedName) || workbookInfo.sheets[0]
  );
}

function importSentCodesFromWorkbook(filePath, options = {}) {
  const workbookInfo = inspectSentCodesWorkbook(filePath);
  const selectedSheet = resolveSheetSelection(workbookInfo, options.sheetName);
  const selectedColumnIndex = Number.isInteger(Number(options.columnIndex))
    ? Number(options.columnIndex)
    : selectedSheet.defaultColumnIndex;
  const selectedColumn =
    selectedSheet.columns.find((column) => column.index === selectedColumnIndex) ||
    selectedSheet.columns[0];

  if (!selectedColumn) {
    throw new Error("Selected column is not available in the workbook.");
  }

  const workbook = XLSX.readFile(workbookInfo.filePath, {
    raw: false,
    cellDates: false,
    dense: false,
  });
  const worksheet = workbook.Sheets[selectedSheet.name];
  if (!worksheet) {
    throw new Error(`Sheet "${selectedSheet.name}" is not available.`);
  }

  const rows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: "",
    blankrows: false,
    raw: false,
  });

  const contentRows = rows.slice(1);
  const codeCounter = new Map();
  let nonEmptyRowCount = 0;
  let invalidCellCount = 0;
  let totalExtracted = 0;

  contentRows.forEach((row, rowIndex) => {
    const sourceValue = Array.isArray(row) ? row[selectedColumn.index] : "";
    const normalizedValue = asText(sourceValue);
    if (!normalizedValue) {
      return;
    }

    nonEmptyRowCount += 1;
    const extractedCodes = extractSentCodesFromCell(normalizedValue);
    if (extractedCodes.length === 0) {
      invalidCellCount += 1;
      return;
    }

    totalExtracted += extractedCodes.length;
    extractedCodes.forEach((code) => {
      codeCounter.set(code, (codeCounter.get(code) || 0) + 1);
    });
  });

  const entries = Array.from(codeCounter.entries())
    .map(([code, occurrenceCount]) => ({
      code,
      occurrenceCount,
    }))
    .sort((left, right) => left.code.localeCompare(right.code, "pl"));

  return {
    filePath: workbookInfo.filePath,
    fileName: workbookInfo.fileName,
    sheetName: selectedSheet.name,
    columnIndex: selectedColumn.index,
    columnName: selectedColumn.name,
    sourceRowCount: contentRows.length,
    nonEmptyRowCount,
    invalidCellCount,
    totalExtracted,
    uniqueCount: entries.length,
    entries,
    workbook: workbookInfo,
    selected: {
      sheetName: selectedSheet.name,
      columnIndex: selectedColumn.index,
    },
  };
}

module.exports = {
  importSentCodesFromWorkbook,
  inspectSentCodesWorkbook,
};


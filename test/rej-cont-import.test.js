const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const XLSX = require("xlsx");
const {
  columnIndexToLetter,
  extractContainerNumbersFromWorkbook,
  inspectImportWorkbook,
} = require("../src/rej-cont/excel-import");

async function main() {
  assert.equal(columnIndexToLetter(0), "A");
  assert.equal(columnIndexToLetter(25), "Z");
  assert.equal(columnIndexToLetter(26), "AA");

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "sme-rej-import-"));

  try {
    const workbook = XLSX.utils.book_new();
    const mainSheet = XLSX.utils.aoa_to_sheet([
      ["Lp", "Container", "Terminal", "Opis"],
      [1, "MSCU1234567", "GDANSK DCT", "ok"],
      [2, "OOLU9911223", "GDYNYA BCT", "ok"],
      [3, "bad value", "GDANSK DCT", "skip"],
      [4, "MSCU1234567", "", "duplicate"],
      [5, "", "GCT", "empty"],
      [6, "TCNU1122334", "GCT", "ok"],
    ]);
    const extraSheet = XLSX.utils.aoa_to_sheet([
      ["Ref", "Komentarz"],
      ["A-1", "brak numerow"],
    ]);

    XLSX.utils.book_append_sheet(workbook, mainSheet, "Import");
    XLSX.utils.book_append_sheet(workbook, extraSheet, "Uwagi");

    const filePath = path.join(tempDir, "containers.xlsx");
    XLSX.writeFile(workbook, filePath);

    const inspection = inspectImportWorkbook(filePath);
    assert.equal(inspection.fileName, "containers.xlsx");
    assert.equal(inspection.selectedSheetName, "Import");
    assert.equal(inspection.sheets.length, 2);

    const selectedSheet = inspection.sheets.find((sheet) => sheet.name === "Import");
    assert.ok(selectedSheet);
    assert.equal(selectedSheet.defaultColumnIndex, 1);
    assert.equal(selectedSheet.defaultTerminalColumnIndex, 2);

    const selectedColumn = selectedSheet.columns.find((column) => column.index === 1);
    assert.ok(selectedColumn);
    assert.equal(selectedColumn.letter, "B");
    assert.equal(selectedColumn.uniqueContainerCount, 3);
    assert.equal(selectedColumn.duplicateContainerCount, 1);
    assert.deepEqual(selectedColumn.sampleValues.slice(0, 3), [
      "Container",
      "MSCU1234567",
      "OOLU9911223",
    ]);

    const terminalColumn = selectedSheet.columns.find((column) => column.index === 2);
    assert.ok(terminalColumn);
    assert.equal(terminalColumn.letter, "C");
    assert.equal(terminalColumn.terminalLikeCount, 5);

    const extracted = extractContainerNumbersFromWorkbook(filePath, {
      sheetName: "Import",
      columnIndex: 1,
      terminalColumnIndex: 2,
    });

    assert.equal(extracted.sheetName, "Import");
    assert.equal(extracted.columnLetter, "B");
    assert.equal(extracted.header, "Container");
    assert.equal(extracted.terminalColumnLetter, "C");
    assert.equal(extracted.terminalHeader, "Terminal");
    assert.equal(extracted.totalRows, 7);
    assert.equal(extracted.nonEmptyCount, 6);
    assert.equal(extracted.matchedCount, 4);
    assert.equal(extracted.duplicateCount, 1);
    assert.equal(extracted.invalidCount, 2);
    assert.equal(extracted.uniqueCount, 3);
    assert.equal(extracted.terminalResolvedCount, 3);
    assert.deepEqual(extracted.numbers, [
      "MSCU1234567",
      "OOLU9911223",
      "TCNU1122334",
    ]);
    assert.deepEqual(extracted.containers, [
      { number: "MSCU1234567", terminalName: "DCT" },
      { number: "OOLU9911223", terminalName: "BCT" },
      { number: "TCNU1122334", terminalName: "GCT" },
    ]);

    console.log("rej-cont import tests passed");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

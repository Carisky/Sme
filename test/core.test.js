const assert = require("node:assert/strict");
const path = require("node:path");
const { computeSnapshot, normalizeState, parseNumber } = require("../src/core");
const { importSourceWorkbook } = require("../src/excel");

assert.equal(parseNumber("380,206.02550"), 380206.0255);
assert.equal(parseNumber("4,2628"), 4.2628);
assert.equal(parseNumber("1 598 271"), 1598271);
assert.equal(parseNumber("25-04-2025"), null);
assert.equal(
  normalizeState({ documentNumber: "25PL40101D00013JR3" }).customsOfficeCode,
  "40101"
);
assert.equal(
  normalizeState({ documentNumber: "25PL33102A00093VR1" }).customsOfficeCode,
  "30102"
);

const state = normalizeState({
  fileName: "import",
  ownNumber: "001",
  eurRate: "4.2628",
  documentNumber: "25PL40101D00013JR3",
  oreType: "aglomerowana",
  transportCost: "0",
  originalRows: [
    {
      invoiceNumber: "1825000474",
      weightTons: "100.000",
      priceEur: "3802.06025",
      valueEur: "380206.02500",
    },
  ],
  correctionRows: [
    {
      invoiceNumber: "1825000474",
      weightTons: "100.000",
      priceEur: "3749.34550",
      noteNumber: "2225001351",
      noteDate: "25.04.2025",
    },
  ],
});
const snapshot = computeSnapshot(state);

assert.equal(snapshot.meta.cnCode, "26011200");
assert.equal(snapshot.meta.noteCount, 1);
assert.equal(snapshot.meta.noteNumbersList, "2225001351");
assert.equal(snapshot.meta.invoiceNumbersList, "1825000474");
assert.equal(snapshot.totals.formatted.originalEur, "380 206,03");
assert.equal(snapshot.totals.formatted.correctedEurRounded, "374 934,55");
assert.equal(snapshot.totals.formatted.vatDifference, "5 169");
assert.equal(snapshot.validation.errors.length, 0);
assert.equal(snapshot.meta.caseNumber, "TSL/001");
assert.equal(snapshot.meta.subjectReference, "25PL40101D00013JR3");

const importedState = importSourceWorkbook(
  path.join(__dirname, "..", "samples", "import_files", "3-H-2022.xls"),
  normalizeState({ eurRate: "4.2628" })
);
assert.equal(importedState.eurRate, "4.2628");
assert.equal(importedState.controlNumber, "38072");
assert.equal(importedState.ownNumber, "3/H/2022");
assert.equal(importedState.oreKind, "Koncentrat In-GOK");
assert.equal(importedState.oreType, "nieaglomerowana");
assert.equal(importedState.transportCost, "144910.54000");
assert.equal(importedState.originalRows[0].invoiceNumber, "94517971");
assert.equal(importedState.originalRows[0].weightTons, "905.700");
assert.equal(importedState.originalRows[0].priceEur, "131.50140");

const importedSnapshot = computeSnapshot(importedState);
assert.equal(importedSnapshot.meta.cnCode, "26011100");
assert.equal(importedSnapshot.meta.caseNumber, "TSL/3/H/2022");
assert.equal(importedSnapshot.meta.subjectReference, "18PL");

const blankSnapshot = computeSnapshot(normalizeState({}));
assert.equal(blankSnapshot.meta.caseNumber, "TSL/");
assert.equal(blankSnapshot.meta.subjectReference, "18PL");

console.log("core smoke tests passed");

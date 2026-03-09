const assert = require("node:assert/strict");
const { computeSnapshot, normalizeState, parseNumber } = require("../src/core");

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

console.log("core smoke tests passed");
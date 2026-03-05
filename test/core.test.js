const assert = require("node:assert/strict");
const path = require("path");
const { computeSnapshot, parseNumber } = require("../src/core");
const { readTemplateWorkbook } = require("../src/excel");

assert.equal(parseNumber("380,206.02550"), 380206.0255);
assert.equal(parseNumber("4,2628"), 4.2628);
assert.equal(parseNumber("1 598 271"), 1598271);
assert.equal(parseNumber("25-04-2025"), null);

const state = readTemplateWorkbook(
  path.join(__dirname, "..", "samples", "files", "Trade_N.xls")
);
const snapshot = computeSnapshot(state);

assert.equal(snapshot.meta.cnCode, "26011200");
assert.equal(snapshot.meta.noteCount, 1);
assert.equal(snapshot.meta.noteNumbersList, "2225001351");
assert.equal(snapshot.meta.invoiceNumbersList, "1825000474");
assert.equal(snapshot.totals.formatted.originalEur, "380 206,03");
assert.equal(snapshot.totals.formatted.correctedEurRounded, "374 934,55");
assert.equal(snapshot.totals.formatted.vatDifference, "5 168");
assert.equal(snapshot.validation.errors.length, 0);

console.log("core smoke tests passed");

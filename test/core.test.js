const assert = require("node:assert/strict");
const path = require("node:path");
const {
  APP_SETTINGS_PATHS,
  buildStateFromAppSettings,
  computeSnapshot,
  extractAppSettings,
  normalizeAppSettings,
  normalizeState,
  parseNumber,
} = require("../src/core");
const { importSourceWorkbook } = require("../src/excel");
const {
  buildInstallerFileName,
  buildReleaseTag,
  compareVersions,
  createReleaseManifest,
  parseGitHubRepository,
} = require("../src/update-common");
const {
  DEFAULT_PROJECT_APP_ID,
  PROJECT_SCHEMA_VERSION,
  createProjectPayload,
  parseProjectPayload,
} = require("../src/project-payload");

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

const normalizedAppSettings = normalizeAppSettings({
  fileLocation: "  C:\\SME  ",
  "print.savePdfAfterPrint": 1,
  "print.pdfOutputDir": " C:\\PDF ",
  "letter.signatory": " Anna Kowalska ",
  ignoredKey: "value",
});
assert.equal(normalizedAppSettings.fileLocation, "C:\\SME");
assert.equal(normalizedAppSettings["print.savePdfAfterPrint"], true);
assert.equal(normalizedAppSettings["print.pdfOutputDir"], "C:\\PDF");
assert.equal(normalizedAppSettings["letter.signatory"], "Anna Kowalska");
assert.equal("ignoredKey" in normalizedAppSettings, false);

const appSettingsState = buildStateFromAppSettings({
  fileLocation: "C:\\SME",
  "print.savePdfAfterPrint": true,
  "letter.signatory": "Anna Kowalska",
});
assert.equal(appSettingsState.fileLocation, "C:\\SME");
assert.equal(appSettingsState.print.savePdfAfterPrint, true);
assert.equal(appSettingsState.letter.signatory, "Anna Kowalska");

const extractedAppSettings = extractAppSettings(
  normalizeState({
    fileLocation: "C:\\Workspace",
    print: {
      savePdfAfterPrint: true,
      pdfOutputDir: "C:\\PDF",
    },
    letter: {
      signatory: "Jan Nowak",
    },
  })
);
assert.equal(extractedAppSettings.fileLocation, "C:\\Workspace");
assert.equal(extractedAppSettings["print.savePdfAfterPrint"], true);
assert.equal(extractedAppSettings["print.pdfOutputDir"], "C:\\PDF");
assert.equal(extractedAppSettings["letter.signatory"], "Jan Nowak");
assert.deepEqual(
  Object.keys(extractedAppSettings).sort(),
  [...APP_SETTINGS_PATHS].sort()
);

assert.equal(compareVersions("1.0.10", "1.0.2"), 1);
assert.equal(compareVersions("1.0.0", "1.0.0"), 0);
assert.equal(compareVersions("1.0.0", "1.0.1"), -1);
assert.equal(buildInstallerFileName("SME", "1.2.3"), "SME-Setup-1.2.3.exe");
assert.equal(buildReleaseTag("1.2.3"), "v1.2.3");
assert.deepEqual(parseGitHubRepository("https://github.com/Carisky/Sme.git"), {
  provider: "github",
  owner: "Carisky",
  repo: "Sme",
});

const releaseManifest = createReleaseManifest({
  packageJson: {
    name: "sme",
    productName: "SME",
    version: "1.0.0",
    repository: {
      type: "git",
      url: "https://github.com/Carisky/Sme.git",
    },
  },
  version: "1.0.0",
  installerName: "SME-Setup-1.0.0.exe",
  installerSha256: "ABC123",
  installerSize: 42,
  appSha256: "DEF456",
  sourceCommit: "deadbeef",
});
assert.equal(releaseManifest.version, "1.0.0");
assert.equal(releaseManifest.releaseTag, "v1.0.0");
assert.equal(releaseManifest.repository.owner, "Carisky");
assert.equal(releaseManifest.assets.installer.name, "SME-Setup-1.0.0.exe");
assert.equal(releaseManifest.assets.installer.sha256, "abc123");
assert.equal(releaseManifest.appSha256, "def456");

const projectPayload = createProjectPayload(
  normalizeState({
    ownNumber: "42",
  }),
  {
    bookmarks: {
      items: ["A", "B"],
    },
  }
);
assert.equal(projectPayload.version, PROJECT_SCHEMA_VERSION);
assert.equal(projectPayload.appId, "sme");
assert.equal(projectPayload.state.ownNumber, "42");
assert.deepEqual(projectPayload.modules.bookmarks.items, ["A", "B"]);

const parsedProjectPayload = parseProjectPayload(projectPayload);
assert.equal(parsedProjectPayload.appId, "sme");
assert.equal(parsedProjectPayload.state.ownNumber, "42");
assert.deepEqual(parsedProjectPayload.modules.bookmarks.items, ["A", "B"]);

const parsedLegacyPayload = parseProjectPayload({
  ownNumber: "legacy",
});
assert.equal(parsedLegacyPayload.appId, DEFAULT_PROJECT_APP_ID);
assert.equal(parsedLegacyPayload.state.ownNumber, "legacy");
assert.deepEqual(parsedLegacyPayload.modules, {});

console.log("core smoke tests passed");

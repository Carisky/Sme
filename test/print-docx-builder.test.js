const assert = require("node:assert/strict");
const CFB = require("cfb");
const { normalizeState } = require("../src/core");
const {
  buildPrintDocxBuffer,
  createDocxFileName,
} = require("../src/main/services/print-docx-builder");

(async () => {
  const state = normalizeState({
    ownNumber: "001",
    eurRate: "4.2628",
    entryDate: "25.04.2025",
    documentNumber: "25PL40101D00013JR3",
    oreType: "aglomerowana",
    oreKind: "Grudki SewGok",
    originCountry: "Ukrainy",
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

  const fileName = createDocxFileName(state);
  assert.match(fileName, /^001-.*\.docx$/);

  const buffer = await buildPrintDocxBuffer(state, {
    customsOffices: [
      {
        code: "40101",
        name: "Podkarpacki Urzad Celno-Skarbowy",
        addressLine1: "ul. Zaciszna 4",
        addressLine2: "37-700 Przemysl",
      },
    ],
  });

  assert.ok(Buffer.isBuffer(buffer));
  assert.ok(buffer.length > 0);

  const container = CFB.read(buffer, { type: "buffer" });
  const documentEntry = CFB.find(container, "/word/document.xml");
  assert.ok(documentEntry);
  const documentXml = Buffer.from(documentEntry.content).toString("utf8");

  assert.match(documentXml, /TSL\/001/);
  assert.match(documentXml, /25PL40101D00013JR3/);
  assert.match(documentXml, /PODKARPACKI URZAD CELNO-SKARBOWY/);
  assert.match(documentXml, /2225001351/);
  assert.ok((documentXml.match(/w:type="page"/g) || []).length >= 1);

  assert.ok(CFB.find(container, "/word/media/doc_header.png"));
  assert.ok(CFB.find(container, "/word/media/doc_footer.png"));

  console.log("print docx builder tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

const path = require("path");

const MAX_LINES = 10;

const DOCUMENT_PRESETS = {
  MRN: {
    label: "Numer MRN:",
    suggestedNumber: "18PL",
    printPrefix: "",
  },
  "331030/00/": {
    label: "Numer OGL:",
    suggestedNumber: "012345/2013",
    printPrefix: "OGL ",
  },
  "331020/00/": {
    label: "Numer OGL:",
    suggestedNumber: "012345/2013",
    printPrefix: "OGL ",
  },
  "": {
    label: "???",
    suggestedNumber: "",
    printPrefix: "",
  },
};

const ORE_TYPES = ["aglomerowana", "nieaglomerowana"];

const STATIC_HINTS = [
  "Aby wypełnić tabelę WINNO BYĆ, najpierw wpisz numer i datę korekty, a dopiero potem zmień cenę lub numer faktury.",
  "Do wydruku przechodzą tylko linie z tabeli WINNO BYĆ, które mają komplet danych: numer noty i datę.",
];

const DEFAULT_LETTER = {
  printCity: "Bytom",
  senderCompany: "TSL Silesia sp. z o.o.",
  senderAddressLine1: "ul. Dębowa Góra 29",
  senderAddressLine2: "41-260 Sławków",
  recipientOffice: "ŚLĄSKI URZĄD CELNO SKARBOWY",
  recipientAddressLine1: "ul. Plac Grunwaldzki 8 - 10",
  recipientAddressLine2: "40-127 Katowice",
  uniqueDocumentNumber: "PPO 0-373-120-512",
  signatory: "Urszula Sówka",
};

const SAMPLE_WORKBOOK_PATH = path.join(
  __dirname,
  "..",
  "samples",
  "files",
  "Trade_N.xls"
);

module.exports = {
  DEFAULT_LETTER,
  DOCUMENT_PRESETS,
  MAX_LINES,
  ORE_TYPES,
  SAMPLE_WORKBOOK_PATH,
  STATIC_HINTS,
};

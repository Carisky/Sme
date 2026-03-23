const MAX_LINES = 10;
const DEFAULT_CUSTOMS_OFFICE_CODE = "40101";

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
  printCity: "Sławków",
  senderCompany: "TSL Silesia Sp. z o.o.",
  senderAddressLine1: "ul. Dębowa Góra 29",
  senderAddressLine2: "41-260 Sławków",
  uniqueDocumentNumber: "PPO 0-373-120-512",
  signatory: "Urszula Sówka",
};

module.exports = {
  DEFAULT_CUSTOMS_OFFICE_CODE,
  DEFAULT_LETTER,
  DOCUMENT_PRESETS,
  MAX_LINES,
  ORE_TYPES,
  STATIC_HINTS,
};

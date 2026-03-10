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
  "Aby wypelnic tabele WINNO BYC, najpierw wpisz numer i date korekty, a dopiero potem zmien cene lub numer faktury.",
  "Do wydruku przechodza tylko linie z tabeli WINNO BYC, ktore maja komplet danych: numer noty i date.",
];

const DEFAULT_LETTER = {
  printCity: "Slawkow",
  senderCompany: "TSL Silesia Sp. z o.o.",
  senderAddressLine1: "ul. Debowa Gora 29",
  senderAddressLine2: "41-260 Slawkow",
  uniqueDocumentNumber: "PPO 0-373-120-512",
  signatory: "Urszula Sowka",
};

module.exports = {
  DEFAULT_CUSTOMS_OFFICE_CODE,
  DEFAULT_LETTER,
  DOCUMENT_PRESETS,
  MAX_LINES,
  ORE_TYPES,
  STATIC_HINTS,
};

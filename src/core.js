const {
  DEFAULT_CUSTOMS_OFFICE_CODE,
  DEFAULT_LETTER,
  DOCUMENT_PRESETS,
  MAX_LINES,
  ORE_TYPES,
  STATIC_HINTS,
} = require("./constants");

const APP_SETTINGS_PATHS = [
  "fileLocation",
  "print.savePdfAfterPrint",
  "print.pdfOutputDir",
  "letter.printCity",
  "letter.printDate",
  "letter.senderCompany",
  "letter.senderAddressLine1",
  "letter.senderAddressLine2",
  "letter.uniqueDocumentNumber",
  "letter.signatory",
];

function round(value, decimals = 0) {
  if (!Number.isFinite(value)) {
    return null;
  }

  const power = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * power) / power;
}

function asText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function normalizeForComparison(value) {
  return asText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function parseNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  let text = String(value).trim();
  if (!text) {
    return null;
  }

  if (/^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$/.test(text)) {
    return null;
  }

  text = text.replace(/\u00a0/g, " ").replace(/\s+/g, "");

  if (/^[+-]?\d+(?:[.,]\d+)?e[+-]?\d+$/i.test(text)) {
    const exponential = Number(text.replace(",", "."));
    return Number.isFinite(exponential) ? exponential : null;
  }

  const commaCount = (text.match(/,/g) || []).length;
  const dotCount = (text.match(/\./g) || []).length;

  if (commaCount > 0 && dotCount > 0) {
    if (text.lastIndexOf(",") > text.lastIndexOf(".")) {
      text = text.replace(/\./g, "").replace(",", ".");
    } else {
      text = text.replace(/,/g, "");
    }
  } else if (commaCount > 0) {
    const lastComma = text.lastIndexOf(",");
    const digitsAfterComma = text.length - lastComma - 1;

    if (commaCount > 1 || digitsAfterComma === 3) {
      text = text.replace(/,/g, "");
    } else {
      text = text.replace(",", ".");
    }
  } else if (dotCount > 1) {
    text = text.replace(/\./g, "");
  }

  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatEditableNumber(value, decimals) {
  const numeric = parseNumber(value);
  if (numeric === null) {
    return "";
  }

  if (typeof decimals !== "number") {
    return String(numeric);
  }

  return round(numeric, decimals).toFixed(decimals);
}

function formatLocalizedNumber(value, decimals, options = {}) {
  if (!Number.isFinite(value)) {
    return "";
  }

  const precision = typeof decimals === "number" ? decimals : 0;
  let fixed = round(value, precision).toFixed(precision);
  let [integerPart, fractionPart = ""] = fixed.split(".");

  const sign = integerPart.startsWith("-") ? "-" : "";
  integerPart = integerPart.replace("-", "");
  integerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  integerPart = `${sign}${integerPart}`;

  if (options.trimZeros) {
    fractionPart = fractionPart.replace(/0+$/, "");
  }

  return fractionPart ? `${integerPart},${fractionPart}` : integerPart;
}

function formatDateForUi(date = new Date()) {
  const currentDate =
    date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();

  const day = String(currentDate.getDate()).padStart(2, "0");
  const month = String(currentDate.getMonth() + 1).padStart(2, "0");
  const year = currentDate.getFullYear();

  return `${day}.${month}.${year}`;
}

function sanitizeFileName(value) {
  return (
    asText(value)
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "projekt-sme"
  );
}

function getDocumentPreset(documentType) {
  return DOCUMENT_PRESETS[documentType] || DOCUMENT_PRESETS[""];
}

function inferCustomsOfficeCode(input = {}) {
  const explicitCode = asText(input.customsOfficeCode);
  if (explicitCode) {
    return explicitCode;
  }

  const documentNumber = asText(input.documentNumber).toUpperCase();
  if (documentNumber.includes("40101")) {
    return "40101";
  }

  if (documentNumber.includes("30102") || documentNumber.includes("33102")) {
    return "30102";
  }

  const officeText = [
    input.letter?.recipientOffice,
    input.letter?.recipientAddressLine1,
    input.letter?.recipientAddressLine2,
  ]
    .map((value) => normalizeForComparison(value))
    .join(" ");

  if (
    officeText.includes("podkarpack") ||
    officeText.includes("przemysl") ||
    officeText.includes("zaciszna")
  ) {
    return "40101";
  }

  if (
    officeText.includes("lubelsk") ||
    officeText.includes("biala") ||
    officeText.includes("celnik")
  ) {
    return "30102";
  }

  return DEFAULT_CUSTOMS_OFFICE_CODE;
}

function createOriginalRow(overrides = {}) {
  return {
    invoiceNumber: "",
    weightTons: "",
    priceEur: "",
    valueEur: "",
    ...overrides,
  };
}

function createCorrectionRow(overrides = {}) {
  return {
    invoiceNumber: "",
    weightTons: "",
    priceEur: "",
    noteNumber: "",
    noteDate: "",
    ...overrides,
  };
}

function getValueAtPath(object, targetPath) {
  return String(targetPath || "")
    .split(".")
    .reduce((current, key) => current?.[key], object);
}

function setValueAtPath(object, targetPath, value) {
  const parts = String(targetPath || "").split(".");
  const lastKey = parts.pop();
  let current = object;

  for (const key of parts) {
    if (!current[key] || typeof current[key] !== "object" || Array.isArray(current[key])) {
      current[key] = {};
    }

    current = current[key];
  }

  current[lastKey] = value;
}

function createBaseState() {
  return {
    fileLocation: "",
    fileName: "",
    eurRate: "",
    ownNumber: "",
    entryNumber: "",
    entryDate: "",
    customsOfficeCode: DEFAULT_CUSTOMS_OFFICE_CODE,
    documentType: "MRN",
    documentNumber: "18PL",
    oreKind: "",
    oreType: ORE_TYPES[0],
    originCountry: "",
    controlNumber: "",
    transportCost: "",
    originalRows: Array.from({ length: MAX_LINES }, () => createOriginalRow()),
    correctionRows: Array.from({ length: MAX_LINES }, () => createCorrectionRow()),
    print: {
      savePdfAfterPrint: false,
      pdfOutputDir: "",
    },
    letter: {
      ...DEFAULT_LETTER,
      printDate: formatDateForUi(),
    },
  };
}

function buildStateFromAppSettings(settings = {}) {
  const state = {};

  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return state;
  }

  for (const targetPath of APP_SETTINGS_PATHS) {
    if (!Object.prototype.hasOwnProperty.call(settings, targetPath)) {
      continue;
    }

    setValueAtPath(state, targetPath, settings[targetPath]);
  }

  return state;
}

function normalizeOriginalRow(row = {}) {
  return createOriginalRow({
    invoiceNumber: asText(row.invoiceNumber),
    weightTons: asText(row.weightTons),
    priceEur: asText(row.priceEur),
    valueEur: asText(row.valueEur),
  });
}

function normalizeCorrectionRow(row = {}) {
  return createCorrectionRow({
    invoiceNumber: asText(row.invoiceNumber),
    weightTons: asText(row.weightTons),
    priceEur: asText(row.priceEur),
    noteNumber: asText(row.noteNumber),
    noteDate: asText(row.noteDate),
  });
}

function normalizeLetter(letter = {}) {
  const normalized = {
    ...DEFAULT_LETTER,
    printDate: formatDateForUi(),
    ...(letter || {}),
  };

  return {
    ...normalized,
    printCity: asText(normalized.printCity),
    printDate: asText(normalized.printDate),
    senderCompany: asText(normalized.senderCompany),
    senderAddressLine1: asText(normalized.senderAddressLine1),
    senderAddressLine2: asText(normalized.senderAddressLine2),
    recipientOffice: asText(normalized.recipientOffice),
    recipientAddressLine1: asText(normalized.recipientAddressLine1),
    recipientAddressLine2: asText(normalized.recipientAddressLine2),
    uniqueDocumentNumber: asText(normalized.uniqueDocumentNumber),
    signatory: asText(normalized.signatory),
  };
}

function normalizeState(input = {}) {
  const base = createBaseState();
  const documentType = asText(input.documentType ?? base.documentType) || "MRN";
  const preset = getDocumentPreset(documentType);
  const documentNumber =
    input.documentNumber !== undefined && input.documentNumber !== null
      ? input.documentNumber
      : preset.suggestedNumber;

  return {
    fileLocation: asText(input.fileLocation ?? base.fileLocation),
    fileName: asText(input.fileName ?? base.fileName),
    eurRate: asText(input.eurRate ?? base.eurRate),
    ownNumber: asText(input.ownNumber ?? base.ownNumber),
    entryNumber: asText(input.entryNumber ?? base.entryNumber),
    entryDate: asText(input.entryDate ?? base.entryDate),
    customsOfficeCode: inferCustomsOfficeCode(input),
    documentType,
    documentNumber: asText(documentNumber),
    oreKind: asText(input.oreKind ?? base.oreKind),
    oreType: asText(input.oreType ?? base.oreType ?? ORE_TYPES[0]),
    originCountry: asText(input.originCountry ?? base.originCountry),
    controlNumber: asText(input.controlNumber ?? base.controlNumber),
    transportCost: asText(input.transportCost ?? base.transportCost),
    originalRows: Array.from({ length: MAX_LINES }, (_, index) =>
      normalizeOriginalRow(input.originalRows?.[index])
    ),
    correctionRows: Array.from({ length: MAX_LINES }, (_, index) =>
      normalizeCorrectionRow(input.correctionRows?.[index])
    ),
    print: {
      savePdfAfterPrint: Boolean(input.print?.savePdfAfterPrint ?? base.print.savePdfAfterPrint),
      pdfOutputDir: asText(input.print?.pdfOutputDir ?? base.print.pdfOutputDir),
    },
    letter: normalizeLetter(input.letter),
  };
}

function normalizeAppSettings(input = {}) {
  const normalizedState = normalizeState(buildStateFromAppSettings(input));
  const settings = {};

  for (const targetPath of APP_SETTINGS_PATHS) {
    settings[targetPath] = getValueAtPath(normalizedState, targetPath);
  }

  return settings;
}

function extractAppSettings(state = {}) {
  const normalizedState = normalizeState(state);
  const settings = {};

  for (const targetPath of APP_SETTINGS_PATHS) {
    settings[targetPath] = getValueAtPath(normalizedState, targetPath);
  }

  return settings;
}

function createEmptyState(overrides = {}) {
  const normalized = normalizeState(overrides);
  if (normalized.documentNumber) {
    return normalized;
  }

  const preset = getDocumentPreset(normalized.documentType);
  normalized.documentNumber = preset.suggestedNumber;
  return normalized;
}

function joinDistinct(values) {
  const result = [];

  for (const value of values) {
    const text = asText(value);
    if (text && !result.includes(text)) {
      result.push(text);
    }
  }

  return result.join(" ");
}

function buildOriginalMetrics(row) {
  const weightNumber = parseNumber(row.weightTons);
  const priceNumber = parseNumber(row.priceEur);
  const computedValue =
    weightNumber !== null && priceNumber !== null
      ? round(weightNumber * priceNumber, 5)
      : null;
  const valueNumber = parseNumber(row.valueEur) ?? computedValue;

  return {
    invoiceNumber: row.invoiceNumber,
    weightTons: row.weightTons,
    priceEur: row.priceEur,
    valueEur: row.valueEur,
    weightNumber,
    priceNumber,
    valueNumber,
    valueDisplay: formatEditableNumber(valueNumber, 5),
  };
}

function buildCorrectionMetrics(row, original) {
  const invoiceNumber = row.invoiceNumber || original.invoiceNumber;
  const weightTons = row.weightTons || original.weightTons;
  const priceEur = row.priceEur || original.priceEur;
  const weightNumber = parseNumber(weightTons);
  const priceNumber = parseNumber(priceEur);
  const valueNumber =
    weightNumber !== null && priceNumber !== null
      ? round(weightNumber * priceNumber, 5)
      : null;

  let direction = "error";
  if (priceNumber !== null && original.priceNumber !== null) {
    if (priceNumber < original.priceNumber) {
      direction = "credit";
    } else if (priceNumber > original.priceNumber) {
      direction = "debit";
    }
  }

  return {
    invoiceNumber,
    weightTons,
    priceEur,
    noteNumber: row.noteNumber,
    noteDate: row.noteDate,
    weightNumber,
    priceNumber,
    valueNumber,
    valueDisplay: formatEditableNumber(valueNumber, 5),
    isActive: Boolean(row.noteNumber && row.noteDate),
    isIncomplete: Boolean(
      (row.noteNumber && !row.noteDate) || (!row.noteNumber && row.noteDate)
    ),
    deltaPrice:
      priceNumber !== null && original.priceNumber !== null
        ? round(Math.abs(original.priceNumber - priceNumber), 4)
        : null,
    direction,
  };
}

function calculateCnCode(oreType) {
  if (oreType === "nieaglomerowana") {
    return "26011100";
  }

  if (oreType === "aglomerowana") {
    return "26011200";
  }

  return "";
}

function getNoteLabel(direction, form = "single") {
  const labels = {
    credit: {
      single: "notę kredytową",
      genitive: "noty kredytowej",
      plural: "noty kredytowe",
    },
    debit: {
      single: "notę debetową",
      genitive: "noty debetowej",
      plural: "noty debetowe",
    },
    error: {
      single: "notę korygującą",
      genitive: "noty korygującej",
      plural: "noty korygujące",
    },
  };

  return labels[direction]?.[form] || labels.error[form];
}

function getChangeVerb(direction) {
  if (direction === "credit") {
    return "pomniejszona";
  }

  if (direction === "debit") {
    return "powiększona";
  }

  return "zmieniona";
}

function suggestProjectName(state) {
  const normalized = normalizeState(state);
  const candidate = normalized.ownNumber || normalized.fileName || "projekt-sme";
  return sanitizeFileName(candidate.replace(/[\\/]+/g, "-"));
}

function computeSnapshot(state) {
  const normalized = normalizeState(state);
  const preset = getDocumentPreset(normalized.documentType);
  const eurRateNumber = parseNumber(normalized.eurRate) ?? 0;
  const transportCostNumber = parseNumber(normalized.transportCost) ?? 0;

  const rows = normalized.originalRows.map((originalRow, index) => {
    const original = buildOriginalMetrics(originalRow);
    const correction = buildCorrectionMetrics(
      normalized.correctionRows[index],
      original
    );

    return {
      index: index + 1,
      original,
      correction,
    };
  });

  const originalTotalEur = round(
    rows.reduce((sum, row) => sum + (row.original.valueNumber || 0), 0),
    2
  );
  const correctedTotalEurExact = round(
    rows.reduce((sum, row) => sum + (row.correction.valueNumber || 0), 0),
    5
  );
  const correctedTotalEurRounded = round(correctedTotalEurExact, 2);
  const originalPlnExact = round(originalTotalEur * eurRateNumber, 5);
  const correctedPlnExact = round(correctedTotalEurRounded * eurRateNumber, 5);
  const originalStatValue = round(originalPlnExact, 0);
  const correctedStatValue = round(correctedPlnExact, 0);
  const transportRoundedOne = round(round(transportCostNumber, 2), 1);
  const transportRoundedZero = round(transportRoundedOne, 0);
  const vatBaseOriginal = round(
    (originalStatValue || 0) + (transportRoundedZero || 0),
    0
  );
  const vatBaseCorrected = round(
    (correctedStatValue || 0) + (transportRoundedZero || 0),
    0
  );
  const vatAmountOriginal = round((vatBaseOriginal || 0) * 0.23, 0);
  const vatAmountCorrected = round((vatBaseCorrected || 0) * 0.23, 0);
  const vatDifference = Math.abs(
    (vatAmountOriginal || 0) - (vatAmountCorrected || 0)
  );
  const vatDescriptor =
    (vatAmountOriginal || 0) >= (vatAmountCorrected || 0)
      ? "nadpłaconego"
      : "niedopłaconego";

  const activeCorrections = rows.filter((row) => row.correction.isActive);
  const validationErrors = rows
    .filter((row) => row.correction.isIncomplete)
    .map(
      (row) =>
        `Wiersz ${row.index}: brak daty lub numeru noty w sekcji WINNO BYĆ.`
    );

  const noteNumbersList = joinDistinct(
    activeCorrections.map((row) => row.correction.noteNumber)
  );
  const invoiceNumbersList = joinDistinct(
    activeCorrections.map((row) => row.correction.invoiceNumber)
  );
  const paymentDocumentsList = joinDistinct(
    activeCorrections.flatMap((row) => [
      row.correction.noteNumber,
      row.correction.invoiceNumber,
    ])
  );
  const firstActiveCorrection = activeCorrections[0]?.correction;
  const noteAttachmentLine = firstActiveCorrection
    ? activeCorrections.length > 1
      ? `- ${getNoteLabel(firstActiveCorrection.direction, "plural")} nr ${noteNumbersList}`
      : `- ${getNoteLabel(firstActiveCorrection.direction, "genitive")} nr ${noteNumbersList}`
    : "";

  const documentDisplay =
    normalized.documentType === "MRN"
      ? normalized.documentNumber
      : `${preset.printPrefix}${normalized.documentType}${normalized.documentNumber}`.trim();

  const subjectReference = documentDisplay;

  const copySadLine =
    normalized.documentType === "MRN"
      ? `- kopia SAD${normalized.documentNumber}`
      : `- kopia SAD ${normalized.documentType}${normalized.documentNumber}`;

  const printParagraphs = activeCorrections.map((row) => ({
    noteLine: `Importer otrzymał od sprzedającego ${getNoteLabel(
      row.correction.direction,
      "single"
    )} nr. ${row.correction.noteNumber} z dnia ${row.correction.noteDate}, do faktury handlowej nr. ${row.correction.invoiceNumber}`,
    correctionLine: `Korekta dotyczy ceny jednostkowej za 1 tonę towaru - wartość została ${getChangeVerb(
      row.correction.direction
    )} z kwoty ${formatLocalizedNumber(row.original.priceNumber || 0, 4, {
      trimZeros: true,
    })} EUR/T o ${formatLocalizedNumber(row.correction.deltaPrice || 0, 4, {
      trimZeros: true,
    })} EUR/T cena po korekcie wynosi ${formatLocalizedNumber(
      row.correction.priceNumber || 0,
      4,
      {
        trimZeros: true,
      }
    )} EUR/T dostarczonego produktu.`,
  }));

  return {
    state: normalized,
    rows,
    hints: STATIC_HINTS,
    validation: {
      errors: validationErrors,
    },
    meta: {
      documentNumberLabel: preset.label,
      cnCode: calculateCnCode(normalized.oreType),
      documentDisplay,
      noteCount: activeCorrections.length,
      noteNumbersList,
      invoiceNumbersList,
      paymentDocumentsList,
      caseNumber: normalized.ownNumber ? `TSL/${normalized.ownNumber}` : "TSL/",
      subjectReference,
      sourceFileName: normalized.fileName ? `${normalized.fileName}.xls` : "",
    },
    totals: {
      vatDescriptor,
      formatted: {
        originalEur: formatLocalizedNumber(originalTotalEur, 2),
        correctedEurExact: formatLocalizedNumber(correctedTotalEurExact, 5, {
          trimZeros: true,
        }),
        correctedEurRounded: formatLocalizedNumber(correctedTotalEurRounded, 2),
        originalPlnExact: formatLocalizedNumber(originalPlnExact, 5),
        correctedPlnExact: formatLocalizedNumber(correctedPlnExact, 5),
        originalStatValue: formatLocalizedNumber(originalStatValue, 0),
        correctedStatValue: formatLocalizedNumber(correctedStatValue, 0),
        transportRoundedOne: formatLocalizedNumber(transportRoundedOne, 1),
        transportRoundedZero: formatLocalizedNumber(transportRoundedZero, 0),
        vatBaseOriginal: formatLocalizedNumber(vatBaseOriginal, 0),
        vatBaseCorrected: formatLocalizedNumber(vatBaseCorrected, 0),
        vatAmountOriginal: formatLocalizedNumber(vatAmountOriginal, 0),
        vatAmountCorrected: formatLocalizedNumber(vatAmountCorrected, 0),
        vatDifference: formatLocalizedNumber(vatDifference, 0),
        eurRate: formatLocalizedNumber(eurRateNumber, 4, { trimZeros: true }),
      },
    },
    attachments: {
      noteAttachmentLine,
      copySadLine,
      invoiceLine: invoiceNumbersList
        ? `- faktura handlowa nr ${invoiceNumbersList}`
        : "",
      uniqueDocumentLine: normalized.letter.uniqueDocumentNumber
        ? `- unikalny numer dokumentu zgłoszenia: ${normalized.letter.uniqueDocumentNumber}`
        : "",
      paymentConfirmationLine: "- dokument potwierdzający płatność",
      paymentDocumentsLine: paymentDocumentsList
        ? `- dokument potwierdzający płatność za faktury i noty: ${paymentDocumentsList}`
        : "",
    },
    printParagraphs,
  };
}

module.exports = {
  APP_SETTINGS_PATHS,
  DOCUMENT_PRESETS,
  MAX_LINES,
  ORE_TYPES,
  asText,
  buildStateFromAppSettings,
  computeSnapshot,
  createCorrectionRow,
  createEmptyState,
  createOriginalRow,
  extractAppSettings,
  formatDateForUi,
  formatEditableNumber,
  formatLocalizedNumber,
  getDocumentPreset,
  normalizeAppSettings,
  normalizeState,
  parseNumber,
  round,
  sanitizeFileName,
  suggestProjectName,
};

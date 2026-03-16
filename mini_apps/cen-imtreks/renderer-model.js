export const DEFAULT_SHEET_NAME = "Arkusz 1";

export function asText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

export function normalizeContainerNumber(value) {
  return asText(value).replace(/[\s\u00a0]+/g, "").toUpperCase();
}

export function normalizeComparisonContainers(values = []) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [values])
        .map((value) => normalizeContainerNumber(value))
        .filter(Boolean)
    )
  ).sort((left, right) => left.localeCompare(right, "pl"));
}

const CONTAINER_NUMBER_PATTERN = /\b[A-Z]{4}[\s\u00a0-]*\d{7}\b/g;

function isValidContainerNumber(value) {
  return /^[A-Z]{4}\d{7}$/.test(asText(value).toUpperCase());
}

export function extractContainerNumbers(value) {
  const raw = asText(value).toUpperCase();
  if (!raw) {
    return [];
  }

  const result = [];
  const seen = new Set();
  const register = (candidate) => {
    const normalized = normalizeContainerNumber(candidate);
    if (!isValidContainerNumber(normalized) || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    result.push(normalized);
  };

  const directCandidate = normalizeContainerNumber(raw);
  if (isValidContainerNumber(directCandidate)) {
    register(directCandidate);
  }

  const matches = raw.match(CONTAINER_NUMBER_PATTERN) || [];
  matches.forEach((match) => register(match));

  return result;
}

export function createId(prefix = "row") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function shouldUseCompactStopValue(value) {
  return asText(value).length > 20;
}

export function buildProjectNameKey(value) {
  return asText(value)
    .toLocaleLowerCase("pl")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const DEFAULT_VESSEL_DATE_FILTER_MODE = "range";

function normalizeVesselDateFilterMode(value) {
  return asText(value).toLowerCase() === "list" ? "list" : DEFAULT_VESSEL_DATE_FILTER_MODE;
}

function normalizeHasT1FilterValue(value) {
  const normalized = asText(value).toLowerCase();
  return ["all", "with", "without"].includes(normalized) ? normalized : "all";
}

function normalizeMultiSelectFilterValues(values = [], normalizeValue = asText) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [values])
        .map((value) => normalizeValue(value))
        .filter(Boolean)
    )
  ).sort((left, right) => left.localeCompare(right, "pl", { sensitivity: "base" }));
}

function normalizeComparisonRowFilterValue(value) {
  const normalized = asText(value).toLowerCase();
  return ["all", "matched", "missing"].includes(normalized) ? normalized : "all";
}

function normalizeVesselDateSelection(values = []) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [values])
        .map((value) => {
          const raw = asText(value);
          if (!raw) {
            return "";
          }

          return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : dateStringToIsoDate(raw);
        })
        .filter(Boolean)
    )
  ).sort((left, right) => left.localeCompare(right, "pl"));
}

function normalizeIncludedRowIds(values = []) {
  return new Set(
    (Array.isArray(values) ? values : values instanceof Set ? Array.from(values) : [values])
      .map((value) => asText(value))
      .filter(Boolean)
  );
}

function normalizeComparisonSheetSelection(values = []) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [values])
        .map((value) => asText(value))
        .filter(Boolean)
    )
  ).sort((left, right) => left.localeCompare(right, "pl", { sensitivity: "base" }));
}

function normalizeComparisonStatusSort(value) {
  const normalized = asText(value).toLowerCase();
  return ["matched-first", "missing-first"].includes(normalized)
    ? normalized
    : "missing-first";
}

function normalizeStatusFilterValue(value) {
  return asText(value).toLocaleUpperCase("pl");
}

function normalizeStatusFilterSelection(values = [], fallbackValue = "") {
  const sourceValues =
    Array.isArray(values) && values.length > 0
      ? values
      : asText(fallbackValue)
        ? [fallbackValue]
        : [];
  return normalizeMultiSelectFilterValues(sourceValues, normalizeStatusFilterValue);
}

function normalizeRemarkFilterValue(value) {
  return asText(value).toLocaleUpperCase("pl");
}

function normalizeRemarkFilterSelection(values = []) {
  return normalizeMultiSelectFilterValues(values, normalizeRemarkFilterValue);
}

export function createProjectView(overrides = {}) {
  return {
    searchTerm: "",
    vesselDateMode: DEFAULT_VESSEL_DATE_FILTER_MODE,
    vesselDateFrom: "",
    vesselDateTo: "",
    vesselDateSelected: [],
    hasT1: "all",
    status: "",
    statuses: [],
    remarks: [],
    forceUpdate: false,
    ...overrides,
  };
}

export function normalizeProjectView(view = {}) {
  const statuses = normalizeStatusFilterSelection(view.statuses, view.status);
  const legacyStatus = normalizeStatusFilterValue(view.status);
  return createProjectView({
    searchTerm: asText(view.searchTerm),
    vesselDateMode: normalizeVesselDateFilterMode(view.vesselDateMode),
    vesselDateFrom: asText(view.vesselDateFrom),
    vesselDateTo: asText(view.vesselDateTo),
    vesselDateSelected: normalizeVesselDateSelection(view.vesselDateSelected),
    hasT1: normalizeHasT1FilterValue(view.hasT1),
    status: legacyStatus || statuses[0] || "",
    statuses,
    remarks: normalizeRemarkFilterSelection(view.remarks),
    forceUpdate: Boolean(view.forceUpdate),
  });
}

export function createRow(overrides = {}) {
  return {
    id: createId("row"),
    origin: "manual",
    sourceRowNumber: "",
    sequenceNumber: "",
    orderDate: "",
    vesselDate: "",
    folderName: "",
    containerCount: "",
    invoiceInfo: "",
    containerNumber: "",
    blNumber: "",
    customsOffice: "",
    status: "",
    vessel: "",
    t1Count: "",
    stop: "",
    t1: "",
    remarks: "",
    t1Nina: "",
    ...overrides,
  };
}

export function normalizeRow(row = {}) {
  const vesselDate = asText(row.vesselDate || row.vessel);
  return {
    ...createRow(row),
    id: asText(row.id) || createId("row"),
    origin: asText(row.origin) || "manual",
    sourceRowNumber: asText(row.sourceRowNumber),
    sequenceNumber: asText(row.sequenceNumber),
    orderDate: asText(row.orderDate),
    vesselDate,
    folderName: asText(row.folderName),
    containerCount: asText(row.containerCount),
    invoiceInfo: asText(row.invoiceInfo),
    containerNumber: normalizeContainerNumber(row.containerNumber),
    blNumber: asText(row.blNumber),
    customsOffice: asText(row.customsOffice),
    status: asText(row.status),
    vessel: asText(row.vessel),
    t1Count: asText(row.t1Count),
    stop: asText(row.stop),
    t1: asText(row.t1),
    remarks: asText(row.remarks),
    t1Nina: asText(row.t1Nina),
  };
}

export function createSheet(overrides = {}) {
  return {
    id: createId("sheet"),
    name: DEFAULT_SHEET_NAME,
    rows: [],
    ...overrides,
  };
}

export function normalizeSheet(sheet = {}) {
  return {
    ...createSheet(sheet),
    id: asText(sheet.id) || createId("sheet"),
    name: asText(sheet.name) || DEFAULT_SHEET_NAME,
    rows: Array.isArray(sheet.rows) ? sheet.rows.map(normalizeRow) : [],
  };
}

export function buildNextSheetName(existingSheets = [], preferredName = "") {
  const sheetNames = (Array.isArray(existingSheets) ? existingSheets : [existingSheets])
    .map((sheet) => (typeof sheet === "string" ? sheet : sheet?.name))
    .map((value) => asText(value))
    .filter(Boolean);
  const sheetNameKeys = new Set(sheetNames.map((name) => buildProjectNameKey(name)));
  const requestedName = asText(preferredName);

  if (requestedName) {
    if (!sheetNameKeys.has(buildProjectNameKey(requestedName))) {
      return requestedName;
    }

    let suffix = 2;
    let candidate = `${requestedName} ${suffix}`;
    while (sheetNameKeys.has(buildProjectNameKey(candidate))) {
      suffix += 1;
      candidate = `${requestedName} ${suffix}`;
    }
    return candidate;
  }

  const defaultPrefix = asText(DEFAULT_SHEET_NAME).replace(/\s+\d+\s*$/, "") || "Arkusz";
  const defaultPattern = new RegExp(`^${escapeRegExp(defaultPrefix)}(?:\\s+(\\d+))?$`, "i");
  let maxDefaultIndex = 0;

  sheetNames.forEach((sheetName) => {
    const match = sheetName.match(defaultPattern);
    if (!match) {
      return;
    }

    const parsedIndex = Number(match[1] || 1);
    if (Number.isFinite(parsedIndex)) {
      maxDefaultIndex = Math.max(maxDefaultIndex, parsedIndex);
    }
  });

  if (!maxDefaultIndex) {
    return DEFAULT_SHEET_NAME;
  }

  return `${defaultPrefix} ${maxDefaultIndex + 1}`;
}

export function normalizeState(input = {}) {
  let sheets = Array.isArray(input.sheets) ? input.sheets.map(normalizeSheet) : [];

  if (!sheets.length && Array.isArray(input.rows) && input.rows.length) {
    sheets = [
      normalizeSheet({
        name: DEFAULT_SHEET_NAME,
        rows: input.rows,
      }),
    ];
  }

  const activeSheetId = asText(input.activeSheetId);
  const resolvedActiveSheetId =
    (activeSheetId && sheets.some((sheet) => sheet.id === activeSheetId) && activeSheetId) ||
    sheets[0]?.id ||
    "";

  return {
    projectName: asText(input.projectName),
    fileName: asText(input.fileName),
    fileLocation: asText(input.fileLocation),
    sourceFilePath: asText(input.sourceFilePath),
    sourceFileName: asText(input.sourceFileName),
    dbPath: asText(input.dbPath),
    activeSheetId: resolvedActiveSheetId,
    view: normalizeProjectView(input.view),
    invoiceComparison: normalizeInvoiceComparison(input.invoiceComparison),
    sheets,
  };
}

function resolveState(state = {}) {
  if (!state || typeof state !== "object" || !Array.isArray(state.sheets)) {
    return normalizeState(state);
  }

  const activeSheetId = asText(state.activeSheetId);
  const resolvedActiveSheetId =
    (activeSheetId &&
      state.sheets.some((sheet) => asText(sheet?.id) === activeSheetId) &&
      activeSheetId) ||
    state.sheets[0]?.id ||
    "";

  if (resolvedActiveSheetId === activeSheetId) {
    return state;
  }

  return {
    ...state,
    activeSheetId: resolvedActiveSheetId,
  };
}

export function createEmptyState(overrides = {}) {
  return normalizeState({
    projectName: "",
    fileName: "",
    fileLocation: "",
    sourceFilePath: "",
    sourceFileName: "",
    dbPath: "",
    activeSheetId: "",
    view: createProjectView(),
    invoiceComparison: createInvoiceComparison(),
    sheets: [],
    ...overrides,
  });
}

export function flattenRows(state) {
  return resolveState(state).sheets.flatMap((sheet) => sheet.rows);
}

export function getActiveSheet(state) {
  const resolved = resolveState(state);
  return resolved.sheets.find((sheet) => sheet.id === resolved.activeSheetId) || resolved.sheets[0] || null;
}

export function collectProjectStats(state = {}) {
  const rows = flattenRows(state);
  return {
    rowCount: rows.length,
    filledCount: rows.filter((row) => asText(row.t1)).length,
    pendingCount: rows.filter((row) => asText(row.containerNumber) && !asText(row.t1)).length,
    manualCount: rows.filter((row) => asText(row.origin) === "manual").length,
  };
}

export function getInvoiceComparisonSheetOptions(state = {}) {
  const normalizedState = resolveState(state);
  return normalizedState.sheets
    .map((sheet) => asText(sheet?.name))
    .filter(Boolean)
    .filter((sheetName, index, source) => source.indexOf(sheetName) === index)
    .sort((left, right) => left.localeCompare(right, "pl", { sensitivity: "base" }));
}

export function collectInvoiceComparisonRows(state = {}, options = {}) {
  const normalizedState = resolveState(state);
  const comparisonSet = new Set(
    normalizeComparisonContainers(normalizedState.invoiceComparison?.containers)
  );
  const selectedSheetNames = normalizeComparisonSheetSelection(options.sheetNames);
  const selectedSheetSet = new Set(selectedSheetNames);
  const hasSelectedSheets = selectedSheetSet.size > 0;
  const statusSort = normalizeComparisonStatusSort(options.statusSort);
  const rowsByContainer = new Map();

  normalizedState.sheets.forEach((sheet) => {
    const sheetName = asText(sheet?.name) || DEFAULT_SHEET_NAME;
    if (hasSelectedSheets && !selectedSheetSet.has(sheetName)) {
      return;
    }

    sheet.rows.forEach((row) => {
      const containerNumber = normalizeContainerNumber(row.containerNumber);
      if (!containerNumber) {
        return;
      }

      const current = rowsByContainer.get(containerNumber) || {
        containerNumber,
        rowCount: 0,
        sheetNames: new Set(),
      };
      current.rowCount += 1;
      current.sheetNames.add(sheetName);
      rowsByContainer.set(containerNumber, current);
    });
  });

  return Array.from(rowsByContainer.values())
    .map((entry) => {
      const sheetNames = Array.from(entry.sheetNames).sort((left, right) =>
        left.localeCompare(right, "pl", { sensitivity: "base" })
      );
      const hasComparisonMatch = comparisonSet.has(entry.containerNumber);
      return {
        containerNumber: entry.containerNumber,
        rowCount: entry.rowCount,
        sheetNames,
        sheetLabel: sheetNames.join(", "),
        hasComparisonMatch,
        statusKey: hasComparisonMatch ? "matched" : "missing",
        statusLabel: hasComparisonMatch ? "Jest w bazie" : "Do faktur",
      };
    })
    .sort((left, right) => {
      if (left.statusKey !== right.statusKey) {
        if (statusSort === "matched-first") {
          return left.statusKey === "matched" ? -1 : 1;
        }

        return left.statusKey === "missing" ? -1 : 1;
      }

      return left.containerNumber.localeCompare(right.containerNumber, "pl");
    });
}

export function collectInvoiceComparisonStats(state = {}, options = {}) {
  const rows = collectInvoiceComparisonRows(state, options);
  const comparisonContainers = normalizeComparisonContainers(state?.invoiceComparison?.containers);
  return {
    projectContainers: rows.length,
    matchedContainers: rows.filter((row) => row.hasComparisonMatch).length,
    missingContainers: rows.filter((row) => !row.hasComparisonMatch).length,
    comparisonContainers: comparisonContainers.length,
  };
}

export function createLookupRecord(overrides = {}) {
  return {
    containerNumber: "",
    cen: "",
    tState: "",
    stop: "",
    source: "manual",
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

export function createInvoiceComparison(overrides = {}) {
  return {
    filePath: "",
    fileName: "",
    sheetName: "",
    columnKey: "",
    columnHeader: "",
    containers: [],
    importedAt: "",
    ...overrides,
  };
}

export function normalizeLookupRecord(record = {}) {
  return {
    ...createLookupRecord(record),
    containerNumber: normalizeContainerNumber(record.containerNumber),
    cen: asText(record.cen),
    tState: asText(record.tState),
    stop: asText(record.stop),
    source: asText(record.source) || "manual",
    createdAt: asText(record.createdAt),
    updatedAt: asText(record.updatedAt),
  };
}

export function normalizeInvoiceComparison(comparison = {}) {
  return createInvoiceComparison({
    filePath: asText(comparison.filePath),
    fileName: asText(comparison.fileName),
    sheetName: asText(comparison.sheetName),
    columnKey: asText(comparison.columnKey).toUpperCase(),
    columnHeader: asText(comparison.columnHeader),
    containers: normalizeComparisonContainers(comparison.containers),
    importedAt: asText(comparison.importedAt),
  });
}

export function normalizeProjectOption(project = {}) {
  return {
    id: Number(project.id) || 0,
    projectName: asText(project.projectName),
    sourceFileName: asText(project.sourceFileName),
    rowCount: Number(project.rowCount) || 0,
    createdAt: asText(project.createdAt),
    updatedAt: asText(project.updatedAt),
  };
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function basename(filePath) {
  return asText(filePath).split(/[\\/]/).pop() || asText(filePath);
}

export function stripExtension(fileName) {
  const name = basename(fileName);
  const lastDotIndex = name.lastIndexOf(".");
  if (lastDotIndex <= 0) {
    return name;
  }

  return name.slice(0, lastDotIndex);
}

export function deriveProjectName(state = {}) {
  return (
    asText(state.projectName) ||
    asText(state.fileName) ||
    stripExtension(state.sourceFileName) ||
    "Nowy projekt"
  );
}

export function formatTimestamp(value) {
  const raw = asText(value);
  if (!raw) {
    return "-";
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return raw;
  }

  return new Intl.DateTimeFormat("pl-PL", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function parseDayMonthYear(value) {
  const raw = asText(value);
  const match = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) {
    return null;
  }

  return {
    day: Number(match[1]),
    month: Number(match[2]),
    year: Number(match[3]),
  };
}

function compareDateStrings(left, right) {
  const parsedLeft = parseDayMonthYear(left);
  const parsedRight = parseDayMonthYear(right);
  if (parsedLeft && parsedRight) {
    const leftKey = parsedLeft.year * 10000 + parsedLeft.month * 100 + parsedLeft.day;
    const rightKey = parsedRight.year * 10000 + parsedRight.month * 100 + parsedRight.day;
    return leftKey - rightKey;
  }

  return asText(left).localeCompare(asText(right), "pl", { sensitivity: "base" });
}

function toDateKey(value) {
  const parsed = parseDayMonthYear(value);
  if (!parsed) {
    return null;
  }

  return parsed.year * 10000 + parsed.month * 100 + parsed.day;
}

export function dateStringToIsoDate(value) {
  const parsed = parseDayMonthYear(value);
  if (!parsed) {
    return "";
  }

  const day = String(parsed.day).padStart(2, "0");
  const month = String(parsed.month).padStart(2, "0");
  return `${parsed.year}-${month}-${day}`;
}

export function isoDateToDateString(value) {
  const raw = asText(value);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return "";
  }

  return `${match[3]}.${match[2]}.${match[1]}`;
}

export function getActiveSheetFilterOptions(state = {}) {
  const activeSheet = getActiveSheet(state);
  const rows = Array.isArray(activeSheet?.rows) ? activeSheet.rows : [];
  const vesselDates = Array.from(
    new Set(rows.map((row) => asText(row.vesselDate)).filter(Boolean))
  ).sort(compareDateStrings);
  const vesselDateOptions = vesselDates
    .map((label) => ({
      label,
      value: dateStringToIsoDate(label),
    }))
    .filter((option) => option.value);
  const statuses = normalizeMultiSelectFilterValues(
    rows.map((row) => row.status),
    normalizeStatusFilterValue
  ).map((value) => ({
    value,
    label: value,
  }));
  const remarksByValue = new Map();
  rows.forEach((row) => {
    const label = asText(row.remarks);
    const value = normalizeRemarkFilterValue(label);
    if (!value || remarksByValue.has(value)) {
      return;
    }

    remarksByValue.set(value, label);
  });
  const remarks = Array.from(remarksByValue.entries())
    .map(([value, label]) => ({
      value,
      label,
    }))
    .sort((left, right) => left.label.localeCompare(right.label, "pl", { sensitivity: "base" }));
  const vesselDateFrom = vesselDateOptions[0]?.value || "";
  const vesselDateTo = vesselDateOptions[vesselDateOptions.length - 1]?.value || "";

  return {
    vesselDates,
    vesselDateOptions,
    vesselDateFrom,
    vesselDateTo,
    statuses,
    remarks,
  };
}

export function getActiveSheetDuplicateContainers(state = {}) {
  const activeSheet = getActiveSheet(state);
  const rows = Array.isArray(activeSheet?.rows) ? activeSheet.rows : [];
  const counts = new Map();

  rows.forEach((row) => {
    const containerNumber = normalizeContainerNumber(row.containerNumber);
    if (!containerNumber) {
      return;
    }

    counts.set(containerNumber, (counts.get(containerNumber) || 0) + 1);
  });

  return new Set(
    Array.from(counts.entries())
      .filter(([, count]) => count > 1)
      .map(([containerNumber]) => containerNumber)
  );
}

export function matchesRowFilters(row = {}, filters = {}) {
  const searchTerm = normalizeContainerNumber(filters.searchTerm);
  const vesselDateMode = normalizeVesselDateFilterMode(filters.vesselDateMode);
  const vesselDateSelection = normalizeVesselDateSelection(filters.vesselDateSelected);
  const vesselDateSelectionSet = new Set(vesselDateSelection);
  const vesselDateFromKey = toDateKey(isoDateToDateString(filters.vesselDateFrom));
  const vesselDateToKey = toDateKey(isoDateToDateString(filters.vesselDateTo));
  const hasT1 = normalizeHasT1FilterValue(filters.hasT1);
  const statusSet = new Set(
    normalizeStatusFilterSelection(filters.statuses, filters.status)
  );
  const remarkSet = new Set(normalizeRemarkFilterSelection(filters.remarks));
  const rowVesselDateKey = toDateKey(row.vesselDate);
  const rowVesselDateIso = dateStringToIsoDate(row.vesselDate);
  const comparisonStatus = normalizeComparisonRowFilterValue(filters.comparisonStatus);
  const comparisonContainerSet = new Set(
    normalizeComparisonContainers(filters.comparisonContainers)
  );
  const rowContainerNumber = normalizeContainerNumber(row.containerNumber);
  const hasComparisonMatch = rowContainerNumber
    ? comparisonContainerSet.has(rowContainerNumber)
    : false;

  if (searchTerm && !rowContainerNumber.includes(searchTerm)) {
    return false;
  }

  if (vesselDateMode === "list") {
    if (vesselDateSelectionSet.size > 0 && !vesselDateSelectionSet.has(rowVesselDateIso)) {
      return false;
    }
  } else {
    if (vesselDateFromKey !== null) {
      if (rowVesselDateKey === null || rowVesselDateKey < vesselDateFromKey) {
        return false;
      }
    }

    if (vesselDateToKey !== null) {
      if (rowVesselDateKey === null || rowVesselDateKey > vesselDateToKey) {
        return false;
      }
    }
  }

  if (hasT1 === "with" && !asText(row.t1)) {
    return false;
  }

  if (hasT1 === "without" && asText(row.t1)) {
    return false;
  }

  if (statusSet.size > 0 && !statusSet.has(normalizeStatusFilterValue(row.status))) {
    return false;
  }

  if (remarkSet.size > 0 && !remarkSet.has(normalizeRemarkFilterValue(row.remarks))) {
    return false;
  }

  if (comparisonStatus === "matched" && !hasComparisonMatch) {
    return false;
  }

  if (comparisonStatus === "missing" && (!rowContainerNumber || hasComparisonMatch)) {
    return false;
  }

  return true;
}

export function getFilteredRows(state = {}, filters = {}) {
  const activeSheet = getActiveSheet(state);
  if (!activeSheet) {
    return [];
  }

  const includedRowIds = normalizeIncludedRowIds(filters.includeRowIds);
  return activeSheet.rows.filter(
    (row) => includedRowIds.has(asText(row.id)) || matchesRowFilters(row, filters)
  );
}

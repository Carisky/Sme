const path = require("node:path");

const REJ_CONT_PAGE_SIZE = 500;
const TERMINAL_OPTIONS = Object.freeze(["BCT", "DCT", "GCT"]);
const TERMINAL_SET = new Set(TERMINAL_OPTIONS);
const CONTAINER_NUMBER_PATTERN = /^[A-Z]{4}\d{7}$/;
const CONTAINER_ADDITION_SOURCE_KINDS = Object.freeze(["MANUAL", "IMPORT"]);
const DEFAULT_IMPORT_CHUNK_SIZE = 25;
const CONTAINER_INCLUDE = Object.freeze({
  additions: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      fullName: true,
      department: true,
      sourceKind: true,
      sourceFileName: true,
      sourceSheetName: true,
      createdAt: true,
    },
  },
});
const EMPTY_RESULT = Object.freeze({
  items: [],
  totalCount: 0,
  limit: REJ_CONT_PAGE_SIZE,
  offset: 0,
  nextOffset: null,
  hasMore: false,
  statusOptions: [],
  terminalOptions: [...TERMINAL_OPTIONS],
});

function asText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function asNullableText(value) {
  const text = asText(value);
  return text || null;
}

function normalizeContainerNumber(value) {
  return asText(value).replace(/[\s\u00a0]+/g, "").toUpperCase();
}

function isValidContainerNumber(value) {
  return CONTAINER_NUMBER_PATTERN.test(normalizeContainerNumber(value));
}

function normalizeImportedContainerNumbers(value) {
  const entries = Array.isArray(value) ? value : [];
  const seen = new Set();
  const numbers = [];
  let invalidCount = 0;
  let duplicateCount = 0;

  entries.forEach((entry) => {
    const rawValue = asText(entry);
    const normalized = normalizeContainerNumber(entry);
    if (!normalized || !CONTAINER_NUMBER_PATTERN.test(normalized)) {
      if (rawValue) {
        invalidCount += 1;
      }
      return;
    }

    if (seen.has(normalized)) {
      duplicateCount += 1;
      return;
    }

    seen.add(normalized);
    numbers.push(normalized);
  });

  return {
    totalCount: entries.length,
    numbers,
    invalidCount,
    duplicateCount,
  };
}

function normalizeImportedContainers(value) {
  const entries = Array.isArray(value) ? value : [];
  const seen = new Set();
  const indexByNumber = new Map();
  const containers = [];
  let invalidCount = 0;
  let duplicateCount = 0;
  let terminalResolvedCount = 0;

  entries.forEach((entry) => {
    const rawNumber =
      entry && typeof entry === "object" && !Array.isArray(entry) ? entry.number : entry;
    const rawTerminal =
      entry && typeof entry === "object" && !Array.isArray(entry)
        ? entry.terminalName || entry.terminal || entry.terminalRawValue
        : null;
    const normalizedNumber = normalizeContainerNumber(rawNumber);
    const parsedTerminalName = parseImportedTerminalName(rawTerminal);

    if (!normalizedNumber || !CONTAINER_NUMBER_PATTERN.test(normalizedNumber)) {
      if (asText(rawNumber)) {
        invalidCount += 1;
      }
      return;
    }

    if (seen.has(normalizedNumber)) {
      duplicateCount += 1;

      const existingIndex = indexByNumber.get(normalizedNumber);
      if (
        Number.isInteger(existingIndex) &&
        parsedTerminalName &&
        !containers[existingIndex].terminalName
      ) {
        containers[existingIndex].terminalName = parsedTerminalName;
        terminalResolvedCount += 1;
      }
      return;
    }

    seen.add(normalizedNumber);
    indexByNumber.set(normalizedNumber, containers.length);
    containers.push({
      number: normalizedNumber,
      terminalName: parsedTerminalName,
    });
    if (parsedTerminalName) {
      terminalResolvedCount += 1;
    }
  });

  return {
    totalCount: entries.length,
    containers,
    invalidCount,
    duplicateCount,
    terminalResolvedCount,
  };
}

function normalizeContainerIds(value) {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalizedIds = value
    .map((entry) => Number(entry))
    .filter((entry) => Number.isInteger(entry) && entry > 0);

  return Array.from(new Set(normalizedIds));
}

function normalizeTerminalName(value) {
  const terminalName = asText(value).toUpperCase();
  if (!terminalName) {
    return "";
  }

  if (!TERMINAL_SET.has(terminalName)) {
    throw new Error(`Nieprawidlowy terminal "${terminalName}".`);
  }

  return terminalName;
}

function parseImportedTerminalName(value) {
  const rawValue = asText(value).toUpperCase();
  if (!rawValue) {
    return null;
  }

  const match = rawValue.match(/\b(BCT|DCT|GCT)\b/);
  if (!match) {
    return null;
  }

  return normalizeTerminalName(match[1]) || null;
}

function normalizeUserProfile(input = {}, options = {}) {
  const fullName = asText(input?.fullName);
  const department = asText(input?.department);

  if (!fullName && !department && options.required !== true) {
    return null;
  }

  if (!fullName || !department) {
    throw new Error("Uzupelnij Dane uzytkownika: imie i nazwisko oraz dzial.");
  }

  return {
    fullName,
    department,
  };
}

function normalizeAdditionSourceKind(value) {
  const sourceKind = asText(value).toUpperCase() || "MANUAL";
  if (!CONTAINER_ADDITION_SOURCE_KINDS.includes(sourceKind)) {
    throw new Error(`Nieprawidlowy rodzaj zrodla "${sourceKind}".`);
  }

  return sourceKind;
}

function parseDateTimeValue(value, options = {}) {
  const fieldName = asText(options.fieldName) || "data";
  const allowEmpty = options.allowEmpty !== false;
  const rawValue =
    value instanceof Date ? value.toISOString() : asText(value);

  if (!rawValue) {
    if (allowEmpty) {
      return null;
    }

    throw new Error(`Pole ${fieldName} jest wymagane.`);
  }

  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(rawValue);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Nieprawidlowa wartosc pola ${fieldName}.`);
  }

  return parsed;
}

function buildDateRange(fieldName, fromValue, toValue) {
  const range = {};
  const fromDate = parseDateTimeValue(fromValue, {
    fieldName: `${fieldName} od`,
    allowEmpty: true,
  });
  const toDate = parseDateTimeValue(toValue, {
    fieldName: `${fieldName} do`,
    allowEmpty: true,
  });

  if (fromDate) {
    range.gte = fromDate;
  }

  if (toDate) {
    range.lte = toDate;
  }

  return Object.keys(range).length > 0 ? range : null;
}

function buildContainerWhereInput(filters = {}, options = {}) {
  const clauses = [];
  const number = normalizeContainerNumber(filters.number);
  const containerIds = normalizeContainerIds(filters.containerIds);

  if (number) {
    clauses.push({
      number: {
        contains: number,
        mode: "insensitive",
      },
    });
  }

  if (containerIds && containerIds.length > 0) {
    clauses.push({
      id: {
        in: containerIds,
      },
    });
  }

  const status = asText(filters.status);
  if (status && !options.excludeStatus) {
    clauses.push({ status });
  }

  const terminalName = normalizeTerminalName(filters.terminalName);
  if (terminalName) {
    clauses.push({ terminalName });
  }

  const createdAtRange = buildDateRange(
    "createdAt",
    filters.createdAtFrom,
    filters.createdAtTo
  );
  if (createdAtRange) {
    clauses.push({ createdAt: createdAtRange });
  }

  const lastRefreshTimeRange = buildDateRange(
    "lastRefreshTime",
    filters.lastRefreshTimeFrom,
    filters.lastRefreshTimeTo
  );
  if (lastRefreshTimeRange) {
    clauses.push({ lastRefreshTime: lastRefreshTimeRange });
  }

  if (clauses.length === 0) {
    return {};
  }

  if (clauses.length === 1) {
    return clauses[0];
  }

  return { AND: clauses };
}

function normalizeCreateContainerInput(input = {}) {
  const number = normalizeContainerNumber(input.number);
  const mrn = asNullableText(input.mrn);
  const stop = asNullableText(input.stop);
  const status = asNullableText(input.status);
  const terminalName = normalizeTerminalName(input.terminalName) || null;

  if (!number) {
    throw new Error("Pole number jest wymagane.");
  }

  return {
    number,
    mrn,
    stop,
    status,
    terminalName,
  };
}

function serializeAddedBy(entries) {
  if (!Array.isArray(entries)) {
    return [];
  }

  const seen = new Set();
  const addedBy = [];

  entries.forEach((entry) => {
    const fullName = asText(entry?.fullName);
    const department = asText(entry?.department);
    if (!fullName || !department) {
      return;
    }

    const key = `${fullName}\u0000${department}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    addedBy.push({
      fullName,
      department,
    });
  });

  return addedBy;
}

function serializeContainer(record = {}) {
  return {
    id: Number(record.id) || 0,
    number: asText(record.number),
    mrn: asText(record.mrn),
    stop: asText(record.stop),
    lastRefreshTime: record.lastRefreshTime
      ? new Date(record.lastRefreshTime).toISOString()
      : "",
    status: asText(record.status),
    terminalName: asText(record.terminalName),
    createdAt: record.createdAt ? new Date(record.createdAt).toISOString() : "",
    addedBy: serializeAddedBy(record.additions),
  };
}

function normalizeListOptions(options = {}) {
  const requestedLimit = Number(options.limit);
  const requestedOffset = Number(options.offset);

  return {
    limit:
      Number.isFinite(requestedLimit) && requestedLimit > 0
        ? Math.min(Math.trunc(requestedLimit), REJ_CONT_PAGE_SIZE)
        : REJ_CONT_PAGE_SIZE,
    offset:
      Number.isFinite(requestedOffset) && requestedOffset > 0
        ? Math.trunc(requestedOffset)
        : 0,
    filters:
      options && typeof options.filters === "object" && !Array.isArray(options.filters)
        ? options.filters
        : {},
  };
}

function buildAdditionCreateInput(containerId, actor, input = {}) {
  return {
    containerId,
    fullName: actor.fullName,
    department: actor.department,
    sourceKind: normalizeAdditionSourceKind(input.sourceKind),
    ...(asNullableText(input.sourceFileName || input.filePath)
      ? { sourceFileName: path.basename(asText(input.sourceFileName || input.filePath)) }
      : {}),
    ...(asNullableText(input.sourceSheetName)
      ? { sourceSheetName: asText(input.sourceSheetName) }
      : {}),
  };
}

function chunkValues(values, chunkSize) {
  const normalizedChunkSize =
    Number.isInteger(Number(chunkSize)) && Number(chunkSize) > 0
      ? Number(chunkSize)
      : DEFAULT_IMPORT_CHUNK_SIZE;
  const chunks = [];

  for (let index = 0; index < values.length; index += normalizedChunkSize) {
    chunks.push(values.slice(index, index + normalizedChunkSize));
  }

  return chunks;
}

async function createContainersBatch(prisma, containers) {
  if (!Array.isArray(containers) || containers.length === 0) {
    return;
  }

  if (typeof prisma?.container?.createMany === "function") {
    await prisma.container.createMany({
      data: containers.map((container) => ({
        number: container.number,
        ...(container.terminalName ? { terminalName: container.terminalName } : {}),
      })),
    });
    return;
  }

  for (const container of containers) {
    await prisma.container.create({
      data: {
        number: container.number,
        ...(container.terminalName ? { terminalName: container.terminalName } : {}),
      },
    });
  }
}

async function createAdditionsBatch(prisma, additions) {
  if (!Array.isArray(additions) || additions.length === 0) {
    return;
  }

  if (typeof prisma?.containerAddition?.createMany === "function") {
    await prisma.containerAddition.createMany({
      data: additions,
    });
    return;
  }

  for (const addition of additions) {
    await prisma.containerAddition.create({
      data: addition,
    });
  }
}

async function withTransaction(prisma, callback) {
  if (typeof prisma?.$transaction !== "function") {
    return callback(prisma);
  }

  return prisma.$transaction(async (tx) => callback(tx));
}

async function listContainers(prisma, options = {}) {
  if (!prisma?.container) {
    throw new Error("Prisma klient rej-cont nie jest gotowy.");
  }

  const { limit, offset, filters } = normalizeListOptions(options);
  const containerIds = normalizeContainerIds(filters.containerIds);
  if (Array.isArray(filters.containerIds) && containerIds && containerIds.length === 0) {
    return {
      ...EMPTY_RESULT,
      limit,
      offset,
    };
  }

  const where = buildContainerWhereInput(filters);
  const statusWhere = buildContainerWhereInput(filters, {
    excludeStatus: true,
  });

  const [totalCount, items, groupedStatuses] = await Promise.all([
    prisma.container.count({ where }),
    prisma.container.findMany({
      where,
      skip: offset,
      take: limit,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: CONTAINER_INCLUDE,
    }),
    prisma.container.groupBy({
      by: ["status"],
      where: statusWhere,
    }),
  ]);

  const total = Number(totalCount) || 0;
  const rows = Array.isArray(items) ? items.map(serializeContainer) : [];
  const hasMore = offset + rows.length < total;

  return {
    items: rows,
    totalCount: total,
    limit,
    offset,
    nextOffset: hasMore ? offset + rows.length : null,
    hasMore,
    statusOptions: Array.isArray(groupedStatuses)
      ? groupedStatuses
          .map((entry) => asText(entry.status))
          .filter(Boolean)
          .sort((left, right) => left.localeCompare(right, "pl"))
      : [],
    terminalOptions: [...TERMINAL_OPTIONS],
  };
}

async function hydrateContainerById(prisma, containerId, fallbackRecord = {}) {
  if (typeof prisma?.container?.findUnique !== "function") {
    return serializeContainer(fallbackRecord);
  }

  const record = await prisma.container.findUnique({
    where: {
      id: containerId,
    },
    include: CONTAINER_INCLUDE,
  });

  return serializeContainer(record || fallbackRecord);
}

async function createContainer(prisma, input = {}) {
  if (!prisma?.container || !prisma?.containerAddition) {
    throw new Error("Prisma klient rej-cont nie jest gotowy.");
  }

  const normalized = normalizeCreateContainerInput(input);
  const actor = normalizeUserProfile(
    input.userProfile || input.addedBy || input.actor,
    { required: true }
  );
  const sourceKind = normalizeAdditionSourceKind(input.sourceKind || "MANUAL");

  return withTransaction(prisma, async (tx) => {
    const existing = await tx.container.findFirst({
      where: {
        number: normalized.number,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    let containerRecord = existing;
    let created = false;

    if (!containerRecord) {
      containerRecord = await tx.container.create({
        data: {
          number: normalized.number,
          ...(normalized.mrn ? { mrn: normalized.mrn } : {}),
          ...(normalized.stop ? { stop: normalized.stop } : {}),
          ...(normalized.status ? { status: normalized.status } : {}),
          ...(normalized.terminalName ? { terminalName: normalized.terminalName } : {}),
        },
      });
      created = true;
    }

    await tx.containerAddition.create({
      data: buildAdditionCreateInput(containerRecord.id, actor, {
        sourceKind,
        sourceFileName: input.sourceFileName,
        filePath: input.filePath,
        sourceSheetName: input.sourceSheetName,
      }),
    });

    return {
      created,
      container: await hydrateContainerById(tx, containerRecord.id, {
        ...containerRecord,
        additions: [actor],
      }),
    };
  });
}

async function importContainers(prisma, request = {}) {
  if (!prisma?.container || !prisma?.containerAddition) {
    throw new Error("Prisma klient rej-cont nie jest gotowy.");
  }

  const actor = normalizeUserProfile(
    request.userProfile || request.addedBy || request.actor,
    { required: true }
  );
  const normalizedContainers = normalizeImportedContainers(
    Array.isArray(request.containers) ? request.containers : request.numbers
  );
  const sourceKind = normalizeAdditionSourceKind(request.sourceKind || "IMPORT");
  const sourceFileName = asNullableText(request.sourceFileName || request.filePath);
  const sourceSheetName = asNullableText(request.sourceSheetName);
  const onProgress = typeof request.onProgress === "function" ? request.onProgress : null;
  const chunks = chunkValues(normalizedContainers.containers, request.chunkSize);

  if (normalizedContainers.containers.length === 0) {
    return {
      totalRequestedCount: normalizedContainers.totalCount,
      importedCount: 0,
      createdCount: 0,
      existingCount: 0,
      invalidCount: normalizedContainers.invalidCount,
      duplicateCount: normalizedContainers.duplicateCount,
      terminalResolvedCount: normalizedContainers.terminalResolvedCount,
      sourceFileName: sourceFileName ? path.basename(sourceFileName) : "",
      sourceSheetName: sourceSheetName || "",
      actor,
      chunkCount: 0,
    };
  }

  let createdCount = 0;
  let existingCount = 0;
  let processedCount = 0;

  onProgress?.({
    stage: "start",
    chunkIndex: 0,
    chunkCount: chunks.length,
    processedCount: 0,
    totalCount: normalizedContainers.containers.length,
    createdCount,
    existingCount,
    progress: 0,
    message: `Import startuje: 0 / ${normalizedContainers.containers.length} kontenerow.`,
  });

  for (const [chunkIndex, chunkContainers] of chunks.entries()) {
    const chunkNumbers = chunkContainers.map((container) => container.number);
    const existingRecords = await prisma.container.findMany({
      where: {
        number: {
          in: chunkNumbers,
        },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    const existingByNumber = new Map();
    existingRecords.forEach((record) => {
      const containerNumber = normalizeContainerNumber(record.number);
      if (!containerNumber || existingByNumber.has(containerNumber)) {
        return;
      }

      existingByNumber.set(containerNumber, record);
    });

    const missingContainers = chunkContainers.filter(
      (container) => !existingByNumber.has(container.number)
    );
    existingCount += chunkContainers.length - missingContainers.length;

    await createContainersBatch(prisma, missingContainers);
    createdCount += missingContainers.length;

    const hydratedRecords =
      missingContainers.length > 0
        ? await prisma.container.findMany({
            where: {
              number: {
                in: chunkNumbers,
              },
            },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          })
        : existingRecords;

    const containerIdsByNumber = new Map();
    hydratedRecords.forEach((record) => {
      const containerNumber = normalizeContainerNumber(record.number);
      if (!containerNumber || containerIdsByNumber.has(containerNumber)) {
        return;
      }

      containerIdsByNumber.set(containerNumber, record.id);
    });

    await createAdditionsBatch(
      prisma,
      chunkContainers.map((container) =>
        buildAdditionCreateInput(containerIdsByNumber.get(container.number), actor, {
          sourceKind,
          sourceFileName,
          sourceSheetName,
        })
      )
    );

    processedCount += chunkContainers.length;
    const progress = Math.round(
      (processedCount / normalizedContainers.containers.length) * 100
    );
    onProgress?.({
      stage: "chunk",
      chunkIndex: chunkIndex + 1,
      chunkCount: chunks.length,
      processedCount,
      totalCount: normalizedContainers.containers.length,
      createdCount,
      existingCount,
      progress,
      message: `Import chunk ${chunkIndex + 1}/${chunks.length}: ${processedCount}/${normalizedContainers.containers.length}, nowe ${createdCount}, istniejace ${existingCount}.`,
    });
  }

  return {
    totalRequestedCount: normalizedContainers.totalCount,
    importedCount: normalizedContainers.containers.length,
    createdCount,
    existingCount,
    invalidCount: normalizedContainers.invalidCount,
    duplicateCount: normalizedContainers.duplicateCount,
    terminalResolvedCount: normalizedContainers.terminalResolvedCount,
    sourceFileName: sourceFileName ? path.basename(sourceFileName) : "",
    sourceSheetName: sourceSheetName || "",
    actor,
    chunkCount: chunks.length,
  };
}

module.exports = {
  DEFAULT_IMPORT_CHUNK_SIZE,
  REJ_CONT_PAGE_SIZE,
  TERMINAL_OPTIONS,
  asText,
  buildContainerWhereInput,
  createContainer,
  importContainers,
  isValidContainerNumber,
  listContainers,
  normalizeContainerIds,
  normalizeContainerNumber,
  normalizeCreateContainerInput,
  normalizeImportedContainers,
  normalizeImportedContainerNumbers,
  normalizeTerminalName,
  parseImportedTerminalName,
  normalizeUserProfile,
  parseDateTimeValue,
  serializeContainer,
};

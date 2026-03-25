const REJ_CONT_PAGE_SIZE = 500;
const TERMINAL_OPTIONS = Object.freeze(["BCT", "DCT", "GCT"]);
const TERMINAL_SET = new Set(TERMINAL_OPTIONS);
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

async function createContainer(prisma, input = {}) {
  if (!prisma?.container) {
    throw new Error("Prisma klient rej-cont nie jest gotowy.");
  }

  const normalized = normalizeCreateContainerInput(input);
  const data = {
    number: normalized.number,
    ...(normalized.mrn ? { mrn: normalized.mrn } : {}),
    ...(normalized.stop ? { stop: normalized.stop } : {}),
    ...(normalized.status ? { status: normalized.status } : {}),
    ...(normalized.terminalName ? { terminalName: normalized.terminalName } : {}),
  };

  const created = await prisma.container.create({ data });
  return serializeContainer(created);
}

module.exports = {
  REJ_CONT_PAGE_SIZE,
  TERMINAL_OPTIONS,
  asText,
  buildContainerWhereInput,
  createContainer,
  listContainers,
  normalizeContainerIds,
  normalizeContainerNumber,
  normalizeCreateContainerInput,
  normalizeTerminalName,
  parseDateTimeValue,
  serializeContainer,
};

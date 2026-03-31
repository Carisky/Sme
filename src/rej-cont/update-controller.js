const { lookupBctContainers } = require("../../mini_apps/rej-cont/core/api/bct");
const { lookupDctContainers } = require("../../mini_apps/rej-cont/core/api/dct");
const { lookupGctContainers } = require("../../mini_apps/rej-cont/core/api/gct");
const { asText, normalizeContainerIds, normalizeContainerNumber } = require("./store");

const MIN_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

function asNullableText(value) {
  const text = asText(value);
  return text || null;
}

function createRejContUpdateController(options = {}) {
  const terminalHandlers = {
    BCT: options.lookupBctContainers || lookupBctContainers,
    DCT: options.lookupDctContainers || lookupDctContainers,
    GCT: options.lookupGctContainers || lookupGctContainers,
  };
  const nowFactory = options.nowFactory || (() => new Date());
  const minRefreshIntervalMs = Number(options.minRefreshIntervalMs) || MIN_REFRESH_INTERVAL_MS;

  async function updateContainers(prisma, request = {}) {
    if (!prisma?.container) {
      throw new Error("Prisma klient rej-cont nie jest gotowy.");
    }

    const containerIds = normalizeContainerIds(request.containerIds);
    if (!containerIds || containerIds.length === 0) {
      return {
        requestedCount: 0,
        foundCount: 0,
        dueCount: 0,
        updatedCount: 0,
        touchedCount: 0,
        skippedFreshCount: 0,
        skippedMissingTerminalCount: 0,
        skippedMissingRouteCount: 0,
        errors: [],
        terminals: [],
      };
    }

    const now = nowFactory();
    const staleBefore = new Date(now.getTime() - minRefreshIntervalMs);
    const records = await prisma.container.findMany({
      where: {
        id: {
          in: containerIds,
        },
      },
      orderBy: [{ id: "asc" }],
    });

    const buckets = {
      BCT: [],
      DCT: [],
      GCT: [],
    };
    const errors = [];
    let skippedFreshCount = 0;
    let skippedMissingTerminalCount = 0;
    let skippedMissingRouteCount = 0;

    for (const record of records) {
      if (record.lastRefreshTime && new Date(record.lastRefreshTime).getTime() > staleBefore.getTime()) {
        skippedFreshCount += 1;
        continue;
      }

      const terminalName = asText(record.terminalName).toUpperCase();
      if (!terminalName) {
        skippedMissingTerminalCount += 1;
        continue;
      }

      if (!terminalHandlers[terminalName]) {
        skippedMissingRouteCount += 1;
        continue;
      }

      const normalizedNumber = normalizeContainerNumber(record.number);
      if (!normalizedNumber) {
        continue;
      }

      buckets[terminalName].push({
        ...record,
        number: normalizedNumber,
      });
    }

    const dueCount = Object.values(buckets).reduce((sum, entries) => sum + entries.length, 0);
    const terminals = [];
    let updatedCount = 0;
    let touchedCount = 0;

    for (const [terminalName, terminalRecords] of Object.entries(buckets)) {
      if (terminalRecords.length === 0) {
        continue;
      }

      const lookupHandler = terminalHandlers[terminalName];
      try {
        const lookupResult = await lookupHandler(
          terminalRecords.map((record) => record.number)
        );
        const lookupMap = lookupResult?.map || {};
        const updates = terminalRecords.map((record) => {
          const payload = lookupMap[record.number];
          const data = {
            lastRefreshTime: now,
          };

          if (payload && typeof payload === "object") {
            if (Object.prototype.hasOwnProperty.call(payload, "mrn")) {
              data.mrn = asNullableText(payload.mrn);
            }
            if (Object.prototype.hasOwnProperty.call(payload, "stop")) {
              data.stop = asNullableText(payload.stop);
            }
            if (Object.prototype.hasOwnProperty.call(payload, "status")) {
              data.status = asNullableText(payload.status);
            }
            updatedCount += 1;
          }

          touchedCount += 1;

          return prisma.container.update({
            where: {
              id: record.id,
            },
            data,
          });
        });

        await prisma.$transaction(updates);
        terminals.push({
          terminalName,
          requestedCount: terminalRecords.length,
          updatedCount: terminalRecords.filter((record) => Boolean(lookupMap[record.number])).length,
          missingCount: Array.isArray(lookupResult?.missingContainers)
            ? lookupResult.missingContainers.length
            : 0,
        });
      } catch (error) {
        errors.push({
          terminalName,
          message: error.message,
        });
      }
    }

    return {
      requestedCount: containerIds.length,
      foundCount: records.length,
      dueCount,
      updatedCount,
      touchedCount,
      skippedFreshCount,
      skippedMissingTerminalCount,
      skippedMissingRouteCount,
      errors,
      terminals,
    };
  }

  return {
    updateContainers,
  };
}

const defaultController = createRejContUpdateController();

module.exports = {
  MIN_REFRESH_INTERVAL_MS,
  createRejContUpdateController,
  updateContainers: defaultController.updateContainers,
};

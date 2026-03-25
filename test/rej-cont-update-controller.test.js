const assert = require("node:assert/strict");
const {
  MIN_REFRESH_INTERVAL_MS,
  createRejContUpdateController,
} = require("../src/rej-cont/update-controller");

async function main() {
  const updates = [];
  const lookupCalls = [];
  const fixedNow = new Date("2026-03-25T12:10:00Z");

  const prisma = {
    container: {
      async findMany(args) {
        assert.deepEqual(args.where, {
          id: {
            in: [1, 2, 3, 4],
          },
        });

        return [
          {
            id: 1,
            number: "TCNU1123010",
            terminalName: "DCT",
            lastRefreshTime: new Date(fixedNow.getTime() - MIN_REFRESH_INTERVAL_MS - 60_000),
          },
          {
            id: 2,
            number: "MEDU5500906",
            terminalName: "DCT",
            lastRefreshTime: new Date(fixedNow.getTime() - 60_000),
          },
          {
            id: 3,
            number: "MSCU1234567",
            terminalName: "BCT",
            lastRefreshTime: new Date(fixedNow.getTime() - MIN_REFRESH_INTERVAL_MS - 120_000),
          },
          {
            id: 4,
            number: "OOLU7654321",
            terminalName: null,
            lastRefreshTime: new Date(fixedNow.getTime() - MIN_REFRESH_INTERVAL_MS - 120_000),
          },
        ];
      },
      update(args) {
        updates.push(args);
        return Promise.resolve(args);
      },
    },
    async $transaction(promises) {
      return Promise.all(promises);
    },
  };

  const controller = createRejContUpdateController({
    nowFactory: () => fixedNow,
    lookupDctContainers: async (containers) => {
      lookupCalls.push({
        terminalName: "DCT",
        containers,
      });
      return {
        terminalName: "DCT",
        map: {
          TCNU1123010: {
            mrn: "26PL322080NS5PR3M6",
            stop: "",
            status: "Departed",
          },
        },
      };
    },
    lookupBctContainers: async (containers) => {
      lookupCalls.push({
        terminalName: "BCT",
        containers,
      });
      return {
        terminalName: "BCT",
        map: {},
      };
    },
    lookupGctContainers: async (containers) => {
      lookupCalls.push({
        terminalName: "GCT",
        containers,
      });
      return {
        terminalName: "GCT",
        map: {},
      };
    },
  });

  const result = await controller.updateContainers(prisma, {
    containerIds: [1, 2, 3, 4],
  });

  assert.deepEqual(lookupCalls, [
    {
      terminalName: "BCT",
      containers: ["MSCU1234567"],
    },
    {
      terminalName: "DCT",
      containers: ["TCNU1123010"],
    },
  ]);

  assert.equal(result.requestedCount, 4);
  assert.equal(result.foundCount, 4);
  assert.equal(result.dueCount, 2);
  assert.equal(result.updatedCount, 1);
  assert.equal(result.touchedCount, 2);
  assert.equal(result.skippedFreshCount, 1);
  assert.equal(result.skippedMissingTerminalCount, 1);
  assert.equal(result.skippedMissingRouteCount, 0);
  assert.equal(result.errors.length, 0);
  assert.equal(updates.length, 2);

  assert.deepEqual(updates[0], {
    where: { id: 3 },
    data: {
      lastRefreshTime: fixedNow,
    },
  });
  assert.deepEqual(updates[1], {
    where: { id: 1 },
    data: {
      lastRefreshTime: fixedNow,
      mrn: "26PL322080NS5PR3M6",
      stop: null,
      status: "Departed",
    },
  });

  const emptyResult = await controller.updateContainers(prisma, {
    containerIds: [],
  });
  assert.equal(emptyResult.requestedCount, 0);
  assert.equal(emptyResult.updatedCount, 0);

  console.log("rej-cont update controller tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

const assert = require("node:assert/strict");
const {
  REJ_CONT_PAGE_SIZE,
  TERMINAL_OPTIONS,
  buildContainerWhereInput,
  createContainer,
  listContainers,
  normalizeContainerIds,
  normalizeCreateContainerInput,
} = require("../src/rej-cont/store");

async function main() {
  const normalized = normalizeCreateContainerInput({
    number: " mscu 1234567 ",
    mrn: " mrn-7788 ",
    stop: "",
    status: "",
    terminalName: "",
  });

  assert.equal(normalized.number, "MSCU1234567");
  assert.equal(normalized.mrn, "mrn-7788");
  assert.equal(normalized.stop, null);
  assert.equal(normalized.status, null);
  assert.equal(normalized.terminalName, null);
  assert.deepEqual(normalizeContainerIds([1, "2", 2, 0, -3, "abc", 5]), [1, 2, 5]);

  const where = buildContainerWhereInput({
    number: " mscu 123 ",
    containerIds: [77, "88"],
    status: "OPEN",
    terminalName: "GCT",
    createdAtFrom: "2026-03-01T00:00",
    createdAtTo: "2026-03-31T23:59",
    lastRefreshTimeFrom: "2026-03-20T08:00",
    lastRefreshTimeTo: "2026-03-25T12:00",
  });

  assert.ok(Array.isArray(where.AND));
  assert.deepEqual(where.AND[0], {
    number: { contains: "MSCU123", mode: "insensitive" },
  });
  assert.deepEqual(where.AND[1], { id: { in: [77, 88] } });
  assert.deepEqual(where.AND[2], { status: "OPEN" });
  assert.deepEqual(where.AND[3], { terminalName: "GCT" });
  assert.ok(where.AND[4].createdAt.gte instanceof Date);
  assert.ok(where.AND[4].createdAt.lte instanceof Date);
  assert.ok(where.AND[5].lastRefreshTime.gte instanceof Date);
  assert.ok(where.AND[5].lastRefreshTime.lte instanceof Date);

  const calls = {};
  const prisma = {
    container: {
      async count(args) {
        calls.count = args;
        return 702;
      },
      async findMany(args) {
        calls.findMany = args;
        return [
          {
            id: 77,
            number: "MSCU1234567",
            mrn: null,
            stop: null,
            lastRefreshTime: new Date("2026-03-25T10:00:00Z"),
            status: "OPEN",
            terminalName: null,
            createdAt: new Date("2026-03-24T08:30:00Z"),
          },
        ];
      },
      async groupBy(args) {
        calls.groupBy = args;
        return [{ status: "OPEN" }, { status: "CLOSED" }];
      },
      async create(args) {
        calls.create = args;
        return {
          id: 88,
          ...args.data,
          lastRefreshTime: new Date("2026-03-25T18:15:00Z"),
          createdAt: args.data.createdAt || new Date("2026-03-25T11:30:00Z"),
        };
      },
    },
  };

  const listed = await listContainers(prisma, {
    limit: 999,
    offset: 500,
    filters: {
      number: " mscu 123 ",
      containerIds: [77, "78", 78],
      status: "OPEN",
      terminalName: "BCT",
    },
  });

  assert.equal(calls.findMany.take, REJ_CONT_PAGE_SIZE);
  assert.equal(calls.findMany.skip, 500);
  assert.deepEqual(calls.count.where, {
    AND: [
      { number: { contains: "MSCU123", mode: "insensitive" } },
      { id: { in: [77, 78] } },
      { status: "OPEN" },
      { terminalName: "BCT" },
    ],
  });
  assert.deepEqual(calls.groupBy.where, {
    AND: [
      { number: { contains: "MSCU123", mode: "insensitive" } },
      { id: { in: [77, 78] } },
      { terminalName: "BCT" },
    ],
  });
  assert.equal(listed.totalCount, 702);
  assert.equal(listed.limit, REJ_CONT_PAGE_SIZE);
  assert.equal(listed.offset, 500);
  assert.equal(listed.hasMore, true);
  assert.equal(listed.nextOffset, 501);
  assert.deepEqual(listed.statusOptions, ["CLOSED", "OPEN"]);
  assert.deepEqual(listed.terminalOptions, TERMINAL_OPTIONS);
  assert.equal(listed.items[0].number, "MSCU1234567");
  assert.equal(listed.items[0].mrn, "");
  assert.equal(listed.items[0].terminalName, "");
  assert.match(listed.items[0].createdAt, /^2026-03-24T08:30:00/);

  const created = await createContainer(prisma, {
    number: " oolu 9911223 ",
  });

  assert.equal(calls.create.data.number, "OOLU9911223");
  assert.equal("mrn" in calls.create.data, false);
  assert.equal("stop" in calls.create.data, false);
  assert.equal("status" in calls.create.data, false);
  assert.equal("terminalName" in calls.create.data, false);
  assert.equal("lastRefreshTime" in calls.create.data, false);
  assert.equal("createdAt" in calls.create.data, false);
  assert.equal(created.number, "OOLU9911223");
  assert.equal(created.terminalName, "");
  assert.match(created.lastRefreshTime, /^2026-03-25T18:15:00/);

  const emptyObserved = await listContainers(prisma, {
    filters: {
      containerIds: [],
    },
  });
  assert.deepEqual(emptyObserved.items, []);
  assert.equal(emptyObserved.totalCount, 0);

  console.log("rej-cont store tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

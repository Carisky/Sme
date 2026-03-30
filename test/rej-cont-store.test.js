const assert = require("node:assert/strict");
const {
  REJ_CONT_PAGE_SIZE,
  TERMINAL_OPTIONS,
  buildContainerWhereInput,
  createContainer,
  importContainers,
  listContainers,
  normalizeContainerIds,
  normalizeCreateContainerInput,
  normalizeImportedContainers,
  normalizeImportedContainerNumbers,
  parseImportedTerminalName,
  normalizeUserProfile,
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
  assert.deepEqual(normalizeUserProfile({ fullName: " Jan Kowalski ", department: " Spedycja " }), {
    fullName: "Jan Kowalski",
    department: "Spedycja",
  });
  assert.throws(
    () => normalizeUserProfile({ fullName: "Jan Kowalski", department: "" }, { required: true }),
    /Dane uzytkownika/
  );
  assert.deepEqual(normalizeImportedContainerNumbers([" MSCU1234567 ", "bad", "MSCU1234567", "OOLU9911223"]), {
    totalCount: 4,
    numbers: ["MSCU1234567", "OOLU9911223"],
    invalidCount: 1,
    duplicateCount: 1,
  });
  assert.equal(parseImportedTerminalName("GDANSK DCT"), "DCT");
  assert.equal(parseImportedTerminalName("GDYNYA BCT"), "BCT");
  assert.equal(parseImportedTerminalName("gct"), "GCT");
  assert.equal(parseImportedTerminalName("brak"), null);
  assert.deepEqual(
    normalizeImportedContainers([
      { number: " MSCU1234567 ", terminalName: "GDANSK DCT" },
      { number: "bad", terminalName: "GDANSK DCT" },
      { number: "MSCU1234567", terminalName: "" },
      { number: "OOLU9911223", terminalName: "GDYNYA BCT" },
    ]),
    {
      totalCount: 4,
      containers: [
        { number: "MSCU1234567", terminalName: "DCT" },
        { number: "OOLU9911223", terminalName: "BCT" },
      ],
      invalidCount: 1,
      duplicateCount: 1,
      terminalResolvedCount: 2,
    }
  );

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

  const listCalls = {};
  const listPrisma = {
    container: {
      async count(args) {
        listCalls.count = args;
        return 702;
      },
      async findMany(args) {
        listCalls.findMany = args;
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
            additions: [
              { fullName: "Jan Kowalski", department: "Spedycja" },
              { fullName: "Jan Kowalski", department: "Spedycja" },
              { fullName: "Anna Nowak", department: "Import" },
            ],
          },
        ];
      },
      async groupBy(args) {
        listCalls.groupBy = args;
        return [{ status: "OPEN" }, { status: "CLOSED" }];
      },
    },
  };

  const listed = await listContainers(listPrisma, {
    limit: 999,
    offset: 500,
    filters: {
      number: " mscu 123 ",
      containerIds: [77, "78", 78],
      status: "OPEN",
      terminalName: "BCT",
    },
  });

  assert.equal(listCalls.findMany.take, REJ_CONT_PAGE_SIZE);
  assert.equal(listCalls.findMany.skip, 500);
  assert.deepEqual(listCalls.count.where, {
    AND: [
      { number: { contains: "MSCU123", mode: "insensitive" } },
      { id: { in: [77, 78] } },
      { status: "OPEN" },
      { terminalName: "BCT" },
    ],
  });
  assert.deepEqual(listCalls.groupBy.where, {
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
  assert.deepEqual(listed.items[0].addedBy, [
    { fullName: "Jan Kowalski", department: "Spedycja" },
    { fullName: "Anna Nowak", department: "Import" },
  ]);
  assert.match(listed.items[0].createdAt, /^2026-03-24T08:30:00/);

  const createCalls = { created: [], additions: [] };
  const createTx = {
    container: {
      async findFirst() {
        return null;
      },
      async create(args) {
        createCalls.created.push(args);
        return {
          id: 88,
          ...args.data,
          lastRefreshTime: new Date("2026-03-25T18:15:00Z"),
          createdAt: new Date("2026-03-25T11:30:00Z"),
        };
      },
      async findUnique() {
        return {
          id: 88,
          number: "OOLU9911223",
          mrn: null,
          stop: null,
          status: null,
          terminalName: null,
          lastRefreshTime: new Date("2026-03-25T18:15:00Z"),
          createdAt: new Date("2026-03-25T11:30:00Z"),
          additions: [{ fullName: "Jan Kowalski", department: "Spedycja" }],
        };
      },
    },
    containerAddition: {
      async create(args) {
        createCalls.additions.push(args);
        return args;
      },
    },
  };
  const createPrisma = {
    ...createTx,
    async $transaction(callback) {
      return callback(createTx);
    },
  };

  const created = await createContainer(createPrisma, {
    number: " oolu 9911223 ",
    userProfile: { fullName: "Jan Kowalski", department: "Spedycja" },
  });

  assert.equal(createCalls.created[0].data.number, "OOLU9911223");
  assert.equal("mrn" in createCalls.created[0].data, false);
  assert.equal(createCalls.additions[0].data.sourceKind, "MANUAL");
  assert.equal(created.created, true);
  assert.equal(created.container.number, "OOLU9911223");
  assert.deepEqual(created.container.addedBy, [
    { fullName: "Jan Kowalski", department: "Spedycja" },
  ]);

  const existingCalls = { additions: [], created: 0 };
  const existingTx = {
    container: {
      async findFirst() {
        return {
          id: 91,
          number: "MSCU1234567",
          createdAt: new Date("2026-03-01T08:00:00Z"),
        };
      },
      async create() {
        existingCalls.created += 1;
        throw new Error("create should not be called");
      },
      async findUnique() {
        return {
          id: 91,
          number: "MSCU1234567",
          mrn: null,
          stop: null,
          status: null,
          terminalName: null,
          lastRefreshTime: new Date("2026-03-25T18:15:00Z"),
          createdAt: new Date("2026-03-01T08:00:00Z"),
          additions: [
            { fullName: "Adam Test", department: "Magazyn" },
            { fullName: "Jan Kowalski", department: "Spedycja" },
          ],
        };
      },
    },
    containerAddition: {
      async create(args) {
        existingCalls.additions.push(args);
        return args;
      },
    },
  };
  const existingPrisma = {
    ...existingTx,
    async $transaction(callback) {
      return callback(existingTx);
    },
  };

  const existingResult = await createContainer(existingPrisma, {
    number: " MSCU1234567 ",
    userProfile: { fullName: "Jan Kowalski", department: "Spedycja" },
  });

  assert.equal(existingCalls.created, 0);
  assert.equal(existingCalls.additions.length, 1);
  assert.equal(existingResult.created, false);
  assert.equal(existingResult.container.number, "MSCU1234567");

  const importCalls = { creates: [], additions: [] };
  const importProgress = [];
  let createdId = 200;
  const importedRecords = [
    {
      id: 10,
      number: "MSCU1234567",
      createdAt: new Date("2026-03-01T08:00:00Z"),
    },
  ];
  const importTx = {
    container: {
      async findMany(args) {
        assert.deepEqual(args.where.number.in, ["MSCU1234567", "OOLU9911223", "TCNU1122334"]);
        return importedRecords.filter((record) => args.where.number.in.includes(record.number));
      },
      async create(args) {
        importCalls.creates.push(args);
        createdId += 1;
        const createdRecord = {
          id: createdId,
          ...args.data,
          createdAt: new Date("2026-03-25T11:30:00Z"),
        };
        importedRecords.push(createdRecord);
        return createdRecord;
      },
    },
    containerAddition: {
      async create(args) {
        importCalls.additions.push(args);
        return args;
      },
    },
  };
  const importPrisma = {
    ...importTx,
    async $transaction(callback) {
      return callback(importTx);
    },
  };

  const imported = await importContainers(importPrisma, {
    containers: [
      { number: " MSCU1234567 ", terminalName: "GDANSK DCT" },
      { number: "OOLU9911223", terminalName: "GDYNYA BCT" },
      { number: "bad", terminalName: "GDANSK DCT" },
      { number: "OOLU9911223", terminalName: "GDYNYA BCT" },
      { number: "TCNU1122334", terminalName: "GCT" },
    ],
    userProfile: { fullName: "Jan Kowalski", department: "Spedycja" },
    sourceKind: "IMPORT",
    sourceFileName: "containers.xlsx",
    sourceSheetName: "Sheet1",
    onProgress(payload) {
      importProgress.push(payload);
    },
  });

  assert.equal(imported.totalRequestedCount, 5);
  assert.equal(imported.importedCount, 3);
  assert.equal(imported.createdCount, 2);
  assert.equal(imported.existingCount, 1);
  assert.equal(imported.invalidCount, 1);
  assert.equal(imported.duplicateCount, 1);
  assert.equal(imported.terminalResolvedCount, 3);
  assert.equal(importCalls.creates.length, 2);
  assert.equal(importCalls.additions.length, 3);
  assert.equal(importCalls.additions[0].data.sourceKind, "IMPORT");
  assert.equal(importCalls.additions[0].data.sourceFileName, "containers.xlsx");
  assert.equal(importCalls.additions[0].data.sourceSheetName, "Sheet1");
  assert.deepEqual(
    importCalls.additions.map((entry) => entry.data.containerId),
    [10, 201, 202]
  );
  assert.equal(importCalls.creates[0].data.terminalName, "BCT");
  assert.equal(importCalls.creates[1].data.terminalName, "GCT");
  assert.equal(imported.chunkCount, 1);
  assert.equal(importProgress.length, 2);
  assert.equal(importProgress[0].stage, "start");
  assert.equal(importProgress[1].stage, "chunk");
  assert.equal(importProgress[1].processedCount, 3);

  const emptyObserved = await listContainers(listPrisma, {
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

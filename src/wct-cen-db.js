const fs = require("fs/promises");
const path = require("path");
const { pathToFileURL } = require("url");
const { createClient } = require("@libsql/client");
const {
  normalizeContainerNumber,
  normalizeLookupRecord,
} = require("../mini_apps/wct-cen/core/index.cjs");

const DEFAULT_WCT_CEN_DB_NAME = "wct_cen_db.sqlite";

function getDefaultWctCenDbPath(appDataPath) {
  return path.join(appDataPath, "SME", DEFAULT_WCT_CEN_DB_NAME);
}

function resolveWctCenDbPath(dbPath, appDataPath) {
  const normalized = String(dbPath || "").trim();
  return normalized || getDefaultWctCenDbPath(appDataPath);
}

async function withDb(dbPath, handler) {
  await fs.mkdir(path.dirname(dbPath), { recursive: true });
  const client = createClient({
    url: pathToFileURL(dbPath).href,
  });

  try {
    await ensureSchema(client);
    return await handler(client);
  } finally {
    client.close();
  }
}

async function ensureSchema(client) {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS "ContainerLookup" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT,
      "containerNumber" TEXT NOT NULL,
      "cen" TEXT NOT NULL DEFAULT '',
      "tState" TEXT NOT NULL DEFAULT '',
      "stop" TEXT NOT NULL DEFAULT '',
      "source" TEXT NOT NULL DEFAULT 'manual',
      "createdAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "ContainerLookup_containerNumber_key"
      ON "ContainerLookup" ("containerNumber");
  `);
}

function mapLookupRow(row = {}) {
  return normalizeLookupRecord({
    containerNumber: row.containerNumber,
    cen: row.cen,
    tState: row.tState,
    stop: row.stop,
    source: row.source,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

async function listLookupRecords(dbPath, options = {}) {
  const search = normalizeContainerNumber(options.search || "");
  const limit = Math.max(1, Math.min(Number(options.limit) || 200, 1000));

  return withDb(dbPath, async (client) => {
    let result;
    if (search) {
      result = await client.execute({
        sql: `
          SELECT "containerNumber", "cen", "tState", "stop", "source", "createdAt", "updatedAt"
          FROM "ContainerLookup"
          WHERE "containerNumber" LIKE ?
          ORDER BY "updatedAt" DESC, "containerNumber" ASC
          LIMIT ?
        `,
        args: [`%${search}%`, limit],
      });
    } else {
      result = await client.execute({
        sql: `
          SELECT "containerNumber", "cen", "tState", "stop", "source", "createdAt", "updatedAt"
          FROM "ContainerLookup"
          ORDER BY "updatedAt" DESC, "containerNumber" ASC
          LIMIT ?
        `,
        args: [limit],
      });
    }

    return result.rows.map(mapLookupRow);
  });
}

async function findLookupRecordsByContainers(dbPath, containers = []) {
  const normalized = Array.from(
    new Set(containers.map(normalizeContainerNumber).filter(Boolean))
  );

  if (normalized.length === 0) {
    return [];
  }

  const placeholders = normalized.map(() => "?").join(", ");
  return withDb(dbPath, async (client) => {
    const result = await client.execute({
      sql: `
        SELECT "containerNumber", "cen", "tState", "stop", "source", "createdAt", "updatedAt"
        FROM "ContainerLookup"
        WHERE "containerNumber" IN (${placeholders})
      `,
      args: normalized,
    });

    return result.rows.map(mapLookupRow);
  });
}

async function saveLookupRecord(dbPath, record, source = "manual") {
  const normalized = normalizeLookupRecord({
    ...record,
    source,
  });

  if (!normalized.containerNumber) {
    throw new Error("Container Number jest wymagany.");
  }

  return withDb(dbPath, async (client) => {
    await client.execute({
      sql: `
        INSERT INTO "ContainerLookup" ("containerNumber", "cen", "tState", "stop", "source")
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT("containerNumber") DO UPDATE SET
          "cen" = excluded."cen",
          "tState" = excluded."tState",
          "stop" = excluded."stop",
          "source" = excluded."source",
          "updatedAt" = CURRENT_TIMESTAMP
      `,
      args: [
        normalized.containerNumber,
        normalized.cen,
        normalized.tState,
        normalized.stop,
        normalized.source,
      ],
    });

    const saved = await client.execute({
      sql: `
        SELECT "containerNumber", "cen", "tState", "stop", "source", "createdAt", "updatedAt"
        FROM "ContainerLookup"
        WHERE "containerNumber" = ?
        LIMIT 1
      `,
      args: [normalized.containerNumber],
    });

    return mapLookupRow(saved.rows[0] || normalized);
  });
}

async function saveLookupRecords(dbPath, records = [], source = "lookup") {
  const normalized = records
    .map((record) => normalizeLookupRecord({ ...record, source }))
    .filter((record) => record.containerNumber);

  if (normalized.length === 0) {
    return [];
  }

  return withDb(dbPath, async (client) => {
    const transaction = await client.transaction("write");

    try {
      for (const record of normalized) {
        await transaction.execute({
          sql: `
            INSERT INTO "ContainerLookup" ("containerNumber", "cen", "tState", "stop", "source")
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT("containerNumber") DO UPDATE SET
              "cen" = excluded."cen",
              "tState" = excluded."tState",
              "stop" = excluded."stop",
              "source" = excluded."source",
              "updatedAt" = CURRENT_TIMESTAMP
          `,
          args: [
            record.containerNumber,
            record.cen,
            record.tState,
            record.stop,
            record.source,
          ],
        });
      }

      await transaction.commit();
    } finally {
      transaction.close();
    }

    return normalized;
  });
}

module.exports = {
  DEFAULT_WCT_CEN_DB_NAME,
  findLookupRecordsByContainers,
  getDefaultWctCenDbPath,
  listLookupRecords,
  resolveWctCenDbPath,
  saveLookupRecord,
  saveLookupRecords,
};

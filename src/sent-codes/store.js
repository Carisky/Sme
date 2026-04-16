const fs = require("fs/promises");
const path = require("path");
const { pathToFileURL } = require("url");
const { createClient } = require("@libsql/client");
const { normalizeSentCode } = require("./normalize");

const DEFAULT_SENT_CODES_DB_NAME = "sent_codes.db";
const INSERT_CHUNK_SIZE = 500;

function getDefaultSentCodesDbPath(appDataPath) {
  return path.join(appDataPath, "SME", DEFAULT_SENT_CODES_DB_NAME);
}

function resolveSentCodesDbPath(dbPath, appDataPath) {
  const normalized = String(dbPath || "").trim();
  return normalized || getDefaultSentCodesDbPath(appDataPath);
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

async function ensureSentTable(client) {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS "SENT" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT,
      "code" TEXT NOT NULL,
      "codeNormalized" TEXT NOT NULL DEFAULT ''
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "SENT_code_key"
      ON "SENT" ("code");
  `);

  const tableInfo = await client.execute({
    sql: `PRAGMA table_info("SENT")`,
  });
  const hasNormalizedColumn = (tableInfo.rows || []).some((row) => {
    const columnName = String(row?.name ?? row?.NAME ?? "").trim();
    return columnName === "codeNormalized";
  });

  if (!hasNormalizedColumn) {
    await client.execute({
      sql: `ALTER TABLE "SENT" ADD COLUMN "codeNormalized" TEXT NOT NULL DEFAULT ''`,
    });
  }

  await client.execute({
    sql: `DROP INDEX IF EXISTS "SENT_codeNormalized_key"`,
  });

  await client.execute({
    sql: `
      UPDATE "SENT"
      SET "codeNormalized" = TRIM(
        REPLACE(
          REPLACE(
            REPLACE(
              REPLACE(
                REPLACE(
                  REPLACE("code", ' ', ''),
                char(9), ''),
              char(10), ''),
            char(13), ''),
          '"', ''),
        '''', '')
      )
      WHERE "codeNormalized" IS NULL OR TRIM("codeNormalized") = ''
    `,
  });

  await client.execute({
    sql: `CREATE INDEX IF NOT EXISTS "SENT_codeNormalized_idx" ON "SENT" ("codeNormalized")`,
  });
}

async function ensureImportTables(client) {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS "SENT_IMPORTED" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT,
      "codeNormalized" TEXT NOT NULL,
      "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
      "createdAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "SENT_IMPORTED_codeNormalized_key"
      ON "SENT_IMPORTED" ("codeNormalized");

    CREATE TABLE IF NOT EXISTS "SENT_IMPORT_META" (
      "id" INTEGER PRIMARY KEY CHECK ("id" = 1),
      "fileName" TEXT NOT NULL DEFAULT '',
      "filePath" TEXT NOT NULL DEFAULT '',
      "sheetName" TEXT NOT NULL DEFAULT '',
      "columnName" TEXT NOT NULL DEFAULT '',
      "columnIndex" INTEGER NOT NULL DEFAULT -1,
      "importedAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "sourceRowCount" INTEGER NOT NULL DEFAULT 0,
      "nonEmptyRowCount" INTEGER NOT NULL DEFAULT 0,
      "totalExtracted" INTEGER NOT NULL DEFAULT 0,
      "uniqueCount" INTEGER NOT NULL DEFAULT 0,
      "invalidCellCount" INTEGER NOT NULL DEFAULT 0
    );
  `);
}

async function ensureSchema(client) {
  await client.executeMultiple(`
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
  `);

  await ensureSentTable(client);
  await ensureImportTables(client);
}

function getCountValue(row = {}) {
  if (row.count !== undefined) {
    return Number(row.count) || 0;
  }
  if (row.COUNT !== undefined) {
    return Number(row.COUNT) || 0;
  }
  return 0;
}

function normalizeApiCodeEntries(codes = []) {
  const codeByNormalized = new Map();

  for (const rawCode of codes) {
    const normalized = normalizeSentCode(rawCode);
    if (!normalized) {
      continue;
    }

    if (!codeByNormalized.has(normalized)) {
      codeByNormalized.set(normalized, normalized);
    }
  }

  return Array.from(codeByNormalized.entries())
    .map(([codeNormalized, code]) => ({
      code,
      codeNormalized,
    }))
    .sort((left, right) => left.code.localeCompare(right.code, "pl"));
}

function normalizeImportedEntries(entries = []) {
  const counters = new Map();
  for (const entry of entries) {
    const normalized = normalizeSentCode(entry?.code);
    if (!normalized) {
      continue;
    }

    const occurrenceCount = Math.max(1, Number(entry?.occurrenceCount) || 0);
    counters.set(normalized, (counters.get(normalized) || 0) + occurrenceCount);
  }

  return Array.from(counters.entries())
    .map(([codeNormalized, occurrenceCount]) => ({
      codeNormalized,
      occurrenceCount,
    }))
    .sort((left, right) => left.codeNormalized.localeCompare(right.codeNormalized, "pl"));
}

async function replaceSentCodes(dbPath, codes = []) {
  const normalizedEntries = normalizeApiCodeEntries(codes);

  return withDb(dbPath, async (client) => {
    const transaction = await client.transaction("write");

    try {
      await transaction.execute({
        sql: `DELETE FROM "SENT"`,
      });

      for (
        let chunkStartIndex = 0;
        chunkStartIndex < normalizedEntries.length;
        chunkStartIndex += INSERT_CHUNK_SIZE
      ) {
        const chunk = normalizedEntries.slice(
          chunkStartIndex,
          chunkStartIndex + INSERT_CHUNK_SIZE
        );
        if (chunk.length === 0) {
          continue;
        }

        const placeholders = chunk.map(() => "(?, ?)").join(", ");
        await transaction.execute({
          sql: `INSERT INTO "SENT" ("code", "codeNormalized") VALUES ${placeholders}`,
          args: chunk.flatMap((entry) => [entry.code, entry.codeNormalized]),
        });
      }

      await transaction.commit();
    } finally {
      transaction.close();
    }

    return {
      savedCount: normalizedEntries.length,
    };
  });
}

async function listSentCodes(dbPath, options = {}) {
  const limit = Math.max(1, Math.min(Number(options.limit) || 200, 1000));
  const offset = Math.max(0, Number(options.offset) || 0);

  return withDb(dbPath, async (client) => {
    const countResult = await client.execute({
      sql: `SELECT COUNT(*) AS count FROM "SENT"`,
    });
    const totalCount = getCountValue(countResult.rows[0]);
    const rowsResult = await client.execute({
      sql: `
        SELECT "id", "code", "codeNormalized"
        FROM "SENT"
        ORDER BY "code" ASC
        LIMIT ?
        OFFSET ?
      `,
      args: [limit, offset],
    });

    return {
      items: rowsResult.rows.map((row) => ({
        id: Number(row.id) || 0,
        code: String(row.code || "").trim(),
        codeNormalized: String(row.codeNormalized || "").trim(),
      })),
      totalCount,
      limit,
      offset,
    };
  });
}

function normalizeImportMeta(meta = {}) {
  return {
    fileName: String(meta.fileName || "").trim(),
    filePath: String(meta.filePath || "").trim(),
    sheetName: String(meta.sheetName || "").trim(),
    columnName: String(meta.columnName || "").trim(),
    columnIndex: Number.isInteger(Number(meta.columnIndex)) ? Number(meta.columnIndex) : -1,
    sourceRowCount: Math.max(0, Number(meta.sourceRowCount) || 0),
    nonEmptyRowCount: Math.max(0, Number(meta.nonEmptyRowCount) || 0),
    totalExtracted: Math.max(0, Number(meta.totalExtracted) || 0),
    uniqueCount: Math.max(0, Number(meta.uniqueCount) || 0),
    invalidCellCount: Math.max(0, Number(meta.invalidCellCount) || 0),
    importedAt: String(meta.importedAt || "").trim() || new Date().toISOString(),
  };
}

async function replaceImportedSentCodes(dbPath, entries = [], meta = {}) {
  const normalizedEntries = normalizeImportedEntries(entries);
  const normalizedMeta = normalizeImportMeta({
    ...meta,
    uniqueCount: normalizedEntries.length,
  });

  return withDb(dbPath, async (client) => {
    const transaction = await client.transaction("write");

    try {
      await transaction.execute({
        sql: `DELETE FROM "SENT_IMPORTED"`,
      });

      for (
        let chunkStartIndex = 0;
        chunkStartIndex < normalizedEntries.length;
        chunkStartIndex += INSERT_CHUNK_SIZE
      ) {
        const chunk = normalizedEntries.slice(
          chunkStartIndex,
          chunkStartIndex + INSERT_CHUNK_SIZE
        );
        if (chunk.length === 0) {
          continue;
        }

        const placeholders = chunk.map(() => "(?, ?)").join(", ");
        await transaction.execute({
          sql: `
            INSERT INTO "SENT_IMPORTED" ("codeNormalized", "occurrenceCount")
            VALUES ${placeholders}
          `,
          args: chunk.flatMap((entry) => [entry.codeNormalized, entry.occurrenceCount]),
        });
      }

      await transaction.execute({
        sql: `DELETE FROM "SENT_IMPORT_META" WHERE "id" = 1`,
      });
      await transaction.execute({
        sql: `
          INSERT INTO "SENT_IMPORT_META" (
            "id",
            "fileName",
            "filePath",
            "sheetName",
            "columnName",
            "columnIndex",
            "importedAt",
            "sourceRowCount",
            "nonEmptyRowCount",
            "totalExtracted",
            "uniqueCount",
            "invalidCellCount"
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          1,
          normalizedMeta.fileName,
          normalizedMeta.filePath,
          normalizedMeta.sheetName,
          normalizedMeta.columnName,
          normalizedMeta.columnIndex,
          normalizedMeta.importedAt,
          normalizedMeta.sourceRowCount,
          normalizedMeta.nonEmptyRowCount,
          normalizedMeta.totalExtracted,
          normalizedMeta.uniqueCount,
          normalizedMeta.invalidCellCount,
        ],
      });

      await transaction.commit();
    } finally {
      transaction.close();
    }

    return {
      importedCount: normalizedEntries.length,
      importMeta: normalizedMeta,
    };
  });
}

async function listSentCheckRows(dbPath, options = {}) {
  const limit = Math.max(1, Math.min(Number(options.limit) || 200, 1000));
  const offset = Math.max(0, Number(options.offset) || 0);

  return withDb(dbPath, async (client) => {
    const totalResult = await client.execute({
      sql: `SELECT COUNT(*) AS count FROM "SENT_IMPORTED"`,
    });
    const totalCount = getCountValue(totalResult.rows[0]);

    const matchedResult = await client.execute({
      sql: `
        SELECT COUNT(*) AS count
        FROM "SENT_IMPORTED" AS "i"
        INNER JOIN "SENT" AS "s" ON "s"."codeNormalized" = "i"."codeNormalized"
      `,
    });
    const matchedCount = getCountValue(matchedResult.rows[0]);
    const missingCount = Math.max(totalCount - matchedCount, 0);

    const rowsResult = await client.execute({
      sql: `
        SELECT
          "i"."id" AS "id",
          "i"."codeNormalized" AS "codeNormalized",
          "i"."occurrenceCount" AS "occurrenceCount",
          "s"."code" AS "apiCode"
        FROM "SENT_IMPORTED" AS "i"
        LEFT JOIN "SENT" AS "s" ON "s"."codeNormalized" = "i"."codeNormalized"
        ORDER BY "i"."codeNormalized" ASC
        LIMIT ?
        OFFSET ?
      `,
      args: [limit, offset],
    });

    const importMetaResult = await client.execute({
      sql: `SELECT * FROM "SENT_IMPORT_META" WHERE "id" = 1 LIMIT 1`,
    });
    const importMeta = importMetaResult.rows[0]
      ? {
          fileName: String(importMetaResult.rows[0].fileName || "").trim(),
          filePath: String(importMetaResult.rows[0].filePath || "").trim(),
          sheetName: String(importMetaResult.rows[0].sheetName || "").trim(),
          columnName: String(importMetaResult.rows[0].columnName || "").trim(),
          columnIndex: Number(importMetaResult.rows[0].columnIndex) || -1,
          importedAt: String(importMetaResult.rows[0].importedAt || "").trim(),
          sourceRowCount: Number(importMetaResult.rows[0].sourceRowCount) || 0,
          nonEmptyRowCount: Number(importMetaResult.rows[0].nonEmptyRowCount) || 0,
          totalExtracted: Number(importMetaResult.rows[0].totalExtracted) || 0,
          uniqueCount: Number(importMetaResult.rows[0].uniqueCount) || 0,
          invalidCellCount: Number(importMetaResult.rows[0].invalidCellCount) || 0,
        }
      : null;

    return {
      items: rowsResult.rows.map((row) => ({
        id: Number(row.id) || 0,
        code: String(row.codeNormalized || "").trim(),
        occurrenceCount: Number(row.occurrenceCount) || 0,
        existsInApi: Boolean(String(row.apiCode || "").trim()),
        apiCode: String(row.apiCode || "").trim(),
      })),
      totalCount,
      matchedCount,
      missingCount,
      limit,
      offset,
      importMeta,
    };
  });
}

module.exports = {
  getDefaultSentCodesDbPath,
  listSentCheckRows,
  listSentCodes,
  replaceImportedSentCodes,
  replaceSentCodes,
  resolveSentCodesDbPath,
};

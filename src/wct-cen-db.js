const fs = require("fs/promises");
const path = require("path");
const { pathToFileURL } = require("url");
const { createClient } = require("@libsql/client");
const {
  asText,
  normalizeContainerNumber,
  normalizeLookupRecord,
  normalizeState,
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
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
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
    CREATE TABLE IF NOT EXISTS "WctCenProject" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT,
      "projectName" TEXT NOT NULL,
      "projectNameKey" TEXT NOT NULL,
      "sourceFileName" TEXT NOT NULL DEFAULT '',
      "sourceFilePath" TEXT NOT NULL DEFAULT '',
      "fileName" TEXT NOT NULL DEFAULT '',
      "fileLocation" TEXT NOT NULL DEFAULT '',
      "rowCount" INTEGER NOT NULL DEFAULT 0,
      "stateJson" TEXT NOT NULL,
      "createdAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "WctCenProject_projectNameKey_key"
      ON "WctCenProject" ("projectNameKey");
    CREATE INDEX IF NOT EXISTS "WctCenProject_updatedAt_idx"
      ON "WctCenProject" ("updatedAt" DESC);
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

function buildProjectNameKey(value) {
  return asText(value)
    .toLocaleLowerCase("pl")
    .replace(/\s+/g, " ")
    .trim();
}

function deriveProjectName(state = {}) {
  const sourceFileName = asText(state.sourceFileName);
  const fileName = asText(state.fileName);
  const projectName = asText(state.projectName);
  const fallback =
    projectName ||
    fileName ||
    (sourceFileName ? path.parse(sourceFileName).name : "") ||
    "Projekt WCT CEN";
  return fallback || "Projekt WCT CEN";
}

function normalizeProjectState(state = {}, dbPath) {
  const normalized = normalizeState({
    ...state,
    dbPath,
  });
  const projectName = deriveProjectName(normalized);

  return normalizeState({
    ...normalized,
    projectName,
    dbPath,
  });
}

function mapProjectSummary(row = {}) {
  return {
    id: Number(row.id) || 0,
    projectName: asText(row.projectName),
    sourceFileName: asText(row.sourceFileName),
    rowCount: Number(row.rowCount) || 0,
    createdAt: asText(row.createdAt),
    updatedAt: asText(row.updatedAt),
  };
}

function parseProjectState(row = {}, dbPath) {
  try {
    return normalizeProjectState(JSON.parse(asText(row.stateJson) || "{}"), dbPath);
  } catch {
    return normalizeProjectState(
      {
        projectName: asText(row.projectName),
        sourceFileName: asText(row.sourceFileName),
        sourceFilePath: asText(row.sourceFilePath),
        fileName: asText(row.fileName),
        fileLocation: asText(row.fileLocation),
        rows: [],
      },
      dbPath
    );
  }
}

function mapProjectRecord(row = {}, dbPath) {
  return {
    project: mapProjectSummary(row),
    state: parseProjectState(row, dbPath),
  };
}

async function findProjectRowById(client, projectId) {
  const normalizedId = Number(projectId) || 0;
  if (normalizedId <= 0) {
    return null;
  }

  const result = await client.execute({
    sql: `
      SELECT
        "id",
        "projectName",
        "projectNameKey",
        "sourceFileName",
        "sourceFilePath",
        "fileName",
        "fileLocation",
        "rowCount",
        "stateJson",
        "createdAt",
        "updatedAt"
      FROM "WctCenProject"
      WHERE "id" = ?
      LIMIT 1
    `,
    args: [normalizedId],
  });

  return result.rows[0] || null;
}

async function findProjectRowByNameKey(client, projectNameKey) {
  const normalizedKey = buildProjectNameKey(projectNameKey);
  if (!normalizedKey) {
    return null;
  }

  const result = await client.execute({
    sql: `
      SELECT
        "id",
        "projectName",
        "projectNameKey",
        "sourceFileName",
        "sourceFilePath",
        "fileName",
        "fileLocation",
        "rowCount",
        "stateJson",
        "createdAt",
        "updatedAt"
      FROM "WctCenProject"
      WHERE "projectNameKey" = ?
      LIMIT 1
    `,
    args: [normalizedKey],
  });

  return result.rows[0] || null;
}

async function listProjectSummaries(dbPath, options = {}) {
  const search = asText(options.search);
  const searchKey = buildProjectNameKey(search);
  const limit = Math.max(1, Math.min(Number(options.limit) || 25, 200));

  return withDb(dbPath, async (client) => {
    let result;
    if (searchKey) {
      result = await client.execute({
        sql: `
          SELECT "id", "projectName", "sourceFileName", "rowCount", "createdAt", "updatedAt"
          FROM "WctCenProject"
          WHERE "projectNameKey" LIKE ? OR "sourceFileName" LIKE ?
          ORDER BY "updatedAt" DESC, "projectName" ASC
          LIMIT ?
        `,
        args: [`%${searchKey}%`, `%${search}%`, limit],
      });
    } else {
      result = await client.execute({
        sql: `
          SELECT "id", "projectName", "sourceFileName", "rowCount", "createdAt", "updatedAt"
          FROM "WctCenProject"
          ORDER BY "updatedAt" DESC, "projectName" ASC
          LIMIT ?
        `,
        args: [limit],
      });
    }

    return result.rows.map(mapProjectSummary);
  });
}

async function getProjectByName(dbPath, projectName) {
  const projectNameKey = buildProjectNameKey(projectName);
  if (!projectNameKey) {
    return null;
  }

  return withDb(dbPath, async (client) => {
    const row = await findProjectRowByNameKey(client, projectNameKey);
    return row ? mapProjectRecord(row, dbPath) : null;
  });
}

async function getProjectById(dbPath, projectId) {
  return withDb(dbPath, async (client) => {
    const row = await findProjectRowById(client, projectId);
    return row ? mapProjectRecord(row, dbPath) : null;
  });
}

async function saveProjectState(dbPath, state, options = {}) {
  const normalizedState = normalizeProjectState(
    {
      ...state,
      projectName: asText(options.projectName) || asText(state?.projectName),
    },
    dbPath
  );
  const projectNameKey = buildProjectNameKey(normalizedState.projectName);
  const currentProjectId = Number(options.projectId) || 0;
  const createOnly = Boolean(options.createOnly);

  if (!projectNameKey) {
    throw new Error("Nazwa projektu jest wymagana.");
  }

  return withDb(dbPath, async (client) => {
    const currentRow = currentProjectId > 0
      ? await findProjectRowById(client, currentProjectId)
      : null;
    const duplicateByName = await findProjectRowByNameKey(client, projectNameKey);

    if (createOnly && duplicateByName) {
      throw new Error(`Projekt "${normalizedState.projectName}" juz istnieje.`);
    }

    if (
      currentRow &&
      duplicateByName &&
      Number(currentRow.id) !== Number(duplicateByName.id)
    ) {
      throw new Error(`Projekt "${normalizedState.projectName}" juz istnieje.`);
    }

    const targetRow = currentRow || (!createOnly ? duplicateByName : null);
    const rowCount = Array.isArray(normalizedState.rows) ? normalizedState.rows.length : 0;
    const stateJson = JSON.stringify(normalizedState);

    if (targetRow) {
      await client.execute({
        sql: `
          UPDATE "WctCenProject"
          SET
            "projectName" = ?,
            "projectNameKey" = ?,
            "sourceFileName" = ?,
            "sourceFilePath" = ?,
            "fileName" = ?,
            "fileLocation" = ?,
            "rowCount" = ?,
            "stateJson" = ?,
            "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ?
        `,
        args: [
          normalizedState.projectName,
          projectNameKey,
          normalizedState.sourceFileName,
          normalizedState.sourceFilePath,
          normalizedState.fileName,
          normalizedState.fileLocation,
          rowCount,
          stateJson,
          Number(targetRow.id),
        ],
      });
    } else {
      await client.execute({
        sql: `
          INSERT INTO "WctCenProject" (
            "projectName",
            "projectNameKey",
            "sourceFileName",
            "sourceFilePath",
            "fileName",
            "fileLocation",
            "rowCount",
            "stateJson"
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          normalizedState.projectName,
          projectNameKey,
          normalizedState.sourceFileName,
          normalizedState.sourceFilePath,
          normalizedState.fileName,
          normalizedState.fileLocation,
          rowCount,
          stateJson,
        ],
      });
    }

    const savedRow = await findProjectRowByNameKey(client, projectNameKey);
    return mapProjectRecord(savedRow || {}, dbPath);
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
  getProjectById,
  getProjectByName,
  getDefaultWctCenDbPath,
  listLookupRecords,
  listProjectSummaries,
  resolveWctCenDbPath,
  saveLookupRecord,
  saveLookupRecords,
  saveProjectState,
};

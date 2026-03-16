const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

const DEFAULT_MAX_DATABASE_BACKUPS = 5;

function asText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function sanitizeSegment(value, fallback = "database") {
  return (
    asText(value)
      .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || fallback
  );
}

function normalizeDbPath(dbPath) {
  const normalized = asText(dbPath);
  if (!normalized) {
    throw new Error("Sciezka bazy danych jest wymagana.");
  }

  return path.resolve(normalized);
}

function getDatabaseBackupDirectory(dbPath, options = {}) {
  const appDataPath = asText(options.appDataPath);
  if (!appDataPath) {
    throw new Error("appDataPath jest wymagane do obslugi backupu bazy.");
  }

  const namespace = sanitizeSegment(options.namespace || "database");
  const resolvedDbPath = normalizeDbPath(dbPath);
  const extension = path.extname(resolvedDbPath);
  const baseName = path.basename(resolvedDbPath, extension);
  const hash = crypto
    .createHash("sha1")
    .update(process.platform === "win32" ? resolvedDbPath.toLowerCase() : resolvedDbPath)
    .digest("hex")
    .slice(0, 12);

  return path.join(
    appDataPath,
    "SME",
    "backups",
    namespace,
    `${sanitizeSegment(baseName)}-${hash}`
  );
}

function formatBackupStamp(date = new Date()) {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  const milliseconds = String(date.getMilliseconds()).padStart(3, "0");
  return `${year}${month}${day}-${hours}${minutes}${seconds}-${milliseconds}`;
}

function buildBackupFileName(dbPath, date = new Date()) {
  const resolvedDbPath = normalizeDbPath(dbPath);
  const extension = path.extname(resolvedDbPath) || ".sqlite";
  const baseName = path.basename(resolvedDbPath, extension);
  return `${sanitizeSegment(baseName)}-${formatBackupStamp(date)}${extension}`;
}

function mapBackupEntry(filePath, stats) {
  const fileName = path.basename(filePath);
  const extension = path.extname(fileName);
  return {
    id: path.basename(fileName, extension),
    fileName,
    filePath,
    size: Number(stats?.size) || 0,
    createdAt: new Date(
      stats?.birthtimeMs && stats.birthtimeMs > 0 ? stats.birthtimeMs : stats?.mtimeMs || Date.now()
    ).toISOString(),
    updatedAt: new Date(stats?.mtimeMs || Date.now()).toISOString(),
    modifiedAtMs: Number(stats?.mtimeMs) || 0,
  };
}

async function listDatabaseBackups(dbPath, options = {}) {
  const backupDirectory = getDatabaseBackupDirectory(dbPath, options);
  const limit = Math.max(1, Math.min(Number(options.limit) || DEFAULT_MAX_DATABASE_BACKUPS, 50));
  let directoryEntries = [];

  try {
    directoryEntries = await fs.readdir(backupDirectory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }

    throw error;
  }

  const backups = [];
  for (const entry of directoryEntries) {
    if (!entry.isFile()) {
      continue;
    }

    const filePath = path.join(backupDirectory, entry.name);
    const stats = await fs.stat(filePath);
    backups.push(mapBackupEntry(filePath, stats));
  }

  return backups
    .sort((left, right) => {
      if (right.modifiedAtMs !== left.modifiedAtMs) {
        return right.modifiedAtMs - left.modifiedAtMs;
      }

      return right.fileName.localeCompare(left.fileName, "pl");
    })
    .slice(0, limit)
    .map(({ modifiedAtMs, ...backup }) => backup);
}

async function pruneDatabaseBackups(dbPath, options = {}) {
  const maxBackups = Math.max(
    1,
    Math.min(Number(options.maxBackups) || DEFAULT_MAX_DATABASE_BACKUPS, 50)
  );
  const backupDirectory = getDatabaseBackupDirectory(dbPath, options);
  let directoryEntries = [];

  try {
    directoryEntries = await fs.readdir(backupDirectory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }

    throw error;
  }

  const backups = [];
  for (const entry of directoryEntries) {
    if (!entry.isFile()) {
      continue;
    }

    const filePath = path.join(backupDirectory, entry.name);
    const stats = await fs.stat(filePath);
    backups.push(mapBackupEntry(filePath, stats));
  }

  backups.sort((left, right) => {
    if (right.modifiedAtMs !== left.modifiedAtMs) {
      return right.modifiedAtMs - left.modifiedAtMs;
    }

    return right.fileName.localeCompare(left.fileName, "pl");
  });

  const removableBackups = backups.slice(maxBackups);
  await Promise.all(
    removableBackups.map((backup) => fs.rm(backup.filePath, { force: true }))
  );

  return backups
    .slice(0, maxBackups)
    .map(({ modifiedAtMs, ...backup }) => backup);
}

async function createDatabaseBackup(dbPath, options = {}) {
  const resolvedDbPath = normalizeDbPath(dbPath);

  let sourceStats = null;
  try {
    sourceStats = await fs.stat(resolvedDbPath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        created: false,
        dbPath: resolvedDbPath,
        backup: null,
        backups: [],
      };
    }

    throw error;
  }

  if (!sourceStats.isFile()) {
    return {
      created: false,
      dbPath: resolvedDbPath,
      backup: null,
      backups: [],
    };
  }

  const backupDirectory = getDatabaseBackupDirectory(resolvedDbPath, options);
  const fileName = buildBackupFileName(resolvedDbPath, options.now instanceof Date ? options.now : new Date());
  const backupPath = path.join(backupDirectory, fileName);

  await fs.mkdir(backupDirectory, { recursive: true });
  await fs.copyFile(resolvedDbPath, backupPath);

  const backups = await pruneDatabaseBackups(resolvedDbPath, options);
  const backup = backups.find((entry) => entry.filePath === backupPath) || null;

  return {
    created: true,
    dbPath: resolvedDbPath,
    backup,
    backups,
  };
}

async function restoreDatabaseBackup(dbPath, backupId, options = {}) {
  const resolvedDbPath = normalizeDbPath(dbPath);
  const normalizedBackupId = asText(backupId);
  if (!normalizedBackupId) {
    throw new Error("Backup do przywrocenia jest wymagany.");
  }

  const backups = await listDatabaseBackups(resolvedDbPath, {
    ...options,
    limit: 50,
  });
  const selectedBackup = backups.find(
    (entry) => entry.id === normalizedBackupId || entry.fileName === normalizedBackupId
  );

  if (!selectedBackup) {
    throw new Error("Nie znaleziono wskazanego backupu bazy danych.");
  }

  await fs.mkdir(path.dirname(resolvedDbPath), { recursive: true });
  await fs.copyFile(selectedBackup.filePath, resolvedDbPath);

  return {
    dbPath: resolvedDbPath,
    backup: selectedBackup,
    backups: await listDatabaseBackups(resolvedDbPath, {
      ...options,
      limit: DEFAULT_MAX_DATABASE_BACKUPS,
    }),
  };
}

module.exports = {
  DEFAULT_MAX_DATABASE_BACKUPS,
  buildBackupFileName,
  createDatabaseBackup,
  getDatabaseBackupDirectory,
  listDatabaseBackups,
  restoreDatabaseBackup,
};

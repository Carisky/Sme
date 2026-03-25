const fs = require("node:fs");
const path = require("node:path");

let lastLoadedEnvFilePath = null;

function getProjectRoot() {
  return path.resolve(__dirname, "..", "..");
}

function isPackagedElectronRuntime() {
  if (!process.versions?.electron) {
    return false;
  }

  if (process.defaultApp === true) {
    return false;
  }

  const executableName = path.basename(process.execPath || "").toLowerCase();
  return executableName !== "electron.exe" && executableName !== "electron";
}

function buildEnvCandidates(options = {}) {
  const projectRoot = path.resolve(options.projectRoot || getProjectRoot());
  const currentWorkingDirectory = path.resolve(options.cwd || process.cwd());
  const executableDirectory = path.resolve(
    options.execDir || path.dirname(process.execPath || projectRoot)
  );
  const useProductionEnv = options.packaged ?? isPackagedElectronRuntime();

  if (useProductionEnv) {
    return [
      path.join(executableDirectory, ".env"),
      path.join(projectRoot, ".env"),
      path.join(currentWorkingDirectory, ".env"),
    ];
  }

  return [
    path.join(projectRoot, ".env.test"),
    path.join(currentWorkingDirectory, ".env.test"),
    path.join(projectRoot, ".env"),
    path.join(currentWorkingDirectory, ".env"),
  ];
}

function resolveRejContEnvFilePath(options = {}) {
  const seenCandidates = new Set();

  for (const candidatePath of buildEnvCandidates(options)) {
    const resolvedCandidatePath = path.resolve(candidatePath);

    if (seenCandidates.has(resolvedCandidatePath)) {
      continue;
    }

    seenCandidates.add(resolvedCandidatePath);

    if (fs.existsSync(resolvedCandidatePath)) {
      return resolvedCandidatePath;
    }
  }

  return null;
}

function parseDotEnvContents(contents) {
  const entries = {};
  const lines = String(contents || "").split(/\r?\n/);

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    const match = trimmedLine.match(/^(?:export\s+)?([\w.-]+)\s*=\s*(.*)$/);

    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    let value = rawValue;

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "").trim();
    }

    entries[key] = value;
  }

  return entries;
}

function loadEnvFromFile(filePath, options = {}) {
  if (!filePath) {
    return {
      envFilePath: null,
      loadedKeys: [],
    };
  }

  const target = options.target || process.env;
  const contents = fs.readFileSync(filePath, "utf8");
  const entries = parseDotEnvContents(contents);
  const loadedKeys = [];

  for (const [key, value] of Object.entries(entries)) {
    target[key] = value;
    loadedKeys.push(key);
  }

  return {
    envFilePath: path.resolve(filePath),
    loadedKeys,
  };
}

function initializeRejContRuntimeEnv(options = {}) {
  const envFilePath = resolveRejContEnvFilePath(options);

  if (!envFilePath) {
    return {
      envFilePath: null,
      loadedKeys: [],
    };
  }

  if (options.cache !== false && envFilePath === lastLoadedEnvFilePath) {
    return {
      envFilePath,
      loadedKeys: [],
    };
  }

  const result = loadEnvFromFile(envFilePath, options);

  if (options.cache !== false) {
    lastLoadedEnvFilePath = result.envFilePath;
  }

  return result;
}

function resetRejContRuntimeEnvCache() {
  lastLoadedEnvFilePath = null;
}

module.exports = {
  buildEnvCandidates,
  getProjectRoot,
  initializeRejContRuntimeEnv,
  isPackagedElectronRuntime,
  loadEnvFromFile,
  parseDotEnvContents,
  resetRejContRuntimeEnvCache,
  resolveRejContEnvFilePath,
};

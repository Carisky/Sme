const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const RELEASE_MANIFEST_NAME = "sme-update.json";
const VERIFIED_RELEASE_KEY = "release.verified";

function normalizeProductName(packageJson = {}) {
  const candidate = String(packageJson.productName || packageJson.name || "SilesDoc").trim();
  return candidate || "SilesDoc";
}

function buildInstallerFileName(productName, version) {
  const safeProductName = String(productName || "SilesDoc").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-");
  return `${safeProductName}-Setup-${String(version || "0.0.0").trim()}.exe`;
}

function buildReleaseTag(version) {
  return `v${String(version || "0.0.0").trim()}`;
}

function normalizeSha256(value) {
  return String(value || "").trim().toLowerCase();
}

function compareVersions(left, right) {
  const leftParts = String(left || "")
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = String(right || "")
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = leftParts[index] || 0;
    const rightValue = rightParts[index] || 0;

    if (leftValue > rightValue) {
      return 1;
    }

    if (leftValue < rightValue) {
      return -1;
    }
  }

  return 0;
}

function parseGitHubRepository(input) {
  let repository = input;
  if (repository && typeof repository === "object" && repository.repository) {
    repository = repository.repository;
  }

  if (repository && typeof repository === "object") {
    repository = repository.url || repository.path || "";
  }

  const raw = String(repository || "").trim();
  if (!raw) {
    return null;
  }

  const patterns = [
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i,
    /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i,
    /^github:([^/]+)\/([^/]+)$/i,
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (!match) {
      continue;
    }

    return {
      provider: "github",
      owner: match[1],
      repo: match[2],
    };
  }

  return null;
}

function buildLatestReleaseApiUrl(repository) {
  if (!repository?.owner || !repository?.repo) {
    throw new Error("GitHub repository owner/repo is required.");
  }

  return `https://api.github.com/repos/${repository.owner}/${repository.repo}/releases/latest`;
}

function buildReleaseByTagApiUrl(repository, releaseTag) {
  if (!repository?.owner || !repository?.repo) {
    throw new Error("GitHub repository owner/repo is required.");
  }

  return `https://api.github.com/repos/${repository.owner}/${repository.repo}/releases/tags/${encodeURIComponent(String(releaseTag || "").trim())}`;
}

function buildReleaseAssetUrl(repository, releaseTag, assetName) {
  if (!repository?.owner || !repository?.repo) {
    throw new Error("GitHub repository owner/repo is required.");
  }

  return `https://github.com/${repository.owner}/${repository.repo}/releases/download/${releaseTag}/${assetName}`;
}

async function hashFile(filePath) {
  const hash = crypto.createHash("sha256");
  const stream = fs.createReadStream(filePath);

  for await (const chunk of stream) {
    hash.update(chunk);
  }

  return hash.digest("hex");
}

async function collectFiles(directoryPath) {
  const entries = await fsp.readdir(directoryPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(entryPath)));
      continue;
    }

    if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

async function hashDirectory(directoryPath) {
  const hash = crypto.createHash("sha256");
  const files = await collectFiles(directoryPath);

  for (const filePath of files) {
    const relativePath = path.relative(directoryPath, filePath).split(path.sep).join("/");
    hash.update(`file:${relativePath}\n`);

    const stream = fs.createReadStream(filePath);
    for await (const chunk of stream) {
      hash.update(chunk);
    }

    hash.update("\n");
  }

  return hash.digest("hex");
}

function createReleaseManifest({
  packageJson,
  repository,
  version,
  installerName,
  installerSha256,
  installerSize,
  appSha256,
  publishedAt,
  sourceCommit,
}) {
  const resolvedRepository = repository || parseGitHubRepository(packageJson);
  const resolvedVersion = String(version || packageJson?.version || "0.0.0").trim();
  const releaseTag = buildReleaseTag(resolvedVersion);

  return {
    schemaVersion: 1,
    productName: normalizeProductName(packageJson),
    version: resolvedVersion,
    releaseTag,
    publishedAt: publishedAt || new Date().toISOString(),
    sourceCommit: String(sourceCommit || "").trim(),
    appSha256: normalizeSha256(appSha256),
    repository: resolvedRepository,
    assets: {
      installer: {
        name: String(installerName || buildInstallerFileName(normalizeProductName(packageJson), resolvedVersion)),
        sha256: normalizeSha256(installerSha256),
        size: Number(installerSize) || 0,
        downloadUrl:
          resolvedRepository && installerName
            ? buildReleaseAssetUrl(resolvedRepository, releaseTag, installerName)
            : "",
      },
    },
  };
}

module.exports = {
  RELEASE_MANIFEST_NAME,
  VERIFIED_RELEASE_KEY,
  buildInstallerFileName,
  buildLatestReleaseApiUrl,
  buildReleaseByTagApiUrl,
  buildReleaseAssetUrl,
  buildReleaseTag,
  compareVersions,
  createReleaseManifest,
  hashDirectory,
  hashFile,
  normalizeProductName,
  normalizeSha256,
  parseGitHubRepository,
};

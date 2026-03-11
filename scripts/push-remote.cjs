const fs = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");
const packageJson = require("../package.json");
const {
  RELEASE_MANIFEST_NAME,
  buildInstallerFileName,
  buildReleaseAssetUrl,
  buildReleaseTag,
  hashFile,
  normalizeProductName,
  parseGitHubRepository,
} = require("../src/update-common");
const {
  MINI_APP_REGISTRY_ASSET_NAME,
  MINI_APP_REGISTRY_RELEASE_TAG,
  buildMiniAppBundleFileName,
  createMiniAppRegistryManifest,
  listMiniAppsFromRoot,
  sortMiniApps,
} = require("../src/mini-app-common");

function resolveCommand(command) {
  if (process.platform === "win32" && command === "npm") {
    return "npm.cmd";
  }

  if (process.platform === "win32" && command === "tar") {
    return "tar.exe";
  }

  return command;
}

function runCommand(command, args, cwd, options = {}) {
  const resolvedCommand = resolveCommand(command);
  const needsShell =
    process.platform === "win32" && /\.(cmd|bat)$/i.test(resolvedCommand);

  return new Promise((resolve, reject) => {
    const child = spawn(resolvedCommand, args, {
      cwd,
      env: process.env,
      stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
      shell: needsShell,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    if (options.capture) {
      child.stdout.on("data", (chunk) => {
        stdout += String(chunk);
      });
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });
    }

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve({
          stdout,
          stderr,
        });
        return;
      }

      const details = stderr.trim() || stdout.trim();
      reject(
        new Error(
          details
            ? `${command} ${args.join(" ")} failed: ${details}`
            : `${command} ${args.join(" ")} failed with code ${code}.`
        )
      );
    });
  });
}

async function readGitOutput(rootDir, ...args) {
  const result = await runCommand("git", args, rootDir, { capture: true });
  return result.stdout.trim();
}

async function ensureCleanWorktree(rootDir) {
  if (process.env.ALLOW_DIRTY_RELEASE === "1") {
    return;
  }

  const status = await readGitOutput(rootDir, "status", "--porcelain");
  if (status) {
    throw new Error(
      "Working tree has uncommitted changes. Commit or stash them before publishing. Set ALLOW_DIRTY_RELEASE=1 to override."
    );
  }
}

async function ensureGhAuth(rootDir) {
  await runCommand("gh", ["auth", "status"], rootDir);
}

async function ensureReleaseTag(rootDir, releaseTag, currentCommit) {
  let localTagCommit = "";

  try {
    localTagCommit = await readGitOutput(rootDir, "rev-parse", `${releaseTag}^{commit}`);
  } catch {
    localTagCommit = "";
  }

  if (localTagCommit && localTagCommit !== currentCommit) {
    throw new Error(
      `Tag ${releaseTag} already exists locally and points to ${localTagCommit}, not ${currentCommit}.`
    );
  }

  const remoteTagCommit = await readGitOutput(
    rootDir,
    "ls-remote",
    "--tags",
    "origin",
    `refs/tags/${releaseTag}^{}` 
  );
  const normalizedRemoteTagCommit = remoteTagCommit.split(/\s+/)[0] || "";

  if (normalizedRemoteTagCommit && normalizedRemoteTagCommit !== currentCommit) {
    throw new Error(
      `Tag ${releaseTag} already exists on origin and points to ${normalizedRemoteTagCommit}, not ${currentCommit}.`
    );
  }

  if (!localTagCommit) {
    await runCommand("git", ["tag", "-a", releaseTag, "-m", `Release ${releaseTag}`], rootDir);
  }
}

async function upsertFloatingReleaseTag(rootDir, releaseTag, currentCommit) {
  let localTagCommit = "";

  try {
    localTagCommit = await readGitOutput(rootDir, "rev-parse", `${releaseTag}^{commit}`);
  } catch {
    localTagCommit = "";
  }

  if (localTagCommit !== currentCommit) {
    await runCommand("git", ["tag", "-f", releaseTag, currentCommit], rootDir);
  }

  const remoteTagCommit = await readGitOutput(
    rootDir,
    "ls-remote",
    "--tags",
    "origin",
    `refs/tags/${releaseTag}^{}` 
  );
  const normalizedRemoteTagCommit = remoteTagCommit.split(/\s+/)[0] || "";

  if (normalizedRemoteTagCommit !== currentCommit) {
    await runCommand("git", ["push", "--force", "origin", `refs/tags/${releaseTag}`], rootDir);
  }
}

async function releaseExists(rootDir, releaseTag) {
  try {
    await runCommand("gh", ["release", "view", releaseTag], rootDir, { capture: true });
    return true;
  } catch {
    return false;
  }
}

async function listMiniAppsForRegistry(rootDir) {
  const sourceRoots = [
    path.join(rootDir, "mini_apps"),
    path.join(rootDir, "module_registry", "apps"),
  ];
  const merged = new Map();

  for (const sourceRoot of sourceRoots) {
    const miniApps = await listMiniAppsFromRoot(sourceRoot, {
      source: "registry",
    });

    for (const miniApp of miniApps) {
      merged.set(miniApp.id, miniApp);
    }
  }

  return Array.from(merged.values()).sort(sortMiniApps);
}

async function packMiniAppsForRelease(rootDir, repository, releaseTag) {
  const outputDir = path.join(rootDir, "dist", "mini-apps");
  const registryPath = path.join(rootDir, "dist", MINI_APP_REGISTRY_ASSET_NAME);
  const miniApps = await listMiniAppsForRegistry(rootDir);

  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });

  const assetPaths = [];
  const registryEntries = [];

  for (const miniApp of miniApps) {
    const sourceRoot = path.dirname(miniApp.directoryPath);
    const directoryName = path.basename(miniApp.directoryPath);
    const bundleName = buildMiniAppBundleFileName(miniApp.id, miniApp.version);
    const bundlePath = path.join(outputDir, bundleName);

    await runCommand("tar", ["-czf", bundlePath, "-C", sourceRoot, directoryName], rootDir);

    const bundleStat = await fs.stat(bundlePath);
    const bundleSha256 = await hashFile(bundlePath);

    assetPaths.push(bundlePath);
    registryEntries.push({
      id: miniApp.id,
      name: miniApp.name,
      description: miniApp.description,
      version: miniApp.version,
      order: miniApp.order,
      bundle: {
        name: bundleName,
        downloadUrl: buildReleaseAssetUrl(repository, releaseTag, bundleName),
        sha256: bundleSha256,
        size: bundleStat.size,
        format: "tar.gz",
      },
    });
  }

  const registry = createMiniAppRegistryManifest({
    repository,
    releaseTag,
    miniApps: registryEntries,
  });

  await fs.writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
  return {
    registry,
    assetPaths: [registryPath, ...assetPaths],
  };
}

async function writeReleaseNotes(rootDir, manifest, miniAppRegistry) {
  const notesDir = path.join(rootDir, "tmp", "release");
  const notesPath = path.join(notesDir, "notes.md");
  const installer = manifest.assets?.installer || {};
  const lines = [
    `# ${manifest.productName} ${manifest.version}`,
    "",
    `- Version: ${manifest.version}`,
    `- Tag: ${manifest.releaseTag}`,
    `- Installer: ${installer.name || ""}`,
    `- Installer SHA256: ${installer.sha256 || ""}`,
    `- App SHA256: ${manifest.appSha256 || ""}`,
    `- Mini-app registry entries: ${Array.isArray(miniAppRegistry?.miniApps) ? miniAppRegistry.miniApps.length : 0}`,
  ];

  if (manifest.sourceCommit) {
    lines.push(`- Commit: ${manifest.sourceCommit}`);
  }

  lines.push("");

  await fs.mkdir(notesDir, { recursive: true });
  await fs.writeFile(notesPath, `${lines.join("\n")}\n`, "utf8");
  return notesPath;
}

async function writeMiniAppReleaseNotes(rootDir, miniAppRegistry, currentCommit) {
  const notesDir = path.join(rootDir, "tmp", "release");
  const notesPath = path.join(notesDir, "mini-apps-notes.md");
  const miniApps = Array.isArray(miniAppRegistry?.miniApps) ? miniAppRegistry.miniApps : [];
  const lines = [
    "# SME Mini Apps",
    "",
    `- Registry tag: ${MINI_APP_REGISTRY_RELEASE_TAG}`,
    `- Entries: ${miniApps.length}`,
    `- Commit: ${currentCommit}`,
    "",
  ];

  for (const miniApp of miniApps) {
    lines.push(`- ${miniApp.id}: ${miniApp.version}`);
  }

  lines.push("");

  await fs.mkdir(notesDir, { recursive: true });
  await fs.writeFile(notesPath, `${lines.join("\n")}\n`, "utf8");
  return notesPath;
}

async function publishAppRelease({
  rootDir,
  currentCommit,
  releaseTag,
  version,
  productName,
  installerPath,
  manifestPath,
  miniAppRegistry,
}) {
  const releaseAssetPaths = [installerPath, manifestPath];
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const notesPath = await writeReleaseNotes(rootDir, manifest, miniAppRegistry);

  await ensureReleaseTag(rootDir, releaseTag, currentCommit);
  await runCommand("git", ["push", "origin", `refs/tags/${releaseTag}`], rootDir);

  if (await releaseExists(rootDir, releaseTag)) {
    await runCommand(
      "gh",
      ["release", "edit", releaseTag, "--title", `${productName} ${version}`, "--notes-file", notesPath],
      rootDir
    );
    await runCommand(
      "gh",
      ["release", "upload", releaseTag, ...releaseAssetPaths, "--clobber"],
      rootDir
    );
    return;
  }

  await runCommand(
    "gh",
    [
      "release",
      "create",
      releaseTag,
      ...releaseAssetPaths,
      "--title",
      `${productName} ${version}`,
      "--notes-file",
      notesPath,
      "--latest",
    ],
    rootDir
  );
}

async function publishMiniAppRegistryRelease({
  rootDir,
  repository,
  currentCommit,
}) {
  const miniAppRelease = await packMiniAppsForRelease(
    rootDir,
    repository,
    MINI_APP_REGISTRY_RELEASE_TAG
  );
  const notesPath = await writeMiniAppReleaseNotes(
    rootDir,
    miniAppRelease.registry,
    currentCommit
  );

  await upsertFloatingReleaseTag(rootDir, MINI_APP_REGISTRY_RELEASE_TAG, currentCommit);

  if (await releaseExists(rootDir, MINI_APP_REGISTRY_RELEASE_TAG)) {
    await runCommand(
      "gh",
      [
        "release",
        "edit",
        MINI_APP_REGISTRY_RELEASE_TAG,
        "--title",
        "SME Mini Apps",
        "--notes-file",
        notesPath,
      ],
      rootDir
    );
    await runCommand(
      "gh",
      [
        "release",
        "upload",
        MINI_APP_REGISTRY_RELEASE_TAG,
        ...miniAppRelease.assetPaths,
        "--clobber",
      ],
      rootDir
    );
    return miniAppRelease;
  }

  await runCommand(
    "gh",
    [
      "release",
      "create",
      MINI_APP_REGISTRY_RELEASE_TAG,
      ...miniAppRelease.assetPaths,
      "--title",
      "SME Mini Apps",
      "--notes-file",
      notesPath,
      "--prerelease",
    ],
    rootDir
  );

  return miniAppRelease;
}

async function main() {
  const rootDir = path.resolve(__dirname, "..");
  const repository = parseGitHubRepository(packageJson);
  const miniAppsOnly = process.argv.includes("--mini-apps-only");

  if (!repository) {
    throw new Error("package.json.repository must point to GitHub for publishing.");
  }

  const version = String(packageJson.version || "").trim();
  if (!version) {
    throw new Error("package.json.version is required.");
  }

  const productName = normalizeProductName(packageJson);
  const releaseTag = buildReleaseTag(version);
  const installerName = buildInstallerFileName(productName, version);
  const installerPath = path.join(rootDir, "dist", installerName);
  const manifestPath = path.join(rootDir, "dist", RELEASE_MANIFEST_NAME);

  await ensureCleanWorktree(rootDir);
  await ensureGhAuth(rootDir);

  if (!miniAppsOnly) {
    await runCommand("npm", ["run", "make:installer"], rootDir);
    await fs.access(installerPath);
    await fs.access(manifestPath);
  }

  const currentCommit = await readGitOutput(rootDir, "rev-parse", "HEAD");
  await runCommand("git", ["push", "origin", "HEAD"], rootDir);

  const miniAppRelease = await publishMiniAppRegistryRelease({
    rootDir,
    repository,
    currentCommit,
  });

  if (!miniAppsOnly) {
    await publishAppRelease({
      rootDir,
      currentCommit,
      releaseTag,
      version,
      productName,
      installerPath,
      manifestPath,
      miniAppRegistry: miniAppRelease.registry,
    });
  }

  if (miniAppsOnly) {
    console.log(
      `Published ${miniAppRelease.registry.miniApps.length} mini-app(s) to ${repository.owner}/${repository.repo} (${MINI_APP_REGISTRY_RELEASE_TAG}).`
    );
    return;
  }

  console.log(
    `Published ${productName} ${version} and ${miniAppRelease.registry.miniApps.length} mini-app(s) to GitHub Releases for ${repository.owner}/${repository.repo}.`
  );
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});

const fs = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");
const packageJson = require("../package.json");
const {
  RELEASE_MANIFEST_NAME,
  buildInstallerFileName,
  buildReleaseTag,
  normalizeProductName,
  parseGitHubRepository,
} = require("../src/update-common");

function resolveCommand(command) {
  if (process.platform === "win32" && command === "npm") {
    return "npm.cmd";
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
      "Working tree has uncommitted changes. Commit or stash them before running push:remote. Set ALLOW_DIRTY_RELEASE=1 to override."
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
    throw new Error(`Tag ${releaseTag} already exists locally and points to ${localTagCommit}, not ${currentCommit}.`);
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

async function releaseExists(rootDir, releaseTag) {
  try {
    await runCommand("gh", ["release", "view", releaseTag], rootDir, { capture: true });
    return true;
  } catch {
    return false;
  }
}

async function writeReleaseNotes(rootDir, manifest) {
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
  ];

  if (manifest.sourceCommit) {
    lines.push(`- Commit: ${manifest.sourceCommit}`);
  }

  lines.push("");

  await fs.mkdir(notesDir, { recursive: true });
  await fs.writeFile(notesPath, `${lines.join("\n")}\n`, "utf8");
  return notesPath;
}

async function main() {
  const rootDir = path.resolve(__dirname, "..");
  const repository = parseGitHubRepository(packageJson);
  if (!repository) {
    throw new Error("package.json.repository must point to GitHub for push:remote.");
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
  await runCommand("npm", ["run", "make:installer"], rootDir);

  await fs.access(installerPath);
  await fs.access(manifestPath);

  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const notesPath = await writeReleaseNotes(rootDir, manifest);
  const currentCommit = await readGitOutput(rootDir, "rev-parse", "HEAD");

  await runCommand("git", ["push", "origin", "HEAD"], rootDir);
  await ensureReleaseTag(rootDir, releaseTag, currentCommit);
  await runCommand("git", ["push", "origin", `refs/tags/${releaseTag}`], rootDir);

  if (await releaseExists(rootDir, releaseTag)) {
    await runCommand(
      "gh",
      ["release", "edit", releaseTag, "--title", `${productName} ${version}`, "--notes-file", notesPath],
      rootDir
    );
    await runCommand("gh", ["release", "upload", releaseTag, installerPath, manifestPath, "--clobber"], rootDir);
  } else {
    await runCommand(
      "gh",
      [
        "release",
        "create",
        releaseTag,
        installerPath,
        manifestPath,
        "--title",
        `${productName} ${version}`,
        "--notes-file",
        notesPath,
        "--latest",
      ],
      rootDir
    );
  }

  console.log(
    `Published ${productName} ${version} to GitHub Releases for ${repository.owner}/${repository.repo}.`
  );
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});

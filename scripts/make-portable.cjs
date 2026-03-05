const fs = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");
const { packager } = require("@electron/packager");

async function compressDirectory(sourceDir, destinationZip) {
  await new Promise((resolve, reject) => {
    const script = `Compress-Archive -Path '${sourceDir}\\*' -DestinationPath '${destinationZip}' -Force`;
    const child = spawn("powershell.exe", ["-NoProfile", "-Command", script], {
      stdio: "inherit",
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Compress-Archive failed with code ${code}.`));
    });
  });
}

async function main() {
  const rootDir = path.resolve(__dirname, "..");
  const distDir = path.join(rootDir, "dist");
  const buildsDir = path.join(distDir, "portable-builds");
  const stamp = new Date()
    .toISOString()
    .replace(/[:]/g, "-")
    .replace(/\..+$/, "");
  const outDir = path.join(buildsDir, stamp);

  await fs.mkdir(outDir, { recursive: true });

  const packagedPaths = await packager({
    dir: rootDir,
    out: outDir,
    overwrite: true,
    platform: "win32",
    arch: "x64",
    name: "SME Portable",
    executableName: "SMEPortable",
    prune: true,
    ignore: [/^\/dist$/, /^\/test$/, /^\/samples\/macro$/],
  });

  const packagedDir = packagedPaths[0];
  const zipPath = path.join(distDir, `${path.basename(packagedDir)}.zip`);

  await fs.rm(zipPath, { force: true });
  await compressDirectory(packagedDir, zipPath);

  console.log(`Portable folder: ${packagedDir}`);
  console.log(`Portable zip: ${zipPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

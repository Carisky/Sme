const fs = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");
const { packager } = require("@electron/packager");
const packageJson = require("../package.json");

async function runProcess(command, args, cwd, extraEnv = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        ...extraEnv,
      },
      stdio: "inherit",
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} failed with code ${code}.`));
    });
  });
}

async function runNodeScript(scriptPath, args, cwd, extraEnv = {}) {
  await runProcess(process.execPath, [scriptPath, ...args], cwd, extraEnv);
}

function toSingleQuotedPowerShellPath(targetPath) {
  return String(targetPath).replace(/'/g, "''");
}

async function cleanDistDirectory(distDir) {
  await fs.rm(distDir, { recursive: true, force: true });
  await fs.mkdir(distDir, { recursive: true });
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function compressDirectoryContents(sourceDir, destinationZip) {
  const command = [
    "Compress-Archive",
    `-Path '${toSingleQuotedPowerShellPath(path.join(sourceDir, "*"))}'`,
    `-DestinationPath '${toSingleQuotedPowerShellPath(destinationZip)}'`,
    "-Force",
  ].join(" ");

  await runProcess(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command],
    sourceDir
  );
}

async function writeInstallerStage(stageDir, installerPath) {
  const installCmdPath = path.join(stageDir, "install.cmd");
  const installPs1Path = path.join(stageDir, "install.ps1");
  const sedPath = path.join(stageDir, "installer.sed");
  const installScript = [
    "$ErrorActionPreference = 'Stop'",
    "$targetDir = Join-Path $env:LOCALAPPDATA 'Programs\\SME'",
    "$payloadZip = Join-Path $PSScriptRoot 'payload.zip'",
    "$desktopLink = Join-Path ([Environment]::GetFolderPath('Desktop')) 'SME.lnk'",
    "$startMenuDir = Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs'",
    "$startMenuLink = Join-Path $startMenuDir 'SME.lnk'",
    "",
    "Get-Process -Name SME -ErrorAction SilentlyContinue | Stop-Process -Force",
    "if (Test-Path $targetDir) {",
    "  Remove-Item -LiteralPath $targetDir -Recurse -Force",
    "}",
    "New-Item -ItemType Directory -Path $targetDir -Force | Out-Null",
    "New-Item -ItemType Directory -Path $startMenuDir -Force | Out-Null",
    "Expand-Archive -LiteralPath $payloadZip -DestinationPath $targetDir -Force",
    "",
    "$shell = New-Object -ComObject WScript.Shell",
    "foreach ($linkPath in @($desktopLink, $startMenuLink)) {",
    "  $shortcut = $shell.CreateShortcut($linkPath)",
    "  $shortcut.TargetPath = (Join-Path $targetDir 'SME.exe')",
    "  $shortcut.WorkingDirectory = $targetDir",
    "  $shortcut.IconLocation = (Join-Path $targetDir 'SME.exe')",
    "  $shortcut.Description = 'SME'",
    "  $shortcut.Save()",
    "}",
    "",
    "Start-Process -FilePath (Join-Path $targetDir 'SME.exe')",
  ].join("\r\n");
  const commandWrapper = [
    "@echo off",
    "setlocal",
    "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File \"%~dp0install.ps1\"",
    "set \"EXITCODE=%ERRORLEVEL%\"",
    "endlocal & exit /b %EXITCODE%",
    "",
  ].join("\r\n");
  const sedContents = [
    "[Version]",
    "Class=IEXPRESS",
    "SEDVersion=3",
    "[Options]",
    "PackagePurpose=InstallApp",
    "ShowInstallProgramWindow=0",
    "HideExtractAnimation=1",
    "UseLongFileName=1",
    "InsideCompressed=0",
    "CAB_FixedSize=0",
    "CAB_ResvCodeSigning=0",
    "RebootMode=I",
    "InstallPrompt=%InstallPrompt%",
    "DisplayLicense=%DisplayLicense%",
    "FinishMessage=%FinishMessage%",
    "TargetName=%TargetName%",
    "FriendlyName=%FriendlyName%",
    "AppLaunched=%AppLaunched%",
    "PostInstallCmd=%PostInstallCmd%",
    "AdminQuietInstCmd=%AdminQuietInstCmd%",
    "UserQuietInstCmd=%UserQuietInstCmd%",
    "SourceFiles=SourceFiles",
    "[Strings]",
    "InstallPrompt=",
    "DisplayLicense=",
    "FinishMessage=",
    `TargetName=${installerPath}`,
    "FriendlyName=SME Setup",
    "AppLaunched=install.cmd",
    "PostInstallCmd=<None>",
    "AdminQuietInstCmd=install.cmd",
    "UserQuietInstCmd=install.cmd",
    "FILE0=\"install.cmd\"",
    "FILE1=\"install.ps1\"",
    "FILE2=\"payload.zip\"",
    "[SourceFiles]",
    `SourceFiles0=${stageDir}\\`,
    "[SourceFiles0]",
    "%FILE0%=",
    "%FILE1%=",
    "%FILE2%=",
    "",
  ].join("\r\n");

  await fs.writeFile(installCmdPath, commandWrapper, "ascii");
  await fs.writeFile(installPs1Path, installScript, "utf8");
  await fs.writeFile(sedPath, sedContents, "ascii");

  return sedPath;
}

async function runIExpress(sedPath, logPath, cwd) {
  const relativeSedPath = path.relative(cwd, sedPath).replace(/\//g, "\\");
  const relativeLogPath = path.relative(cwd, logPath).replace(/\//g, "\\");
  await runProcess(
    "cmd.exe",
    ["/d", "/s", "/c", `iexpress.exe /N ${relativeSedPath} > ${relativeLogPath} 2>&1`],
    cwd
  );
}

async function withSeededDatabase(rootDir, tmpDir, action) {
  const databasePath = path.join(rootDir, "prisma", "dev.db");
  const backupPath = path.join(tmpDir, "prisma-dev.db.bak");
  const hadDatabase = await pathExists(databasePath);

  if (hadDatabase) {
    await fs.copyFile(databasePath, backupPath);
  }

  try {
    await runNodeScript(path.join(rootDir, "prisma", "seed.js"), [], rootDir);
    return await action();
  } finally {
    if (hadDatabase) {
      await fs.copyFile(backupPath, databasePath);
      await fs.rm(backupPath, { force: true });
      return;
    }

    await fs.rm(databasePath, { force: true });
  }
}

async function main() {
  const rootDir = path.resolve(__dirname, "..");
  const distDir = path.join(rootDir, "dist");
  const tmpDir = path.join(rootDir, "tmp", "installer-build");
  const packagedOutDir = path.join(tmpDir, "packaged");
  const iexpressDir = path.join(tmpDir, "iexpress");
  const installerPath = path.join(distDir, `SME-Setup-${packageJson.version}.exe`);

  await cleanDistDirectory(distDir);
  await fs.rm(tmpDir, { recursive: true, force: true });
  await fs.mkdir(packagedOutDir, { recursive: true });
  await fs.mkdir(iexpressDir, { recursive: true });
  const packagedPaths = await withSeededDatabase(rootDir, tmpDir, async () =>
    packager({
      dir: rootDir,
      out: packagedOutDir,
      overwrite: true,
      platform: "win32",
      arch: "x64",
      name: "SME",
      executableName: "SME",
      asar: false,
      prune: true,
      ignore: [
        /^\/dist$/,
        /^\/test$/,
        /^\/tmp$/,
        /^\/scripts$/,
        /^\/samples\/import_files$/,
        /^\/samples\/macro$/,
      ],
    })
  });

  const packagedDir = packagedPaths[0];
  const payloadZipPath = path.join(iexpressDir, "payload.zip");
  const iexpressLogPath = path.join(iexpressDir, "iexpress.log");

  await compressDirectoryContents(packagedDir, payloadZipPath);
  const sedPath = await writeInstallerStage(iexpressDir, installerPath);
  await runIExpress(sedPath, iexpressLogPath, rootDir);
  await fs.access(installerPath);

  await fs.rm(tmpDir, { recursive: true, force: true });
  console.log(`Installer exe: ${installerPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

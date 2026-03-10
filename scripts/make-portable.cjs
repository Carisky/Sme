const fs = require("fs/promises");
const path = require("path");
const { execFileSync, spawn } = require("child_process");
const { packager } = require("@electron/packager");
const packageJson = require("../package.json");
const {
  RELEASE_MANIFEST_NAME,
  buildInstallerFileName,
  createReleaseManifest,
  hashDirectory,
  hashFile,
  normalizeProductName,
  parseGitHubRepository,
} = require("../src/update-common");

function escapePowerShellSingleQuoted(value) {
  return String(value || "").replace(/'/g, "''");
}

function toSingleQuotedPowerShellPath(targetPath) {
  return escapePowerShellSingleQuoted(targetPath);
}

async function runProcess(command, args, cwd, extraEnv = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        ...extraEnv,
      },
      stdio: "inherit",
      windowsHide: true,
    });

    child.on("error", reject);
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

function buildIExpressSedContents({
  stageDir,
  packagePath,
  friendlyName,
  appLaunched,
  fileNames,
}) {
  const fileStringLines = fileNames.map(
    (fileName, index) => `FILE${index}="${fileName.replace(/"/g, '""')}"`
  );
  const sourceLines = fileNames.map((_fileName, index) => `%FILE${index}%=`);

  return [
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
    "PostInstallCmd=<None>",
    "AdminQuietInstCmd=%AdminQuietInstCmd%",
    "UserQuietInstCmd=%UserQuietInstCmd%",
    "SourceFiles=SourceFiles",
    "[Strings]",
    "InstallPrompt=",
    "DisplayLicense=",
    "FinishMessage=",
    `TargetName=${packagePath}`,
    `FriendlyName=${friendlyName}`,
    `AppLaunched=${appLaunched}`,
    `AdminQuietInstCmd=${appLaunched}`,
    `UserQuietInstCmd=${appLaunched}`,
    ...fileStringLines,
    "[SourceFiles]",
    `SourceFiles0=${stageDir}\\`,
    "[SourceFiles0]",
    ...sourceLines,
    "",
  ].join("\r\n");
}

function buildInstallerScript({ productName, productVersion, publisherName }) {
  return [
    "$ErrorActionPreference = 'Stop'",
    "Add-Type -AssemblyName System.Windows.Forms",
    "Add-Type -AssemblyName System.Drawing",
    "[System.Windows.Forms.Application]::EnableVisualStyles()",
    "",
    `$productName = '${escapePowerShellSingleQuoted(productName)}'`,
    `$productVersion = '${escapePowerShellSingleQuoted(productVersion)}'`,
    `$publisherName = '${escapePowerShellSingleQuoted(publisherName)}'`,
    "$payloadZip = Join-Path $PSScriptRoot 'payload.zip'",
    "$bundledUninstaller = Join-Path $PSScriptRoot 'Uninstall SME.exe'",
    "$defaultTargetDir = Join-Path $env:LOCALAPPDATA 'Programs\\SME'",
    "$desktopLink = Join-Path ([Environment]::GetFolderPath('Desktop')) 'SME.lnk'",
    "$startMenuDir = Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs\\SME'",
    "$startMenuLink = Join-Path $startMenuDir 'SME.lnk'",
    "$startMenuUninstallLink = Join-Path $startMenuDir 'Uninstall SME.lnk'",
    "$uninstallRegPath = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\SME'",
    "",
    "function Show-Message([string]$message, [System.Windows.Forms.MessageBoxIcon]$icon) {",
    "  [void][System.Windows.Forms.MessageBox]::Show($message, \"$productName installer\", [System.Windows.Forms.MessageBoxButtons]::OK, $icon)",
    "}",
    "",
    "function New-Shortcut([string]$linkPath, [string]$targetPath, [string]$workingDirectory, [string]$iconLocation, [string]$description) {",
    "  $shell = New-Object -ComObject WScript.Shell",
    "  $shortcut = $shell.CreateShortcut($linkPath)",
    "  $shortcut.TargetPath = $targetPath",
    "  $shortcut.WorkingDirectory = $workingDirectory",
    "  $shortcut.IconLocation = $iconLocation",
    "  $shortcut.Description = $description",
    "  $shortcut.Save()",
    "}",
    "",
    "$form = New-Object System.Windows.Forms.Form",
    "$form.Text = \"$productName Setup\"",
    "$form.StartPosition = 'CenterScreen'",
    "$form.FormBorderStyle = 'FixedDialog'",
    "$form.MaximizeBox = $false",
    "$form.MinimizeBox = $false",
    "$form.ClientSize = New-Object System.Drawing.Size(560, 250)",
    "$form.BackColor = [System.Drawing.Color]::FromArgb(245, 237, 224)",
    "",
    "$titleLabel = New-Object System.Windows.Forms.Label",
    "$titleLabel.Text = \"$productName $productVersion\"",
    "$titleLabel.Location = New-Object System.Drawing.Point(24, 22)",
    "$titleLabel.Size = New-Object System.Drawing.Size(380, 34)",
    "$titleLabel.Font = New-Object System.Drawing.Font('Segoe UI', 18, [System.Drawing.FontStyle]::Bold)",
    "$form.Controls.Add($titleLabel)",
    "",
    "$subtitleLabel = New-Object System.Windows.Forms.Label",
    "$subtitleLabel.Text = 'Install the application without command windows or extra prompts.'",
    "$subtitleLabel.Location = New-Object System.Drawing.Point(24, 62)",
    "$subtitleLabel.Size = New-Object System.Drawing.Size(500, 22)",
    "$subtitleLabel.Font = New-Object System.Drawing.Font('Segoe UI', 9)",
    "$form.Controls.Add($subtitleLabel)",
    "",
    "$pathLabel = New-Object System.Windows.Forms.Label",
    "$pathLabel.Text = 'Install location'",
    "$pathLabel.Location = New-Object System.Drawing.Point(24, 100)",
    "$pathLabel.Size = New-Object System.Drawing.Size(120, 20)",
    "$pathLabel.Font = New-Object System.Drawing.Font('Segoe UI', 9, [System.Drawing.FontStyle]::Bold)",
    "$form.Controls.Add($pathLabel)",
    "",
    "$pathBox = New-Object System.Windows.Forms.TextBox",
    "$pathBox.Location = New-Object System.Drawing.Point(24, 124)",
    "$pathBox.Size = New-Object System.Drawing.Size(404, 28)",
    "$pathBox.Font = New-Object System.Drawing.Font('Segoe UI', 10)",
    "$pathBox.Text = $defaultTargetDir",
    "$form.Controls.Add($pathBox)",
    "",
    "$browseButton = New-Object System.Windows.Forms.Button",
    "$browseButton.Text = 'Browse...'",
    "$browseButton.Location = New-Object System.Drawing.Point(438, 122)",
    "$browseButton.Size = New-Object System.Drawing.Size(96, 32)",
    "$browseButton.Font = New-Object System.Drawing.Font('Segoe UI', 9)",
    "$form.Controls.Add($browseButton)",
    "",
    "$progressBar = New-Object System.Windows.Forms.ProgressBar",
    "$progressBar.Location = New-Object System.Drawing.Point(24, 172)",
    "$progressBar.Size = New-Object System.Drawing.Size(510, 18)",
    "$progressBar.Style = 'Continuous'",
    "$progressBar.Minimum = 0",
    "$progressBar.Maximum = 100",
    "$progressBar.Value = 0",
    "$form.Controls.Add($progressBar)",
    "",
    "$statusLabel = New-Object System.Windows.Forms.Label",
    "$statusLabel.Text = 'Ready to install.'",
    "$statusLabel.Location = New-Object System.Drawing.Point(24, 196)",
    "$statusLabel.Size = New-Object System.Drawing.Size(380, 20)",
    "$statusLabel.Font = New-Object System.Drawing.Font('Segoe UI', 9)",
    "$form.Controls.Add($statusLabel)",
    "",
    "$installButton = New-Object System.Windows.Forms.Button",
    "$installButton.Text = 'Install'",
    "$installButton.Location = New-Object System.Drawing.Point(338, 214)",
    "$installButton.Size = New-Object System.Drawing.Size(94, 30)",
    "$installButton.Font = New-Object System.Drawing.Font('Segoe UI', 9, [System.Drawing.FontStyle]::Bold)",
    "$form.Controls.Add($installButton)",
    "",
    "$cancelButton = New-Object System.Windows.Forms.Button",
    "$cancelButton.Text = 'Cancel'",
    "$cancelButton.Location = New-Object System.Drawing.Point(440, 214)",
    "$cancelButton.Size = New-Object System.Drawing.Size(94, 30)",
    "$cancelButton.Font = New-Object System.Drawing.Font('Segoe UI', 9)",
    "$form.Controls.Add($cancelButton)",
    "",
    "$browseButton.Add_Click({",
    "  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
    "  $dialog.Description = 'Choose installation folder'",
    "  $dialog.SelectedPath = $pathBox.Text",
    "  if ($dialog.ShowDialog($form) -eq [System.Windows.Forms.DialogResult]::OK) {",
    "    $pathBox.Text = $dialog.SelectedPath",
    "  }",
    "})",
    "",
    "$cancelButton.Add_Click({",
    "  $form.Close()",
    "})",
    "",
    "$installButton.Add_Click({",
    "  $targetDir = $pathBox.Text.Trim()",
    "  if ([string]::IsNullOrWhiteSpace($targetDir)) {",
    "    Show-Message 'Choose a valid installation folder.' ([System.Windows.Forms.MessageBoxIcon]::Warning)",
    "    return",
    "  }",
    "",
    "  try {",
    "    $installButton.Enabled = $false",
    "    $browseButton.Enabled = $false",
    "    $cancelButton.Enabled = $false",
    "    $statusLabel.Text = 'Preparing installation...'",
    "    $progressBar.Style = 'Marquee'",
    "    [System.Windows.Forms.Application]::DoEvents()",
    "",
    "    Get-Process -Name SME -ErrorAction SilentlyContinue | Stop-Process -Force",
    "",
    "    if (Test-Path $targetDir) {",
    "      Remove-Item -LiteralPath $targetDir -Recurse -Force",
    "    }",
    "",
    "    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null",
    "    $statusLabel.Text = 'Extracting application files...'",
    "    [System.Windows.Forms.Application]::DoEvents()",
    "    Expand-Archive -LiteralPath $payloadZip -DestinationPath $targetDir -Force",
    "",
    "    $mainExe = Join-Path $targetDir 'SME.exe'",
    "    $targetUninstaller = Join-Path $targetDir 'Uninstall SME.exe'",
    "    Copy-Item -LiteralPath $bundledUninstaller -Destination $targetUninstaller -Force",
    "",
    "    $statusLabel.Text = 'Creating shortcuts...'",
    "    [System.Windows.Forms.Application]::DoEvents()",
    "    New-Item -ItemType Directory -Path $startMenuDir -Force | Out-Null",
    "    New-Shortcut $desktopLink $mainExe $targetDir $mainExe \"$productName application\"",
    "    New-Shortcut $startMenuLink $mainExe $targetDir $mainExe \"$productName application\"",
    "    New-Shortcut $startMenuUninstallLink $targetUninstaller $targetDir $mainExe \"Remove $productName\"",
    "",
    "    $statusLabel.Text = 'Registering uninstaller...'",
    "    [System.Windows.Forms.Application]::DoEvents()",
    "    New-Item -Path $uninstallRegPath -Force | Out-Null",
    "    New-ItemProperty -Path $uninstallRegPath -Name 'DisplayName' -Value $productName -PropertyType String -Force | Out-Null",
    "    New-ItemProperty -Path $uninstallRegPath -Name 'DisplayVersion' -Value $productVersion -PropertyType String -Force | Out-Null",
    "    New-ItemProperty -Path $uninstallRegPath -Name 'Publisher' -Value $publisherName -PropertyType String -Force | Out-Null",
    "    New-ItemProperty -Path $uninstallRegPath -Name 'InstallLocation' -Value $targetDir -PropertyType String -Force | Out-Null",
    "    New-ItemProperty -Path $uninstallRegPath -Name 'DisplayIcon' -Value $mainExe -PropertyType String -Force | Out-Null",
    "    New-ItemProperty -Path $uninstallRegPath -Name 'UninstallString' -Value ('\"' + $targetUninstaller + '\"') -PropertyType String -Force | Out-Null",
    "    New-ItemProperty -Path $uninstallRegPath -Name 'QuietUninstallString' -Value ('\"' + $targetUninstaller + '\"') -PropertyType String -Force | Out-Null",
    "    New-ItemProperty -Path $uninstallRegPath -Name 'NoModify' -Value 1 -PropertyType DWord -Force | Out-Null",
    "    New-ItemProperty -Path $uninstallRegPath -Name 'NoRepair' -Value 1 -PropertyType DWord -Force | Out-Null",
    "",
    "    $progressBar.Style = 'Continuous'",
    "    $progressBar.Value = 100",
    "    $statusLabel.Text = 'Installation complete.'",
    "    [System.Windows.Forms.Application]::DoEvents()",
    "",
    "    Show-Message \"$productName was installed successfully.\" ([System.Windows.Forms.MessageBoxIcon]::Information)",
    "    Start-Process -FilePath $mainExe",
    "    $form.Close()",
    "  } catch {",
    "    $progressBar.Style = 'Continuous'",
    "    $progressBar.Value = 0",
    "    $statusLabel.Text = 'Installation failed.'",
    "    $installButton.Enabled = $true",
    "    $browseButton.Enabled = $true",
    "    $cancelButton.Enabled = $true",
    "    Show-Message $_.Exception.Message ([System.Windows.Forms.MessageBoxIcon]::Error)",
    "  }",
    "})",
    "",
    "$form.Add_Shown({",
    "  $form.Activate()",
    "})",
    "",
    "[void]$form.ShowDialog()",
  ].join("\r\n");
}

function buildUninstallerScript({ productName }) {
  return [
    "$ErrorActionPreference = 'Stop'",
    "Add-Type -AssemblyName System.Windows.Forms",
    "Add-Type -AssemblyName System.Drawing",
    "[System.Windows.Forms.Application]::EnableVisualStyles()",
    "",
    `$productName = '${escapePowerShellSingleQuoted(productName)}'`,
    "$desktopLink = Join-Path ([Environment]::GetFolderPath('Desktop')) 'SME.lnk'",
    "$startMenuDir = Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs\\SME'",
    "$startMenuLink = Join-Path $startMenuDir 'SME.lnk'",
    "$startMenuUninstallLink = Join-Path $startMenuDir 'Uninstall SME.lnk'",
    "$uninstallRegPath = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\SME'",
    "$defaultTargetDir = Join-Path $env:LOCALAPPDATA 'Programs\\SME'",
    "",
    "$installRecord = Get-ItemProperty -Path $uninstallRegPath -ErrorAction SilentlyContinue",
    "$targetDir = if ($installRecord -and $installRecord.InstallLocation) { $installRecord.InstallLocation } else { $defaultTargetDir }",
    "",
    "$answer = [System.Windows.Forms.MessageBox]::Show(",
    "  \"Remove $productName from this computer?\",",
    "  \"$productName Uninstall\",",
    "  [System.Windows.Forms.MessageBoxButtons]::YesNo,",
    "  [System.Windows.Forms.MessageBoxIcon]::Question",
    ")",
    "if ($answer -ne [System.Windows.Forms.DialogResult]::Yes) {",
    "  exit 0",
    "}",
    "",
    "$progressForm = New-Object System.Windows.Forms.Form",
    "$progressForm.Text = \"$productName Uninstall\"",
    "$progressForm.StartPosition = 'CenterScreen'",
    "$progressForm.FormBorderStyle = 'FixedDialog'",
    "$progressForm.MaximizeBox = $false",
    "$progressForm.MinimizeBox = $false",
    "$progressForm.ClientSize = New-Object System.Drawing.Size(420, 120)",
    "$progressForm.BackColor = [System.Drawing.Color]::FromArgb(245, 237, 224)",
    "",
    "$statusLabel = New-Object System.Windows.Forms.Label",
    "$statusLabel.Text = 'Removing application files...'",
    "$statusLabel.Location = New-Object System.Drawing.Point(24, 24)",
    "$statusLabel.Size = New-Object System.Drawing.Size(360, 22)",
    "$statusLabel.Font = New-Object System.Drawing.Font('Segoe UI', 10)",
    "$progressForm.Controls.Add($statusLabel)",
    "",
    "$progressBar = New-Object System.Windows.Forms.ProgressBar",
    "$progressBar.Location = New-Object System.Drawing.Point(24, 60)",
    "$progressBar.Size = New-Object System.Drawing.Size(372, 18)",
    "$progressBar.Style = 'Marquee'",
    "$progressForm.Controls.Add($progressBar)",
    "",
    "$progressForm.Add_Shown({",
    "  try {",
    "    Get-Process -Name SME -ErrorAction SilentlyContinue | Stop-Process -Force",
    "    $statusLabel.Text = 'Finalizing uninstall...'",
    "    [System.Windows.Forms.Application]::DoEvents()",
    "",
    "    $escapedTargetDir = $targetDir.Replace(\"'\", \"''\")",
    "    $escapedDesktopLink = $desktopLink.Replace(\"'\", \"''\")",
    "    $escapedStartMenuDir = $startMenuDir.Replace(\"'\", \"''\")",
    "    $escapedStartMenuLink = $startMenuLink.Replace(\"'\", \"''\")",
    "    $escapedStartMenuUninstallLink = $startMenuUninstallLink.Replace(\"'\", \"''\")",
    "    $escapedUninstallRegPath = $uninstallRegPath.Replace(\"'\", \"''\")",
    "    $escapedProductName = $productName.Replace(\"'\", \"''\")",
    "",
    "    $cleanupCommand = @\"",
    "`$ErrorActionPreference = 'SilentlyContinue'",
    "Add-Type -AssemblyName System.Windows.Forms",
    "`$targetDir = '$escapedTargetDir'",
    "`$desktopLink = '$escapedDesktopLink'",
    "`$startMenuDir = '$escapedStartMenuDir'",
    "`$startMenuLink = '$escapedStartMenuLink'",
    "`$startMenuUninstallLink = '$escapedStartMenuUninstallLink'",
    "`$uninstallRegPath = '$escapedUninstallRegPath'",
    "`$productName = '$escapedProductName'",
    "Start-Sleep -Seconds 2",
    "`$removed = `$false",
    "for (`$attempt = 0; `$attempt -lt 60; `$attempt += 1) {",
    "  try {",
    "    if (Test-Path -LiteralPath `$targetDir) {",
    "      Remove-Item -LiteralPath `$targetDir -Recurse -Force",
    "    }",
    "    `$removed = -not (Test-Path -LiteralPath `$targetDir)",
    "    if (`$removed) {",
    "      break",
    "    }",
    "  } catch {",
    "  }",
    "  Start-Sleep -Seconds 1",
    "}",
    "foreach (`$shortcutPath in @(`$desktopLink, `$startMenuLink, `$startMenuUninstallLink)) {",
    "  if (Test-Path -LiteralPath `$shortcutPath) {",
    "    Remove-Item -LiteralPath `$shortcutPath -Force -ErrorAction SilentlyContinue",
    "  }",
    "}",
    "if (Test-Path -LiteralPath `$startMenuDir) {",
    "  Remove-Item -LiteralPath `$startMenuDir -Recurse -Force -ErrorAction SilentlyContinue",
    "}",
    "if (Test-Path -LiteralPath `$uninstallRegPath) {",
    "  Remove-Item -LiteralPath `$uninstallRegPath -Recurse -Force -ErrorAction SilentlyContinue",
    "}",
    "if (`$removed) {",
    "  [void][System.Windows.Forms.MessageBox]::Show(",
    "    \"`$productName was removed successfully.\",",
    "    \"`$productName Uninstall\",",
    "    [System.Windows.Forms.MessageBoxButtons]::OK,",
    "    [System.Windows.Forms.MessageBoxIcon]::Information",
    "  )",
    "} else {",
    "  [void][System.Windows.Forms.MessageBox]::Show(",
    "    \"Unable to delete the install folder automatically. Remove it manually: `$targetDir\",",
    "    \"`$productName Uninstall\",",
    "    [System.Windows.Forms.MessageBoxButtons]::OK,",
    "    [System.Windows.Forms.MessageBoxIcon]::Warning",
    "  )",
    "}",
    "\"@",
    "",
    "    $encodedCleanupCommand = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($cleanupCommand))",
    "    Start-Process -FilePath 'powershell.exe' -ArgumentList @(",
    "      '-NoProfile',",
    "      '-NonInteractive',",
    "      '-ExecutionPolicy', 'Bypass',",
    "      '-WindowStyle', 'Hidden',",
    "      '-EncodedCommand', $encodedCleanupCommand",
    "    ) -WindowStyle Hidden",
    "    $progressForm.Close()",
    "  } catch {",
    "    [void][System.Windows.Forms.MessageBox]::Show(",
    "      $_.Exception.Message,",
    "      \"$productName Uninstall\",",
    "      [System.Windows.Forms.MessageBoxButtons]::OK,",
    "      [System.Windows.Forms.MessageBoxIcon]::Error",
    "    )",
    "    $progressForm.Close()",
    "  }",
    "})",
    "",
    "[void]$progressForm.ShowDialog()",
  ].join("\r\n");
}

async function writeIExpressPackage({
  stageDir,
  packagePath,
  friendlyName,
  appLaunched,
  fileEntries,
}) {
  const sedPath = path.join(stageDir, "package.sed");
  const sedContents = buildIExpressSedContents({
    stageDir,
    packagePath,
    friendlyName,
    appLaunched,
    fileNames: fileEntries.map((entry) => entry.name),
  });

  for (const entry of fileEntries) {
    const destinationPath = path.join(stageDir, entry.name);
    if (entry.copyFrom) {
      if (path.resolve(entry.copyFrom) !== path.resolve(destinationPath)) {
        await fs.copyFile(entry.copyFrom, destinationPath);
      }
      continue;
    }

    await fs.writeFile(destinationPath, entry.contents, entry.encoding);
  }

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

async function writeUninstallerPackage({
  stageDir,
  uninstallerPath,
  productName,
}) {
  const scriptPath = buildUninstallerScript({ productName });
  const sedPath = await writeIExpressPackage({
    stageDir,
    packagePath: uninstallerPath,
    friendlyName: `${productName} Uninstall`,
    appLaunched:
      "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File uninstall.ps1",
    fileEntries: [
      {
        name: "uninstall.ps1",
        contents: scriptPath,
        encoding: "utf8",
      },
    ],
  });

  return sedPath;
}

async function writeInstallerPackage({
  stageDir,
  installerPath,
  productName,
  productVersion,
  publisherName,
  payloadZipPath,
  bundledUninstallerPath,
}) {
  const scriptPath = buildInstallerScript({
    productName,
    productVersion,
    publisherName,
  });
  const sedPath = await writeIExpressPackage({
    stageDir,
    packagePath: installerPath,
    friendlyName: `${productName} Setup`,
    appLaunched:
      "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File install.ps1",
    fileEntries: [
      {
        name: "install.ps1",
        contents: scriptPath,
        encoding: "utf8",
      },
      {
        name: "payload.zip",
        copyFrom: payloadZipPath,
      },
      {
        name: "Uninstall SME.exe",
        copyFrom: bundledUninstallerPath,
      },
    ],
  });

  return sedPath;
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
    } else {
      await fs.rm(databasePath, { force: true });
    }
  }
}

function getGitCommitSha(rootDir) {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    }).trim();
  } catch {
    return "";
  }
}

async function main() {
  const rootDir = path.resolve(__dirname, "..");
  const distDir = path.join(rootDir, "dist");
  const tmpDir = path.join(rootDir, "tmp", "installer-build");
  const packagedOutDir = path.join(tmpDir, "packaged");
  const iexpressDir = path.join(tmpDir, "iexpress");
  const installerStageDir = path.join(iexpressDir, "installer");
  const uninstallerStageDir = path.join(iexpressDir, "uninstaller");
  const productName = normalizeProductName(packageJson);
  const publisherName = String(packageJson.author || productName).trim() || productName;
  const installerName = buildInstallerFileName(productName, packageJson.version);
  const installerPath = path.join(distDir, installerName);
  const manifestPath = path.join(distDir, RELEASE_MANIFEST_NAME);
  const bundledUninstallerName = "Uninstall SME.exe";
  const bundledUninstallerPath = path.join(installerStageDir, bundledUninstallerName);

  await cleanDistDirectory(distDir);
  await fs.rm(tmpDir, { recursive: true, force: true });
  await fs.mkdir(packagedOutDir, { recursive: true });
  await fs.mkdir(installerStageDir, { recursive: true });
  await fs.mkdir(uninstallerStageDir, { recursive: true });

  const packagedPaths = await withSeededDatabase(rootDir, tmpDir, async () =>
    packager({
      dir: rootDir,
      out: packagedOutDir,
      overwrite: true,
      platform: "win32",
      arch: "x64",
      name: "SME",
      executableName: "SME",
      icon: path.join(rootDir, "assets", "sme-icon"),
      asar: false,
      prune: true,
      ignore: [
        /^\/dist$/,
        /^\/module_registry$/,
        /^\/test$/,
        /^\/tmp$/,
        /^\/scripts$/,
        /^\/samples\/import_files$/,
        /^\/samples\/macro$/,
      ],
    })
  );

  const packagedDir = packagedPaths[0];
  const packagedAppDir = path.join(packagedDir, "resources", "app");
  const payloadZipPath = path.join(installerStageDir, "payload.zip");
  const installerLogPath = path.join(installerStageDir, "iexpress-installer.log");
  const uninstallerLogPath = path.join(uninstallerStageDir, "iexpress-uninstaller.log");
  const appSha256 = await hashDirectory(packagedAppDir);

  await compressDirectoryContents(packagedDir, payloadZipPath);

  const uninstallerSedPath = await writeUninstallerPackage({
    stageDir: uninstallerStageDir,
    uninstallerPath: bundledUninstallerPath,
    productName,
  });
  await runIExpress(uninstallerSedPath, uninstallerLogPath, rootDir);
  await fs.access(bundledUninstallerPath);

  const installerSedPath = await writeInstallerPackage({
    stageDir: installerStageDir,
    installerPath,
    productName,
    productVersion: packageJson.version,
    publisherName,
    payloadZipPath,
    bundledUninstallerPath,
  });
  await runIExpress(installerSedPath, installerLogPath, rootDir);
  await fs.access(installerPath);

  const installerSha256 = await hashFile(installerPath);
  const installerStats = await fs.stat(installerPath);
  const manifest = createReleaseManifest({
    packageJson,
    repository: parseGitHubRepository(packageJson),
    version: packageJson.version,
    installerName,
    installerSha256,
    installerSize: installerStats.size,
    appSha256,
    sourceCommit: getGitCommitSha(rootDir),
  });
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  await fs.rm(tmpDir, { recursive: true, force: true });
  console.log(`Installer exe: ${installerPath}`);
  console.log(`Release manifest: ${manifestPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

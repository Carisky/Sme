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

function buildExecutableName(productName) {
  const normalized = String(productName || "App")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, "");
  return normalized || "App";
}

function escapeVbScriptString(value) {
  return String(value || "").replace(/"/g, '""');
}

function buildHiddenPowerShellLauncherScript(scriptFileName) {
  const escapedScriptFileName = escapeVbScriptString(scriptFileName);
  return [
    "Option Explicit",
    "Dim shell, fso, scriptDir, scriptPath, command",
    'Set shell = CreateObject("WScript.Shell")',
    'Set fso = CreateObject("Scripting.FileSystemObject")',
    "scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)",
    `scriptPath = fso.BuildPath(scriptDir, "${escapedScriptFileName}")`,
    'command = "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File " & Chr(34) & scriptPath & Chr(34)',
    "WScript.Quit shell.Run(command, 0, True)",
    "",
  ].join("\r\n");
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

function buildInstallerScript({
  productName,
  productVersion,
  publisherName,
  productExecutableName,
  bundledUninstallerName,
  brandImageFileName,
}) {
  return [
    "$ErrorActionPreference = 'Stop'",
    "Add-Type -AssemblyName System.Windows.Forms",
    "Add-Type -AssemblyName System.Drawing",
    "Add-Type -AssemblyName System.IO.Compression.FileSystem",
    "try {",
    "  Add-Type @'",
    "using System.Runtime.InteropServices;",
    "public static class InstallerNativeMethods {",
    '  [DllImport("user32.dll")]',
    "  public static extern bool SetProcessDPIAware();",
    "}",
    "'@",
    "  [InstallerNativeMethods]::SetProcessDPIAware() | Out-Null",
    "} catch {",
    "}",
    "[System.Windows.Forms.Application]::EnableVisualStyles()",
    "",
    `$productName = '${escapePowerShellSingleQuoted(productName)}'`,
    `$productVersion = '${escapePowerShellSingleQuoted(productVersion)}'`,
    `$publisherName = '${escapePowerShellSingleQuoted(publisherName)}'`,
    `$productExecutableName = '${escapePowerShellSingleQuoted(productExecutableName)}'`,
    `$bundledUninstallerName = '${escapePowerShellSingleQuoted(bundledUninstallerName)}'`,
    `$brandImageFileName = '${escapePowerShellSingleQuoted(brandImageFileName)}'`,
    "$payloadZip = Join-Path $PSScriptRoot 'payload.zip'",
    "$bundledUninstaller = Join-Path $PSScriptRoot $bundledUninstallerName",
    "$brandImagePath = Join-Path $PSScriptRoot $brandImageFileName",
    "$defaultTargetDir = Join-Path $env:LOCALAPPDATA ('Programs\\' + $productName)",
    "$desktopLink = Join-Path ([Environment]::GetFolderPath('Desktop')) ($productName + '.lnk')",
    "$startMenuDir = Join-Path $env:APPDATA ('Microsoft\\Windows\\Start Menu\\Programs\\' + $productName)",
    "$startMenuLink = Join-Path $startMenuDir ($productName + '.lnk')",
    "$startMenuUninstallLink = Join-Path $startMenuDir ('Uninstall ' + $productName + '.lnk')",
    "$uninstallRegPath = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\' + $productExecutableName",
    "",
    "function Show-Message([string]$message, [System.Windows.Forms.MessageBoxIcon]$icon) {",
    "  [void][System.Windows.Forms.MessageBox]::Show($message, \"$productName Setup\", [System.Windows.Forms.MessageBoxButtons]::OK, $icon)",
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
    "function Set-UiProgress([double]$percent, [string]$status, [string]$detail) {",
    "  $clampedPercent = [Math]::Min(100, [Math]::Max(0, [int][Math]::Round($percent)))",
    "  if ($progressBar.Style -ne [System.Windows.Forms.ProgressBarStyle]::Continuous) {",
    "    $progressBar.Style = [System.Windows.Forms.ProgressBarStyle]::Continuous",
    "  }",
    "  $progressBar.Value = $clampedPercent",
    "  $progressValueLabel.Text = \"$clampedPercent%\"",
    "  if (-not [string]::IsNullOrWhiteSpace($status)) {",
    "    $statusLabel.Text = $status",
    "  }",
    "  if ($null -ne $detail) {",
    "    $detailLabel.Text = $detail",
    "  }",
    "  [System.Windows.Forms.Application]::DoEvents()",
    "}",
    "",
    "function Expand-ZipArchiveWithProgress([string]$zipPath, [string]$destinationPath) {",
    "  $archive = [System.IO.Compression.ZipFile]::OpenRead($zipPath)",
    "  try {",
    "    $fileEntries = @($archive.Entries | Where-Object { -not [string]::IsNullOrWhiteSpace($_.Name) })",
    "    foreach ($entry in $archive.Entries) {",
    "      $entryDestination = Join-Path $destinationPath $entry.FullName",
    "      if ([string]::IsNullOrWhiteSpace($entry.Name)) {",
    "        if (-not [string]::IsNullOrWhiteSpace($entryDestination)) {",
    "          New-Item -ItemType Directory -Path $entryDestination -Force | Out-Null",
    "        }",
    "        continue",
    "      }",
    "      $entryDirectory = Split-Path -Parent $entryDestination",
    "      if (-not [string]::IsNullOrWhiteSpace($entryDirectory)) {",
    "        New-Item -ItemType Directory -Path $entryDirectory -Force | Out-Null",
    "      }",
    "    }",
    "",
    "    [Int64]$totalUnits = 0",
    "    foreach ($entry in $fileEntries) {",
    "      $totalUnits += [Math]::Max([Int64]$entry.Length, 1)",
    "    }",
    "    if ($totalUnits -le 0) {",
    "      $totalUnits = 1",
    "    }",
    "",
    "    [Int64]$processedUnits = 0",
    "    $buffer = New-Object byte[] 1048576",
    "",
    "    foreach ($entry in $fileEntries) {",
    "      $entryDestination = Join-Path $destinationPath $entry.FullName",
    "      $entryLabel = if ([string]::IsNullOrWhiteSpace($entry.FullName)) { 'Files' } else { $entry.FullName }",
    "      $entryStream = $entry.Open()",
    "      try {",
    "        $fileStream = [System.IO.File]::Open($entryDestination, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)",
    "        try {",
    "          while (($read = $entryStream.Read($buffer, 0, $buffer.Length)) -gt 0) {",
    "            $fileStream.Write($buffer, 0, $read)",
    "            $processedUnits += $read",
    "            $percent = 8 + (($processedUnits / [double]$totalUnits) * 78)",
    "            Set-UiProgress $percent 'Extracting application files...' $entryLabel",
    "          }",
    "          if ($entry.Length -le 0) {",
    "            $processedUnits += 1",
    "            $percent = 8 + (($processedUnits / [double]$totalUnits) * 78)",
    "            Set-UiProgress $percent 'Extracting application files...' $entryLabel",
    "          }",
    "        } finally {",
    "          $fileStream.Dispose()",
    "        }",
    "      } finally {",
    "        $entryStream.Dispose()",
    "      }",
    "      if ($entry.LastWriteTime -and $entry.LastWriteTime.DateTime -gt [datetime]::MinValue) {",
    "        [System.IO.File]::SetLastWriteTime($entryDestination, $entry.LastWriteTime.DateTime)",
    "      }",
    "    }",
    "  } finally {",
    "    $archive.Dispose()",
    "  }",
    "}",
    "",
    "$form = New-Object System.Windows.Forms.Form",
    "$form.Text = \"$productName Setup\"",
    "$form.StartPosition = 'CenterScreen'",
    "$form.FormBorderStyle = 'FixedDialog'",
    "$form.MaximizeBox = $false",
    "$form.MinimizeBox = $false",
    "$form.ClientSize = New-Object System.Drawing.Size(728, 430)",
    "$form.BackColor = [System.Drawing.Color]::FromArgb(248, 243, 235)",
    "$form.Font = New-Object System.Drawing.Font('Segoe UI', 9)",
    "$form.AutoScaleMode = [System.Windows.Forms.AutoScaleMode]::Dpi",
    "",
    "$headerPanel = New-Object System.Windows.Forms.Panel",
    "$headerPanel.Location = New-Object System.Drawing.Point(0, 0)",
    "$headerPanel.Size = New-Object System.Drawing.Size(728, 116)",
    "$headerPanel.BackColor = [System.Drawing.Color]::FromArgb(49, 33, 19)",
    "$form.Controls.Add($headerPanel)",
    "",
    "$brandBox = New-Object System.Windows.Forms.PictureBox",
    "$brandBox.Location = New-Object System.Drawing.Point(26, 22)",
    "$brandBox.Size = New-Object System.Drawing.Size(72, 72)",
    "$brandBox.SizeMode = [System.Windows.Forms.PictureBoxSizeMode]::Zoom",
    "if (Test-Path $brandImagePath) {",
    "  try {",
    "    $brandBox.Image = [System.Drawing.Image]::FromFile($brandImagePath)",
    "  } catch {",
    "  }",
    "}",
    "$headerPanel.Controls.Add($brandBox)",
    "",
    "$titleLabel = New-Object System.Windows.Forms.Label",
    "$titleLabel.Text = \"$productName $productVersion\"",
    "$titleLabel.Location = New-Object System.Drawing.Point(116, 24)",
    "$titleLabel.Size = New-Object System.Drawing.Size(420, 34)",
    "$titleLabel.ForeColor = [System.Drawing.Color]::FromArgb(250, 240, 220)",
    "$titleLabel.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 19)",
    "$headerPanel.Controls.Add($titleLabel)",
    "",
    "$subtitleLabel = New-Object System.Windows.Forms.Label",
    "$subtitleLabel.Text = 'Clean install, no terminal windows, real progress during extraction.'",
    "$subtitleLabel.Location = New-Object System.Drawing.Point(118, 62)",
    "$subtitleLabel.Size = New-Object System.Drawing.Size(560, 22)",
    "$subtitleLabel.ForeColor = [System.Drawing.Color]::FromArgb(224, 205, 177)",
    "$subtitleLabel.Font = New-Object System.Drawing.Font('Segoe UI', 10)",
    "$headerPanel.Controls.Add($subtitleLabel)",
    "",
    "$pathLabel = New-Object System.Windows.Forms.Label",
    "$pathLabel.Text = 'Install location'",
    "$pathLabel.Location = New-Object System.Drawing.Point(28, 144)",
    "$pathLabel.Size = New-Object System.Drawing.Size(140, 22)",
    "$pathLabel.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 10)",
    "$form.Controls.Add($pathLabel)",
    "",
    "$pathHelpLabel = New-Object System.Windows.Forms.Label",
    "$pathHelpLabel.Text = 'The current version will be replaced in the selected folder.'",
    "$pathHelpLabel.Location = New-Object System.Drawing.Point(28, 168)",
    "$pathHelpLabel.Size = New-Object System.Drawing.Size(640, 20)",
    "$pathHelpLabel.ForeColor = [System.Drawing.Color]::FromArgb(112, 86, 60)",
    "$pathHelpLabel.Font = New-Object System.Drawing.Font('Segoe UI', 9)",
    "$form.Controls.Add($pathHelpLabel)",
    "",
    "$pathBox = New-Object System.Windows.Forms.TextBox",
    "$pathBox.Location = New-Object System.Drawing.Point(28, 196)",
    "$pathBox.Size = New-Object System.Drawing.Size(536, 32)",
    "$pathBox.Font = New-Object System.Drawing.Font('Segoe UI', 10.5)",
    "$pathBox.Text = $defaultTargetDir",
    "$form.Controls.Add($pathBox)",
    "",
    "$browseButton = New-Object System.Windows.Forms.Button",
    "$browseButton.Text = 'Browse...'",
    "$browseButton.Location = New-Object System.Drawing.Point(580, 194)",
    "$browseButton.Size = New-Object System.Drawing.Size(120, 36)",
    "$browseButton.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat",
    "$browseButton.BackColor = [System.Drawing.Color]::FromArgb(239, 231, 221)",
    "$browseButton.ForeColor = [System.Drawing.Color]::FromArgb(61, 40, 18)",
    "$browseButton.FlatAppearance.BorderColor = [System.Drawing.Color]::FromArgb(197, 170, 137)",
    "$browseButton.FlatAppearance.BorderSize = 1",
    "$form.Controls.Add($browseButton)",
    "",
    "$progressSectionLabel = New-Object System.Windows.Forms.Label",
    "$progressSectionLabel.Text = 'Installation progress'",
    "$progressSectionLabel.Location = New-Object System.Drawing.Point(28, 252)",
    "$progressSectionLabel.Size = New-Object System.Drawing.Size(180, 22)",
    "$progressSectionLabel.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 10)",
    "$form.Controls.Add($progressSectionLabel)",
    "",
    "$progressValueLabel = New-Object System.Windows.Forms.Label",
    "$progressValueLabel.Text = '0%'",
    "$progressValueLabel.Location = New-Object System.Drawing.Point(650, 252)",
    "$progressValueLabel.Size = New-Object System.Drawing.Size(50, 22)",
    "$progressValueLabel.TextAlign = [System.Drawing.ContentAlignment]::MiddleRight",
    "$progressValueLabel.ForeColor = [System.Drawing.Color]::FromArgb(122, 85, 44)",
    "$progressValueLabel.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 10)",
    "$form.Controls.Add($progressValueLabel)",
    "",
    "$progressBar = New-Object System.Windows.Forms.ProgressBar",
    "$progressBar.Location = New-Object System.Drawing.Point(28, 282)",
    "$progressBar.Size = New-Object System.Drawing.Size(672, 20)",
    "$progressBar.Style = [System.Windows.Forms.ProgressBarStyle]::Continuous",
    "$progressBar.Minimum = 0",
    "$progressBar.Maximum = 100",
    "$progressBar.Value = 0",
    "$form.Controls.Add($progressBar)",
    "",
    "$statusLabel = New-Object System.Windows.Forms.Label",
    "$statusLabel.Text = 'Ready to install.'",
    "$statusLabel.Location = New-Object System.Drawing.Point(28, 316)",
    "$statusLabel.Size = New-Object System.Drawing.Size(672, 24)",
    "$statusLabel.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 10.5)",
    "$form.Controls.Add($statusLabel)",
    "",
    "$detailLabel = New-Object System.Windows.Forms.Label",
    "$detailLabel.Text = 'The installer will unpack the application and register shortcuts automatically.'",
    "$detailLabel.Location = New-Object System.Drawing.Point(28, 344)",
    "$detailLabel.Size = New-Object System.Drawing.Size(672, 38)",
    "$detailLabel.ForeColor = [System.Drawing.Color]::FromArgb(101, 78, 53)",
    "$detailLabel.Font = New-Object System.Drawing.Font('Segoe UI', 9)",
    "$form.Controls.Add($detailLabel)",
    "",
    "$installButton = New-Object System.Windows.Forms.Button",
    "$installButton.Text = 'Install'",
    "$installButton.Location = New-Object System.Drawing.Point(486, 384)",
    "$installButton.Size = New-Object System.Drawing.Size(102, 36)",
    "$installButton.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat",
    "$installButton.BackColor = [System.Drawing.Color]::FromArgb(49, 33, 19)",
    "$installButton.ForeColor = [System.Drawing.Color]::FromArgb(247, 234, 212)",
    "$installButton.FlatAppearance.BorderSize = 0",
    "$installButton.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 9.5)",
    "$form.Controls.Add($installButton)",
    "",
    "$cancelButton = New-Object System.Windows.Forms.Button",
    "$cancelButton.Text = 'Cancel'",
    "$cancelButton.Location = New-Object System.Drawing.Point(598, 384)",
    "$cancelButton.Size = New-Object System.Drawing.Size(102, 36)",
    "$cancelButton.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat",
    "$cancelButton.BackColor = [System.Drawing.Color]::FromArgb(239, 231, 221)",
    "$cancelButton.ForeColor = [System.Drawing.Color]::FromArgb(61, 40, 18)",
    "$cancelButton.FlatAppearance.BorderColor = [System.Drawing.Color]::FromArgb(197, 170, 137)",
    "$cancelButton.FlatAppearance.BorderSize = 1",
    "$cancelButton.Font = New-Object System.Drawing.Font('Segoe UI', 9.5)",
    "$form.Controls.Add($cancelButton)",
    "",
    "$form.AcceptButton = $installButton",
    "$form.CancelButton = $cancelButton",
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
    "  if ($installButton.Enabled) {",
    "    $form.Close()",
    "  }",
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
    "    Set-UiProgress 2 'Preparing installation...' 'Closing a running application and validating the target folder.'",
    "",
    "    Get-Process -Name $productExecutableName -ErrorAction SilentlyContinue | Stop-Process -Force",
    "",
    "    if (Test-Path $targetDir) {",
    "      Remove-Item -LiteralPath $targetDir -Recurse -Force",
    "    }",
    "",
    "    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null",
    "    Set-UiProgress 6 'Preparing files...' 'Creating the installation directory.'",
    "    Expand-ZipArchiveWithProgress $payloadZip $targetDir",
    "",
    "    Set-UiProgress 90 'Copying bundled tools...' $bundledUninstallerName",
    "    $mainExe = Join-Path $targetDir ($productExecutableName + '.exe')",
    "    $targetUninstaller = Join-Path $targetDir $bundledUninstallerName",
    "    Copy-Item -LiteralPath $bundledUninstaller -Destination $targetUninstaller -Force",
    "",
    "    Set-UiProgress 94 'Creating shortcuts...' 'Desktop and Start menu entries are being refreshed.'",
    "    New-Item -ItemType Directory -Path $startMenuDir -Force | Out-Null",
    "    New-Shortcut $desktopLink $mainExe $targetDir $mainExe \"$productName application\"",
    "    New-Shortcut $startMenuLink $mainExe $targetDir $mainExe \"$productName application\"",
    "    New-Shortcut $startMenuUninstallLink $targetUninstaller $targetDir $mainExe \"Remove $productName\"",
    "",
    "    Set-UiProgress 97 'Registering application...' 'Writing uninstall information to the current user profile.'",
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
    "    Set-UiProgress 100 'Installation complete.' 'Launching the application.'",
    "    Start-Sleep -Milliseconds 250",
    "    Start-Process -FilePath $mainExe -WorkingDirectory $targetDir",
    "    $form.Close()",
    "  } catch {",
    "    $installButton.Enabled = $true",
    "    $browseButton.Enabled = $true",
    "    $cancelButton.Enabled = $true",
    "    Set-UiProgress 0 'Installation failed.' $_.Exception.Message",
    "    Show-Message $_.Exception.Message ([System.Windows.Forms.MessageBoxIcon]::Error)",
    "  }",
    "})",
    "",
    "$form.Add_FormClosed({",
    "  if ($brandBox.Image) {",
    "    $brandBox.Image.Dispose()",
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

function buildUninstallerScript({ productName, productExecutableName }) {
  return [
    "$ErrorActionPreference = 'Stop'",
    "Add-Type -AssemblyName System.Windows.Forms",
    "Add-Type -AssemblyName System.Drawing",
    "try {",
    "  Add-Type @'",
    "using System.Runtime.InteropServices;",
    "public static class UninstallNativeMethods {",
    '  [DllImport("user32.dll")]',
    "  public static extern bool SetProcessDPIAware();",
    "}",
    "'@",
    "  [UninstallNativeMethods]::SetProcessDPIAware() | Out-Null",
    "} catch {",
    "}",
    "[System.Windows.Forms.Application]::EnableVisualStyles()",
    "",
    `$productName = '${escapePowerShellSingleQuoted(productName)}'`,
    `$productExecutableName = '${escapePowerShellSingleQuoted(productExecutableName)}'`,
    "$desktopLink = Join-Path ([Environment]::GetFolderPath('Desktop')) ($productName + '.lnk')",
    "$startMenuDir = Join-Path $env:APPDATA ('Microsoft\\Windows\\Start Menu\\Programs\\' + $productName)",
    "$startMenuLink = Join-Path $startMenuDir ($productName + '.lnk')",
    "$startMenuUninstallLink = Join-Path $startMenuDir ('Uninstall ' + $productName + '.lnk')",
    "$uninstallRegPath = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\' + $productExecutableName",
    "$defaultTargetDir = Join-Path $env:LOCALAPPDATA ('Programs\\' + $productName)",
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
    "    Get-Process -Name $productExecutableName -ErrorAction SilentlyContinue | Stop-Process -Force",
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
  productExecutableName,
}) {
  const powerShellScriptName = "uninstall.ps1";
  const launcherScriptName = "uninstall-launcher.vbs";
  const scriptPath = buildUninstallerScript({
    productName,
    productExecutableName,
  });
  const sedPath = await writeIExpressPackage({
    stageDir,
    packagePath: uninstallerPath,
    friendlyName: `${productName} Uninstall`,
    appLaunched: `wscript.exe //Nologo ${launcherScriptName}`,
    fileEntries: [
      {
        name: powerShellScriptName,
        contents: scriptPath,
        encoding: "utf8",
      },
      {
        name: launcherScriptName,
        contents: buildHiddenPowerShellLauncherScript(powerShellScriptName),
        encoding: "ascii",
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
  productExecutableName,
  payloadZipPath,
  bundledUninstallerPath,
  bundledUninstallerName,
  brandImagePath,
}) {
  const powerShellScriptName = "install.ps1";
  const launcherScriptName = "install-launcher.vbs";
  const brandImageFileName = "brand.png";
  const scriptPath = buildInstallerScript({
    productName,
    productVersion,
    publisherName,
    productExecutableName,
    bundledUninstallerName,
    brandImageFileName,
  });
  const sedPath = await writeIExpressPackage({
    stageDir,
    packagePath: installerPath,
    friendlyName: `${productName} Setup`,
    appLaunched: `wscript.exe //Nologo ${launcherScriptName}`,
    fileEntries: [
      {
        name: powerShellScriptName,
        contents: scriptPath,
        encoding: "utf8",
      },
      {
        name: launcherScriptName,
        contents: buildHiddenPowerShellLauncherScript(powerShellScriptName),
        encoding: "ascii",
      },
      {
        name: "payload.zip",
        copyFrom: payloadZipPath,
      },
      {
        name: bundledUninstallerName,
        copyFrom: bundledUninstallerPath,
      },
      {
        name: brandImageFileName,
        copyFrom: brandImagePath,
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
  const productExecutableName = buildExecutableName(productName);
  const publisherName = String(packageJson.author || productName).trim() || productName;
  const installerName = buildInstallerFileName(productName, packageJson.version);
  const installerPath = path.join(distDir, installerName);
  const manifestPath = path.join(distDir, RELEASE_MANIFEST_NAME);
  const bundledUninstallerName = `Uninstall ${productExecutableName}.exe`;
  const bundledUninstallerPath = path.join(installerStageDir, bundledUninstallerName);
  const installerBrandImagePath = path.join(rootDir, "assets", "silesdoc-mark.png");

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
      name: productName,
      executableName: productExecutableName,
      icon: path.join(rootDir, "assets", "silesdoc-icon"),
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
    productExecutableName,
  });
  await runIExpress(uninstallerSedPath, uninstallerLogPath, rootDir);
  await fs.access(bundledUninstallerPath);

  const installerSedPath = await writeInstallerPackage({
    stageDir: installerStageDir,
    installerPath,
    productName,
    productVersion: packageJson.version,
    publisherName,
    productExecutableName,
    payloadZipPath,
    bundledUninstallerPath,
    bundledUninstallerName,
    brandImagePath: installerBrandImagePath,
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

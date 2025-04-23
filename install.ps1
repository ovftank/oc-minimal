$ErrorActionPreference = "Stop"

$scriptDir = $PSScriptRoot
$zipFile = $null
$tempExtract = $null

function Ensure-Directory {
    param(
        [Parameter(Mandatory = $true)][string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
    }
}

function Copy-DirectoryContents {
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Destination
    )

    if (-not (Test-Path -LiteralPath $Source -PathType Container)) {
        throw "Source directory not found: $Source"
    }

    Ensure-Directory -Path $Destination
    Get-ChildItem -LiteralPath $Source -Force | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination $Destination -Recurse -Force
    }
}

function Ensure-UserEnv {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Value
    )

    $current = [System.Environment]::GetEnvironmentVariable($Name, [System.EnvironmentVariableTarget]::User)
    if ([string]::IsNullOrWhiteSpace($current)) {
        [System.Environment]::SetEnvironmentVariable($Name, $Value, [System.EnvironmentVariableTarget]::User)
        [System.Environment]::SetEnvironmentVariable($Name, $Value, [System.EnvironmentVariableTarget]::Process)
        Write-Host "Set user env: $Name=$Value"
        return
    }

    [System.Environment]::SetEnvironmentVariable($Name, $current, [System.EnvironmentVariableTarget]::Process)
    Write-Host "User env already set: $Name=$current"
}

try {
    $opencodeSource = if ($scriptDir) { Join-Path $scriptDir "opencode" } else { $null }
    if ([string]::IsNullOrWhiteSpace($scriptDir) -or -not (Test-Path -LiteralPath $opencodeSource -PathType Container)) {
        $repoUrl = "https://github.com/ovftank/oc-minimal/archive/refs/heads/main.zip"
        $tempRoot = [System.IO.Path]::GetTempPath()
        $zipFile = Join-Path $tempRoot "config.zip"
        $tempExtract = Join-Path $tempRoot "win-conf-temp"

        Invoke-WebRequest -Uri $repoUrl -OutFile $zipFile
        if (Test-Path -LiteralPath $tempExtract -PathType Container) { Remove-Item -LiteralPath $tempExtract -Recurse -Force }
        Expand-Archive -LiteralPath $zipFile -DestinationPath $tempExtract -Force

        $extractedRoot = Get-ChildItem -LiteralPath $tempExtract -Directory | Select-Object -First 1
        if (-not $extractedRoot) {
            throw "Could not detect extracted repository root in $tempExtract"
        }

        $scriptDir = $extractedRoot.FullName
        $opencodeSource = Join-Path $scriptDir "opencode"
        if (-not (Test-Path -LiteralPath $opencodeSource -PathType Container)) {
            throw "Extracted repository does not contain opencode directory: $scriptDir"
        }
    }

    # Opencode experimental env
    $opencodeExperimentalEnv = @{
        OPENCODE_ENABLE_EXA = "1"
        OPENCODE_EXPERIMENTAL_FILEWATCHER = "true"
        OPENCODE_EXPERIMENTAL_LSP_TOOL = "true"
        OPENCODE_EXPERIMENTAL_LSP_TY = "true"
        OPENCODE_EXPERIMENTAL_WORKSPACES = "true"
    }

    foreach ($item in $opencodeExperimentalEnv.GetEnumerator()) {
        Ensure-UserEnv -Name $item.Key -Value $item.Value
    }

    # Windows Terminal
    $wtSettingsSource = Join-Path $scriptDir "windows-terminal\settings.json"
    $wtSettingsPaths = @(
        (Join-Path $env:LOCALAPPDATA "Packages\Microsoft.WindowsTerminal_8wekyb3d8bbwe\LocalState\settings.json"),
        (Join-Path $env:LOCALAPPDATA "Packages\Microsoft.WindowsTerminalPreview_8wekyb3d8bbwe\LocalState\settings.json"),
        (Join-Path $env:LOCALAPPDATA "Microsoft\Windows Terminal\settings.json")
    )

    foreach ($wtSettingsPath in $wtSettingsPaths) {
        $wtSettingsDir = Split-Path -Parent $wtSettingsPath
        if (Test-Path -LiteralPath $wtSettingsDir -PathType Container) {
            if (-not (Test-Path -LiteralPath $wtSettingsSource -PathType Leaf)) {
                throw "Windows Terminal settings source not found: $wtSettingsSource"
            }

            Copy-Item -LiteralPath $wtSettingsSource -Destination $wtSettingsPath -Force
        }
    }

    # Opencode
    $ocPath = Join-Path $env:USERPROFILE ".config\opencode"
    Copy-DirectoryContents -Source $opencodeSource -Destination $ocPath

    # PowerShell
    $pwshConfigDir = Join-Path $env:USERPROFILE ".config\pwsh"
    Copy-DirectoryContents -Source (Join-Path $scriptDir "pwsh") -Destination $pwshConfigDir

    $documentsDir = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::MyDocuments)
    if ([string]::IsNullOrWhiteSpace($documentsDir)) {
        throw "Could not resolve the current user's Documents folder"
    }

    $profilePaths = @(
        (Join-Path $documentsDir "WindowsPowerShell\Microsoft.PowerShell_profile.ps1"),
        (Join-Path $documentsDir "PowerShell\Microsoft.PowerShell_profile.ps1")
    )

    $sourceProfile = Join-Path $pwshConfigDir "Microsoft.PowerShell_profile.ps1"
    $sourceLine = ". `"$sourceProfile`""
    foreach ($profilePath in $profilePaths) {
        $profileDir = Split-Path -Parent $profilePath
        Ensure-Directory -Path $profileDir

        if (-not (Test-Path -LiteralPath $profilePath -PathType Leaf)) {
            New-Item -ItemType File -Path $profilePath -Force | Out-Null
        }

        $content = Get-Content -LiteralPath $profilePath
        if ($content -notcontains $sourceLine) {
            Add-Content -LiteralPath $profilePath -Value $sourceLine
        }
    }
}
finally {
    if ($zipFile -and (Test-Path -LiteralPath $zipFile -PathType Leaf)) {
        Remove-Item -LiteralPath $zipFile -Force
    }

    if ($tempExtract -and (Test-Path -LiteralPath $tempExtract -PathType Container)) {
        Remove-Item -LiteralPath $tempExtract -Recurse -Force
    }
}

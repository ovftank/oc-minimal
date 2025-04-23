$psrl = Get-Module -Name PSReadLine -ListAvailable | Select-Object -First 1
if ($psrl) {
    Import-Module PSReadLine -Force -PassThru | Out-Null
    try {
        Set-PSReadLineOption -PredictionSource HistoryAndPlugin
    } catch {
        try { Set-PSReadLineOption -PredictionSource History } catch {}
    }
    Set-PSReadLineOption -HistorySearchCursorMovesToEnd
    Set-PSReadLineKeyHandler -Key Tab -Function MenuComplete
    Set-PSReadLineKeyHandler -Key UpArrow -Function HistorySearchBackward
    Set-PSReadLineKeyHandler -Key DownArrow -Function HistorySearchForward
    Set-PSReadLineKeyHandler -Key Ctrl+z -Function Undo
    Set-PSReadLineKeyHandler -Key Ctrl+Shift+z -Function Redo
    Set-PSReadLineOption -Colors @{
        Command = $PSStyle.Foreground.FromRgb(0x50, 0xFA, 0x7B)
        Parameter = $PSStyle.Foreground.FromRgb(0xFF, 0x79, 0xC6)
        Operator = $PSStyle.Foreground.FromRgb(0xFF, 0x79, 0xC6)
        Variable = $PSStyle.Foreground.FromRgb(0xF8, 0xF8, 0xF2)
        String = $PSStyle.Foreground.FromRgb(0xF1, 0xFA, 0x8C)
        Number = $PSStyle.Foreground.FromRgb(0xFF, 0xB8, 0x6C)
        Type = $PSStyle.Foreground.FromRgb(0x8B, 0xE9, 0xFD)
        Comment = $PSStyle.Foreground.FromRgb(0x62, 0x72, 0xA4)
        Keyword = $PSStyle.Foreground.FromRgb(0xFF, 0x79, 0xC6)
        Member = $PSStyle.Foreground.FromRgb(0x69, 0xFF, 0x94)
        InlinePrediction = $PSStyle.Foreground.FromRgb(0x62, 0x72, 0xA4)
        ListPrediction = $PSStyle.Foreground.FromRgb(0xBD, 0x93, 0xF9)
        Selection = "$($PSStyle.Background.FromRgb(0x44,0x47,0x5A))$($PSStyle.Foreground.FromRgb(0xF8,0xF8,0xF2))"
    }
}

$__pwsh_c = @{
    purple = $PSStyle.Foreground.FromRgb(0xBD, 0x93, 0xF9)
    cyan = $PSStyle.Foreground.FromRgb(0x8B, 0xE9, 0xFD)
    grey = $PSStyle.Foreground.FromRgb(0x62, 0x72, 0xA4)
    green = $PSStyle.Foreground.FromRgb(0x50, 0xFA, 0x7B)
    orange = $PSStyle.Foreground.FromRgb(0xFF, 0xB8, 0x6C)
    red = $PSStyle.Foreground.FromRgb(0xFF, 0x55, 0x55)
    pink = $PSStyle.Foreground.FromRgb(0xFF, 0x79, 0xC6)
    rst = $PSStyle.Reset
}

$script:__pwsh_lastDir = $null
$script:__pwsh_gitBranch = $null
$script:__pwsh_gitDirty = $false

function __pwsh_updateGitInfo {
    $dir = (Get-Location).Path
    if ($dir -eq $script:__pwsh_lastDir) { return }
    $script:__pwsh_lastDir = $dir
    $script:__pwsh_gitBranch = $null
    $script:__pwsh_gitDirty = $false
    $__savedExit = $global:LASTEXITCODE
    $branch = git rev-parse --abbrev-ref HEAD 2>$null
    if ($LASTEXITCODE -eq 0 -and $branch) {
        if ($branch -eq 'HEAD') {
            $hash = git rev-parse --short HEAD 2>$null
            $script:__pwsh_gitBranch = "($hash)"
        } else {
            $script:__pwsh_gitBranch = $branch
        }
        $script:__pwsh_gitDirty = [bool](git status --porcelain -u no --ignore-submodules 2>$null)
    }
    $global:LASTEXITCODE = $__savedExit
}

Remove-Item -LiteralPath alias:ls, alias:tree -ErrorAction SilentlyContinue

$__gitRm = "C:\Program Files\Git\usr\bin\rm.exe"
if (Test-Path -LiteralPath $__gitRm -PathType Leaf) {
    Remove-Item -LiteralPath alias:rm -ErrorAction SilentlyContinue
    function rm { & $__gitRm @args }
} else {
    function rm {
        if ($args -contains '-rf' -or $args -contains '-fr') {
            $a = $args | Where-Object { $_ -notin @('-rf','-fr','-f','-r') }
            if ($a) { Remove-Item -LiteralPath $a -Recurse -Force }
        } elseif ($args) {
            Remove-Item -LiteralPath @args
        }
    }
}

function ls { eza --icons=always --group-directories-first @args }
function tree { eza --icons=always --tree @args }
function which { Get-Command @args -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source }
function clear { Clear-Host }
function touch { New-Item -ItemType File -Path @args -Force }

$global:LASTEXITCODE = 0

function prompt {
    if (-not $script:__pwsh_adminChecked) {
        $script:__pwsh_isAdmin = [Security.Principal.WindowsIdentity]::GetCurrent().Groups -match 'S-1-16-12288'
        $script:__pwsh_adminChecked = $true
    }

    __pwsh_updateGitInfo

    $c = $__pwsh_c
    $wd = (Get-Location).Path

    if ($wd -like "$HOME*") {
        $wd = "~$($wd.Substring($HOME.Length))"
    }

    $segGit = ''
    if ($script:__pwsh_gitBranch) {
        $cl = if ($script:__pwsh_gitDirty) { $c.orange } else { $c.green }
        $di = if ($script:__pwsh_gitDirty) { ' *' } else { '' }
        $segGit = " $($c.grey)$($c.rst) $cl$($script:__pwsh_gitBranch)$di$($c.rst)"
    }

    $segAdmin = if ($script:__pwsh_isAdmin) { " $($c.red)$($c.rst)" } else { '' }

    $segExit = ''
    if ($global:LASTEXITCODE -ne 0) {
        $segExit = " $($c.red)✗ $($global:LASTEXITCODE)$($c.rst)"
    }

    Write-Host "`n$($c.purple)󰨊 $env:USERNAME$($c.rst) $($c.cyan) $wd$($c.rst)$segGit$segAdmin$segExit" -NoNewline

    if ($script:__pwsh_isAdmin) {
        return "$($c.red) $($c.rst)"
    }

    return "$($c.pink) $($c.rst)"
}

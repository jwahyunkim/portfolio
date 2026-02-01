Param(
  [string]$DistPath = "$(Resolve-Path (Join-Path (Split-Path $PSScriptRoot -Parent) 'dist'))"
)

$ErrorActionPreference = 'SilentlyContinue'
Write-Host "[CLEAN] Force clean target: $DistPath"

# ---------------------------------------------------------
# Native API: MoveFileEx (for delete-on-reboot schedule)
# ---------------------------------------------------------
Add-Type -Namespace Win32 -Name NativeMethods -MemberDefinition @'
  [System.Runtime.InteropServices.DllImport("kernel32.dll", SetLastError=true, CharSet=System.Runtime.InteropServices.CharSet.Unicode)]
  public static extern bool MoveFileEx(string lpExistingFileName, string lpNewFileName, int dwFlags);
'@

function Ensure-Handle {
  $toolDir = Join-Path $env:TEMP "sysinternals_tools"
  $exe = Join-Path $toolDir "handle64.exe"
  if (Test-Path $exe) { return $exe }

  New-Item -ItemType Directory -Force -Path $toolDir | Out-Null
  $zip = Join-Path $toolDir "handle.zip"

  Write-Host "[CLEAN] Downloading Sysinternals Handle..."
  Invoke-WebRequest -UseBasicParsing -Uri "https://download.sysinternals.com/files/Handle.zip" -OutFile $zip
  Expand-Archive -Path $zip -DestinationPath $toolDir -Force
  return $exe
}

function Close-Explorer-On($Path) {
  # If explorer has the folder open, kill it temporarily
  $procs = Get-Process explorer -ErrorAction SilentlyContinue
  if (-not $procs) { return }
  taskkill /f /im explorer.exe | Out-Null
  Start-Sleep -Milliseconds 500
}

function Reopen-Explorer {
  Start-Process explorer.exe | Out-Null
}

function Clear-Attrs($Path) {
  cmd /c "attrib -R -S -H `"$Path\*`" /S /D" | Out-Null
}

function Take-Ownership($Path) {
  cmd /c "takeown /F `"$Path`" /R /D Y" | Out-Null
  cmd /c "icacls `"$Path`" /grant *S-1-5-32-544:F /T /C /Q" | Out-Null
}

function Mirror-Empty($Path) {
  $empty = Join-Path $env:TEMP ("empty_" + [Guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Force -Path $empty | Out-Null
  robocopy "$empty" "$Path" /MIR /NFL /NDL /NJH /NJS /NC /NS | Out-Null
  Remove-Item $empty -Recurse -Force -ErrorAction SilentlyContinue
}

function Remove-PS($Path) {
  Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction SilentlyContinue
  return -not (Test-Path $Path)
}

function Rename-Then-Delete($Path) {
  if (-not (Test-Path $Path)) { return $true }

  $tmp = "$Path.__to_delete__$(Get-Date -Format yyyyMMddHHmmss)"

  try {
    $newName = Split-Path $tmp -Leaf
    Rename-Item -LiteralPath $Path -NewName $newName -ErrorAction Stop

    Mirror-Empty $tmp
    Remove-PS $tmp | Out-Null

    if (Test-Path $tmp) {
      # Last fallback using a new PowerShell process
      $escaped = $tmp.Replace("'", "''")
      powershell -NoProfile -ExecutionPolicy Bypass -Command "Remove-Item -LiteralPath '$escaped' -Recurse -Force -ErrorAction SilentlyContinue" | Out-Null
    }

    return -not (Test-Path $tmp)
  }
  catch {
    return $false
  }
}

function Schedule-Delete-OnReboot($Path) {
  $normalized = $Path.Replace('"','""')
  [Win32.NativeMethods]::MoveFileEx($normalized, $null, 4) | Out-Null
  Write-Warning "[SCHEDULED] Delete on next reboot: $Path"
}

# ---------------------------------------------------------
# Main logic
# ---------------------------------------------------------
if (-not (Test-Path $DistPath)) {
  Write-Host "[CLEAN] Target folder does not exist: $DistPath"
  exit 0
}

Close-Explorer-On $DistPath

# 1) Close file handles using Sysinternals Handle
$handle = Ensure-Handle
Write-Host "[CLEAN] Searching handles under: $DistPath"
$raw = & $handle -nobanner -accepteula $DistPath 2>$null

if ($raw) {
  $lines = $raw | Select-String -Pattern 'pid:\s*(\d+).*type:\s*File.*' -AllMatches
  foreach ($l in $lines) {
    $t = $l.ToString()
    if ($t -match 'pid:\s*(\d+).*?\s([0-9A-F]+):\s') {
      $pid = $Matches[1]
      $h   = $Matches[2]
      & $handle -nobanner -accepteula -c $h -p $pid -y 2>$null
    }
  }
  Start-Sleep -Milliseconds 300
}

# 2) Attributes / ownership / mirror empty and delete
Clear-Attrs $DistPath
Take-Ownership $DistPath
Mirror-Empty $DistPath

cmd /c "rmdir /s /q `"$DistPath`"" | Out-Null

if (Test-Path $DistPath) {
  # 3) If still exists, rename and try again
  if (-not (Rename-Then-Delete $DistPath)) {
    Schedule-Delete-OnReboot $DistPath
  }
}

Reopen-Explorer

if (-not (Test-Path $DistPath)) {
  Write-Host "[CLEAN] dist deleted successfully."
  exit 0
} else {
  Write-Warning "[WARN] dist still exists (locked deeply). Reboot will finish deletion if it was scheduled."
  exit 0
}

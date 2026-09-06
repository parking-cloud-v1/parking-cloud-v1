$ErrorActionPreference = 'Stop'

Write-Host '=========================================' -ForegroundColor Cyan
Write-Host 'Parking Cloud - Prelaunch Local Check' -ForegroundColor Cyan
Write-Host 'Windows PowerShell 5.1 compatible - rev3' -ForegroundColor Cyan
Write-Host '=========================================' -ForegroundColor Cyan

$fail = 0
$warn = 0

function Pass($msg) {
  Write-Host "[PASS] $msg" -ForegroundColor Green
}

function Warn($msg) {
  $script:warn++
  Write-Host "[WARN] $msg" -ForegroundColor Yellow
}

function Fail($msg) {
  $script:fail++
  Write-Host "[FAIL] $msg" -ForegroundColor Red
}

if (Get-Command node -ErrorAction SilentlyContinue) {
  Pass "Node.js: $(node -v)"
} else {
  Fail 'Node.js was not found.'
}

if (Get-Command npm -ErrorAction SilentlyContinue) {
  Pass "npm: $(npm -v)"
} else {
  Fail 'npm was not found.'
}

$envFile = Join-Path (Get-Location) '.env.local'
$values = @{}
$hasLocalEnv = Test-Path $envFile

if ($hasLocalEnv) {
  Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if (!$line -or $line.StartsWith('#') -or !$line.Contains('=')) {
      return
    }

    $pair = $line.Split('=', 2)
    $key = $pair[0].Trim()
    $value = $pair[1].Trim().Trim('"').Trim("'")
    $values[$key] = $value
  }

  Pass '.env.local found. Secret values are not printed.'
} else {
  Warn '.env.local not found. Vercel environment values cannot be read by this local script.'
}

function ValueOf($name) {
  if ($values.ContainsKey($name)) {
    return [string]$values[$name]
  }

  return [string][Environment]::GetEnvironmentVariable($name)
}

$supabaseUrl = ValueOf 'NEXT_PUBLIC_SUPABASE_URL'
$anonKey = ValueOf 'NEXT_PUBLIC_SUPABASE_ANON_KEY'
$serviceKey = ValueOf 'SUPABASE_SERVICE_ROLE_KEY'
$otpSecret = ValueOf 'OTP_HASH_SECRET'
$otpDevMode = (ValueOf 'OTP_DEV_MODE').ToLowerInvariant()
$appUrl = ValueOf 'NEXT_PUBLIC_APP_URL'

if (!$appUrl) {
  $appUrl = ValueOf 'NEXT_PUBLIC_SITE_URL'
}

if ($supabaseUrl) {
  Pass 'NEXT_PUBLIC_SUPABASE_URL is set locally.'
} else {
  Warn 'NEXT_PUBLIC_SUPABASE_URL is not visible locally. Verify it in Vercel.'
}

if ($anonKey) {
  Pass 'NEXT_PUBLIC_SUPABASE_ANON_KEY is set locally.'
} else {
  Warn 'NEXT_PUBLIC_SUPABASE_ANON_KEY is not visible locally. Verify it in Vercel.'
}

if ($serviceKey) {
  Pass 'SUPABASE_SERVICE_ROLE_KEY is set locally. Value is hidden.'
} else {
  Warn 'SUPABASE_SERVICE_ROLE_KEY is not visible locally. Verify it in Vercel.'
}

if ($otpSecret) {
  if ($otpSecret.Length -lt 32) {
    Fail 'OTP_HASH_SECRET is shorter than 32 characters.'
  } elseif ($serviceKey -and $otpSecret -eq $serviceKey) {
    Fail 'OTP_HASH_SECRET must not equal SUPABASE_SERVICE_ROLE_KEY.'
  } else {
    Pass 'OTP_HASH_SECRET is independent and at least 32 characters.'
  }
} else {
  Warn 'OTP_HASH_SECRET is not visible locally. Verify Production and Preview in Vercel.'
}

if ($otpDevMode) {
  if ($otpDevMode -eq 'true') {
    Fail 'OTP_DEV_MODE=true in .env.local. Set it to false for the final prelaunch test.'
  } elseif ($otpDevMode -eq 'false') {
    Pass 'OTP_DEV_MODE=false.'
  } else {
    Warn 'OTP_DEV_MODE has an unexpected local value. Production should be false.'
  }
} else {
  Warn 'OTP_DEV_MODE is not visible locally. Verify Production and Preview are false in Vercel.'
}

if ($appUrl) {
  if ($appUrl -match '^https://') {
    Pass "App URL uses HTTPS: $appUrl"
  } elseif ($appUrl -match 'localhost|127\.0\.0\.1') {
    Warn 'Local app URL detected. Production must use an HTTPS URL.'
  } else {
    Fail 'App URL is set but is not HTTPS.'
  }
} else {
  Warn 'NEXT_PUBLIC_APP_URL is not visible locally. Verify the Production value in Vercel.'
}

# Check that .env.local is not tracked by git. Never print its content.
# Avoid --error-unmatch because Windows PowerShell 5.1 may surface native stderr as a PowerShell error.
if (Get-Command git -ErrorAction SilentlyContinue) {
  $trackedEnv = ((& git ls-files -- .env.local 2>$null) | Out-String).Trim()
  if ($trackedEnv) {
    Fail '.env.local is tracked by git. Remove it from git before going live.'
  } else {
    Pass '.env.local is not tracked by git.'
  }
}

$publicServiceRoleName = 'NEXT_PUBLIC_' + 'SUPABASE_SERVICE_ROLE_KEY'
$sourceFiles = Get-ChildItem -Recurse -File -Include *.ts,*.tsx,*.js,*.jsx -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -notmatch '[\\/](node_modules|\.next|\.git)[\\/]' }

$publicSecretLeak = $sourceFiles |
  Select-String -Pattern $publicServiceRoleName -SimpleMatch -ErrorAction SilentlyContinue

if ($publicSecretLeak) {
  Fail "$publicServiceRoleName must not appear in source files."
} else {
  Pass 'No NEXT_PUBLIC Service Role Key variable was found.'
}

$clientLeakFiles = @()
foreach ($sourceFile in $sourceFiles) {
  if ($sourceFile.Extension -ne '.ts' -and $sourceFile.Extension -ne '.tsx') {
    continue
  }

  try {
    # Use .NET ReadAllText instead of Get-Content -Raw for maximum Windows PowerShell 5.1 compatibility.
    $content = [System.IO.File]::ReadAllText($sourceFile.FullName)
  } catch {
    continue
  }

  # Avoid quote-heavy regex syntax so Windows PowerShell 5.1 parses this reliably.
  $hasUseClient =
    $content.Contains("'use client'") -or
    $content.Contains('"use client"')

  if ($hasUseClient -and $content.Contains('SUPABASE_SERVICE_ROLE_KEY')) {
    $clientLeakFiles += $sourceFile.FullName
  }
}

if ($clientLeakFiles.Count -gt 0) {
  Fail 'A Client Component directly references SUPABASE_SERVICE_ROLE_KEY.'
  foreach ($clientLeakFile in $clientLeakFiles) {
    Write-Host "       $clientLeakFile" -ForegroundColor Red
  }
} else {
  Pass 'Client Components do not directly reference SUPABASE_SERVICE_ROLE_KEY.'
}

Write-Host ''
Write-Host 'Running npm run build...' -ForegroundColor Cyan

& npm run build
$buildExitCode = $LASTEXITCODE

if ($buildExitCode -ne 0) {
  Fail "npm run build failed. Exit code: $buildExitCode"
} else {
  Pass 'npm run build succeeded.'
}

Write-Host ''
Write-Host '-----------------------------------------' -ForegroundColor Cyan
Write-Host "RESULT: FAIL = $fail, WARN = $warn" -ForegroundColor Cyan

if ($fail -gt 0) {
  Write-Host 'DO NOT GO LIVE YET. Fix every FAIL item first.' -ForegroundColor Red
  exit 1
}

Write-Host 'Local blocking checks passed.' -ForegroundColor Green
Write-Host 'Next: deploy Preview and sign in as supervisor.' -ForegroundColor Green
Write-Host 'Open: /dashboard/online/health' -ForegroundColor Green
Write-Host 'Then complete the real phone OTP -> sign -> PDF -> /status OTP download test.' -ForegroundColor Green
exit 0

param(
  [Parameter(Position = 0)]
  [string]$Message
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw 'Git نصب یا در PATH موجود نیست.'
}

try {
  git rev-parse --is-inside-work-tree *> $null
} catch {
  throw 'این پوشه هنوز Git repository نیست. ابتدا مراحل راه‌اندازی اولیه در README را انجام دهید.'
}

git add --all

git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
  Write-Host 'تغییری برای ثبت وجود ندارد.'
  exit 0
}

if ([string]::IsNullOrWhiteSpace($Message)) {
  $Message = Read-Host 'پیام کامیت'
}
if ([string]::IsNullOrWhiteSpace($Message)) {
  throw 'پیام کامیت نمی‌تواند خالی باشد.'
}

git commit -m $Message
git push

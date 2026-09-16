<#
    Build the HeartForge submission ZIP.

        pwsh scripts/build-submission.ps1

    The five deliverables the brief asks for sit at the root of the archive,
    renamed to the brief's own wording so a judge maps ZIP to requirement
    without having to think about it. Source files in the repository keep their
    own names; the renaming happens on copy.

    The archive carries no source code — the running app is at the live URL and
    the code is in the repository, both linked from START-HERE.md. What it does
    carry is the two Claude Skills, because those are the part of the solution
    that runs inside Claude rather than on the server.

    Secrets are excluded by construction: the script copies a known list of
    files rather than the tree minus exclusions, so nothing can be swept in by
    accident. It then asserts that no .env or database file made it in anyway.
#>

$ErrorActionPreference = 'Stop'

$Root    = Split-Path -Parent $PSScriptRoot
$Name    = 'Lakshitha_All'
$Stage   = Join-Path $env:TEMP $Name
$Zip     = Join-Path (Split-Path -Parent $Root) "$Name.zip"
$LiveUrl = 'https://greenlight-umber.vercel.app'

Write-Host "building $Name.zip from $Root"

# ── stage ──────────────────────────────────────────────────────────────────
Remove-Item $Stage -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $Zip -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $Stage, "$Stage\Solution", "$Stage\Diagrams" | Out-Null

# the five deliverables, at the root, named as the brief names them
$files = @{
    'SUBMISSION.md'             = 'START-HERE.md'
    'docs\greenlight-deck.pptx' = 'Presentation-Deck.pptx'
    'docs\greenlight-deck.html' = 'Presentation-Deck.html'
    'INSTALL.md'                = 'Installation-and-Usage.md'
    'TEST-CASES.md'             = 'Test-Cases.md'
    'DEPARTMENTS.md'            = 'Applicable-Departments.md'
}
foreach ($src in $files.Keys) {
    $from = Join-Path $Root $src
    if (-not (Test-Path $from)) { throw "missing deliverable: $src" }
    Copy-Item $from (Join-Path $Stage $files[$src])
}

# the solution: both Skills, in their working layout, plus what they are
Copy-Item (Join-Path $Root 'skills\README.md') "$Stage\Solution\README.md"
foreach ($skill in 'software-compliance-research', 'email-request-triage') {
    New-Item -ItemType Directory -Path "$Stage\Solution\$skill" | Out-Null
    Copy-Item (Join-Path $Root "skills\$skill\SKILL.md") "$Stage\Solution\$skill\SKILL.md"
}

# supporting diagrams
Copy-Item (Join-Path $Root 'docs\*.drawio') "$Stage\Diagrams\"

# One double-click from opening the archive to seeing the thing running, which
# is the most persuasive artefact in the submission.
#
# The address is in the filename on purpose. A .url is occasionally stripped by
# corporate mail and download scanners — the one real weakness of the format —
# and a file called Live-Demo.url then leaves nothing behind. This way a reader
# can still type it straight out of the file listing. CRLF and ASCII are what
# Explorer expects of a .url.
$shortcut = Join-Path $Stage ("Live Demo - " + ($LiveUrl -replace '^https?://', '') + ".url")
"[InternetShortcut]`r`nURL=$LiveUrl`r`n" | Set-Content -Path $shortcut -Encoding Ascii -NoNewline

# ── assert no secret got in ────────────────────────────────────────────────
$leaked = Get-ChildItem $Stage -Recurse -Force -File |
    Where-Object { $_.Name -in @('.env', '.env.local', '.env.production') -or $_.Extension -in @('.db', '.sqlite') }
if ($leaked) {
    $leaked | ForEach-Object { Write-Host "LEAKED: $($_.FullName)" -ForegroundColor Red }
    throw 'refusing to build: a secret or database file reached the staging directory'
}

# ── zip ────────────────────────────────────────────────────────────────────
Compress-Archive -Path "$Stage\*" -DestinationPath $Zip -CompressionLevel Optimal -Force
Remove-Item $Stage -Recurse -Force

$kb = [math]::Round((Get-Item $Zip).Length / 1KB, 0)
Write-Host ""
Write-Host "$Zip  ($kb KB)" -ForegroundColor Green
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($Zip)
$archive.Entries | Sort-Object FullName | ForEach-Object {
    "  {0,-46} {1,7:N0} B" -f $_.FullName.Replace('\', '/'), $_.Length
}
$archive.Dispose()

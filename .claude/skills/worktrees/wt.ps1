# Worktree pool: fixed sibling slots (<repo>-2, <repo>-3, ...) that keep their node_modules.
# Instead of `git worktree add` + full install per task, take a free slot, switch branch,
# and only re-sync deps when a package-lock.json / patches/ actually changed.
# Works for any git repo this file sits in: the repo, slot names and base branch are derived.
#
#   wt.ps1 status                      list slots: branch, owner, dirty
#   wt.ps1 init [-Count 2]             create missing slots + clean install each
#   wt.ps1 take [<branch>] [-Base origin/main] [-Clean] [-NoServe]
#                                      lock a free clean slot, switch to <branch>
#                                      (existing local/remote branch, else new from -Base);
#                                      no branch = detached at -Base (branch it later inside the slot);
#                                      then starts its dev servers on its own ports (see serve)
#   wt.ps1 release <slot|path> [-Force]
#                                      stop its dev servers, unlock slot, detach HEAD so the branch is free elsewhere
#   wt.ps1 sync <slot|path> [-Clean]   re-sync deps in a slot
#   wt.ps1 all [-NoFetch]              every worktree of the repo: branch, dirty, ahead/behind, PR, lock, FREE
#   wt.ps1 reset <all|name|path> [-Force] [-NoDeps]
#                                      clean worktree -> latest base (the one on the base branch: pull --ff-only;
#                                      others: detached at the base), unlock, re-sync deps.
#                                      Never touches a dirty tree; skips a locked slot unless -Force;
#                                      'all' skips the primary checkout unless it is on the base branch.
#   wt.ps1 config                      copy local-files.txt entries from the primary checkout into every slot
#   wt.ps1 ports [<slot|path>]         dev-server ports of a worktree (default: the current one):
#                                      worktree N (primary = 1, <repo>-N = N) -> WEB_PORT=N*1111 API_PORT=N*1111+1
#   wt.ps1 serve [<slot|path>]         start the worktree's dev servers (dev-servers.txt) hidden in the background
#                                      on its ports, wait until they listen; a port already in use is left alone
#   wt.ps1 stop [<slot|path>]          stop the dev servers `serve` started there
#
# Optional local-files.txt next to this script: git-ignored files/folders (relative paths, one per line)
# that a fresh worktree needs, copied from the primary checkout on init/reset/config.
# Optional dev-servers.txt next to this script: the repo's dev servers, one per line
# `<WEB|API> <dir relative to the worktree> <command>`; {WEB_PORT}/{API_PORT} in the command are replaced.
param(
    [Parameter(Position = 0)][ValidateSet('status', 'init', 'take', 'release', 'sync', 'config', 'all', 'reset', 'ports', 'serve', 'stop')][string]$Cmd = 'status',
    [Parameter(Position = 1)][string]$Arg,
    [int]$Count = 2,
    [string]$Base,
    [switch]$Clean,
    [switch]$Force,
    [switch]$NoFetch,
    [switch]$NoDeps,
    [switch]$NoServe
)
# Continue, not Stop: PS 5.1 turns any native stderr line (git progress, npm warnings) into a
# terminating error. Failures are decided by exit codes below.
$ErrorActionPreference = 'Continue'

# Primary checkout = parent of the shared .git dir, whichever worktree this script runs from.
$CommonDir = (& git -C $PSScriptRoot rev-parse --path-format=absolute --git-common-dir).Trim() -replace '/', '\'
if ($LASTEXITCODE -ne 0) { throw "not inside a git repo: $PSScriptRoot" }
$Repo = Split-Path $CommonDir -Parent
$Root = Split-Path $Repo -Parent
$Prefix = (Split-Path $Repo -Leaf) + '-'
# Own npm cache so pool installs don't race other sessions' npm runs.
$NpmCache = Join-Path $HOME '.npm-cache-pool'
$LocalFilesList = Join-Path $PSScriptRoot 'local-files.txt'
$DevServersList = Join-Path $PSScriptRoot 'dev-servers.txt'

if (-not $Base) {
    $Base = (& git -C $Repo symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>$null)
    if (-not $Base) {
        $Base = 'origin/main'
        if (-not (& git -C $Repo rev-parse --verify --quiet refs/remotes/origin/main)) { $Base = 'origin/master' }
    }
}
$BaseBranch = $Base -replace '^origin/', ''

function Get-Slots {
    @(Get-ChildItem $Root -Directory -Filter "$Prefix*" | Where-Object { $_.Name -match ('^' + [regex]::Escape($Prefix) + '\d+$') } |
        Sort-Object { [int]($_.Name.Substring($Prefix.Length)) })
}

function Invoke-Git([string]$Path) {
    $out = & git -C $Path @args 2>&1 | ForEach-Object { "$_" }
    if ($LASTEXITCODE -ne 0) { throw "git $($args -join ' ') failed in $Path (exit $LASTEXITCODE): $($out -join ' ')" }
    $out
}

# A concurrent fetch (another session) fails ours with 'cannot lock ref'; the other fetch updates
# the same refs, so warn and carry on rather than abort.
function Update-Remote { & git -C $Repo fetch origin --quiet --prune 2>&1 | ForEach-Object { "$_" } | Out-Null; if ($LASTEXITCODE -ne 0) { Write-Warning 'git fetch failed (likely a concurrent fetch) - continuing with current refs' } }

# Lock lives in the worktree's private git dir (.git\worktrees\<name>), so it never shows in git status.
function Get-LockPath([string]$Path) { Join-Path (Invoke-Git $Path rev-parse --absolute-git-dir).Trim() 'wt-slot.lock' }

# Every folder with a tracked package-lock.json (root, sub-apps).
function Get-PackageDirs([string]$Path) {
    @(& git -C $Path ls-files -- '*package-lock.json' | Where-Object { $_ -notmatch 'node_modules' } |
        ForEach-Object { $d = Split-Path ($_ -replace '/', '\') -Parent; if ($d) { Join-Path $Path $d } else { $Path } })
}

function Get-DepsHash([string]$Dir) {
    $files = @(Join-Path $Dir 'package-lock.json')
    $files += @(Get-ChildItem (Join-Path $Dir 'patches') -File -ErrorAction SilentlyContinue | Sort-Object Name | ForEach-Object FullName)
    ($files | ForEach-Object { (Get-FileHash $_ -Algorithm SHA256).Hash }) -join ':'
}

function Resolve-Slot([string]$NameOrPath) {
    if (-not $NameOrPath) { $NameOrPath = (Get-Location).Path }
    foreach ($s in Get-Slots) {
        if ($s.Name -eq $NameOrPath -or $s.FullName -eq $NameOrPath.TrimEnd('\') -or $NameOrPath.StartsWith($s.FullName + '\')) { return $s.FullName }
    }
    throw "not a slot: $NameOrPath (slots: $((Get-Slots | ForEach-Object Name) -join ', '))"
}

# Primary checkout or a slot, by name or by any path inside it (default: the current dir).
function Resolve-Worktree([string]$NameOrPath) {
    if (-not $NameOrPath) { $NameOrPath = (Get-Location).Path }
    $path = $NameOrPath.TrimEnd('\')
    if ($path -eq $Repo -or $path.StartsWith($Repo + '\') -or $path -eq (Split-Path $Repo -Leaf)) { return $Repo }
    Resolve-Slot $NameOrPath
}

# Worktree number: primary checkout = 1, <repo>-N = N. Ports derive from it so slots never share dev servers.
function Get-SlotPorts([string]$NameOrPath) {
    $path = Resolve-Worktree $NameOrPath
    if ($path -eq $Repo) { $n = 1 } else { $n = [int]((Split-Path $path -Leaf).Substring($Prefix.Length)) }
    # Never usable: Chrome's ERR_UNSAFE_PORT range (6665-6669) and Windows portproxy listeners
    # (netsh interface portproxy, e.g. 2222 forwarded to a VM's SSH). A reserved port moves up to the next one.
    if ($null -eq $script:ReservedPorts) {
        $script:ReservedPorts = @(6665..6669) + @(netsh interface portproxy show all | ForEach-Object { if ($_ -match '^\S+\s+(\d+)\s+\S+\s+\d+\s*$') { [int]$Matches[1] } })
    }
    $reserved = $script:ReservedPorts
    $api = $n * 1111 + 1
    while ($reserved -contains $api) { $api++ }
    $web = $n * 1111
    while ($reserved -contains $web -or $web -eq $api) { $web++ }
    [pscustomobject]@{ Number = $n; Web = $web; Api = $api }
}

function Get-ListeningPorts { @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | ForEach-Object { [int]$_.LocalPort } | Sort-Object -Unique) }

# Each server runs as a hidden `cmd /c <command>` (outlives this script; output in the worktree's private
# git dir, wt-serve-<kind>.log). Its PID goes to wt-serve.pids so `stop` can end the whole process tree.
function Start-DevServers([string]$Path) {
    if (-not (Test-Path $DevServersList)) { Write-Host "no $DevServersList - no dev servers to start"; return }
    $ports = Get-SlotPorts $Path
    $gitDir = (Invoke-Git $Path rev-parse --absolute-git-dir).Trim()
    $listening = Get-ListeningPorts
    $started = @()
    foreach ($line in Get-Content $DevServersList) {
        if ($line -notmatch '^\s*(WEB|API)\s+(\S+)\s+(.+?)\s*$') { continue }
        $kind = $Matches[1]
        $dir = Join-Path $Path $Matches[2]
        $command = $Matches[3] -replace '\{WEB_PORT\}', $ports.Web -replace '\{API_PORT\}', $ports.Api
        if ($kind -eq 'WEB') { $port = $ports.Web } else { $port = $ports.Api }
        if ($listening -contains $port) { Write-Host "SERVE $kind port $port already in use - left as is (http://localhost:$port)"; continue }
        $log = Join-Path $gitDir "wt-serve-$($kind.ToLower()).log"
        # Inherited by the child: PORT is the server's own port, WEB_PORT/API_PORT pair it with the other one.
        $env:WEB_PORT = $ports.Web; $env:API_PORT = $ports.Api; $env:PORT = $port
        $proc = Start-Process cmd.exe -ArgumentList '/c', "$command > `"$log`" 2>&1" -WorkingDirectory $dir -WindowStyle Hidden -PassThru
        Add-Content (Join-Path $gitDir 'wt-serve.pids') $proc.Id
        $started += [pscustomobject]@{ Kind = $kind; Port = $port; Log = $log; Proc = $proc }
    }
    $deadline = (Get-Date).AddSeconds(180)
    foreach ($s in $started) {
        while (-not ((Get-ListeningPorts) -contains $s.Port) -and -not $s.Proc.HasExited -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
        if ((Get-ListeningPorts) -contains $s.Port) { Write-Host "SERVE $($s.Kind) up on http://localhost:$($s.Port) (log $($s.Log))" }
        else { Write-Warning "SERVE $($s.Kind) not listening on $($s.Port) - log $($s.Log):`n$((Get-Content $s.Log -Tail 15 -ErrorAction SilentlyContinue) -join "`n")" }
    }
}

function Stop-DevServers([string]$Path) {
    $pidFile = Join-Path (Invoke-Git $Path rev-parse --absolute-git-dir).Trim() 'wt-serve.pids'
    if (-not (Test-Path $pidFile)) { Write-Host "no dev servers started by serve in $Path"; return }
    foreach ($id in Get-Content $pidFile) {
        # Only our cmd wrappers: a PID from before a reboot may now belong to something else.
        if (Get-Process -Id $id -ErrorAction SilentlyContinue | Where-Object ProcessName -eq 'cmd') {
            & taskkill /T /F /PID $id 2>&1 | Out-Null
            Write-Host "stopped dev server tree $id"
        }
    }
    Remove-Item $pidFile
}

function Invoke-Npm([string[]]$NpmArgs) {
    # Pool cache first; a warm cache has failed `npm ci` with EEXIST on _cacache\tmp on this machine,
    # so any failure retries once with an empty temp cache.
    & npm @NpmArgs --cache $NpmCache --prefer-offline --no-audit --fund=false
    if ($LASTEXITCODE -eq 0) { return }
    Write-Warning "npm $($NpmArgs -join ' ') failed (exit $LASTEXITCODE) - retrying with an empty cache"
    $fresh = Join-Path $env:TEMP ('wt-npm-cache-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
    try {
        & npm @NpmArgs --cache $fresh --no-audit --fund=false
        if ($LASTEXITCODE -ne 0) { throw "npm $($NpmArgs -join ' ') failed with an empty cache too (exit $LASTEXITCODE)" }
    }
    finally { Remove-Item $fresh -Recurse -Force -ErrorAction SilentlyContinue }
}

function Sync-Deps([string]$Path, [switch]$CleanInstall) {
    foreach ($dir in Get-PackageDirs $Path) {
        $stamp = Join-Path $dir 'node_modules\.wt-deps-hash'
        $want = Get-DepsHash $dir
        if (-not $CleanInstall -and (Test-Path $stamp) -and ((Get-Content $stamp -Raw).Trim() -eq $want)) {
            Write-Host "deps up to date ($dir)"
            continue
        }
        Push-Location $dir
        try {
            if ($CleanInstall -or -not (Test-Path 'node_modules')) {
                Write-Host "npm ci ($dir)"
                Invoke-Npm @('ci')
            }
            else {
                # Incremental reconcile is much faster than ci; if it would rewrite the lockfile,
                # node_modules no longer matches the branch's lock - undo and fall back to ci.
                Write-Host "npm install, incremental ($dir)"
                Invoke-Npm @('install')
                if (git status --porcelain -- package-lock.json) {
                    Write-Warning 'npm install rewrote package-lock.json - restoring it and running npm ci'
                    git checkout -- package-lock.json
                    Invoke-Npm @('ci')
                }
            }
            Set-Content -Path $stamp -Value $want -Encoding ascii
        }
        finally { Pop-Location }
    }
}

function Copy-LocalConfig([string]$Path) {
    if (-not (Test-Path $LocalFilesList) -or $Path -eq $Repo) { return }
    foreach ($rel in @(Get-Content $LocalFilesList | ForEach-Object { $_.Trim() } | Where-Object { $_ -and -not $_.StartsWith('#') })) {
        $src = Join-Path $Repo $rel
        if (-not (Test-Path $src)) { Write-Warning "no $src to copy"; continue }
        $dst = Join-Path $Path $rel
        if ((Get-Item $src).PSIsContainer) {
            # only files git ignores - tracked ones come with the checkout
            New-Item -ItemType Directory -Force $dst | Out-Null
            Get-ChildItem $src -File -Force | Where-Object { git -C $Repo check-ignore -q -- $_.FullName; $LASTEXITCODE -eq 0 } |
                ForEach-Object { Copy-Item $_.FullName (Join-Path $dst $_.Name) -Force }
        }
        else {
            New-Item -ItemType Directory -Force (Split-Path $dst -Parent) | Out-Null
            Copy-Item $src $dst -Force
        }
    }
}

function Show-Status {
    $rows = foreach ($s in Get-Slots) {
        $lock = Get-LockPath $s.FullName
        $branch = (git -C $s.FullName branch --show-current)
        if (-not $branch) { $branch = '(detached ' + (git -C $s.FullName rev-parse --short HEAD) + ')' }
        $owner = '-'
        if (Test-Path $lock) { $owner = ((Get-Content $lock) -join ' @ ') }
        [pscustomobject]@{
            Slot   = $s.Name
            Branch = $branch
            Taken  = $owner
            Dirty  = @(git -C $s.FullName status --porcelain).Count
        }
    }
    if (-not $rows) { Write-Host "no slots under $Root ($Prefix<n>) - run: wt.ps1 init"; return }
    $rows | Format-Table -AutoSize | Out-String | Write-Host
}

# All worktrees of the repo, from `git worktree list --porcelain` (the slot pool is a subset).
function Get-Worktrees {
    $list = @(); $cur = $null
    foreach ($line in @(git -C $Repo worktree list --porcelain) + '') {
        if ($line -like 'worktree *') { $cur = [ordered]@{ Path = ($line.Substring(9) -replace '/', '\'); Branch = $null; Prunable = $false } }
        elseif ($line -like 'branch refs/heads/*') { $cur.Branch = $line.Substring(18) }
        elseif ($line -like 'prunable*') { $cur.Prunable = $true }
        elseif ($line -eq '' -and $cur) { $list += [pscustomobject]$cur; $cur = $null }
    }
    $list
}

# One gh call for every PR state; branches with several PRs keep the newest. Fails open to '?'.
function Get-PrStates {
    $map = @{}
    $json = & gh pr list --repo (git -C $Repo remote get-url origin) --state all --author '@me' --limit 200 --json headRefName,state,number 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $json) { return $null }
    foreach ($pr in ($json | ConvertFrom-Json | Sort-Object number)) { $map[$pr.headRefName] = "#$($pr.number) $($pr.state)" }
    $map
}

# "web 2224 up, api 2223 down": the worktree's dev-server ports and whether something listens on them.
function Get-PortsCell([string]$Path, [int[]]$Listening) {
    try { $ports = Get-SlotPorts $Path } catch { return '-' }
    $state = { param([int]$port) if ($Listening -contains $port) { 'up' } else { 'down' } }
    "web $($ports.Web) $(& $state $ports.Web), api $($ports.Api) $(& $state $ports.Api)"
}

function Get-WorktreeRow($wt, $prs, [int[]]$Listening) {
    $name = Split-Path $wt.Path -Leaf
    if ($wt.Prunable -or -not (Test-Path $wt.Path)) {
        return [pscustomobject]@{ Name = $name; Branch = $wt.Branch; Dirty = '-'; Remote = '-'; BaseBehind = '-'; LastCommit = '-'; PR = '-'; Lock = '-'; Ports = '-'; Free = 'MISSING (prunable)' }
    }
    $p = $wt.Path
    $branch = $wt.Branch
    if (-not $branch) { $branch = '(detached ' + (git -C $p rev-parse --short HEAD) + ')' }
    $dirty = @(git -C $p status --porcelain).Count
    $remote = '-'
    if ($wt.Branch) {
        if (git -C $p rev-parse --verify --quiet "refs/remotes/origin/$($wt.Branch)") {
            $c = (git -C $p rev-list --left-right --count "origin/$($wt.Branch)...HEAD") -split '\s+'
            $remote = "+$($c[1]) -$($c[0])"
            if ($c[0] -eq '0' -and $c[1] -eq '0') { $remote = 'in sync' }
        }
        else { $remote = 'NOT PUSHED' }
    }
    $behindBase = (git -C $p rev-list --count "HEAD..$Base")
    $lock = '-'
    $lockPath = Join-Path (git -C $p rev-parse --absolute-git-dir).Trim() 'wt-slot.lock'
    if (Test-Path $lockPath) { $lock = ((Get-Content $lockPath) -join ' @ ') }
    $pr = '-'
    if ($null -eq $prs) { $pr = '?' } elseif ($wt.Branch -and $prs.ContainsKey($wt.Branch)) { $pr = $prs[$wt.Branch] }
    # Free = nothing would be lost or interrupted by giving it to a new task.
    $reasons = @()
    if ($dirty -gt 0) { $reasons += 'dirty' }
    if ($lock -ne '-') { $reasons += 'locked' }
    if ($wt.Path -eq $Repo) { $reasons += 'primary' }
    # A merged PR's remote branch is usually deleted - that is done work, not unpushed work.
    if ($remote -eq 'NOT PUSHED' -and $pr -match 'MERGED') { $remote = 'gone (merged)' }
    if ($wt.Branch -and $wt.Branch -ne $BaseBranch -and $remote -eq 'NOT PUSHED') { $reasons += 'unpushed branch' }
    elseif ($wt.Branch -and $remote -match '^\+[1-9]') { $reasons += 'unpushed commits' }
    elseif ($wt.Branch -and $wt.Branch -ne $BaseBranch -and $pr -notmatch 'MERGED|CLOSED') { $reasons += 'branch in progress' }
    $free = 'YES'
    if ($reasons.Count -gt 0) { $free = 'no: ' + ($reasons -join ', ') }
    [pscustomobject]@{
        Name       = $name
        Branch     = $branch
        Dirty      = $dirty
        Remote     = $remote
        BaseBehind = $behindBase
        LastCommit = (git -C $p log -1 --format=%cr)
        PR         = $pr
        Lock       = $lock
        Ports      = (Get-PortsCell $p $Listening)
        Free       = $free
    }
}

function Show-All {
    if (-not $NoFetch) { Update-Remote }
    $prs = Get-PrStates
    $listening = Get-ListeningPorts
    $rows = foreach ($wt in Get-Worktrees) { Get-WorktreeRow $wt $prs $listening }
    Write-Host "repo $Repo, base $Base"
    $rows | Format-Table -AutoSize | Out-String -Width 400 | Write-Host
    if ($null -eq $prs) { Write-Host 'PR column: gh unavailable or failed (?)' }
}

function Reset-Worktree($wt) {
    $p = $wt.Path
    $name = Split-Path $p -Leaf
    if ($wt.Prunable -or -not (Test-Path $p)) { return "SKIP $name - directory missing (run: git worktree prune)" }
    $dirty = @(git -C $p status --porcelain)
    if ($dirty.Count -gt 0) { return "SKIP $name - DIRTY ($($dirty.Count) files): " + (($dirty | Select-Object -First 5) -join '; ') }
    $lockPath = Join-Path (git -C $p rev-parse --absolute-git-dir).Trim() 'wt-slot.lock'
    if ((Test-Path $lockPath) -and -not $Force) { return "SKIP $name - locked by: $((Get-Content $lockPath) -join ' @ ') (-Force to override)" }
    $note = ''
    try {
        if ($wt.Branch -eq $BaseBranch) {
            Invoke-Git $p pull --ff-only origin $BaseBranch | Out-Null
        }
        else {
            if ($wt.Branch) {
                $hasRemote = git -C $p rev-parse --verify --quiet "refs/remotes/origin/$($wt.Branch)"
                if (-not $hasRemote) { $note = " (left branch $($wt.Branch) has no origin copy - never pushed, or deleted after merge; still exists locally)" }
                elseif ([int](git -C $p rev-list --count "origin/$($wt.Branch)..HEAD") -gt 0) { $note = " (left branch $($wt.Branch) has unpushed commits - still exists locally)" }
            }
            # The base branch is checked out elsewhere (git can't check it out twice), so sit detached at it.
            Invoke-Git $p switch --detach $Base | Out-Null
        }
        Remove-Item $lockPath -ErrorAction SilentlyContinue
        Copy-LocalConfig $p
        if (-not $NoDeps) {
            if (Test-Path (Join-Path $p 'node_modules')) { Sync-Deps $p } else { $note += ' (no node_modules - not installed)' }
        }
    }
    catch { return "FAIL $name - $_" }
    "OK   $name -> $(git -C $p log -1 --format='%h %s' | Select-Object -First 1)$note"
}

switch ($Cmd) {
    'status' { Show-Status }

    'init' {
        Update-Remote
        # Slots are numbered after the primary checkout (= 1): <repo>-2 .. <repo>-<Count+1>.
        foreach ($i in 2..($Count + 1)) {
            $path = Join-Path $Root "$Prefix$i"
            if (-not (Test-Path $path)) {
                Write-Host "creating $path at $Base"
                Invoke-Git $Repo worktree add --detach $path $Base | Out-Null
            }
            Copy-LocalConfig $path
            Sync-Deps $path -CleanInstall:$Clean
        }
        Show-Status
    }

    'take' {
        Update-Remote

        # Prefer a free slot already on this branch, then a detached one (nobody's branch), then any free clean slot.
        $slots = Get-Slots | Sort-Object {
            $b = git -C $_.FullName branch --show-current
            if ($Arg -and $b -eq $Arg) { 0 } elseif (-not $b) { 1 } else { 2 }
        }
        $slot = $null
        $holder = $Arg
        if (-not $holder) { $holder = "(detached $Base)" }
        foreach ($s in $slots) {
            $lock = Get-LockPath $s.FullName
            try { $fs = [IO.File]::Open($lock, 'CreateNew', 'Write') } catch { continue }
            if (@(git -C $s.FullName status --porcelain).Count -gt 0) {
                $fs.Close(); Remove-Item $lock
                Write-Warning "$($s.Name) is free but has uncommitted changes - skipped"
                continue
            }
            $w = New-Object IO.StreamWriter($fs)
            $w.WriteLine($holder); $w.WriteLine((Get-Date -Format s)); $w.Close()
            $slot = $s.FullName
            break
        }
        if (-not $slot) { throw "no free clean slot - release one, or grow the pool: wt.ps1 init -Count $((Get-Slots).Count + 1)" }

        try {
            $current = git -C $slot branch --show-current
            if (-not $Arg) { Invoke-Git $slot switch --detach $Base | Out-Null }
            elseif ($current -ne $Arg) {
                $exists = (git -C $slot branch --list $Arg) -or (git -C $slot branch -r --list "origin/$Arg")
                if ($exists) { Invoke-Git $slot switch $Arg | Out-Null }
                else { Invoke-Git $slot switch --no-track -c $Arg $Base | Out-Null }
            }
            Sync-Deps $slot -CleanInstall:$Clean
        }
        catch {
            Remove-Item (Get-LockPath $slot) -ErrorAction SilentlyContinue
            throw
        }
        $ports = Get-SlotPorts $slot
        Write-Host "READY $slot ($holder) WEB_PORT=$($ports.Web) API_PORT=$($ports.Api)"
        if (-not $NoServe) { Start-DevServers $slot }
    }

    'serve' { Start-DevServers (Resolve-Worktree $Arg) }

    'stop' { Stop-DevServers (Resolve-Worktree $Arg) }

    'all' { Show-All }

    'ports' {
        $ports = Get-SlotPorts $Arg
        Write-Host "WEB_PORT=$($ports.Web) API_PORT=$($ports.Api)"
    }

    'reset' {
        if (-not $Arg) { throw 'usage: wt.ps1 reset <all|name|path> [-Force] [-NoDeps]' }
        Update-Remote
        $wts = Get-Worktrees
        if ($Arg -eq 'all') {
            $targets = @($wts | Where-Object { $_.Path -ne $Repo -or $_.Branch -eq $BaseBranch })
            $primary = @($wts | Where-Object { $_.Path -eq $Repo -and $_.Branch -ne $BaseBranch })
            foreach ($wt in $primary) { Write-Host "SKIP $(Split-Path $Repo -Leaf) - primary checkout on '$($wt.Branch)', not $BaseBranch (name it to reset it)" }
        }
        else {
            $want = $Arg.TrimEnd('\') -replace '/', '\'
            $targets = @($wts | Where-Object { $_.Path -eq $want -or (Split-Path $_.Path -Leaf) -eq $want -or (Split-Path $_.Path -Leaf) -eq "$Prefix$want" })
            if (-not $targets) { throw "no worktree matches '$Arg' - names: $((($wts | ForEach-Object { Split-Path $_.Path -Leaf }) -join ', '))" }
        }
        foreach ($wt in $targets) { Write-Host (Reset-Worktree $wt) }
    }

    'release' {
        $slot = Resolve-Slot $Arg
        $dirtyCount = @(git -C $slot status --porcelain).Count
        if (-not $Force -and $dirtyCount -gt 0) {
            throw "$slot has uncommitted changes - commit/push first, or -Force to release anyway"
        }
        Stop-DevServers $slot
        if ($dirtyCount -eq 0) { Invoke-Git $slot switch --detach | Out-Null }
        Remove-Item (Get-LockPath $slot) -ErrorAction SilentlyContinue
        Write-Host "released $slot"
    }

    'config' {
        foreach ($s in Get-Slots) { Copy-LocalConfig $s.FullName; Write-Host "config copied to $($s.Name)" }
    }

    'sync' {
        $slot = Resolve-Slot $Arg
        Sync-Deps $slot -CleanInstall:$Clean
    }
}

# Security Audit — Windows AppContainer OS-Level Sandboxing

**Date:** 2026-09-13
**Scope:** Windows sandbox in `aartiq-browser/src/core/` (win-job-runner.ps1, sandbox-executor.js) and its JS callers/tests.
**Version:** unreleased 0.4.0
**Audit type:** design + source review (not a pentest)

> This report replaces the previous `2026-07-22_Production_Readiness_Audit`. The
> central change it documents is the Windows sandbox moving from **Job Object
> containment only** to **OS-enforced AppContainer isolation** — the same class
> of guarantee Seatbelt (macOS) and bubblewrap (Linux) already provide.

---

## 1. Executive summary

Command execution on Windows is now sandboxed at the OS layer:

| Control | Before (0.3.6) | After (0.4.0) |
|---|---|---|
| Process containment | Job Object | Job Object (kept, verified) |
| Privileges | primary token | restricted token, dangerous privileges DELETED |
| Integrity level | none | Low |
| Filesystem access | application-layer allowlist only | **OS-enforced** via AppContainer package-SID ACL grants |
| Network | none enforced on Windows | **OS-denied** (zero AppContainer capabilities) |
| Temp/state isolation | system-wide | per-run AppContainer profile folder |
| Reported isolation | `{false, false, true}` | `{true, true, true}` |

**Verdict:** the design meets the fail-closed contract and is aligned with
Microsoft's own AppContainer launch guidance. **Runtime verification is
happening on a real Windows host via the CI matrix** (windows-latest, plus
macos-latest for the hardened Seatbelt profile, see §7 and §8) and must be
green before 0.4.0 ships.

---

## 2. Threat model

The sandbox defends against a **compromised or malicious target command**
already cleared to run (medium/critical risk, user-approved). Adversarial goals:

1. **Read** files outside the allowlist (secrets, credentials, vault).
2. **Write/overwrite** files outside the writable allowlist (tampering, keychain
   poisoning).
3. **Exfiltrate** data over the network.
4. **Escalate / persist** — gain privileges, survive the helper, write
   auto-run entries, spawn uncontained processes.

Explicitly **out of scope**: the assistant's own permission gates (approval
flows, human-in-the-loop), prompt-injection defenses, and the security of the
Electron main process hosting the runner. Those live in other layers of the
defense-in-depth model.

Inside scope: the AppContainer ACL boundary, the restricted token, the
integrity label, the Job Object, the capability count (network), and the
fail-closed construction sequence.

---

## 3. Design

### 3.1 Construction sequence (win-job-runner.ps1 + C# helper)

1. **CreateAppContainerProfile** (per-run random name, e.g.
   `Aartiq.AppContainer.<guid>`). Returns the **package SID**. If the profile
   already exists, derive the SID with
   **DeriveAppContainerSidFromAppContainerName**. The profile is deleted after
   the run.
2. Package SID → string (`ConvertSidToStringSid`, freed with `LocalFree`).
3. **ACL grants** (kernel-enforced allowlist) via `icacls` using the SID string:
   - **writable allowlist + workspace**: `(OI)(CI)M` — **required**, fail closed.
   - **read-only allowlist**: `(OI)(CI)RX` — best-effort; a failure keeps the
     path DENIED (fail-closed direction).
   - **executable + non-standard exe dir**: `(RX)` / `(OI)(CI)RX` — required.
   - System-standard roots (System32, Program Files) are not re-granted; they
     already carry the ALL APPLICATION PACKAGES ACE.
4. **Temp isolation**: `TEMP`/`TMP`/`LOCALAPPDATA` → AppContainer profile
   folder (`GetAppContainerFolderPath`, freed with `FreeCoTaskMem`).
5. **Restricted token** (C#): `CreateRestrictedToken` from the helper's own
   primary token (a *restricted version of the caller's own primary token*, so
   the SE_ASSIGNPRIMARYTOKEN / SE_INCREASE_QUOTA privilege requirement is
   waived), with the dangerous-privilege LUIDs DELETED and **no
   DISABLE_MAX_PRIVILEGE** (keeps `SeChangeNotifyPrivilege` so allowlist
   traversal resolves). Low integrity label via `SetTokenInformation`
   (TokenIntegrityLevel) with the S-1-16-4096 SID and `SE_GROUP_INTEGRITY`.
6. **Suspended, verified start**: `CreateProcessAsUserW` with
   `CREATE_SUSPENDED | CREATE_NO_WINDOW | CREATE_UNICODE_ENVIRONMENT |
   CREATE_BREAKAWAY_FROM_JOB`, `bInheritHandles=true`
   (std handles propagate). When AppContainer:
   - `STARTUPINFOEX` + **PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES**
     attribute list carrying the package SID and **zero** capabilities
     (Microsoft `LaunchAppContainer` pattern) — this is what makes the new
     process an AppContainer.
   - Handles: attribute list `HeapAlloc`/`HeapFree`; `SECURITY_CAPABILITIES`
     block `AllocHGlobal`/`FreeHGlobal`.
7. **Job assignment before resume**: `AssignProcessToJobObject` then
   **`IsProcessInJob` verification** (belt-and-braces — same handle as
   `CreateProcess`), then `ResumeThread`. KILL_ON_JOB_CLOSE + active-process +
   job-memory limits applied/verified *before* the target exists.
8. **Cleanup (always)**: revoke ACL grants (`icacls /remove:g`), delete the
   AppContainer profile, remove the profile folder, `FreeSid` the package SID —
   in a PS `finally` so it runs even on timeout/signal.

### 3.2 Why the OS enforces the allowlist

An AppContainer is a security principal (`S-1-15-2-…`) whose token is built by
the OS from the profile. Its file access is governed by the same SeAccessCheck
every process uses — it can only open an object when the **DACL explicitly
includes its package SID**. Granting the SID exactly the allowlisted paths means
every other object in the system is denied at the kernel, not by our JS. The
JS-layer `isPathAllowed` check remains as a cheap pre-filter and policy
validator, not as the security boundary.

---

## 4. Findings

### 4.1 Fixed (from 0.3.x review / rewrite)

| # | Finding | Resolution |
|---|---|---|
| F1 | Windows reported only process containment | Full AppContainer isolation implemented; `WIN_ISOLATION = {true,true,true}` |
| F2 | Directory allowlist enforced only in JS | OS-enforced via package-SID ACL grants; policy still validated up front (missing path ⇒ `SANDBOX_POLICY_INVALID`) |
| F3 | No per-process network policy on Windows | Zero-capability AppContainer denies all network; empty `networkAllowlist` is now an enforced deny-all (was throwing) |
| F4 | `CreateAppContainerToken` complexity | Dropped — attribute list builds the AC token; matches MS LaunchAppContainer sample |
| F5 | Privilege waiver misunderstanding | `CreateRestrictedToken` of own primary token waives SE_ASSIGNPRIMARYTOKEN/SE_INCREASE_QUOTA |
| F6 | `TOKEN_MANDATORY_LABEL` layout | Fixed to `{ SID_AND_ATTRIBUTES Label; }` with `SE_GROUP_INTEGRITY` |
| F7 | HRESULT/SID-memory leaks in PS | `0x800700B7` vs `ERROR_ALREADY_EXISTS` comparison fixed; `LocalFree`/`FreeCoTaskMem` used for LocalAlloc/CoTaskMem output; package SID freed only after `Run` |
| F8 | PS `return` inside `try` skipped rollback | Setup refactored into `Invoke-SandboxSetup` (returns error string) + `Invoke-SandboxCleanup`; every failure path rolls back |

### 4.2 Residual / by design

| # | Finding | Risk | Disposition |
|---|---|---|---|
| R1 | Runtime not yet executed on Windows | Med | PS1 is code-reviewed only; WIP — requires Windows CI matrix (see §7) |
| R2 | Read-only allowlist grant failures only warn | Low | Keeps the path DENIED (fail-closed direction); target surfaces its own access error |
| R3 | `bInheritHandles=true` inherits std handles | Low | Only std handles are set in STARTUPINFO; no arbitrary inheritable handles leaked via STARTUPINFO |
| R4 | SeChangeNotifyPrivilege retained | Low | Required for path traversal over allowlist; privilege does not grant sensitive operations |
| R5 | AppContainer does not confine a *helper* if the helper is tricked into re-launching | Low | Payload/runner files staged mode 0600 under the user profile; the runner never re-launches uncontained processes |
| R6 | CREATE_BREAKAWAY_FROM_JOB | Low | Required so our KILL_ON_JOB_CLOSE job owns the process; without it a parent job could reject assignment (fail-closed) |
| R7 | Zero capabilities ⇒ no network, but loopback access remains | Low | Matches AppContainer semantics; loopback is not an exfiltration channel to remote hosts |

---

## 5. Invariant checklist (what tests assert)

- Target created `CREATE_SUSPENDED`, resumed only after verified job assignment.
- `IsProcessInJob` verification before resume.
- `KILL_ON_JOB_CLOSE` / `ACTIVE_PROCESS` limits present.
- AppContainer primitives present and `CreateAppContainerToken` absent.
- `SECURITY_CAPABILITIES` passed via `PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES`
  + `EXTENDED_STARTUPINFO_PRESENT`.
- Restricted token + Low IL + kept traversal privilege.
- OS allowlist via `icacls` grants; empty `networkAllowlist` = deny-all accepted;
  non-empty = `SANDBOX_UNAVAILABLE`.
- Missing allowlist path = `SANDBOX_POLICY_INVALID`.
- Result layer: `sandboxed:false` never claims isolation; parser fails closed
  without the result marker; success carries `appContainer`, `restrictedToken`,
  `integrityLevel`, and full `isolation`.

---

## 6. Test coverage

- Cross-platform contract tests (`tests/windows-job-sandbox.test.js`,
  `tests/sandbox-security.test.js`) — run on any OS, assert the PS1 text and JS
  invariants above.
- Win32-only runtime tests: suspended AppContainer start, job assignment,
  grandchild containment, secret-env isolation, **non-allowlisted file remains
  unreadable** (new OS-allowlist proof), KILL_ON_JOB_CLOSE.

---

## 7. Outstanding work (pre-release gate)

1. **Execute `win-job-runner.ps1` on a real Windows host.** This is now wired
   into CI: `.github/workflows/jest.yml` runs the sandbox suites on
   `windows-latest` (AppContainer runtime), `macos-latest` (Seatbelt runtime),
   and `ubuntu-latest` (bubblewrap) on every push/PR. Gate: the `windows-sandbox`
   job must pass before 0.4.0 ships. Verify: AppContainer profile create/delete,
   ACL grant/revoke on a scratch tree, CreateProcessAsUser under AppContainer
   attribute list, Low-IL restricted token, `appContainer`/`jobAssigned`
   verification flags, TEMP-isolation, and the process-death behaviors.
2. Confirm no AV/AppLocker policy blocks `CreateAppContainerProfile` in managed
   environments (a Windows CI run is the first signal; real-device matrix later).
3. End-to-end network assertion (`Test-NetConnection` from inside the sandbox
   must fail) — part of the Windows runtime matrix in CI.

Until it runs green on the Windows CI matrix, the Windows sandbox is **code-complete
but runtime-unverified** — release notes must keep that caveat even while the
design review is done.

---

## 8. Concurrent hardening — macOS Seatbelt & Linux bubblewrap (v0.4.0)

Scope of this update: review the macOS and Linux sandbox implementations against
their platform primitives, harden the generated policies, and prove the new
behavior at runtime on macOS.

### 8.1 macOS (src/core/sandbox-executor.js — `generateSeatbeltProfile`)

Seatbelt profiles start from `(allow default)`, so "closed by default" is not
literally true for every operation class. This audit hardened the classes that
matter:

| Change | Syntax | Effect |
|---|---|---|
| Deny AF_UNIX sockets | `(deny system-socket)` | `network*` only covers IP sockets; AF_UNIX (syslog, Docker, P2P services, local daemons) is now closed |
| Signal confinement | `(deny signal)` + `(allow signal (target self))` + `(allow signal (target children))` | A sandboxed process can signal its own tree but not unrelated host processes |
| Executable-mapping strictness | `(deny file-map-executable)` + `(allow file-map-executable …)` mirrored from the process-exec allowlist | No executable mappings outside the exec allowlist (W^X-relevant) |
| mount/umount | `(deny file-write-mount file-write-umount)` | The file allowlist cannot be widened at runtime |

The pre-existing hardens (deny file-read*/file-write*, allow only system paths +
allowlist + workspace, deny network*, deny process-exec*, symlink-following
denied) remain. `validateSeatbeltProfile` pre-flight still runs the profile
against `/usr/bin/true` and fails closed if it does not compile.

**Runtime proof (this macOS host):** IP bind DENIED, AF_UNIX bind DENIED,
self-signal ALLOWED, signal-to-parent DENIED, write outside allowlist DENIED,
write to workspace + /tmp ALLOWED, `/etc` readable, python3 interpreter runs
normally. These exact scenarios are now automated in
`tests/sandbox-security.test.js` (adversarial suite, darwin-only) and run in CI
on `macos-latest`.

**Residual / by design (documented, not silently claimed):**
- macOS Sandbox (2011) is deprecated by Apple until it hard-won't-be-removed;
  it is not the modern App Sandbox API. It works and is enforced, but has no
  vendor roadmap. ✓ honest limitation, not a fix.
- Mach IPC is *not* denied-by-default under Seatbelt without breaking node/
  python/shell. We do not claim IPC isolation on macOS.
- **Apple Events cannot be filtered by sandbox-exec** on current macOS
  (`apple-event-send`/`apple-event-receive` operations are not exposed). A
  sandboxed command could still drive another app via AppleScript/AppleEvents.
  Documented in README + security docs as a limitation; no fix available at
  this layer.

### 8.2 Linux (src/core/sandbox-executor.js — `buildBubblewrapArgs`)

| Change | Flag | Why |
|---|---|---|
| User namespace | `--unshare-user` | Map root inside the sandbox; isolate uid/gid mappings (defense-in-depth vs host userns attacks) |
| Cgroup namespace | `--unshare-cgroup` | New cgroup root; namespace is not tied to the host cgroup hierarchy |
| New session | `--new-session` | Process is a session leader in a new session; no controlling terminal left attached |
| (kept) | `--unshare-pid --unshare-net --unshare-ipc --unshare-uts` | Existing baseline |

The capability pre-flight probe now runs the same expanded flag set, so on
environments where any required namespace cannot be created the sandbox **fails
closed** (SANDBOX_UNAVAILABLE) instead of degrading. Not locally executable here
(no bwrap on macOS host); the arg-generation, probe, and fail-closed paths are
unit-tested cross-platform, and runtime enforcement is exercised in CI on
`ubuntu-latest` where user namespaces are available.

### 8.3 CI matrix (`.github/workflows/jest.yml`)

| Job | Runner | Exercises |
|---|---|---|
| `jest` | ubuntu-latest | full cross-platform contract suite |
| `windows-sandbox` | windows-latest | real AppContainer runtime matrix (§6) |
| `macos-sandbox` | macos-latest | Seatbelt runtime enforcement incl. §8.1 |
| `linux-sandbox` | ubuntu-latest | bwrap runtime; skips if runner blocks userns (fail-closed contract tests still run) |

Existing `security-fixes.test.js`, `linux-bwrap-sandbox.test.js`, and
`sandbox-security.test.js` assertions were reconciled with the new namespaces
and profile lines.
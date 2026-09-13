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
Microsoft's own AppContainer launch guidance. **Runtime verification on a real
Windows host remains outstanding** (see §7) and must be completed on a Windows
CI matrix before 0.4.0 ships.

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

1. **Execute `win-job-runner.ps1` on a real Windows host** (Win10 22H2, Win11,
    Server 2022 CI matrix). Verify: AppContainer profile create/delete, ACL
   grant/revoke on a scratch tree, CreateProcessAsUser under AppContainer
   attribute list, Low-IL restricted token, `appContainer`/`jobAssigned`
   verification flags, TEMP-isolation, and the process-death behaviors.
2. Confirm no AV/AppLocker policy blocks `CreateAppContainerProfile` in managed
   environments.
3. End-to-end network assertion (`Test-NetConnection` from inside the sandbox
   must fail).

Until (1)–(3) are green, the Windows sandbox is **code-complete but
runtime-unverified** — do not claim AppContainer enforcement in release notes.
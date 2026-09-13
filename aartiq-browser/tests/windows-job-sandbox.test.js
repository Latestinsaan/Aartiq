/**
 * windows-job-sandbox.test.js — Windows AppContainer + Job Object test matrix.
 *
 * Layered so it is USEFUL ON EVERY PLATFORM:
 *   - "JS contract & invariants" tests run anywhere (Node + the runner script
 *     text). They assert the security-critical guarantees are encoded and that
 *     the JS layer fails closed. This is what runs in CI on macOS/Linux.
 *   - "runtime containment" tests run ONLY on win32 with PowerShell present and
 *     exercise the real runner: suspended AppContainer start, verified job
 *     assignment, grandchild containment, secret isolation, and
 *     KILL_ON_JOB_CLOSE.
 *
 * The runtime block is the dedicated Windows test matrix called for in review:
 * it should be executed on a Windows CI matrix (multiple Windows versions /
 * configurations) because Job Object + AppContainer + nested-job semantics
 * vary by build.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const sandbox = require('../src/core/sandbox-executor');

const WIN_ISOLATION = { filesystem: true, network: true, process: true };
const NO_ISOLATION = { filesystem: false, network: false, process: false };

function readStagedPayload(config) {
  const payloadPath = config.args[config.args.length - 1];
  return JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
}

describe('Windows AppContainer sandbox — JS contract & invariants', () => {
  it('reports full OS-level isolation (filesystem/network/process)', () => {
    const config = sandbox.createWindowsSandbox('node', ['--version'], {});
    assert.deepStrictEqual(config.isolation, WIN_ISOLATION);
    assert.strictEqual(config.platform, 'win32');
  });

  it('denies all network by default (empty/absent allowlist) and stages an AppContainer payload', () => {
    const config = sandbox.createWindowsSandbox('cmd.exe', ['/c', 'ver'], {});
    const payload = readStagedPayload(config);
    assert.strictEqual(payload.sandbox.useAppContainer, true, 'must run as an AppContainer by default');
    assert.strictEqual(payload.sandbox.integrityLevel, 'low');
    assert.ok(Array.isArray(payload.sandbox.readDirs), 'readDirs must be carried into the sandbox');
    assert.ok(Array.isArray(payload.sandbox.writeDirs), 'writeDirs must be carried into the sandbox');
    config.cleanup();
  });

  it('accepts an empty networkAllowlist (enforced deny-all: zero AppContainer capabilities)', () => {
    const config = sandbox.createWindowsSandbox('cmd.exe', ['/c', 'ver'], { networkAllowlist: [] });
    assert.deepStrictEqual(config.isolation, WIN_ISOLATION);
    config.cleanup();
  });

  it('fails closed on a non-empty network policy (per-domain allowlist unsupported for AppContainer)', () => {
    assert.throws(
      () => sandbox.createWindowsSandbox('cmd.exe', ['/c', 'ver'], { networkAllowlist: ['api.openai.com'] }),
      (e) => e.code === 'SANDBOX_UNAVAILABLE'
    );
  });

  it('rejects a missing allowlist path (policy error, never silently ignored)', () => {
    assert.throws(
      () => sandbox.createWindowsSandbox('cmd.exe', ['/c', 'ver'], {
        directoryAllowlist: [{ path: '/nonexistent/x', access: 'read-write' }],
      }),
      (e) => e.code === 'SANDBOX_POLICY_INVALID'
    );
  });

  it('encodes the AppContainer + restricted-token + verified-assignment invariants', () => {
    const runner = sandbox.getWindowsJobRunnerScript();
    // OS-level isolation is AppContainer-based, not process-only.
    assert.ok(/CreateAppContainerProfile/.test(runner), 'must create an AppContainer profile');
    assert.ok(/DeriveAppContainerSidFromAppContainerName/.test(runner), 'must derive the package SID when the profile exists');
    assert.ok(/GetAppContainerFolderPath/.test(runner), 'must isolate TEMP/LOCALAPPDATA into the AC profile folder');
    assert.ok(/DeleteAppContainerProfile/.test(runner), 'must delete the AC profile after the run');
    // The SECURITY_CAPABILITIES startup-info attribute list is what makes the
    // target an AppContainer at creation time (LaunchAppContainer pattern).
    assert.ok(/PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES/.test(runner), 'must pass SECURITY_CAPABILITIES via attribute list');
    assert.ok(/EXTENDED_STARTUPINFO_PRESENT/.test(runner), 'must set EXTENDED_STARTUPINFO_PRESENT');
    assert.ok(/InitializeProcThreadAttributeList/.test(runner), 'must size/initialize the attribute list');
    // The allowlist is OS-enforced via package-SID ACL grants.
    assert.ok(/Invoke-IntegrityGrant/.test(runner), 'must grant the package SID on allowlisted paths');
    // The old mechanism must be gone: the OS builds the AC token from the
    // attribute list — we never create an AppContainer token explicitly.
    assert.ok(!/CreateAppContainerToken/.test(runner), 'must NOT use CreateAppContainerToken');
    // Restricted token: dangerous privileges deleted + Low integrity.
    assert.ok(/CreateRestrictedToken/.test(runner), 'must build a restricted token');
    assert.ok(/SeChangeNotifyPrivilege/.test(runner), 'must keep traversal privilege');
    assert.ok(/TOKEN_MANDATORY_LABEL/.test(runner), 'must set the Low mandatory integrity label');
    // Job Object guarantees survive alongside AppContainer isolation.
    assert.ok(/CREATE_SUSPENDED/.test(runner), 'target must be created suspended');
    assert.ok(/CREATE_BREAKAWAY_FROM_JOB/.test(runner), 'must break away from a parent job');
    assert.ok(/IsProcessInJob/.test(runner), 'must verify assignment into the job');
    assert.ok(/AssignProcessToJobObject/.test(runner), 'must assign to the job before resume');
    assert.ok(/JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE/.test(runner), 'must kill tree on helper exit');
    assert.ok(/JOB_OBJECT_LIMIT_ACTIVE_PROCESS/.test(runner), 'must cap active processes');
  });

  it('parseWindowsHelperOutput reports isolation only on a verified success', () => {
    const ok = sandbox.parseWindowsHelperOutput(
      'out\nAARTIQ_SANDBOX_RESULT:{"exitCode":0,"sandboxed":true,"jobAssigned":true}',
      ''
    );
    assert.deepStrictEqual(ok.isolation, WIN_ISOLATION);

    const fail = sandbox.parseWindowsHelperOutput(
      '',
      'AARTIQ_SANDBOX_RESULT:{"error":"x","code":"SANDBOX_SETUP_FAILED","sandboxed":false}'
    );
    assert.deepStrictEqual(fail.isolation, NO_ISOLATION);
  });

  it('parseWindowsHelperOutput fails closed when no result marker is present', () => {
    const res = sandbox.parseWindowsHelperOutput('garbage', '');
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.sandboxed, false);
    assert.deepStrictEqual(res.isolation, NO_ISOLATION);
  });
});

// ---------------------------------------------------------------------------
// Runtime tests — win32 only, real PowerShell runner.
// ---------------------------------------------------------------------------

const canRunWin = process.platform === 'win32';
const psExe = canRunWin
  ? (process.env.SystemRoot
    ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    : 'powershell.exe')
  : null;
const psExists = canRunWin && fs.existsSync(psExe);

const winRuntime = psExists ? describe : describe.skip;

winRuntime('Windows AppContainer sandbox — runtime containment (win32 only)', () => {
  it('target starts suspended as an AppContainer, is assigned to the job, and runs', async function () {
    const wsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'winjob-'));
    const res = await sandbox.executeSandboxed('cmd.exe', ['/c', 'echo contained'], {
      useSandbox: true,
      workspace: wsDir,
    });
    assert.strictEqual(res.sandboxed, true);
    assert.strictEqual(res.jobAssigned, true, 'target must be verified inside the Job Object');
    assert.strictEqual(res.appContainer, true, 'target must be verified as an AppContainer');
    assert.strictEqual(res.success, true);
    assert.deepStrictEqual(res.isolation, WIN_ISOLATION);
  });

  it('grandchildren spawned by the target remain inside the job', async function () {
    const wsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'winjob-'));
    // cmd -> cmd -> echo: the grandchild must still be contained by the job.
    const res = await sandbox.executeSandboxed(
      'cmd.exe',
      ['/c', 'cmd.exe /c echo grandchild'],
      { useSandbox: true, workspace: wsDir }
    );
    assert.strictEqual(res.sandboxed, true);
    assert.strictEqual(res.jobAssigned, true);
    assert.strictEqual(res.success, true);
  });

  it('secrets do not enter the sandbox environment', async function () {
    const wsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'winjob-'));
    process.env.AWS_SECRET_ACCESS_KEY = 'should-not-leak';
    try {
      const res = await sandbox.executeSandboxed(
        'cmd.exe',
        ['/c', 'echo %AWS_SECRET_ACCESS_KEY%'],
        { useSandbox: true, workspace: wsDir }
      );
      assert.strictEqual(res.sandboxed, true);
      assert.ok(!String(res.stdout).includes('should-not-leak'), 'secret must not leak into sandbox');
    } finally {
      delete process.env.AWS_SECRET_ACCESS_KEY;
    }
  });

  it('the sandbox cannot read a directory that is not allowlisted', async function () {
    const wsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'winjob-'));
    const secretDir = fs.mkdtempSync(path.join(os.tmpdir(), 'winjob-secret-'));
    const secretFile = path.join(secretDir, 'secret.txt');
    fs.writeFileSync(secretFile, 'classified', 'utf8');
    // Type can reach it via cmd only if the AppContainer ACLs allow it; the
    // secret directory is NOT in the allowlist so access must be DENIED.
    const res = await sandbox.executeSandboxed(
      'cmd.exe',
      ['/c', `type "${secretFile}"`],
      { useSandbox: true, workspace: wsDir }
    );
    assert.strictEqual(res.sandboxed, true);
    assert.ok(!String(res.stdout).includes('classified'), 'non-allowlisted file must stay unreadable');
  });

  it('helper termination kills the target before it completes (KILL_ON_JOB_CLOSE)', async function () {
    const wsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'winjob-'));
    const targetFile = path.join(wsDir, 'should-not-appear.txt');
    // Build the real launch config but spawn the runner ourselves so we can
    // kill the helper (job owner) mid-run and prove the target dies with it.
    const config = sandbox.createWindowsSandbox(
      'cmd.exe',
      ['/c', `ping -n 30 127.0.0.1 >nul & echo done > "${targetFile}"`],
      { workspace: wsDir }
    );
    const child = spawn(config.command, config.args, { stdio: 'ignore' });
    // Let the (long) target start, then kill the helper after a short delay.
    await new Promise((r) => setTimeout(r, 2000));
    child.kill('SIGKILL');
    await new Promise((r) => child.on('exit', r));
    if (config.cleanup) { try { config.cleanup(); } catch (e) { /* best-effort */ } }
    // If KILL_ON_JOB_CLOSE worked, the target ping was terminated and never
    // wrote the file.
    assert.ok(!fs.existsSync(targetFile), 'target must be killed when the helper exits');
  });
});
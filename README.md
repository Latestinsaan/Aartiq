# Aartiq™ — For The Questions That Matter

> "The most important question isn't what you ask AI. It's what AI asks you before it acts."

Aartiq™ is an open-source AI browser that plans tasks, explains non-trivial actions, requests permission when required, and executes through controlled capabilities.

**Plan → Explain → Ask → Execute**

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-cyan.svg)](LICENSE)
[![Version](https://img.shields.io/badge/Version-0.3.7-blue.svg)](https://github.com/Latestinssan/Aartiq/releases/tag/v0.3.7)
[![Downloads](https://img.shields.io/github/downloads/Latestinssan/Aartiq/total?color=success&label=Downloads)](https://github.com/Latestinssan/Aartiq/releases)
[![Windows](https://img.shields.io/badge/Windows-Supported-blue?logo=windows)](https://github.com/Latestinssan/Aartiq/releases/latest)
[![macOS](https://img.shields.io/badge/macOS-Supported-blue?logo=apple)](https://github.com/Latestinssan/Aartiq/releases/latest)
[![Linux](https://img.shields.io/badge/Linux-Supported-blue?logo=linux)](https://github.com/Latestinssan/Aartiq/releases/latest)
[![Android](https://img.shields.io/badge/Android-Supported-blue?logo=android)](https://github.com/Latestinssan/Aartiq/releases/latest)
[![Microsoft Store](https://img.shields.io/badge/Microsoft%20Store-Listed-blue?logo=microsoft)](https://apps.microsoft.com/detail/9nd6wg2rp7cm?hl=en-GB&gl=IN)

<p align="center">
  <img width="1912" height="1168" alt="Aartiq Browser" src="https://github.com/user-attachments/assets/fe9131d4-cfcf-4d3b-aea5-9cc451b4fbd1" />
</p>

---

## Why Aartiq?

Traditional browsers help you navigate the web.

AI assistants help you understand information.

**Aartiq is built for the space between the two: helping AI carry out tasks while keeping the user in control.**

Instead of manually opening tabs, searching websites, filling forms, creating documents, moving files, and repeating workflows, you describe the goal.

Aartiq can turn that goal into structured actions, evaluate those actions against its permission model, request approval when required, and execute through registered capabilities.

> **AI can act. You decide what it is allowed to do.**

---

## See Aartiq in Action

**Prompt:**

> *"Search for today's news, create a PDF summary, move it to my Desktop, and open it."*

<p align="center">
  <img width="744" height="480" alt="Aartiq task execution demo" src="https://github.com/user-attachments/assets/051f5188-6e20-4b58-8087-74b9dd61b2e2" />
</p>

The workflow:

```text
Understand
    ↓
Plan
    ↓
Explain
    ↓
Ask
    ↓
Execute
    ↓
Result
````
## Permission Workflow

| Plan | Permission | Results |
|:----:|:----------:|:-------:|
| <img width="504" height="551" alt="Plan" src="https://github.com/user-attachments/assets/5311cf81-47cf-46c9-a1f7-994113923768" /> | <img width="504" height="551" alt="Permission" src="https://github.com/user-attachments/assets/b5c6f6c5-ae42-4fe1-8c86-9a1dfce03e93" /> | <img width="504" height="551" alt="Results" src="https://github.com/user-attachments/assets/fa1fd0be-5cf1-4c4a-8a97-30dfad70f5a3" /> |

Aartiq searches the web, gathers information, creates the document, requests approval for actions that require it, moves the resulting file, and opens it.

---

## Permission-First AI

Aartiq evaluates each command against its registered capability and permission policy.

Actions that require approval are presented before execution with information about what will happen and what resource or capability is involved.

### Risk-Based Permissions

| Risk         | Typical behavior                                     |
| ------------ | ---------------------------------------------------- |
| **Low**      | Automatic / policy-controlled                        |
| **Medium**   | Explicit approval                                    |
| **High**     | Stronger confirmation                                |
| **Critical** | Explicit authorization; never silently auto-approved |

Risk is assigned to the **capability being invoked**, rather than being inferred solely from the wording of the user's prompt.

For the complete command catalog, risk assignments, approval behavior, and implementation details:

**[AI Command Reference](https://aartiq.ponsrischool.in/docs/ai-commands)**

---

## How It Works

Aartiq converts natural-language goals into structured, permission-aware execution.

```text
┌───────────────────────────┐
│           USER            │
│     Natural-language      │
│           goal            │
└─────────────┬─────────────┘
              │
              ▼
┌───────────────────────────┐
│      AI ORCHESTRATOR      │
│ GPT • Claude • Gemini ... │
└─────────────┬─────────────┘
              │
              ▼
┌───────────────────────────┐
│      TASK PLANNING        │
│   Structured Commands     │
└─────────────┬─────────────┘
              │
              ▼
┌───────────────────────────┐
│   PERMISSION & SECURITY   │
│ Risk • Capability • Scope │
└─────────────┬─────────────┘
              │
              ▼
        ┌──────────────┐
        │   APPROVAL   │
        │   REQUIRED?  │
        └──────┬───────┘
               │
               ▼
┌───────────────────────────┐
│     CONTROLLED EXECUTION  │
│ Browser • Files • OS • OCR│
└─────────────┬─────────────┘
              │
              ▼
┌───────────────────────────┐
│          RESULT           │
└───────────────────────────┘
```

Actions are exposed through registered capabilities rather than allowing the model unrestricted access to arbitrary system primitives.

---

## Security

Aartiq uses a defense-in-depth security model with risk-based permissions, capability controls, directory allowlists, platform-specific sandboxing, encrypted vault storage, and explicit approval workflows.

The full model — risk levels, defense-in-depth layers, encryption & vault migration, and remote-device security — is documented on the [Security Model page](https://aartiq.ponsrischool.in/docs/security).

> **Verified in CI — and honest about its limits.** These invariants are covered by an automated Jest suite in `.github/workflows/jest.yml`. The suite is dispatched on demand (latest green run: [#34769503518](https://github.com/Latestinssan/Aartiq/actions/runs/34769503518)) and passed all four jobs:
>
> * **aartiq-browser full suite** (ubuntu): 25/26 suites — **537 passed / 40 environment-skipped / 0 failed** (577 declared tests)
> * **Windows AppContainer runtime** (windows): 61 passed / 30 platform-skipped
> * **macOS Seatbelt runtime** (macos): 104 passed
> * **Linux bubblewrap runtime** (ubuntu): 57 passed / 21 skipped
>
> What it proves: the security logic we wrote behaves as designed — approval gating, params-hash verification, fail-closed sandboxing, directory allowlists, capability scoping, and the agent token-binding.
>
> Honest limits: runtime sandbox tests execute only on their own OS; OS-automation tests skip on runners without the native tools (e.g. `xdotool`/`xte`); and the CRX3 signature-verifier suite (`extensions.crx-verifier.test.ts`) is **currently skipped** — `verifyCrx()` hits a Node 24 OpenSSL decode error that hangs jest, so it is counted as skipped, never as passing, until the verifier's header parsing is fixed.

### Windows sandboxing (v0.3.7+)

v0.3.7 adds **AppContainer + Job Object** sandboxing on Windows. Before v0.3.7 the Job Object confined processes only; AppContainer adds OS-layer isolation — filesystem via package-SID ACL grants and network via zero capabilities — by starting the target with `CreateProcessW` in a suspended state inside the AppContainer and applying the Job Object at creation, so nothing runs even momentarily unsandboxed.

* **CI-verified on real Windows** (`windows-latest`): the runtime matrix passes — suspended AppContainer start, OS-enforced ACL allowlist, verified job assignment, grandchild containment, secret isolation, and `KILL_ON_JOB_CLOSE` all return verified sandbox results.
* **Audited:** design + source review in [`Audit Report/2026-09-13_Windows_AppContainer_Sandbox_Audit/SECURITY_AUDIT.md`](Audit%20Report/2026-09-13_Windows_AppContainer_Sandbox_Audit/SECURITY_AUDIT.md).
* **Fail-closed:** any policy or setup failure returns a structured `SANDBOX_*` error; there is no fallback path that runs the command unsandboxed.

---

## Agent API & Tool Server

Aartiq exposes its browser capabilities to AI agents through a single, security-enforced tool registry served over two transports:

* **MCP** (Model Context Protocol) for clients such as Claude Desktop, and
* **HTTP** for local scripts, the in-product assistant, and remote access over Tailscale / LAN.

Every tool call — navigation, tab control, form filling, extension management, snapshots, theming, or OS actions — is routed through the `SecurityPipeline` before it runs. The pipeline performs risk classification, capability matching, and approval-gating.

### Multiple agents, one browser

More than one agent can be connected to the same browser at once. Each connection is registered with a trust level that scopes its verbs and origins. A per-tab lock manager ensures two agents can't collide on form filling.

### Accessibility snapshots with stable `@ref` ids

Instead of raw DOM dumps, agents receive an accessibility (AX) tree. Each interactive node carries an identity-bound `@ref` id derived from the page's backend node id, so a reference stays stable across navigation and DOM changes.

### Form filling

Stored credentials and profiles are kept in an encrypted vault (AES-GCM, passphrase-derived key; the same E2EE2 scheme used elsewhere). A field matcher maps page inputs to stored values by autocompleting password fields and typed text.

### Chrome extensions

Extensions can be loaded from an on-disk unpacked directory or installed from the Chrome Web Store. Web Store packages are validated as CRX3: the signature is verified with the embedded public key.

### UI themes and modes

The interface supports selectable themes and UI modes (normal, focus, reader, zen, presentation) that adjust what is shown and how the assistant presents itself, independent of the underlying authentication state.

---

## Example Prompts

Try Aartiq with tasks such as:

| Prompt                                                    | Example workflow                              |
| --------------------------------------------------------- | --------------------------------------------- |
| `Search for React tutorials and open the top 3`           | Searches the web and opens relevant results   |
| `Summarize this page and save it as a PDF`                | Reads the page and generates a structured PDF |
| `Set brightness to 50% and open VS Code`                  | Uses supported system capabilities            |
| `Create a PowerPoint about climate change`                | Generates a structured presentation           |
| `Schedule a daily backup at 9 AM`                         | Creates a recurring background task           |
| `Read the text in this screenshot`                        | Uses OCR / visual intelligence                |
| `Fill this form with my details`                          | Identifies and fills supported form fields    |
| `Search for electron performance and extract the results` | Performs browser-based research               |

For every available command and its risk classification:

**[AI Command Reference →](https://aartiq.ponsrischool.in/docs/ai-commands)**

---

## AI Providers

Aartiq supports multiple AI backends, including:

* Google Gemini
* OpenAI GPT
* Anthropic Claude
* Groq
* xAI
* Azure OpenAI
* Ollama (local)
* LM Studio (local, OpenAI-compatible)
* Apple Intelligence on macOS

Provider availability depends on the platform and configuration. Local models (Ollama, LM Studio) keep request content on the device; an OpenClaw-compatible local-agent bridge is also supported for remote inference.

---

## Performance

Aartiq opens the Chromium window immediately and loads background services asynchronously, so the interface is usable before every subsystem has finished starting. Long-running automation runs as a background task, not a blocking modal.

### Benchmark

Measured on a **MacBook Pro M4 Pro**, 12-core CPU, 24 GB RAM, macOS 26.5.

**Benchmark version:** v0.3.4
**Current release:** v0.3.7
**Date:** 2026-07-20

| Metric                        | Result    |
| ----------------------------- | --------- |
| First visible window          | **0.32s** |
| Warm start                    | **0.31s** |
| Idle CPU after initialization | **<1%**   |

> Startup measurements represent time to the first visible window, not complete service initialization. Results vary by hardware, operating system, and configuration.
>first visible window ≠ complete service initialization
Detailed measurements and methodology:

**[Performance Benchmarks →](https://aartiq.ponsrischool.in/docs/overview#performance-benchmarks)**

---

## Installation

### Pre-built Binaries

| Platform              | Format           |
| --------------------- | ---------------- |
| Windows               | `.exe` / `.msix` |
| Windows               | Microsoft Store  |
| macOS — Apple Silicon | `.dmg`           |
| macOS — Intel         | `.dmg`           |
| Linux                 | `.AppImage`      |
| Android               | `.apk`           |

Download the latest release from:

**[Aartiq Releases →](https://github.com/Latestinssan/Aartiq/releases)**

### macOS

If macOS blocks the application:

```bash
xattr -cr /Applications/Aartiq.app
```

### Build From Source

```bash
git clone https://github.com/Latestinssan/Aartiq.git
cd Aartiq/aartiq-browser

npm install

# Next.js development server
npm run dev

# Electron shell
npm run electron-start
```

### Android

```bash
cd flutter_browser_app

flutter pub get
flutter run
```

---

## Documentation

The GitHub README provides the product overview. Detailed architecture and implementation documentation lives on the Aartiq documentation site.

| Topic                   | Documentation                                                          |
| ----------------------- | ---------------------------------------------------------------------- |
| Overview & Architecture | [Overview](https://aartiq.ponsrischool.in/docs/overview)               |
| Security Model          | [Security](https://aartiq.ponsrischool.in/docs/security)               |
| AI Commands             | [Command Reference](https://aartiq.ponsrischool.in/docs/ai-commands)   |
| API Reference           | [API Reference](https://aartiq.ponsrischool.in/docs/api-reference)     |
| Components              | [Components](https://aartiq.ponsrischool.in/docs/components)           |
| Automation              | [Automation](https://aartiq.ponsrischool.in/docs/automation)           |
| Cloud Sync              | [Cloud Sync](https://aartiq.ponsrischool.in/docs/cloud-sync)           |
| Troubleshooting         | [Troubleshooting](https://aartiq.ponsrischool.in/docs/troubleshooting) |
| Changelog               | [Changelog](https://aartiq.ponsrischool.in/docs/changelog)             |
| v0.3.7 Release Notes    | [Release Notes](release_notes/v0.3.7.md)                               |

---

## Contributors

Built by [Latestinssan](https://github.com/Latestinssan) with contributions from the community.

<a href="https://github.com/Latestinssan/Aartiq/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=Latestinssan/Aartiq" />
</a>

---
> [!IMPORTANT]
>
> ## 🚧 Project Status: AI-Assisted Maintenance
>
> Aartiq was built solo, from scratch, over the past several months — no team, no funding, just one developer learning as it went. It's now a working, tested, cross-platform AI browser with a real permission and sandboxing model behind it.
>
> **Development has shifted to an AI-assisted maintenance model.** AI agents now handle a meaningful share of day-to-day work — reviewing issues, analyzing bugs, improving docs, and preparing fixes. This does **not** mean the project is unmaintained or unaccountable:
>
> - Every change to security, permissions, user data, releases, or project direction is reviewed and approved by a human before it ships.
> - CI must be green before any release goes out (see the Security section above for the current test numbers).
> - The maintainer remains responsible for the project's direction and correctness.
>
> **Why this setup:** it lets a solo project keep shipping fixes and improvements without requiring full-time human bandwidth on every routine task, while keeping a human in the loop for anything consequential — which is the same philosophy Aartiq applies to its own permission model.
>
> Bigger roadmap items (new features, larger refactors, community contribution workflows) are paused until there's more bandwidth or contributors to support them. Bug fixes, security patches, and documentation stay actively maintained.
>
> Issues, PRs, and questions are welcome — response time may vary, but nothing ships without review.
>
> — Latestinssan
## License

Aartiq uses a **dual-license** model:

| Component                                           | License                           |
| --------------------------------------------------- | --------------------------------- |
| **Aartiq Browser** — desktop, mobile, and core code | [Apache License 2.0](LICENSE)     |
| **Aartiq MCP Server** — `aartiq-mcp/`               | [MIT License](aartiq-mcp/LICENSE) |

The MCP server is MIT-licensed for compatibility with Claude Desktop and other MCP clients. All other components remain Apache 2.0.

---

## Trademark

**Aartiq™** is a trademark of Latestinssan.

The applicable open-source license permits the use, modification, and redistribution of the source code. It does **not** grant permission to use the Aartiq name, logo, trademarks, or visual identity.

Modified distributions must be rebranded under a different name and must not present themselves as official Aartiq releases.

---

<p align="center">

### For The Questions That Matter.

**The most important question isn't what you ask AI.
It's what AI asks you before it acts.**

**Plan → Explain → Ask → Execute**

**Aartiq™**

© 2026 Aartiq™. All rights reserved.

# Security Policy

## Supported versions

Only the current major version receives security updates.

| Version | Supported |
|---|---|
| 1.x | Yes |
| < 1.0.0 | No |

Cairn runs on Node.js 20 or newer and has zero runtime dependencies.

## Reporting a vulnerability

If you discover a security vulnerability in Cairn, report it privately using GitHub Security Advisories:

- Open a private advisory at [https://github.com/vortexpert-labs/cairn/security/advisories/new](https://github.com/vortexpert-labs/cairn/security/advisories/new)
- Alternatively, email `contact@vortexpert.com` if you cannot use GitHub Security Advisories.

Please include:
- A description of the vulnerability and its potential impact.
- Steps to reproduce or a proof of concept.
- Affected versions and platforms.

### Response timeline

- **Initial acknowledgement:** Within 48 hours.
- **Status updates:** Regular updates on triage, remediation, and disclosure timeline.
- **Disclosure:** Coordinated public disclosure once a patch is published.

## Execution surface and the `verify` model

Cairn reads and writes markdown files in a git repository. It does not run a server, open network ports, or collect telemetry.

The only execution surface in Cairn is the `verify` feature:

- A `CONSTRAINT` anchor may specify a shell command in its `verify.command` field to prove that the constraint holds.
- `cairn check` **never** runs verify commands by default.
- Enabling execution requires an explicit `--allow-verify` CLI flag or uncommitted local configuration.
- A committed file inside the repository being checked can never authorise or enable execution.

### Rationale for execution asymmetry

This asymmetry is intentional:

If a committed configuration file inside a repository could authorise running verify commands, an attacker could create a malicious repository with an arbitrary shell command and a committed flag enabling it. Any user cloning that repository and running `cairn check` would execute untrusted code without consent.

Because authorization must strictly originate from outside the repository being checked, cloning an untrusted repository and running `cairn check` (or `cairn check --strict`) is safe by default. Enabling `--allow-verify` is an explicit operator decision, equivalent to running a repository's test suite or build script.

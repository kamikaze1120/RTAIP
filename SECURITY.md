# Security Policy

## Supported Versions

RTAIP is under active development. Security fixes are applied to the `main`
branch and the latest deployed release.

## Reporting a Vulnerability

**Please do not open public issues for security vulnerabilities.**

Instead, report privately via GitHub Security Advisories
(**Security -> Report a vulnerability**) on this repository, or contact the
maintainer directly. Include:

- A description of the vulnerability and its impact
- Steps to reproduce (proof-of-concept if available)
- Affected component (backend, frontend, connector, deployment)

We aim to acknowledge reports within **72 hours** and provide a remediation
timeline after triage.

## Scope & Responsible Use

RTAIP is an **open-source intelligence (OSINT) fusion platform that operates
only on public or explicitly authorized data sources**. Reports concerning
misuse of the platform for unauthorized surveillance, tracking of private
individuals, or access to non-public data are treated as policy violations --
see [docs/ETHICS.md](docs/ETHICS.md).

## Secrets

Never commit credentials. API keys and service-role keys belong in environment
variables, never in the repository. If you find a leaked secret, report it
privately and we will rotate it.

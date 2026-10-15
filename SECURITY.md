# Security Policy

## Reporting a vulnerability

Use GitHub's private vulnerability reporting on this repository ("Security" tab → "Report a vulnerability"). Do not open a public issue for security problems. You will get an acknowledgement within 3 business days.

## Scope

- The Forge hub (`src/forge`, `go/`), the Forge MES module (`modules/Forge MES`) and the governance specs.
- Spoke adapters are integration code; vulnerabilities in the external systems they connect to should be reported to those systems' owners.

## Secrets

- No credentials, tokens, connection strings or private keys are allowed in this repository, including example files, docs, CI configs and `.claude/settings*.json`.
- Secret scanning with push protection is enabled; a blocked push means the value must be removed and rotated, not bypassed.
- Anything that was ever committed is considered compromised and must be rotated, even if the commit is later rewritten.

## Supported versions

Only `main` receives security fixes.

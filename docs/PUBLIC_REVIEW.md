# Portfolio edition review

## Content changes

- Replaced the creative profile with newly written fictional sample data.
- Excluded historical campaign prompts and examples entirely.
- Removed client names, campaign-specific offer copy, original campaign identifiers, personal references, target-country examples and translated campaign copy from source, tests and documentation.
- Replaced deployment-update instructions with standalone setup, architecture and demo documentation.
- Converted client matching and memory scopes into profile-driven configuration.
- Made status labels configurable, with neutral English defaults.
- Added blank configuration and ignore rules for local secrets, dependencies and outputs.

## Verification

The six application/test files in the full repository export were byte-identical to the uploaded patch. The two additional profile/history files were not copied into this edition. The replacement profile is synthetic.

The offline demo exercises actual workflow functions with simulated task, chat, model, storage and image-provider adapters. It never forwards requests to production services. Outputs are explicitly labeled as placeholders.

The distributable excludes dependency folders, account exports, environment values, original archives, Git history and private audit notes. Automated checks do not determine contractual permission to share implementation details; the owner should review the final package before publishing it.

## Scope

This edition preserves the workflow and optional integration code. It does not modify or deploy an existing service, create a public repository, migrate production state or spend generation credits. Local demo state is in memory; live integration state uses Redis.

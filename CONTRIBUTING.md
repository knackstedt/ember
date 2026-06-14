# Contributing to Ember

Thank you for your interest in contributing to Ember! This document outlines the process for contributing and the terms under which contributions are accepted.

## License and Intellectual Property

**By contributing any code, documentation, or other materials to this project, you agree that your contributions are licensed under the PolyForm Noncommercial License 1.0.0, exactly as specified in [`LICENSE.md`](LICENSE.md), with no exceptions.**

This means:
- All contributions you submit become part of the project and are covered by the project's license.
- You retain copyright to your contributions, but you grant the project and all recipients a perpetual, worldwide, non-exclusive, royalty-free license to use, reproduce, modify, display, and distribute your contributions under the terms of [`LICENSE.md`](LICENSE.md).
- **There are no exceptions.** Your contributions are not dual-licensed, and no alternative licensing terms apply.

If you are contributing on behalf of your employer, you must ensure your employer has authorized you to contribute under these terms.

> **Commercial Use**: The PolyForm Noncommercial License 1.0.0 does not permit commercial use. If you need to use Ember or any contribution commercially, contact the licensor to purchase a commercial license.

## How to Contribute

### Reporting Bugs

Before opening a bug report, please search existing issues to avoid duplicates. When reporting a bug, include:

- A clear description of the issue.
- Steps to reproduce.
- Expected vs. actual behavior.
- Your environment (OS, Node version, Electron version, etc.).
- Any relevant logs or screenshots.

### Suggesting Features

Feature requests are welcome! Please open an issue and describe:

- The problem or limitation you're facing.
- Your proposed solution or feature.
- Why it would be useful to others.

### Pull Requests

1. Fork the repository and create a new branch from `main`.
2. Make your changes, following the existing code style.
3. Ensure your changes pass the project's linting and type checks (`bun run lint`, `npx tsc --noEmit`).
4. If your changes affect Rust code, run `cargo check` in the relevant crate.
5. Write clear, concise commit messages.
6. Open a pull request and fill out the template completely.

### Code Style

- **TypeScript / React**: Follow the existing patterns in `src/`. Use TypeScript strictly.
- **Rust**: Follow standard Rust formatting (`cargo fmt`) and idioms.
- Keep changes focused. A pull request should address a single concern.

## Questions?

If you have questions about contributing or licensing, please open a discussion or contact the maintainers before submitting any work.

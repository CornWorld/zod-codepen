# Contributing to zod-codepen

Thank you for your interest in contributing to zod-codepen! This document provides guidelines and instructions for contributing.

## Development Setup

### Prerequisites

- Node.js ≥ 20
- pnpm ≥ 10.0.0

### Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/zod-codepen.git
   cd zod-codepen
   ```

3. Install dependencies:
   ```bash
   pnpm install
   ```

4. Build all packages:
   ```bash
   pnpm build
   ```

5. Run tests:
   ```bash
   pnpm test
   ```

## Project Structure

```
zod-codepen/
├── pkgs/
│   ├── core/         # Core serialization engine
│   ├── zod-v3/       # Zod v3 adapter
│   └── zod-v4/       # Zod v4 adapter
├── docs/             # VitePress documentation
└── package.json      # Root workspace config
```

## Development Workflow

### Making Changes

1. Create a feature branch:
   ```bash
   git checkout -b feat/your-feature
   ```

2. Make your changes

3. Run tests to ensure nothing is broken:
   ```bash
   pnpm test
   ```

4. Run linting:
   ```bash
   pnpm lint
   ```

### Testing

- Run all tests: `pnpm test`
- Run v3 tests only: `pnpm test:v3`
- Run v4 tests only: `pnpm test:v4`
- Run tests in watch mode: `pnpm --filter @zod-codepen/zod-v3 test:watch`

### Documentation

- Start docs dev server: `pnpm docs:dev`
- Build docs: `pnpm docs:build`
- Preview built docs: `pnpm docs:preview`

## Commit Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation changes
- `test:` Test additions or modifications
- `refactor:` Code refactoring
- `chore:` Maintenance tasks

Examples:
```
feat: add support for z.datetime() constraint
fix: handle null values in object serialization
docs: add examples for custom handlers
test: add tests for bigint constraints
```

## Pull Request Process

1. Update documentation if needed
2. Add tests for new features
3. Ensure all tests pass
4. Update the README if needed
5. Submit your PR with a clear description

### PR Title Format

Use the same format as commit messages:
- `feat: Add new feature`
- `fix: Fix bug in serializer`

## Adding New Schema Type Support

To add support for a new Zod schema type:

1. Add a handler in `pkgs/core/src/serializer.ts`:
   ```typescript
   handlers.set('newtype', (schema, ctx) => {
     const def = ctx.adapter.getDef(schema);
     // ... serialization logic
     return 'z.newType(...)';
   });
   ```

2. Add tests in both `pkgs/zod-v3/test/` and `pkgs/zod-v4/test/`

3. Update documentation in `docs/guide/supported-types.md`

## Reporting Issues

When reporting issues, please include:

- Node.js version
- Zod version
- zod-codepen version
- Minimal reproduction code
- Expected vs actual behavior

## Questions?

Feel free to open an issue for questions or discussions.

## License

By contributing, you agree that your contributions will be licensed under the Mozilla Public License 2.0.

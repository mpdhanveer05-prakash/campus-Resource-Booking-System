# Tested Environment

Recorded during Phase 1 (scaffold & configuration).

## Toolchain

| Tool | Version tested |
|---|---|
| Node.js | **24.14.1** |
| npm | 11.11.0 |
| Git | 2.53.0.windows.2 |
| OS | Windows 11 Pro (10.0.26200) |

The Node version is pinned in `.nvmrc` (`24.14.1`) and declared in `server/package.json` via `engines.node >= 24.0.0`.

## Installed dependency versions

All dependencies are installed with `--save-exact`, so `package.json` records exact versions and both lockfiles are committed.

### Server runtime

| Package | Version |
|---|---|
| express | 5.2.1 |
| pg | 8.23.0 |
| express-session | 1.19.0 |
| connect-pg-simple | 10.0.0 |
| argon2 | 0.45.1 |
| zod | 4.6.5 |
| helmet | 8.3.0 |
| express-rate-limit | 8.7.0 |
| dotenv | 18.0.1 |
| pino | 10.3.1 |
| pino-http | 11.0.0 |

### Server development

| Package | Version |
|---|---|
| eslint | 10.11.0 |
| @eslint/js | 10.0.1 |
| globals | 17.12.0 |
| nodemon | 3.1.14 |
| node-pg-migrate | 9.0.0 |
| vitest | 5.0.1 |
| supertest | 7.2.2 |
| pino-pretty | 13.1.3 |

### Client

| Package | Version |
|---|---|
| react | ^19.2.8 |
| react-dom | ^19.2.8 |
| react-router | 8.4.0 (exact) |
| vite | ^8.3.0 |
| @vitejs/plugin-react | ^6.1.1 |
| oxlint | ^1.81.0 |

## Dependency resolution notes

**ESLint major version.** An initial attempt to install `eslint@9` with an unpinned `@eslint/js` failed with an `ERESOLVE` peer-dependency conflict: `@eslint/js@10.0.1` requires `eslint@^10.0.0`. Per the build guardrails, `--force` and `--legacy-peer-deps` were **not** used. The conflict was resolved deliberately by aligning both packages on the same major. ESLint 9 was rejected because npm reports it as no longer supported; the project therefore uses **eslint 10.11.0 with @eslint/js 10.0.1**, which installs cleanly with no peer warnings.

**Environment file loading.** Rather than calling `dotenv.config()` at module scope (which is order-sensitive relative to the config module reading `process.env`), the npm scripts use Node 24's native `--env-file-if-exists=.env` flag. `dotenv` remains installed as specified by the guide's dependency list.

## Reinstall procedure

The initial install created both lockfiles. All subsequent installs must use clean installs:

```bash
cd server && npm ci
cd ../client && npm ci
```

Do not use `npm install` for reinstalls, and do not use `--force` to bypass engine or peer incompatibilities.

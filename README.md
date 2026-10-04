# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Accounts and configuration (shared sign-in)

Cluevoyance signs players in through the shared Sting Ray identity (WorkOS)
via this project's own Supabase Auth, keeps its own `accounts` and `plays`
tables, and treats guests exactly as before (localStorage). Read
`src/account/README.md` for the architecture, `docs/CONFIG-INVENTORY.md` for
every environment value and dashboard setting, and `docs/WORKOS-SMOKE.md`
for the manual sign-in checks.

```bash
cp .env.example .env            # then fill in the local stack's values from `npm run db:status`
npm run db:start && npm run db:reset
npm run dev
npm test                        # unit (Vitest) + database (node:test against the local stack)
```

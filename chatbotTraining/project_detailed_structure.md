# CoachCritic Backend — Project Next Actions

## Project Overview

This repository is the backend for the CoachCritic platform.

- Node.js / Express backend
- MongoDB data store
- JWT authentication + role-based access control
- Firebase admin integration
- Stripe webhooks and payments support
- Socket.io support with Redis adapter
- i18n localization and text moderation middleware
- Swagger API documentation
- PM2 deployment scripts

## Key Files and Structure

- `backend/server.js` — main application entry point
- `package.json` — scripts, dependencies, aliases
- `backend/config/` — runtime configuration for logging, cron jobs, Redis, sockets, origins, i18n
- `backend/routes/` — public and versioned API routes
- `backend/roles/` — role-specific route modules and controller implementations
- `backend/helperUtils/` — shared utilities for DB setup, response handling, validation, backups
- `backend/models/` — Mongoose schema definitions
- `backend/commonModules/` — reusable modules such as Stripe, search suggestions, app engagement
- `swagger/` — generated Swagger/OpenAPI JSON
- `aliasConfig/` — path alias configuration for module resolution

## Existing Run Commands

Use these from the repository root:

- `npm run dev` — start dev server with nodemon on port 4018
- `npm run dev1` — start server on port 4020
- `npm run prod` — start production mode with nodemon
- `npm run pm2:dev:start` — start PM2 dev process
- `npm run pm2:prod:start` — start PM2 prod process

## Current Configuration Notes

- Environment files are loaded from `.env.<NODE_ENV>`
- Firebase service account key should be placed in `backend/secretAssets/serviceAccountKey.json`
- Swagger expects `swagger/swagger_output.json`
- API docs available at `/api-docs`
- Health endpoint available at `/health`

## Recommended Next Actions

1. Validate local startup
   - Ensure `.env.dev` and MongoDB are configured
   - Confirm `npm run dev` starts successfully and API health check passes

2. Confirm secrets and Firebase setup
   - Verify `backend/config/firebaseAdmin.js` uses the correct Firebase project ID
   - Confirm `serviceAccountKey.json` is present and valid

3. Review authentication and authorization flow
   - Confirm JWT login/register endpoints
   - Audit role-specific routes under `backend/roles/`

4. Audit third-party integrations
   - Stripe webhook route and signature verification logic
   - Firebase auth/notifications usage
   - AWS/Azure upload modules and storage config

5. Improve documentation
   - Update `README.md` with current setup steps, env variables, and route overview
   - Add a `CONTRIBUTING.md` or `DEVELOPMENT.md` if needed

6. Add tests / validation
   - Review existing test dependencies: `mocha`, `supertest`
   - Add endpoint tests for auth and core routes if missing

7. Stabilize deployment scripts
   - Review `backend/config/ecosystem.config.js` and PM2 workflow
   - Test `pm2:dev:start`, `pm2:status`, and `pm2:logs`

## Suggested Priorities

- High: get local dev environment stable and validate core auth API
- Medium: confirm external integrations and secret management
- Low: expand documentation and add automated tests

## Useful References

- Postman collection: `postman_collection/CoachCritic.postman_collection.json`
- Swagger docs: `swagger/swagger_output.json`
- Alias config: `aliasConfig/pathAliases.config.js`
- Main server: `backend/server.js`

---

*Generated to capture the current project state and next action items.*

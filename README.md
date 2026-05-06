# clinical_copilot
Final year project for CLASS OF 2026 IBA. This project is about automating the clinical workflow.

## Note Studio Stage 4: Migration Rollout

Use this sequence when deploying Note Studio persistence changes to a new environment.

1. Validate environment variables are set (`DATABASE_URL`, auth keys, app vars).
2. Confirm Prisma client is up to date:
	- `npm run db:generate`
3. Check migration state:
	- `npm run db:migrate:status`
4. Apply migrations in deployment environment:
	- `npm run db:migrate:deploy`
5. Seed library templates (idempotent):
	- `npm run db:seed`
6. Optional demo data seeds:
	- `npm run db:seed:doctor`
	- `npm run db:seed:patient`
7. Verify in app:
	- Open doctor templates page
	- Confirm library templates load
	- Create a personal template
	- Set active template from gallery

### Local Development Migration Command

For local schema changes before commit:

- `npm run db:migrate:dev -- --name <migration_name>`

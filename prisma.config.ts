import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  migrations: {
    seed: 'npx tsx ./prisma/seeds/seed-templates.ts',
  },
  datasource: {
    // Read database URL from .env
    url: env('DATABASE_URL'),
  },
});


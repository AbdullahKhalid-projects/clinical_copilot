import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  datasource: {
    // justt giving the dabased url from the .env file
    url: env('DATABASE_URL'),
  },
});


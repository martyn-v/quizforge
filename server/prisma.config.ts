import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// One .env for the whole monorepo, at the repo root. mise already loads it
// for anything run through mise; this makes the Prisma CLI work without it
// too. dotenv does not override variables that are already set, so mise
// still wins.
config({ path: '../.env' });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});

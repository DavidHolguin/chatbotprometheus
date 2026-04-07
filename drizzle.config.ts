import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({
  path: ".env.local",
});

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    // Direct connection (Session mode, puerto 5432) — requerido para migraciones
    url: process.env.SUPABASE_DB_URL_MIGRATION ?? "",
  },
});

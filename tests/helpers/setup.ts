import { config } from "dotenv";
import { afterAll } from "vitest";
import { fecharPool } from "./db";

config({ path: [".env.local", ".env.example"], quiet: true });

afterAll(fecharPool);

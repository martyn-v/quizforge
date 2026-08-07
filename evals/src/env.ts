// Loads the root .env so eval scripts see the same config as the server.
import { config } from "dotenv";
import { fileURLToPath } from "node:url";

config({
  path: fileURLToPath(new URL("../../.env", import.meta.url)),
  quiet: true,
});

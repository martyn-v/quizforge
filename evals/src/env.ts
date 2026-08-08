// Loads the root .env so eval scripts see the same config as the server.
import { config } from "dotenv";
import { fileURLToPath } from "node:url";

config({
  path: fileURLToPath(new URL("../../.env", import.meta.url)),
  quiet: true,
});

// Eval traces go to their own LangSmith project. This keeps eval batches
// out of the trace stream of the live server sessions.
process.env.LANGSMITH_PROJECT = `${process.env.LANGSMITH_PROJECT ?? "default"}-evals`;

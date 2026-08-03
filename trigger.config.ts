import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  // Project ref is not a secret — it's the public identifier for this
  // Trigger.dev project (org: moche-ai-fdf9, project: mohe-ai-bJAE).
  project: "proj_mgggackrtgbpplbzskaq",
  dirs: ["./trigger"],
  // Default max wall-clock time per run; individual tasks can override.
  maxDuration: 60,
  retries: {
    // Skip retries in local `trigger dev` runs so failures surface immediately.
    enabledInDev: false,
    // Default backoff for any task that doesn't set its own `retry` block.
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
});

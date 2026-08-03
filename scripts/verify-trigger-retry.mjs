// One-off verification script for PR #4 (Trigger.dev foundation).
// Confirms: (1) a task can be triggered and completes in prod, and
// (2) the retry mechanism actually re-runs a failing attempt.
// Reads TRIGGER_SECRET_KEY from the environment — never embed it here.
import { tasks, runs } from "@trigger.dev/sdk";

async function pollUntilDone(handleId, label, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const run = await runs.retrieve(handleId);
    const status = run.status;
    process.stdout.write(`[${label}] status=${status}\n`);
    if (status === "COMPLETED" || status === "FAILED" || status === "CRASHED" || status === "SYSTEM_FAILURE") {
      return run;
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  throw new Error(`[${label}] timed out waiting for run to finish`);
}

async function main() {
  console.log("--- Test 1: normal run (expect 1 attempt) ---");
  const normalHandle = await tasks.trigger("ping", { message: "verify-normal" });
  const normalRun = await pollUntilDone(normalHandle.id, "normal");
  console.log("normal run final:", JSON.stringify({ status: normalRun.status, output: normalRun.output }, null, 2));

  console.log("\n--- Test 2: forced retry (expect fail on attempt 1, succeed on attempt 2) ---");
  const retryHandle = await tasks.trigger("ping", { message: "verify-retry", testRetry: true });
  const retryRun = await pollUntilDone(retryHandle.id, "retry", 90000);
  console.log("retry run final:", JSON.stringify({ status: retryRun.status, output: retryRun.output, attemptCount: retryRun.attemptCount ?? retryRun.attempts?.length }, null, 2));

  const normalOk = normalRun.status === "COMPLETED" && normalRun.output?.attempt === 1;
  const retryOk = retryRun.status === "COMPLETED" && retryRun.output?.attempt === 2;

  console.log("\n=== RESULT ===");
  console.log("normal run succeeded on attempt 1:", normalOk);
  console.log("retry run succeeded on attempt 2 (proves retry fired):", retryOk);

  if (!normalOk || !retryOk) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Verification script failed:", err);
  process.exitCode = 1;
});

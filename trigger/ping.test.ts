import { describe, it, expect, vi } from "vitest";

// We test the pure branching logic of the ping task's `run` function in
// isolation, without invoking the real Trigger.dev runtime. This locks in
// the retry contract verified live against production in PR #4:
// - normal calls succeed on attempt 1
// - testRetry calls throw on attempt 1 and succeed on attempt 2+

vi.mock("@trigger.dev/sdk", () => ({
  task: (def: unknown) => def,
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { runPing } = await import("./ping");

function mockCtx(attemptNumber: number) {
  return { ctx: { attempt: { number: attemptNumber } } };
}

describe("runPing", () => {
  it("succeeds on the first attempt when testRetry is not set", async () => {
    const result = await runPing({ message: "hi" }, mockCtx(1));
    expect(result).toMatchObject({ ok: true, attempt: 1 });
  });

  it("throws on attempt 1 when testRetry is true", async () => {
    await expect(runPing({ testRetry: true }, mockCtx(1))).rejects.toThrow(
      /Intentional test failure on attempt 1/,
    );
  });

  it("succeeds on attempt 2 when testRetry is true", async () => {
    const result = await runPing({ testRetry: true }, mockCtx(2));
    expect(result).toMatchObject({ ok: true, attempt: 2 });
  });

  it("never throws when testRetry is false even on attempt 1", async () => {
    const result = await runPing({ testRetry: false }, mockCtx(1));
    expect(result).toMatchObject({ ok: true, attempt: 1 });
  });
});

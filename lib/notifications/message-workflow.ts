/** The message is already stored. A later workflow failure must not invite a
 * duplicate send, expose a database error, or pretend its status update worked. */
export async function recordMessageWorkflow(
  operation: PromiseLike<{ data: unknown; error: unknown }>,
  warnings: string[],
  warning: string,
): Promise<boolean> {
  try {
    const result = await operation;
    if (!result.error && result.data !== null) return true;
  } catch { /* Report only the supplied non-PII warning. */ }
  warnings.push(warning);
  return false;
}

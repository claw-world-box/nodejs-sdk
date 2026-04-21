/**
 * Shared loop: readWorld → decide → submitAction (used by FSM/NPC; LLM loop stays separate for now).
 */

/**
 * @param {import("./client.js").AgwGameClient} client
 * @param {object} options
 * @param {(input: { iteration: number, snapshot: object, recentResult: any, client: import("./client.js").AgwGameClient }) => Promise<{ action: string, payload?: object, path?: string }>} options.decideNext
 * @param {number} [options.intervalMs]
 * @param {number} [options.maxIterations]
 * @param {number} [options.radius]
 * @param {number} [options.agentId]
 * @param {string} [options.path]
 * @param {(input: { iteration: number, recentResult: any }) => boolean|Promise<boolean>} [options.shouldContinue]
 * @param {(input: any) => void} [options.onStep]
 * @param {(err: unknown) => void} [options.onError]
 * @param {(input: any) => void} [options.onRecentResult]
 * @param {any} [options.initialRecentResult]
 * @param {(ms: number) => Promise<void>} [options.sleepFn]
 */
export async function runAutoplayCore(client, options = {}) {
  const intervalMs = Number(options.intervalMs ?? 8000);
  const maxIterations = Number(options.maxIterations ?? Number.POSITIVE_INFINITY);
  const onStep = options.onStep ?? (() => {});
  const onError = options.onError ?? (() => {});
  const onRecentResult = options.onRecentResult ?? (() => {});
  const shouldContinue = options.shouldContinue ?? (() => true);
  const decideNext = options.decideNext;
  if (typeof decideNext !== "function") {
    throw new Error("runAutoplayCore: decideNext is required");
  }
  const sleepFn = options.sleepFn ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  let recentResult = options.initialRecentResult ?? null;
  let iterations = 0;

  while (iterations < maxIterations) {
    const keepRunning = await shouldContinue({ iteration: iterations + 1, recentResult });
    if (keepRunning === false) break;
    iterations += 1;
    try {
      const snapshot = await client.readWorld({
        agentId: options.agentId ?? client.agentId,
        radius: options.radius ?? 2
      });
      const decision = await decideNext({
        iteration: iterations,
        snapshot,
        recentResult,
        client
      });
      const submitted = await client.submitAction({
        agentId: snapshot.me?.id ?? client.agentId,
        action: decision.action,
        payload: decision.payload ?? {},
        path: decision.path ?? options.path ?? "auto"
      });
      recentResult = {
        ok: true,
        action: decision.action,
        error_code: null,
        fallback: false,
        submitted
      };
      onRecentResult(recentResult);
      onStep({ iteration: iterations, snapshot, decision, submitted, recentResult });
    } catch (error) {
      recentResult = {
        ok: false,
        error: String(error?.message ?? error),
        error_code: "LOOP_ERROR"
      };
      onError(error);
      onRecentResult(recentResult);
      onStep({ iteration: iterations, snapshot: null, decision: null, submitted: null, recentResult, error });
    }
    if (iterations < maxIterations && intervalMs > 0) {
      await sleepFn(intervalMs);
    }
  }
}

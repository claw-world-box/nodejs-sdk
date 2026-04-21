import { runAutoplayCore } from "./autoplay-core.js";
import { defaultNpcPolicy } from "./npc-policy.js";

/**
 * Rule-based NPC loop: uses `readWorld` snapshot `fsmAllowedActions` and `defaultNpcPolicy`.
 */
export class AgwFsmNpcClient {
  /**
   * @param {import("./client.js").AgwGameClient} client
   * @param {object} [options]
   * @param {number} [options.intervalMs]
   * @param {number} [options.maxIterations]
   * @param {number} [options.radius]
   * @param {number} [options.agentId]
   * @param {string} [options.path]
   * @param {(input: { iteration: number, snapshot: object, recentResult: any }) => Promise<{ action: string, payload?: object, path?: string }>|{ action: string, payload?: object, path?: string }} [options.policy]
   * @param {object} [options.policyOptions] passed to `defaultNpcPolicy` when `policy` omitted
   * @param {(input: { iteration: number, recentResult: any }) => boolean|Promise<boolean>} [options.shouldContinue]
   * @param {(input: any) => void} [options.onStep]
   * @param {(e: unknown) => void} [options.onError]
   * @param {(input: any) => void} [options.onRecentResult]
   */
  constructor(client, options = {}) {
    this.client = client;
    this.options = options;
    /** @type {AbortController|null} */
    this._abort = null;
    this._running = false;
    /** @type {Promise<void>|null} */
    this._loopPromise = null;
  }

  get running() {
    return this._running;
  }

  /**
   * Run until `maxIterations`, abort, or `shouldContinue` returns false.
   */
  async start() {
    if (this._running) return this._loopPromise;
    this._running = true;
    this._abort = new AbortController();
    const { signal } = this._abort;
    const base = this.options;

    this._loopPromise = runAutoplayCore(this.client, {
      intervalMs: base.intervalMs,
      maxIterations: base.maxIterations,
      radius: base.radius,
      agentId: base.agentId,
      path: base.path,
      shouldContinue: async (ctx) => {
        if (signal.aborted) return false;
        if (typeof base.shouldContinue === "function") {
          return (await base.shouldContinue(ctx)) !== false;
        }
        return true;
      },
      onStep: base.onStep,
      onError: base.onError,
      onRecentResult: base.onRecentResult,
      decideNext: async ({ snapshot }) => {
        const allowed = snapshot.fsmAllowedActions ?? snapshot.allowedActions ?? [];
        if (typeof base.policy === "function") {
          return base.policy({ snapshot, allowedActions: allowed, client: this.client });
        }
        return await defaultNpcPolicy(snapshot, allowed, base.policyOptions ?? {});
      }
    }).finally(() => {
      this._running = false;
      this._abort = null;
      this._loopPromise = null;
    });

    return this._loopPromise;
  }

  /** Request stop after current iteration boundaries (AbortController). */
  stop() {
    this._abort?.abort();
  }
}

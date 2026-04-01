import { start as startSmoldot } from "smoldot";

export function createSmoldotBridge(options = {}) {
  return {
    WellKnownChain: {},
    createScClient(config = {}) {
      const client = startSmoldot(normalizeOptions({ ...options, ...config }));
      let activeChains = 0;

      const wrapChain = async (chainPromise, onResponse = () => {}) => {
        const chain = await chainPromise;
        activeChains += 1;
        let closed = false;

        void consumeResponses(chain, () => closed, onResponse);

        return {
          sendJsonRpc(request) {
            chain.sendJsonRpc(request);
          },
          remove() {
            if (closed) return;
            closed = true;
            try {
              chain.remove();
            } catch {
              // ignore remove races
            }
            activeChains -= 1;
            if (activeChains <= 0) {
              void client.terminate().catch(() => {});
            }
          },
          addChain(childChainSpec, childOnResponse = () => {}, databaseContent) {
            return wrapChain(
              client.addChain({
                chainSpec: childChainSpec,
                potentialRelayChains: [chain],
                databaseContent
              }),
              childOnResponse
            );
          }
        };
      };

      return {
        addChain(chainSpec, onResponse = () => {}, databaseContent) {
          return wrapChain(client.addChain({ chainSpec, databaseContent }), onResponse);
        },
        addWellKnownChain(name) {
          throw new Error(`well-known chain "${name}" is not supported, pass chain spec json instead`);
        }
      };
    }
  };
}

export function createAlwaysReadyChecker() {
  let forwardJsonRpc = null;
  return {
    responsePassThrough(response) {
      return response;
    },
    sendJsonRpc(request) {
      if (!forwardJsonRpc) {
        throw new Error("smoldot checker is not initialized");
      }
      forwardJsonRpc(request);
    },
    setSendJsonRpc(cb) {
      forwardJsonRpc = cb;
    },
    start(healthCallback) {
      healthCallback({ isSyncing: false, peers: 1, shouldHavePeers: false });
    },
    stop() {}
  };
}

async function consumeResponses(chain, isClosed, onResponse) {
  while (!isClosed()) {
    try {
      const response = await chain.nextJsonRpcResponse();
      onResponse(response);
    } catch {
      return;
    }
  }
}

function normalizeOptions(config) {
  const merged = { ...config };
  delete merged.workerFactory;
  return merged;
}

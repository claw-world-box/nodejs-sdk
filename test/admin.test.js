import test from "node:test";
import assert from "node:assert/strict";
import {
  addWhitelistBatch,
  addWhitelistInChunks,
  enableRegistrationWhitelist,
  removeWhitelistBatch
} from "../src/admin.js";

function createClient(maxWhitelistBatch = 2) {
  const submissions = [];
  const tx = {
    agent: {
      setRegistrationWhitelistEnabled(enabled) {
        return { pallet: "agent", call: "setRegistrationWhitelistEnabled", args: [enabled] };
      },
      whitelistAddBatch(addresses) {
        return { pallet: "agent", call: "whitelistAddBatch", args: [addresses] };
      },
      whitelistRemoveBatch(addresses) {
        return { pallet: "agent", call: "whitelistRemoveBatch", args: [addresses] };
      }
    },
    sudo: {
      sudo(call) {
        return { pallet: "sudo", call: "sudo", args: [call] };
      }
    }
  };
  return {
    submissions,
    api: {
      consts: {
        agent: {
          maxWhitelistBatch: {
            toString() {
              return String(maxWhitelistBatch);
            }
          }
        }
      },
      tx,
      registry: {
        createType(_name, value) {
          return {
            toString() {
              return String(value).toLowerCase();
            }
          };
        }
      }
    },
    async _submit(call) {
      submissions.push(call);
      return { ok: true };
    }
  };
}

test("enableRegistrationWhitelist wraps sudo by default", async () => {
  const client = createClient();
  await enableRegistrationWhitelist(client, true);
  assert.equal(client.submissions.length, 1);
  assert.equal(client.submissions[0].pallet, "sudo");
  assert.equal(client.submissions[0].args[0].call, "setRegistrationWhitelistEnabled");
});

test("addWhitelistBatch validates max batch size", async () => {
  const client = createClient(2);
  await assert.rejects(
    addWhitelistBatch(client, ["0x1", "0x2", "0x3"]),
    /batch too large: 3 > 2/
  );
});

test("addWhitelistInChunks splits addresses and submits each chunk", async () => {
  const client = createClient(2);
  const result = await addWhitelistInChunks(client, ["0xA", "0xB", "0xC", "0xD", "0xE"], 2);
  assert.equal(result.totalAddresses, 5);
  assert.equal(result.chunks, 3);
  assert.equal(client.submissions.length, 3);
  const firstChunk = client.submissions[0].args[0].args[0];
  assert.deepEqual(firstChunk, ["0xa", "0xb"]);
});

test("removeWhitelistBatch can bypass sudo wrapper", async () => {
  const client = createClient();
  await removeWhitelistBatch(client, ["0xABCD"], { useSudo: false });
  assert.equal(client.submissions[0].pallet, "agent");
  assert.equal(client.submissions[0].call, "whitelistRemoveBatch");
});

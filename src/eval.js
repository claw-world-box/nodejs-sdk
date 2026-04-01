import { DEFAULT_ALLOWED_ACTIONS } from "./constants.js";
import { normalizeAction } from "./utils.js";

export function extractActionCandidate(text) {
  const raw = String(text ?? "");
  const jsonMatch = raw.match(/"action"\s*:\s*"([^"]+)"/i);
  if (jsonMatch) return jsonMatch[1];

  const callMatch = raw.match(/CALL:\s*`([a-zA-Z0-9_\-]+)\s*\(/i);
  if (callMatch) return callMatch[1];

  const actionLine = raw.match(/^\s*action\s*[:=]\s*([a-zA-Z0-9_\-]+)\s*$/im);
  if (actionLine) return actionLine[1];

  return "";
}

export function evaluateModelOutput(text, allowedActions = DEFAULT_ALLOWED_ACTIONS) {
  const raw = String(text ?? "");
  if (/<Transaction>[\s\S]*?\[NONE\][\s\S]*?<\/Transaction>/i.test(raw)) {
    return {
      ok: true,
      candidate: "[NONE]",
      canonical: "[NONE]",
      aliasUsed: false,
      reason: "explicit refuse"
    };
  }
  const candidate = extractActionCandidate(text);
  if (!String(candidate ?? "").trim()) {
    return {
      ok: false,
      candidate: "",
      canonical: "",
      aliasUsed: false,
      reason: "unsupported or missing action"
    };
  }
  const canonical = normalizeAction(candidate);
  const allowed = Array.isArray(allowedActions) && allowedActions.length > 0 ? allowedActions : DEFAULT_ALLOWED_ACTIONS;
  const aliasUsed = candidate.trim().toLowerCase() !== canonical.trim().toLowerCase();
  const ok = Boolean(canonical) && allowed.includes(canonical);
  return {
    ok,
    candidate,
    canonical,
    aliasUsed,
    reason: ok
      ? aliasUsed
        ? "alias normalized"
        : "canonical action"
      : "unsupported or missing action"
  };
}

function requiredPayloadKeys(action, payload) {
  if (action === "move") return payload?.direction != null ? [] : ["direction"];
  if (action === "attack" || action === "heal") return payload?.targetId != null ? [] : ["targetId"];
  if (action === "transfer") {
    const miss = [];
    if (payload?.targetId == null) miss.push("targetId");
    if (payload?.amount == null) miss.push("amount");
    return miss;
  }
  if (action === "broadcast") {
    return payload?.message != null || payload?.content != null ? [] : ["message"];
  }
  if (action === "scout") {
    const miss = [];
    if (payload?.x == null) miss.push("x");
    if (payload?.y == null) miss.push("y");
    return miss;
  }
  if (action === "build") return payload?.structureType != null || payload?.kind != null ? [] : ["structureType"];
  if (action === "fund_structure") {
    const miss = [];
    if (payload?.x == null) miss.push("x");
    if (payload?.y == null) miss.push("y");
    if (payload?.amount == null) miss.push("amount");
    return miss;
  }
  if (action === "contribute_beacon") return payload?.amount == null ? ["amount"] : [];
  if (action === "register_shelter") return payload?.radius == null ? ["radius"] : [];
  return [];
}

export function evaluateCorpusJsonOutput(outputText, allowedActions = DEFAULT_ALLOWED_ACTIONS) {
  const output = String(outputText ?? "").trim();
  try {
    const parsed = JSON.parse(output);
    const canonical = normalizeAction(parsed?.action);
    const actionOk = allowedActions.includes(canonical);
    const payload = parsed?.payload ?? {};
    const payloadMissing = actionOk ? requiredPayloadKeys(canonical, payload) : [];
    const reason = String(parsed?.reason ?? "").trim();
    return {
      jsonOk: true,
      actionOk,
      canonicalAction: canonical,
      payloadOk: payloadMissing.length === 0,
      payloadMissing,
      reasonOk: reason.length >= 40 && reason.length <= 120
    };
  } catch (error) {
    return {
      jsonOk: false,
      actionOk: false,
      canonicalAction: "",
      payloadOk: false,
      payloadMissing: [],
      reasonOk: false,
      error: String(error?.message ?? error)
    };
  }
}

export function summarizeCorpusGate(entries, allowedActions = DEFAULT_ALLOWED_ACTIONS) {
  const rows = Array.isArray(entries) ? entries : [];
  let jsonOk = 0;
  let actionOk = 0;
  let payloadOk = 0;
  let reasonOk = 0;
  for (const row of rows) {
    const m = evaluateCorpusJsonOutput(row?.output, allowedActions);
    if (m.jsonOk) jsonOk += 1;
    if (m.actionOk) actionOk += 1;
    if (m.payloadOk) payloadOk += 1;
    if (m.reasonOk) reasonOk += 1;
  }
  const total = rows.length || 1;
  return {
    total: rows.length,
    json_parse_rate: jsonOk / total,
    action_hit_rate: actionOk / total,
    payload_valid_rate: payloadOk / total,
    reason_len_rate: reasonOk / total
  };
}

export function collectFailureSamples(entries, allowedActions = DEFAULT_ALLOWED_ACTIONS) {
  return (Array.isArray(entries) ? entries : [])
    .map((entry, index) => {
      const output = String(entry?.output ?? entry?.answer ?? entry?.response ?? "");
      const evaluation = evaluateModelOutput(output, allowedActions);
      return {
        index,
        input: entry?.instruction ?? entry?.input ?? null,
        output,
        ...evaluation
      };
    })
    .filter((row) => !row.ok);
}

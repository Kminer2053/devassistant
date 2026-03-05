import type { FastifyInstance } from "fastify";
import { db } from "../db.js";
import { errorToMessage } from "../errorMessage.js";
import { matchIntent } from "../intent.js";
import { executeBody } from "../schemas/index.js";
import { runPlan } from "./plan.js";
import { runBuild } from "./build.js";
import { getStatusPayload } from "./status.js";
import { getActivityPayload, doSessionReset, doSessionAbort } from "./opencode.js";
import { isPtyBackend } from "../pty/backend.js";
import { getStatusPayloadViaPty } from "../pty/statusActivityPty.js";
import { runHandoff } from "./handoff.js";
import { getDiffResponse } from "./diff.js";
import { runApply } from "./apply.js";

const HELP_MESSAGE =
  "DevBridge 명령: /plan(계획), /build(구현), /devstatus(상태), /activity(진행), /diff(변경), /handoff(전달), /devreset(세션 리셋), /abort(중단), /approvals(승인 대기), /project(프로젝트). 자연어로 요청해도 됩니다.";

/** channelKey가 default:unknown일 때, channel_context에 세션이 있는 채널 하나를 반환. (플러그인에서 channel 미전달 시 폴백) */
function resolveChannelKey(channelKey: string): string {
  if (channelKey !== "default:unknown") return channelKey;
  const row = db
    .prepare(
      "SELECT channel_key FROM channel_context WHERE opencode_session_id IS NOT NULL ORDER BY updated_at DESC LIMIT 1"
    )
    .get() as { channel_key: string } | undefined;
  return row?.channel_key ?? channelKey;
}

export async function executeRoutes(app: FastifyInstance) {
  /** 자연어 한 문장으로 의도 분류 후 해당 명령 실행. 플러그인 execute_natural_command에서 호출 */
  app.post<{ Body: unknown }>("/v1/execute", async (req, reply) => {
    const parsed = executeBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid body", details: parsed.error.flatten() });
    }
    const { naturalLanguage } = parsed.data;
    const channelKey = resolveChannelKey(parsed.data.channelKey);

    const intent = matchIntent(naturalLanguage);
    if (!intent) {
      return reply.status(400).send({
        error: "의도를 알 수 없습니다.",
        message: "계획, 구현, 상태, 진행, 변경, 전달, 리셋, 중단 등으로 말해 주세요.",
        hint: HELP_MESSAGE,
      });
    }

    try {
      switch (intent) {
        case "plan": {
          const result = await runPlan({ channelKey, text: naturalLanguage });
          if ("error" in result) return reply.status(502).send(result);
          return reply.send(result);
        }
        case "build": {
          const result = await runBuild({ channelKey, text: naturalLanguage });
          if ("error" in result) return reply.status(502).send(result);
          return reply.send(result);
        }
        case "handoff": {
          const result = await runHandoff({ channelKey, text: naturalLanguage });
          if ("error" in result) return reply.status(502).send(result);
          return reply.send(result);
        }
        case "status": {
          const payload = isPtyBackend()
            ? await getStatusPayloadViaPty(channelKey)
            : await getStatusPayload(channelKey);
          return reply.send(payload);
        }
        case "activity": {
          const payload = await getActivityPayload(channelKey);
          return reply.send(payload);
        }
        case "diff": {
          const result = await getDiffResponse(channelKey);
          if ("notFound" in result) return reply.status(404).send({ error: result.error });
          return reply.send(result);
        }
        case "session-reset": {
          const result = await doSessionReset(channelKey);
          return reply.send(result);
        }
        case "session-abort": {
          const result = await doSessionAbort(channelKey);
          if ("notFound" in result) return reply.status(404).send({ error: "No OpenCode session for this channel." });
          if ("error" in result) return reply.status(502).send({ error: result.error });
          return reply.send(result);
        }
        case "approvals":
        case "approve":
        case "deny": {
          const payload = isPtyBackend()
            ? await getStatusPayloadViaPty(channelKey)
            : await getStatusPayload(channelKey);
          if (intent === "approve" || intent === "deny") {
            return reply.send({
              ...payload,
              message: "승인/거절은 /approve 또는 /deny 명령으로 승인 ID를 지정해 주세요.",
            });
          }
          return reply.send(payload);
        }
        case "apply": {
          const lower = naturalLanguage.trim().toLowerCase();
          const mode = lower.includes("푸시") || lower.includes("push") ? "push" : lower.includes("pr") ? "pr" : "commit";
          const message = mode === "commit" ? naturalLanguage.trim().replace(/^(커밋|적용|apply|commit)\s*/i, "").trim() || undefined : undefined;
          const result = await runApply({ channelKey, mode, message });
          if ("error" in result) {
            const status = result.error === "No session for channel. Run /plan or /build first." ? 404 : 502;
            return reply.status(status).send(result);
          }
          return reply.send(result);
        }
        case "project": {
          const rows = db.prepare("SELECT * FROM projects ORDER BY id").all();
          return reply.send({ channelKey, projects: rows });
        }
        case "help": {
          return reply.send({ ok: true, message: HELP_MESSAGE });
        }
        default:
          return reply.status(400).send({
            error: "지원하지 않는 명령입니다.",
            intent,
            hint: HELP_MESSAGE,
          });
      }
    } catch (err) {
      const msg = errorToMessage(err);
      req.log.error({ err, channelKey, intent }, "execute: 실패");
      return reply.status(502).send({
        error: "실행 중 오류가 났습니다.",
        details: msg,
        intent,
      });
    }
  });
}

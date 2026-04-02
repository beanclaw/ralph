import { Injectable, Logger } from "@nestjs/common";
import { getTwilioConfig, type TwilioConfig } from "./twilio.config";

type VoiceActionPayload = {
  parentCallSid?: string;
  dialCallSid?: string;
  dialCallStatus?: string;
  dialCallDurationSeconds?: number;
  callerPhone?: string;
};

type SmsConversationTurn = {
  role: "lead" | "assistant";
  content: string;
};

type InboundSmsPayload = {
  messageSid?: string;
  fromPhone?: string;
  toPhone?: string;
  body?: string;
};

type RecoveryDecision = {
  shouldSendRecoverySms: boolean;
  outcome: "connected" | "missed" | "unknown";
  reason: string;
};

type VoiceActionResult = {
  shouldSendRecoverySms: boolean;
  dialOutcome: RecoveryDecision["outcome"];
  correlation: Record<string, string | number | boolean | null>;
};

@Injectable()
export class TwilioService {
  private readonly config: TwilioConfig;
  private readonly logger = new Logger(TwilioService.name);
  private readonly smsConversations = new Map<string, SmsConversationTurn[]>();

  constructor() {
    this.config = getTwilioConfig();
  }

  buildVoiceResponse(): string {
    const actionUrl = `${this.config.baseUrl}/twilio/voice-action`;

    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      "<Response>",
      `  <Dial action="${escapeXml(actionUrl)}" method="POST">${escapeXml(this.config.forwardToPhone)}</Dial>`,
      "</Response>"
    ].join("\n");
  }

  buildEmptyResponse(): string {
    return ['<?xml version="1.0" encoding="UTF-8"?>', "<Response />"].join("\n");
  }

  async handleVoiceAction(payload: VoiceActionPayload): Promise<VoiceActionResult> {
    const decision = this.getRecoveryDecision(payload);
    const correlation: VoiceActionResult["correlation"] = {
      parentCallSid: payload.parentCallSid ?? null,
      dialCallSid: payload.dialCallSid ?? null,
      dialCallStatus: payload.dialCallStatus ?? null,
      dialCallDurationSeconds: payload.dialCallDurationSeconds ?? 0,
      callerPhone: payload.callerPhone ?? null,
      forwardedToPhone: this.config.forwardToPhone,
      recoveryMessage: decision.shouldSendRecoverySms
        ? this.config.recoveryMessage
        : null,
      recoverySmsSent: false,
      recoverySmsSid: null,
      decision: decision.outcome,
      decisionReason: decision.reason
    };

    if (decision.shouldSendRecoverySms && payload.callerPhone) {
      const smsSid = await this.sendRecoverySms(payload.callerPhone);
      correlation.recoverySmsSent = true;
      correlation.recoverySmsSid = smsSid;
    }

    this.logger.log(JSON.stringify({ event: "twilio.voice-action", ...correlation }));

    return {
      shouldSendRecoverySms: decision.shouldSendRecoverySms,
      dialOutcome: decision.outcome,
      correlation
    };
  }

  async handleInboundSms(payload: InboundSmsPayload): Promise<string> {
    const fromPhone = payload.fromPhone?.trim();
    const inboundBody = payload.body?.trim();

    if (!fromPhone || !inboundBody) {
      this.logger.warn(
        JSON.stringify({
          event: "twilio.sms.invalid-payload",
          messageSid: payload.messageSid ?? null,
          fromPhone: fromPhone ?? null,
          hasBody: Boolean(inboundBody)
        })
      );

      return this.buildSmsResponse(
        "Thanks for reaching out. Please send your question again and we will follow up shortly."
      );
    }

    const conversation = this.smsConversations.get(fromPhone) ?? [];
    conversation.push({ role: "lead", content: inboundBody });

    const reply = await this.generateSmsReply(fromPhone, conversation);

    conversation.push({ role: "assistant", content: reply });
    this.smsConversations.set(fromPhone, conversation.slice(-10));

    this.logger.log(
      JSON.stringify({
        event: "twilio.sms.inbound",
        messageSid: payload.messageSid ?? null,
        fromPhone,
        toPhone: payload.toPhone ?? null,
        conversationTurnCount: this.smsConversations.get(fromPhone)?.length ?? 0
      })
    );

    return this.buildSmsResponse(reply);
  }

  buildSmsResponse(message: string): string {
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      "<Response>",
      `  <Message>${escapeXml(message)}</Message>`,
      "</Response>"
    ].join("\n");
  }

  private getRecoveryDecision(payload: VoiceActionPayload): RecoveryDecision {
    const status = payload.dialCallStatus?.trim().toLowerCase();
    const duration = payload.dialCallDurationSeconds ?? 0;

    if (status === "completed" || duration > 0) {
      return {
        shouldSendRecoverySms: false,
        outcome: "connected",
        reason: status === "completed" ? "dial-call-completed" : "dial-call-duration"
      };
    }

    if (status && ["busy", "no-answer", "failed", "canceled"].includes(status)) {
      return {
        shouldSendRecoverySms: true,
        outcome: "missed",
        reason: `dial-call-${status}`
      };
    }

    if (!status) {
      return {
        shouldSendRecoverySms: true,
        outcome: "missed",
        reason: "dial-call-status-missing"
      };
    }

    return {
      shouldSendRecoverySms: false,
      outcome: "unknown",
      reason: `dial-call-${status}`
    };
  }

  private async sendRecoverySms(toPhoneNumber: string): Promise<string> {
    const smsApiUrl = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(this.config.accountSid)}/Messages.json`;
    const authHeader = Buffer.from(
      `${this.config.accountSid}:${this.config.authToken}`
    ).toString("base64");

    const response = await fetch(smsApiUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${authHeader}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        To: toPhoneNumber,
        From: this.config.twilioPhoneNumber,
        Body: this.config.recoveryMessage
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Twilio SMS request failed with status ${response.status}: ${errorBody}`
      );
    }

    const payload = (await response.json()) as { sid?: string };

    if (!payload.sid) {
      throw new Error("Twilio SMS response did not include a message sid");
    }

    return payload.sid;
  }

  private async generateSmsReply(
    leadPhone: string,
    conversation: SmsConversationTurn[]
  ): Promise<string> {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.openAiApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.config.openAiModel,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: `${this.config.smsSystemPrompt} The lead phone number is ${leadPhone}.`
              }
            ]
          },
          ...conversation.map((turn) => ({
            role: turn.role === "assistant" ? "assistant" : "user",
            content: [{ type: "input_text", text: turn.content }]
          }))
        ]
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `OpenAI Responses API request failed with status ${response.status}: ${errorBody}`
      );
    }

    const payload = (await response.json()) as {
      output_text?: string;
      output?: Array<{
        content?: Array<{
          type?: string;
          text?: string;
        }>;
      }>;
    };
    const outputText =
      payload.output_text?.trim() ??
      payload.output
        ?.flatMap((item) => item.content ?? [])
        .filter((item) => item.type === "output_text" && typeof item.text === "string")
        .map((item) => item.text?.trim() ?? "")
        .join("\n")
        .trim();

    if (!outputText) {
      throw new Error("OpenAI Responses API returned an empty SMS reply");
    }

    return outputText;
  }
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("'", "&apos;");
}

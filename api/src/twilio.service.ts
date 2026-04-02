import { Inject, Injectable, Logger } from "@nestjs/common";
import { getTwilioConfig, type TwilioConfig } from "./twilio.config";
import {
  type InboundSmsPersistencePayload,
  type LeadIdentity,
  type SmsConversationTurn,
  TWILIO_LEAD_REPOSITORY,
  type TwilioLeadRepository,
  type VoiceActionPersistencePayload
} from "./twilio.repository";

type VoiceActionPayload = {
  parentCallSid?: string;
  dialCallSid?: string;
  dialCallStatus?: string;
  dialCallDurationSeconds?: number;
  callerPhone?: string;
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

  constructor(
    @Inject(TWILIO_LEAD_REPOSITORY)
    private readonly leadRepository: TwilioLeadRepository
  ) {
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
    const leadIdentity = this.buildLeadIdentity(
      payload.callerPhone,
      payload.parentCallSid ?? payload.dialCallSid
    );
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

    await this.persistVoiceAction(leadIdentity, {
      parentCallSid: payload.parentCallSid,
      dialCallSid: payload.dialCallSid,
      dialCallStatus: payload.dialCallStatus,
      dialCallDurationSeconds: payload.dialCallDurationSeconds,
      dialOutcome: decision.outcome,
      decisionReason: decision.reason,
      forwardedToPhone: this.config.forwardToPhone,
      recoveryMessage: decision.shouldSendRecoverySms
        ? this.config.recoveryMessage
        : undefined,
      recoverySmsSent: Boolean(correlation.recoverySmsSent),
      recoverySmsSid:
        typeof correlation.recoverySmsSid === "string"
          ? correlation.recoverySmsSid
          : undefined
    });

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

    const leadIdentity = this.buildLeadIdentity(fromPhone, payload.messageSid);
    const conversation = await this.getConversation(leadIdentity);
    const leadTurn: SmsConversationTurn = { role: "lead", content: inboundBody };
    const leadConversation: SmsConversationTurn[] = [
      ...conversation,
      leadTurn
    ];

    const reply = await this.generateSmsReply(fromPhone, leadConversation);
    const assistantTurn: SmsConversationTurn = {
      role: "assistant",
      content: reply
    };

    const updatedConversation = leadConversation.concat(assistantTurn).slice(-10);

    await this.persistInboundSms(leadIdentity, {
      messageSid: payload.messageSid,
      fromPhone,
      toPhone: payload.toPhone,
      inboundBody,
      replyBody: reply,
      conversation: updatedConversation
    });

    this.logger.log(
      JSON.stringify({
        event: "twilio.sms.inbound",
        messageSid: payload.messageSid ?? null,
        fromPhone,
        toPhone: payload.toPhone ?? null,
        conversationTurnCount: updatedConversation.length
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

  private buildLeadIdentity(phone?: string, fallbackId?: string): LeadIdentity {
    const normalizedPhone = phone?.trim();

    if (normalizedPhone) {
      return {
        leadKey: `phone:${normalizedPhone}`,
        phone: normalizedPhone
      };
    }

    return {
      leadKey: `unknown:${fallbackId ?? "twilio-lead"}`
    };
  }

  private async getConversation(
    identity: LeadIdentity
  ): Promise<SmsConversationTurn[]> {
    try {
      return await this.leadRepository.getConversation(identity);
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: "twilio.persistence.conversation-load-failed",
          leadKey: identity.leadKey,
          error: getErrorMessage(error)
        })
      );

      return [];
    }
  }

  private async persistVoiceAction(
    identity: LeadIdentity,
    payload: VoiceActionPersistencePayload
  ): Promise<void> {
    try {
      await this.leadRepository.recordVoiceAction(identity, payload);
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: "twilio.persistence.voice-action-failed",
          leadKey: identity.leadKey,
          error: getErrorMessage(error)
        })
      );
    }
  }

  private async persistInboundSms(
    identity: LeadIdentity,
    payload: InboundSmsPersistencePayload
  ): Promise<void> {
    try {
      await this.leadRepository.saveConversation(identity, payload.conversation);
      await this.leadRepository.recordInboundSms(identity, payload);
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: "twilio.persistence.sms-failed",
          leadKey: identity.leadKey,
          error: getErrorMessage(error)
        })
      );
    }
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

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

import { Injectable, Logger } from "@nestjs/common";
import { getTwilioConfig, type TwilioConfig } from "./twilio.config";

type VoiceActionPayload = {
  parentCallSid?: string;
  dialCallSid?: string;
  dialCallStatus?: string;
  dialCallDurationSeconds?: number;
  callerPhone?: string;
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
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("'", "&apos;");
}

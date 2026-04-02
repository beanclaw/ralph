import { Injectable } from "@nestjs/common";
import { getTwilioVoiceConfig, type TwilioVoiceConfig } from "./twilio.config";

@Injectable()
export class TwilioService {
  private readonly config: TwilioVoiceConfig;

  constructor() {
    this.config = getTwilioVoiceConfig();
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
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("'", "&apos;");
}

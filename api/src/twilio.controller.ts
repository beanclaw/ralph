import { Body, Controller, Header, Post } from "@nestjs/common";
import {
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiTags
} from "@nestjs/swagger";
import { TwilioService } from "./twilio.service";

type TwilioVoiceWebhookBody = {
  CallSid?: string;
  From?: string;
  To?: string;
};

type TwilioVoiceActionWebhookBody = {
  CallSid?: string;
  DialCallSid?: string;
  DialCallStatus?: string;
  DialCallDuration?: string;
  From?: string;
  To?: string;
};

@ApiTags("twilio")
@Controller("twilio")
export class TwilioController {
  constructor(private readonly twilioService: TwilioService) {}

  @Post("voice")
  @Header("Content-Type", "text/xml")
  @ApiOperation({
    summary: "Handle inbound Twilio voice webhooks and return dialing TwiML"
  })
  @ApiConsumes("application/x-www-form-urlencoded")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        CallSid: { type: "string", example: "CA1234567890abcdef" },
        From: { type: "string", example: "+15551234567" },
        To: { type: "string", example: "+15557654321" }
      }
    }
  })
  @ApiOkResponse({
    schema: {
      type: "string",
      example:
        '<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Dial action="https://api.example.com/twilio/voice-action" method="POST">+15551234567</Dial>\n</Response>'
    }
  })
  handleVoiceWebhook(@Body() _body: TwilioVoiceWebhookBody): string {
    return this.twilioService.buildVoiceResponse();
  }

  @Post("voice-action")
  @Header("Content-Type", "text/xml")
  @ApiOperation({
    summary: "Handle Twilio dial callbacks and trigger missed-call recovery SMS"
  })
  @ApiConsumes("application/x-www-form-urlencoded")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        CallSid: { type: "string", example: "CA1234567890abcdef" },
        DialCallSid: { type: "string", example: "CAabcdef1234567890" },
        DialCallStatus: { type: "string", example: "no-answer" },
        DialCallDuration: { type: "string", example: "0" },
        From: { type: "string", example: "+15551234567" },
        To: { type: "string", example: "+15557654321" }
      }
    }
  })
  @ApiOkResponse({
    schema: {
      type: "string",
      example: '<?xml version="1.0" encoding="UTF-8"?>\n<Response />'
    }
  })
  async handleVoiceActionWebhook(
    @Body() body: TwilioVoiceActionWebhookBody
  ): Promise<string> {
    await this.twilioService.handleVoiceAction({
      parentCallSid: body.CallSid,
      dialCallSid: body.DialCallSid,
      dialCallStatus: body.DialCallStatus,
      dialCallDurationSeconds: Number.parseInt(body.DialCallDuration ?? "0", 10) || 0,
      callerPhone: body.From
    });

    return this.twilioService.buildEmptyResponse();
  }
}

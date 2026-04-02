import { InMemoryLeadRepository } from "./twilio.repository";
import { TwilioService } from "./twilio.service";

const ORIGINAL_ENV = process.env;
const ORIGINAL_FETCH = global.fetch;

describe("TwilioService", () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...ORIGINAL_ENV,
      PUBLIC_BASE_URL: "https://api.example.com",
      FORWARD_TO_PHONE: "+15557654321",
      TWILIO_ACCOUNT_SID: "AC123",
      TWILIO_AUTH_TOKEN: "secret",
      TWILIO_PHONE_NUMBER: "+15551230000",
      TWILIO_RECOVERY_MESSAGE: "Sorry we missed your call. How can we help?",
      OPENAI_API_KEY: "test-openai-key",
      OPENAI_MODEL: "gpt-4.1-mini",
      TWILIO_SMS_SYSTEM_PROMPT: "Be concise."
    };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    global.fetch = ORIGINAL_FETCH;
    jest.restoreAllMocks();
  });

  it("builds voice TwiML that forwards to the configured number and callback", () => {
    const service = createService();

    expect(service.buildVoiceResponse()).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        "<Response>",
        '  <Dial action="https://api.example.com/twilio/voice-action" method="POST">+15557654321</Dial>',
        "</Response>"
      ].join("\n")
    );
  });

  it("does not send a recovery SMS for connected calls", async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as typeof fetch;
    const service = createService();

    const result = await service.handleVoiceAction({
      parentCallSid: "CA-parent",
      dialCallSid: "CA-dial",
      dialCallStatus: "completed",
      dialCallDurationSeconds: 42,
      callerPhone: "+15550001111"
    });

    expect(result.shouldSendRecoverySms).toBe(false);
    expect(result.dialOutcome).toBe("connected");
    expect(result.correlation.decisionReason).toBe("dial-call-completed");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends a recovery SMS for missed calls and records the sid", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sid: "SM123" })
    });
    global.fetch = fetchMock as typeof fetch;
    const service = createService();

    const result = await service.handleVoiceAction({
      parentCallSid: "CA-parent",
      dialCallSid: "CA-dial",
      dialCallStatus: "no-answer",
      dialCallDurationSeconds: 0,
      callerPhone: "+15550002222"
    });

    expect(result.shouldSendRecoverySms).toBe(true);
    expect(result.dialOutcome).toBe("missed");
    expect(result.correlation.recoverySmsSent).toBe(true);
    expect(result.correlation.recoverySmsSid).toBe("SM123");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Basic /),
          "Content-Type": "application/x-www-form-urlencoded"
        }),
        body: expect.any(URLSearchParams)
      })
    );
  });

  it("returns an AI-generated SMS TwiML reply and persists conversation context", async () => {
    const repository = new InMemoryLeadRepository();
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ output_text: "We can help with pricing." })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ output_text: "Tomorrow afternoon works well." })
      });
    global.fetch = fetchMock as typeof fetch;
    const service = createService(repository);

    const firstReply = await service.handleInboundSms({
      messageSid: "SM-in-1",
      fromPhone: "+15550003333",
      toPhone: "+15551230000",
      body: "Can you send pricing?"
    });
    const secondReply = await service.handleInboundSms({
      messageSid: "SM-in-2",
      fromPhone: "+15550003333",
      toPhone: "+15551230000",
      body: "Do you have anything tomorrow?"
    });

    expect(firstReply).toContain("<Message>We can help with pricing.</Message>");
    expect(secondReply).toContain("<Message>Tomorrow afternoon works well.</Message>");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const secondRequest = fetchMock.mock.calls[1]?.[1] as RequestInit;
    const parsedBody = JSON.parse(String(secondRequest.body)) as {
      input: Array<{ role: string; content: Array<{ text: string }> }>;
    };

    expect(parsedBody.input).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "user",
          content: [{ type: "input_text", text: "Can you send pricing?" }]
        }),
        expect.objectContaining({
          role: "assistant",
          content: [{ type: "input_text", text: "We can help with pricing." }]
        }),
        expect.objectContaining({
          role: "user",
          content: [{ type: "input_text", text: "Do you have anything tomorrow?" }]
        })
      ])
    );

    await expect(
      repository.getConversation({
        leadKey: "phone:+15550003333",
        phone: "+15550003333"
      })
    ).resolves.toEqual([
      { role: "lead", content: "Can you send pricing?" },
      { role: "assistant", content: "We can help with pricing." },
      { role: "lead", content: "Do you have anything tomorrow?" },
      { role: "assistant", content: "Tomorrow afternoon works well." }
    ]);
  });
});

function createService(repository = new InMemoryLeadRepository()): TwilioService {
  return new TwilioService(repository);
}

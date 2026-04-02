export type TwilioConfig = {
  baseUrl: string;
  forwardToPhone: string;
  accountSid: string;
  authToken: string;
  twilioPhoneNumber: string;
  recoveryMessage: string;
  openAiApiKey: string;
  openAiModel: string;
  smsSystemPrompt: string;
  airtable?: {
    apiKey: string;
    baseId: string;
    tableName: string;
  };
};

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function normalizeBaseUrl(value: string): string {
  try {
    return new URL(value).toString().replace(/\/$/, "");
  } catch {
    throw new Error("PUBLIC_BASE_URL must be a valid absolute URL");
  }
}

function normalizePhoneNumber(value: string, envName: string): string {
  const sanitized = value.replace(/\s+/g, "");

  if (!/^\+?[1-9]\d{6,14}$/.test(sanitized)) {
    throw new Error(`${envName} must be a valid E.164-style phone number`);
  }

  return sanitized.startsWith("+") ? sanitized : `+${sanitized}`;
}

export function getTwilioConfig(): TwilioConfig {
  const airtableApiKey = process.env.AIRTABLE_API_KEY?.trim();
  const airtableBaseId = process.env.AIRTABLE_BASE_ID?.trim();
  const airtableTableName = process.env.AIRTABLE_TABLE_NAME?.trim();
  const airtableValues = [
    airtableApiKey,
    airtableBaseId,
    airtableTableName
  ].filter(Boolean);

  if (airtableValues.length > 0 && airtableValues.length < 3) {
    throw new Error(
      "AIRTABLE_API_KEY, AIRTABLE_BASE_ID, and AIRTABLE_TABLE_NAME must all be set together"
    );
  }

  return {
    baseUrl: normalizeBaseUrl(requireEnv("PUBLIC_BASE_URL")),
    forwardToPhone: normalizePhoneNumber(
      requireEnv("FORWARD_TO_PHONE"),
      "FORWARD_TO_PHONE"
    ),
    accountSid: requireEnv("TWILIO_ACCOUNT_SID"),
    authToken: requireEnv("TWILIO_AUTH_TOKEN"),
    twilioPhoneNumber: normalizePhoneNumber(
      requireEnv("TWILIO_PHONE_NUMBER"),
      "TWILIO_PHONE_NUMBER"
    ),
    recoveryMessage: requireEnv("TWILIO_RECOVERY_MESSAGE"),
    openAiApiKey: requireEnv("OPENAI_API_KEY"),
    openAiModel: process.env.OPENAI_MODEL?.trim() || "gpt-4.1-mini",
    smsSystemPrompt:
      process.env.TWILIO_SMS_SYSTEM_PROMPT?.trim() ||
      [
        "You are an SMS assistant for a business following up on missed calls.",
        "Keep responses concise, friendly, and action-oriented.",
        "Acknowledge the caller's message, answer with the available context,",
        "and suggest a clear next step when appropriate."
      ].join(" "),
    airtable:
      airtableValues.length === 3
        ? {
            apiKey: airtableApiKey as string,
            baseId: airtableBaseId as string,
            tableName: airtableTableName as string
          }
        : undefined
  };
}

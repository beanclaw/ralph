export type TwilioConfig = {
  baseUrl: string;
  forwardToPhone: string;
  accountSid: string;
  authToken: string;
  twilioPhoneNumber: string;
  recoveryMessage: string;
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
    recoveryMessage: requireEnv("TWILIO_RECOVERY_MESSAGE")
  };
}

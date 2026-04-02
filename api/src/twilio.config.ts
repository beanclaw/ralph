export type TwilioVoiceConfig = {
  baseUrl: string;
  forwardToPhone: string;
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

function normalizePhoneNumber(value: string): string {
  const sanitized = value.replace(/\s+/g, "");

  if (!/^\+?[1-9]\d{6,14}$/.test(sanitized)) {
    throw new Error("FORWARD_TO_PHONE must be a valid E.164-style phone number");
  }

  return sanitized.startsWith("+") ? sanitized : `+${sanitized}`;
}

export function getTwilioVoiceConfig(): TwilioVoiceConfig {
  return {
    baseUrl: normalizeBaseUrl(requireEnv("PUBLIC_BASE_URL")),
    forwardToPhone: normalizePhoneNumber(requireEnv("FORWARD_TO_PHONE"))
  };
}

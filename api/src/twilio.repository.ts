import { Logger } from "@nestjs/common";

export const TWILIO_LEAD_REPOSITORY = "TWILIO_LEAD_REPOSITORY";

export type SmsConversationTurn = {
  role: "lead" | "assistant";
  content: string;
};

export type LeadIdentity = {
  leadKey: string;
  phone?: string;
};

export type VoiceActionPersistencePayload = {
  parentCallSid?: string;
  dialCallSid?: string;
  dialCallStatus?: string;
  dialCallDurationSeconds?: number;
  dialOutcome: "connected" | "missed" | "unknown";
  decisionReason: string;
  forwardedToPhone: string;
  recoveryMessage?: string;
  recoverySmsSent: boolean;
  recoverySmsSid?: string;
};

export type InboundSmsPersistencePayload = {
  messageSid?: string;
  fromPhone?: string;
  toPhone?: string;
  inboundBody: string;
  replyBody: string;
  conversation: SmsConversationTurn[];
};

export interface TwilioLeadRepository {
  getConversation(identity: LeadIdentity): Promise<SmsConversationTurn[]>;
  saveConversation(
    identity: LeadIdentity,
    conversation: SmsConversationTurn[]
  ): Promise<void>;
  recordVoiceAction(
    identity: LeadIdentity,
    payload: VoiceActionPersistencePayload
  ): Promise<void>;
  recordInboundSms(
    identity: LeadIdentity,
    payload: InboundSmsPersistencePayload
  ): Promise<void>;
}

type AirtableConfig = {
  apiKey: string;
  baseId: string;
  tableName: string;
};

type AirtableRecord = {
  id: string;
  fields?: Record<string, unknown>;
};

export class InMemoryLeadRepository implements TwilioLeadRepository {
  private readonly leads = new Map<
    string,
    {
      phone?: string;
      conversation: SmsConversationTurn[];
      voiceEvents: VoiceActionPersistencePayload[];
      smsEvents: InboundSmsPersistencePayload[];
    }
  >();

  async getConversation(identity: LeadIdentity): Promise<SmsConversationTurn[]> {
    return this.leads.get(identity.leadKey)?.conversation ?? [];
  }

  async saveConversation(
    identity: LeadIdentity,
    conversation: SmsConversationTurn[]
  ): Promise<void> {
    const current = this.leads.get(identity.leadKey);

    this.leads.set(identity.leadKey, {
      phone: identity.phone ?? current?.phone,
      conversation,
      voiceEvents: current?.voiceEvents ?? [],
      smsEvents: current?.smsEvents ?? []
    });
  }

  async recordVoiceAction(
    identity: LeadIdentity,
    payload: VoiceActionPersistencePayload
  ): Promise<void> {
    const current = this.leads.get(identity.leadKey);

    this.leads.set(identity.leadKey, {
      phone: identity.phone ?? current?.phone,
      conversation: current?.conversation ?? [],
      voiceEvents: [...(current?.voiceEvents ?? []), payload],
      smsEvents: current?.smsEvents ?? []
    });
  }

  async recordInboundSms(
    identity: LeadIdentity,
    payload: InboundSmsPersistencePayload
  ): Promise<void> {
    const current = this.leads.get(identity.leadKey);

    this.leads.set(identity.leadKey, {
      phone: identity.phone ?? current?.phone,
      conversation: payload.conversation,
      voiceEvents: current?.voiceEvents ?? [],
      smsEvents: [...(current?.smsEvents ?? []), payload]
    });
  }
}

export class AirtableLeadRepository implements TwilioLeadRepository {
  private readonly logger = new Logger(AirtableLeadRepository.name);

  constructor(private readonly config: AirtableConfig) {}

  async getConversation(identity: LeadIdentity): Promise<SmsConversationTurn[]> {
    const record = await this.getRecord(identity.leadKey);
    const rawConversation = record?.fields?.ConversationJson;

    if (typeof rawConversation !== "string" || !rawConversation.trim()) {
      return [];
    }

    try {
      const parsed = JSON.parse(rawConversation) as SmsConversationTurn[];

      return Array.isArray(parsed)
        ? parsed.filter(
            (turn) =>
              turn &&
              (turn.role === "lead" || turn.role === "assistant") &&
              typeof turn.content === "string"
          )
        : [];
    } catch {
      this.logger.warn(
        JSON.stringify({
          event: "airtable.conversation.parse-failed",
          leadKey: identity.leadKey
        })
      );

      return [];
    }
  }

  async saveConversation(
    identity: LeadIdentity,
    conversation: SmsConversationTurn[]
  ): Promise<void> {
    await this.upsertRecord(identity, (fields) => ({
      ...fields,
      ConversationJson: JSON.stringify(conversation),
      LastActivityAt: new Date().toISOString()
    }));
  }

  async recordVoiceAction(
    identity: LeadIdentity,
    payload: VoiceActionPersistencePayload
  ): Promise<void> {
    await this.upsertRecord(identity, (fields) => ({
      ...fields,
      LastActivityAt: new Date().toISOString(),
      LastCallSid: payload.parentCallSid ?? "",
      LastDialCallSid: payload.dialCallSid ?? "",
      LastDialCallStatus: payload.dialCallStatus ?? "",
      LastDialCallDurationSeconds: payload.dialCallDurationSeconds ?? 0,
      LastDialOutcome: payload.dialOutcome,
      LastDecisionReason: payload.decisionReason,
      LastForwardedToPhone: payload.forwardedToPhone,
      LastRecoveryMessage: payload.recoveryMessage ?? "",
      LastRecoverySmsSent: payload.recoverySmsSent,
      LastRecoverySmsSid: payload.recoverySmsSid ?? "",
      EventLog: appendEventLog(fields.EventLog, {
        type: "voice-action",
        occurredAt: new Date().toISOString(),
        ...payload
      })
    }));
  }

  async recordInboundSms(
    identity: LeadIdentity,
    payload: InboundSmsPersistencePayload
  ): Promise<void> {
    await this.upsertRecord(identity, (fields) => ({
      ...fields,
      LastActivityAt: new Date().toISOString(),
      LastInboundMessageSid: payload.messageSid ?? "",
      LastInboundPhone: payload.fromPhone ?? "",
      LastInboundBody: payload.inboundBody,
      LastOutboundReply: payload.replyBody,
      ConversationJson: JSON.stringify(payload.conversation),
      EventLog: appendEventLog(fields.EventLog, {
        type: "inbound-sms",
        occurredAt: new Date().toISOString(),
        messageSid: payload.messageSid ?? null,
        fromPhone: payload.fromPhone ?? null,
        toPhone: payload.toPhone ?? null
      })
    }));
  }

  private async upsertRecord(
    identity: LeadIdentity,
    mutate: (fields: Record<string, unknown>) => Record<string, unknown>
  ): Promise<void> {
    const record = await this.getRecord(identity.leadKey);
    const baseFields = {
      ...(record?.fields ?? {}),
      LeadKey: identity.leadKey,
      Phone: identity.phone ?? record?.fields?.Phone ?? ""
    };
    const fields = mutate(baseFields);

    if (record) {
      await this.patchRecord(record.id, fields);
      return;
    }

    await this.createRecord(fields);
  }

  private async getRecord(leadKey: string): Promise<AirtableRecord | null> {
    const searchParams = new URLSearchParams({
      maxRecords: "1",
      filterByFormula: `{LeadKey} = '${escapeAirtableFormulaValue(leadKey)}'`
    });
    const response = await fetch(`${this.getApiBaseUrl()}?${searchParams.toString()}`, {
      headers: this.getHeaders()
    });

    if (!response.ok) {
      throw new Error(
        `Airtable record lookup failed with status ${response.status}: ${await response.text()}`
      );
    }

    const payload = (await response.json()) as { records?: AirtableRecord[] };
    return payload.records?.[0] ?? null;
  }

  private async createRecord(fields: Record<string, unknown>): Promise<void> {
    const response = await fetch(this.getApiBaseUrl(), {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({ fields })
    });

    if (!response.ok) {
      throw new Error(
        `Airtable record creation failed with status ${response.status}: ${await response.text()}`
      );
    }
  }

  private async patchRecord(
    recordId: string,
    fields: Record<string, unknown>
  ): Promise<void> {
    const response = await fetch(`${this.getApiBaseUrl()}/${encodeURIComponent(recordId)}`, {
      method: "PATCH",
      headers: this.getHeaders(),
      body: JSON.stringify({ fields })
    });

    if (!response.ok) {
      throw new Error(
        `Airtable record update failed with status ${response.status}: ${await response.text()}`
      );
    }
  }

  private getApiBaseUrl(): string {
    return `https://api.airtable.com/v0/${encodeURIComponent(this.config.baseId)}/${encodeURIComponent(this.config.tableName)}`;
  }

  private getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.apiKey}`,
      "Content-Type": "application/json"
    };
  }
}

function appendEventLog(existingValue: unknown, event: Record<string, unknown>): string {
  const lines =
    typeof existingValue === "string" && existingValue.trim()
      ? existingValue.trimEnd().split("\n")
      : [];

  lines.push(JSON.stringify(event));

  return lines.slice(-25).join("\n");
}

function escapeAirtableFormulaValue(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

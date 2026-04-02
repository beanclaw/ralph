# Lead Recovery Lab API

NestJS API for a missed-call recovery workflow built around Twilio voice webhooks, Twilio SMS, OpenAI-generated SMS replies, and optional Airtable persistence.

## Flow Overview

1. `POST /twilio/voice` returns TwiML that dials `FORWARD_TO_PHONE` and registers `POST /twilio/voice-action` as the Twilio `<Dial>` callback.
2. `POST /twilio/voice-action` decides whether the call was connected or missed.
3. Missed calls trigger an outbound recovery SMS from `TWILIO_PHONE_NUMBER`.
4. `POST /twilio/sms` accepts inbound SMS replies and returns TwiML with an AI-generated response.
5. Lead conversation state and recovery events are stored behind a repository boundary, with Airtable used when configured and an in-memory fallback otherwise.

## Project Structure

- `api/src/twilio.controller.ts`: Twilio webhook endpoints and webhook-body parsing.
- `api/src/twilio.service.ts`: TwiML generation, missed-call decisioning, recovery SMS delivery, and OpenAI SMS orchestration.
- `api/src/twilio.repository.ts`: lead persistence contract plus Airtable and in-memory implementations.
- `api/src/twilio.config.ts`: startup-time environment validation and normalization.

## Required Environment Variables

Set these before starting the API or running tests that exercise the Twilio service:

| Variable | Required | Purpose |
| --- | --- | --- |
| `PUBLIC_BASE_URL` | Yes | Absolute public base URL used to generate the `/twilio/voice-action` callback URL. |
| `FORWARD_TO_PHONE` | Yes | Business phone number Twilio should dial, normalized to E.164-style format. |
| `TWILIO_ACCOUNT_SID` | Yes | Account SID used for outbound recovery SMS requests. |
| `TWILIO_AUTH_TOKEN` | Yes | Auth token paired with the Twilio account SID. |
| `TWILIO_PHONE_NUMBER` | Yes | Twilio SMS-enabled sender number for recovery messages. |
| `TWILIO_RECOVERY_MESSAGE` | Yes | SMS body sent when a missed call qualifies for recovery. |
| `OPENAI_API_KEY` | Yes | API key for generating SMS replies through the OpenAI Responses API. |
| `OPENAI_MODEL` | No | OpenAI model for SMS replies. Defaults to `gpt-4.1-mini`. |
| `TWILIO_SMS_SYSTEM_PROMPT` | No | System prompt appended ahead of the SMS thread when generating a reply. |
| `AIRTABLE_API_KEY` | Optional, all-or-nothing | Airtable personal access token or API key. |
| `AIRTABLE_BASE_ID` | Optional, all-or-nothing | Airtable base id used for lead persistence. |
| `AIRTABLE_TABLE_NAME` | Optional, all-or-nothing | Airtable table name used for lead persistence. |
| `PORT` | No | Nest listen port. Defaults to `3000`. |

If any Airtable variable is set, all three Airtable variables must be set together.

## Airtable Schema Expectations

When Airtable persistence is enabled, the repository upserts records keyed by `LeadKey` and writes these fields when present:

- `LeadKey`
- `Phone`
- `ConversationJson`
- `LastActivityAt`
- `LastCallSid`
- `LastDialCallSid`
- `LastDialCallStatus`
- `LastDialCallDurationSeconds`
- `LastDialOutcome`
- `LastDecisionReason`
- `LastForwardedToPhone`
- `LastRecoveryMessage`
- `LastRecoverySmsSent`
- `LastRecoverySmsSid`
- `LastInboundMessageSid`
- `LastInboundPhone`
- `LastInboundBody`
- `LastOutboundReply`
- `EventLog`

## Local Setup

```bash
cd api
npm ci
npm run build
npm test
```

To run the server locally after setting env vars:

```bash
cd api
npm run start:dev
```

Twilio should be configured to send:

- Voice webhook to `POST {PUBLIC_BASE_URL}/twilio/voice`
- SMS webhook to `POST {PUBLIC_BASE_URL}/twilio/sms`

## Test Coverage

The automated tests live in `api/src/twilio.service.spec.ts` and cover:

- TwiML generation for the inbound voice webhook.
- Missed-call decisioning for connected and missed dial outcomes.
- Recovery SMS delivery without live Twilio credentials by mocking `fetch`.
- Inbound SMS handling with multi-turn conversation context preserved across replies.

## Implementation Notes

- Twilio webhook handlers are intentionally thin; most behavior lives in `TwilioService` so the core flow can be unit tested without booting Nest.
- Persistence is isolated behind `TwilioLeadRepository`, which keeps webhook logic testable and allows Airtable failures to degrade into logged errors instead of broken Twilio responses.
- `express.urlencoded({ extended: false })` must stay registered in bootstrap because Twilio posts webhook payloads as `application/x-www-form-urlencoded`.

## Open Assumptions

The repo snapshot references `twilio.md`, but that file is not present here. These implementation choices are documented explicitly until a more detailed product spec exists:

- Missed-call recovery currently triggers for Twilio dial statuses `busy`, `no-answer`, `failed`, `canceled`, or when `DialCallStatus` is missing.
- Unknown statuses do not trigger a recovery SMS.
- SMS conversation context is limited to the latest 10 turns per lead.
- Airtable persistence assumes the field names listed above already exist in the target table.

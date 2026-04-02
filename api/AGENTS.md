# API Patterns

- Validate required webhook environment variables in a dedicated config helper and let Nest providers fail fast during construction when config is invalid.
- Keep Twilio webhook controllers thin; generate TwiML and callback URLs in services so later SMS and persistence logic can reuse the same boundaries.
- Twilio webhooks arrive as `application/x-www-form-urlencoded`; register `express.urlencoded({ extended: false })` during Nest bootstrap before relying on `@Body()` data.
- Preserve per-lead SMS conversation state behind the service boundary keyed by normalized sender phone numbers, so webhook controllers remain stateless and persistence can replace the in-memory store later.
- Keep Twilio lead persistence behind a repository token; use `phone:<E164>` as the primary lead key and fall back to a deterministic `unknown:<sid>` key when a caller number is missing.
- Treat Airtable as optional infrastructure: require `AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID`, and `AIRTABLE_TABLE_NAME` together, and swallow write failures with structured logs so webhooks still return TwiML.

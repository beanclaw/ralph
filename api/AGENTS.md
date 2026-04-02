# API Patterns

- Validate required webhook environment variables in a dedicated config helper and let Nest providers fail fast during construction when config is invalid.
- Keep Twilio webhook controllers thin; generate TwiML and callback URLs in services so later SMS and persistence logic can reuse the same boundaries.
- Twilio webhooks arrive as `application/x-www-form-urlencoded`; register `express.urlencoded({ extended: false })` during Nest bootstrap before relying on `@Body()` data.
- Preserve per-lead SMS conversation state behind the service boundary keyed by normalized sender phone numbers, so webhook controllers remain stateless and persistence can replace the in-memory store later.

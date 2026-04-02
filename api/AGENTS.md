# API Patterns

- Validate required webhook environment variables in a dedicated config helper and let Nest providers fail fast during construction when config is invalid.
- Keep Twilio webhook controllers thin; generate TwiML and callback URLs in services so later SMS and persistence logic can reuse the same boundaries.
- Twilio webhooks arrive as `application/x-www-form-urlencoded`; register `express.urlencoded({ extended: false })` during Nest bootstrap before relying on `@Body()` data.

# API Patterns

- Validate required webhook environment variables in a dedicated config helper and let Nest providers fail fast during construction when config is invalid.
- Keep Twilio webhook controllers thin; generate TwiML and callback URLs in services so later SMS and persistence logic can reuse the same boundaries.

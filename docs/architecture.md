# Thessa WhatsApp Bot Architecture

## Current shape

The app is a modular Express service:

- `controllers/messages.js`: WhatsApp webhook adapter.
- `utils/whatsappWebhookParser.js`: incoming WhatsApp payload normalization.
- `routes/*Routes.js`: domain-specific HTTP route modules mounted by `routes/index.js`.
- `models/conversationEngine.js`: conversation orchestration.
- `models/guidedFlowRunner.js`: guided menu/step runner from `helpers/thessaResponses.json`.
- `models/messages.js`: WhatsApp outbound gateway.
- `models/gemini.js`: AI fallback and knowledge-base answers.
- `models/citas/*`: appointment modules grouped with clearer Spanish names. See `docs/modulos-citas.md`.
- `models/chatStore.js`: realtime dashboard state with Supabase persistence.
- `models/supabaseStore.js`: Supabase repository.
- `public/dashboard`: internal dashboard.

## Request flow

```text
WhatsApp webhook
-> controllers/messages.js
-> whatsappWebhookParser
-> conversationEngine.processIncomingMessage()
-> guidedFlowRunner / citas / active AI tool / Gemini fallback
-> models/messages.js
-> WhatsApp Cloud API
-> chatStore + Supabase
```

## Operating model

This project should stay simple:

- One Node.js service.
- Supabase as managed Postgres.
- Redis optional for short-lived conversation state.
- Google Calendar and WhatsApp as external integrations.
- Docker Compose for internal deployment.

Avoid Kubernetes, Kafka, complex microservices, and heavy multi-tenant architecture until traffic or team size makes them necessary.

## Next recommended modules

- `settingsRepository`: brand/company configuration for reuse across group companies.
- `webhookSecurity`: validate Meta signatures.
- `odooIntegration`: create/update leads and patients after qualified intent.

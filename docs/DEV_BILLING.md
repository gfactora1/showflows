# Dev Billing / Pro Toggle

## Purpose
Enable/disable Pro for a project in development without touching Stripe.

This tool:
- is **blocked in production**
- requires the caller to be authenticated
- requires the caller to be the **project owner**
- updates the single billing source of truth: `public.project_billing`

## Endpoint
POST `/api/projects/:projectId/dev/billing`

Body:
```json
{ "plan": "pro" }
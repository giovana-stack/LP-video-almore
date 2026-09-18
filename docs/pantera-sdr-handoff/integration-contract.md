# Contrato de integração Pantera ↔ Landing Page

Esta é a cópia de trabalho do contrato fornecido em `sessao/integration-contract.md`.

## Identidade e resumo

Os marcadores canônicos são `origem_lead = "Landing Page SDR"` e
`last_inbound_source = "sdr_landing_page"`. UTM não altera essa origem.

O resumo exposto ao Pantera contém `preferencia_atendimento`,
`formulario_completo`, `funnel_session_id`, `funnel_status`,
`funnel_last_step`, `funnel_last_step_index`, `funnel_last_activity_at` e
`funnel_completed_at`. Rollout deve tolerar a ausência temporária desses
campos; preferência ausente equivale a WhatsApp.

## Eventos permitidos

`funnel_started`, `step_viewed`, `step_completed`, `step_validation_failed`,
`contact_preference_selected`, `form_submitted`, `funnel_completed`,
`booking_viewed` e `booking_completed`.

Todo evento contém:

```ts
type TrackerEvent = {
  event_id: string // UUID idempotente, criado no cliente
  session_id: string // UUID estável durante a jornada
  lead_id: string | null // associado assim que existir
  event_name: string
  step_key: string | null // chave estável, nunca cópia visual
  step_index: number | null
  occurred_at: string // ISO-8601
  utm: {
    source: string | null
    medium: string | null
    campaign: string | null
    content: string | null
    term: string | null
  }
  metadata: Record<string, "ligacao" | "whatsapp">
}
```

`metadata` não recebe PII ou respostas. A única metadata emitida pela landing
no momento é `preference`, com `ligacao` ou `whatsapp`, no evento
`contact_preference_selected`.

Repetir o mesmo `event_id` não pode criar novo evento. Abandono é derivado por
inatividade de 30 minutos, nunca por `beforeunload` ou `pagehide`. A última
etapa deve ser calculável fora de ordem.

## Canal e agenda

O payload de preferência canônico é:

```json
{ "preferencia_atendimento": "ligacao" }
```

O Pantera normaliza `ligacao`, `ligação`, `telefone`, `voice` e `call` para
`voice`; `whatsapp` permanece `whatsapp`; valor ausente/desconhecido cai em
WhatsApp.

O cliente envia cada evento para a RPC do tracker:

```http
POST https://ffdbojtidzmoklcpvnsz.supabase.co/rest/v1/rpc/funnel_track_event
apikey: <chave-publicavel>
Authorization: Bearer <chave-publicavel>
Content-Type: application/json

{ "p_event": { /* TrackerEvent */ } }
```

O evento `booking_completed` só é emitido após a agenda cross-origin enviar
`postMessage({ type: "almore_booking_completed" })` de
`https://agendar.devantsolucoes.com.br`.

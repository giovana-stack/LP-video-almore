# Evidência TDD — SDR v2 frontend

## Jornadas

1. Uma pessoa no Ramo B percorre o formulário, precisa escolher ligação ou
   WhatsApp e só então conclui o formulário.
2. Eventos do tracker preservam o mesmo `event_id` no retry, são entregues em
   ordem e carregam o `lead_id` quando ele passa a existir.

## Evidência

| Garantia | Teste | Resultado |
| --- | --- | --- |
| Ramo B não conclui sem preferência | `FormularioAlmore.test.tsx` | PASS |
| Conclusão ocorre após escolher ligação | `FormularioAlmore.test.tsx` | PASS |
| Retry reaproveita `event_id`, respeita ordem e elimina PII de metadata | `tracker.test.ts` | PASS |
| Preferência e lead são enviados no evento permitido | `tracker.test.ts` | PASS |

RED: `npm test` falhou em 17/09/2026 porque o Ramo B ia direto à tela de
valor e `./tracker` não existia. GREEN: `npm test`, `npm run typecheck` e
`npm run build` passaram após a implementação.

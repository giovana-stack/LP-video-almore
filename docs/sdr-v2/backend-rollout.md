# Implementação do backend SDR v2

## Migration

Arquivo:
`supabase/migrations/20260917215528_add_sdr_v2_tracker.sql`.

A migration é aditiva e preserva as assinaturas públicas existentes:

- `funil_salvar(uuid, jsonb)` continua aceitando payloads antigos;
- `sdr_bridge(text, text, jsonb)` preserva `ping`, `pull`, `get`, `patch` e
  `message`;
- `get` e `pull` passam a devolver as novas colunas porque serializam a linha
  completa de `leads`;
- nenhuma migration foi aplicada ao projeto remoto durante o desenvolvimento.

## Endpoint público

O tracker usa a RPC `public.funnel_track_event(jsonb)`:

```http
POST /rest/v1/rpc/funnel_track_event
apikey: <publishable-key>
Authorization: Bearer <publishable-key-ou-anon-key-legada>
Content-Type: application/json
```

```json
{
  "p_event": {
    "event_id": "8c60b5b8-9bb3-4ac8-9764-5b2e9c994812",
    "session_id": "9d77ee40-5999-4287-a446-f1be4f59f5b7",
    "lead_id": null,
    "event_name": "step_viewed",
    "step_key": "dados_empresa",
    "step_index": 2,
    "occurred_at": "2026-09-17T18:00:00-03:00",
    "utm": {
      "source": "google",
      "medium": "cpc",
      "campaign": "institucional"
    },
    "metadata": {
      "form_version": "v2"
    }
  }
}
```

Resposta:

```json
{
  "accepted": true,
  "duplicate": false
}
```

Repetir o mesmo `event_id` devolve `duplicate: true` e não cria outra linha.
A RPC não devolve o evento gravado nem oferece leitura de eventos ou sessões.

### Campos aceitos

Campos de topo: `event_id`, `session_id`, `lead_id`, `event_name`, `step_key`,
`step_index`, `occurred_at`, `utm` e `metadata`.

Eventos: `funnel_started`, `step_viewed`, `step_completed`,
`step_validation_failed`, `contact_preference_selected`, `form_submitted`,
`funnel_completed`, `booking_viewed` e `booking_completed`.

`utm` guarda apenas `source`, `medium`, `campaign`, `content` e `term`.
`metadata` guarda apenas `preference`, `form_version`, `validation_code` e
`booking_provider`, com valores curtos e estruturados. Respostas do formulário,
nome, e-mail, telefone, documento e CNPJ não devem ser enviados.

`occurred_at` pode ficar no máximo cinco minutos no futuro e sete dias no
passado. O payload inteiro tem limite de 8 KiB. O rate limit é de 120 chamadas
por minuto por IP pseudonimizado e 60 por minuto por sessão; registros de rate
limit com mais de uma hora são removidos durante novas chamadas.

## Resumo e abandono

Cada inserção recalcula o resumo da sessão a partir de todos os eventos. A
etapa alcançada é escolhida por maior `step_index`, com desempate por
`occurred_at` e `event_id`; a atividade é o maior `occurred_at`. Isso torna o
resultado determinístico mesmo quando eventos chegam fora de ordem.

`form_submitted` ou `funnel_completed` concluem a sessão. Sem conclusão, a
sessão fica `abandoned` após 30 minutos sem atividade. O abandono é atualizado
na inserção e antes de `sdr_bridge get/pull`, portanto não exige cron.

Quando um evento posterior traz `lead_id`, todos os eventos ainda anônimos da
mesma sessão são associados dentro de uma transação serializada por sessão. O
resumo da sessão mais recente é espelhado nas colunas `funnel_*` de `leads`.

## Passos manuais antes do rollout

1. Aplicar a migration primeiro em um projeto Supabase de staging ou branch de
   banco, nunca diretamente em produção.
2. Confirmar que `pgcrypto` permanece instalado no schema `extensions`; o
   `sdr_bridge` atual já depende de `extensions.digest`.
3. Confirmar nas configurações da Data API que o schema `public` está exposto.
   As tabelas continuam sem grants públicos; apenas a RPC recebe `EXECUTE`.
4. Recarregar o schema do PostgREST caso a RPC não apareça imediatamente.
5. Rodar `bash scripts/test-sdr-v2-sql.sh` e os advisors de segurança e
   performance contra staging.
6. Verificar que os avisos de função `SECURITY DEFINER` pública correspondem
   somente às portas intencionais (`funil_salvar`, `funnel_track_event` e
   `sdr_bridge`). Tabelas do tracker devem continuar sem policy e sem grants de
   `SELECT` para `anon`/`authenticated`; o deny-all é intencional.
7. Configurar o cliente do tracker com a URL Supabase e a chave publicável já
   usada pelo formulário. Nenhum segredo novo é necessário.
8. Validar a integração `get`/`pull` com o Pantera em staging antes de qualquer
   ativação de voz ou automação.

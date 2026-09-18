# Contrato Pantera ↔ Landing Page

Este contrato permite que os dois repositórios sejam desenvolvidos em paralelo
sem depender de detalhes internos um do outro.

## 1. Identidade e origem

Marcadores canônicos no Pantera:

```text
origem_lead = "Landing Page SDR"
last_inbound_source = "sdr_landing_page"
```

Uma UTM de mídia paga dentro da landing page não muda a origem operacional do
lead: ele continua pertencendo ao quadro Landing Page.

## 2. Campos do lead expostos por `sdr_bridge`

Além dos campos existentes, `get` e `pull` devem devolver:

| Campo | Tipo | Regra |
|---|---|---|
| `preferencia_atendimento` | texto nulo | `ligacao` ou `whatsapp` |
| `formulario_completo` | booleano | verdadeiro somente após submissão final válida |
| `funnel_session_id` | UUID/texto nulo | sessão mais recente associada ao lead |
| `funnel_status` | texto | `in_progress`, `abandoned` ou `completed` |
| `funnel_last_step` | texto nulo | chave estável da última etapa alcançada |
| `funnel_last_step_index` | inteiro nulo | ordem da etapa no funil |
| `funnel_last_activity_at` | timestamptz nulo | último evento aceito |
| `funnel_completed_at` | timestamptz nulo | conclusão do formulário |

O Pantera deve tolerar a ausência temporária desses campos durante o rollout.
Preferência ausente equivale a WhatsApp.

## 3. Taxonomia de eventos do tracker

Eventos recomendados:

```text
funnel_started
step_viewed
step_completed
step_validation_failed
contact_preference_selected
form_submitted
funnel_completed
booking_viewed
booking_completed
```

Cada evento contém:

| Campo | Tipo | Observação |
|---|---|---|
| `event_id` | UUID | gerado no cliente; chave idempotente |
| `session_id` | UUID | estável durante a jornada |
| `lead_id` | UUID nulo | associado assim que o lead existir |
| `event_name` | enum/texto validado | somente a taxonomia permitida |
| `step_key` | texto nulo | chave estável, nunca o rótulo visual |
| `step_index` | inteiro nulo | ordem da etapa |
| `occurred_at` | timestamptz | horário do cliente, limitado/validado |
| `utm` | JSON filtrado | source, medium, campaign, content, term |
| `metadata` | JSON filtrado | sem respostas do formulário ou PII |

### Regras do tracker

- Não enviar conteúdo digitado, documento, CNPJ, telefone ou e-mail em
  `metadata`.
- Repetir um `event_id` não cria outro evento.
- O endpoint público só insere eventos validados; não permite leitura pública.
- `pagehide`/`beforeunload` não define abandono, pois não é confiável.
- Abandono é derivado: sessão sem `funnel_completed` e sem atividade por 30
  minutos. O painel pode mostrar `in_progress` antes desse prazo.
- A última etapa deve ser calculável mesmo se eventos chegarem fora de ordem.

## 4. Resumo operacional

O banco da landing page mantém os eventos detalhados e atualiza um resumo por
sessão/lead. A RPC `sdr_bridge` devolve o resumo, não todo o histórico.

O Pantera persiste esse resumo no espelho do SDR e pode exibir no card/gaveta:

- `Concluiu o formulário`;
- `Em andamento — última etapa: X`;
- `Abandonou — última etapa: X`.

## 5. Escolha de canal

Payload canônico recebido pelo Pantera:

```json
{
  "preferencia_atendimento": "ligacao"
}
```

Normalização:

```text
ligacao, ligação, telefone, voice, call → voice
whatsapp                              → whatsapp
ausente ou desconhecido              → whatsapp
```

## 6. Ownership do SDR

O lead espelhado no CRM nasce com `assigned_presales_id = null`.

O Pantera deve oferecer uma operação atômica equivalente a:

```text
claim_landing_page_lead(lead_id, current_user)
```

Requisitos:

- somente membro ativo autorizado da empresa;
- atribui apenas se ainda estiver sem SDR;
- em corrida, apenas um usuário vence;
- chamadas repetidas pelo vencedor são idempotentes;
- devolve o responsável atual para a UI atualizar imediatamente;
- registra auditoria com horário e usuário.

## 7. Agendas

- SDR: não consulta e não recebe calendário.
- Closer: consulta apenas perfis permitidos de Larissa, Diego e Patty.
- `book_meeting` deve validar novamente que o seller do token continua no pool
  de closers antes de gravar a reunião.

## 8. Mensagens antes da atribuição

Todos os textos automáticos usam sujeito institucional:

```text
Aqui é o atendimento da Almore...
Uma pessoa do nosso time comercial...
Você receberá uma ligação da Almore...
```

Não usar nome de SDR nem afirmar que a próxima interação será humana quando ela
puder ser feita pelo agente de voz.

## 9. Compatibilidade de rollout

Ordem segura:

1. Landing page adiciona campos/eventos/RPC mantendo campos antigos.
2. Pantera passa a ler os campos novos com fallback.
3. Landing page publica a escolha visual.
4. Meta aprova e o Pantera mapeia o template institucional.
5. Ativar em staging/teste interno.
6. Somente depois ativar voz e automação em produção.

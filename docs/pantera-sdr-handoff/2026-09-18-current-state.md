# Handoff — Landing Almore + Pantera SDR

Atualizado em 18/09/2026. Este arquivo é o ponto de partida para uma nova
sessão. Leia também, integralmente, `README.md`, `integration-contract.md` e
`session-plan.md` desta pasta antes de alterar a integração.

## Resultado esperado pelo negócio

- Um formulário iniciado na landing deve criar/atualizar o card no Kanban
  **Formulário incompleto** assim que houver dados de contato válidos.
- O card **não sai automaticamente** dessa coluna enquanto a pessoa não tiver
  escolhido explicitamente `ligacao` ou `whatsapp` na tela final.
- A equipe pode arrastar o card manualmente; essa continua sendo uma ação
  humana e não deve ser desfeita pelos salvamentos normais da mesma jornada.
- Ao escolher o canal no final, o card pode ir para a etapa operacional de
  contato e o SDR automático pode iniciar, quando estiver habilitado.
- Quando o mesmo telefone volta a preencher a landing, o card existente da
  origem Landing Page SDR deve refletir o nome/e-mail mais recentes.

## Estado publicado

### Repositório da landing

- Caminho local: `/home/maia/work/Devant/interno-labs/LP-video-almore`
- Branch: `main`
- Último commit relevante do tracker: `83db8d6 fix(tracker): descartar fila legada inválida`
- Documentos de contrato originais: `docs/sdr-v2/`.
- Cópia de handoff exigida para o repositório da LP: `docs/pantera-sdr-handoff/`.

Mudanças já entregues na LP:

1. escolha obrigatória no final sem preço: **Receber uma ligação** ou
   **Continuar pelo WhatsApp**;
2. persistência de `preferencia_atendimento` como `ligacao` ou `whatsapp`;
3. `session_id` UUID estável, associação de `lead_id` e preservação de UTMs
   permitidas;
4. telemetria com `step_key` e `step_index` estáveis, sem PII/respostas em
   `metadata`, com retry idempotente e sem depender de `beforeunload`;
5. correção do contrato de etapas: o cliente agora envia `step_key` e
   `step_index` (antes enviava propriedades incompatíveis e a RPC devolvia
   HTTP 400);
6. descarte da fila local antiga que continha eventos inválidos, para não
   prender os retries em erro 400.

Commits principais da LP, em ordem:

- `b7a43bf test: reproduz etapas inválidas no tracker`
- `280e675 fix(tracker): enviar chaves de etapa no contrato da RPC`
- `45cb51e docs(test): registrar correção do contrato de etapas`
- `d151300 merge: integrar atualizações do tracker`
- `83db8d6 fix(tracker): descartar fila legada inválida`

### Repositório do Pantera

- Repositório: `/home/maia/work/Devant/interno-labs/panteranegra`
- Mudança publicada em `main`: `7e16c8b3 fix(sdr): manter landing incompleta até preferência`
- Commits de teste que fazem parte da mesma entrega:
  - `d413396c test(sdr): definir entrada da landing como incompleta`
  - `b827a80d test(sdr): cobrir liberação por preferência explícita`
- Edge Functions publicadas no projeto `agzojmilzfjjkmsitkkk`:
  - `sdr-intake` v38;
  - `sdr-runner` v43.
- Não houve migration nesta alteração.

Arquivos alterados no Pantera:

- `supabase/functions/_shared/sdr/ingest.ts`
- `supabase/functions/_shared/sdr/crm.ts`
- `supabase/functions/_shared/sdr/lp.ts`
- `supabase/functions/_shared/sdr/transitions.ts`
- `supabase/functions/_shared/sdr/contact-preference.ts`
- `supabase/functions/_shared/sdr/crm.test.ts`
- `supabase/functions/_shared/sdr/ingest.test.ts`

Comportamento implementado no Pantera:

1. o CRM cria o card com `pipeline_stage: "landing_incomplete"`;
2. um lead parcial fica internamente em `awaiting_contact_preference`, portanto
   não agenda mensagem nem ligação;
3. somente os valores exatos `whatsapp` e `ligacao` liberam a automação;
4. depois da escolha, o card é movido para `contact_pipeline_stage` e o fluxo
   é iniciado se o SDR estiver ligado;
5. em um reenvio para um lead Landing Page SDR existente, `clients.full_name`
   e `clients.email` são atualizados antes da renovação do card.

## Teste manual do caminho com escolha de canal

A tela de canal aparece no caminho **sem preço**, não especificamente no
Ramo B. Um caminho reproduzível é:

1. nome, WhatsApp (marcar o consentimento) e e-mail válidos;
2. **Você já tem CNPJ aberto?** → `Sim`;
3. **Regime tributário** → `Simples Nacional`;
4. **Faturamento** → `Acima de R$300.000`;
5. **Já tem contador?** → `Não tenho`;
6. **Funcionários** → `De 1 a 5`;
7. **Maior dificuldade** → `Pago muito imposto e quero pagar menos`;
8. **Quando precisa resolver?** → `Essa semana`;
9. **Melhor horário** → `Tarde (12h-18h)`;
10. **Enviar** → aparece **Como você prefere ser atendido?**.

Para isolar sessões antigas durante o teste, use uma janela anônima ou limpe o
armazenamento do domínio. Caso contrário, um `session_id` prévio pode estar
associado a outro `lead_id` e a RPC rejeita o evento.

## Problema atual ainda aberto

No Pantera, o card de um teste concluído mostrou corretamente:

- “Formulário concluído”;
- “Última etapa: Contact preference”;
- “Conclusão registrada”.

Porém a observação do vendedor mostrou os dados da landing como vazios:

```text
Formulário da landing page (SDR Call). Regime: -; faturamento: -; dor: -;
urgência: -; melhor horário: -.
```

Isso **não** corresponde ao preenchimento real. A hipótese mais forte é que
`ensureCrmLead` cria as `notes` quando recebe o primeiro salvamento parcial e
`applyLpChanges` atualiza `sdr_leads.form`, mas não atualiza as `leads.notes`
do CRM depois que as respostas restantes chegam.

Esse conserto pertence à sessão do **Pantera / SDR intake e CRM**, não à sessão
de interface da landing. É independente do problema de disparo de WhatsApp,
que outra sessão já está investigando; não duplicar essa investigação.

### Escopo sugerido para a nova sessão

1. partir da `main` remota atual e verificar se há sessões concorrentes;
2. reproduzir: criar lead com contato parcial, completar as respostas e reler
   o card CRM;
3. atualizar o CRM existente com os dados mais recentes da LP: `notes` e os
   campos exibidos necessários, preservando dados que não foram informados;
4. não colocar PII ou respostas brutas em eventos/metadata de tracker;
5. preservar a regra de estágio `landing_incomplete` até preferência;
6. escrever teste incremental que valide a atualização de regime, faturamento,
   dor, urgência e horário após a criação parcial;
7. rodar testes e build, criar commit focado em `main`, push e publicar apenas
   as Edge Functions afetadas.

## Verificações executadas

No Pantera:

- testes focados de CRM e preferência: passaram;
- suíte `npm test`: passou;
- `npm run build`: passou;
- `npm run lint`: falha por aproximadamente 1.479 problemas preexistentes,
  majoritariamente `no-explicit-any`, fora desta entrega.

No deploy do Supabase, uma chamada sem credenciais/formato completo ao
`sdr-intake` respondeu HTTP 400 com `company_slug/lp_lead_id inválidos`,
confirmando que a função v38 estava ativa. Não foi criado lead de teste de
produção para essa checagem.

## Prompt pronto para a nova sessão

> Trabalhe no repositório real do Pantera em worktree próprio. Leia
> `docs/pantera-sdr-handoff/2026-09-18-current-state.md` no repositório da LP
> e os três documentos de contrato da mesma pasta antes de alterar código.
>
> Corrija a sincronização incremental das respostas da landing para o card CRM
> do Pantera. Hoje o card é criado no primeiro salvamento parcial e a
> observação fica com `Regime: -; faturamento: -; dor: -; urgência: -; melhor
> horário: -`, mesmo depois de a pessoa concluir o formulário. As etapas e a
> preferência de contato já chegam corretamente.
>
> Investigue `sdr-intake`, `_shared/sdr/ingest.ts` e `_shared/sdr/crm.ts`.
> Atualize o lead CRM existente quando os campos posteriores da LP chegarem,
> incluindo as notas/dados visíveis, preservando campos não enviados. Não
> altere a regra de o card permanecer em `landing_incomplete` até a escolha
> explícita de `ligacao` ou `whatsapp`; não altere a RPC `sdr_bridge`; não
> envie PII/respostas em telemetria. Escreva teste de criação parcial seguida
> de conclusão, execute testes e build, faça commit focado em `main`, push e
> deploy somente das Edge Functions afetadas no Supabase. Há outra sessão
> investigando o disparo de mensagem; não duplique esse escopo e integre a
> `main` remota antes do push.

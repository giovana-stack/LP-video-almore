\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.assert_true(p_condition boolean, p_message text)
returns void
language plpgsql
as $$
begin
  if p_condition is distinct from true then
    raise exception 'ASSERTION FAILED: %', p_message;
  end if;
end;
$$;

create or replace function pg_temp.assert_raises(
  p_statement text,
  p_message_pattern text,
  p_message text
)
returns void
language plpgsql
as $$
declare
  v_message text;
begin
  begin
    execute p_statement;
  exception when others then
    get stacked diagnostics v_message = message_text;
    if v_message ~ p_message_pattern then
      return;
    end if;
    raise exception 'ASSERTION FAILED: % (erro inesperado: %)', p_message, v_message;
  end;

  raise exception 'ASSERTION FAILED: % (nenhum erro foi gerado)', p_message;
end;
$$;

select pg_temp.assert_true(
  to_regclass('public.funnel_events') is not null,
  'a migration cria a tabela de eventos'
);
select pg_temp.assert_true(
  to_regclass('public.funnel_sessions') is not null,
  'a migration cria o resumo por sessao'
);

select pg_temp.assert_true(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'leads'
      and column_name = 'preferencia_atendimento'
  ),
  'leads recebe preferencia_atendimento'
);

select public.funil_salvar(
  '10000000-0000-4000-8000-000000000001',
  jsonb_build_object('nome', 'Cliente de teste', 'status', 'novo')
);

set local role anon;

select public.funnel_track_event(jsonb_build_object(
  'event_id', '20000000-0000-4000-8000-000000000001',
  'session_id', '30000000-0000-4000-8000-000000000001',
  'event_name', 'step_viewed',
  'step_key', 'dados_empresa',
  'step_index', 2,
  'occurred_at', now() - interval '2 minutes',
  'utm', jsonb_build_object('source', 'google', 'email', 'nao-pode-ser-gravado'),
  'metadata', jsonb_build_object('form_version', 'v2', 'email', 'nao-pode-ser-gravado')
));

select public.funnel_track_event(jsonb_build_object(
  'event_id', '20000000-0000-4000-8000-000000000001',
  'session_id', '30000000-0000-4000-8000-000000000001',
  'event_name', 'step_viewed',
  'step_key', 'dados_empresa',
  'step_index', 2,
  'occurred_at', now() - interval '2 minutes'
));

reset role;

select pg_temp.assert_true(
  (select count(*) = 1 from public.funnel_events
   where event_id = '20000000-0000-4000-8000-000000000001'),
  'event_id repetido nao duplica o evento'
);
select pg_temp.assert_true(
  not (select metadata ? 'email' from public.funnel_events
       where event_id = '20000000-0000-4000-8000-000000000001'),
  'metadata fora da allowlist e descartada'
);
select pg_temp.assert_true(
  not (select utm ? 'email' from public.funnel_events
       where event_id = '20000000-0000-4000-8000-000000000001'),
  'utm fora da allowlist e descartada'
);

select pg_temp.assert_true(
  not has_table_privilege('anon', 'public.funnel_events', 'select')
  and not has_table_privilege('authenticated', 'public.funnel_events', 'select')
  and not has_table_privilege('anon', 'public.funnel_sessions', 'select'),
  'as tabelas do tracker nao oferecem leitura publica'
);
select pg_temp.assert_true(
  has_function_privilege('anon', 'public.funnel_track_event(jsonb)', 'execute'),
  'anon pode executar somente a RPC de insercao'
);
select pg_temp.assert_true(
  not has_function_privilege(
    'anon',
    'private.funnel_refresh_session(uuid,timestamp with time zone)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'private.funnel_refresh_abandonment(timestamp with time zone)',
    'execute'
  ),
  'helpers privilegiados nao sao executaveis por clientes'
);
select pg_temp.assert_true(
  (
    select proconfig @> array['search_path=""']
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'funnel_track_event'
      and pg_get_function_identity_arguments(p.oid) = 'p_event jsonb'
  ),
  'RPC publica fixa search_path vazio'
);

select pg_temp.assert_raises(
  $$select public.funnel_track_event('{"event_id":"21000000-0000-4000-8000-000000000001","session_id":"31000000-0000-4000-8000-000000000001","event_name":"evento_inventado","occurred_at":"2026-09-17T12:00:00Z"}'::jsonb)$$,
  'event_name invalido',
  'evento fora da taxonomia e rejeitado'
);
select pg_temp.assert_raises(
  $$select public.funnel_track_event(jsonb_build_object('event_id','21000000-0000-4000-8000-000000000002','session_id','31000000-0000-4000-8000-000000000002','event_name','funnel_started','occurred_at',now() + interval '10 minutes'))$$,
  'occurred_at invalido',
  'timestamp futuro demais e rejeitado'
);
select pg_temp.assert_raises(
  $$select public.funnel_track_event(jsonb_build_object('event_id','21000000-0000-4000-8000-000000000003','session_id','31000000-0000-4000-8000-000000000003','event_name','funnel_started','occurred_at',now(),'nome','PII'))$$,
  'campos nao permitidos',
  'campo de payload fora da allowlist e rejeitado'
);

set local role anon;

do $$
declare
  v_index integer;
  v_rate_limited boolean := false;
begin
  for v_index in 1..61 loop
    begin
      perform public.funnel_track_event(jsonb_build_object(
        'event_id', gen_random_uuid(),
        'session_id', '31000000-0000-4000-8000-000000000099',
        'event_name', 'funnel_started',
        'occurred_at', now()
      ));
    exception when sqlstate 'PGRST' then
      v_rate_limited := true;
      exit;
    end;
  end loop;

  if not v_rate_limited then
    raise exception 'ASSERTION FAILED: rate limit por sessao nao bloqueou a 61a chamada';
  end if;
end;
$$;

reset role;

set local role anon;

select public.funnel_track_event(jsonb_build_object(
  'event_id', '22000000-0000-4000-8000-000000000001',
  'session_id', '32000000-0000-4000-8000-000000000001',
  'event_name', 'step_completed',
  'step_key', 'etapa_avancada',
  'step_index', 5,
  'occurred_at', now() - interval '10 minutes'
));
select public.funnel_track_event(jsonb_build_object(
  'event_id', '22000000-0000-4000-8000-000000000002',
  'session_id', '32000000-0000-4000-8000-000000000001',
  'event_name', 'step_viewed',
  'step_key', 'etapa_anterior',
  'step_index', 2,
  'occurred_at', now() - interval '1 minute'
));

select public.funnel_track_event(jsonb_build_object(
  'event_id', '23000000-0000-4000-8000-000000000001',
  'session_id', '33000000-0000-4000-8000-000000000001',
  'event_name', 'step_viewed',
  'step_key', 'contato',
  'step_index', 3,
  'occurred_at', now() - interval '31 minutes'
));

select public.funnel_track_event(jsonb_build_object(
  'event_id', '24000000-0000-4000-8000-000000000001',
  'session_id', '34000000-0000-4000-8000-000000000001',
  'event_name', 'step_viewed',
  'step_key', 'inicio',
  'step_index', 1,
  'occurred_at', now() - interval '5 minutes'
));

reset role;

select pg_temp.assert_true(
  (select last_step = 'etapa_avancada' and last_step_index = 5
     from public.funnel_sessions
    where session_id = '32000000-0000-4000-8000-000000000001'),
  'eventos fora de ordem preservam a etapa mais avancada'
);
select pg_temp.assert_true(
  (select last_activity_at > now() - interval '2 minutes'
     from public.funnel_sessions
    where session_id = '32000000-0000-4000-8000-000000000001'),
  'ultima atividade usa o maior occurred_at'
);
select pg_temp.assert_true(
  (select status = 'abandoned'
     from public.funnel_sessions
    where session_id = '33000000-0000-4000-8000-000000000001'),
  'sessao sem atividade por 30 minutos e abandonada'
);

select public.funil_salvar(
  '10000000-0000-4000-8000-000000000002',
  jsonb_build_object('nome', 'Associacao tardia', 'status', 'novo')
);

set local role anon;

select public.funnel_track_event(jsonb_build_object(
  'event_id', '24000000-0000-4000-8000-000000000002',
  'session_id', '34000000-0000-4000-8000-000000000001',
  'lead_id', '10000000-0000-4000-8000-000000000002',
  'event_name', 'contact_preference_selected',
  'occurred_at', now() - interval '4 minutes',
  'metadata', jsonb_build_object('preference', 'ligacao')
));
select public.funnel_track_event(jsonb_build_object(
  'event_id', '24000000-0000-4000-8000-000000000003',
  'session_id', '34000000-0000-4000-8000-000000000001',
  'lead_id', '10000000-0000-4000-8000-000000000002',
  'event_name', 'form_submitted',
  'occurred_at', now() - interval '3 minutes'
));

reset role;

select pg_temp.assert_true(
  (select count(*) = 3 from public.funnel_events
   where session_id = '34000000-0000-4000-8000-000000000001'
     and lead_id = '10000000-0000-4000-8000-000000000002'),
  'lead_id tardio associa inclusive eventos anteriores'
);
select pg_temp.assert_true(
  (select formulario_completo
       and funnel_session_id = '34000000-0000-4000-8000-000000000001'
       and funnel_status = 'completed'
       and funnel_last_step = 'inicio'
       and preferencia_atendimento = 'ligacao'
     from public.leads
    where id = '10000000-0000-4000-8000-000000000002'),
  'resumo do lead inclui conclusao, etapa, sessao e preferencia'
);

select public.funil_salvar(
  '10000000-0000-4000-8000-000000000003',
  jsonb_build_object('nome', 'Cliente antigo', 'status', 'novo')
);

select pg_temp.assert_true(
  (select nome = 'Cliente antigo' and preferencia_atendimento is null
     from public.leads
    where id = '10000000-0000-4000-8000-000000000003'),
  'payload antigo de funil_salvar continua funcionando'
);

set local role anon;

select pg_temp.assert_true(
  (
    public.sdr_bridge(
      'test-token',
      'get',
      jsonb_build_object('id', '10000000-0000-4000-8000-000000000002')
    ) ?& array[
      'preferencia_atendimento',
      'formulario_completo',
      'funnel_session_id',
      'funnel_status',
      'funnel_last_step',
      'funnel_last_step_index',
      'funnel_last_activity_at',
      'funnel_completed_at'
    ]
  ),
  'sdr_bridge get devolve todos os campos do contrato'
);

select pg_temp.assert_true(
  (
    select bool_and(item ?& array[
      'preferencia_atendimento',
      'formulario_completo',
      'funnel_session_id',
      'funnel_status',
      'funnel_last_step',
      'funnel_last_step_index',
      'funnel_last_activity_at',
      'funnel_completed_at'
    ])
    from jsonb_array_elements(
      public.sdr_bridge(
        'test-token',
        'pull',
        jsonb_build_object('since', now() - interval '1 hour')
      )
    ) as items(item)
  ),
  'sdr_bridge pull devolve todos os campos do contrato'
);

select pg_temp.assert_true(
  (public.sdr_bridge('test-token', 'ping', '{}'::jsonb)->>'ok')::boolean,
  'acoes antigas de sdr_bridge continuam funcionando'
);

reset role;

select pg_temp.assert_true(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'funnel_events_session_occurred_idx'
  )
  and exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'funnel_events_lead_occurred_idx'
  )
  and exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'funnel_sessions_last_activity_idx'
  ),
  'ha indices para sessao, lead e ultima atividade'
);

rollback;

\echo 'PASS: contrato SQL SDR v2 validado'

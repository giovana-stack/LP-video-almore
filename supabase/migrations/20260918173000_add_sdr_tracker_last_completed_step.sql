-- Mantém a última tela vista separada da última pergunta efetivamente respondida.
-- Eventos públicos seguem sem dados de formulário em metadata.

alter table public.leads
  add column if not exists funnel_last_completed_step text,
  add column if not exists funnel_last_completed_step_index integer;

alter table public.funnel_sessions
  add column if not exists last_completed_step text,
  add column if not exists last_completed_step_index integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'leads_funnel_last_completed_step_index_check'
      and conrelid = 'public.leads'::regclass
  ) then
    alter table public.leads add constraint leads_funnel_last_completed_step_index_check
      check (funnel_last_completed_step_index between 0 and 100);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'funnel_sessions_last_completed_step_index_check'
      and conrelid = 'public.funnel_sessions'::regclass
  ) then
    alter table public.funnel_sessions add constraint funnel_sessions_last_completed_step_index_check
      check (last_completed_step_index between 0 and 100);
  end if;
end;
$$;

create or replace function private.funnel_refresh_session(
  p_session_id uuid,
  p_as_of timestamptz default statement_timestamp()
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_summary public.funnel_sessions%rowtype;
begin
  with aggregate as (
    select
      p_session_id as session_id,
      (
        select e.lead_id
        from public.funnel_events e
        where e.session_id = p_session_id and e.lead_id is not null
        order by e.occurred_at desc, e.event_id desc limit 1
      ) as lead_id,
      (
        select e.step_key from public.funnel_events e
        where e.session_id = p_session_id and e.step_key is not null and e.step_index is not null
        order by e.step_index desc, e.occurred_at desc, e.event_id desc limit 1
      ) as last_step,
      (
        select e.step_index from public.funnel_events e
        where e.session_id = p_session_id and e.step_key is not null and e.step_index is not null
        order by e.step_index desc, e.occurred_at desc, e.event_id desc limit 1
      ) as last_step_index,
      (
        select e.step_key from public.funnel_events e
        where e.session_id = p_session_id and e.event_name = 'step_completed'
          and e.step_key is not null and e.step_index is not null
        order by e.step_index desc, e.occurred_at desc, e.event_id desc limit 1
      ) as last_completed_step,
      (
        select e.step_index from public.funnel_events e
        where e.session_id = p_session_id and e.event_name = 'step_completed'
          and e.step_key is not null and e.step_index is not null
        order by e.step_index desc, e.occurred_at desc, e.event_id desc limit 1
      ) as last_completed_step_index,
      max(e.occurred_at) as last_activity_at,
      min(e.occurred_at) filter (where e.event_name in ('form_submitted', 'funnel_completed')) as completed_at,
      (
        select e.metadata ->> 'preference' from public.funnel_events e
        where e.session_id = p_session_id and e.event_name = 'contact_preference_selected'
          and e.metadata ->> 'preference' in ('ligacao', 'whatsapp')
        order by e.occurred_at desc, e.event_id desc limit 1
      ) as contact_preference
    from public.funnel_events e where e.session_id = p_session_id
  )
  insert into public.funnel_sessions (
    session_id, lead_id, status, last_step, last_step_index,
    last_completed_step, last_completed_step_index, last_activity_at,
    completed_at, contact_preference, updated_at
  )
  select
    a.session_id, a.lead_id,
    private.funnel_status_at(a.completed_at, a.last_activity_at, p_as_of),
    a.last_step, a.last_step_index, a.last_completed_step, a.last_completed_step_index,
    a.last_activity_at, a.completed_at, a.contact_preference, statement_timestamp()
  from aggregate a where a.last_activity_at is not null
  on conflict (session_id) do update set
    lead_id = excluded.lead_id,
    status = excluded.status,
    last_step = excluded.last_step,
    last_step_index = excluded.last_step_index,
    last_completed_step = excluded.last_completed_step,
    last_completed_step_index = excluded.last_completed_step_index,
    last_activity_at = excluded.last_activity_at,
    completed_at = excluded.completed_at,
    contact_preference = excluded.contact_preference,
    updated_at = excluded.updated_at
  returning * into v_summary;

  if v_summary.lead_id is null then return; end if;

  if v_summary.completed_at is not null then
    update public.leads set formulario_completo = true, atualizado_em = statement_timestamp()
    where id = v_summary.lead_id and formulario_completo = false;
  end if;

  update public.leads set
    preferencia_atendimento = coalesce(v_summary.contact_preference, public.leads.preferencia_atendimento),
    formulario_completo = public.leads.formulario_completo or v_summary.completed_at is not null,
    funnel_session_id = v_summary.session_id,
    funnel_status = v_summary.status,
    funnel_last_step = v_summary.last_step,
    funnel_last_step_index = v_summary.last_step_index,
    funnel_last_completed_step = v_summary.last_completed_step,
    funnel_last_completed_step_index = v_summary.last_completed_step_index,
    funnel_last_activity_at = v_summary.last_activity_at,
    funnel_completed_at = v_summary.completed_at,
    atualizado_em = statement_timestamp()
  where id = v_summary.lead_id
    and (public.leads.funnel_session_id = v_summary.session_id
      or public.leads.funnel_last_activity_at is null
      or v_summary.last_activity_at >= public.leads.funnel_last_activity_at);
end;
$$;

-- Backfill derivado exclusivamente do histórico de eventos; não apaga nem cria leads.
with latest_completed as (
  select distinct on (e.session_id)
    e.session_id, e.step_key, e.step_index
  from public.funnel_events e
  where e.event_name = 'step_completed'
    and e.step_key is not null and e.step_index is not null
  order by e.session_id, e.step_index desc, e.occurred_at desc, e.event_id desc
)
update public.funnel_sessions s set
  last_completed_step = c.step_key,
  last_completed_step_index = c.step_index,
  updated_at = statement_timestamp()
from latest_completed c where c.session_id = s.session_id;

update public.leads l set
  funnel_last_completed_step = s.last_completed_step,
  funnel_last_completed_step_index = s.last_completed_step_index,
  atualizado_em = statement_timestamp()
from public.funnel_sessions s
where s.lead_id = l.id
  and (l.funnel_session_id = s.session_id or l.funnel_last_activity_at is null or s.last_activity_at >= l.funnel_last_activity_at);

create or replace function public.sdr_bridge(p_token text, p_action text, p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_expected text; v_minute timestamptz := date_trunc('minute', now()); v_failures integer;
  v_id uuid; v_row public.leads%rowtype; v_since timestamptz; v_fields jsonb;
  v_allowed text[] := array['status','score','valor_informado','horario_agendado','multiplos_decisores','ligacao_1_status','ligacao_1_em','ligacao_2_status','ligacao_2_em','dia_tentativa_atual','ultima_ligacao_em','ultima_mensagem_diaria_em'];
begin
  select failures into v_failures from public.sdr_bridge_auth_failures where bucket_minute = v_minute;
  if coalesce(v_failures, 0) >= 20 then raise exception 'sdr_bridge: rate limited' using errcode = '42501'; end if;
  v_expected := public.sdr_bridge_token();
  if v_expected is null or p_token is null or pg_catalog.encode(extensions.digest(p_token, 'sha256'), 'hex') <> pg_catalog.encode(extensions.digest(v_expected, 'sha256'), 'hex') then
    insert into public.sdr_bridge_auth_failures (bucket_minute, failures) values (v_minute, 1) on conflict (bucket_minute) do update set failures = public.sdr_bridge_auth_failures.failures + 1;
    delete from public.sdr_bridge_auth_failures where bucket_minute < now() - interval '1 hour'; raise exception 'sdr_bridge: unauthorized' using errcode = '42501';
  end if;
  if p_action = 'ping' then return jsonb_build_object('ok', true, 'leads', (select count(*) from public.leads)); end if;
  if p_action = 'tracker_pull' then
    perform private.funnel_refresh_abandonment(statement_timestamp()); v_since := coalesce((p_payload ->> 'since')::timestamptz, now() - interval '30 days');
    return coalesce((select jsonb_agg(summary order by summary->>'last_activity_at', summary->>'session_id') from (
      select jsonb_build_object('session_id', s.session_id, 'lead_id', s.lead_id, 'status', s.status, 'last_step', s.last_step, 'last_step_index', s.last_step_index, 'last_completed_step', s.last_completed_step, 'last_completed_step_index', s.last_completed_step_index, 'last_activity_at', s.last_activity_at, 'completed_at', s.completed_at,
        'form_snapshot', case when l.id is null then null else jsonb_strip_nulls(jsonb_build_object('nome', l.nome, 'whatsapp', l.whatsapp, 'email', l.email, 'trilha', l.trilha, 'cnpj_aberto', l.cnpj_aberto, 'regime_tributario', l.regime_tributario, 'mei_quer_sair', l.mei_quer_sair, 'faturamento_faixa', l.faturamento_faixa, 'tem_contador', l.tem_contador, 'funcionarios_faixa', l.funcionarios_faixa, 'dor_principal', l.dor_principal, 'tipo_atividade', l.tipo_atividade, 'urgencia', l.urgencia, 'melhor_horario_contato', l.melhor_horario_contato, 'preferencia_atendimento', l.preferencia_atendimento)) end) as summary
      from public.funnel_sessions s left join public.leads l on l.id = s.lead_id where s.last_activity_at > v_since order by s.last_activity_at, s.session_id limit 200
    ) rows), '[]'::jsonb);
  end if;
  if p_action = 'pull' then perform private.funnel_refresh_abandonment(statement_timestamp()); v_since := coalesce((p_payload ->> 'since')::timestamptz, '1970-01-01'::timestamptz); return coalesce((select jsonb_agg(to_jsonb(l) order by l.atualizado_em, l.id) from (select * from public.leads where atualizado_em > v_since order by atualizado_em, id limit 200) l), '[]'::jsonb); end if;
  if p_action = 'get' then v_id := (p_payload ->> 'id')::uuid; perform private.funnel_refresh_abandonment(statement_timestamp()); select * into v_row from public.leads where id = v_id; if not found then return 'null'::jsonb; end if; return to_jsonb(v_row); end if;
  if p_action = 'patch' then
    v_id := (p_payload ->> 'id')::uuid; v_fields := coalesce(p_payload -> 'fields', '{}'::jsonb); select jsonb_object_agg(key, value) into v_fields from jsonb_each(v_fields) where key = any (v_allowed);
    if v_fields is null or v_fields = '{}'::jsonb then return jsonb_build_object('ok', true, 'updated', 0); end if; select * into v_row from public.leads where id = v_id; if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
    v_row := jsonb_populate_record(v_row, v_fields); v_row.atualizado_em := now(); update public.leads set status=v_row.status, score=v_row.score, valor_informado=v_row.valor_informado, horario_agendado=v_row.horario_agendado, multiplos_decisores=v_row.multiplos_decisores, ligacao_1_status=v_row.ligacao_1_status, ligacao_1_em=v_row.ligacao_1_em, ligacao_2_status=v_row.ligacao_2_status, ligacao_2_em=v_row.ligacao_2_em, dia_tentativa_atual=v_row.dia_tentativa_atual, ultima_ligacao_em=v_row.ultima_ligacao_em, ultima_mensagem_diaria_em=v_row.ultima_mensagem_diaria_em, atualizado_em=v_row.atualizado_em where id=v_id; return jsonb_build_object('ok', true, 'updated', 1);
  end if;
  if p_action = 'message' then insert into public.mensagens_whatsapp (lead_id, direcao, conteudo, tipo) values ((p_payload ->> 'lead_id')::uuid, p_payload ->> 'direcao', p_payload ->> 'conteudo', coalesce(p_payload ->> 'tipo', 'texto_livre')); return jsonb_build_object('ok', true); end if;
  raise exception 'sdr_bridge: unknown action %', p_action;
end;
$$;

revoke all on function public.sdr_bridge(text, text, jsonb) from public;
grant execute on function public.sdr_bridge(text, text, jsonb) to anon, authenticated, service_role;

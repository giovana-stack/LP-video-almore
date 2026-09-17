-- SDR v2: tracker publico de escrita, resumo operacional e bridge aditiva.
-- Esta migration nao e aplicada automaticamente; deve passar pelo roteiro de
-- staging descrito em docs/sdr-v2 antes de qualquer deploy.

alter table public.leads
  add column if not exists preferencia_atendimento text,
  add column if not exists funnel_session_id uuid,
  add column if not exists funnel_status text not null default 'in_progress',
  add column if not exists funnel_last_step text,
  add column if not exists funnel_last_step_index integer,
  add column if not exists funnel_last_activity_at timestamptz,
  add column if not exists funnel_completed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'leads_preferencia_atendimento_check'
      and conrelid = 'public.leads'::regclass
  ) then
    alter table public.leads
      add constraint leads_preferencia_atendimento_check
      check (preferencia_atendimento in ('ligacao', 'whatsapp'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'leads_funnel_status_check'
      and conrelid = 'public.leads'::regclass
  ) then
    alter table public.leads
      add constraint leads_funnel_status_check
      check (funnel_status in ('in_progress', 'abandoned', 'completed'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'leads_funnel_last_step_index_check'
      and conrelid = 'public.leads'::regclass
  ) then
    alter table public.leads
      add constraint leads_funnel_last_step_index_check
      check (funnel_last_step_index between 0 and 100);
  end if;
end;
$$;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.funnel_events (
  event_id uuid primary key,
  session_id uuid not null,
  lead_id uuid references public.leads (id) on delete set null,
  event_name text not null check (event_name in (
    'funnel_started',
    'step_viewed',
    'step_completed',
    'step_validation_failed',
    'contact_preference_selected',
    'form_submitted',
    'funnel_completed',
    'booking_viewed',
    'booking_completed'
  )),
  step_key text,
  step_index integer check (step_index between 0 and 100),
  occurred_at timestamptz not null,
  utm jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  constraint funnel_events_step_key_check check (
    step_key is null or step_key ~ '^[a-z0-9][a-z0-9_-]{0,63}$'
  ),
  constraint funnel_events_utm_object_check check (jsonb_typeof(utm) = 'object'),
  constraint funnel_events_metadata_object_check check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.funnel_sessions (
  session_id uuid primary key,
  lead_id uuid references public.leads (id) on delete set null,
  status text not null check (status in ('in_progress', 'abandoned', 'completed')),
  last_step text,
  last_step_index integer check (last_step_index between 0 and 100),
  last_activity_at timestamptz not null,
  completed_at timestamptz,
  contact_preference text check (contact_preference in ('ligacao', 'whatsapp')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists private.funnel_rate_limits (
  client_key text not null,
  bucket_minute timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (client_key, bucket_minute)
);

create index if not exists funnel_events_session_occurred_idx
  on public.funnel_events (session_id, occurred_at desc, event_id);

create index if not exists funnel_events_lead_occurred_idx
  on public.funnel_events (lead_id, occurred_at desc, event_id)
  where lead_id is not null;

create index if not exists funnel_events_received_at_idx
  on public.funnel_events (received_at desc);

create index if not exists funnel_sessions_lead_activity_idx
  on public.funnel_sessions (lead_id, last_activity_at desc)
  where lead_id is not null;

create index if not exists funnel_sessions_last_activity_idx
  on public.funnel_sessions (last_activity_at desc)
  where completed_at is null;

create index if not exists leads_funnel_session_idx
  on public.leads (funnel_session_id)
  where funnel_session_id is not null;

create index if not exists leads_funnel_last_activity_idx
  on public.leads (funnel_last_activity_at desc)
  where funnel_last_activity_at is not null;

alter table public.funnel_events enable row level security;
alter table public.funnel_sessions enable row level security;
alter table private.funnel_rate_limits enable row level security;

revoke all on table public.funnel_events from public, anon, authenticated;
revoke all on table public.funnel_sessions from public, anon, authenticated;
revoke all on table private.funnel_rate_limits from public, anon, authenticated;
revoke all on table public.sdr_bridge_auth_failures from anon, authenticated;

grant select on table public.funnel_events to service_role;
grant select on table public.funnel_sessions to service_role;

create or replace function private.funnel_status_at(
  p_completed_at timestamptz,
  p_last_activity_at timestamptz,
  p_as_of timestamptz
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_completed_at is not null then 'completed'
    when p_last_activity_at <= p_as_of - interval '30 minutes' then 'abandoned'
    else 'in_progress'
  end;
$$;

create or replace function private.funnel_rate_limit(
  p_client_key text,
  p_limit integer,
  p_now timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into private.funnel_rate_limits (client_key, bucket_minute, request_count)
  values (p_client_key, date_trunc('minute', p_now), 1)
  on conflict (client_key, bucket_minute)
  do update set request_count = private.funnel_rate_limits.request_count + 1
  returning request_count into v_count;

  if v_count > p_limit then
    raise sqlstate 'PGRST' using
      message = jsonb_build_object(
        'code', 'tracker_rate_limited',
        'message', 'Limite de eventos excedido'
      )::text,
      detail = jsonb_build_object('status', 429)::text;
  end if;

  delete from private.funnel_rate_limits
  where bucket_minute < p_now - interval '1 hour';
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
        where e.session_id = p_session_id
          and e.lead_id is not null
        order by e.occurred_at desc, e.event_id desc
        limit 1
      ) as lead_id,
      (
        select e.step_key
        from public.funnel_events e
        where e.session_id = p_session_id
          and e.step_key is not null
          and e.step_index is not null
        order by e.step_index desc, e.occurred_at desc, e.event_id desc
        limit 1
      ) as last_step,
      (
        select e.step_index
        from public.funnel_events e
        where e.session_id = p_session_id
          and e.step_key is not null
          and e.step_index is not null
        order by e.step_index desc, e.occurred_at desc, e.event_id desc
        limit 1
      ) as last_step_index,
      max(e.occurred_at) as last_activity_at,
      min(e.occurred_at) filter (
        where e.event_name in ('form_submitted', 'funnel_completed')
      ) as completed_at,
      (
        select e.metadata ->> 'preference'
        from public.funnel_events e
        where e.session_id = p_session_id
          and e.event_name = 'contact_preference_selected'
          and e.metadata ->> 'preference' in ('ligacao', 'whatsapp')
        order by e.occurred_at desc, e.event_id desc
        limit 1
      ) as contact_preference
    from public.funnel_events e
    where e.session_id = p_session_id
  )
  insert into public.funnel_sessions (
    session_id,
    lead_id,
    status,
    last_step,
    last_step_index,
    last_activity_at,
    completed_at,
    contact_preference,
    updated_at
  )
  select
    a.session_id,
    a.lead_id,
    private.funnel_status_at(a.completed_at, a.last_activity_at, p_as_of),
    a.last_step,
    a.last_step_index,
    a.last_activity_at,
    a.completed_at,
    a.contact_preference,
    statement_timestamp()
  from aggregate a
  where a.last_activity_at is not null
  on conflict (session_id) do update set
    lead_id = excluded.lead_id,
    status = excluded.status,
    last_step = excluded.last_step,
    last_step_index = excluded.last_step_index,
    last_activity_at = excluded.last_activity_at,
    completed_at = excluded.completed_at,
    contact_preference = excluded.contact_preference,
    updated_at = excluded.updated_at
  returning * into v_summary;

  if v_summary.lead_id is null then
    return;
  end if;

  if v_summary.completed_at is not null then
    update public.leads
    set
      formulario_completo = true,
      atualizado_em = statement_timestamp()
    where id = v_summary.lead_id
      and formulario_completo = false;
  end if;

  update public.leads
  set
    preferencia_atendimento = coalesce(
      v_summary.contact_preference,
      public.leads.preferencia_atendimento
    ),
    formulario_completo = public.leads.formulario_completo
      or v_summary.completed_at is not null,
    funnel_session_id = v_summary.session_id,
    funnel_status = v_summary.status,
    funnel_last_step = v_summary.last_step,
    funnel_last_step_index = v_summary.last_step_index,
    funnel_last_activity_at = v_summary.last_activity_at,
    funnel_completed_at = v_summary.completed_at,
    atualizado_em = statement_timestamp()
  where id = v_summary.lead_id
    and (
      public.leads.funnel_session_id = v_summary.session_id
      or public.leads.funnel_last_activity_at is null
      or v_summary.last_activity_at >= public.leads.funnel_last_activity_at
    );
end;
$$;

create or replace function private.funnel_refresh_abandonment(
  p_as_of timestamptz default statement_timestamp()
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  with changed as (
    update public.funnel_sessions
    set
      status = 'abandoned',
      updated_at = statement_timestamp()
    where completed_at is null
      and last_activity_at <= p_as_of - interval '30 minutes'
      and status <> 'abandoned'
    returning session_id
  )
  update public.leads l
  set
    funnel_status = 'abandoned',
    atualizado_em = statement_timestamp()
  from changed c
  where l.funnel_session_id = c.session_id
    and l.funnel_status <> 'completed';
end;
$$;

create or replace function public.funnel_track_event(p_event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allowed_event_names constant text[] := array[
    'funnel_started',
    'step_viewed',
    'step_completed',
    'step_validation_failed',
    'contact_preference_selected',
    'form_submitted',
    'funnel_completed',
    'booking_viewed',
    'booking_completed'
  ];
  v_now timestamptz := statement_timestamp();
  v_headers jsonb := '{}'::jsonb;
  v_unknown jsonb;
  v_event_id uuid;
  v_session_id uuid;
  v_lead_id uuid;
  v_event_name text;
  v_step_key text;
  v_step_index integer;
  v_occurred_at timestamptz;
  v_utm jsonb := '{}'::jsonb;
  v_metadata jsonb := '{}'::jsonb;
  v_ip text;
  v_inserted boolean;
  v_associated integer := 0;
  v_existing public.funnel_events%rowtype;
begin
  if p_event is null or jsonb_typeof(p_event) <> 'object' then
    raise exception 'tracker: payload deve ser objeto' using errcode = '22023';
  end if;

  if pg_column_size(p_event) > 8192 then
    raise exception 'tracker: payload excede 8192 bytes' using errcode = '22023';
  end if;

  v_unknown := p_event - array[
    'event_id', 'session_id', 'lead_id', 'event_name', 'step_key',
    'step_index', 'occurred_at', 'utm', 'metadata'
  ]::text[];
  if v_unknown <> '{}'::jsonb then
    raise exception 'tracker: campos nao permitidos: %',
      array_to_string(array(select jsonb_object_keys(v_unknown)), ', ')
      using errcode = '22023';
  end if;

  begin
    v_event_id := nullif(p_event ->> 'event_id', '')::uuid;
    v_session_id := nullif(p_event ->> 'session_id', '')::uuid;
    v_lead_id := nullif(p_event ->> 'lead_id', '')::uuid;
  exception when invalid_text_representation then
    raise exception 'tracker: ids devem ser UUID validos' using errcode = '22023';
  end;

  if v_event_id is null or v_session_id is null then
    raise exception 'tracker: event_id e session_id sao obrigatorios' using errcode = '22023';
  end if;

  v_event_name := p_event ->> 'event_name';
  if v_event_name is null or not (v_event_name = any (v_allowed_event_names)) then
    raise exception 'tracker: event_name invalido' using errcode = '22023';
  end if;

  begin
    v_occurred_at := nullif(p_event ->> 'occurred_at', '')::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception 'tracker: occurred_at invalido' using errcode = '22023';
  end;

  if v_occurred_at is null
     or v_occurred_at < v_now - interval '7 days'
     or v_occurred_at > v_now + interval '5 minutes' then
    raise exception 'tracker: occurred_at invalido' using errcode = '22023';
  end if;

  v_step_key := nullif(p_event ->> 'step_key', '');
  if v_step_key is not null
     and v_step_key !~ '^[a-z0-9][a-z0-9_-]{0,63}$' then
    raise exception 'tracker: step_key invalido' using errcode = '22023';
  end if;

  if p_event ? 'step_index' and p_event -> 'step_index' <> 'null'::jsonb then
    begin
      v_step_index := (p_event ->> 'step_index')::integer;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'tracker: step_index invalido' using errcode = '22023';
    end;
    if v_step_index not between 0 and 100 then
      raise exception 'tracker: step_index invalido' using errcode = '22023';
    end if;
  end if;

  if v_event_name in ('step_viewed', 'step_completed', 'step_validation_failed')
     and (v_step_key is null or v_step_index is null) then
    raise exception 'tracker: evento de etapa exige step_key e step_index'
      using errcode = '22023';
  end if;

  if p_event ? 'utm' and p_event -> 'utm' <> 'null'::jsonb then
    if jsonb_typeof(p_event -> 'utm') <> 'object' then
      raise exception 'tracker: utm deve ser objeto' using errcode = '22023';
    end if;
    select coalesce(jsonb_object_agg(entry.key, entry.value), '{}'::jsonb)
      into v_utm
    from jsonb_each(p_event -> 'utm') as entry(key, value)
    where entry.key = any (array['source', 'medium', 'campaign', 'content', 'term'])
      and jsonb_typeof(entry.value) = 'string'
      and length(entry.value #>> '{}') <= 200;
  end if;

  if p_event ? 'metadata' and p_event -> 'metadata' <> 'null'::jsonb then
    if jsonb_typeof(p_event -> 'metadata') <> 'object' then
      raise exception 'tracker: metadata deve ser objeto' using errcode = '22023';
    end if;
    select coalesce(jsonb_object_agg(entry.key, entry.value), '{}'::jsonb)
      into v_metadata
    from jsonb_each(p_event -> 'metadata') as entry(key, value)
    where (
      entry.key = 'preference'
      and jsonb_typeof(entry.value) = 'string'
      and entry.value #>> '{}' in ('ligacao', 'whatsapp')
    ) or (
      entry.key = any (array['form_version', 'validation_code', 'booking_provider'])
      and jsonb_typeof(entry.value) = 'string'
      and entry.value #>> '{}' ~ '^[a-z0-9][a-z0-9_.-]{0,63}$'
    );
  end if;

  if v_event_name = 'contact_preference_selected'
     and coalesce(v_metadata ->> 'preference', '') not in ('ligacao', 'whatsapp') then
    raise exception 'tracker: preferencia obrigatoria' using errcode = '22023';
  end if;

  begin
    v_headers := coalesce(
      nullif(current_setting('request.headers', true), '')::jsonb,
      '{}'::jsonb
    );
  exception when others then
    v_headers := '{}'::jsonb;
  end;

  v_ip := nullif(trim(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1)), '');
  if v_ip is not null then
    perform private.funnel_rate_limit('ip:' || md5(v_ip), 120, v_now);
  end if;
  perform private.funnel_rate_limit('session:' || v_session_id::text, 60, v_now);

  perform pg_advisory_xact_lock(hashtextextended(v_session_id::text, 0));

  select * into v_existing
  from public.funnel_events
  where event_id = v_event_id;

  if found and (
    v_existing.session_id <> v_session_id
    or v_existing.event_name <> v_event_name
    or v_existing.occurred_at <> v_occurred_at
  ) then
    raise exception 'tracker: event_id reutilizado com payload diferente'
      using errcode = '22023';
  end if;

  if v_lead_id is not null then
    perform 1 from public.leads where id = v_lead_id;
    if not found then
      raise exception 'tracker: lead_id desconhecido' using errcode = '22023';
    end if;

    if exists (
      select 1
      from public.funnel_events
      where session_id = v_session_id
        and lead_id is not null
        and lead_id <> v_lead_id
    ) then
      raise exception 'tracker: sessao ja associada a outro lead'
        using errcode = '22023';
    end if;

    update public.funnel_events
    set lead_id = v_lead_id
    where session_id = v_session_id
      and lead_id is null;
    get diagnostics v_associated = row_count;
  end if;

  if v_existing.event_id is not null then
    if v_associated > 0 then
      perform private.funnel_refresh_session(v_session_id, v_now);
    end if;
    return jsonb_build_object('accepted', true, 'duplicate', true);
  end if;

  insert into public.funnel_events (
    event_id,
    session_id,
    lead_id,
    event_name,
    step_key,
    step_index,
    occurred_at,
    utm,
    metadata
  ) values (
    v_event_id,
    v_session_id,
    v_lead_id,
    v_event_name,
    v_step_key,
    v_step_index,
    v_occurred_at,
    v_utm,
    v_metadata
  )
  on conflict (event_id) do nothing;
  get diagnostics v_inserted = row_count;

  perform private.funnel_refresh_session(v_session_id, v_now);

  return jsonb_build_object('accepted', true, 'duplicate', not v_inserted);
end;
$$;

-- Mantem a assinatura usada pelos clientes publicados e apenas acrescenta o
-- novo campo gravavel. Os campos de resumo continuam fora da lista de UPDATE.
create or replace function public.funil_salvar(p_id uuid, p_dados jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.leads;
  v_novo public.leads;
  v_status text;
  v_valor text;
  v_preferencia text;
begin
  if p_id is null then
    raise exception 'id obrigatorio';
  end if;

  if p_dados ? 'status' then
    v_status := p_dados ->> 'status';
    if v_status not in (
      'novo', 'aguardando_decisao_valor', 'nao_atende_preco', 'valor_aceito_sem_agendamento'
    ) then
      raise exception 'status fora do que o formulario pode gravar: %', v_status;
    end if;
  end if;

  if p_dados ? 'preferencia_atendimento' then
    v_preferencia := p_dados ->> 'preferencia_atendimento';
    if v_preferencia is not null
       and v_preferencia not in ('ligacao', 'whatsapp') then
      raise exception 'preferencia_atendimento invalida';
    end if;
  end if;

  if jsonb_typeof(p_dados -> 'valor_informado') = 'string' then
    v_valor := nullif(
      replace(
        replace(
          regexp_replace(p_dados ->> 'valor_informado', '[^0-9.,]', '', 'g'), '.', ''
        ), ',', '.'
      ), ''
    );
    p_dados := p_dados - 'valor_informado';
    if v_valor is not null then
      p_dados := p_dados || jsonb_build_object('valor_informado', v_valor::numeric);
    end if;
  end if;

  select * into v_row from public.leads where id = p_id;

  if not found then
    insert into public.leads (id) values (p_id);
    select * into v_row from public.leads where id = p_id;
  elsif v_row.criado_em <= now() - interval '12 hours' then
    raise exception 'este lead ja passou da janela de edicao';
  end if;

  v_novo := jsonb_populate_record(v_row, p_dados);

  update public.leads set
    nome = v_novo.nome,
    whatsapp = v_novo.whatsapp,
    email = v_novo.email,
    trilha = v_novo.trilha,
    cnpj_aberto = v_novo.cnpj_aberto,
    regime_tributario = v_novo.regime_tributario,
    mei_quer_sair = v_novo.mei_quer_sair,
    faturamento_faixa = v_novo.faturamento_faixa,
    tem_contador = v_novo.tem_contador,
    funcionarios_faixa = v_novo.funcionarios_faixa,
    dor_principal = v_novo.dor_principal,
    tipo_atividade = v_novo.tipo_atividade,
    urgencia = v_novo.urgencia,
    melhor_horario_contato = v_novo.melhor_horario_contato,
    consentimento_whatsapp = v_novo.consentimento_whatsapp,
    multiplos_decisores = v_novo.multiplos_decisores,
    valor_informado = v_novo.valor_informado,
    formulario_completo = v_row.formulario_completo or v_novo.formulario_completo,
    preferencia_atendimento = v_novo.preferencia_atendimento,
    status = v_novo.status,
    utm_source = coalesce(v_row.utm_source, v_novo.utm_source),
    utm_campaign = coalesce(v_row.utm_campaign, v_novo.utm_campaign),
    utm_content = coalesce(v_row.utm_content, v_novo.utm_content),
    atualizado_em = now()
  where id = p_id;
end;
$$;

-- A assinatura e as acoes antigas permanecem. get/pull agora atualizam o
-- abandono derivado e retornam as novas colunas por fazerem to_jsonb da linha.
create or replace function public.sdr_bridge(
  p_token text,
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expected text;
  v_minute timestamptz := date_trunc('minute', now());
  v_failures integer;
  v_id uuid;
  v_row public.leads%rowtype;
  v_since timestamptz;
  v_fields jsonb;
  v_allowed text[] := array[
    'status', 'score', 'valor_informado', 'horario_agendado', 'multiplos_decisores',
    'ligacao_1_status', 'ligacao_1_em', 'ligacao_2_status', 'ligacao_2_em',
    'dia_tentativa_atual', 'ultima_ligacao_em', 'ultima_mensagem_diaria_em'
  ];
begin
  select failures into v_failures
  from public.sdr_bridge_auth_failures
  where bucket_minute = v_minute;

  if coalesce(v_failures, 0) >= 20 then
    raise exception 'sdr_bridge: rate limited' using errcode = '42501';
  end if;

  v_expected := public.sdr_bridge_token();
  if v_expected is null or p_token is null
     or pg_catalog.encode(extensions.digest(p_token, 'sha256'), 'hex')
        <> pg_catalog.encode(extensions.digest(v_expected, 'sha256'), 'hex') then
    insert into public.sdr_bridge_auth_failures (bucket_minute, failures)
    values (v_minute, 1)
    on conflict (bucket_minute) do update
      set failures = public.sdr_bridge_auth_failures.failures + 1;
    delete from public.sdr_bridge_auth_failures
    where bucket_minute < now() - interval '1 hour';
    raise exception 'sdr_bridge: unauthorized' using errcode = '42501';
  end if;

  if p_action = 'ping' then
    return jsonb_build_object('ok', true, 'leads', (select count(*) from public.leads));
  end if;

  if p_action = 'pull' then
    perform private.funnel_refresh_abandonment(statement_timestamp());
    v_since := coalesce((p_payload ->> 'since')::timestamptz, '1970-01-01'::timestamptz);
    return coalesce((
      select jsonb_agg(to_jsonb(l) order by l.atualizado_em, l.id)
      from (
        select *
        from public.leads
        where atualizado_em > v_since
        order by atualizado_em, id
        limit 200
      ) l
    ), '[]'::jsonb);
  end if;

  if p_action = 'get' then
    v_id := (p_payload ->> 'id')::uuid;
    perform private.funnel_refresh_abandonment(statement_timestamp());
    select * into v_row from public.leads where id = v_id;
    if not found then
      return 'null'::jsonb;
    end if;
    return to_jsonb(v_row);
  end if;

  if p_action = 'patch' then
    v_id := (p_payload ->> 'id')::uuid;
    v_fields := coalesce(p_payload -> 'fields', '{}'::jsonb);
    select jsonb_object_agg(key, value) into v_fields
    from jsonb_each(v_fields)
    where key = any (v_allowed);

    if v_fields is null or v_fields = '{}'::jsonb then
      return jsonb_build_object('ok', true, 'updated', 0);
    end if;

    select * into v_row from public.leads where id = v_id;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;

    v_row := jsonb_populate_record(v_row, v_fields);
    v_row.atualizado_em := now();
    update public.leads set
      status = v_row.status,
      score = v_row.score,
      valor_informado = v_row.valor_informado,
      horario_agendado = v_row.horario_agendado,
      multiplos_decisores = v_row.multiplos_decisores,
      ligacao_1_status = v_row.ligacao_1_status,
      ligacao_1_em = v_row.ligacao_1_em,
      ligacao_2_status = v_row.ligacao_2_status,
      ligacao_2_em = v_row.ligacao_2_em,
      dia_tentativa_atual = v_row.dia_tentativa_atual,
      ultima_ligacao_em = v_row.ultima_ligacao_em,
      ultima_mensagem_diaria_em = v_row.ultima_mensagem_diaria_em,
      atualizado_em = v_row.atualizado_em
    where id = v_id;
    return jsonb_build_object('ok', true, 'updated', 1);
  end if;

  if p_action = 'message' then
    insert into public.mensagens_whatsapp (lead_id, direcao, conteudo, tipo)
    values (
      (p_payload ->> 'lead_id')::uuid,
      p_payload ->> 'direcao',
      p_payload ->> 'conteudo',
      coalesce(p_payload ->> 'tipo', 'texto_livre')
    );
    return jsonb_build_object('ok', true);
  end if;

  raise exception 'sdr_bridge: unknown action %', p_action;
end;
$$;

revoke all on function private.funnel_status_at(timestamptz, timestamptz, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function private.funnel_rate_limit(text, integer, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function private.funnel_refresh_session(uuid, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function private.funnel_refresh_abandonment(timestamptz)
  from public, anon, authenticated, service_role;

revoke all on function public.funnel_track_event(jsonb) from public;
grant execute on function public.funnel_track_event(jsonb) to anon, authenticated, service_role;

revoke all on function public.funil_salvar(uuid, jsonb) from public;
grant execute on function public.funil_salvar(uuid, jsonb) to anon, authenticated, service_role;

revoke all on function public.sdr_bridge(text, text, jsonb) from public;
grant execute on function public.sdr_bridge(text, text, jsonb) to anon, authenticated, service_role;

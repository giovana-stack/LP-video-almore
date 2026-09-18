-- Expõe somente o resumo operacional de sessões do funil para o CRM.
-- Sessões sem lead continuam fora do Kanban: este endpoint não cria lead.

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

  if p_action = 'tracker_pull' then
    perform private.funnel_refresh_abandonment(statement_timestamp());
    v_since := coalesce((p_payload ->> 'since')::timestamptz, now() - interval '30 days');
    return coalesce((
      select jsonb_agg(summary order by summary->>'last_activity_at', summary->>'session_id')
      from (
        select jsonb_build_object(
          'session_id', s.session_id,
          'lead_id', s.lead_id,
          'status', s.status,
          'last_step', s.last_step,
          'last_step_index', s.last_step_index,
          'last_activity_at', s.last_activity_at,
          'completed_at', s.completed_at
        ) as summary
        from public.funnel_sessions s
        where s.last_activity_at > v_since
        order by s.last_activity_at, s.session_id
        limit 200
      ) rows
    ), '[]'::jsonb);
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

revoke all on function public.sdr_bridge(text, text, jsonb) from public;
grant execute on function public.sdr_bridge(text, text, jsonb) to anon, authenticated, service_role;

-- ============================================================================
-- Banco do funil da Almore
-- Projeto Supabase: "LP Almore Formulario" (ffdbojtidzmoklcpvnsz)
--
-- Schema da seção 2.2 do documento de execução (VERSÃO COM SDR DE VOZ).
--
-- UMA TABELA SÓ, e não duas. O formulário e a automação guardam a MESMA
-- pessoa: em tabelas separadas, seria preciso alguém copiando dados de uma
-- para a outra, e todo copiador tem uma janela em que as duas discordam. Aqui
-- o formulário escreve as colunas dele, a automação escreve as dela, e não
-- existe sincronia para quebrar.
--
-- Seguro rodar mais de uma vez: tudo é IF NOT EXISTS, CREATE OR REPLACE ou
-- DROP ... IF EXISTS antes de criar. Nada aqui apaga dado.
-- ============================================================================

create table if not exists public.leads (
  -- O id vem do NAVEGADOR, não do banco: é ele que permite a gravação parcial
  -- sem nunca abrir leitura pública. Veja src/lib/funil/persistencia.ts.
  id uuid primary key,

  -- ----------------------------------------------------- escrito pelo FORMULÁRIO
  nome     text,
  whatsapp text,  -- E.164, ex.: +5519999999999
  email    text,  -- pergunta 3 da tabela 1.3, coletada no formulário

  trilha      text check (trilha in ('A', 'B')),
  cnpj_aberto boolean,

  regime_tributario  text,  -- nulo na trilha B
  mei_quer_sair      boolean,
  faturamento_faixa  text,  -- nulo na trilha B
  tem_contador       text,  -- nulo na trilha B
  funcionarios_faixa text,  -- nulo na trilha B
  dor_principal      text,  -- nulo na trilha B
  tipo_atividade     text,  -- só na trilha B

  urgencia               text,
  melhor_horario_contato text,
  consentimento_whatsapp boolean not null default false,
  multiplos_decisores    boolean,

  -- Valor em número, como o documento pede. O texto exato que apareceu na
  -- tela sai da combinação regime + faturamento, então guardar a frase
  -- inteira seria guardar a mesma informação duas vezes.
  valor_informado numeric,

  utm_source   text,
  utm_campaign text,
  utm_content  text,

  -- ------------------------------------------------- escrito pela AUTOMAÇÃO
  -- O formulário NÃO escreve nada daqui pra baixo: a função funil_salvar()
  -- não lista essas colunas, então elas são inalcançáveis pelo navegador.
  ligacao_1_status text check (ligacao_1_status in ('nao_realizada', 'atendida', 'nao_atendida')),
  ligacao_1_em     timestamptz,
  ligacao_2_status text check (ligacao_2_status in ('nao_realizada', 'atendida', 'nao_atendida')),
  ligacao_2_em     timestamptz,

  dia_tentativa_atual       integer default 0,
  ultima_ligacao_em         timestamptz,
  ultima_mensagem_diaria_em timestamptz,
  horario_agendado          timestamptz,

  -- Seção 2.3. Não é calculado aqui: o brief põe a lógica de score fora do
  -- escopo do formulário. Fica nulo até a automação preencher.
  score integer,

  status text not null default 'novo' check (status in (
    'novo',
    'aguardando_decisao_valor',
    'nao_atende_preco',
    'valor_aceito_sem_agendamento',
    'aguardando_resposta',
    'em_conversa',
    'confirmado',
    'no_show',
    'convertido',
    'frio'
  )),

  -- ------------------------------------------------------------- derivadas
  -- Coluna gerada, não escrita: o documento define `tem_pendencias` como
  -- derivada de `dor_principal`. Sendo gerada, ela não tem como divergir da
  -- origem — nem por bug, nem por alguém escrevendo à mão.
  tem_pendencias boolean generated always as (
    dor_principal = 'Tenho pendências e quero regularizar a situação fiscal'
  ) stored,

  -- Não está na seção 2.2, mas o funil precisa: `status` não distingue quem
  -- abandonou no meio de quem terminou sem se encaixar numa regra de preço —
  -- os dois ficam em 'novo'. Sem esta coluna, não dá para listar quem falta
  -- completar.
  formulario_completo boolean not null default false,

  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- As perguntas que o comercial faz todo dia.
create index if not exists leads_criado_em_idx
  on public.leads (criado_em desc);

create index if not exists leads_incompletos_idx
  on public.leads (criado_em desc)
  where formulario_completo = false;

create index if not exists leads_status_idx
  on public.leads (status, criado_em desc);

-- ============================================================================
-- Histórico da conversa (seção 2.2). Território da automação: o formulário
-- não encosta nela. Fica criada para a FK valer desde o começo.
-- ============================================================================

create table if not exists public.mensagens_whatsapp (
  id        uuid primary key default gen_random_uuid(),
  lead_id   uuid not null references public.leads (id) on delete cascade,
  direcao   text not null check (direcao in ('enviada', 'recebida')),
  conteudo  text,
  tipo      text check (tipo in ('template', 'texto_livre', 'botao')),
  criado_em timestamptz not null default now()
);

create index if not exists mensagens_whatsapp_lead_idx
  on public.mensagens_whatsapp (lead_id, criado_em);

-- ============================================================================
-- RLS: as duas tabelas ficam FECHADAS. Ninguém entra por elas.
--
-- A primeira versão disto tentou policies de INSERT e UPDATE sem SELECT, para
-- que a chave pública nunca lesse leads. A ideia estava certa e a execução,
-- errada: no Postgres um `UPDATE ... WHERE id = X` precisa LOCALIZAR a linha
-- antes de alterá-la, e sem policy de SELECT ele não localiza nada. Medido: 0
-- linhas afetadas, com o PostgREST devolvendo 204 como se tivesse funcionado.
--
-- Abrir o SELECT resolveria e criaria coisa pior: a chave publishable está no
-- bundle do site, então qualquer visitante leria a base inteira.
--
-- A saída é não passar pela tabela. O público chama `funil_salvar`, que é
-- `security definer`, roda com os privilégios do dono e por isso enxerga a
-- linha. Para chamá-la é preciso saber o UUID, que é v4 e não está exposto em
-- lugar nenhum. Sem SELECT, ninguém descobre id alheio; sem id, nada acontece.
-- ============================================================================

alter table public.leads              enable row level security;
alter table public.mensagens_whatsapp enable row level security;

revoke all on table public.leads              from anon, authenticated;
revoke all on table public.mensagens_whatsapp from anon, authenticated;

-- ============================================================================
-- A única porta: funil_salvar(id, dados)
--
-- Cria a linha na primeira chamada e atualiza nas seguintes. A lista de
-- colunas do UPDATE é a lista de permissões: o que não está ali, o navegador
-- não escreve. Ficam de fora, de propósito: id, criado_em, atualizado_em,
-- score, horario_agendado e todo o bloco de ligações — colunas da automação.
-- ============================================================================

create or replace function public.funil_salvar(p_id uuid, p_dados jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row    public.leads;
  v_novo   public.leads;
  v_status text;
  v_valor  text;
begin
  if p_id is null then
    raise exception 'id obrigatorio';
  end if;

  -- O formulário só pode gravar os quatro status dele. Os outros pertencem à
  -- automação, que entra pelo servidor com a chave secreta.
  if p_dados ? 'status' then
    v_status := p_dados ->> 'status';
    if v_status not in (
      'novo', 'aguardando_decisao_valor', 'nao_atende_preco', 'valor_aceito_sem_agendamento'
    ) then
      raise exception 'status fora do que o formulario pode gravar: %', v_status;
    end if;
  end if;

  -- `valor_informado` virou numeric quando a seção 2.2 entrou. A versão do
  -- site publicada antes disso manda a frase da tela ("A partir de R$600/mês"),
  -- e `jsonb_populate_record` estouraria ao tentar convertê-la. Em vez de
  -- derrubar a gravação inteira por causa de um campo, extraímos o número; se
  -- não sobrar número nenhum, a chave sai e o resto do lead é salvo.
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
    -- Passada a janela, a linha vira só leitura para o público. Limita o
    -- estrago caso um id vaze pelo histórico do navegador de alguém.
    raise exception 'este lead ja passou da janela de edicao';
  end if;

  -- Mescla: o que veio no jsonb por cima do que já está gravado. Chave ausente
  -- mantém o valor atual; chave com null limpa o campo — que é como as
  -- respostas órfãs são apagadas quando o lead volta e troca o regime.
  v_novo := jsonb_populate_record(v_row, p_dados);

  update public.leads set
    nome                   = v_novo.nome,
    whatsapp               = v_novo.whatsapp,
    email                  = v_novo.email,
    trilha                 = v_novo.trilha,
    cnpj_aberto            = v_novo.cnpj_aberto,
    regime_tributario      = v_novo.regime_tributario,
    mei_quer_sair          = v_novo.mei_quer_sair,
    faturamento_faixa      = v_novo.faturamento_faixa,
    tem_contador           = v_novo.tem_contador,
    funcionarios_faixa     = v_novo.funcionarios_faixa,
    dor_principal          = v_novo.dor_principal,
    tipo_atividade         = v_novo.tipo_atividade,
    urgencia               = v_novo.urgencia,
    melhor_horario_contato = v_novo.melhor_horario_contato,
    consentimento_whatsapp = v_novo.consentimento_whatsapp,
    multiplos_decisores    = v_novo.multiplos_decisores,
    valor_informado        = v_novo.valor_informado,
    formulario_completo    = v_novo.formulario_completo,
    status                 = v_novo.status,
    -- A origem é gravada uma vez e não se mexe mais: quem trouxe o lead foi a
    -- primeira campanha, não a última página que ele abriu.
    utm_source             = coalesce(v_row.utm_source, v_novo.utm_source),
    utm_campaign           = coalesce(v_row.utm_campaign, v_novo.utm_campaign),
    utm_content            = coalesce(v_row.utm_content, v_novo.utm_content),
    atualizado_em          = now()
  where id = p_id;
end;
$$;

revoke all on function public.funil_salvar(uuid, jsonb) from public;
grant execute on function public.funil_salvar(uuid, jsonb) to anon, authenticated;

-- ============================================================================
-- A `funil_leads` foi o primeiro nome desta tabela, antes de a seção 2.2
-- entrar na conversa. O que estiver lá dentro é COPIADO para `leads` antes de
-- ela sair — nenhum lead se perde na troca de nome. `on conflict do nothing`
-- deixa o bloco seguro para rodar de novo.
-- ============================================================================

do $$
declare
  v_migradas integer := 0;
begin
  if to_regclass('public.funil_leads') is null then
    raise notice 'funil_leads nao existe, nada a fazer';
    return;
  end if;

  -- `valor_informado` era texto ("A partir de R$600/mês") e agora é numeric.
  -- Tira tudo que não é dígito, remove o ponto de milhar e troca a vírgula
  -- decimal por ponto: "R$1.200,00 fixo" vira 1200.00.
  execute $mig$
    insert into public.leads (
      id, criado_em, atualizado_em, nome, whatsapp, email, cnpj_aberto, trilha,
      regime_tributario, mei_quer_sair, faturamento_faixa, tem_contador,
      funcionarios_faixa, dor_principal, tipo_atividade, urgencia,
      melhor_horario_contato, consentimento_whatsapp, formulario_completo,
      valor_informado, multiplos_decisores, status,
      utm_source, utm_campaign, utm_content
    )
    select
      id, criado_em, atualizado_em, nome, whatsapp, email, cnpj_aberto, trilha,
      regime_tributario, mei_quer_sair, faturamento_faixa, tem_contador,
      funcionarios_faixa, dor_principal, tipo_atividade, urgencia,
      melhor_horario_contato, consentimento_whatsapp, formulario_completo,
      nullif(
        replace(
          replace(regexp_replace(coalesce(valor_informado, ''), '[^0-9.,]', '', 'g'), '.', ''),
          ',', '.'
        ), ''
      )::numeric,
      multiplos_decisores, status,
      utm_source, utm_campaign, utm_content
    from public.funil_leads
    on conflict (id) do nothing
  $mig$;

  get diagnostics v_migradas = row_count;
  raise notice 'migradas % linha(s) de funil_leads para leads', v_migradas;

  drop table public.funil_leads;
  raise notice 'funil_leads removida';
end;
$$;

-- ============================================================================
-- Conferência depois de rodar
-- ============================================================================
-- select tablename, rowsecurity from pg_tables where schemaname='public';
--   -> leads e mensagens_whatsapp, as duas com rowsecurity = true
--
-- select count(*) from pg_policies where schemaname='public';
--   -> 0 (as tabelas são fechadas; entra-se pela função)
--
-- select has_table_privilege('anon','public.leads','SELECT'),
--        has_function_privilege('anon','public.funil_salvar(uuid,jsonb)','EXECUTE');
--   -> false, true

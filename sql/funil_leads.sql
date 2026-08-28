-- ============================================================================
-- Tabela do funil de captação da Almore
-- Projeto Supabase: "LP Almore Formulario" (ffdbojtidzmoklcpvnsz)
--
-- Rode no SQL Editor do Supabase. É seguro rodar mais de uma vez: tudo aqui é
-- IF NOT EXISTS, CREATE OR REPLACE ou DROP ... IF EXISTS antes de criar. Nada
-- neste arquivo apaga dado nem altera coluna existente.
--
-- O nome é `funil_leads` e não `leads` porque `leads` já está ocupada.
-- ============================================================================

create table if not exists public.funil_leads (
  -- O id vem do NAVEGADOR, não do banco: é ele que permite a gravação parcial
  -- sem nunca abrir leitura pública. Veja src/lib/funil/persistencia.ts.
  id uuid primary key,

  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  -- Bloco 1 — a primeira gravação, feita assim que o lead avança.
  nome     text,
  whatsapp text,  -- E.164, ex.: +5519999999999
  email    text,

  -- Bifurcação
  cnpj_aberto boolean,
  trilha      text check (trilha in ('A', 'B')),

  -- Trilha A
  regime_tributario  text,
  mei_quer_sair      boolean,
  faturamento_faixa  text,
  tem_contador       text,
  funcionarios_faixa text,
  dor_principal      text,

  -- Trilha B
  tipo_atividade text,

  -- Ambas
  urgencia               text,
  melhor_horario_contato text,

  -- Fechamento
  consentimento_whatsapp boolean not null default false,
  formulario_completo    boolean not null default false,
  valor_informado        text,
  multiplos_decisores    boolean,

  -- Os quatro primeiros são escritos pelo formulário. Os demais são da
  -- automação do CRM e estão no check para que ela grave sem precisar mexer
  -- na constraint depois.
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

  -- Origem
  utm_source   text,
  utm_campaign text,
  utm_content  text
);

-- As duas perguntas que o CRM faz todo dia: "quem chegou hoje" e "quem
-- abandonou no meio".
create index if not exists funil_leads_criado_em_idx
  on public.funil_leads (criado_em desc);

create index if not exists funil_leads_incompletos_idx
  on public.funil_leads (criado_em desc)
  where formulario_completo = false;

-- ============================================================================
-- RLS: a tabela fica FECHADA. Ninguém entra por ela.
--
-- A primeira versão disto tentou ser mais simples: policy de INSERT, policy de
-- UPDATE e nenhuma de SELECT, para que a chave pública nunca lesse leads. A
-- ideia estava certa e a execução, errada — no Postgres, um
-- `UPDATE ... WHERE id = X` precisa LOCALIZAR a linha antes de alterá-la, e
-- sem policy de SELECT ele não localiza nada. Resultado medido: 0 linhas
-- afetadas, e o PostgREST devolvendo 204 como se tivesse funcionado. A
-- gravação parcial falhava em silêncio.
--
-- Abrir o SELECT resolveria o UPDATE e criaria um problema pior: a chave
-- publishable está no bundle do site, então qualquer visitante leria a base de
-- leads inteira — nome, telefone e e-mail de todo mundo.
--
-- A saída é não passar pela tabela. O público chama uma função
-- `security definer`, que roda com os privilégios do dono e por isso enxerga a
-- linha. Para chamá-la é preciso saber o UUID, que é v4 e não está exposto em
-- lugar nenhum. Sem SELECT, ninguém descobre id alheio; sem id, a função não
-- faz nada.
-- ============================================================================

alter table public.funil_leads enable row level security;

-- Tira as policies da primeira versão, se existirem.
drop policy if exists "funil: qualquer um cria seu proprio lead" on public.funil_leads;
drop policy if exists "funil: atualiza a propria linha por 12h" on public.funil_leads;

-- Sem policy nenhuma e com RLS ligado, a tabela fica inacessível para anon:
-- nem lê, nem escreve, nem apaga. Só o dono e a função abaixo entram.
revoke all on table public.funil_leads from anon, authenticated;

-- ============================================================================
-- A única porta: funil_salvar(id, dados)
--
-- Cria a linha na primeira chamada e atualiza nas seguintes. A lista de
-- colunas do UPDATE é a lista de permissões: o que não está ali, o público não
-- escreve. `id`, `criado_em` e `atualizado_em` ficam de fora de propósito.
-- ============================================================================

create or replace function public.funil_salvar(p_id uuid, p_dados jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row   public.funil_leads;
  v_novo  public.funil_leads;
  v_status text;
begin
  if p_id is null then
    raise exception 'id obrigatorio';
  end if;

  -- O formulário só pode gravar os quatro status dele. Os outros pertencem à
  -- automação do CRM, que entra pelo servidor com a chave secreta.
  if p_dados ? 'status' then
    v_status := p_dados ->> 'status';
    if v_status not in (
      'novo', 'aguardando_decisao_valor', 'nao_atende_preco', 'valor_aceito_sem_agendamento'
    ) then
      raise exception 'status fora do que o formulario pode gravar: %', v_status;
    end if;
  end if;

  select * into v_row from public.funil_leads where id = p_id;

  if not found then
    insert into public.funil_leads (id) values (p_id);
    select * into v_row from public.funil_leads where id = p_id;
  elsif v_row.criado_em <= now() - interval '12 hours' then
    -- Passada a janela, a linha vira só leitura para o público. Limita o
    -- estrago caso um id vaze pelo histórico do navegador de alguém.
    raise exception 'este lead ja passou da janela de edicao';
  end if;

  -- Mescla: o que veio no jsonb por cima do que já está gravado. Chave ausente
  -- mantém o valor atual; chave com null limpa o campo — que é como as
  -- respostas órfãs são apagadas quando o lead volta e troca o regime.
  v_novo := jsonb_populate_record(v_row, p_dados);

  update public.funil_leads set
    nome                   = v_novo.nome,
    whatsapp               = v_novo.whatsapp,
    email                  = v_novo.email,
    cnpj_aberto            = v_novo.cnpj_aberto,
    trilha                 = v_novo.trilha,
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
    formulario_completo    = v_novo.formulario_completo,
    valor_informado        = v_novo.valor_informado,
    multiplos_decisores    = v_novo.multiplos_decisores,
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
-- Conferência depois de rodar
-- ============================================================================
-- select tablename, rowsecurity from pg_tables
--   where schemaname='public' and tablename='funil_leads';
--   -> rowsecurity = true
--
-- select count(*) from pg_policies
--   where schemaname='public' and tablename='funil_leads';
--   -> 0 (nenhuma: a tabela é fechada, entra-se pela função)
--
-- select has_table_privilege('anon','public.funil_leads','SELECT'),
--        has_function_privilege('anon','public.funil_salvar(uuid,jsonb)','EXECUTE');
--   -> false, true

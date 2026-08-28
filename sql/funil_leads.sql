-- ============================================================================
-- Tabela do funil de captação da Almore
-- Projeto Supabase: "LP Almore Formulario" (ffdbojtidzmoklcpvnsz)
--
-- Rode no SQL Editor do Supabase. É seguro rodar mais de uma vez: tudo aqui é
-- IF NOT EXISTS ou DROP ... IF EXISTS antes de criar. Nada neste arquivo apaga
-- dado nem altera coluna existente.
--
-- O nome é `funil_leads` e não `leads` porque `leads` já está ocupada por
-- outra coisa.
-- ============================================================================

create table if not exists public.funil_leads (
  -- O id vem do NAVEGADOR, não do banco. Veja o porquê em
  -- src/lib/funil/persistencia.ts: sem isso seria preciso abrir SELECT para o
  -- público, e aí qualquer visitante leria a base de leads inteira.
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

  -- Os quatro primeiros status são escritos pelo formulário. Os demais são da
  -- automação do CRM e estão no check para que ela possa gravá-los sem que a
  -- constraint precise ser mexida de novo.
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

-- Índices para as duas perguntas que o CRM vai fazer todo dia: "quem chegou
-- hoje" e "quem abandonou no meio".
create index if not exists funil_leads_criado_em_idx
  on public.funil_leads (criado_em desc);

create index if not exists funil_leads_incompletos_idx
  on public.funil_leads (criado_em desc)
  where formulario_completo = false;

-- ============================================================================
-- RLS
--
-- O modelo aqui é: o público ESCREVE e nunca LÊ.
--
-- Não existe policy de SELECT de propósito. Sem ela, a chave publishable — que
-- está visível no bundle do site — não consegue trazer nenhum lead de volta.
-- Mesmo quem descobrir a chave não lê nome, telefone nem e-mail de ninguém.
--
-- O que protege o UPDATE são três coisas somadas:
--   1. sem SELECT, não dá para descobrir os ids alheios;
--   2. o id é UUID v4, então também não dá para adivinhar;
--   3. a janela de 12 horas abaixo, que fecha a linha depois que ela esfria.
--
-- Quem precisa LER os leads (você, o CRM, a automação) usa a chave secreta no
-- servidor, que ignora RLS por definição.
-- ============================================================================

alter table public.funil_leads enable row level security;

drop policy if exists "funil: qualquer um cria seu proprio lead" on public.funil_leads;
create policy "funil: qualquer um cria seu proprio lead"
  on public.funil_leads
  for insert
  to anon, authenticated
  with check (
    -- Ninguém nasce completo nem já com status de etapa avançada: essas
    -- transições acontecem por UPDATE, no fim do fluxo.
    formulario_completo = false
    and status = 'novo'
  );

drop policy if exists "funil: atualiza a propria linha por 12h" on public.funil_leads;
create policy "funil: atualiza a propria linha por 12h"
  on public.funil_leads
  for update
  to anon, authenticated
  using (criado_em > now() - interval '12 hours')
  with check (criado_em > now() - interval '12 hours');

-- Sem policy de SELECT, DELETE ou de qualquer outra coisa. É intencional:
-- no Postgres, o que RLS não libera fica bloqueado.

-- ============================================================================
-- Conferência rápida depois de rodar
-- ============================================================================
-- select tablename, rowsecurity from pg_tables
--   where schemaname = 'public' and tablename = 'funil_leads';
--   -> rowsecurity deve ser true
--
-- select policyname, cmd from pg_policies
--   where schemaname = 'public' and tablename = 'funil_leads';
--   -> devem aparecer exatamente duas linhas: INSERT e UPDATE

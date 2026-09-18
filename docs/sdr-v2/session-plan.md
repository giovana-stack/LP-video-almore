# Plano de sessões

## Quantidade

Recomendação: **seis sessões no total**.

- esta sessão permanece como **Sessão 0 — Coordenação**;
- abrir cinco novas sessões de trabalho;
- quatro sessões podem trabalhar em paralelo;
- a sessão de integração começa somente quando as quatro implementações
  entregarem seus commits e relatórios.

## Regra de Git

Não abrir duas sessões escrevendo no mesmo checkout. Use worktrees separados.
O Pantera está com WIP local que contém parte da solução e algumas suposições
agora invalidadas. As sessões do Pantera precisam partir do mesmo snapshot da
working tree atual ou de um branch/checkpoint criado especificamente para este
trabalho. Não partir de `main` puro, pois isso perderia o WIP que precisa ser
corrigido.

Cada sessão deve:

1. alterar somente seu escopo;
2. preservar alterações alheias;
3. executar testes focados, typecheck e build aplicáveis;
4. criar um commit pequeno e identificado na própria branch;
5. informar commit, arquivos alterados, testes e pendências à Coordenação.

## Sessões

| Sessão | Projeto/repositório | Pode começar | Responsabilidade |
|---|---|---:|---|
| 0. Coordenação | Pantera, sessão atual | agora | decisões, contratos, conflitos e merge final |
| 1. Pantera — CRM e ownership | Pantera, worktree próprio | agora | aba Landing Page, tracker resumido, claim atômico de SDR |
| 2. Pantera — automação e voz | Pantera, worktree próprio | agora | canal, 22h–07h, templates, identidade da voz, pool de closers |
| 3. LP — UX e tracker | repositório da landing page, worktree próprio | agora | escolha final e instrumentação de eventos no frontend |
| 4. LP — banco e bridge | repositório da landing page, worktree próprio | agora | tabelas/RPC do tracker e extensão do `sdr_bridge` |
| 5. Integração e E2E | Pantera, worktree criado após merges | depois de 1–4 | contrato, regressão e roteiro ponta a ponta |

## Limites para evitar conflitos

### Sessão 1

Pode alterar principalmente:

- `src/pages/pipeline/**`;
- rotas, Sidebar e TopBar;
- componentes de card/gaveta relacionados ao quadro;
- migration/RPC exclusivamente de claim/ownership;
- testes do quadro e claim.

Não altera motor SDR, voz, Meta ou arquivos do repositório da LP.

### Sessão 2

Pode alterar principalmente:

- `supabase/functions/_shared/sdr/**`;
- `supabase/functions/_shared/voice/**`;
- `supabase/functions/voice-*`;
- migration WIP de preferência/callback/voz;
- documentação/configuração dos templates.

Não altera Pipeline/Kanban nem implementação da landing page.

### Sessão 3

Pode alterar no repositório da LP:

- componentes e estado do formulário;
- escolha voz/WhatsApp;
- cliente do tracker;
- persistência de `session_id`;
- testes de interface e eventos.

Não cria tabelas nem reescreve `sdr_bridge`.

### Sessão 4

Pode alterar no repositório da LP:

- migrations do banco;
- tabela/RPC de eventos;
- resumo da sessão;
- `sdr_bridge` `get`/`pull`;
- testes SQL/contrato.

Não altera a interface visual do formulário.

### Sessão 5

Não adiciona escopo novo. Deve:

- integrar os commits aprovados;
- validar contrato dos dois lados;
- corrigir apenas incompatibilidades encontradas;
- produzir relatório de prontidão e passos de deploy;
- não ativar produção sem autorização explícita.

## Dependências

```text
Sessão 1 ─┐
Sessão 2 ─┼──> Sessão 5 (integração/E2E)
Sessão 3 ─┤
Sessão 4 ─┘

Sessão 0 acompanha todas e decide conflitos.
```

## Ordem prática

1. Manter esta sessão aberta como coordenação.
2. Criar worktrees/sessões 1 e 2 no Pantera a partir do mesmo snapshot.
3. Abrir o repositório real da landing page e criar sessões 3 e 4.
4. Colar em cada uma o prompt correspondente de `prompts/`.
5. Trazer para a coordenação o commit e relatório de cada sessão.
6. Só então abrir a sessão 5.

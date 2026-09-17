# SDR IA + Landing Page — contexto mestre

Este diretório é a fonte de verdade para o desenvolvimento coordenado entre o
Pantera e o repositório da landing page da Almore.

## Objetivo

Integrar os leads de `https://form.almorecontabilidade.com.br/` ao Pantera com:

- quadro Kanban próprio chamado **Landing Page**, separado do Pipeline de
  tráfego pago;
- escolha final do Ramo B entre ligação do SDR de voz e atendimento por
  WhatsApp;
- bloqueio de ligação para formulários concluídos entre 22h e 07h, até que o
  lead responda no WhatsApp com uma hora exata entre 07h e 22h;
- tracker do funil da landing page, incluindo a última etapa alcançada,
  abandono e conclusão;
- atribuição manual de SDR pelo primeiro usuário que clicar em **Pegar lead**;
- agendamento em calendário somente para closers;
- voz masculina, natural, institucional e sem nome pessoal por enquanto.

## Decisões confirmadas

### Origem e quadros

- Lead vindo da landing page aparece na aba **Landing Page**.
- Lead de tráfego pago continua no **Pipeline**.
- A separação deve usar um marcador persistente de origem, não UTM isolada.
- Movimentação de card, filtros e detalhes continuam iguais aos do Kanban atual.

### Preferência de atendimento do Ramo B

- Valores canônicos: `voice` e `whatsapp`.
- A landing page pode enviar `ligacao`; a ponte normaliza para `voice`.
- Campo ausente ou inválido cai em `whatsapp`, para nunca ligar sem escolha.
- Ramo A não muda por causa dessa escolha.

### Regra de horário

- Formulário concluído entre 22:00 e 06:59: apenas template da Meta.
- A ligação só pode ser criada depois de uma resposta com hora exata em
  `[07:00, 22:00)`.
- Respostas vagas como “de manhã” não autorizam ligação.
- A confirmação deve dizer **“Você receberá uma ligação da Almore...”**, sem
  prometer que uma pessoa específica ligará.

### SDR e ownership

- SDRs não usam agenda para esse fluxo.
- O lead entra sem SDR atribuído.
- O primeiro SDR que clicar em **Pegar lead** assume o lead.
- A atribuição precisa ser atômica no banco para impedir que duas pessoas
  ganhem o mesmo lead.
- Templates enviados antes da atribuição nunca usam nome de SDR.
- Depois da atribuição, mensagens humanas podem apresentar o nome do SDR.

### Closers e agenda

Somente closers entram na seleção de calendário. Lista temporária confirmada:

- Larissa;
- Diego;
- Patty — `patty_gurnhak@hotmail.com` (perfil ativo, Gestor + Closer).

No código, resolver por UUID de perfil ou e-mail normalizado. Nunca usar apenas
o nome exibido. Os identificadores exatos de Larissa e Diego devem ser
confirmados no banco antes de fechar a migração.

### Identidade da voz

- Voz masculina.
- Sem nome pessoal por enquanto; não usar “Pedro”.
- Abertura institucional recomendada:

  > Oi, {{nome}}, tudo bem? Aqui é o atendimento automatizado da Almore. Você
  > pediu nosso contato pelo formulário. Pode falar rapidinho?

- Depois da abertura, não repetir que é automação.
- Falar de forma natural não significa fingir ser humano. O agente nunca deve
  afirmar que é uma pessoa real nem negar a automação quando perguntado.
- Se perguntarem, responder de forma curta e honesta que é o atendimento
  automatizado da Almore.

### Templates da Meta

- Usar identidade da empresa, não identidade pessoal.
- Evitar “Pedro vai ligar”, “seu SDR” ou qualquer nome antes do claim.
- Formulações preferidas:
  - “Uma pessoa do nosso time comercial continuará seu atendimento por aqui.”
  - “Você receberá uma ligação da Almore no horário combinado.”
- Se o template aprovado atual exigir nome de agente, criar uma nova versão
  institucional e submetê-la à Meta. Não encaixar “time comercial” numa frase
  desenhada gramaticalmente para nome próprio.

## Tracker da landing page

O tracker deve responder:

- a pessoa iniciou o funil?
- qual foi a última etapa vista e concluída?
- em qual etapa parou?
- chegou ao final do formulário?
- escolheu voz ou WhatsApp?
- abriu ou concluiu o agendamento, quando aplicável?

Eventos detalhados permanecem no banco da landing page. O Pantera recebe apenas
o resumo necessário para operação e para exibir o estado do lead.

## Estado do WIP no Pantera em 17/09/2026

Há alterações locais ainda não implantadas. Elas são ponto de partida, não
versão aprovada. Antes do deploy, corrigir obrigatoriamente:

1. remover calendários/allowlist de SDR;
2. adicionar Patty ao pool de closers pelo identificador estável;
3. retirar o nome “Pedro” da voz, disclosure e textos de callback;
4. trocar “vou te ligar” por uma confirmação institucional;
5. revisar o template inicial para não depender de nome de agente;
6. integrar o resumo do tracker da landing page.

Não aplicar a migration WIP nem fazer deploy das Edge Functions antes dessas
correções e da rodada de integração.

## Documentos deste pacote

- [`integration-contract.md`](integration-contract.md): contrato entre os
  repositórios e modelo do tracker.
- [`session-plan.md`](session-plan.md): quantidade, ordem e ownership das
  sessões.
- [`prompts/`](prompts/): prompts iniciais prontos para copiar.

# SDR IA + Landing Page — cópia de handoff

Fonte recebida: `sessao/README.md` na raiz do checkout coordenador, lida em
17/09/2026. Este diretório acompanha o código da landing page para que o
contrato permaneça acessível no worktree isolado.

## Objetivo aplicável à landing page

- Manter a origem operacional `Landing Page SDR`, sem trocar essa origem por
  uma UTM de mídia paga.
- No fim do Ramo B, obrigar a escolha entre ligação e WhatsApp.
- Rastrear início, passos, abandono derivado e conclusão. Abandono não é
  enviado pelo navegador: é derivado após 30 minutos sem atividade e sem
  `funnel_completed`.
- Usar textos institucionais; não prometer uma pessoa específica para ligação.

## Decisões de integração preservadas

- A landing envia `ligacao` ou `whatsapp`; a ponte do Pantera normaliza
  `ligacao` para `voice`.
- Preferência ausente ou inválida deve ser WhatsApp no Pantera. A UI desta
  landing não permite ausência no Ramo B.
- Eventos detalhados ficam no banco do tracker da landing; o Pantera recebe
  somente o resumo operacional por `sdr_bridge`.
- Nenhum campo de formulário, documento, telefone ou e-mail pode ser enviado
  em `metadata`.

Consulte [integration-contract.md](integration-contract.md) para o payload
aplicado pelo cliente.

# Evidência TDD — contrato de etapas do tracker

## Origem

Jornada derivada durante este reparo: uma pessoa que abandona o formulário em
qualquer etapa deve ter seus eventos aceitos pelo tracker, com `step_key` e
`step_index` estáveis, para que o Pantera possa exibir a última etapa.

## Evidência

| # | Garantia | Teste | Tipo | Resultado |
|---|---|---|---|---|
| 1 | Uma etapa interna é traduzida para `step_key` e `step_index` exigidos pela RPC. | `src/lib/funil/passos.test.ts` | unidade | PASS |
| 2 | A ausência de etapa não gera texto visual nem valores inventados. | `src/lib/funil/passos.test.ts` | unidade | PASS |
| 3 | A navegação existente do formulário continua funcional. | `src/components/funil/FormularioAlmore.test.tsx` | componente | PASS |

RED: `npm test -- src/lib/funil/passos.test.ts` falhou porque
`passoParaEvento` ainda não existia. GREEN: o mesmo teste e o teste do tracker
passaram após a conversão de `key/index` para `step_key/step_index`.

## Verificação

- `npm test` — 3 arquivos, 8 testes aprovados.
- `npm run typecheck` — aprovado.
- `npm run build` — aprovado.
- `npx vitest run --coverage` não pôde gerar relatório: o projeto não possui
  `@vitest/coverage-v8`. Nenhuma dependência foi adicionada apenas para esta
  correção.

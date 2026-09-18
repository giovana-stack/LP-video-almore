# Evidências TDD — backend SDR v2

## Fonte e jornadas

Fonte: [`../sdr-v2/session-plan.md`](../sdr-v2/session-plan.md), sessão 4, e
[`../sdr-v2/integration-contract.md`](../sdr-v2/integration-contract.md).

- Como visitante anônimo, quero registrar eventos sem obter leitura da base.
- Como operação comercial, quero um resumo determinístico mesmo com entrega
  duplicada ou fora de ordem.
- Como integração Pantera, quero receber os campos novos por `get` e `pull`
  sem quebrar ações e clientes antigos.
- Como responsável por segurança, quero validação estrita, ausência de PII nos
  eventos e limitação de abuso do endpoint público.

## RED e GREEN

Comando em ambas as fases:

```sh
bash scripts/test-sdr-v2-sql.sh
```

RED, antes da migration:

```text
ERROR: ASSERTION FAILED: a migration cria a tabela de eventos
```

Checkpoint: `444af5092c71884c9433807097c7273c6efe7751`.

GREEN, depois da migration:

```text
ROLLBACK
PASS: contrato SQL SDR v2 validado
```

Checkpoint: `f1559a1930138a3af0d9a3c32b677a4a54fb2ea7`.

O runner cria PostgreSQL 18.6 em um diretório temporário, carrega o schema
existente, aplica somente migrations locais e encerra removendo todos os dados.
O projeto remoto usa PostgreSQL 17.6; a implementação usa recursos disponíveis
nas duas versões.

## Especificação coberta

| # | Garantia | Tipo | Resultado |
|---|---|---|---|
| 1 | `event_id` repetido não duplica armazenamento | integração SQL | PASS |
| 2 | `anon` e `authenticated` não leem eventos ou resumos | segurança/RLS | PASS |
| 3 | Somente a RPC pública possui `EXECUTE`; helpers privados não | segurança/contrato | PASS |
| 4 | Campos desconhecidos, enum inválido e timestamp fora da janela falham | validação | PASS |
| 5 | UTM e metadata descartam chaves fora da allowlist | privacidade | PASS |
| 6 | Eventos fora de ordem preservam etapa máxima e atividade mais recente | integração SQL | PASS |
| 7 | Sessão incompleta e inativa por 30 minutos vira `abandoned` | regra temporal | PASS |
| 8 | `lead_id` tardio associa também eventos anteriores | integração SQL | PASS |
| 9 | O resumo no lead contém sessão, etapa, preferência e conclusão | contrato | PASS |
| 10 | Payload antigo de `funil_salvar` continua válido | regressão | PASS |
| 11 | `sdr_bridge get/pull` contém todos os campos novos | contrato | PASS |
| 12 | `sdr_bridge ping` continua funcionando | regressão | PASS |
| 13 | Há índices de sessão, lead e última atividade | schema/performance | PASS |
| 14 | A 61ª chamada da mesma sessão no minuto sofre rate limit | segurança | PASS |
| 15 | A RPC privilegiada fixa `search_path` vazio | segurança | PASS |

## Cobertura e lacunas conhecidas

A suíte é transacional e termina em `ROLLBACK`; não há testes ignorados. Como
o artefato é SQL puro, não existe instrumentação de cobertura de linhas no
repositório. A cobertura foi medida por requisitos: todos os dez itens do
briefing têm ao menos uma asserção de contrato, e os caminhos de erro públicos
possuem testes dedicados.

Os advisors foram consultados antes e depois do deploy. Após a migration, eles
registraram avisos para tabelas com RLS deny-all, funções `SECURITY DEFINER`
públicas e índices novos ainda sem uso. Esse padrão é intencional: as tabelas
não têm grants públicos, as RPCs são as portas validadas e as tabelas do
tracker estavam vazias na verificação pós-deploy.

O lint de frontend continua falhando por 531 ocorrências de Prettier já
existentes em arquivos fora deste escopo. Nenhum arquivo de interface foi
alterado. O build não pôde ser executado neste worktree porque as dependências
não estão instaladas nele; a tentativa de reutilizar dependências de outro
worktree encontrou cache read-only. Isso não afeta a suíte SQL focada.

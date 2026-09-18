# Última pergunta respondida — evidência TDD

## RED

O teste SQL passou a exigir `last_completed_step` calculado exclusivamente de
eventos `step_completed`. Antes da migration a coluna não existia e a suíte
falhou como esperado.

## GREEN

A migration adiciona o resumo separado, preserva `last_step` como a última
tela vista e expõe os dois campos pela ponte autenticada. A suíte SQL do
tracker voltou a passar.

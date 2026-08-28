import type { Respostas } from "./tipos"

/**
 * As telas do formulário, numa lista só.
 *
 * O fluxo não é uma árvore de `if` espalhada pelo componente: cada tela diz
 * sozinha quando aparece, através de `exibeSe`. A sequência visível é
 * recalculada a cada resposta (veja `telasVisiveis`), então voltar, trocar uma
 * resposta e seguir de novo funciona sem nenhum código extra — as telas que
 * deixaram de fazer sentido simplesmente somem da lista.
 *
 * É também de onde sai a barra de progresso: ela mede a posição dentro da
 * sequência visível *daquele* lead, não dentro do total de perguntas que
 * existem. Quem vai pela trilha B não vê uma barra que trava em 40%.
 */

export type Opcao = {
  /** O que aparece na tela. */
  rotulo: string
  /** O que vai para o banco. Quando igual ao rótulo, pode ser omitido. */
  valor?: string | boolean
}

export type Tela =
  | {
      tipo: "contato"
      id: string
    }
  | {
      tipo: "escolha"
      id: string
      /** Numeração do brief, para achar a pergunta aqui quando ele mudar. */
      numeroNoBrief: string
      pergunta: string
      opcoes: Opcao[]
      /** Coluna(s) que esta tela preenche. */
      campo: keyof Respostas
      /** Só aparece quando isto for verdade. Sem isso, aparece sempre. */
      exibeSe?: (r: Respostas) => boolean
    }
  | {
      tipo: "fechamento"
      id: string
    }

const ehTrilhaA = (r: Respostas) => r.cnpj_aberto === true
const ehTrilhaB = (r: Respostas) => r.cnpj_aberto === false

export const TELAS: Tela[] = [
  { tipo: "contato", id: "contato" },

  {
    tipo: "escolha",
    id: "cnpj",
    numeroNoBrief: "4",
    pergunta: "Você já tem CNPJ aberto?",
    campo: "cnpj_aberto",
    opcoes: [
      { rotulo: "Sim", valor: true },
      { rotulo: "Não, quero abrir uma empresa", valor: false },
    ],
  },

  // ---------------------------------------------------------------- trilha A
  {
    tipo: "escolha",
    id: "regime",
    numeroNoBrief: "5",
    pergunta: "Qual é o regime tributário da sua empresa hoje?",
    campo: "regime_tributario",
    exibeSe: ehTrilhaA,
    opcoes: [
      { rotulo: "MEI" },
      { rotulo: "Simples Nacional" },
      { rotulo: "Lucro Presumido" },
      { rotulo: "Lucro Real" },
      { rotulo: "Não sei dizer" },
    ],
  },
  {
    tipo: "escolha",
    id: "mei",
    numeroNoBrief: "5.1",
    pergunta: "Você quer sair do MEI ou continuar no MEI com acompanhamento contábil?",
    campo: "mei_quer_sair",
    // Só para quem respondeu MEI na anterior. Se voltar e trocar o regime,
    // esta tela some e a resposta é limpa em `limparRespostasOrfas`.
    exibeSe: (r) => ehTrilhaA(r) && r.regime_tributario === "MEI",
    opcoes: [
      { rotulo: "Quero sair do MEI", valor: true },
      { rotulo: "Quero continuar no MEI, com acompanhamento", valor: false },
    ],
  },
  {
    tipo: "escolha",
    id: "faturamento",
    numeroNoBrief: "6",
    pergunta: "Qual é o faturamento médio mensal da empresa?",
    campo: "faturamento_faixa",
    exibeSe: ehTrilhaA,
    opcoes: [
      { rotulo: "Até R$10.000" },
      { rotulo: "De R$10.001 a R$30.000" },
      { rotulo: "De R$30.001 a R$50.000" },
      { rotulo: "De R$50.001 a R$100.000" },
      { rotulo: "De R$100.001 a R$300.000" },
      { rotulo: "Acima de R$300.000" },
    ],
  },
  {
    tipo: "escolha",
    id: "contador",
    numeroNoBrief: "7",
    pergunta: "Você já tem contador hoje?",
    campo: "tem_contador",
    exibeSe: ehTrilhaA,
    opcoes: [
      { rotulo: "Não tenho" },
      { rotulo: "Tenho, mas sinto que não sou atendido como deveria" },
      { rotulo: "Tenho, mas estou buscando uma contabilidade mais completa e consultiva" },
      { rotulo: "Tenho, mas quero uma opção com menor preço" },
    ],
  },
  {
    tipo: "escolha",
    id: "funcionarios",
    numeroNoBrief: "8",
    pergunta: "Quantos funcionários a empresa tem hoje?",
    campo: "funcionarios_faixa",
    exibeSe: ehTrilhaA,
    opcoes: [
      { rotulo: "Nenhum" },
      { rotulo: "De 1 a 5" },
      { rotulo: "De 6 a 10" },
      { rotulo: "De 11 a 20" },
      { rotulo: "Acima de 20" },
    ],
  },
  {
    tipo: "escolha",
    id: "dor",
    numeroNoBrief: "9",
    pergunta: "Qual é a sua maior dificuldade hoje?",
    campo: "dor_principal",
    exibeSe: ehTrilhaA,
    opcoes: [
      { rotulo: "Pago muito imposto e quero pagar menos" },
      { rotulo: "Tenho pendências e quero regularizar a situação fiscal" },
      { rotulo: "Falta de suporte e acompanhamento" },
      {
        rotulo:
          "Sinto que minha contabilidade não está preparada para acompanhar meu crescimento",
      },
      { rotulo: "Outro motivo" },
    ],
  },

  // ---------------------------------------------------------------- trilha B
  {
    tipo: "escolha",
    id: "atividade",
    numeroNoBrief: "4B",
    pergunta: "Que tipo de atividade você pretende exercer?",
    campo: "tipo_atividade",
    exibeSe: ehTrilhaB,
    opcoes: [
      { rotulo: "Prestação de serviços" },
      { rotulo: "Comércio" },
      { rotulo: "Indústria" },
      { rotulo: "Ainda não sei" },
    ],
  },

  // ------------------------------------------------------------------ ambas
  {
    tipo: "escolha",
    id: "urgencia",
    numeroNoBrief: "10",
    pergunta: "Quando você precisa resolver isso?",
    campo: "urgencia",
    opcoes: [
      { rotulo: "Hoje ou amanhã" },
      { rotulo: "Essa semana" },
      { rotulo: "Nesse mês" },
      { rotulo: "Só estou procurando opções" },
    ],
  },
  {
    tipo: "escolha",
    id: "horario",
    numeroNoBrief: "11",
    pergunta: "Qual o melhor horário pra te chamar?",
    campo: "melhor_horario_contato",
    opcoes: [
      { rotulo: "Manhã (8h-12h)" },
      { rotulo: "Tarde (12h-18h)" },
      { rotulo: "Noite (18h-21h)" },
    ],
  },

  { tipo: "fechamento", id: "fechamento" },
]

/** A sequência que *este* lead vê, dadas as respostas que ele já deu. */
export function telasVisiveis(r: Respostas): Tela[] {
  return TELAS.filter((t) => (t.tipo === "escolha" && t.exibeSe ? t.exibeSe(r) : true))
}

/**
 * Apaga respostas de telas que deixaram de ser exibidas.
 *
 * Sem isto, um lead que responde MEI, diz que quer sair, volta e troca para
 * Simples Nacional deixaria `mei_quer_sair = true` no banco — e a regra de
 * valor do MEI dispararia para uma empresa do Simples. O erro seria silencioso
 * e apareceria só no preço mostrado na tela.
 */
export function limparRespostasOrfas(r: Respostas): Respostas {
  const visiveis = new Set(telasVisiveis(r).map((t) => t.id))
  const limpo = { ...r }

  for (const tela of TELAS) {
    if (tela.tipo !== "escolha") continue
    if (visiveis.has(tela.id)) continue
    // @ts-expect-error — a coluna é sempre anulável; o mapa campo→tipo não
    // sobrevive à indexação genérica, e reconstruí-lo aqui custaria mais do
    // que vale.
    limpo[tela.campo] = null
  }

  return limpo
}

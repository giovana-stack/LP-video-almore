import type { Respostas } from "./tipos"

/**
 * As regras de valor e as telas que elas abrem.
 *
 * FONTE DOS TEXTOS: "Funil Almore Inteligência Contábil — Documento de Execução
 * por Responsável, VERSÃO COM SDR DE VOZ", seções 1.2.1, 1.2.2 e 1.2.3. Os
 * textos são finais e estão copiados palavra por palavra.
 *
 * ATENÇÃO AO MEXER: os textos do WhatsApp da automação do CRM fazem referência
 * a frases específicas destas telas, então reescrever uma frase aqui desalinha
 * os dois sistemas sem dar nenhum sinal de erro. Trocar preço ou redação exige
 * combinar com quem cuida da automação.
 *
 * A ordem do array é a ordem de avaliação: a primeira regra que bate ganha.
 */

export type Perfil =
  | "mei_sair"
  | "mei_continuar"
  | "simples_baixo"
  | "presumido_real_baixo"
  | "abertura"

export type TelaDeValor = {
  perfil: Perfil
  /**
   * Vai para a coluna `valor_informado`, gravada no envio.
   *
   * É um número, e não a frase que aparece na tela, porque a seção 2.2 define
   * a coluna como `numeric` — assim o comercial consegue somar, comparar e
   * filtrar por faixa. A frase exata sai da combinação regime + faturamento,
   * então guardá-la seria guardar a mesma informação duas vezes.
   */
  valorInformado: number
  /** O texto da tela. Recebe as respostas porque um dos perfis é condicional. */
  texto: (r: Respostas) => string
}

/** As duas faixas que contam como "faturamento baixo" nas regras 3 e 4. */
const FATURAMENTO_BAIXO = ["Até R$10.000", "De R$10.001 a R$30.000"]

type Regra = TelaDeValor & { bate: (r: Respostas) => boolean }

const REGRAS: Regra[] = [
  {
    perfil: "mei_sair",
    valorInformado: 600,
    bate: (r) => r.regime_tributario === "MEI" && r.mei_quer_sair === true,
    texto: () =>
      "Entendemos que você quer sair do MEI! Nossa contabilidade para empresas fora do MEI parte de R$600,00 mensais, incluindo atendimento consultivo, entrega das obrigações acessórias e suporte humanizado. Se isso faz sentido pro seu momento, clique aqui para agendar um contato com a especialista e ver como a nossa contabilidade vai fazer a diferença pra você.",
  },
  {
    perfil: "mei_continuar",
    valorInformado: 150,
    bate: (r) => r.regime_tributario === "MEI" && r.mei_quer_sair === false,
    texto: () =>
      "Entendemos que você quer continuar no MEI com acompanhamento! Esse serviço parte de R$150,00 mensais, incluindo atendimento consultivo, entrega das obrigações acessórias e suporte humanizado. Se isso faz sentido pro seu momento, clique aqui para agendar um contato com a especialista e ver como a nossa contabilidade vai fazer a diferença pra você.",
  },
  {
    perfil: "simples_baixo",
    valorInformado: 600,
    bate: (r) =>
      r.regime_tributario === "Simples Nacional" &&
      r.faturamento_faixa !== null &&
      FATURAMENTO_BAIXO.includes(r.faturamento_faixa),
    texto: () =>
      "Nosso acompanhamento contábil para empresas do Simples Nacional parte de R$600,00 mensais, incluindo atendimento consultivo, entrega das obrigações acessórias e suporte humanizado. Se isso faz sentido pro seu momento, clique aqui para agendar um contato com a especialista e ver como a nossa contabilidade vai fazer a diferença pra você.",
  },
  {
    perfil: "presumido_real_baixo",
    valorInformado: 1100,
    bate: (r) =>
      (r.regime_tributario === "Lucro Presumido" || r.regime_tributario === "Lucro Real") &&
      r.faturamento_faixa !== null &&
      FATURAMENTO_BAIXO.includes(r.faturamento_faixa),
    // O documento traz "[Lucro Presumido/Real]" como marcação condicional: na
    // tela aparece só o regime real do lead, nunca os dois separados por barra.
    texto: (r) =>
      `Para empresas do ${r.regime_tributario}, nosso acompanhamento parte de R$1.100,00 mensais, incluindo atendimento consultivo, entrega das obrigações acessórias e suporte humanizado. Se isso faz sentido pro seu momento, clique aqui para agendar um contato com a especialista e ver como a nossa contabilidade vai fazer a diferença pra você.`,
  },
  {
    perfil: "abertura",
    valorInformado: 1200,
    bate: (r) => r.trilha === "B",
    texto: () =>
      "Nosso serviço de abertura de CNPJ custa R$1.200,00 (valor único). Esse valor não inclui licenciamento do Corpo de Bombeiros, registros em conselhos de classe ou alvarás — esses custos são cobrados separadamente pelos órgãos responsáveis, conforme a atividade da sua empresa. Se isso faz sentido pro seu momento, clique aqui para agendar um contato com a especialista, que vai te ajudar a abrir sua empresa da forma ideal pro seu negócio.",
  },
]

/**
 * Qual tela de valor este lead vê — ou `null`, e aí ele cai na confirmação
 * padrão. "Qualquer outro perfil da Trilha A" não é uma regra no array: é
 * justamente o que sobra quando nenhuma bate.
 */
export function telaDeValorPara(r: Respostas): TelaDeValor | null {
  return REGRAS.find((regra) => regra.bate(r)) ?? null
}

/** Texto da confirmação padrão, quando nenhuma regra de valor se aplica. */
export const CONFIRMACAO_PADRAO =
  "Recebemos seus dados! Em poucos minutos entraremos em contato com você, fique atento."

/** A pergunta dos decisores, que só aparece depois do aceite. */
export const PERGUNTA_DECISORES =
  "Você decide isso sozinho, ou tem outros sócios/decisores que também devem participar da reunião?"

/** A nota que acompanha o agendamento quando há mais de um decisor. */
export const NOTA_MULTIPLOS_DECISORES =
  "É indispensável que todos os decisores participem dessa reunião para o melhor proveito e alinhamento de expectativas, portanto peço que escolha um horário que todos os sócios/decisores possam participar."

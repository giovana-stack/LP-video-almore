import type { Respostas } from "./tipos"

/**
 * As regras de valor e as telas que elas abrem.
 *
 * ATENÇÃO AO MEXER: os textos daqui são finais e vieram do brief. Os textos do
 * WhatsApp da automação do CRM fazem referência a frases específicas destas
 * telas, então reescrever uma frase aqui desalinha os dois sistemas sem dar
 * nenhum sinal de erro. Trocar preço ou redação exige combinar com quem cuida
 * da automação.
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
  /** Vai para a coluna `valor_informado`, gravada no envio. */
  valorInformado: string
  /** O texto da tela. Recebe as respostas porque um dos perfis é condicional. */
  texto: (r: Respostas) => string
}

/** As duas faixas que contam como "faturamento baixo" nas regras 3 e 4. */
const FATURAMENTO_BAIXO = ["Até R$10.000", "De R$10.001 a R$30.000"]

type Regra = TelaDeValor & { bate: (r: Respostas) => boolean }

const REGRAS: Regra[] = [
  {
    perfil: "mei_sair",
    valorInformado: "A partir de R$600/mês",
    bate: (r) => r.regime_tributario === "MEI" && r.mei_quer_sair === true,
    texto: () =>
      "Certo, você quer sair do MEI! A contabilidade para empresas fora do MEI parte de R$600,00 mensais e inclui atendimento consultivo, entrega das obrigações acessórias e suporte humanizado. Se isso faz sentido pro seu momento, clique aqui para agendar um contato com nossa especialista e entender como a nossa contabilidade vai fazer a diferença pra você.",
  },
  {
    perfil: "mei_continuar",
    valorInformado: "R$150/mês",
    bate: (r) => r.regime_tributario === "MEI" && r.mei_quer_sair === false,
    texto: () =>
      "Ok, você quer continuar no MEI com acompanhamento! Esse serviço parte de R$150,00 mensais e inclui atendimento consultivo, entrega das obrigações acessórias e suporte humanizado. Se isso faz sentido pro seu momento, clique aqui para agendar um contato com nossa especialista e entender como a nossa contabilidade vai fazer a diferença pra você.",
  },
  {
    perfil: "simples_baixo",
    valorInformado: "A partir de R$600/mês",
    bate: (r) =>
      r.regime_tributario === "Simples Nacional" &&
      r.faturamento_faixa !== null &&
      FATURAMENTO_BAIXO.includes(r.faturamento_faixa),
    texto: () =>
      "Nosso acompanhamento contábil para empresas do Simples Nacional parte de R$600,00 mensais e inclui atendimento consultivo, entrega das obrigações acessórias e suporte humanizado. Se isso faz sentido pro seu momento, clique aqui para agendar um contato com nossa especialista e entender como a nossa contabilidade vai fazer a diferença pra você.",
  },
  {
    perfil: "presumido_real_baixo",
    valorInformado: "A partir de R$1.100/mês",
    bate: (r) =>
      (r.regime_tributario === "Lucro Presumido" || r.regime_tributario === "Lucro Real") &&
      r.faturamento_faixa !== null &&
      FATURAMENTO_BAIXO.includes(r.faturamento_faixa),
    // O brief traz "[Lucro Presumido/Real]" como marcação condicional: na tela
    // aparece só o regime real do lead, nunca os dois separados por barra.
    texto: (r) =>
      `Para empresas do ${r.regime_tributario}, nosso acompanhamento parte de R$1.100,00 mensais e inclui atendimento consultivo, entrega das obrigações acessórias e suporte humanizado. Se isso faz sentido pro seu momento, clique aqui para agendar um contato com nossa especialista e entender como a nossa contabilidade vai fazer a diferença pra você.`,
  },
  {
    perfil: "abertura",
    valorInformado: "R$1.200,00 fixo",
    bate: (r) => r.trilha === "B",
    texto: () =>
      "Nosso serviço de abertura de CNPJ custa R$1.200,00 (valor único). Esse valor não inclui licenciamento do Corpo de Bombeiros, registros em conselhos de classe ou alvarás, visto que tais custos são cobrados separadamente pelos órgãos responsáveis, de acordo com a atividade da sua empresa. Se isso faz sentido pro seu momento, clique aqui e agende um contato com nossa especialista. Ela vai te ajudar a abrir sua empresa da forma ideal pro seu negócio.",
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
  "Recebemos seus dados! Em poucos minutos entraremos em contato com você. Fique atento!"

/** A pergunta dos decisores, que só aparece depois do aceite. */
export const PERGUNTA_DECISORES =
  "Você fecha esse tipo de contratação sozinho, ou tem um sócio ou outra pessoa que decide junto com você?"

/** A nota que acompanha o agendamento quando há mais de um decisor. */
export const NOTA_MULTIPLOS_DECISORES =
  "É indispensável que todos os decisores participem dessa reunião para um melhor alinhamento de expectativas. Portanto, escolha um horário em que todos estejam disponíveis para participar da nossa chamada."

/**
 * Tipos do funil de captação da Almore.
 *
 * Os nomes dos campos são exatamente os nomes das colunas no Supabase. Isso é
 * de propósito: o que o formulário monta na memória é o mesmo objeto que sobe
 * para o banco, sem uma camada de tradução no meio para alguém esquecer de
 * atualizar quando uma pergunta mudar.
 */

/** Trilha A: já tem CNPJ. Trilha B: quer abrir empresa. */
export type Trilha = "A" | "B"

/**
 * Status que o formulário escreve. Os outros (`aguardando_resposta`,
 * `em_conversa`, `confirmado`, `no_show`, `convertido`, `frio`) são escritos
 * pela automação do CRM e não aparecem aqui — se um deles for parar neste
 * arquivo, é sinal de que a fronteira entre os dois sistemas vazou.
 */
export type Status =
  | "novo"
  | "aguardando_decisao_valor"
  | "nao_atende_preco"
  | "valor_aceito_sem_agendamento"

export type RegimeTributario =
  | "MEI"
  | "Simples Nacional"
  | "Lucro Presumido"
  | "Lucro Real"
  | "Não sei dizer"

export type FaturamentoFaixa =
  | "Até R$10.000"
  | "De R$10.001 a R$30.000"
  | "De R$30.001 a R$50.000"
  | "De R$50.001 a R$100.000"
  | "De R$100.001 a R$300.000"
  | "Acima de R$300.000"

/** Uma resposta do lead, do jeito que vai para o banco. */
export type Respostas = {
  // Bloco 1 — contato. É o gatilho da primeira gravação.
  nome: string
  whatsapp: string // E.164, ex.: +5519999999999
  email: string

  // Bifurcação
  cnpj_aberto: boolean | null
  trilha: Trilha | null

  // Trilha A
  regime_tributario: RegimeTributario | null
  mei_quer_sair: boolean | null
  faturamento_faixa: FaturamentoFaixa | null
  tem_contador: string | null
  funcionarios_faixa: string | null
  dor_principal: string | null

  // Trilha B
  tipo_atividade: string | null

  // Ambas
  urgencia: string | null
  melhor_horario_contato: string | null

  // Fechamento
  consentimento_whatsapp: boolean
  formulario_completo: boolean
  /** Número, não a frase da tela — a coluna é `numeric` na seção 2.2. */
  valor_informado: number | null
  multiplos_decisores: boolean | null
  status: Status

  // Origem
  utm_source: string | null
  utm_campaign: string | null
  utm_content: string | null
}

/** O estado inicial: tudo vazio, nada inventado. */
export const RESPOSTAS_VAZIAS: Respostas = {
  nome: "",
  whatsapp: "",
  email: "",
  cnpj_aberto: null,
  trilha: null,
  regime_tributario: null,
  mei_quer_sair: null,
  faturamento_faixa: null,
  tem_contador: null,
  funcionarios_faixa: null,
  dor_principal: null,
  tipo_atividade: null,
  urgencia: null,
  melhor_horario_contato: null,
  consentimento_whatsapp: false,
  formulario_completo: false,
  valor_informado: null,
  multiplos_decisores: null,
  status: "novo",
  utm_source: null,
  utm_campaign: null,
  utm_content: null,
}

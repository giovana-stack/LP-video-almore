import type { Tela } from "./perguntas"

/**
 * Identificadores independentes da cópia visual. O tracker e o resumo
 * operacional dependem destes valores, nunca do texto que aparece ao lead.
 */
export type PassoDoFunil = { key: string; index: number }

const PASSOS_DAS_TELAS: Record<string, PassoDoFunil> = {
  nome: { key: "contact_name", index: 1 },
  whatsapp: { key: "contact_whatsapp", index: 2 },
  email: { key: "contact_email", index: 3 },
  cnpj: { key: "company_cnpj_status", index: 4 },
  regime: { key: "company_tax_regime", index: 5 },
  mei: { key: "company_mei_intent", index: 6 },
  faturamento: { key: "company_revenue_range", index: 7 },
  contador: { key: "company_has_accountant", index: 8 },
  funcionarios: { key: "company_employee_range", index: 9 },
  dor: { key: "company_primary_pain", index: 10 },
  atividade: { key: "company_intended_activity", index: 11 },
  urgencia: { key: "contact_urgency", index: 12 },
  horario: { key: "contact_best_time", index: 13 },
  fechamento: { key: "form_review", index: 14 },
}

export const PASSO_PREFERENCIA_ATENDIMENTO: PassoDoFunil = {
  key: "contact_preference",
  index: 15,
}
export const PASSO_VALOR: PassoDoFunil = { key: "pricing_offer", index: 16 }
export const PASSO_DECISORES: PassoDoFunil = { key: "meeting_decision_makers", index: 17 }
export const PASSO_AGENDAMENTO: PassoDoFunil = { key: "booking", index: 18 }
export const PASSO_RECUSA: PassoDoFunil = { key: "pricing_declined", index: 19 }

export function passoDaTela(tela: Tela | undefined): PassoDoFunil | undefined {
  if (!tela) return undefined
  return PASSOS_DAS_TELAS[tela.id]
}

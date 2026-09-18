import { describe, expect, it } from "vitest"

import { PASSO_PREFERENCIA_ATENDIMENTO, passoParaEvento } from "./passos"

describe("passoParaEvento", () => {
  it("converte a chave interna estável para o contrato do tracker", () => {
    expect(passoParaEvento(PASSO_PREFERENCIA_ATENDIMENTO)).toEqual({
      step_key: "contact_preference",
      step_index: 15,
    })
  })

  it("preserva uma etapa ausente sem inventar texto visual", () => {
    expect(passoParaEvento(undefined)).toEqual({})
  })
})

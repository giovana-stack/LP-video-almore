import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import FormularioAlmore from "./FormularioAlmore"

const { atualizarLead } = vi.hoisted(() => ({ atualizarLead: vi.fn() }))

vi.mock("@/lib/funil/persistencia", () => ({
  atualizarLead,
  criarLead: vi.fn().mockResolvedValue({ ok: true, id: "lead-uuid" }),
  idDaSessao: () => "lead-uuid",
}))

describe("Ramo B do formulário", () => {
  beforeEach(() => {
    atualizarLead.mockReset()
    atualizarLead.mockResolvedValue({ ok: true, id: "lead-uuid" })
  })

  it("navega por chaves estáveis e exige a escolha de canal antes de concluir", async () => {
    const usuario = userEvent.setup()
    render(<FormularioAlmore />)

    await usuario.type(screen.getByLabelText("Qual é o seu nome?"), "Maria")
    await usuario.click(screen.getByRole("button", { name: "Continuar" }))

    await usuario.type(screen.getByLabelText("Qual é o seu WhatsApp?"), "19999999999")
    await usuario.click(screen.getByRole("checkbox"))
    await usuario.click(screen.getByRole("button", { name: "Continuar" }))

    await usuario.type(screen.getByLabelText("Qual é o seu e-mail?"), "maria@empresa.com")
    await usuario.click(screen.getByRole("button", { name: "Continuar" }))
    await usuario.click(screen.getByRole("button", { name: "Não, quero abrir uma empresa" }))
    await usuario.click(screen.getByRole("button", { name: "Prestação de serviços" }))
    await usuario.click(screen.getByRole("button", { name: "Essa semana" }))
    await usuario.click(screen.getByRole("button", { name: "Tarde (12h-18h)" }))

    await usuario.click(screen.getByRole("button", { name: "Enviar" }))

    expect(screen.getByRole("heading", { name: "Como você prefere ser atendido?" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Receber uma ligação" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Continuar pelo WhatsApp" })).toBeTruthy()

    await usuario.click(screen.getByRole("button", { name: "Receber uma ligação" }))

    await waitFor(() =>
      expect(atualizarLead).toHaveBeenCalledWith(
        "lead-uuid",
        expect.objectContaining({ formulario_completo: true }),
      ),
    )
    expect(screen.getByText("Você quer abrir uma empresa")).toBeTruthy()
  })
})

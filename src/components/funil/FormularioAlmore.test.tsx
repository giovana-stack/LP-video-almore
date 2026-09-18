import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import FormularioAlmore from "./FormularioAlmore"

const { atualizarLead } = vi.hoisted(() => ({ atualizarLead: vi.fn() }))

vi.mock("@/lib/funil/persistencia", () => ({
  SUPABASE_URL: "https://ffdbojtidzmoklcpvnsz.supabase.co",
  SUPABASE_PUBLISHABLE: "sb_publishable_test",
  atualizarLead,
  criarLead: vi.fn().mockResolvedValue({ ok: true, id: "lead-uuid" }),
  idDaSessao: () => "lead-uuid",
}))

/**
 * O que decide a tela de canal é TER OU NÃO preço — não a trilha.
 *
 * Quem não recebe valor vai ser procurado pela especialista, e a escolha de
 * canal é a última coisa que falta saber. Quem recebe valor marca a própria
 * reunião na agenda, e por isso passa direto do preço para os decisores.
 *
 * Os dois testes abaixo existem em par de propósito: um prova que a tela
 * aparece onde deve, o outro que ela NÃO aparece no outro caminho. Sozinho, o
 * primeiro passaria mesmo se a tela voltasse a aparecer para todo mundo.
 */
async function preencherContato(usuario: ReturnType<typeof userEvent.setup>) {
  await usuario.type(screen.getByLabelText("Qual é o seu nome?"), "Maria")
  await usuario.click(screen.getByRole("button", { name: "Continuar" }))

  await usuario.type(screen.getByLabelText("Qual é o seu WhatsApp?"), "19999999999")
  await usuario.click(screen.getByRole("checkbox"))
  await usuario.click(screen.getByRole("button", { name: "Continuar" }))

  await usuario.type(screen.getByLabelText("Qual é o seu e-mail?"), "maria@empresa.com")
  await usuario.click(screen.getByRole("button", { name: "Continuar" }))
}

describe("Telas finais do formulário", () => {
  beforeEach(() => {
    atualizarLead.mockReset()
    atualizarLead.mockResolvedValue({ ok: true, id: "lead-uuid" })
  })

  it("sem preço: escolhe o canal e cai na confirmação", async () => {
    const usuario = userEvent.setup()
    render(<FormularioAlmore />)

    await preencherContato(usuario)

    // Simples Nacional acima de R$300.000 não bate nenhuma regra de valor.
    await usuario.click(screen.getByRole("button", { name: "Sim" }))
    await usuario.click(screen.getByRole("button", { name: "Simples Nacional" }))
    await usuario.click(screen.getByRole("button", { name: "Acima de R$300.000" }))
    await usuario.click(screen.getByRole("button", { name: "Não tenho" }))
    await usuario.click(screen.getByRole("button", { name: "De 1 a 5" }))
    await usuario.click(
      screen.getByRole("button", { name: "Pago muito imposto e quero pagar menos" }),
    )
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
    expect(screen.getByText("Recebemos seus dados!")).toBeTruthy()
  })

  it("com preço: vai direto para o valor, sem perguntar o canal", async () => {
    const usuario = userEvent.setup()
    render(<FormularioAlmore />)

    await preencherContato(usuario)

    // Abertura de CNPJ tem valor fixo, então é um caminho COM preço.
    await usuario.click(screen.getByRole("button", { name: "Não, quero abrir uma empresa" }))
    await usuario.click(screen.getByRole("button", { name: "Prestação de serviços" }))
    await usuario.click(screen.getByRole("button", { name: "Essa semana" }))
    await usuario.click(screen.getByRole("button", { name: "Tarde (12h-18h)" }))

    await usuario.click(screen.getByRole("button", { name: "Enviar" }))

    await waitFor(() => expect(screen.getByText("Você quer abrir uma empresa")).toBeTruthy())
    expect(screen.queryByRole("heading", { name: "Como você prefere ser atendido?" })).toBeNull()
  })
})

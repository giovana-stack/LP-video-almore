import { describe, expect, it, vi } from "vitest"

import {
  criarTrackerDoFunil,
  type EventoDoTracker,
  type TransporteDoTracker,
} from "./tracker"

function armazenamentoEmMemoria(): Storage {
  const valores = new Map<string, string>()
  return {
    get length() {
      return valores.size
    },
    clear: () => valores.clear(),
    getItem: (chave) => valores.get(chave) ?? null,
    key: (indice) => [...valores.keys()][indice] ?? null,
    removeItem: (chave) => valores.delete(chave),
    setItem: (chave, valor) => valores.set(chave, valor),
  }
}

describe("tracker do funil", () => {
  it("mantém session_id e event_id no retry, entrega em ordem e nunca repassa PII em metadata", async () => {
    const storage = armazenamentoEmMemoria()
    const enviados: EventoDoTracker[] = []
    const transporte: TransporteDoTracker = {
      enviar: vi
        .fn()
        .mockRejectedValueOnce(new Error("offline"))
        .mockImplementation(async (evento: EventoDoTracker) => {
          enviados.push(evento)
        }),
    }
    const ids = ["session-uuid", "event-1", "event-2"]
    const proximoId = () => ids.shift() ?? "unused"
    const tracker = criarTrackerDoFunil({ armazenamento: storage, transporte, proximoId })

    const primeiro = tracker.registrar({
      event_name: "funnel_started",
      metadata: { nome: "Maria", email: "maria@empresa.com", resposta: "segredo" },
    })
    const segundo = tracker.registrar({
      event_name: "step_viewed",
      step_key: "contact_name",
      step_index: 1,
    })

    expect(primeiro.session_id).toBe("session-uuid")
    expect(segundo.session_id).toBe("session-uuid")
    expect(primeiro.metadata).toEqual({})

    await tracker.tentarNovamente()

    expect(enviados.map((evento) => evento.event_name)).toEqual(["funnel_started", "step_viewed"])
    expect(enviados[0]?.event_id).toBe(primeiro.event_id)
    expect(enviados[1]?.event_id).toBe(segundo.event_id)
    expect(transporte.enviar).toHaveBeenCalledTimes(3)
  })

  it("associa o lead à sessão assim que ele passa a existir e persiste a preferência canônica", async () => {
    const enviados: EventoDoTracker[] = []
    const tracker = criarTrackerDoFunil({
      armazenamento: armazenamentoEmMemoria(),
      transporte: { enviar: async (evento) => void enviados.push(evento) },
      proximoId: (() => {
        const ids = ["session-uuid", "event-1", "event-2"]
        return () => ids.shift() ?? "unused"
      })(),
    })

    tracker.associarLead("lead-uuid")
    tracker.registrar({
      event_name: "contact_preference_selected",
      step_key: "contact_preference",
      step_index: 13,
      metadata: { preferencia_atendimento: "ligacao" },
    })
    await tracker.tentarNovamente()

    expect(enviados).toHaveLength(1)
    expect(enviados[0]).toMatchObject({
      lead_id: "lead-uuid",
      metadata: { preferencia_atendimento: "ligacao" },
    })
  })
})

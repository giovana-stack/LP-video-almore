import { describe, expect, it, vi } from "vitest"

import {
  criarTransporteSupabase,
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
    const ids = ["session-uuid", "event-1", "event-2", "event-3", "event-4"]
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
    tracker.registrar({ event_name: "form_submitted", step_key: "form_review", step_index: 14 })
    tracker.registrar({ event_name: "funnel_completed", step_key: "form_review", step_index: 14 })

    expect(primeiro.session_id).toBe("session-uuid")
    expect(segundo.session_id).toBe("session-uuid")
    expect(primeiro.metadata).toEqual({})

    await tracker.tentarNovamente()

    expect(enviados.map((evento) => evento.event_name)).toEqual([
      "funnel_started",
      "step_viewed",
      "form_submitted",
      "funnel_completed",
    ])
    expect(enviados[0]?.event_id).toBe(primeiro.event_id)
    expect(enviados[1]?.event_id).toBe(segundo.event_id)
    expect(transporte.enviar).toHaveBeenCalledTimes(5)
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
      metadata: { preference: "ligacao" },
    })
  })

  it("vincula eventos que já foram entregues quando a criação assíncrona do lead termina", async () => {
    const enviados: EventoDoTracker[] = []
    const ids = ["session-uuid", "event-start", "event-association"]
    const tracker = criarTrackerDoFunil({
      armazenamento: armazenamentoEmMemoria(),
      transporte: { enviar: async (evento) => void enviados.push(evento) },
      proximoId: () => ids.shift() ?? "unused",
    })

    tracker.registrar({ event_name: "funnel_started", step_key: "contact_name", step_index: 1 })
    await tracker.tentarNovamente()
    tracker.associarLead("lead-uuid")
    await tracker.tentarNovamente()

    expect(enviados).toMatchObject([
      { event_name: "funnel_started", lead_id: null },
      { event_name: "funnel_started", lead_id: "lead-uuid" },
    ])
  })

  it("encerra uma sessão concluída só depois de entregar os eventos e faz a próxima visita nascer em outra sessão", async () => {
    const storage = armazenamentoEmMemoria()
    const enviados: EventoDoTracker[] = []
    const ids = ["sessao-1", "evento-1", "sessao-2", "evento-2"]
    const proximoId = () => ids.shift() ?? "unused"
    const transporte: TransporteDoTracker = {
      enviar: async (evento) => void enviados.push(evento),
    }
    const primeiro = criarTrackerDoFunil({ armazenamento: storage, transporte, proximoId })

    primeiro.associarLead("lead-1")
    primeiro.registrar({ event_name: "funnel_completed", step_key: "form_review", step_index: 14 })

    await primeiro.encerrar()

    const segundo = criarTrackerDoFunil({ armazenamento: storage, transporte, proximoId })
    const eventoDaNovaVisita = segundo.registrar({ event_name: "funnel_started" })
    await segundo.tentarNovamente()

    expect(enviados).toMatchObject([
      { session_id: "sessao-1", lead_id: "lead-1", event_name: "funnel_completed" },
      { session_id: "sessao-2", lead_id: null, event_name: "funnel_started" },
    ])
    expect(eventoDaNovaVisita.session_id).toBe("sessao-2")
  })

  it("chama a RPC do Supabase com p_event e a chave publicável", async () => {
    const requisitar = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    const transporte = criarTransporteSupabase({
      url: "https://ffdbojtidzmoklcpvnsz.supabase.co",
      chavePublicavel: "sb_publishable_test",
      requisitar,
    })
    const evento: EventoDoTracker = {
      event_id: "event-uuid",
      session_id: "session-uuid",
      lead_id: null,
      event_name: "contact_preference_selected",
      step_key: "contact_preference",
      step_index: 15,
      occurred_at: "2026-09-18T12:00:00.000Z",
      utm: { source: "meta", medium: null, campaign: null, content: null, term: null },
      metadata: { preference: "whatsapp" },
    }

    await transporte.enviar(evento)

    expect(requisitar).toHaveBeenCalledWith(
      "https://ffdbojtidzmoklcpvnsz.supabase.co/rest/v1/rpc/funnel_track_event",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          apikey: "sb_publishable_test",
          Authorization: "Bearer sb_publishable_test",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ p_event: evento }),
      }),
    )
  })
})

import { lerUtmsPermitidas, type UtmsPermitidas } from "./origem"
import { SUPABASE_PUBLISHABLE, SUPABASE_URL } from "./persistencia"

export type NomeDoEventoDoTracker =
  | "funnel_started"
  | "step_viewed"
  | "step_completed"
  | "step_validation_failed"
  | "contact_preference_selected"
  | "form_submitted"
  | "funnel_completed"
  | "booking_viewed"
  | "booking_completed"

export type EventoDoTracker = {
  event_id: string
  session_id: string
  lead_id: string | null
  event_name: NomeDoEventoDoTracker
  step_key: string | null
  step_index: number | null
  occurred_at: string
  utm: UtmsPermitidas
  metadata: Record<string, "ligacao" | "whatsapp">
}

export type EventoNovoDoTracker = {
  event_name: NomeDoEventoDoTracker
  step_key?: string | undefined
  step_index?: number | undefined
  /**
   * Aceita-se uma estrutura ampla na fronteira para que dados acidentais sejam
   * descartados em runtime; só a preferência canônica é liberada abaixo.
   */
  metadata?: Record<string, unknown> | undefined
}

export type TransporteDoTracker = {
  enviar: (evento: EventoDoTracker) => Promise<void>
}

type OpcoesDoTracker = {
  armazenamento: Storage
  transporte: TransporteDoTracker
  proximoId?: (() => string) | undefined
  agora?: (() => Date) | undefined
  utm?: (() => UtmsPermitidas) | undefined
}

const CHAVE_DA_SESSAO = "almore_sdr_funnel_session_id"
const CHAVE_DA_FILA = "almore_sdr_funnel_event_queue"
const CHAVE_DO_LEAD = "almore_sdr_funnel_lead_id"

function novoUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (letra) => {
    const aleatorio = (Math.random() * 16) | 0
    return (letra === "x" ? aleatorio : (aleatorio & 0x3) | 0x8).toString(16)
  })
}

function ler(armazenamento: Storage, chave: string): string | null {
  try {
    return armazenamento.getItem(chave)
  } catch {
    return null
  }
}

function guardar(armazenamento: Storage, chave: string, valor: string): void {
  try {
    armazenamento.setItem(chave, valor)
  } catch {
    // Sem storage, os eventos ainda podem ser enviados enquanto a página vive.
  }
}

function lerFila(armazenamento: Storage): EventoDoTracker[] {
  try {
    const bruto = armazenamento.getItem(CHAVE_DA_FILA)
    if (!bruto) return []
    const fila = JSON.parse(bruto) as unknown
    return Array.isArray(fila) ? (fila as EventoDoTracker[]) : []
  } catch {
    return []
  }
}

function guardarFila(armazenamento: Storage, fila: EventoDoTracker[]): void {
  guardar(armazenamento, CHAVE_DA_FILA, JSON.stringify(fila))
}

function remover(armazenamento: Storage, chave: string): void {
  try {
    armazenamento.removeItem(chave)
  } catch {
    // A limpeza é uma melhoria de ciclo de vida; falhar aqui não apaga eventos.
  }
}

function metadataSegura(metadata: Record<string, unknown> | undefined): EventoDoTracker["metadata"] {
  const preferencia = metadata?.["preferencia_atendimento"]
  if (preferencia === "ligacao" || preferencia === "whatsapp") {
    return { preference: preferencia }
  }
  return {}
}

/**
 * Fila idempotente do tracker. O mesmo objeto só sai da fila depois de uma
 * resposta bem-sucedida; retry/offline reaproveita exatamente seu event_id.
 */
export function criarTrackerDoFunil(opcoes: OpcoesDoTracker) {
  const proximoId = opcoes.proximoId ?? novoUuid
  const agora = opcoes.agora ?? (() => new Date())
  const utm = opcoes.utm ?? lerUtmsPermitidas
  const sessionId = ler(opcoes.armazenamento, CHAVE_DA_SESSAO) ?? proximoId()
  guardar(opcoes.armazenamento, CHAVE_DA_SESSAO, sessionId)
  let leadId = ler(opcoes.armazenamento, CHAVE_DO_LEAD)
  let fila = lerFila(opcoes.armazenamento)
  let envioEmAndamento: Promise<void> | null = null

  const enviarFila = async (): Promise<void> => {
    if (envioEmAndamento) return envioEmAndamento
    envioEmAndamento = (async () => {
      while (fila.length > 0) {
        const evento = fila[0]
        if (!evento) return
        try {
          await opcoes.transporte.enviar(evento)
        } catch {
          return
        }
        fila.shift()
        guardarFila(opcoes.armazenamento, fila)
      }
    })()
    try {
      await envioEmAndamento
    } finally {
      envioEmAndamento = null
    }
  }

  return {
    registrar(evento: EventoNovoDoTracker): EventoDoTracker {
      const completo: EventoDoTracker = {
        event_id: proximoId(),
        session_id: sessionId,
        lead_id: leadId,
        event_name: evento.event_name,
        step_key: evento.step_key ?? null,
        step_index: evento.step_index ?? null,
        occurred_at: agora().toISOString(),
        utm: utm(),
        metadata: metadataSegura(evento.metadata),
      }
      fila.push(completo)
      guardarFila(opcoes.armazenamento, fila)
      void enviarFila()
      return completo
    },

    associarLead(id: string): void {
      leadId = id
      guardar(opcoes.armazenamento, CHAVE_DO_LEAD, id)
      // Eventos ainda pendentes passam a carregar o vínculo logo que existe.
      fila = fila.map((evento) => (evento.lead_id ? evento : { ...evento, lead_id: id }))
      guardarFila(opcoes.armazenamento, fila)
    },

    async tentarNovamente(): Promise<void> {
      if (envioEmAndamento) await envioEmAndamento
      await enviarFila()
    },

    /**
     * Só esquece a sessão depois que a fila foi efetivamente entregue. Assim a
     * próxima visita não atualiza o lead anterior, sem perder conclusão offline.
     */
    async encerrar(): Promise<boolean> {
      if (envioEmAndamento) await envioEmAndamento
      await enviarFila()
      if (fila.length > 0) return false
      leadId = null
      remover(opcoes.armazenamento, CHAVE_DA_SESSAO)
      remover(opcoes.armazenamento, CHAVE_DA_FILA)
      remover(opcoes.armazenamento, CHAVE_DO_LEAD)
      return true
    },
  }
}

type Requisitar = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<{ ok: boolean; status: number }>

type OpcoesDoTransporteSupabase = {
  url: string
  chavePublicavel: string
  requisitar?: Requisitar | undefined
}

/** Adaptador do contrato da migration SDR v2: POST RPC com envelope p_event. */
export function criarTransporteSupabase({
  url,
  chavePublicavel,
  requisitar = fetch,
}: OpcoesDoTransporteSupabase): TransporteDoTracker {
  const endpoint = `${url.replace(/\/$/, "")}/rest/v1/rpc/funnel_track_event`

  return {
    async enviar(evento: EventoDoTracker): Promise<void> {
      const resposta = await requisitar(endpoint, {
        method: "POST",
        headers: {
          apikey: chavePublicavel,
          Authorization: `Bearer ${chavePublicavel}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_event: evento }),
        keepalive: true,
      })
      if (!resposta.ok) throw new Error(`tracker respondeu ${resposta.status}`)
    },
  }
}

function armazenamentoDoNavegador(): Storage {
  if (typeof window === "undefined") {
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
  return window.localStorage
}

/**
 * A RPC usa a mesma URL e chave publicável já empregadas por `funil_salvar`.
 * Nenhum segredo é colocado no navegador.
 */
export function criarTrackerDoNavegador() {
  const transporte = criarTransporteSupabase({
    url: import.meta.env["VITE_SUPABASE_URL"] ?? SUPABASE_URL,
    chavePublicavel:
      import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? SUPABASE_PUBLISHABLE,
  })
  return criarTrackerDoFunil({ armazenamento: armazenamentoDoNavegador(), transporte })
}

export type TrackerDoFunil = ReturnType<typeof criarTrackerDoFunil>

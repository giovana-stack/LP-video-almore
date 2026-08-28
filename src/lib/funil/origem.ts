/**
 * De onde o lead veio.
 *
 * O problema que este arquivo resolve: as UTMs chegam na URL da LANDING
 * (`/?utm_source=meta`), mas quem grava é o FORMULÁRIO, que vive em
 * `/formulario`. Sem nada no meio, o clique no botão troca de rota, a query
 * string fica para trás e toda campanha paga vira lead sem origem — um erro
 * caro e silencioso, porque nada quebra: só chega `null` no banco.
 *
 * A solução é guardar a origem assim que ela aparece, em qualquer página, e
 * lê-la depois com a URL tendo prioridade sobre o que foi guardado. Assim
 * funcionam os dois caminhos de entrada: anúncio → landing → formulário, e
 * anúncio → formulário direto.
 */

export type Utms = {
  utm_source: string | null
  utm_campaign: string | null
  utm_content: string | null
}

const CHAVES = ["utm_source", "utm_campaign", "utm_content"] as const
const CHAVE_SESSAO = "almore_funil_origem"
const VAZIO: Utms = { utm_source: null, utm_campaign: null, utm_content: null }

function daUrl(): Utms {
  const q = new URLSearchParams(window.location.search)
  const saida = { ...VAZIO }
  for (const chave of CHAVES) {
    const v = q.get(chave)
    if (v && v.trim()) saida[chave] = v.trim().slice(0, 200)
  }
  return saida
}

function temAlgo(u: Utms): boolean {
  return CHAVES.some((c) => u[c] !== null)
}

/**
 * Guarda a origem, se houver alguma na URL. Chamada no carregamento da landing
 * e do formulário. Não sobrescreve com vazio: se o lead navegar para uma URL
 * sem UTM depois de ter chegado com uma, a primeira origem continua valendo —
 * é ela que trouxe a pessoa.
 */
export function capturarOrigem(): void {
  if (typeof window === "undefined") return
  const atual = daUrl()
  if (!temAlgo(atual)) return
  try {
    sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify(atual))
  } catch {
    /* aba anônima com storage bloqueado: seguimos sem memória */
  }
}

/** A URL manda; o que foi guardado entra só onde a URL não disse nada. */
export function lerOrigem(): Utms {
  if (typeof window === "undefined") return VAZIO

  const atual = daUrl()
  if (temAlgo(atual)) return atual

  try {
    const guardado = sessionStorage.getItem(CHAVE_SESSAO)
    if (!guardado) return VAZIO
    const lido = JSON.parse(guardado) as Partial<Utms>
    return {
      utm_source: lido.utm_source ?? null,
      utm_campaign: lido.utm_campaign ?? null,
      utm_content: lido.utm_content ?? null,
    }
  } catch {
    return VAZIO
  }
}

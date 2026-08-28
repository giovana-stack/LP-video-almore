import { lerOrigem } from "./origem"
import type { Respostas } from "./tipos"

/**
 * Gravação do funil no Supabase.
 *
 * Projeto: "LP Almore Formulario" (ffdbojtidzmoklcpvnsz). É um projeto
 * separado do banco do blog de propósito — aquele é compartilhado com
 * automações de terceiros, e o funil não tem por que encostar nele.
 *
 * A chave abaixo é a PUBLISHABLE. Ela é pública por natureza: vai no bundle e
 * qualquer visitante consegue lê-la no DevTools. Quem protege os dados não é
 * ela, é o RLS — veja sql/funil_leads.sql. A chave `sb_secret_...` NUNCA pode
 * aparecer neste arquivo nem em nenhum outro do front: ela ignora RLS.
 */
const SUPABASE_URL = "https://ffdbojtidzmoklcpvnsz.supabase.co"
const SUPABASE_PUBLISHABLE = "sb_publishable__LklhoT23NAzaPHjb5mZWQ_aE3DHG7F"

const TABELA = "funil_leads"
const REST = `${SUPABASE_URL}/rest/v1/${TABELA}`

const cabecalhos = {
  apikey: SUPABASE_PUBLISHABLE,
  Authorization: `Bearer ${SUPABASE_PUBLISHABLE}`,
  "Content-Type": "application/json",
  // `return=minimal` não é economia de rede: é o que permite a tabela não ter
  // policy de SELECT nenhuma. Sem SELECT, ninguém com a chave pública consegue
  // ler um lead de volta — nem o próprio navegador que acabou de gravá-lo.
  Prefer: "return=minimal",
}

const CHAVE_SESSAO = "almore_funil_id"

/**
 * O id da linha é gerado aqui, no navegador, e não pelo banco.
 *
 * Parece detalhe e é a peça central do desenho de segurança. Se o id viesse do
 * `default gen_random_uuid()`, seria preciso pedir a linha de volta no INSERT
 * (`return=representation`) para saber qual atualizar depois — e isso exigiria
 * uma policy de SELECT, que abriria a tabela inteira para leitura pública.
 * Gerando o UUID no cliente, o INSERT não precisa devolver nada.
 */
function novoId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  // Navegador antigo sem crypto.randomUUID: melhor um id fraco do que perder
  // o lead. A coluna é chave primária, então uma colisão falharia alto.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16)
  })
}

export function idDaSessao(): string | null {
  try {
    return sessionStorage.getItem(CHAVE_SESSAO)
  } catch {
    return null // aba anônima com storage bloqueado
  }
}

function guardarId(id: string): void {
  try {
    sessionStorage.setItem(CHAVE_SESSAO, id)
  } catch {
    /* sem storage o formulário ainda funciona; só não sobrevive a um refresh */
  }
}

export function limparSessao(): void {
  try {
    sessionStorage.removeItem(CHAVE_SESSAO)
  } catch {
    /* nada a fazer */
  }
}

// A leitura da origem mora em origem.ts, porque ela precisa acontecer também
// na landing — antes de o formulário existir na tela.
export { lerOrigem as lerUtms } from "./origem"

/**
 * Resultado de uma gravação. O formulário nunca trava por causa do banco: se a
 * rede cair, o lead continua respondendo e a gente perde o registro, não a
 * conversa. Por isso o retorno é um aviso, não uma exceção.
 */
export type ResultadoGravacao = { ok: true; id: string } | { ok: false; erro: string }

async function enviar(url: string, metodo: "POST" | "PATCH", corpo: unknown) {
  const resposta = await fetch(url, {
    method: metodo,
    headers: cabecalhos,
    body: JSON.stringify(corpo),
  })
  if (!resposta.ok) {
    const texto = await resposta.text().catch(() => "")
    throw new Error(`${resposta.status} ${resposta.statusText} ${texto}`.trim())
  }
}

/**
 * Primeira gravação: acontece assim que o bloco de contato é preenchido e o
 * lead avança. É o motivo de o formulário existir aqui em vez de no Typeform —
 * quem abandonar na pergunta 7 já deixou nome, WhatsApp e e-mail no banco.
 */
export async function criarLead(respostas: Respostas): Promise<ResultadoGravacao> {
  const id = novoId()
  try {
    await enviar(REST, "POST", { id, ...respostas, ...lerOrigem() })
    guardarId(id)
    return { ok: true, id }
  } catch (e) {
    console.warn("[funil] não consegui criar o lead:", e)
    return { ok: false, erro: String(e) }
  }
}

/** Cada tela seguinte faz update na mesma linha. */
export async function atualizarLead(
  id: string,
  campos: Partial<Respostas>,
): Promise<ResultadoGravacao> {
  try {
    await enviar(`${REST}?id=eq.${encodeURIComponent(id)}`, "PATCH", {
      ...campos,
      atualizado_em: new Date().toISOString(),
    })
    return { ok: true, id }
  } catch (e) {
    console.warn("[funil] não consegui atualizar o lead:", e)
    return { ok: false, erro: String(e) }
  }
}

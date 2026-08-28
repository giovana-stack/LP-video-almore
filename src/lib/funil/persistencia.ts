import { paraE164 } from "./contato"
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
 * qualquer visitante consegue lê-la no DevTools. A chave `sb_secret_...` NUNCA
 * pode aparecer neste arquivo nem em nenhum outro do front: ela ignora RLS.
 *
 * NÃO se escreve na tabela daqui. A tabela `funil_leads` está fechada para o
 * público — sem SELECT, sem INSERT, sem UPDATE. Tudo passa pela função
 * `funil_salvar(id, dados)`, que roda com os privilégios do dono e exige o
 * UUID da linha. Sem leitura, ninguém descobre id alheio; sem id, a função não
 * faz nada. O porquê dessa volta está em sql/funil_leads.sql.
 */
const SUPABASE_URL = "https://ffdbojtidzmoklcpvnsz.supabase.co"
const SUPABASE_PUBLISHABLE = "sb_publishable__LklhoT23NAzaPHjb5mZWQ_aE3DHG7F"

const RPC_SALVAR = `${SUPABASE_URL}/rest/v1/rpc/funil_salvar`

const cabecalhos = {
  apikey: SUPABASE_PUBLISHABLE,
  Authorization: `Bearer ${SUPABASE_PUBLISHABLE}`,
  "Content-Type": "application/json",
}

const CHAVE_SESSAO = "almore_funil_id"

/**
 * O id da linha é gerado aqui, no navegador.
 *
 * É a peça que permite a gravação parcial sem abrir leitura pública: o cliente
 * já sabe o id antes de gravar, então nunca precisa perguntar ao banco qual
 * linha acabou de criar.
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

/**
 * Campo de texto ainda não preenchido vai como null, e não como "".
 *
 * O estado do formulário começa com string vazia nos três campos de contato,
 * porque um `<input>` controlado não aceita null. Se isso vazasse para o banco,
 * quem parou antes do e-mail teria `email = ''`, e o `where email is null` do
 * CRM não acharia essa pessoa — ela sumiria da lista de quem falta completar.
 */
function semVazios(dados: Partial<Respostas>): Partial<Respostas> {
  const saida: Partial<Respostas> = {}
  for (const [chave, valor] of Object.entries(dados)) {
    // @ts-expect-error — o mapa chave→tipo não sobrevive à indexação genérica.
    saida[chave] = typeof valor === "string" && valor.trim() === "" ? null : valor
  }
  return saida
}

/**
 * A fronteira entre o que o lead vê e o que o banco guarda.
 *
 * Na tela o telefone é `(19) 99999-9999`, porque é assim que se lê um número
 * no Brasil. No banco é `+5519999999999`, porque é o que a API do WhatsApp
 * aceita. A tradução acontece aqui e em nenhum outro lugar — o componente não
 * precisa saber que o banco tem um formato próprio.
 */
function paraBanco(dados: Partial<Respostas>): Partial<Respostas> {
  const saida = semVazios(dados)
  if (typeof saida.whatsapp === "string" && saida.whatsapp) {
    saida.whatsapp = paraE164(saida.whatsapp)
  }
  return saida
}

/** A única chamada que escreve. Cria na primeira vez, atualiza nas seguintes. */
async function salvar(id: string, bruto: Partial<Respostas>): Promise<ResultadoGravacao> {
  const dados = paraBanco(bruto)
  try {
    const resposta = await fetch(RPC_SALVAR, {
      method: "POST",
      headers: cabecalhos,
      body: JSON.stringify({ p_id: id, p_dados: dados }),
    })
    if (!resposta.ok) {
      const texto = await resposta.text().catch(() => "")
      throw new Error(`${resposta.status} ${resposta.statusText} ${texto}`.trim())
    }
    return { ok: true, id }
  } catch (e) {
    console.warn("[funil] não consegui gravar:", e)
    return { ok: false, erro: String(e) }
  }
}

/**
 * Primeira gravação: acontece assim que o bloco de contato é preenchido e o
 * lead avança. É o motivo de o formulário existir aqui em vez de no Typeform —
 * quem abandonar na pergunta 7 já deixou nome, WhatsApp e e-mail no banco.
 */
export async function criarLead(respostas: Respostas): Promise<ResultadoGravacao> {
  const id = novoId()
  const r = await salvar(id, { ...respostas, ...lerOrigem() })
  if (r.ok) guardarId(id)
  return r
}

/** Cada tela seguinte manda só o que mudou. */
export async function atualizarLead(
  id: string,
  campos: Partial<Respostas>,
): Promise<ResultadoGravacao> {
  return salvar(id, campos)
}

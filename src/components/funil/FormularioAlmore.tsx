import { useCallback, useMemo, useRef, useState } from "react"

import { emailValido, mascararTelefone, nomeValido, paraE164, telefoneValido } from "@/lib/funil/contato"
import { limparRespostasOrfas, telasVisiveis, type Opcao, type Tela } from "@/lib/funil/perguntas"
import { atualizarLead, criarLead, idDaSessao, lerUtms } from "@/lib/funil/persistencia"
import { RESPOSTAS_VAZIAS, type Respostas } from "@/lib/funil/tipos"
import {
  CONFIRMACAO_PADRAO,
  NOTA_MULTIPLOS_DECISORES,
  PERGUNTA_DECISORES,
  telaDeValorPara,
} from "@/lib/funil/valor"

import Agendamento from "./Agendamento"

/**
 * Formulário de captação da Almore.
 *
 * Multi-step, uma pergunta por tela. Perguntas de botão avançam sozinhas ao
 * toque — sem "continuar" embaixo, que num formulário assim só adiciona um
 * toque por tela. Perguntas de texto têm botão e aceitam Enter.
 *
 * A gravação é parcial e começa cedo: assim que o bloco de contato passa, a
 * linha já existe no banco. Quem desistir na pergunta 7 deixou nome, WhatsApp
 * e e-mail para trás. Cada tela seguinte faz update na mesma linha.
 *
 * TEXTOS: a copy das perguntas e das telas de valor é final e veio do brief —
 * ela é referenciada pelas mensagens de WhatsApp da automação, então reescrever
 * uma frase aqui desalinha os dois sistemas em silêncio. O que é texto novo
 * meu está marcado com "TEXTO NOVO — PENDENTE DE APROVAÇÃO".
 */

type Fase =
  | { nome: "perguntas" }
  | { nome: "valor" }
  | { nome: "padrao" }
  | { nome: "decisores" }
  | { nome: "agendamento" }
  | { nome: "recusa" }

export default function FormularioAlmore() {
  const [respostas, setRespostas] = useState<Respostas>(RESPOSTAS_VAZIAS)
  const [indice, setIndice] = useState(0)
  const [fase, setFase] = useState<Fase>({ nome: "perguntas" })
  const [enviando, setEnviando] = useState(false)

  // Erros do bloco de contato, por campo.
  const [erros, setErros] = useState<{ nome?: string; whatsapp?: string; email?: string }>({})

  // O id da linha vive num ref, e não no state: ele muda uma vez só e nenhuma
  // renderização depende dele. Em state, causaria um render à toa no meio do
  // preenchimento.
  const idLead = useRef<string | null>(null)

  const visiveis = useMemo(() => telasVisiveis(respostas), [respostas])
  const telaAtual: Tela | undefined = visiveis[indice]

  /** Grava em segundo plano. Nunca bloqueia o avanço: banco fora do ar não
   *  pode travar a conversa com o lead. */
  const gravar = useCallback((campos: Partial<Respostas>) => {
    const id = idLead.current ?? idDaSessao()
    if (!id) return
    idLead.current = id
    void atualizarLead(id, campos)
  }, [])

  const irPara = (novoIndice: number) => {
    setIndice(novoIndice)
    // Cada tela nova começa do topo: no celular, avançar sem isso deixa o lead
    // olhando para o meio da pergunta seguinte.
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "auto" })
  }

  const voltar = () => {
    if (indice > 0) irPara(indice - 1)
  }

  // ------------------------------------------------------------ bloco 1
  const enviarContato = async () => {
    const novosErros: typeof erros = {}
    // TEXTO NOVO — PENDENTE DE APROVAÇÃO (três mensagens de erro abaixo).
    if (!nomeValido(respostas.nome)) novosErros.nome = "Escreve seu nome aqui."
    if (!telefoneValido(respostas.whatsapp)) novosErros.whatsapp = "Esse número não parece completo."
    if (!emailValido(respostas.email)) novosErros.email = "Falta alguma coisa nesse e-mail."
    setErros(novosErros)
    if (Object.keys(novosErros).length > 0) return

    setEnviando(true)
    const comE164: Respostas = {
      ...respostas,
      nome: respostas.nome.trim(),
      email: respostas.email.trim(),
      whatsapp: paraE164(respostas.whatsapp),
      ...lerUtms(),
    }
    setRespostas(comE164)

    // A primeira gravação. Daqui para a frente é update.
    const r = await criarLead(comE164)
    if (r.ok) idLead.current = r.id
    setEnviando(false)
    irPara(indice + 1)
  }

  // ------------------------------------------------------- perguntas de botão
  const responder = (tela: Extract<Tela, { tipo: "escolha" }>, opcao: Opcao) => {
    const valor = opcao.valor !== undefined ? opcao.valor : opcao.rotulo

    let novas: Respostas = { ...respostas, [tela.campo]: valor } as Respostas
    // A pergunta do CNPJ define a trilha na mesma tacada.
    if (tela.campo === "cnpj_aberto") novas.trilha = valor === true ? "A" : "B"
    novas = limparRespostasOrfas(novas)

    setRespostas(novas)

    const campos: Partial<Respostas> = { [tela.campo]: valor } as Partial<Respostas>
    if (tela.campo === "cnpj_aberto") campos.trilha = novas.trilha
    gravar(campos)

    // Avança sozinha, como o brief pede. O índice é calculado sobre a lista
    // nova, porque responder o CNPJ muda quais telas existem daqui pra frente.
    const proximasVisiveis = telasVisiveis(novas)
    const posicaoAtual = proximasVisiveis.findIndex((t) => t.id === tela.id)
    irPara(posicaoAtual + 1)
  }

  // ---------------------------------------------------------------- envio
  const enviarFormulario = async () => {
    if (!respostas.consentimento_whatsapp) return
    setEnviando(true)

    const tela = telaDeValorPara(respostas)
    // O valor é gravado no envio, ANTES de qualquer clique do lead — assim o
    // CRM sabe qual preço foi mostrado mesmo para quem fechou a aba na hora.
    const campos: Partial<Respostas> = {
      consentimento_whatsapp: true,
      formulario_completo: true,
      valor_informado: tela?.valorInformado ?? null,
      status: tela ? "aguardando_decisao_valor" : "novo",
    }

    setRespostas((r) => ({ ...r, ...campos }))
    const id = idLead.current ?? idDaSessao()
    if (id) await atualizarLead(id, campos)

    setEnviando(false)
    setFase(tela ? { nome: "valor" } : { nome: "padrao" })
  }

  const aceitarValor = async () => {
    const campos: Partial<Respostas> = { status: "valor_aceito_sem_agendamento" }
    setRespostas((r) => ({ ...r, ...campos }))
    gravar(campos)
    setFase({ nome: "decisores" })
  }

  const recusarValor = async () => {
    const campos: Partial<Respostas> = { status: "nao_atende_preco" }
    setRespostas((r) => ({ ...r, ...campos }))
    gravar(campos)
    setFase({ nome: "recusa" })
  }

  const responderDecisores = (multiplos: boolean) => {
    setRespostas((r) => ({ ...r, multiplos_decisores: multiplos }))
    gravar({ multiplos_decisores: multiplos })
    setFase({ nome: "agendamento" })
  }

  // ================================================================= render
  const totalDePassos = visiveis.length
  const progresso = fase.nome === "perguntas" ? (indice / totalDePassos) * 100 : 100

  return (
    <div className="funil-almore">
      <header className="funil-topo">
        <a className="funil-marca" href="/">
          <img src="/almore-isotipo.png" alt="Almore Inteligência Contábil" width={307} height={240} />
        </a>
        {fase.nome === "perguntas" ? (
          <span className="funil-passo">
            {indice + 1} de {totalDePassos}
          </span>
        ) : null}
      </header>

      <div
        className="funil-barra"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progresso)}
        aria-label="Progresso do formulário"
      >
        <div className="funil-barra-preenchida" style={{ width: `${progresso}%` }} />
      </div>

      <main className="funil-palco">
        {fase.nome === "perguntas" && telaAtual ? (
          <>
            {telaAtual.tipo === "contato" ? (
              <BlocoContato
                respostas={respostas}
                erros={erros}
                enviando={enviando}
                onChange={(campo, valor) => {
                  setRespostas((r) => ({ ...r, [campo]: valor }))
                  setErros((e) => ({ ...e, [campo]: undefined }))
                }}
                onAvancar={enviarContato}
              />
            ) : null}

            {telaAtual.tipo === "escolha" ? (
              <fieldset className="funil-tela">
                <legend className="funil-pergunta">{telaAtual.pergunta}</legend>
                <div className="funil-opcoes">
                  {telaAtual.opcoes.map((o) => {
                    const valor = o.valor !== undefined ? o.valor : o.rotulo
                    const escolhida = respostas[telaAtual.campo] === valor
                    return (
                      <button
                        key={o.rotulo}
                        type="button"
                        className={`funil-opcao${escolhida ? " funil-opcao--ativa" : ""}`}
                        onClick={() => responder(telaAtual, o)}
                        aria-pressed={escolhida}
                      >
                        {o.rotulo}
                      </button>
                    )
                  })}
                </div>
              </fieldset>
            ) : null}

            {telaAtual.tipo === "fechamento" ? (
              <div className="funil-tela">
                {/* TEXTO NOVO — PENDENTE DE APROVAÇÃO (o título desta tela). */}
                <h2 className="funil-pergunta">Só falta confirmar.</h2>
                <label className="funil-consentimento">
                  <input
                    type="checkbox"
                    checked={respostas.consentimento_whatsapp}
                    onChange={(e) =>
                      setRespostas((r) => ({ ...r, consentimento_whatsapp: e.target.checked }))
                    }
                  />
                  <span>
                    Concordo em receber contato pelo WhatsApp e por ligação, no número informado
                  </span>
                </label>
                <button
                  type="button"
                  className="funil-botao"
                  disabled={!respostas.consentimento_whatsapp || enviando}
                  onClick={enviarFormulario}
                >
                  {/* TEXTO NOVO — PENDENTE DE APROVAÇÃO. */}
                  {enviando ? "Enviando…" : "Enviar"}
                </button>
              </div>
            ) : null}

            {indice > 0 ? (
              <button type="button" className="funil-voltar" onClick={voltar}>
                {/* TEXTO NOVO — PENDENTE DE APROVAÇÃO. */}
                Voltar
              </button>
            ) : null}
          </>
        ) : null}

        {fase.nome === "valor" ? <TelaValor respostas={respostas} onAceitar={aceitarValor} onRecusar={recusarValor} /> : null}

        {fase.nome === "padrao" ? (
          <div className="funil-tela funil-tela--final">
            <p className="funil-texto-final">{CONFIRMACAO_PADRAO}</p>
          </div>
        ) : null}

        {fase.nome === "decisores" ? (
          <fieldset className="funil-tela">
            <legend className="funil-pergunta">{PERGUNTA_DECISORES}</legend>
            <div className="funil-opcoes">
              {/* TEXTO NOVO — PENDENTE DE APROVAÇÃO (os dois rótulos). O brief
                  diz "duas opções de resposta" sem definir o texto delas. */}
              <button type="button" className="funil-opcao" onClick={() => responderDecisores(false)}>
                Decido sozinho
              </button>
              <button type="button" className="funil-opcao" onClick={() => responderDecisores(true)}>
                Tem mais alguém que decide junto
              </button>
            </div>
          </fieldset>
        ) : null}

        {fase.nome === "agendamento" ? (
          <div className="funil-tela funil-tela--larga">
            <Agendamento nota={respostas.multiplos_decisores ? NOTA_MULTIPLOS_DECISORES : undefined} />
          </div>
        ) : null}

        {fase.nome === "recusa" ? (
          <div className="funil-tela funil-tela--final">
            {/* TEXTO NOVO — PENDENTE DE APROVAÇÃO. O brief diz que o fluxo
                termina sem tela adicional, mas alguma coisa precisa aparecer
                na tela do lead depois do clique. */}
            <p className="funil-texto-final">Tudo bem. Obrigado pelo seu tempo.</p>
          </div>
        ) : null}
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------------

function BlocoContato({
  respostas,
  erros,
  enviando,
  onChange,
  onAvancar,
}: {
  respostas: Respostas
  erros: { nome?: string; whatsapp?: string; email?: string }
  enviando: boolean
  onChange: (campo: "nome" | "whatsapp" | "email", valor: string) => void
  onAvancar: () => void
}) {
  // Enter avança, como o brief pede para as perguntas de texto.
  const noEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      onAvancar()
    }
  }

  return (
    <div className="funil-tela">
      {/* TEXTO NOVO — PENDENTE DE APROVAÇÃO (o título desta tela). */}
      <h2 className="funil-pergunta">Pra começar, como falamos com você?</h2>

      <div className="funil-campos">
        <label className="funil-campo">
          <span className="funil-rotulo">Nome</span>
          <input
            type="text"
            value={respostas.nome}
            placeholder="Maria"
            autoComplete="name"
            onChange={(e) => onChange("nome", e.target.value)}
            onKeyDown={noEnter}
            aria-invalid={!!erros.nome}
          />
          {erros.nome ? <span className="funil-erro">{erros.nome}</span> : null}
        </label>

        <label className="funil-campo">
          <span className="funil-rotulo">WhatsApp</span>
          <input
            type="tel"
            inputMode="numeric"
            value={respostas.whatsapp}
            placeholder="(19) 99999-9999"
            autoComplete="tel-national"
            onChange={(e) => onChange("whatsapp", mascararTelefone(e.target.value))}
            onKeyDown={noEnter}
            aria-invalid={!!erros.whatsapp}
          />
          {erros.whatsapp ? <span className="funil-erro">{erros.whatsapp}</span> : null}
        </label>

        <label className="funil-campo">
          <span className="funil-rotulo">E-mail</span>
          <input
            type="email"
            value={respostas.email}
            placeholder="maria@empresa.com.br"
            autoComplete="email"
            onChange={(e) => onChange("email", e.target.value)}
            onKeyDown={noEnter}
            aria-invalid={!!erros.email}
          />
          {erros.email ? <span className="funil-erro">{erros.email}</span> : null}
        </label>
      </div>

      <button type="button" className="funil-botao" onClick={onAvancar} disabled={enviando}>
        {/* TEXTO NOVO — PENDENTE DE APROVAÇÃO. */}
        {enviando ? "Só um instante…" : "Continuar"}
      </button>
    </div>
  )
}

function TelaValor({
  respostas,
  onAceitar,
  onRecusar,
}: {
  respostas: Respostas
  onAceitar: () => void
  onRecusar: () => void
}) {
  const tela = telaDeValorPara(respostas)
  if (!tela) return null

  return (
    <div className="funil-tela funil-tela--final">
      <p className="funil-texto-valor">{tela.texto(respostas)}</p>
      <div className="funil-acoes">
        <button type="button" className="funil-botao" onClick={onAceitar}>
          Está de acordo, quero agendar
        </button>
        <button type="button" className="funil-botao funil-botao--fantasma" onClick={onRecusar}>
          Prefiro não seguir agora
        </button>
      </div>
    </div>
  )
}

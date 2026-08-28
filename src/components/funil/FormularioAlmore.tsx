import { useCallback, useMemo, useRef, useState } from "react"

import { paraE164 } from "@/lib/funil/contato"
import { INSTAGRAM, LINKEDIN, temLinkedin } from "@/lib/redes"
import { limparRespostasOrfas, telasVisiveis, type Opcao, type Tela } from "@/lib/funil/perguntas"
import { atualizarLead, criarLead, idDaSessao } from "@/lib/funil/persistencia"
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
 * Multi-step, uma pergunta por tela — as três de contato inclusive. Perguntas
 * de botão avançam sozinhas ao toque, sem "continuar" embaixo, que num
 * formulário assim só adiciona um toque por tela. Perguntas de texto têm botão
 * e aceitam Enter.
 *
 * A gravação acontece a CADA avanço, e não no fim de um bloco. É o motivo de o
 * formulário existir aqui em vez de no Typeform: quem largar depois de dar o
 * nome e o WhatsApp já deixou um canal de contato para trás.
 *
 * TEXTOS: a copy das perguntas de negócio e das telas de valor é final e veio
 * do brief — ela é referenciada pelas mensagens de WhatsApp da automação, então
 * reescrever uma frase aqui desalinha os dois sistemas em silêncio. O que é
 * texto novo meu está marcado com "TEXTO NOVO — PENDENTE DE APROVAÇÃO".
 */

type Fase =
  | { nome: "perguntas" }
  | { nome: "valor" }
  | { nome: "padrao" }
  | { nome: "decisores" }
  | { nome: "agendamento" }
  | { nome: "recusa" }

/** O que mudou entre duas respostas. Só isso viaja para o banco. */
function diferenca(antes: Respostas, depois: Respostas): Partial<Respostas> {
  const saida: Partial<Respostas> = {}
  for (const chave of Object.keys(depois) as (keyof Respostas)[]) {
    if (antes[chave] !== depois[chave]) {
      // @ts-expect-error — chave e valor vêm do mesmo objeto, mas o
      // mapeamento entre eles não sobrevive à indexação genérica.
      saida[chave] = depois[chave]
    }
  }
  return saida
}

export default function FormularioAlmore() {
  const [respostas, setRespostas] = useState<Respostas>(RESPOSTAS_VAZIAS)
  const [indice, setIndice] = useState(0)
  const [fase, setFase] = useState<Fase>({ nome: "perguntas" })
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // O id da linha vive num ref, e não no state: ele muda uma vez só e nenhuma
  // renderização depende dele. Em state, causaria um render à toa no meio do
  // preenchimento.
  const idLead = useRef<string | null>(null)

  const visiveis = useMemo(() => telasVisiveis(respostas), [respostas])
  const telaAtual: Tela | undefined = visiveis[indice]

  /**
   * Grava em segundo plano. Nunca bloqueia o avanço: banco fora do ar não pode
   * travar a conversa com o lead. Cria a linha na primeira vez que é chamada.
   */
  const gravar = useCallback(
    (campos: Partial<Respostas>, tudo: Respostas) => {
      if (Object.keys(campos).length === 0) return
      const id = idLead.current ?? idDaSessao()
      if (id) {
        idLead.current = id
        void atualizarLead(id, campos)
        return
      }
      // Primeira gravação: nasce a linha, já com a origem da campanha.
      void criarLead(tudo).then((r) => {
        if (r.ok) idLead.current = r.id
      })
    },
    [],
  )

  const irPara = (novoIndice: number) => {
    setIndice(novoIndice)
    setErro(null)
    // Cada tela nova começa do topo: no celular, avançar sem isso deixa o lead
    // olhando para o meio da pergunta seguinte.
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "auto" })
  }

  const voltar = () => {
    if (indice > 0) irPara(indice - 1)
  }

  // ------------------------------------------------------- perguntas de texto
  const responderTexto = (tela: Extract<Tela, { tipo: "texto" }>) => {
    const bruto = respostas[tela.campo]
    if (!tela.valida(bruto)) {
      setErro(tela.erro)
      return
    }

    // O estado guarda o que o lead VÊ — `(19) 99999-9999`. A conversão para
    // E.164 acontece só na fronteira do banco, em persistencia.ts. Convertendo
    // aqui, voltar uma tela mostrava `+5519999999999` no campo, e bastava
    // editar para a máscara ler o `55` como DDD e destruir o número.
    const limpo = bruto.trim()
    const novas: Respostas = { ...respostas, [tela.campo]: limpo }

    setRespostas(novas)

    // O campo da tela entra SEMPRE, e não só quando o diff acusa mudança.
    // Num campo de texto o valor já está no estado desde a digitação, então
    // `diferenca` costuma sair vazia aqui — o `.trim()` não muda nada. Confiar
    // no diff fazia o e-mail nunca ser gravado: o nome e o WhatsApp só
    // escapavam por acaso, porque o telefone vira E.164 e isso mudava o valor.
    gravar({ ...diferenca(respostas, novas), [tela.campo]: limpo }, novas)
    irPara(indice + 1)
  }

  // ------------------------------------------------------- perguntas de botão
  const responderEscolha = (tela: Extract<Tela, { tipo: "escolha" }>, opcao: Opcao) => {
    const valor = opcao.valor !== undefined ? opcao.valor : opcao.rotulo

    let novas: Respostas = { ...respostas, [tela.campo]: valor } as Respostas
    // A pergunta do CNPJ define a trilha na mesma tacada.
    if (tela.campo === "cnpj_aberto") novas.trilha = valor === true ? "A" : "B"
    novas = limparRespostasOrfas(novas)

    setRespostas(novas)

    // Manda o diff inteiro, e não só o campo respondido. A diferença aparece
    // quando o lead volta e troca o regime: `limparRespostasOrfas` zera o
    // `mei_quer_sair`, e esse null precisa chegar ao banco.
    gravar(diferenca(respostas, novas), novas)

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

    const novas = { ...respostas, ...campos } as Respostas
    setRespostas(novas)
    const id = idLead.current ?? idDaSessao()
    if (id) await atualizarLead(id, campos)

    setEnviando(false)
    setFase(tela ? { nome: "valor" } : { nome: "padrao" })
  }

  const aceitarValor = () => {
    const campos: Partial<Respostas> = { status: "valor_aceito_sem_agendamento" }
    setRespostas((r) => ({ ...r, ...campos }))
    gravar(campos, { ...respostas, ...campos } as Respostas)
    setFase({ nome: "decisores" })
  }

  const recusarValor = () => {
    const campos: Partial<Respostas> = { status: "nao_atende_preco" }
    setRespostas((r) => ({ ...r, ...campos }))
    gravar(campos, { ...respostas, ...campos } as Respostas)
    setFase({ nome: "recusa" })
  }

  const responderDecisores = (multiplos: boolean) => {
    const campos: Partial<Respostas> = { multiplos_decisores: multiplos }
    setRespostas((r) => ({ ...r, ...campos }))
    gravar(campos, { ...respostas, ...campos } as Respostas)
    setFase({ nome: "agendamento" })
  }

  // ================================================================= render
  const totalDePassos = visiveis.length
  const progresso = fase.nome === "perguntas" ? (indice / totalDePassos) * 100 : 100
  const secao = telaAtual && telaAtual.tipo !== "fechamento" ? telaAtual.secao : null

  return (
    <div className="funil-almore">
      <header className="funil-topo">
        <a className="funil-marca" href="/">
          <img
            src="/almore-isotipo.png"
            alt="Almore Inteligência Contábil"
            width={307}
            height={240}
          />
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

      {/*
        O voltar mora no topo, logo abaixo da barra de progresso e acima de
        tudo — inclusive do rótulo da seção. Embaixo do conteúdo ele ficava
        depois do botão de avançar, e no celular sumia abaixo da dobra em
        telas com muitas alternativas.
      */}
      {fase.nome === "perguntas" && indice > 0 ? (
        <div className="funil-voltar-linha">
          <button type="button" className="funil-voltar" onClick={voltar}>
            {/* TEXTO NOVO — PENDENTE DE APROVAÇÃO. */}
            Voltar
          </button>
        </div>
      ) : null}

      <main className="funil-palco">
        {fase.nome === "perguntas" && telaAtual ? (
          <>
            {secao ? <p className="funil-secao">{secao}</p> : null}

            {telaAtual.tipo === "texto" ? (
              <div className="funil-tela">
                <h2 className="funil-pergunta">{telaAtual.pergunta}</h2>
                <div className="funil-campo">
                  <input
                    key={telaAtual.id}
                    type={telaAtual.tipoDoInput}
                    inputMode={telaAtual.campo === "whatsapp" ? "numeric" : undefined}
                    value={respostas[telaAtual.campo]}
                    placeholder={telaAtual.placeholder}
                    autoComplete={telaAtual.autoComplete}
                    autoFocus
                    aria-invalid={!!erro}
                    aria-label={telaAtual.pergunta}
                    onChange={(e) => {
                      const v = telaAtual.mascara ? telaAtual.mascara(e.target.value) : e.target.value
                      setRespostas((r) => ({ ...r, [telaAtual.campo]: v }))
                      setErro(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        responderTexto(telaAtual)
                      }
                    }}
                  />
                  {erro ? <span className="funil-erro">{erro}</span> : null}
                </div>
                <button
                  type="button"
                  className="funil-botao"
                  onClick={() => responderTexto(telaAtual)}
                  disabled={enviando}
                >
                  {/* TEXTO NOVO — PENDENTE DE APROVAÇÃO. */}
                  Continuar
                </button>
              </div>
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
                        onClick={() => responderEscolha(telaAtual, o)}
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
                {/* Sem título aqui: a tabela 1.3 marca o consentimento como
                    "(checkbox, não é pergunta)". O texto do consentimento é
                    a única coisa que a tela precisa dizer. */}
                <label className="funil-consentimento funil-consentimento--sozinho">
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

          </>
        ) : null}

        {fase.nome === "valor" ? (
          <TelaValor respostas={respostas} onAceitar={aceitarValor} onRecusar={recusarValor} />
        ) : null}

        {fase.nome === "padrao" ? (
          <div className="funil-tela funil-tela--final">
            <p className="funil-texto-final">{CONFIRMACAO_PADRAO}</p>
          </div>
        ) : null}

        {fase.nome === "decisores" ? (
          <fieldset className="funil-tela">
            <legend className="funil-pergunta">{PERGUNTA_DECISORES}</legend>
            <div className="funil-opcoes">
              {/* TEXTO NOVO — PENDENTE DE APROVAÇÃO (os dois rótulos). O
                  documento descreve os dois caminhos como "decisor único" e
                  "múltiplos decisores", mas não dá o texto dos botões. Estes
                  ecoam as palavras da própria pergunta. */}
              <button
                type="button"
                className="funil-opcao"
                onClick={() => responderDecisores(false)}
              >
                Decido sozinho
              </button>
              <button
                type="button"
                className="funil-opcao"
                onClick={() => responderDecisores(true)}
              >
                Tenho outros sócios/decisores
              </button>
            </div>
          </fieldset>
        ) : null}

        {fase.nome === "agendamento" ? (
          <div className="funil-tela funil-tela--larga">
            <Agendamento
              nota={respostas.multiplos_decisores ? NOTA_MULTIPLOS_DECISORES : undefined}
            />
          </div>
        ) : null}

        {fase.nome === "recusa" ? (
          <div className="funil-tela funil-tela--final">
            {/* TEXTO NOVO — PENDENTE DE APROVAÇÃO. O documento diz que o fluxo
                termina sem tela adicional, mas alguma coisa precisa aparecer
                na tela do lead depois do clique. */}
            <p className="funil-texto-final">Tudo bem. Obrigado pelo seu tempo.</p>
            <p className="funil-texto-final funil-texto-final--menor">
              Se quiser nos conhecer melhor enquanto isso, estamos no{" "}
              {temLinkedin ? (
                <>
                  <a href={LINKEDIN} target="_blank" rel="noopener noreferrer">
                    LinkedIn
                  </a>{" "}
                  e no{" "}
                </>
              ) : null}
              <a href={INSTAGRAM} target="_blank" rel="noopener noreferrer">
                Instagram
              </a>
              .
            </p>
          </div>
        ) : null}
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------------

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

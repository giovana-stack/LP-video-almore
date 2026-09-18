import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { paraE164 } from "@/lib/funil/contato"
import { INSTAGRAM, LINKEDIN } from "@/lib/redes"
import { limparRespostasOrfas, telasVisiveis, type Opcao, type Tela } from "@/lib/funil/perguntas"
import {
  PASSO_AGENDAMENTO,
  PASSO_DECISORES,
  PASSO_PREFERENCIA_ATENDIMENTO,
  PASSO_RECUSA,
  PASSO_VALOR,
  passoDaTela,
  passoParaEvento,
  type PassoDoFunil,
} from "@/lib/funil/passos"
import { atualizarLead, criarLead, idDaSessao, limparSessao } from "@/lib/funil/persistencia"
import { criarTrackerDoNavegador, type EventoNovoDoTracker, type TrackerDoFunil } from "@/lib/funil/tracker"
import { RESPOSTAS_VAZIAS, type Respostas } from "@/lib/funil/tipos"
import {
  CONFIRMACAO_PADRAO,
  CONFIRMACAO_PADRAO_TITULO,
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
 * TEXTOS: as perguntas, as opções e as telas de valor são cópia literal do
 * documento de execução (VERSÃO COM SDR DE VOZ) — elas são referenciadas pelas
 * mensagens de WhatsApp da automação, então reescrever uma frase aqui
 * desalinha os dois sistemas em silêncio.
 *
 * O que NÃO está no documento (mensagens de erro, botões de navegação, os
 * rótulos dos decisores e a linha da recusa) está marcado com "TEXTO FORA DO
 * DOCUMENTO". A marcação fica mesmo depois de aprovado: ela diz de onde a
 * frase veio, e é o que avisa quem for comparar código e PDF um dia.
 *
 * Uma exceção conhecida: o botão do aceite diz "Estou de acordo", enquanto o
 * documento escreve "Está de acordo" — divergência pedida e deliberada.
 */

type Fase =
  | { nome: "perguntas" }
  | { nome: "valor" }
  | { nome: "preferencia" }
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
  // O aceite tem erro próprio porque tem lugar próprio na tela: o do número
  // aparece colado no campo, o do aceite embaixo da caixa. Num state só, marcar
  // a caixa com o número errado trocava a mensagem de lugar.
  const [erroConsentimento, setErroConsentimento] = useState<string | null>(null)

  // O id da linha vive num ref, e não no state: ele muda uma vez só e nenhuma
  // renderização depende dele. Em state, causaria um render à toa no meio do
  // preenchimento.
  const idLead = useRef<string | null>(idDaSessao())
  const tracker = useRef<TrackerDoFunil | null>(null)
  const trackerIniciado = useRef(false)
  if (!tracker.current) tracker.current = criarTrackerDoNavegador()

  const registrarEvento = useCallback((evento: EventoNovoDoTracker) => {
    tracker.current?.registrar(evento)
  }, [])

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
        if (r.ok) {
          idLead.current = r.id
          tracker.current?.associarLead(r.id)
        }
      })
    },
    [],
  )

  const irPara = (novoIndice: number) => {
    setIndice(novoIndice)
    setErro(null)
    setErroConsentimento(null)
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
      registrarEvento({ event_name: "step_validation_failed", ...passoParaEvento(passoDaTela(tela)) })
      return
    }

    // O aceite trava o avanço, não o botão. Botão desabilitado sem explicação é
    // um beco: o lead clica, nada acontece e ele não sabe o que falta. Assim
    // ele clica, e a tela responde dizendo o que falta.
    // TEXTO FORA DO DOCUMENTO — 16/09/2026.
    if (tela.pedeConsentimento && !respostas.consentimento_whatsapp) {
      setErroConsentimento("Marque a caixa acima para continuar.")
      registrarEvento({ event_name: "step_validation_failed", ...passoParaEvento(passoDaTela(tela)) })
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
    // O aceite vai junto, pelo mesmo motivo do campo: ele já está no estado
    // desde o clique na caixa, então o diff não o vê. E ele precisa chegar ao
    // banco AQUI, na tela em que foi dado — quem largar o formulário depois
    // disso já deixou o consentimento registrado, com hora e tudo.
    gravar(
      {
        ...diferenca(respostas, novas),
        [tela.campo]: limpo,
        ...(tela.pedeConsentimento ? { consentimento_whatsapp: true } : {}),
      },
      novas,
    )
    registrarEvento({ event_name: "step_completed", ...passoParaEvento(passoDaTela(tela)) })
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
    registrarEvento({ event_name: "step_completed", ...passoParaEvento(passoDaTela(tela)) })

    // Avança sozinha, como o brief pede. O índice é calculado sobre a lista
    // nova, porque responder o CNPJ muda quais telas existem daqui pra frente.
    const proximasVisiveis = telasVisiveis(novas)
    const posicaoAtual = proximasVisiveis.findIndex((t) => t.id === tela.id)
    irPara(posicaoAtual + 1)
  }

  // ---------------------------------------------------------------- envio
  const enviarFormulario = async (preferencia?: "ligacao" | "whatsapp") => {
    if (!respostas.consentimento_whatsapp) return
    // A tela de valor é calculada aqui, antes de tudo, porque é ela que
    // decide o caminho inteiro daqui pra frente.
    const tela = telaDeValorPara(respostas)

    // SEM preço para mostrar, o lead escolhe o canal antes da confirmação.
    //
    // Quem não recebe valor não agenda nada: ele vai ser PROCURADO pela
    // especialista, e a única coisa que falta saber é por onde. Quem recebe
    // valor não passa por aqui — aceitando o preço, ele mesmo marca dia e hora
    // na agenda, e perguntar o canal a quem já marcou não muda nada.
    //
    // Regra trocada em 18/09/2026. Antes a pergunta era de quem queria abrir
    // empresa (`trilha === "B"`), que é justamente quem VÊ preço e agenda — o
    // caminho em que ela menos fazia sentido.
    if (!tela && !preferencia) {
      registrarEvento({ event_name: "step_completed", step_key: "form_review", step_index: 14 })
      setFase({ nome: "preferencia" })
      return
    }

    setEnviando(true)

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
    if (id) {
      const resultado = await atualizarLead(id, campos)
      if (resultado.ok) {
        idLead.current = resultado.id
        tracker.current?.associarLead(resultado.id)
      }
    }

    registrarEvento({ event_name: "form_submitted", step_key: "form_review", step_index: 14 })
    registrarEvento({ event_name: "funnel_completed", step_key: "form_review", step_index: 14 })

    // A próxima abertura do formulário é um novo contato. Espera a fila do
    // tracker antes de limpar os IDs: se estiver offline, mantém a sessão para
    // retry em vez de perder a conclusão ou atualizar o lead anterior.
    void tracker.current?.encerrar().then((encerrou) => {
      if (encerrou) limparSessao()
    })

    setEnviando(false)
    setFase(tela ? { nome: "valor" } : { nome: "padrao" })
  }

  const aceitarValor = () => {
    registrarEvento({ event_name: "step_completed", ...passoParaEvento(PASSO_VALOR) })
    const campos: Partial<Respostas> = { status: "valor_aceito_sem_agendamento" }
    setRespostas((r) => ({ ...r, ...campos }))
    gravar(campos, { ...respostas, ...campos } as Respostas)
    setFase({ nome: "decisores" })
  }

  const recusarValor = () => {
    registrarEvento({ event_name: "step_completed", ...passoParaEvento(PASSO_VALOR) })
    const campos: Partial<Respostas> = { status: "nao_atende_preco" }
    setRespostas((r) => ({ ...r, ...campos }))
    gravar(campos, { ...respostas, ...campos } as Respostas)
    setFase({ nome: "recusa" })
  }

  const responderDecisores = (multiplos: boolean) => {
    registrarEvento({ event_name: "step_completed", ...passoParaEvento(PASSO_DECISORES) })
    const campos: Partial<Respostas> = { multiplos_decisores: multiplos }
    setRespostas((r) => ({ ...r, ...campos }))
    gravar(campos, { ...respostas, ...campos } as Respostas)
    setFase({ nome: "agendamento" })
  }

  const selecionarPreferencia = (preferencia: "ligacao" | "whatsapp") => {
    registrarEvento({
      event_name: "contact_preference_selected",
      ...passoParaEvento(PASSO_PREFERENCIA_ATENDIMENTO),
      metadata: { preferencia_atendimento: preferencia },
    })
    registrarEvento({ event_name: "step_completed", ...passoParaEvento(PASSO_PREFERENCIA_ATENDIMENTO) })
    void enviarFormulario(preferencia)
  }

  // ================================================================= render
  const totalDePassos = visiveis.length
  const progresso = fase.nome === "perguntas" ? (indice / totalDePassos) * 100 : 100
  const secao = telaAtual && telaAtual.tipo !== "fechamento" ? telaAtual.secao : null
  const passoAtual: PassoDoFunil | undefined =
    fase.nome === "perguntas"
      ? passoDaTela(telaAtual)
      : fase.nome === "preferencia"
        ? PASSO_PREFERENCIA_ATENDIMENTO
        : fase.nome === "valor"
          ? PASSO_VALOR
          : fase.nome === "decisores"
            ? PASSO_DECISORES
            : fase.nome === "agendamento"
              ? PASSO_AGENDAMENTO
              : fase.nome === "recusa"
                ? PASSO_RECUSA
                : undefined

  useEffect(() => {
    if (idLead.current) tracker.current?.associarLead(idLead.current)
    const tentarNovamente = () => void tracker.current?.tentarNovamente()
    window.addEventListener("online", tentarNovamente)
    return () => window.removeEventListener("online", tentarNovamente)
  }, [])

  useEffect(() => {
    if (!passoAtual) return
    // O primeiro evento já carrega a etapa. Se a aba for fechada cedo demais
    // para o segundo evento sair, ainda sabemos que a pessoa chegou nela.
    if (!trackerIniciado.current) {
      trackerIniciado.current = true
      registrarEvento({ event_name: "funnel_started", ...passoParaEvento(passoAtual) })
    }
    registrarEvento({ event_name: "step_viewed", ...passoParaEvento(passoAtual) })
    if (passoAtual.key === PASSO_AGENDAMENTO.key) {
      registrarEvento({ event_name: "booking_viewed", ...passoParaEvento(PASSO_AGENDAMENTO) })
    }
  }, [passoAtual?.key, registrarEvento])

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
            {/* TEXTO FORA DO DOCUMENTO — aprovado em 28/08/2026. */}
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

                {/*
                  O aceite mora aqui, na tela do WhatsApp, e não numa tela sua
                  no fim: ele autoriza o contato NESTE número, e é este número
                  que está logo acima. Numa tela solta lá na frente, o lead lia
                  "no número informado" sem ter mais o número à vista.
                */}
                {telaAtual.pedeConsentimento ? (
                  <div className="funil-consentimento-bloco">
                    <label className="funil-consentimento">
                      <input
                        type="checkbox"
                        checked={respostas.consentimento_whatsapp}
                        onChange={(e) => {
                          setRespostas((r) => ({
                            ...r,
                            consentimento_whatsapp: e.target.checked,
                          }))
                          setErroConsentimento(null)
                        }}
                      />
                      <span>
                        Concordo em receber contato pelo WhatsApp e por ligação, no número
                        informado
                      </span>
                    </label>
                    {erroConsentimento ? (
                      <span className="funil-erro">{erroConsentimento}</span>
                    ) : null}
                  </div>
                ) : null}

                <button
                  type="button"
                  className="funil-botao"
                  onClick={() => responderTexto(telaAtual)}
                  disabled={enviando}
                >
                  {/* TEXTO FORA DO DOCUMENTO — aprovado em 28/08/2026. */}
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
                {/*
                  O aceite saiu daqui para a tela do WhatsApp (16/09/2026), e
                  esta tela ficaria sendo um botão sozinho no meio do nada. Em
                  vez de encher com frase de efeito, ela mostra o que o lead
                  acabou de digitar: é a última chance de ver um dígito trocado
                  no telefone antes de a especialista ligar para o número errado.
                  TEXTO FORA DO DOCUMENTO — 16/09/2026.
                */}
                <h2 className="funil-pergunta">Confira seus dados antes de enviar</h2>
                <dl className="funil-revisao">
                  <div>
                    <dt>Nome</dt>
                    <dd>{respostas.nome}</dd>
                  </div>
                  <div>
                    <dt>WhatsApp</dt>
                    <dd>{respostas.whatsapp}</dd>
                  </div>
                  <div>
                    <dt>E-mail</dt>
                    <dd>{respostas.email}</dd>
                  </div>
                </dl>
                <button
                  type="button"
                  className="funil-botao"
                  disabled={!respostas.consentimento_whatsapp || enviando}
                  onClick={() => void enviarFormulario()}
                >
                  {/* TEXTO FORA DO DOCUMENTO — aprovado em 28/08/2026. */}
                  {enviando ? "Enviando…" : "Enviar"}
                </button>
              </div>
            ) : null}

          </>
        ) : null}

        {fase.nome === "valor" ? (
          <TelaValor respostas={respostas} onAceitar={aceitarValor} onRecusar={recusarValor} />
        ) : null}

        {fase.nome === "preferencia" ? (
          <div className="funil-tela funil-tela--final">
            <h2 className="funil-final-titulo">Como você prefere ser atendido?</h2>
            <p className="funil-texto-final">
              Escolha uma opção para concluirmos seu diagnóstico.
            </p>
            <div className="funil-acoes">
              <button
                type="button"
                className="funil-botao"
                disabled={enviando}
                onClick={() => selecionarPreferencia("ligacao")}
              >
                Receber uma ligação
              </button>
              <button
                type="button"
                className="funil-botao funil-botao--fantasma"
                disabled={enviando}
                onClick={() => selecionarPreferencia("whatsapp")}
              >
                Continuar pelo WhatsApp
              </button>
            </div>
          </div>
        ) : null}

        {fase.nome === "padrao" ? (
          <div className="funil-tela funil-tela--final">
            <h2 className="funil-final-titulo">{CONFIRMACAO_PADRAO_TITULO}</h2>
            <p className="funil-texto-final">{CONFIRMACAO_PADRAO}</p>
          </div>
        ) : null}

        {fase.nome === "decisores" ? (
          <fieldset className="funil-tela">
            <legend className="funil-pergunta">{PERGUNTA_DECISORES}</legend>
            <div className="funil-opcoes">
              {/* TEXTO FORA DO DOCUMENTO — aprovado em 28/08/2026 (os dois rótulos). O
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
              onConcluir={() =>
                registrarEvento({ event_name: "booking_completed", ...passoParaEvento(PASSO_AGENDAMENTO) })
              }
            />
          </div>
        ) : null}

        {fase.nome === "recusa" ? (
          <div className="funil-tela funil-tela--final">
            {/* TEXTO FORA DO DOCUMENTO — aprovado em 28/08/2026. O documento diz que o fluxo
                termina sem tela adicional, mas alguma coisa precisa aparecer
                na tela do lead depois do clique. */}
            <h2 className="funil-final-titulo">Tudo bem. Obrigado pelo seu tempo.</h2>
            <p className="funil-texto-final funil-texto-final--menor">
              Acompanhe a Almore e veja como trabalhamos.
            </p>
            {/* Botões, e não links no meio da frase: quem chegou aqui disse
                "não" e não vai caçar uma palavra sublinhada. No celular ainda
                viram dois alvos de toque de tamanho decente. */}
            <div className="funil-redes">
              <a
                className="funil-botao funil-botao--fantasma"
                href={LINKEDIN}
                target="_blank"
                rel="noopener noreferrer"
              >
                LinkedIn
              </a>
              <a
                className="funil-botao funil-botao--fantasma"
                href={INSTAGRAM}
                target="_blank"
                rel="noopener noreferrer"
              >
                Instagram
              </a>
            </div>
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
      {/*
        A hierarquia da tela, de cima para baixo: o que o lead quer (título),
        quanto custa (o número), o que vem junto, a ressalva e só então a
        chamada para o botão. Antes tudo isso era um parágrafo só, e o preço
        ficava do mesmo tamanho da conjunção ao lado dele.

        As palavras são as mesmas do documento de execução — quem for conferir
        compara com `texto`, que continua em valor.ts ao lado de cada regra.
      */}
      <h2 className="funil-valor-titulo">{tela.titulo(respostas)}</h2>

      <div className="funil-valor-cartao">
        <p className="funil-valor-preco">
          {tela.precoPrefixo ? (
            <span className="funil-valor-prefixo">{tela.precoPrefixo}</span>
          ) : null}
          <span className="funil-valor-numero">{tela.preco}</span>
          <span className="funil-valor-sufixo">{tela.precoSufixo}</span>
        </p>

        {tela.inclui.length > 0 ? (
          <>
            <p className="funil-valor-rotulo">Incluindo</p>
            <ul className="funil-valor-itens">
              {tela.inclui.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </>
        ) : null}

        {tela.naoInclui ? (
          <>
            <p className="funil-valor-rotulo">Esse valor não inclui</p>
            <ul className="funil-valor-itens funil-valor-itens--fora">
              {tela.naoInclui.itens.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="funil-valor-nota">{tela.naoInclui.nota}</p>
          </>
        ) : null}
      </div>

      <p className="funil-texto-valor">{tela.chamada}</p>

      <div className="funil-acoes">
        <button type="button" className="funil-botao" onClick={onAceitar}>
          {/* O documento (1.2.1) escreve "Está de acordo, quero agendar", em
              terceira pessoa. Quem clica é o lead falando, e a segunda metade
              já está em primeira — "Estou" alinha as duas. Mudança pedida pela
              Giovana; se a automação do CRM citar o rótulo antigo em alguma
              mensagem, é lá que precisa acompanhar. */}
          Estou de acordo, quero agendar
        </button>
        <button type="button" className="funil-botao funil-botao--fantasma" onClick={onRecusar}>
          Prefiro não seguir agora
        </button>
      </div>
    </div>
  )
}

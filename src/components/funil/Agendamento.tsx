/**
 * Widget de agendamento.
 *
 * A agenda é a da Devant, no domínio próprio — não é Cal.com nem Calendly
 * hospedado por terceiros. O brief exigia que fosse a MESMA agenda que a
 * automação consulta via API, senão os dois sistemas marcariam horários
 * conflitantes na mesma pessoa; sendo o sistema da casa, isso está resolvido.
 *
 * Entra por iframe. Conferido antes de escrever: a página não manda
 * `X-Frame-Options` nem `Content-Security-Policy`, então aceita ser embutida.
 * Se algum dia passar a mandar, o iframe vira um retângulo em branco — e é por
 * isso que existe o link abaixo dele, que continua funcionando de qualquer
 * jeito. Um lead que chegou até aqui não pode ficar sem conseguir marcar.
 */

import { useEffect } from "react"

const URL_AGENDA = "https://agendar.devantsolucoes.com.br/p/almore-inteligencia-contabil"
const ORIGEM_AGENDA = new URL(URL_AGENDA).origin

/**
 * O período que o lead pediu, do jeito que a agenda espera no `?periodo=`.
 *
 * A agenda usa isso para mostrar só alguns horários daquele período, mais um
 * de cada um dos outros dois — a tela precisa parecer um encaixe, e não uma
 * semana inteira vazia. Sem o parâmetro ela mostra o dia todo, como faz para
 * os outros clientes dela.
 *
 * A leitura é pela primeira palavra, sem acento: assim mudar o rótulo de
 * "Manhã (8h-12h)" para "De manhã" não quebra o encaixe em silêncio.
 */
function periodoDaAgenda(horario: string | null): string | null {
  if (!horario) return null
  const limpo = horario
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
  if (limpo.startsWith("manha")) return "manha"
  if (limpo.startsWith("tarde")) return "tarde"
  if (limpo.startsWith("noite")) return "noite"
  return null
}

type Props = {
  /** Quando há mais de um decisor, a nota do documento aparece acima da agenda. */
  // `| undefined` explícito porque o projeto usa exactOptionalPropertyTypes.
  nota?: string | undefined
  /** O `melhor_horario_contato` do lead, como ele foi respondido na tela. */
  horarioPreferido?: string | null | undefined
  /** A agenda cross-origin confirma por postMessage quando a reserva termina. */
  onConcluir?: (() => void) | undefined
}

export default function Agendamento({ nota, horarioPreferido, onConcluir }: Props) {
  const periodo = periodoDaAgenda(horarioPreferido ?? null)
  const src = periodo ? `${URL_AGENDA}?periodo=${periodo}` : URL_AGENDA

  useEffect(() => {
    if (!onConcluir) return
    const receberConclusao = (evento: MessageEvent<unknown>) => {
      if (evento.origin !== ORIGEM_AGENDA) return
      if (typeof evento.data !== "object" || evento.data === null) return
      if (!("type" in evento.data) || evento.data.type !== "almore_booking_completed") return
      onConcluir()
    }
    window.addEventListener("message", receberConclusao)
    return () => window.removeEventListener("message", receberConclusao)
  }, [onConcluir])

  return (
    <div className="agenda">
      {nota ? <p className="agenda-nota">{nota}</p> : null}

      <div className="agenda-quadro">
        <iframe
          src={src}
          title="Escolha um horário para a conversa com a especialista"
          // A agenda pede data, horário e dados de contato: o formulário
          // próprio dela precisa poder enviar, e a confirmação costuma
          // depender de um redirecionamento dentro do próprio quadro.
          allow="camera; microphone; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>

      {/* Rede de segurança: se o embed falhar, ainda dá para marcar. */}
      <p className="agenda-alternativa">
        {/* TEXTO FORA DO DOCUMENTO — aprovado em 28/08/2026. */}
        Não está carregando?{" "}
        <a href={src} target="_blank" rel="noopener noreferrer">
          Abrir a agenda numa nova aba
        </a>
      </p>
    </div>
  )
}

export { URL_AGENDA }

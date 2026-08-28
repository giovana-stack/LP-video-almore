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

const URL_AGENDA = "https://agendar.devantsolucoes.com.br/p/almore-inteligencia-contabil"

type Props = {
  /** Quando há mais de um decisor, a nota do documento aparece acima da agenda. */
  // `| undefined` explícito porque o projeto usa exactOptionalPropertyTypes.
  nota?: string | undefined
}

export default function Agendamento({ nota }: Props) {
  return (
    <div className="agenda">
      {nota ? <p className="agenda-nota">{nota}</p> : null}

      <div className="agenda-quadro">
        <iframe
          src={URL_AGENDA}
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
        <a href={URL_AGENDA} target="_blank" rel="noopener noreferrer">
          Abrir a agenda numa nova aba
        </a>
      </p>
    </div>
  )
}

export { URL_AGENDA }

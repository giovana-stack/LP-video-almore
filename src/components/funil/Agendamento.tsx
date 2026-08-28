/**
 * Widget de agendamento.
 *
 * PENDENTE: Cal.com ou Calendly — ainda não decidido. O brief é explícito
 * sobre o critério: a agenda tem que ser a MESMA que a automação do outro
 * desenvolvedor consulta via API, senão os dois sistemas marcam horários
 * conflitantes na mesma pessoa.
 *
 * Está isolado neste arquivo justamente para que a decisão custe um arquivo só.
 * Quando ela sair, é trocar o corpo de `Agendamento` por um dos dois blocos
 * comentados abaixo e apagar o placeholder.
 */

type Props = {
  /** Quando há mais de um decisor, a nota do brief aparece acima da agenda. */
  // `| undefined` explícito porque o projeto usa exactOptionalPropertyTypes.
  nota?: string | undefined
}

/** Troque quando a conta existir. */
const CAL_LINK = "" // ex.: "almore/diagnostico"
const CALENDLY_URL = "" // ex.: "https://calendly.com/almore/diagnostico"

export default function Agendamento({ nota }: Props) {
  return (
    <div className="agenda">
      {nota ? <p className="agenda-nota">{nota}</p> : null}

      {/*
        Cal.com — quando for esse, o embed entra assim:

          <Cal calLink={CAL_LINK} style={{ width: "100%", height: "100%" }} />

        e `@calcom/embed-react` vira dependência.

        Calendly — quando for esse, não precisa de dependência nenhuma:

          <div
            className="calendly-inline-widget"
            data-url={CALENDLY_URL}
            style={{ minWidth: 320, height: 700 }}
          />

        mais o script https://assets.calendly.com/assets/external/widget.js
        no head da rota.
      */}
      <div className="agenda-vazia" role="status">
        {/* TEXTO NOVO — PENDENTE DE APROVAÇÃO. Só aparece enquanto a conta de
            agendamento não estiver definida; some quando o embed entrar. */}
        <p>Agenda ainda não conectada.</p>
        <p className="agenda-vazia-sub">
          Escolhemos Cal.com ou Calendly e este espaço passa a mostrar os horários.
        </p>
      </div>
    </div>
  )
}

export { CAL_LINK, CALENDLY_URL }

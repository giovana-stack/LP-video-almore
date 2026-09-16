import { useEffect, useState } from "react"

/**
 * Mede quanto do vídeo do herói foi REALMENTE assistido.
 *
 * O botão de agendamento só destrava depois de 90% do vídeo. Esta é a peça que
 * decide isso, e ela existe separada do componente por dois motivos: fala com
 * uma API global de terceiro (o IFrame Player do YouTube), e a regra de o que
 * conta como "assistido" é a parte que importa aqui.
 *
 * ---------------------------------------------------------------------------
 * POR QUE UM CONJUNTO DE SEGUNDOS, E NÃO `currentTime / duration`
 *
 * A conta óbvia é ler o tempo atual e dividir pela duração. Ela é trivial de
 * furar: o visitante arrasta a bolinha para o fim do vídeo e o botão abre em
 * dois segundos, sem ele ter visto nada. Isso não é um caso de borda — é a
 * primeira coisa que alguém apressado faz.
 *
 * Então cada amostra guarda o SEGUNDO INTEIRO em que o vídeo está, num `Set`.
 * Arrastar para a frente não preenche os segundos pulados, e reassistir o
 * mesmo trecho não conta duas vezes. A fração assistida é quantos segundos
 * distintos foram vistos dividido pela duração — que é o que "assistiu 90% do
 * vídeo" quer dizer em português.
 *
 * ---------------------------------------------------------------------------
 * A TRAVA FALHA ABERTA, NUNCA FECHADA
 *
 * Se a API do YouTube não carregar — bloqueador de anúncio, rede corporativa,
 * script fora do ar —, não há como medir nada. O caminho seguro seria manter o
 * botão travado, e ele é o errado: a página é destino de anúncio pago, e um
 * botão morto por falha técnica queima a verba sem deixar rastro no banco.
 *
 * Então, sem medição, o botão abre. Perde-se a trava para uma minoria; a
 * alternativa é perder o lead inteiro.
 */

/** Quanto do vídeo precisa ser visto para o botão abrir. */
export const META = 0.9

/** Quanto se espera pelo player antes de desistir e abrir o botão. */
const ESPERA_MAXIMA_MS = 8000

/** De quanto em quanto tempo o tempo do vídeo é amostrado, enquanto toca. */
const INTERVALO_MS = 250

type Player = {
  getCurrentTime?: () => number
  getDuration?: () => number
  mute?: () => void
  playVideo?: () => void
  destroy?: () => void
}

declare global {
  interface Window {
    YT?: {
      Player: new (id: string, opcoes: unknown) => Player
      PlayerState: { PLAYING: number }
    }
    onYouTubeIframeAPIReady?: () => void
  }
}

/**
 * Carrega o script da API uma vez só, por mais que a página peça.
 *
 * `onYouTubeIframeAPIReady` é um nome global e único: quem chegar depois
 * sobrescreve quem chegou antes. Guardar a promessa evita a disputa, e a
 * chamada ao que já existia mantém o contrato caso outro trecho da página
 * passe a usar a mesma API um dia.
 */
let promessaDaApi: Promise<NonNullable<Window["YT"]>> | null = null

function carregarApi(): Promise<NonNullable<Window["YT"]>> {
  if (promessaDaApi) return promessaDaApi

  promessaDaApi = new Promise((resolver, rejeitar) => {
    if (window.YT?.Player) {
      resolver(window.YT)
      return
    }

    const anterior = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      anterior?.()
      if (window.YT) resolver(window.YT)
      else rejeitar(new Error("A API carregou sem window.YT"))
    }

    const script = document.createElement("script")
    // O iframe é servido pelo youtube-nocookie.com, mas o script da API só
    // existe no domínio normal. Ele não grava cookie por si — quem grava é o
    // player, e o player continua no domínio sem cookie.
    script.src = "https://www.youtube.com/iframe_api"
    script.async = true
    script.onerror = () => rejeitar(new Error("O script da API não carregou"))
    document.head.appendChild(script)
  })

  return promessaDaApi
}

export type ProgressoDoVideo = {
  /** Fração do vídeo efetivamente assistida, de 0 a 1. */
  assistido: number
  /** O quanto falta para destravar, de 0 a 1 — é o que o anel desenha. */
  progresso: number
  /** O botão pode ser clicado. */
  liberado: boolean
  /** Não deu para medir, e por isso está liberado. */
  semMedicao: boolean
}

/**
 * @param iniciarSozinho manda tocar assim que o player fica pronto.
 *
 * O `autoplay=1` na URL do embed NÃO basta quando o `enablejsapi=1` está
 * ligado: o player passa a esperar comando, e o parâmetro é ignorado. Medido
 * nesta página — com os dois parâmetros na URL o vídeo ficava parado, e um
 * `playVideo()` depois do `onReady` tocava na hora, sem gesto nenhum do
 * visitante. O parâmetro continua na URL como plano B, para o caso de a API
 * não carregar; quem realmente dá o play é esta chamada.
 *
 * O `mute()` antes do play não é preferência: navegador nenhum deixa um vídeo
 * começar sozinho com som. Pedir play sem tirar o som não resulta em som —
 * resulta em vídeo parado.
 */
export function useProgressoDoVideo(
  idDoIframe: string,
  { iniciarSozinho = false }: { iniciarSozinho?: boolean } = {},
): ProgressoDoVideo {
  const [assistido, setAssistido] = useState(0)
  const [semMedicao, setSemMedicao] = useState(false)

  useEffect(() => {
    let vivo = true
    let player: Player | null = null
    let relogio: number | undefined
    const segundosVistos = new Set<number>()

    const desistir = () => {
      if (vivo) setSemMedicao(true)
    }

    const prazo = window.setTimeout(desistir, ESPERA_MAXIMA_MS)

    const medir = () => {
      if (!player?.getDuration || !player.getCurrentTime) return
      const total = player.getDuration()
      // Antes de o vídeo carregar os metadados a duração é 0. Dividir por ela
      // daria Infinity, e o anel nasceria cheio.
      if (!total) return
      segundosVistos.add(Math.floor(player.getCurrentTime()))
      const fracao = Math.min(1, segundosVistos.size / total)
      if (vivo) setAssistido(fracao)
      // Chegou na meta: não há mais nada para medir, e o relógio para.
      if (fracao >= META) window.clearInterval(relogio)
    }

    carregarApi()
      .then((YT) => {
        if (!vivo) return
        player = new YT.Player(idDoIframe, {
          events: {
            onReady: (evento: { target: Player }) => {
              window.clearTimeout(prazo)
              // O player também vem por aqui, e não só pelo retorno do
              // construtor: `onReady` pode disparar antes de o `new` devolver,
              // e aí a variável ainda estaria vazia na primeira medição.
              player = evento.target

              if (iniciarSozinho) {
                player.mute?.()
                player.playVideo?.()
              }

              /*
               * O relógio roda solto daqui em diante, e não só entre o
               * "começou a tocar" e o "parou".
               *
               * O motivo é um caso real, que quebrou esta página: com autoplay
               * o vídeo JÁ ESTÁ tocando quando a página se liga ao player, então
               * o evento de "começou a tocar" nunca chega — ele aconteceu antes
               * de alguém estar ouvindo. Uma medição presa nesse evento nunca
               * começava: o vídeo rodava inteiro e o anel ficava em zero.
               *
               * Amostrar sempre custa um timer de 250ms e não depende de evento
               * nenhum. Com o vídeo parado, cada amostra repete o mesmo segundo,
               * e o `Set` descarta — parado não conta como assistido.
               */
              window.clearInterval(relogio)
              relogio = window.setInterval(medir, INTERVALO_MS)
            },
            onError: desistir,
            // Medir também na virada: sem isto, o último segundo antes de
            // pausar ou terminar podia ficar de fora, e um vídeo visto inteiro
            // parava em 89%.
            onStateChange: medir,
          },
        })
      })
      .catch(desistir)

    return () => {
      vivo = false
      window.clearTimeout(prazo)
      window.clearInterval(relogio)
      player?.destroy?.()
    }
  }, [idDoIframe, iniciarSozinho])

  return {
    assistido,
    progresso: semMedicao ? 1 : Math.min(1, assistido / META),
    liberado: semMedicao || assistido >= META,
    semMedicao,
  }
}

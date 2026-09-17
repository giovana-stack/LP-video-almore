import { useCallback, useEffect, useRef, useState } from "react"

/**
 * O controle do vídeo do herói: ele começa sozinho, e um clique liga o som.
 *
 * Isto vive fora do componente porque fala com uma API global de terceiro — o
 * IFrame Player do YouTube —, que tem regras próprias e um script único para a
 * página inteira.
 *
 * ---------------------------------------------------------------------------
 * ESTE ARQUIVO JÁ MEDIU QUANTO DO VÍDEO FOI ASSISTIDO
 *
 * Até 17/09/2026 ele também contava os segundos vistos e travava os quatro
 * botões de agendamento até 90% do vídeo, com uma faixa de progresso correndo
 * em volta do botão do herói. A Giovana pediu para tirar: o caminho para o
 * formulário está aberto de novo, sem passar pelo vídeo.
 *
 * O que sobrou é só a parte de tocar e de ligar o som. Se um dia a trava
 * voltar, ela está inteira no histórico do git, com os porquês nos comentários
 * — vale procurar antes de reescrever, porque duas armadilhas daquele código
 * não são óbvias: medir por `currentTime / duration` se fura arrastando a
 * bolinha, e a medição tem que começar sem depender do evento de "começou a
 * tocar", que com autoplay acontece antes de a página estar ouvindo.
 */

type Player = {
  mute?: () => void
  unMute?: () => void
  setVolume?: (v: number) => void
  playVideo?: () => void
  destroy?: () => void
}

declare global {
  interface Window {
    YT?: {
      Player: new (id: string, opcoes: unknown) => Player
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

export type VideoDoHeroi = {
  /** O vídeo está tocando sem som, esperando o visitante ligar. */
  mudo: boolean
  /** Liga o som. Precisa sair de um clique de verdade do visitante. */
  ativarSom: () => void
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
 * ---------------------------------------------------------------------------
 * O SOM NÃO PODE VIR LIGADO, E ISSO NÃO É ESCOLHA
 *
 * Chrome, Safari, Firefox e Edge bloqueiam autoplay com som desde 2018. Pedir
 * play sem tirar o som não resulta em som: resulta em vídeo PARADO. Não existe
 * parâmetro, domínio ou permissão que contorne isso — é política do navegador,
 * não do YouTube.
 *
 * O que existe é o caminho de volta: `mute()` antes do play, e `unMute()` no
 * primeiro clique de verdade do visitante. Um clique conta como permissão, e a
 * partir dele o som é liberado. É por isso que `ativarSom` existe e por isso
 * que ela SÓ funciona chamada de dentro de um evento de clique — chamá-la
 * sozinha, na carga da página, é o mesmo beco de antes.
 */
export function useVideoDoHeroi(
  idDoIframe: string,
  { iniciarSozinho = false }: { iniciarSozinho?: boolean } = {},
): VideoDoHeroi {
  const [mudo, setMudo] = useState(iniciarSozinho)
  const [temPlayer, setTemPlayer] = useState(false)
  const playerRef = useRef<Player | null>(null)

  useEffect(() => {
    let vivo = true
    let player: Player | null = null

    carregarApi()
      .then((YT) => {
        if (!vivo) return
        player = new YT.Player(idDoIframe, {
          events: {
            onReady: (evento: { target: Player }) => {
              if (!vivo) return
              playerRef.current = evento.target
              setTemPlayer(true)
              if (!iniciarSozinho) return
              evento.target.mute?.()
              evento.target.playVideo?.()
            },
          },
        })
      })
      .catch(() => {
        // Sem API não há como ligar o som pela página. O vídeo ainda toca mudo
        // pelo `autoplay=1&mute=1` da URL, e o visitante liga o som pelo
        // controle do próprio YouTube — a tarja é que some, para não virar um
        // botão que não faz nada.
        if (vivo) setTemPlayer(false)
      })

    return () => {
      vivo = false
      player?.destroy?.()
      playerRef.current = null
    }
  }, [idDoIframe, iniciarSozinho])

  const ativarSom = useCallback(() => {
    const player = playerRef.current
    if (!player) return
    player.unMute?.()
    // O volume vem junto porque um `unMute()` sozinho devolve o volume que
    // estava guardado na sessão do visitante — e se ele tinha deixado em zero
    // em algum outro vídeo do YouTube, o som "ligava" em silêncio.
    player.setVolume?.(100)
    // O play é para o caso de o autoplay ter sido barrado: aí a tarja não é só
    // o botão do som, é o botão que começa o vídeo. Um toque resolve os dois.
    player.playVideo?.()
    setMudo(false)
  }, [])

  return { mudo: mudo && temPlayer, ativarSom }
}

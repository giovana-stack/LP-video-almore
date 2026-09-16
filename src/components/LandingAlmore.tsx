import { useEffect, type CSSProperties } from 'react'

import { capturarOrigem } from '@/lib/funil/origem'
import { INSTAGRAM, LINKEDIN } from '@/lib/redes'
import { useProgressoDoVideo, type ProgressoDoVideo } from '@/lib/progresso-do-video'

/**
 * Landing page da Almore Inteligência Contábil — página de um fôlego só.
 *
 * A página inteira é o herói: título, vídeo e botão. A esteira de clientes
 * mora aqui também, mas está desligada — veja MOSTRAR_ESTEIRA abaixo.
 * As seções que vinham depois (método, problema, planos, para quem é,
 * fechamento e FAQ) foram removidas: quem chega aqui vem para assistir ao
 * vídeo e clicar, e cada seção a mais era um motivo a mais para rolar em vez
 * de decidir. O cabeçalho e o rodapé continuam, um pela marca e outro pelo
 * endereço e pelos dados obrigatórios.
 *
 * Tudo vive dentro de .lp-almore, então os estilos não vazam para o resto
 * do app e não brigam com o reset do Tailwind.
 *
 * O JavaScript da página é uma linha só: guardar a UTM da chegada, porque o
 * botão leva para /formulario e a query string não viaja no clique. Nada na
 * aparência depende disso — sem JS a página desenha inteira.
 *
 * FALTA PREENCHER: o vídeo. O quadro 16:9 no herói ainda é placeholder — veja
 * o comentário em cima dele. Nada é inventado no ar: enquanto o dado não
 * existe, o espaço fica marcado em vez de receber conteúdo de mentira.
 */

// O único lugar onde o destino dos botões é definido: a rota do formulário
// de captação, neste mesmo projeto. A query string NÃO viaja junto no clique,
// e é por isso que a página guarda a origem na chegada (veja o useEffect em
// LandingAlmore) — sem isso, todo lead vindo de anúncio chegaria ao banco sem
// UTM nenhuma, e nada quebraria para avisar.
const CTA = '/formulario'

// O rótulo dos quatro botões, num lugar só. Eram quatro cópias da mesma frase.
const ROTULO_CTA = 'Quero ter uma contabilidade estratégica'

// O id do iframe do vídeo. A API do YouTube se liga ao player por id, e a
// âncora do "role até o vídeo" usa o mesmo elemento.
const ID_DO_VIDEO = 'video-heroi'

// Os endereços das redes moram em src/lib/redes.ts. O LinkedIn era uma
// constante aqui e o Instagram estava escrito à mão no rodapé, com um handle
// que nem existia — três cópias do mesmo dado, cada uma envelhecendo sozinha.

/**
 * Duas peças de marca, cada uma no lugar onde funciona.
 *
 * ISOTIPO — só o símbolo, na versão metálica do Manual (bordô com o "A" em
 * prateado). Vai no cabeçalho fixo, onde o lockup completo obrigaria a
 * assinatura "INTELIGÊNCIA CONTÁBIL" a ficar com 5px de altura, ilegível.
 * Recortado do arquivo mais-claro.png achando o vão entre o símbolo e o
 * letreiro pelo perfil de colunas do canal alfa.
 *
 * LOCKUP — símbolo + nome + assinatura, versão branca. Vai no rodapé, que
 * tem espaço para a marca inteira e é onde ela funciona como assinatura.
 *
 * Os dois entram como imagem, não como máscara: o desenho tem gradiente e
 * precisa manter a cor. width e height vão na tag para o navegador reservar
 * o espaço antes de baixar — sem isso o cabeçalho pula quando o logo carrega.
 */
const ISOTIPO = { src: '/almore-isotipo.png', w: 307, h: 240 }
const LOCKUP = { src: '/almore-logo.png', w: 600, h: 148 }

/**
 * A CHAVE DA ESTEIRA DE CLIENTES.
 *
 * `false` esconde a faixa de logos que corre embaixo do vídeo; `true` traz
 * de volta. É a única coisa que precisa mudar: a marcação continua inteira
 * logo abaixo, o CSS dela também, e os PNGs seguem em public/logos/. Virar
 * esta linha e salvar já resolve.
 */
const MOSTRAR_ESTEIRA = false

/**
 * Clientes da faixa de prova.
 *
 * Os arquivos em public/logos/ foram recortados na caixa do conteúdo, então
 * `prop` é a proporção real de cada um (largura ÷ altura). Ela é usada para
 * igualar a ÁREA de todos os logos, não a altura: sem isso o Laba, que é uma
 * faixa 4:1, ficaria três vezes maior que o Eroika, que é quase quadrado.
 *
 * Para incluir cliente: recorte o PNG nas bordas do desenho, salve em
 * public/logos/ e acrescente aqui com a proporção. A faixa se reorganiza.
 */
const CLIENTES = [
  { marca: 'Mexicatti Sorvetes', logo: '/logos/mexicatti.png', prop: 1.74 },
  { marca: 'Laba Grill', logo: '/logos/laba.png', prop: 4.05 },
  { marca: 'GNP', logo: '/logos/gnp.png', prop: 1.02 },
  { marca: 'SuperVisão Vistorias Automotivas', logo: '/logos/supervisao.png', prop: 3.58 },
  { marca: 'Eroika Cosméticos', logo: '/logos/eroika.png', prop: 1.07 },
  { marca: 'InfoCliN', logo: '/logos/infoclin.png', prop: 2.44 },
  { marca: 'Mymion', logo: '/logos/mymion.png', prop: 1.23 },
  { marca: 'ViCor Seguros', logo: '/logos/vicor.png', prop: 3.05 },
  { marca: 'JF Celulares', logo: '/logos/jfcelulares.png', prop: 0.97 },
  { marca: 'Parabrisas Petrucci', logo: '/logos/petrucci.png', prop: 3.29 },
  { marca: 'Centauro Agropecuária e Petshop', logo: '/logos/centauro.png', prop: 1.0 },
  { marca: 'Sunfit', logo: '/logos/sunfit.png', prop: 2.95 },
]

/**
 * Duração de uma volta da esteira. Cresce com a quantidade de logos para a
 * velocidade aparente não mudar: dobrar a lista sem dobrar o tempo faria a
 * faixa passar duas vezes mais rápido.
 */
const DURACAO_DA_ESTEIRA = `${CLIENTES.length * 7}s`

/**
 * Área óptica que todo logo deve ocupar, em px². A altura sai de
 * sqrt(AREA / proporção) — logo largo fica mais baixo, logo quadrado fica
 * mais alto, e os seis terminam com o mesmo peso na faixa.
 */
const AREA_DO_LOGO = 5200
const alturaDoLogo = (prop: number) => Math.round(Math.sqrt(AREA_DO_LOGO / prop))

export default function LandingAlmore() {
  // A única coisa que esta página faz em JavaScript: guardar de onde o
  // visitante veio. O clique no botão troca de rota e deixa a query string
  // para trás, então a origem precisa ser guardada antes disso acontecer.
  useEffect(() => {
    capturarOrigem()
  }, [])

  // A trava do agendamento: o botão só abre depois de 90% do vídeo assistido.
  // A regra de o que conta como assistido está em progresso-do-video.ts.
  const video = useProgressoDoVideo(ID_DO_VIDEO, { iniciarSozinho: true })

  return (
    <div className="lp-almore">
      <a className="skip" href="#conteudo">Ir para o conteúdo</a>
      
      <header className="top">
        <a className="brand" href="#topo">
          <img
            src={ISOTIPO.src}
            alt="Almore Inteligência Contábil"
            width={ISOTIPO.w}
            height={ISOTIPO.h}
          />
        </a>
        <BotaoCta video={video} />
      </header>
      
      <main id="conteudo">
      
      {/* 1. HERO ============================================================== */}
      <section className="hero" id="topo">
        <div className="wrap">
          <span className="tag">Rápido · Consultivo · Sempre</span>
          {/*
            O título diz o que o serviço ENTREGA, e não o que ele é. "Contabilidade
            consultiva do MEI ao Lucro Real" descreve a categoria e o alcance —
            informação de catálogo, que agora mora na seção 01, onde cabe. Aqui em
            cima, no espaço mais visível da página, fica o motivo de assistir.
          */}
          <h1>Contabilidade consultiva é ter o número que te ajuda a decidir.</h1>
          {/*
            A quebra entre as duas frases é do original e está explícita: são
            dois movimentos distintos — o incômodo e a saída. Sem ela, viram um
            parágrafo corrido e a segunda frase perde o peso de resposta.
          */}
          <p className="lead">
            Chega de depender do contador que só te manda boleto no fim do mês.
            <br />
            A Almore traduz número em direcionamento claro, e está sempre disponível pra você.
          </p>

          {/*
            O vídeo — a peça principal do herói, em largura cheia. O CSS fixa a
            proporção em 16:9, então a página não salta enquanto ele carrega.

            O domínio é o `youtube-nocookie.com`: o YouTube comum grava cookie
            de rastreio assim que o quadro aparece, antes de a pessoa dar play.
            Nesta página isso importa mais do que o normal — ela é destino de
            anúncio e já carrega o pixel do Meta.

            `rel=0` tira os vídeos sugeridos de outros canais na tela final, e
            `modestbranding=1` some com a logo no canto. O ID sai do link:
            youtu.be/sYR4COvbSN0.

            SOBRE O `mute=1`: ele NÃO é opcional. Desde 2018 nenhum navegador
            deixa um vídeo começar sozinho com som — Chrome, Safari e Firefox
            simplesmente recusam o play, e o resultado de pedir `autoplay=1`
            sem `mute=1` não é um vídeo com som, é um vídeo parado. Mudo, ele
            toca; o visitante liga o som no próprio player.

            `playsinline=1` é para o iPhone: sem isso o Safari joga o vídeo em
            tela cheia sozinho, e a pessoa perde a página de vista.
          */}
          <div className="hero-video">
            <iframe
              id={ID_DO_VIDEO}
              // `enablejsapi=1` é o que deixa a página conversar com o player e
              // medir o quanto foi assistido. Sem isso a trava do botão não tem
              // como saber nada, e ela abre por segurança.
              src={`https://www.youtube-nocookie.com/embed/sYR4COvbSN0?rel=0&modestbranding=1&enablejsapi=1&autoplay=1&mute=1&playsinline=1`}
              title="Almore Inteligência Contábil"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />

            {/*
              A tarja do som.

              Ela é só a tarja, no canto de baixo à esquerda — não uma camada
              sobre o quadro. Cobrindo o vídeo inteiro, o visitante não via o
              vídeo normalmente nem alcançava os controles do player sem antes
              clicar em alguma coisa: parecia um véu esperando ser dispensado,
              e não um aviso.

              O clique aqui é o que autoriza o som — navegador não aceita menos
              que isso. Ele também dá play, para o caso de o autoplay ter sido
              barrado: aí a mesma tarja começa o vídeo e liga o som de uma vez.
            */}
            {video.mudo ? (
              <button type="button" className="hero-som" onClick={video.ativarSom}>
                <span className="hero-som-pilula">
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M4 9.5h3.2L12 5.4v13.2L7.2 14.5H4z" />
                    <path d="M15.6 9a4 4 0 0 1 0 6" />
                    <path d="M18.2 6.6a7.5 7.5 0 0 1 0 10.8" />
                  </svg>
                  Ativar o som
                </span>
                <span className="hero-som-nota">O vídeo começou sem som</span>
              </button>
            ) : null}
          </div>

          {/*
            Botao no tamanho natural, centralizado sob o video. É o único que
            leva o anel: ele fica logo abaixo do vídeo, onde o visitante está
            olhando, e é lá que a espera precisa ter uma forma visível. Repetir
            o anel nos outros três encheria a página de relógios.
          */}
          <p className="cta-row cta-row--centro">
            <BotaoCta video={video} comAnel />
          </p>
          <AvisoDaTrava video={video} />
        </div>

        {/*
          Esteira de clientes, em largura total — fora da .wrap de propósito,
          para não pegar o padding lateral e correr de borda a borda.

          A trilha carrega a lista duas vezes e desliza -50%: no fim do
          primeiro conjunto o segundo está exatamente na posição inicial,
          então o laço fecha sem salto.

          Os logos entram como máscara, não como imagem, porque os seis não
          são do mesmo tipo — três são brancos (Laba, Eroika, Sunfit) e três
          escuros (Mexicatti marrom, ViCor azul, Mymion prata). Como imagem
          colorida, metade desapareceria neste fundo escuro.
        */}
        {MOSTRAR_ESTEIRA && (
          <div
            className="logos-esteira"
            aria-label="Clientes da Almore"
            style={{ '--esteira-duracao': DURACAO_DA_ESTEIRA } as CSSProperties}
          >
            <div className="logos-trilha">
              {[0, 1].map((volta) =>
                CLIENTES.map((c) => {
                  const h = alturaDoLogo(c.prop)
                  return (
                    <div key={`${volta}-${c.marca}`} aria-hidden={volta === 1 || undefined}>
                      <span
                        className="logo-marca"
                        role="img"
                        aria-label={c.marca}
                        style={
                          {
                            '--logo': `url(${c.logo})`,
                            '--logo-h': `${h}px`,
                            '--logo-w': `${Math.round(h * c.prop)}px`,
                          } as CSSProperties
                        }
                      />
                    </div>
                  )
                }),
              )}
            </div>
          </div>
        )}
      </section>

      {/* 2. O MÉTODO ========================================================== */}
      <section className="band band--light">
        <div className="wrap">
          <p className="eyebrow"><span className="n">01</span> O método</p>
          {/*
            Este título veio do herói em 28/08/2026: lá em cima ele ocupava o
            espaço mais valioso da página descrevendo o serviço, que é
            justamente o que esta seção existe para fazer. A frase que era o
            título daqui não se perdeu — desceu para linha de apoio.
          */}
          <h2 className="rise h2-lead">Contabilidade consultiva do MEI ao Lucro Real</h2>
          <p className="narrow narrow--ink narrow--apoio">O método que tira a contabilidade do arquivo morto e coloca no centro da sua decisão.</p>

          <ul className="benefits rise">
            <li><span className="k">A</span> Pagando o imposto certo</li>
            <li><span className="k">B</span> Sem perder prazo</li>
            <li><span className="k">C</span> Sabendo quanto sobra</li>
          </ul>

          {/*
            ATENÇÃO: esta frase agora repete o título. Ele diz "do MEI ao
            Lucro Real" e ela lista "MEI, Simples Nacional, Lucro Presumido e
            Lucro Real" dois parágrafos abaixo. Não encurtei porque a copy não
            é minha para cortar — fica anotado para a Giovana decidir.
          */}
          <p className="narrow narrow--ink">O mesmo aplicado em empresas de todos os regimes — MEI, Simples Nacional, Lucro Presumido e Lucro Real —, do primeiro CNPJ à operação com folha e sócios.</p>
          <p className="cta-row"><BotaoCta video={video} /></p>
        </div>
      </section>

      </main>
      
      <footer>
        <div className="wrap foot-grid">
          <div>
            <a className="brand brand--foot" href="#topo">
              <img
                src={LOCKUP.src}
                alt="Almore Inteligência Contábil"
                width={LOCKUP.w}
                height={LOCKUP.h}
              />
            </a>
            <p className="foot-claim">Contabilidade 100% digital, consultiva e ágil. Rápido. Consultivo. Sempre.</p>
          </div>
          <address className="legal">
            <span>CNPJ 67.132.226/0001-17</span>
            <span>Rua Benedita Nogueira, 425 · Centro</span>
            <span>Araras · SP</span>
            <span><a href="https://almorecontabilidade.com.br">almorecontabilidade.com.br</a></span>
          </address>
          {/* Os dois endereços saem de src/lib/redes.ts. O Instagram estava
              escrito à mão aqui, com o handle `almorecontabilidade`, que não
              existe — o link do rodapé apontava para lugar nenhum. */}
          <nav aria-label="Redes sociais da Almore">
            <a href={INSTAGRAM} rel="me noopener">Instagram</a>
            <a href={LINKEDIN} rel="me noopener">LinkedIn</a>
          </nav>
        </div>
        <div className="wrap copy">
          <span>© 2026 Almore Inteligência Contábil · Todos os direitos reservados</span>
          {/* Link de texto, não botão — mas travado igual: senão o rodapé vira
              a porta dos fundos da trava do vídeo. */}
          <BotaoCta video={video} comoTexto />
        </div>
      </footer>
    </div>
  )
}

// ---------------------------------------------------------------------------
// A TRAVA DO AGENDAMENTO
//
// Os quatro botões que levam ao formulário só abrem depois de 90% do vídeo.
// Travar só o do herói não travaria nada: o do cabeçalho está visível desde o
// primeiro pixel da página, e bastaria clicar nele.
//
// Travado, o botão não vira um alvo morto — ele rola até o vídeo. Quem clicou
// ali quer agendar, e o vídeo é o caminho; um clique que não faz nada só
// ensina que o site está quebrado.
// ---------------------------------------------------------------------------

function rolarAteOVideo() {
  const quadro = document.getElementById(ID_DO_VIDEO)?.closest('.hero-video')
  if (!quadro) return

  const suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  quadro.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'center' })
  if (!suave) return

  // Há ambiente que engole o `smooth` e não rola nada — vi acontecer ao testar
  // esta página. Meio segundo depois, se o quadro ainda não estiver à vista,
  // vai de salto: chegar ao vídeo importa mais do que a animação. Quando o
  // `smooth` funciona, a checagem não encontra nada fora de vista e não faz
  // nada.
  window.setTimeout(() => {
    const r = quadro.getBoundingClientRect()
    const foraDaVista = r.bottom < 0 || r.top > window.innerHeight
    if (foraDaVista) quadro.scrollIntoView({ behavior: 'auto', block: 'center' })
  }, 500)
}

function BotaoCta({
  video,
  comAnel = false,
  comoTexto = false,
}: {
  video: ProgressoDoVideo
  /** Desenha a faixa de progresso em volta. Só o botão do herói usa. */
  comAnel?: boolean
  /** Link de texto em vez de botão. Só o rodapé usa. */
  comoTexto?: boolean
}) {
  const classe = comoTexto ? '' : 'btn'

  if (video.liberado) {
    return (
      <a className={classe || undefined} href={CTA}>
        {ROTULO_CTA}
      </a>
    )
  }

  return (
    <a
      className={[classe, 'cta-travado', comAnel ? 'cta-travado--anel' : '']
        .filter(Boolean)
        .join(' ')}
      href={CTA}
      // `aria-disabled`, e não o atributo `disabled`: <a> não tem `disabled`, e
      // tirar o href deixaria o link fora da navegação por teclado. Assim ele
      // continua alcançável e anunciado como indisponível.
      aria-disabled="true"
      aria-describedby="cta-aviso"
      onClick={(e) => {
        e.preventDefault()
        rolarAteOVideo()
      }}
    >
      {comAnel ? <AnelDeProgresso progresso={video.progresso} /> : null}
      <span className="cta-rotulo">{ROTULO_CTA}</span>
    </a>
  )
}

/**
 * O aviso embaixo do botão do herói.
 *
 * `role="status"` para o leitor de tela anunciar a virada sozinho: sem isso, o
 * botão destravaria em silêncio para quem não está olhando a tela.
 */
function AvisoDaTrava({ video }: { video: ProgressoDoVideo }) {
  // Sem medição não há trava, e um aviso sobre uma trava que não existe só
  // confunde.
  if (video.semMedicao) return null

  return (
    <p
      id="cta-aviso"
      className={`cta-aviso${video.liberado ? ' cta-aviso--liberado' : ''}`}
      role="status"
    >
      {video.liberado
        ? 'Pronto — o agendamento está liberado.'
        : 'Assista ao vídeo para liberar o agendamento.'}
    </p>
  )
}

/**
 * A faixa que corre em volta do botão conforme o vídeo avança.
 *
 * É um <rect> de SVG com o mesmo raio da borda do botão, desenhado por cima
 * dele. `pathLength={100}` normaliza o perímetro: não importa a largura real
 * do botão, o traço sempre vai de 0 a 100, então a fração vira o
 * `strokeDashoffset` direto, sem medir nada com JavaScript.
 *
 * O `vector-effect` mantém a espessura do traço constante mesmo com o viewBox
 * esticado — sem ele, a faixa engrossaria nos lados curtos.
 */
function AnelDeProgresso({ progresso }: { progresso: number }) {
  return (
    <svg
      className="cta-anel"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        className="cta-anel-trilho"
        x="0.5"
        y="0.5"
        width="99"
        height="99"
        pathLength={100}
        vectorEffect="non-scaling-stroke"
      />
      <rect
        className="cta-anel-corrida"
        x="0.5"
        y="0.5"
        width="99"
        height="99"
        pathLength={100}
        strokeDasharray={100}
        strokeDashoffset={100 - progresso * 100}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

import { useEffect, type CSSProperties } from 'react'

import { capturarOrigem } from '@/lib/funil/origem'

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
 * FALTA PREENCHER (marcado na tela com sublinhado tracejado):
 *   1. CTA      — a constante abaixo, num lugar só
 *   2. LinkedIn — a URL do perfil, na constante LINKEDIN
 *   3. O vídeo  — o quadro 16:9 no herói ainda é placeholder
 * Os campos sem dado ficam em branco de propósito: nada inventado no ar.
 */

// O único lugar onde o destino dos botões é definido: a rota do formulário
// de captação, neste mesmo projeto. A query string NÃO viaja junto no clique,
// e é por isso que a página guarda a origem na chegada (veja o useEffect em
// LandingAlmore) — sem isso, todo lead vindo de anúncio chegaria ao banco sem
// UTM nenhuma, e nada quebraria para avisar.
const CTA = '/formulario'

/** FALTA: a URL do perfil da Almore no LinkedIn. */
const LINKEDIN = 'LINKEDIN_URL'

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
        <a className="btn" href={CTA}>Quero ter uma contabilidade estratégica</a>
      </header>
      
      <main id="conteudo">
      
      {/* 1. HERO ============================================================== */}
      <section className="hero" id="topo">
        <div className="wrap">
          <span className="tag">Rápido · Consultivo · Sempre</span>
          <h1>Contabilidade consultiva do MEI ao Lucro Real</h1>
          <p className="lead">A contabilidade que traduz número em direção — e responde no dia em que você precisa decidir, não no mês seguinte.</p>

          {/*
            Espaço do vídeo — a peça principal do herói, em largura cheia.
            Para colocar o vídeo, troque os dois <span> por um <iframe>
            (YouTube/Vimeo) ou um <video>: o CSS já posiciona qualquer um dos
            dois preenchendo o quadro em 16:9.
          */}
          <div className="hero-video">
            <span className="play" aria-hidden="true"></span>
            <span className="rotulo">Espaço do vídeo · 16:9</span>
          </div>

          {/* Botao no tamanho natural, centralizado sob o video. */}
          <p className="cta-row cta-row--centro">
            <a className="btn" href={CTA}>Quero ter uma contabilidade estratégica</a>
          </p>
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
          <nav aria-label="Redes sociais da Almore">
            <a href="https://www.instagram.com/almorecontabilidade/" rel="me noopener">Instagram</a>
            {/* FALTA a URL do LinkedIn — não inventei, link morto no ar é pior. */}
            <a className="todo" href={LINKEDIN} rel="me noopener">LinkedIn</a>
          </nav>
        </div>
        <div className="wrap copy">
          <span>© 2026 Almore Inteligência Contábil · Todos os direitos reservados</span>
          <a href={CTA}>Quero ter uma contabilidade estratégica</a>
        </div>
      </footer>
    </div>
  )
}

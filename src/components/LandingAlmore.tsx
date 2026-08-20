import type { CSSProperties } from 'react'

/**
 * Landing page da Almore Inteligência Contábil.
 *
 * Tudo vive dentro de .lp-almore, então os estilos não vazam para o resto
 * do app e não brigam com o reset do Tailwind.
 *
 * A revelação no scroll é 100% CSS (animation-timeline: view()): o conteúdo
 * é visível por padrão e nenhuma seção depende de JavaScript para aparecer.
 * Não há JavaScript nenhum: é marcação pura.
 *
 * FALTA PREENCHER (marcado na tela com sublinhado tracejado):
 *   1. CTA      — a constante abaixo, num lugar só
 *   2. LinkedIn — a URL do perfil, na constante LINKEDIN
 * Os campos sem dado ficam em branco de propósito: nada inventado no ar.
 */

// O único lugar onde o destino dos botões é definido.
const CTA = 'CTA_LINK'

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
        <a className="btn" href={CTA}>Quero meu diagnóstico</a>
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

          {/* Botao na largura do video: no heroi tudo ocupa os 1140px. */}
          <p className="cta-row"><a className="btn btn--bloco" href={CTA}>Quero meu diagnóstico</a></p>
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
      </section>
      
      {/* 2. PROPOSTA DE VALOR ================================================= */}
      <section className="band band--light">
        <div className="wrap">
          <p className="eyebrow"><span className="n">01</span> O método</p>
          {/* Título em linha cheia; tabela abaixo, e o texto de apoio embaixo dela. */}
          <h2 className="rise h2-lead">O método que tira a contabilidade do arquivo morto e coloca no centro da sua decisão.</h2>

          <ul className="benefits rise">
            <li><span className="k">A</span> Pagando o imposto certo</li>
            <li><span className="k">B</span> Sem perder prazo</li>
            <li><span className="k">C</span> Sabendo quanto sobra</li>
          </ul>

          <p className="narrow narrow--ink">O mesmo aplicado em empresas de todos os regimes — MEI, Simples Nacional, Lucro Presumido e Lucro Real —, do primeiro CNPJ à operação com folha e sócios.</p>
          <p className="cta-row"><a className="btn" href={CTA}>Quero meu diagnóstico</a></p>
        </div>
      </section>
      
      {/* 3. RUPTURA / PROBLEMA ================================================ */}
      <section className="band band--dark">
        <div className="wrap">
          <p className="eyebrow"><span className="n">02</span> O problema</p>
          <h2 className="rise h2-lead h2-lead--w30">As empresas que crescem sem susto são as que tratam contabilidade como gestão, não como obrigação.</h2>
      
          <div className="stat rise">
            <div className="num">95%</div>
            <div>
              <p>das empresas brasileiras pagam mais imposto do que deveriam. Não é sonegação nem sorte: é classificação fiscal errada, regime mal escolhido e ninguém revisando.</p>
              <p className="src">Fonte: Instituto Brasileiro de Planejamento e Tributação (IBPT)</p>
            </div>
          </div>
      
          <p className="narrow narrow--dim">A maior parte do dinheiro que escapa de uma empresa pequena e média não sai numa decisão grande. Sai em silêncio, todo mês, na rotina que ninguém confere: um CNAE herdado da abertura, uma alíquota que nunca foi recalculada, um prazo descoberto só quando chega a multa.</p>
      
          <div className="ledger rise">
            <div className="col col--bad">
              <h3><span>Como a maioria contrata</span>Contabilidade como despesa obrigatória</h3>
              <ul>
                <li>Resposta que demora dias</li>
                <li>Guia de imposto sem explicação</li>
                <li>Prazo descoberto depois da multa</li>
                <li>Balanço que ninguém lê</li>
                <li>Zero orientação antes de decidir</li>
              </ul>
              <p className="total"><b>Resultado</b>Imposto a mais, multa evitável e decisão tomada no escuro.</p>
            </div>
            <div className="col col--good">
              <h3><span>Como funciona na Almore</span>Contabilidade como área de gestão</h3>
              <ul>
                <li>Resposta de quem conhece a sua empresa</li>
                <li>Auditoria da classificação fiscal</li>
                <li>Calendário de obrigações acompanhado</li>
                <li>Relatório consultivo todo mês</li>
                <li>Consultoria antes da decisão, não depois</li>
              </ul>
              <p className="total"><b>Resultado</b>Imposto no valor certo, prazo em dia e número na mão para decidir.</p>
            </div>
          </div>
      
          <p className="cta-row"><a className="btn" href={CTA}>Quero meu diagnóstico</a></p>
        </div>
      </section>
      
      {/* 4. PLANOS ============================================================ */}
      <section className="band band--light" id="planos">
        <div className="wrap">
          <p className="eyebrow"><span className="n">03</span> Os planos</p>
          <h2 className="rise h2-lead">Três planos, e cada um carrega o anterior inteiro.</h2>
          <p className="narrow narrow--ink">Todo plano começa pelo Onboarding Premium 360º e roda no mesmo ciclo mensal. O que muda de um para o outro é a camada que se soma em cima: primeiro a tributária, depois a estratégica.</p>
      
          {/* O ciclo que todos os planos seguem */}
          <ol className="flow rise" aria-label="O ciclo mensal de todos os planos">
            <li><span className="k">01</span> Diagnóstico e reunião de alinhamento</li>
            <li><span className="k">02</span> Onboarding Premium 360º</li>
            <li><span className="k">03</span> Rotina do mês: imposto, folha e conciliação</li>
            <li><span className="k">04</span> Relatório consultivo do mês</li>
          </ol>
      
          <div className="plans">
            <article className="plan plan--bronze rise">
              <div className="tier"><h3>Bronze</h3></div>
              <p className="claim">Atendimento essencial e completo</p>
              <p className="herda"><b>Ponto de partida</b><span>A rotina contábil inteira em ordem</span></p>
              <ul className="items">
                <li>Onboarding Premium 360º</li>
                <li>Apuração de impostos e obrigações acessórias</li>
                <li>Auditoria mensal de classificação fiscal</li>
                <li>Folha, pró-labore, admissão e rescisão</li>
                <li>Controle de férias e prazos de contratos</li>
                <li>Acompanhamento de faturamento e alíquota efetiva</li>
                <li>Demonstração do Resultado gerencial</li>
                <li>Relatório consultivo mensal</li>
                <li>Atendimento consultivo</li>
              </ul>
            </article>
      
            <article className="plan plan--prata rise">
              <div className="tier"><h3>Prata</h3></div>
              <p className="claim">Tudo do Bronze + camada tributária</p>
              <p className="herda"><b>Traz junto</b><span>Todo o plano Bronze</span></p>
              <ul className="items">
                <li>Planejamento tributário inicial</li>
                <li>Conciliação de extrato bancário</li>
                <li>Imposto de Renda de Pessoa Física (1 pessoa)</li>
                <li>Gestão de benefícios <small>vale-refeição, vale-alimentação e vale-transporte</small></li>
                <li>Controle de negativas federais e trabalhistas</li>
              </ul>
            </article>
      
            <article className="plan plan--ouro rise">
              <div className="tier"><h3>Ouro</h3></div>
              <p className="claim">Tudo do Prata + camada estratégica + I.A.</p>
              <p className="herda"><b>Traz junto</b><span>Todo o plano Prata</span></p>
              <ul className="items">
                <li>Planejamento tributário estratégico anual</li>
                <li>Consultoria revisional semestral</li>
                <li>Consultoria em precificação anual</li>
                <li>Imposto de Renda de Pessoa Física (2 pessoas)</li>
                <li>1 alteração de contrato social ao ano</li>
                <li>Demonstração do Resultado do Exercício</li>
                <li>Gestão de indicadores do Departamento Pessoal</li>
                <li>Fechamento do ponto</li>
                <li>Assistente de inteligência artificial personalizado</li>
              </ul>
            </article>
          </div>
      
          <p className="cta-row"><a className="btn" href={CTA}>Quero meu diagnóstico</a></p>
        </div>
      </section>
      
      {/* 5. PARA QUEM É ======================================================= */}
      <section className="band band--bordo">
        <div className="wrap">
          <p className="eyebrow eyebrow--bordo-band"><span className="n">04</span> Para quem é</p>
          <h2 className="rise h2-lead h2-lead--w22 h2-lead--paper">Para quem é a Almore?</h2>
      
          <div className="audience rise">
            <div>
              <h3>Empresários, fundadores e sócios</h3>
              <p>Que querem parar de descobrir problema por multa e passar a decidir com o número atualizado na mão — preço, pró-labore, contratação, investimento.</p>
            </div>
            <div>
              <h3>Gestores financeiros e administrativos</h3>
              <p>Que precisam de um contador que responde no mesmo dia e entrega relatório que dá para levar direto para a reunião de diretoria.</p>
            </div>
          </div>
        </div>
      </section>
      
      {/* 6. FECHAMENTO ======================================================== */}
      <section className="band band--dark closing">
        <div className="wrap">
          <h2 className="rise">Almore, a contabilidade <em className="em-sand">para quem decide</em></h2>
          <p className="rise">É a contabilidade criada para empresas que não querem depender de achismo, prazo perdido ou balanço que ninguém lê para crescer. Se você quer uma rotina fiscal em ordem e um número em que dá para confiar na hora de decidir, comece pelo diagnóstico.</p>
          <a className="btn rise" href={CTA}>Quero meu diagnóstico</a>
        </div>
      </section>
      
      {/* 7. FAQ =============================================================== */}
      <section className="band band--light">
        <div className="wrap">
          <p className="eyebrow"><span className="n">05</span> Dúvidas</p>
          <h2 className="rise h2-lead h2-lead--full">Tire suas dúvidas</h2>
      
          <div className="faq">
            <details>
              <summary>O que é contabilidade consultiva?</summary>
              <div className="answer">
                <p>Contabilidade tradicional apura, entrega e arquiva. Contabilidade consultiva faz isso e mais uma coisa: olha o número antes de você decidir e diz o que ele está mostrando.</p>
                <p>Na prática, é a diferença entre receber uma guia de imposto para pagar e receber um relatório que explica por que o imposto subiu, o que dá para fazer a respeito e qual o prazo para agir.</p>
              </div>
            </details>
            <details>
              <summary>Para quem é a Almore?</summary>
              <div className="answer">
                <p>Para empresários, fundadores, sócios e gestores de empresas de qualquer porte e setor — de MEI a Lucro Real. Serve tanto para quem está abrindo o primeiro CNPJ quanto para quem já tem operação com folha, sócios e mais de um regime na mesa.</p>
              </div>
            </details>
            <details>
              <summary>Como sei qual plano é o meu?</summary>
              <div className="answer">
                <p>Pelo diagnóstico. O <strong>Bronze</strong> cobre a rotina contábil inteira e resolve para quem precisa da casa em ordem: imposto, folha, relatório e alguém que responde.</p>
                <p>O <strong>Prata</strong> entra quando há imposto para revisar e movimentação bancária para conciliar. O <strong>Ouro</strong> é para quem usa o número para decidir preço, estrutura e crescimento — é onde ficam a precificação anual, a revisão semestral e o assistente de inteligência artificial.</p>
                <p>Os planos são cumulativos: o Prata inclui todo o Bronze e o Ouro inclui todo o Prata. Na reunião de alinhamento indicamos qual faz sentido para o seu momento.</p>
              </div>
            </details>
            <details>
              <summary>Como funciona o atendimento?</summary>
              <div className="answer">
                <p>Tudo começa com o diagnóstico e uma reunião de alinhamento. Em seguida vem o Onboarding Premium 360º, onde a sua casa é organizada: documentos, pendências, classificação fiscal e calendário de obrigações.</p>
                <p>A partir daí a rotina roda em ciclo mensal — apuração, folha, conciliação e o relatório consultivo do mês. O atendimento é digital e direto com quem conhece a sua empresa: você manda a dúvida e recebe resposta, sem fila e sem protocolo.</p>
              </div>
            </details>
            <details>
              <summary>Trocar de contador dá trabalho ou para a minha operação?</summary>
              <div className="answer">
                <p>Não para. A transição é conduzida por nós: solicitamos a documentação do contador anterior, levantamos pendências e negativas e assumimos a rotina sem interromper emissão de nota, folha ou pagamento de imposto. A sua parte é assinar a procuração e responder ao diagnóstico.</p>
              </div>
            </details>
            <details>
              <summary>Como faço para começar?</summary>
              <div className="answer">
                <p>Clique em qualquer botão desta página e preencha o formulário com o nome, a empresa, o regime tributário e a melhor forma de contato. Nossa equipe retorna por WhatsApp, e-mail ou telefone para agendar o diagnóstico.</p>
              </div>
            </details>
          </div>
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
          <nav aria-label="Redes sociais da Almore">
            <a href="https://www.instagram.com/almorecontabilidade/" rel="me noopener">Instagram</a>
            {/* FALTA a URL do LinkedIn — não inventei, link morto no ar é pior. */}
            <a className="todo" href={LINKEDIN} rel="me noopener">LinkedIn</a>
          </nav>
        </div>
        <div className="wrap copy">
          <span>© 2026 Almore Inteligência Contábil · Todos os direitos reservados</span>
          <a href={CTA}>Quero meu diagnóstico</a>
        </div>
      </footer>
    </div>
  )
}

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

/**
 * Identidade do site num só lugar.
 *
 * TROQUE `url` quando o domínio definitivo estiver de pé — ele alimenta o
 * canonical, o og:url e os dois blocos de dados estruturados abaixo.
 * A barra final importa: as imagens são montadas como `${url}og-almore.jpg`.
 * Falta também subir a `public/og-almore.jpg` (1200x630), que é a prévia
 * que aparece quando alguém manda o link no WhatsApp.
 */
const SITE = {
  nome: "Almore Inteligência Contábil",
  titulo: "Contabilidade Consultiva do MEI ao Lucro Real | Almore",
  descricao:
    "Contabilidade 100% digital, consultiva e ágil: apuração de impostos, folha, DRE e planejamento tributário com resposta no mesmo dia. Do MEI ao Lucro Real.",
  descricaoSocial:
    "Resposta no mesmo dia, relatório consultivo todo mês e planejamento tributário. A contabilidade que traduz número em direção.",
  url: "https://almorecontabilidade.com.br/",
} as const;

/** Quem a Almore é, para o Google entender sem depender do texto da página. */
const LD_ORGANIZACAO = {
  "@context": "https://schema.org",
  "@type": "AccountingService",
  "@id": `${SITE.url}#organizacao`,
  name: SITE.nome,
  alternateName: "Almore Contabilidade",
  url: SITE.url,
  description:
    "Contabilidade 100% digital, consultiva e ágil. Apuração de impostos, folha de pagamento, DRE, conciliação bancária e planejamento tributário para empresas do MEI ao Lucro Real.",
  slogan: "Rápido. Consultivo. Sempre.",
  taxID: "67.132.226/0001-17",
  vatID: "67.132.226/0001-17",
  areaServed: { "@type": "Country", name: "Brasil" },
  availableLanguage: "pt-BR",
  sameAs: [
    "https://www.instagram.com/almorecontabilidade/",
    "https://linktr.ee/almorecontabilidade",
  ],
  knowsAbout: [
    "MEI",
    "Simples Nacional",
    "Lucro Presumido",
    "Lucro Real",
    "Planejamento tributário",
    "Folha de pagamento",
    "DRE gerencial",
    "Abertura de empresa",
    "Troca de contabilidade",
  ],
  hasOfferCatalog: {
    "@type": "OfferCatalog",
    name: "Planos da Almore",
    itemListElement: [
      {
        "@type": "Offer",
        position: 1,
        itemOffered: {
          "@type": "Service",
          name: "Plano Bronze",
          description:
            "Atendimento essencial e completo: Onboarding Premium 360º, apuração de impostos e obrigações acessórias, auditoria mensal de classificação fiscal, folha, pró-labore, admissão e rescisão, controle de férias e prazos de contratos, acompanhamento de faturamento e alíquota efetiva, Demonstração do Resultado gerencial, relatório consultivo mensal e atendimento consultivo.",
        },
      },
      {
        "@type": "Offer",
        position: 2,
        itemOffered: {
          "@type": "Service",
          name: "Plano Prata",
          description:
            "Tudo do plano Bronze mais a camada tributária: planejamento tributário inicial, conciliação de extrato bancário, Imposto de Renda de Pessoa Física para 1 pessoa, gestão de benefícios (vale-refeição, vale-alimentação e vale-transporte) e controle de negativas federais e trabalhistas.",
        },
      },
      {
        "@type": "Offer",
        position: 3,
        itemOffered: {
          "@type": "Service",
          name: "Plano Ouro",
          description:
            "Tudo do plano Prata mais a camada estratégica e inteligência artificial: planejamento tributário estratégico anual, consultoria revisional semestral, consultoria em precificação anual, Imposto de Renda de Pessoa Física para 2 pessoas, uma alteração de contrato social ao ano, Demonstração do Resultado do Exercício, gestão de indicadores do Departamento Pessoal, fechamento do ponto e assistente de inteligência artificial personalizado.",
        },
      },
    ],
  },
};

/** O FAQ da página, no formato que o Google lê. Espelha o que está na tela. */
const LD_FAQ = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "O que é contabilidade consultiva?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Contabilidade tradicional apura, entrega e arquiva. Contabilidade consultiva faz isso e mais uma coisa: olha o número antes de você decidir e diz o que ele está mostrando. Na prática, é a diferença entre receber uma guia de imposto para pagar e receber um relatório que explica por que o imposto subiu, o que dá para fazer a respeito e qual o prazo para agir.",
      },
    },
    {
      "@type": "Question",
      name: "Para quem é a Almore?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Para empresários, fundadores, sócios e gestores de empresas de qualquer porte e setor — de MEI a Lucro Real. Serve tanto para quem está abrindo o primeiro CNPJ quanto para quem já tem operação com folha, sócios e mais de um regime na mesa.",
      },
    },
    {
      "@type": "Question",
      name: "Como sei qual plano da Almore é o meu?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Pelo diagnóstico. O Bronze cobre a rotina contábil inteira e resolve para quem precisa da casa em ordem: imposto, folha, relatório e alguém que responde. O Prata entra quando há imposto para revisar e movimentação bancária para conciliar. O Ouro é para quem usa o número para decidir preço, estrutura e crescimento — é onde ficam a precificação anual, a revisão semestral e o assistente de inteligência artificial. Os planos são cumulativos: o Prata inclui todo o Bronze e o Ouro inclui todo o Prata.",
      },
    },
    {
      "@type": "Question",
      name: "Como funciona o atendimento da Almore?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Tudo começa com o diagnóstico e uma reunião de alinhamento. Em seguida vem o Onboarding Premium 360º, onde a sua casa é organizada: documentos, pendências, classificação fiscal e calendário de obrigações. A partir daí a rotina roda em ciclo mensal — apuração, folha, conciliação e o relatório consultivo do mês. O atendimento é digital e direto com quem conhece a sua empresa.",
      },
    },
    {
      "@type": "Question",
      name: "Trocar de contador dá trabalho ou para a minha operação?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Não para. A transição é conduzida por nós: solicitamos a documentação do contador anterior, levantamos pendências e negativas e assumimos a rotina sem interromper emissão de nota, folha ou pagamento de imposto. A sua parte é assinar a procuração e responder ao diagnóstico.",
      },
    },
    {
      "@type": "Question",
      name: "Como faço para começar na Almore?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Preencha o formulário com o nome, a empresa, o regime tributário e a melhor forma de contato. Nossa equipe retorna por WhatsApp, e-mail ou telefone para agendar o diagnóstico.",
      },
    },
  ],
};

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: SITE.titulo },
      { name: "description", content: SITE.descricao },
      { name: "author", content: SITE.nome },
      { name: "robots", content: "index, follow, max-image-preview:large" },
      { name: "theme-color", content: "#68112F" },

      { property: "og:type", content: "website" },
      { property: "og:locale", content: "pt_BR" },
      { property: "og:site_name", content: SITE.nome },
      { property: "og:title", content: SITE.titulo },
      { property: "og:description", content: SITE.descricaoSocial },
      { property: "og:url", content: SITE.url },
      { property: "og:image", content: `${SITE.url}og-almore.jpg` },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      {
        property: "og:image:alt",
        content: "Almore Inteligência Contábil — rápido, consultivo, sempre.",
      },

      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: SITE.titulo },
      { name: "twitter:description", content: SITE.descricaoSocial },
      { name: "twitter:image", content: `${SITE.url}og-almore.jpg` },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "canonical", href: SITE.url },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Figtree:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
        {/*
          Dados estruturados. Ficam direto no shell, e não em head(), para
          garantir que saem no HTML servido — é ali que o Google os lê.
        */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(LD_ORGANIZACAO) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(LD_FAQ) }}
        />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
    </QueryClientProvider>
  );
}

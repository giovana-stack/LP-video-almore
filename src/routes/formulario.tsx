import { createFileRoute } from "@tanstack/react-router"

import FormularioAlmore from "@/components/funil/FormularioAlmore"

/**
 * A rota do formulário de captação.
 *
 * As fontes entram aqui e não em __root.tsx de propósito: a landing usa
 * Instrument Serif e Figtree, o formulário usa Montserrat e Inter (os
 * substitutos obrigatórios de MANUAL e VOLTE, que não existem em CDN). Carregar
 * as quatro em toda página faria a landing baixar duas famílias que ela não
 * desenha.
 *
 * `noindex` porque isto é destino de campanha, não página de busca: o Google
 * indexando o formulário só geraria lead sem UTM e canibalizaria a landing.
 */
export const Route = createFileRoute("/formulario")({
  head: () => ({
    meta: [
      { title: "Diagnóstico | Almore Inteligência Contábil" },
      { name: "robots", content: "noindex, nofollow" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800&family=Inter:wght@400;500&display=swap",
      },
    ],
  }),
  component: Formulario,
})

function Formulario() {
  return <FormularioAlmore />
}

/**
 * As redes da Almore, num lugar só.
 *
 * Estavam espalhadas: a landing tinha a constante do LinkedIn no próprio
 * componente e o Instagram aparecia só nos dados estruturados do __root.tsx.
 * Com a tela de recusa do formulário apontando para as duas, seriam três
 * cópias do mesmo endereço — uma para envelhecer sozinha. Quem precisar de uma
 * rede importa daqui; quem for atualizar, mexe só neste arquivo.
 */

/**
 * O perfil é `almorecontabil`, e não `almorecontabilidade`.
 *
 * O handle errado esteve no `sameAs` do __root.tsx desde que a landing nasceu,
 * apontando o Google para um perfil que não existe. Conferido em 28/08/2026:
 * `@almorecontabil` responde como "Almore Inteligência Contábil", com 15
 * posts; o outro não devolve metadado nenhum.
 */
export const INSTAGRAM = "https://www.instagram.com/almorecontabil/"

/**
 * Perfil da empresa pelo id numérico. O LinkedIn aceita as duas formas, e a
 * numérica é a que não quebra se a empresa mudar o nome da página.
 */
export const LINKEDIN = "https://www.linkedin.com/company/134184045/"

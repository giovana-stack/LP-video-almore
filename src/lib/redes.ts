/**
 * As redes da Almore, num lugar só.
 *
 * Estavam duplicadas: a landing tinha a constante do LinkedIn no próprio
 * componente e o Instagram aparecia só nos dados estruturados do __root.tsx.
 * Agora que a tela de recusa do formulário também aponta para as duas, ter
 * três cópias do mesmo endereço seria pedir para uma delas envelhecer sozinha.
 */

export const INSTAGRAM = "https://www.instagram.com/almorecontabilidade/"

/**
 * FALTA: a URL do perfil da Almore no LinkedIn.
 *
 * Enquanto for este texto, quem consome trata como ausente e não desenha o
 * link — um lead não pode receber um endereço quebrado. Preencher aqui liga
 * o link na landing e na tela de recusa de uma vez.
 */
export const LINKEDIN = "LINKEDIN_URL"

/** O LinkedIn já tem endereço de verdade? */
export const temLinkedin = LINKEDIN !== "LINKEDIN_URL"

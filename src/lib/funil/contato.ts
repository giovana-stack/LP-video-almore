/**
 * Máscara de telefone e validação do bloco de contato.
 *
 * Duas representações convivem aqui de propósito: a que o lead vê enquanto
 * digita, `(19) 99999-9999`, e a que vai para o banco, `+5519999999999`. A
 * automação do CRM manda mensagem por WhatsApp, e a API quer E.164 — se o
 * parêntese chegasse lá, a mensagem simplesmente não sairia.
 */

/** Só os dígitos, no máximo 11 (DDD + celular). */
function digitos(valor: string): string {
  return valor.replace(/\D/g, "").slice(0, 11)
}

/**
 * Formata enquanto digita. Vai revelando os separadores conforme os dígitos
 * chegam, em vez de mostrar `(  )     -` vazio desde o começo: máscara que
 * aparece antes do conteúdo dá a impressão de que o campo já falhou.
 */
export function mascararTelefone(valor: string): string {
  const d = digitos(valor)
  if (d.length === 0) return ""
  if (d.length <= 2) return `(${d}`
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

/**
 * Aceita fixo (10 dígitos) e celular (11). O DDD válido no Brasil vai de 11 a
 * 99, então um número que comece com 0 é erro de digitação, não um DDD.
 */
export function telefoneValido(valor: string): boolean {
  const d = digitos(valor)
  if (d.length !== 10 && d.length !== 11) return false
  const ddd = Number(d.slice(0, 2))
  if (ddd < 11 || ddd > 99) return false
  // Celular no Brasil sempre começa com 9 depois do DDD.
  if (d.length === 11 && d[2] !== "9") return false
  return true
}

/** `(19) 99999-9999` vira `+5519999999999`. */
export function paraE164(valor: string): string {
  const d = digitos(valor)
  return `+55${d}`
}

/**
 * Validação de e-mail por formato, como o brief pede — nada de verificar se a
 * caixa existe. O que se quer barrar aqui é o dedo escorregando, não fraude:
 * um `@` no meio, um ponto no domínio e nenhum espaço.
 */
export function emailValido(valor: string): boolean {
  const limpo = valor.trim()
  if (limpo.length < 6 || limpo.length > 254) return false
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(limpo)
}

/** Nome serve se tem alguma coisa escrita. Não exigimos sobrenome. */
export function nomeValido(valor: string): boolean {
  return valor.trim().length >= 2
}

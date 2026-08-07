/**
 * NCF en el cliente — espejo exacto de `backend/app/services/ncf.py`.
 *
 * Está duplicado a propósito: el técnico en campo teclea un NCF sin señal y la
 * app tiene que decirle "te falta un dígito" en el acto, sin ida y vuelta al
 * servidor. El backend vuelve a validar de todos modos: esta copia es
 * conveniencia de UX, nunca la autoridad.
 *
 * Formato: NCF-AAAAMM-CAT-NNNNV   (ej. NCF-202608-MOB-0042K)
 */

import { CODIGO_CATEGORIA, type CategoriaBien } from '../types'

const ALFABETO = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
export const NCF_REGEX = /^NCF-(\d{4})(\d{2})-([A-Z]{3})-(\d{4})([0-9A-Z])$/
const CUERPO_LEN = 'NCF-202608-MOB-0042'.length

/** Verificador base36 ponderado por posición (detecta también transposiciones). */
function checksum(cuerpo: string): string {
  let total = 0
  for (let i = 0; i < cuerpo.length; i++) {
    total += (i + 1) * cuerpo.charCodeAt(i)
  }
  return ALFABETO[total % ALFABETO.length]
}

export class NCFInvalidoError extends Error {}

/** Limpia lo que venga del teclado del iPhone antes de validar. */
export function normalizarNCF(entrada: string): string {
  return (entrada ?? '').trim().toUpperCase().replace(/\s+/g, '')
}

/**
 * Valida y devuelve la forma canónica.
 * @throws {NCFInvalidoError} si el formato o el verificador no cuadran.
 */
export function validarNCF(entrada: string): string {
  const candidato = normalizarNCF(entrada)
  if (!NCF_REGEX.test(candidato)) {
    throw new NCFInvalidoError(
      `Formato inválido. Se espera NCF-AAAAMM-CAT-NNNNV, por ejemplo NCF-202608-MOB-0042K.`,
    )
  }
  const cuerpo = candidato.slice(0, CUERPO_LEN)
  if (checksum(cuerpo) !== candidato[CUERPO_LEN]) {
    throw new NCFInvalidoError(
      `El carácter verificador no corresponde (debería ser "${checksum(cuerpo)}"). ` +
        `Revise el código: es muy probable que haya un dígito mal tecleado.`,
    )
  }
  return candidato
}

/** Variante que no lanza; útil para validar mientras el usuario escribe. */
export function esNCFValido(entrada: string): boolean {
  try {
    validarNCF(entrada)
    return true
  } catch {
    return false
  }
}

/** Arma un NCF nuevo. Solo lo usa el modo local; con backend lo genera el servidor. */
export function generarNCF(categoria: CategoriaBien, secuencia: number, fecha = new Date()): string {
  const anio = fecha.getUTCFullYear()
  const mes = String(fecha.getUTCMonth() + 1).padStart(2, '0')
  const cuerpo = `NCF-${anio}${mes}-${CODIGO_CATEGORIA[categoria]}-${String(secuencia).padStart(4, '0')}`
  return cuerpo + checksum(cuerpo)
}

/** Descompone un NCF válido. */
export function parsearNCF(entrada: string) {
  const canonico = validarNCF(entrada)
  const [, anio, mes, categoriaCodigo, secuencia] = NCF_REGEX.exec(canonico)!
  return {
    ncf: canonico,
    anio: Number(anio),
    mes: Number(mes),
    categoriaCodigo,
    secuencia: Number(secuencia),
  }
}

/**
 * URL que se graba físicamente en la etiqueta NFC.
 * Es exactamente lo que iOS muestra en la notificación al acercar el iPhone.
 */
export function urlEtiqueta(ncf: string, base: string): string {
  return `${base.replace(/\/$/, '')}/activo/${validarNCF(ncf)}`
}

/**
 * Extrae el NCF de un texto arbitrario: una URL completa, un NDEF pegado desde
 * NFC Tools o el código suelto. Devuelve null si no encuentra ninguno válido.
 */
export function extraerNCF(texto: string): string | null {
  const coincidencias = normalizarNCF(texto).match(/NCF-\d{6}-[A-Z]{3}-\d{4}[0-9A-Z]/g)
  return coincidencias?.find(esNCFValido) ?? null
}

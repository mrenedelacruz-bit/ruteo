"""Generación, validación y parseo del código NCF.

NCF = *Número de Control Físico* del bien mueble. Es la llave que se graba en la
etiqueta NFC y la que relaciona el mundo físico con la base de datos.

Formato
-------
    NCF-AAAAMM-CAT-NNNNV
     │    │     │   │  └── V  : carácter verificador (base36) — detecta tipeos
     │    │     │   └───── NNNN: secuencia dentro del mes+categoría (4 dígitos)
     │    │     └───────── CAT : 3 letras de la categoría (MOB, EQC, VEH, ...)
     │    └─────────────── AAAAMM: año y mes de alta
     └──────────────────── prefijo fijo

Ejemplo: ``NCF-202608-MOB-0042K``

Por qué un verificador: el NCF se dicta por teléfono, se teclea a mano cuando la
etiqueta se despega y se imprime en stickers de respaldo. Un carácter de control
convierte el 90 % de los errores de digitación en un 400 inmediato en vez de en
una consulta que "no encuentra" el activo.

Por qué tan corto: la URL completa (``https://host/ruteo/activo/NCF-...``) debe
caber en una NTAG213, que solo ofrece ~132 bytes útiles de NDEF.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone

# Alfabeto base36 para el carácter verificador.
_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"

# Estructura completa, verificador incluido.
NCF_REGEX = re.compile(r"^NCF-(\d{4})(\d{2})-([A-Z]{3})-(\d{4})([0-9A-Z])$")

# Longitud del NCF sin el verificador, útil para recalcularlo.
_CUERPO_LEN = len("NCF-202608-MOB-0042")


class NCFInvalidoError(ValueError):
    """El NCF no cumple el formato o falla el dígito verificador."""


def _checksum(cuerpo: str) -> str:
    """Carácter verificador base36 ponderado posicionalmente.

    La ponderación por posición (i + 1) hace que el algoritmo detecte también
    transposiciones (``0042`` vs ``0024``), cosa que una suma simple no logra.
    """
    total = sum((i + 1) * ord(c) for i, c in enumerate(cuerpo))
    return _ALPHABET[total % len(_ALPHABET)]


def generar_ncf(categoria_codigo: str, secuencia: int, momento: datetime | None = None) -> str:
    """Arma un NCF nuevo.

    Args:
        categoria_codigo: código de 3 letras de la categoría (se normaliza a mayúsculas).
        secuencia: correlativo dentro del par (mes, categoría). 1..9999.
        momento: fecha de alta; por defecto "ahora" en UTC.

    Raises:
        NCFInvalidoError: si la categoría o la secuencia están fuera de rango.
    """
    cat = (categoria_codigo or "").strip().upper()
    if not re.fullmatch(r"[A-Z]{3}", cat):
        raise NCFInvalidoError(
            f"El código de categoría debe ser 3 letras A-Z; se recibió {categoria_codigo!r}"
        )
    if not 1 <= secuencia <= 9999:
        raise NCFInvalidoError(f"La secuencia debe estar entre 1 y 9999; se recibió {secuencia}")

    momento = momento or datetime.now(timezone.utc)
    cuerpo = f"NCF-{momento:%Y%m}-{cat}-{secuencia:04d}"
    return cuerpo + _checksum(cuerpo)


def validar_ncf(ncf: str) -> str:
    """Normaliza y valida un NCF. Devuelve la forma canónica (mayúsculas, sin espacios).

    Acepta entradas "sucias" del campo — minúsculas, espacios sobrantes — porque
    llegan de un teclado de iPhone o de un lector de código de barras.

    Raises:
        NCFInvalidoError: formato incorrecto o verificador que no cuadra.
    """
    candidato = (ncf or "").strip().upper().replace(" ", "")
    if not NCF_REGEX.match(candidato):
        raise NCFInvalidoError(
            f"NCF con formato inválido: {ncf!r}. Se esperaba NCF-AAAAMM-CAT-NNNNV"
        )
    cuerpo, verificador = candidato[:_CUERPO_LEN], candidato[_CUERPO_LEN]
    if _checksum(cuerpo) != verificador:
        raise NCFInvalidoError(
            f"El carácter verificador de {candidato!r} no corresponde "
            f"(se esperaba {_checksum(cuerpo)!r}). Probable error de digitación."
        )
    return candidato


def parsear_ncf(ncf: str) -> dict[str, object]:
    """Descompone un NCF válido en sus partes (año, mes, categoría, secuencia)."""
    canonico = validar_ncf(ncf)
    anio, mes, cat, sec, _ = NCF_REGEX.match(canonico).groups()  # type: ignore[union-attr]
    return {
        "ncf": canonico,
        "anio": int(anio),
        "mes": int(mes),
        "categoria_codigo": cat,
        "secuencia": int(sec),
    }


def url_etiqueta(ncf: str, base_url: str) -> str:
    """URL que se graba físicamente en la etiqueta NFC.

    Es la que iOS muestra en la notificación al acercar el iPhone al tag.
    """
    return f"{base_url.rstrip('/')}/activo/{validar_ncf(ncf)}"

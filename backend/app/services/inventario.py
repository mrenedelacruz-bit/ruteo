"""Lógica de negocio del inventario.

Se mantiene fuera de los routers para que las reglas (cómo se numera un NCF, qué
implica una auditoría de presencia) sean testeables sin levantar HTTP y
reutilizables desde un comando CLI o una tarea programada.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlmodel import Session, select

from app.core.config import settings
from app.models.auditoria import Auditoria
from app.models.bien import BienMueble, ahora_utc
from app.models.enums import CategoriaBien, TipoEvento
from app.schemas.bien import AuditoriaCrear, BienActualizar, BienCrear, BienLeer
from app.services.ncf import NCFInvalidoError, generar_ncf, url_etiqueta


class BienNoEncontradoError(LookupError):
    """No existe un bien con ese NCF."""


class NCFDuplicadoError(ValueError):
    """Ya hay un bien registrado con ese NCF."""


# --------------------------------------------------------------------------- #
# Serialización                                                               #
# --------------------------------------------------------------------------- #
def a_esquema(bien: BienMueble) -> BienLeer:
    """Convierte el modelo de tabla al esquema público, añadiendo la URL de etiqueta."""
    datos = BienLeer.model_validate(bien)
    datos.url_etiqueta = url_etiqueta(bien.ncf, settings.PUBLIC_BASE_URL)
    return datos


# --------------------------------------------------------------------------- #
# Lecturas                                                                    #
# --------------------------------------------------------------------------- #
def obtener_por_ncf(session: Session, ncf: str) -> BienMueble:
    """Busca por NCF ya normalizado. Lanza `BienNoEncontradoError` si no existe."""
    bien = session.exec(select(BienMueble).where(BienMueble.ncf == ncf)).first()
    if bien is None:
        raise BienNoEncontradoError(f"No existe ningún bien con NCF {ncf}")
    return bien


def listar(
    session: Session,
    *,
    estado: str | None = None,
    categoria: str | None = None,
    usuario: str | None = None,
    solo_geolocalizados: bool = False,
    limite: int = 500,
    desplazamiento: int = 0,
) -> list[BienMueble]:
    """Listado filtrable. El mapa lo consume con `solo_geolocalizados=True`."""
    consulta = select(BienMueble)
    if estado:
        consulta = consulta.where(BienMueble.estado == estado)
    if categoria:
        consulta = consulta.where(BienMueble.categoria == categoria)
    if usuario:
        consulta = consulta.where(BienMueble.usuario_asignado == usuario)
    if solo_geolocalizados:
        consulta = consulta.where(BienMueble.latitud.is_not(None))  # type: ignore[union-attr]
    consulta = consulta.order_by(BienMueble.creado_en.desc()).offset(desplazamiento).limit(limite)  # type: ignore[union-attr]
    return list(session.exec(consulta).all())


def historial(session: Session, ncf: str, limite: int = 50) -> list[Auditoria]:
    """Bitácora de un bien, del evento más reciente al más antiguo."""
    consulta = (
        select(Auditoria)
        .where(Auditoria.ncf == ncf)
        .order_by(Auditoria.registrado_en.desc())  # type: ignore[union-attr]
        .limit(limite)
    )
    return list(session.exec(consulta).all())


# --------------------------------------------------------------------------- #
# Numeración NCF                                                              #
# --------------------------------------------------------------------------- #
def siguiente_ncf(
    session: Session, categoria: CategoriaBien, momento: datetime | None = None
) -> str:
    """Calcula el próximo NCF libre para (mes actual, categoría).

    La secuencia se deriva de lo ya almacenado en vez de un contador aparte, así
    el sistema no depende de una tabla de secuencias que pueda desincronizarse
    tras una restauración de respaldo. Ante colisión (dos altas concurrentes) se
    avanza al siguiente número libre.
    """
    momento = momento or datetime.now(timezone.utc)
    prefijo = f"NCF-{momento:%Y%m}-{categoria.codigo}-"

    existentes = set(
        session.exec(
            select(BienMueble.ncf).where(BienMueble.ncf.startswith(prefijo))  # type: ignore[union-attr]
        ).all()
    )

    for secuencia in range(len(existentes) + 1, 10_000):
        candidato = generar_ncf(categoria.codigo, secuencia, momento)
        if candidato not in existentes:
            return candidato

    raise NCFInvalidoError(
        f"Se agotaron los 9999 correlativos de {prefijo} en este mes. "
        "Amplíe el formato de secuencia antes de continuar."
    )


# --------------------------------------------------------------------------- #
# Escrituras                                                                  #
# --------------------------------------------------------------------------- #
def crear(session: Session, datos: BienCrear) -> BienMueble:
    """Da de alta un bien y deja el evento ALTA en la bitácora."""
    ncf = datos.ncf or siguiente_ncf(session, datos.categoria)

    if session.exec(select(BienMueble).where(BienMueble.ncf == ncf)).first():
        raise NCFDuplicadoError(f"Ya existe un bien con NCF {ncf}")

    bien = BienMueble(
        ncf=ncf,
        **datos.model_dump(exclude={"ncf"}),
    )
    session.add(bien)
    session.commit()
    session.refresh(bien)

    _registrar_evento(
        session,
        bien,
        TipoEvento.ALTA,
        latitud=bien.latitud,
        longitud=bien.longitud,
        usuario=bien.usuario_asignado,
        nota="Alta en inventario",
    )
    return bien


def actualizar(session: Session, bien: BienMueble, cambios: BienActualizar) -> BienMueble:
    """Aplica una edición parcial. Deja rastro si cambió el estado."""
    estado_previo = bien.estado
    aplicados = cambios.model_dump(exclude_unset=True, exclude_none=True)

    for campo, valor in aplicados.items():
        setattr(bien, campo, valor)
    bien.actualizado_en = ahora_utc()

    session.add(bien)
    session.commit()
    session.refresh(bien)

    if "estado" in aplicados and aplicados["estado"] != estado_previo:
        _registrar_evento(
            session,
            bien,
            TipoEvento.CAMBIO_ESTADO,
            nota=f"{estado_previo.value} → {bien.estado.value}",
            usuario=bien.usuario_asignado,
        )
    return bien


def actualizar_ubicacion(
    session: Session,
    bien: BienMueble,
    latitud: float,
    longitud: float,
    precision_gps_m: float | None = None,
    usuario: str | None = None,
) -> BienMueble:
    """Fija la posición del bien con la lectura GPS del teléfono."""
    bien.latitud = latitud
    bien.longitud = longitud
    bien.precision_gps_m = precision_gps_m
    bien.actualizado_en = ahora_utc()

    session.add(bien)
    session.commit()
    session.refresh(bien)

    _registrar_evento(
        session,
        bien,
        TipoEvento.ACTUALIZACION_UBICACION,
        latitud=latitud,
        longitud=longitud,
        precision_gps_m=precision_gps_m,
        usuario=usuario,
        nota="Ubicación sincronizada desde GPS del dispositivo",
    )
    return bien


def registrar_auditoria(
    session: Session, bien: BienMueble, datos: AuditoriaCrear
) -> tuple[Auditoria, BienMueble]:
    """Auditoría de presencia: el flujo que dispara el escaneo NFC en campo.

    Siempre actualiza `fecha_ultima_lectura`. Solo mueve el pin del mapa si el
    usuario marcó explícitamente `sincronizar_ubicacion` — un escaneo confirma
    que el bien *existe*, no necesariamente que se haya mudado.
    """
    bien.fecha_ultima_lectura = ahora_utc()
    bien.actualizado_en = bien.fecha_ultima_lectura

    tiene_coords = datos.latitud is not None and datos.longitud is not None
    if datos.sincronizar_ubicacion and tiene_coords:
        bien.latitud = datos.latitud
        bien.longitud = datos.longitud
        bien.precision_gps_m = datos.precision_gps_m

    session.add(bien)
    session.commit()
    session.refresh(bien)

    evento = _registrar_evento(
        session,
        bien,
        datos.tipo,
        latitud=datos.latitud,
        longitud=datos.longitud,
        precision_gps_m=datos.precision_gps_m,
        usuario=datos.usuario,
        nota=datos.nota,
    )
    return evento, bien


def _registrar_evento(
    session: Session,
    bien: BienMueble,
    tipo: TipoEvento,
    *,
    latitud: float | None = None,
    longitud: float | None = None,
    precision_gps_m: float | None = None,
    usuario: str | None = None,
    nota: str | None = None,
) -> Auditoria:
    """Inserta una fila en la bitácora. Uso interno del servicio."""
    evento = Auditoria(
        bien_id=bien.id,  # type: ignore[arg-type]
        ncf=bien.ncf,
        tipo=tipo,
        latitud=latitud,
        longitud=longitud,
        precision_gps_m=precision_gps_m,
        usuario=usuario,
        nota=nota,
    )
    session.add(evento)
    session.commit()
    session.refresh(evento)
    return evento

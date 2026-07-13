import jwt as pyjwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import decode_access_token
from app.models.user import User, UserRole

_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(401, "no autenticado", headers={"WWW-Authenticate": "Bearer"})
    try:
        payload = decode_access_token(credentials.credentials)
    except pyjwt.InvalidTokenError:
        raise HTTPException(401, "token invalido o expirado", headers={"WWW-Authenticate": "Bearer"})

    user = db.scalar(select(User).where(User.username == payload.get("sub")))
    if user is None or not user.is_active:
        raise HTTPException(401, "usuario inactivo o inexistente")
    return user


def require_dispatcher(user: User = Depends(get_current_user)) -> User:
    if user.role != UserRole.dispatcher:
        raise HTTPException(403, "requiere rol de despachador")
    return user

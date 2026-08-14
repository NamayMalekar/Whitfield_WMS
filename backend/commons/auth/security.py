"""Password hashing."""
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain_password: str) -> str:
    # bcrypt silently truncates beyond 72 bytes; truncate explicitly so the
    # behaviour is visible rather than surprising.
    return pwd_context.hash(plain_password[:72])


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return pwd_context.verify(plain_password[:72], hashed_password)
    except ValueError:
        return False

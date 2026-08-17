"""Role-based access control.

Roles are a hierarchy: NEWHIRE < VETERAN < ADMIN. `require_role(Role.VETERAN)`
admits veterans and admins, never new hires. Permissions are declared per route
so a reader can see the access level without tracing into the handler.
"""
from typing import Callable, Iterable, List, Optional

from fastapi import Depends, HTTPException, status

from commons.auth.jwt import get_current_user
from core.database.models import CROSS_WAREHOUSE_MIN_RANK, ROLE_RANK, Role, User

# Capability map, surfaced to the frontend so the UI hides what it cannot do.
PERMISSIONS = {
    Role.NEWHIRE: [
        "inventory:read",
        "inventory:receive",
        "order:read",
        "order:advance",
        "voice:use",
        "assistant:ask",
        "audit:read_own",
    ],
    Role.VETERAN: [
        "inventory:read",
        "inventory:receive",
        "inventory:adjust",
        "inventory:transfer",
        "order:read",
        "order:create",
        "order:confirm",
        "order:advance",
        "order:cancel",
        "voice:use",
        "assistant:ask",
        "audit:read",
        "script:run",
    ],
    Role.MANAGER: [
        # Everything a veteran can do at their own building, plus running
        # checks - but no `user:manage`: a manager cannot create or edit
        # accounts, and their `audit:read` is scoped server-side to their
        # own warehouse (see `scoped_warehouse_code` below).
        "inventory:read",
        "inventory:receive",
        "inventory:adjust",
        "inventory:transfer",
        "product:manage",
        "order:read",
        "order:create",
        "order:confirm",
        "order:advance",
        "order:cancel",
        "voice:use",
        "assistant:ask",
        "audit:read",
        "script:run",
        "script:write",
    ],
    Role.ADMIN: [
        "inventory:read",
        "inventory:receive",
        "inventory:adjust",
        "inventory:transfer",
        "product:manage",
        "order:read",
        "order:create",
        "order:confirm",
        "order:advance",
        "order:cancel",
        "voice:use",
        "assistant:ask",
        "audit:read",
        "audit:verify",
        "script:run",
        "script:write",
        "script:schedule",
        "user:manage",
    ],
}
# Superadmin inherits every admin capability. Kept as a copy (not the same
# list object) so nothing that mutates one accidentally mutates the other.
PERMISSIONS[Role.SUPERADMIN] = list(PERMISSIONS[Role.ADMIN])


def permissions_for(role: Role) -> List[str]:
    return PERMISSIONS.get(role, [])


def require_role(minimum: Role) -> Callable[[User], User]:
    """Dependency factory enforcing the role hierarchy."""

    def dependency(current_user: User = Depends(get_current_user)) -> User:
        if ROLE_RANK[current_user.role] < ROLE_RANK[minimum]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"{current_user.role.value} cannot do this. "
                    f"{minimum.value} access or higher is required."
                ),
            )
        return current_user

    return dependency


def require_permission(permission: str) -> Callable[[User], User]:
    def dependency(current_user: User = Depends(get_current_user)) -> User:
        if permission not in permissions_for(current_user.role):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Your role does not include '{permission}'.",
            )
        return current_user

    return dependency


def require_any_role(roles: Iterable[Role]) -> Callable[[User], User]:
    allowed = set(roles)

    def dependency(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your role does not have access to this area.",
            )
        return current_user

    return dependency


require_admin = require_role(Role.ADMIN)
require_veteran = require_role(Role.VETERAN)
require_staff = require_role(Role.NEWHIRE)


def sees_all_warehouses(user: User) -> bool:
    """ADMIN and SUPERADMIN are the only roles that cross building lines."""
    return ROLE_RANK[user.role] >= CROSS_WAREHOUSE_MIN_RANK


def scoped_warehouse_code(requested: Optional[str], user: User) -> Optional[str]:
    """Reno stays Reno's and Columbus stays Columbus's.

    Below ADMIN, a user is locked to the single building on their own
    account, no matter what `warehouse_code` they pass in - this is what
    stops a Reno manager from ever pulling Columbus's numbers (or vice
    versa) by hand-editing the request. `None` means "every warehouse this
    caller can see": for admins that's everything, for everyone else it
    collapses to their one building.
    """
    if sees_all_warehouses(user):
        return requested

    home_code = user.warehouse.code if user.warehouse else None
    if not home_code:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is not assigned to a building yet. Ask an admin to fix this.",
        )
    if requested and requested != home_code:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"You only have access to {home_code}'s data.",
        )
    return home_code


def current_user_warehouse_scope() -> Callable[[Optional[str], User], Optional[str]]:
    """FastAPI dependency: resolves the effective `warehouse_code` for the caller."""

    def dependency(
        warehouse_code: Optional[str] = None,
        current_user: User = Depends(get_current_user),
    ) -> Optional[str]:
        return scoped_warehouse_code(warehouse_code, current_user)

    return dependency


def assert_can_grant_role(actor: User, target_role: Role) -> None:
    """Only a SUPERADMIN can create or promote someone to ADMIN/SUPERADMIN.

    Keeps the sign-up screen from becoming a way for one admin to mint
    another admin's worth of cross-warehouse access on their own say-so.
    """
    if ROLE_RANK[target_role] >= ROLE_RANK[Role.ADMIN] and ROLE_RANK[actor.role] < ROLE_RANK[Role.SUPERADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Only a superadmin can grant {target_role.value} access.",
        )

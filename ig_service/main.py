"""
Instagram Private API microservice using instagrapi.
Called by the Node.js backend via HTTP on port 5002.
"""

import asyncio
import json
import os
import re
import time
import logging
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Query, Header
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from instagrapi import Client
from instagrapi.exceptions import (
    TwoFactorRequired,
    ChallengeRequired,
    LoginRequired,
    PleaseWaitFewMinutes,
    BadPassword,
    UserNotFound,
    ClientError,
    ChallengeUnknownStep,
    RecaptchaChallengeForm,
    SelectContactPointRecoveryForm,
)

# ─── Monkey-patch: fix multiple bugs in instagrapi 2.2.1 ──────────
# The shipped extract_user_gql has at least 3 known bugs:
#   a) Doesn't accept **kwargs (update_headers= passed by caller)
#   b) extract_broadcast_channel crashes when pinned_channels_info is missing
#   c) bio_links items may lack the required link_id field
# Instead of patching each one, we replace extract_user_gql entirely
# with a robust version that pre-processes the data dict.
import instagrapi.extractors as _extractors
from instagrapi.types import User as _User
import uuid as _uuid

def _patched_extract_user_gql(data, **kwargs):
    # broadcast_channel: safe extraction
    try:
        channels_list = data.get("pinned_channels_info", {}).get("pinned_channels_list", [])
        from instagrapi.types import Broadcast
        data["broadcast_channel"] = [Broadcast(**ch) for ch in channels_list]
    except Exception:
        data["broadcast_channel"] = []

    # bio_links: ensure each item has a link_id
    bio_links = data.get("bio_links", [])
    if bio_links:
        for link in bio_links:
            if isinstance(link, dict) and "link_id" not in link:
                link["link_id"] = str(_uuid.uuid4())
        data["bio_links"] = bio_links

    try:
        return _User(
            pk=data.get("id", data.get("pk")),
            media_count=data.get("edge_owner_to_timeline_media", {}).get("count", 0),
            follower_count=data.get("edge_followed_by", {}).get("count", 0),
            following_count=data.get("edge_follow", {}).get("count", 0),
            is_business=data.get("is_business_account", False),
            public_email=data.get("business_email", ""),
            contact_phone_number=data.get("business_phone_number", ""),
            **data,
        )
    except Exception as exc:
        # Last resort: build a minimal User with only guaranteed fields
        return _User(
            pk=data.get("id", data.get("pk", 0)),
            username=data.get("username", ""),
            full_name=data.get("full_name", ""),
            is_private=data.get("is_private", False),
            is_verified=data.get("is_verified", False),
            profile_pic_url=data.get("profile_pic_url"),
            media_count=data.get("edge_owner_to_timeline_media", {}).get("count", 0),
            follower_count=data.get("edge_followed_by", {}).get("count", 0),
            following_count=data.get("edge_follow", {}).get("count", 0),
            biography=data.get("biography", ""),
        )

_extractors.extract_user_gql = _patched_extract_user_gql

try:
    import instagrapi.mixins.user as _user_mixin
    if hasattr(_user_mixin, "extract_user_gql"):
        _user_mixin.extract_user_gql = _patched_extract_user_gql
except Exception:
    pass
# ─── End monkey-patch ──────────────────────────────────────────────

app = FastAPI(title="IG Private API Service")
logger = logging.getLogger("ig_service")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

for _noisy in ("instagrapi", "public_request", "private_request", "urllib3"):
    logging.getLogger(_noisy).setLevel(logging.WARNING)

STATE_DIR = Path(__file__).resolve().parent.parent / "storage" / "ig_state"
STATE_DIR.mkdir(parents=True, exist_ok=True)

# Proxy opcional: IG_PROXY o INSTAGRAM_PROXY (ej: http://user:pass@host:port o socks5://host:port)
IG_PROXY = os.environ.get("IG_PROXY") or os.environ.get("INSTAGRAM_PROXY") or ""

# In-memory store of instagrapi Client instances keyed by userId
clients: dict[str, Client] = {}
# Pending 2FA data keyed by userId
pending_2fa: dict[str, dict] = {}
# Pending challenge data keyed by userId
pending_challenges: dict[str, dict] = {}


class ChallengeCodeNeeded(Exception):
    """Raised by custom challenge_code_handler to signal that a code was sent and the user must provide it."""
    def __init__(self, choice: str):
        self.choice = choice
        super().__init__(f"Challenge code needed via {choice}")


def _challenge_code_handler(username, choice):
    """Custom handler that NEVER blocks on input(). Raises ChallengeCodeNeeded instead."""
    logger.info(f"Challenge code requested for @{username} via {choice}")
    raise ChallengeCodeNeeded(str(choice))


def _state_file(user_id: str) -> Path:
    return STATE_DIR / f"{user_id}_py.json"


def _get_or_create_client(user_id: str) -> Client:
    if user_id not in clients:
        cl = Client(proxy=IG_PROXY if IG_PROXY else None)
        cl.delay_range = [0, 1]
        cl.request_timeout = 20
        cl.challenge_code_handler = _challenge_code_handler
        clients[user_id] = cl
        if IG_PROXY:
            logger.info("Usando proxy para Instagram")
    return clients[user_id]


def _save_session(user_id: str, cl: Client, username: str):
    data = {
        "username": username,
        "session": cl.get_settings(),
        "savedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    _state_file(user_id).write_text(json.dumps(data, default=str), encoding="utf-8")
    logger.info(f"Session saved for @{username} (userId={user_id})")


def _load_session(user_id: str, cl: Client) -> Optional[str]:
    f = _state_file(user_id)
    if not f.exists():
        return None
    try:
        data = json.loads(f.read_text(encoding="utf-8"))
        cl.set_settings(data["session"])
        cl.login_by_sessionid(cl.settings.get("authorization_data", {}).get("sessionid", ""))
        return None
    except Exception:
        # set_settings is enough, login verification happens in restore-session endpoint
        pass
    return data.get("username")


def _format_user(u) -> dict:
    return {
        "pk": str(u.pk),
        "username": getattr(u, "username", "") or "",
        "full_name": getattr(u, "full_name", "") or "",
        "is_private": getattr(u, "is_private", False),
        "is_verified": getattr(u, "is_verified", False),
        "profile_pic_url": str(u.profile_pic_url) if getattr(u, "profile_pic_url", None) else None,
        "follower_count": getattr(u, "follower_count", None),
        "following_count": getattr(u, "following_count", None),
        "media_count": getattr(u, "media_count", None),
        "is_business": getattr(u, "is_business_account", False) or getattr(u, "is_business", False),
    }


def _format_media(m) -> dict:
    image_url = None
    if m.thumbnail_url:
        image_url = str(m.thumbnail_url)
    elif m.resources and len(m.resources) > 0:
        image_url = str(m.resources[0].thumbnail_url) if m.resources[0].thumbnail_url else None

    return {
        "pk": str(m.pk),
        "shortcode": m.code,
        "media_type": m.media_type,
        "caption": m.caption_text or "",
        "like_count": m.like_count or 0,
        "comment_count": m.comment_count or 0,
        "taken_at": m.taken_at.isoformat() if m.taken_at else None,
        "permalink": f"https://www.instagram.com/p/{m.code}/" if m.code else None,
        "image_url": image_url,
        "user": {
            "pk": str(m.user.pk) if m.user else None,
            "username": m.user.username if m.user else None,
            "full_name": (m.user.full_name or "") if m.user else "",
            "is_verified": m.user.is_verified if m.user else False,
        } if m.user else None,
    }


def _checkpoint_response(msg: str, checkpoint_type: str = "manual_verification", needs_code: bool = False):
    return {
        "success": False,
        "needs_checkpoint": True,
        "checkpoint_type": checkpoint_type,
        "message": msg,
        "needs_code": needs_code,
    }


def _handle_ig_error(e: Exception, fallback: dict = None) -> dict:
    fallback = fallback or {}
    msg = str(e)
    if isinstance(e, ChallengeRequired):
        return {
            **fallback,
            "success": False,
            "error": "Instagram requiere verificación adicional. Espera unos minutos e inténtalo de nuevo.",
        }
    if isinstance(e, json.JSONDecodeError) or "Expecting value" in msg:
        return {
            **fallback,
            "success": False,
            "error": "Instagram requiere verificación adicional. Espera unos minutos e inténtalo de nuevo.",
        }
    if isinstance(e, LoginRequired):
        return {**fallback, "success": False, "error": "Sesión expirada. Vuelve a iniciar sesión."}
    if isinstance(e, PleaseWaitFewMinutes):
        return {**fallback, "success": False, "error": "Instagram dice: espera unos minutos antes de intentar de nuevo.", "rate_limited": True}
    if isinstance(e, BadPassword):
        err_lower = msg.lower()
        if "blacklist" in err_lower or "change your ip" in err_lower:
            return {**fallback, "success": False, "error": "Tu IP ha sido bloqueada por Instagram. Cambia de red (datos móviles, VPN) o espera unas horas e inténtalo de nuevo."}
        return {**fallback, "success": False, "error": "Contraseña incorrecta."}
    if isinstance(e, UserNotFound):
        return {**fallback, "success": False, "error": "Usuario no encontrado."}
    logger.error(f"IG error: {msg}")
    return {**fallback, "success": False, "error": msg}


async def _run_with_timeout(func, *args, timeout_seconds=90):
    """Run a blocking function in a thread pool with a timeout."""
    return await asyncio.wait_for(
        asyncio.to_thread(func, *args),
        timeout=timeout_seconds,
    )


def _extract_shortcode(url: str) -> Optional[str]:
    for pattern in [
        r"instagram\.com/p/([A-Za-z0-9_-]+)",
        r"instagram\.com/reel/([A-Za-z0-9_-]+)",
        r"instagram\.com/tv/([A-Za-z0-9_-]+)",
    ]:
        m = re.search(pattern, url)
        if m:
            return m.group(1)
    return None


# ─── Request models ───────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str
    user_id: str

class TwoFARequest(BaseModel):
    code: str
    user_id: str

class ChallengeCodeRequest(BaseModel):
    code: str
    user_id: str

class RetryRequest(BaseModel):
    user_id: str

class RestoreRequest(BaseModel):
    user_id: str

class LogoutRequest(BaseModel):
    user_id: str

class PostLikersRequest(BaseModel):
    post_url: str
    user_id: str
    limit: int = 100

class DMRequest(BaseModel):
    recipient_username: str
    text: str
    user_id: str

class MassDMRequest(BaseModel):
    recipient_usernames: list[str]
    message: str
    user_id: str
    delay_between_ms: int = 8000
    use_username_template: bool = False


# ─── Auth endpoints ───────────────────────────────────────

def _try_resolve_challenge(cl: Client, user_id: str, username: str):
    """Attempt to auto-resolve a challenge. Returns a response dict."""
    pending_challenges[user_id] = {"username": username}
    try:
        cl.challenge_resolve_auto()
        _save_session(user_id, cl, username)
        logger.info(f"Challenge auto-resolved for @{username}")
        return {"success": True, "pk": str(cl.user_id), "username": username}
    except ChallengeCodeNeeded as ccn:
        logger.info(f"Challenge code sent via {ccn.choice} for @{username}")
        _save_session(user_id, cl, username)
        method = "email" if "email" in ccn.choice.lower() else "sms"
        return _checkpoint_response(
            f"Instagram ha enviado un código de verificación por {method}. Introdúcelo para continuar.",
            "verify_code",
            needs_code=True,
        )
    except ChallengeUnknownStep:
        return _checkpoint_response(
            "Instagram requiere verificación. Abre Instagram en tu teléfono y completa la verificación.",
            "delta_login_review",
        )
    except RecaptchaChallengeForm:
        return _checkpoint_response(
            "Instagram requiere un captcha. Abre Instagram en tu teléfono o navegador y completa la verificación.",
            "manual_verification",
        )
    except SelectContactPointRecoveryForm:
        return _checkpoint_response(
            "Instagram ha enviado un código de verificación a tu teléfono o email. Introdúcelo para continuar.",
            "verify_code",
            needs_code=True,
        )
    except Exception as ce:
        logger.error(f"Challenge resolve error: {ce}")
        _save_session(user_id, cl, username)
        return _checkpoint_response(
            "Instagram requiere verificación. Abre Instagram en tu teléfono, completa la verificación y pulsa 'Ya lo aprobé'."
        )


@app.post("/login")
async def login(req: LoginRequest):
    cl = _get_or_create_client(req.user_id)
    try:
        cl.login(req.username, req.password)
        _save_session(req.user_id, cl, req.username)
        try:
            user_info = cl.account_info()
            logger.info(f"Login OK for @{req.username}")
            return {"success": True, "pk": str(user_info.pk), "username": req.username}
        except ChallengeRequired:
            logger.warning(f"Challenge required after login for @{req.username}")
            return _try_resolve_challenge(cl, req.user_id, req.username)
        except Exception:
            logger.info(f"Login OK for @{req.username} (account_info skipped)")
            return {"success": True, "pk": str(cl.user_id), "username": req.username}
    except ChallengeCodeNeeded as ccn:
        logger.info(f"Challenge code sent via {ccn.choice} for @{req.username} during login")
        pending_challenges[req.user_id] = {"username": req.username, "password": req.password}
        _save_session(req.user_id, cl, req.username)
        method = "email" if "email" in ccn.choice.lower() else "sms"
        return _checkpoint_response(
            f"Instagram ha enviado un código de verificación por {method}. Introdúcelo para continuar.",
            "verify_code",
            needs_code=True,
        )
    except TwoFactorRequired as e:
        pending_2fa[req.user_id] = {
            "username": req.username,
            "password": req.password,
            "two_factor_info": {
                "two_factor_identifier": getattr(e, "two_factor_identifier", None) or
                    (cl.last_json or {}).get("two_factor_info", {}).get("two_factor_identifier"),
                "methods": (cl.last_json or {}).get("two_factor_info", {}).get("enabled_methods", []),
            },
        }
        logger.info(f"2FA required for @{req.username}")
        info = pending_2fa[req.user_id]["two_factor_info"]
        return {
            "success": False,
            "needs_2fa": True,
            "two_factor_identifier": info["two_factor_identifier"],
            "methods": info["methods"],
        }
    except ChallengeRequired:
        logger.warning(f"Challenge required during login for @{req.username}")
        return _try_resolve_challenge(cl, req.user_id, req.username)
    except json.JSONDecodeError as e:
        logger.warning(f"JSON decode error during login for @{req.username}: {e}")
        if cl.user_id:
            _save_session(req.user_id, cl, req.username)
            return _checkpoint_response(
                "Instagram requiere verificación. Abre Instagram en tu teléfono, completa la verificación y pulsa 'Ya lo aprobé'."
            )
        return _handle_ig_error(e)
    except Exception as e:
        logger.error(f"Login error for @{req.username}: {e}")
        err_msg = str(e)
        if "Expecting value" in err_msg or "JSONDecodeError" in err_msg:
            if cl.user_id:
                _save_session(req.user_id, cl, req.username)
                return _checkpoint_response(
                    "Instagram requiere verificación. Abre Instagram en tu teléfono, completa la verificación y pulsa 'Ya lo aprobé'."
                )
        return _handle_ig_error(e)


@app.post("/2fa")
async def complete_2fa(req: TwoFARequest):
    pending = pending_2fa.get(req.user_id)
    if not pending:
        return {"success": False, "error": "No hay 2FA pendiente para este usuario."}
    cl = _get_or_create_client(req.user_id)
    try:
        cl.login(
            pending["username"],
            pending["password"],
            verification_code=req.code,
        )
        _save_session(req.user_id, cl, pending["username"])
        pending_2fa.pop(req.user_id, None)
        logger.info(f"2FA completed for @{pending['username']}")
        return {"success": True, "pk": str(cl.user_id), "username": pending["username"]}
    except Exception as e:
        logger.error(f"2FA error: {e}")
        return {"success": False, "error": str(e)}


@app.post("/challenge/code")
async def submit_challenge_code(req: ChallengeCodeRequest):
    cl = clients.get(req.user_id)
    if not cl:
        return {"success": False, "error": "No hay sesión activa."}
    challenge_info = pending_challenges.get(req.user_id, {})
    username = challenge_info.get("username", "unknown")
    password = challenge_info.get("password")

    cl.challenge_code_handler = lambda *a, **kw: req.code

    # If we have stored credentials, re-login with the code handler set
    if password and username != "unknown":
        try:
            cl.login(username, password)
            pending_challenges.pop(req.user_id, None)
            _save_session(req.user_id, cl, username)
            logger.info(f"Challenge code accepted (re-login) for @{username}")
            cl.challenge_code_handler = _challenge_code_handler
            return {"success": True, "username": username}
        except ChallengeCodeNeeded:
            logger.warning(f"Challenge triggered again after code for @{username}")
            cl.challenge_code_handler = _challenge_code_handler
            return {"success": False, "error": "Código incorrecto o expirado. Inténtalo de nuevo."}
        except (json.JSONDecodeError, Exception) as e:
            err_msg = str(e)
            # If login got a user_id, the code likely worked but a post-login
            # call (like account_info) hit another challenge. Treat as success.
            if cl.user_id and ("Expecting value" in err_msg or isinstance(e, json.JSONDecodeError)):
                pending_challenges.pop(req.user_id, None)
                _save_session(req.user_id, cl, username)
                logger.info(f"Challenge code accepted (re-login, post-login challenge ignored) for @{username}")
                cl.challenge_code_handler = _challenge_code_handler
                return {"success": True, "username": username}
            logger.error(f"Challenge re-login error: {e}")
            cl.challenge_code_handler = _challenge_code_handler
            return {"success": False, "error": err_msg}

    # Fallback: try challenge_resolve_auto with the code
    try:
        cl.challenge_resolve_auto()
        pending_challenges.pop(req.user_id, None)
        _save_session(req.user_id, cl, username)
        logger.info(f"Challenge code accepted for @{username}")
        cl.challenge_code_handler = _challenge_code_handler
        return {"success": True, "username": username}
    except ChallengeCodeNeeded:
        pending_challenges.pop(req.user_id, None)
        _save_session(req.user_id, cl, username)
        logger.info(f"Challenge code accepted (handler re-triggered) for @{username}")
        cl.challenge_code_handler = _challenge_code_handler
        return {"success": True, "username": username}
    except Exception as e:
        logger.error(f"Challenge code error: {e}")
        cl.challenge_code_handler = _challenge_code_handler
        return {"success": False, "error": str(e)}


@app.post("/challenge/retry")
async def retry_after_checkpoint(req: RetryRequest):
    cl = clients.get(req.user_id)
    if not cl:
        return {"success": False, "error": "No hay sesión activa."}
    try:
        info = cl.account_info()
        pending_challenges.pop(req.user_id, None)
        _save_session(req.user_id, cl, info.username)
        logger.info(f"Session still valid after checkpoint for @{info.username}")
        return {"success": True, "message": "Sesión restaurada. Ya puedes buscar."}
    except LoginRequired:
        f = _state_file(req.user_id)
        if f.exists():
            try:
                data = json.loads(f.read_text(encoding="utf-8"))
                cl.set_settings(data["session"])
                cl.login_by_sessionid(
                    cl.settings.get("authorization_data", {}).get("sessionid", "")
                )
                info = cl.account_info()
                _save_session(req.user_id, cl, info.username)
                return {"success": True, "message": "Sesión restaurada. Ya puedes buscar."}
            except Exception:
                pass
        return {"success": False, "error": "La sesión expiró. Desconecta y vuelve a iniciar sesión."}
    except Exception as e:
        logger.error(f"Retry checkpoint error: {e}")
        return {"success": False, "error": str(e)}


@app.post("/restore-session")
async def restore_session(req: RestoreRequest):
    f = _state_file(req.user_id)
    if not f.exists():
        return {"success": False, "restored": False}
    try:
        data = json.loads(f.read_text(encoding="utf-8"))
        cl = _get_or_create_client(req.user_id)
        cl.set_settings(data["session"])
        username = data.get("username", "unknown")

        has_auth = bool(
            cl.settings.get("authorization_data", {}).get("sessionid")
        )

        try:
            cl.get_timeline_feed()
        except LoginRequired as lr_err:
            if has_auth:
                logger.info(f"Session loaded for @{username} - timeline blocked but auth cookies exist (userId={req.user_id})")
                return {"success": True, "restored": True, "username": username, "needs_checkpoint": True}
            logger.warning(f"Session expired for @{username} (userId={req.user_id})")
            return {"success": False, "restored": False, "error": "Sesión expirada"}
        except Exception as check_err:
            if has_auth:
                logger.info(f"Session loaded for @{username} - check failed ({type(check_err).__name__}) but auth cookies exist (userId={req.user_id})")
                return {"success": True, "restored": True, "username": username, "needs_checkpoint": True}
            err_str = str(check_err).lower()
            if "login_required" in err_str:
                logger.warning(f"Session expired for @{username} (userId={req.user_id})")
                return {"success": False, "restored": False, "error": "Sesión expirada"}
            logger.info(f"Session loaded for @{username} but check failed ({type(check_err).__name__}): {check_err} (userId={req.user_id})")
            return {"success": True, "restored": True, "username": username, "needs_checkpoint": True}
        logger.info(f"Session fully restored for @{username} (userId={req.user_id})")
        return {"success": True, "restored": True, "username": username}
    except Exception as e:
        logger.warning(f"Session restore failed for userId={req.user_id}: {e}")
        return {"success": False, "restored": False, "error": str(e)}


@app.post("/logout")
async def logout(req: LogoutRequest):
    cl = clients.pop(req.user_id, None)
    pending_2fa.pop(req.user_id, None)
    pending_challenges.pop(req.user_id, None)
    f = _state_file(req.user_id)
    if f.exists():
        f.unlink()
    if cl:
        try:
            cl.logout()
        except Exception:
            pass
    logger.info(f"Logged out userId={req.user_id}")
    return {"success": True}


# ─── Data endpoints ───────────────────────────────────────

def _require_client(user_id: str) -> tuple[Optional[Client], Optional[dict]]:
    cl = clients.get(user_id)
    if not cl:
        return None, {"success": False, "error": "Private API no conectada. Inicia sesión primero."}
    return cl, None


def _safe_user_id_from_username(cl: Client, username: str):
    """Get user PK from username, preferring the private (authenticated) API."""
    # Try V1 (private/authenticated) first - works better from datacenter IPs
    try:
        user = cl.user_info_by_username_v1(username)
        return user.pk
    except Exception as e1:
        logger.warning(f"V1 user_info failed for @{username}: {e1}")
    # Fallback: standard method (tries GQL then V1 internally)
    try:
        return cl.user_id_from_username(username)
    except Exception as e2:
        logger.warning(f"user_id_from_username failed for @{username}: {e2}")
    # Last resort: search
    try:
        results = cl.search_users_v1(username, 1)
        for u in results:
            if u.username.lower() == username.lower():
                return u.pk
    except Exception:
        pass
    raise Exception(f"No se pudo resolver el usuario @{username}")


@app.get("/search/users")
async def search_users(q: str = Query(...), limit: int = Query(10), user_id: str = Query(...)):
    cl, err = _require_client(user_id)
    if err:
        return JSONResponse(content={**err, "users": [], "total": 0})
    try:
        users_raw = cl.search_users_v1(q, limit)
        users = [_format_user(u) for u in users_raw[:limit]]
        logger.info(f"{len(users)} users found for '{q}'")
        return {"success": True, "users": users, "total": len(users)}
    except (ChallengeRequired, json.JSONDecodeError) as e:
        logger.warning(f"Challenge on search_users for '{q}': {e}")
        # Fallback: try GQL search for a single user by exact username
        try:
            user = cl.user_info_by_username_gql(q)
            if user:
                users = [_format_user(user)]
                logger.info(f"1 user found via GQL fallback for '{q}'")
                return {"success": True, "users": users, "total": 1}
        except Exception:
            pass
        return JSONResponse(content={
            "success": False,
            "users": [],
            "total": 0,
            "error": "Instagram requiere verificación adicional. Espera unos minutos e inténtalo de nuevo.",
        })
    except Exception as e:
        logger.error(f"search_users error: {e}")
        result = _handle_ig_error(e, {"users": [], "total": 0})
        return JSONResponse(content=result)


@app.get("/search/hashtags")
async def search_hashtags(q: str = Query(...), limit: int = Query(20), user_id: str = Query(...)):
    cl, err = _require_client(user_id)
    if err:
        return JSONResponse(content={**err, "hashtags": [], "total": 0})
    try:
        results = cl.search_hashtags(q, limit)
        hashtags = [
            {
                "id": str(h.id),
                "name": h.name,
                "media_count": h.media_count,
                "profile_pic_url": str(h.profile_pic_url) if h.profile_pic_url else None,
            }
            for h in results[:limit]
        ]
        logger.info(f"{len(hashtags)} hashtags found for '{q}'")
        return {"success": True, "hashtags": hashtags, "total": len(hashtags)}
    except (ChallengeRequired, json.JSONDecodeError) as e:
        logger.warning(f"Challenge on search_hashtags for '{q}': {e}")
        return JSONResponse(content={
            "success": False,
            "hashtags": [],
            "total": 0,
            "error": "Instagram requiere verificación adicional. Espera unos minutos e inténtalo de nuevo.",
        })
    except Exception as e:
        logger.error(f"search_hashtags error: {e}")
        result = _handle_ig_error(e, {"hashtags": [], "total": 0})
        return JSONResponse(content=result)


@app.get("/search/locations")
async def search_locations(q: str = Query(...), limit: int = Query(20), user_id: str = Query(...)):
    cl, err = _require_client(user_id)
    if err:
        return JSONResponse(content={**err, "locations": [], "total": 0})
    try:
        results = cl.search_places_v1(q)
        locations = [
            {
                "pk": str(loc.pk),
                "name": loc.name,
                "address": loc.address or "",
                "city": loc.city or "",
                "lat": loc.lat,
                "lng": loc.lng,
                "external_source": getattr(loc, "external_source", None),
            }
            for loc in results[:limit]
        ]
        logger.info(f"{len(locations)} locations found for '{q}'")
        return {"success": True, "locations": locations, "total": len(locations)}
    except (ChallengeRequired, json.JSONDecodeError) as e:
        logger.warning(f"Challenge on search_locations for '{q}': {e}")
        return JSONResponse(content={
            "success": False,
            "locations": [],
            "total": 0,
            "error": "Instagram requiere verificación adicional. Espera unos minutos e inténtalo de nuevo.",
        })
    except Exception as e:
        logger.error(f"search_locations error: {e}")
        result = _handle_ig_error(e, {"locations": [], "total": 0})
        return JSONResponse(content=result)


@app.get("/user/{username}/info")
async def get_user_info(username: str, user_id: str = Query(...)):
    cl, err = _require_client(user_id)
    if err:
        return JSONResponse(content=err)
    try:
        try:
            user = cl.user_info_by_username(username)
        except Exception:
            uid = _safe_user_id_from_username(cl, username)
            user = cl.user_info(uid)
        return {
            "success": True,
            "user": {
                "pk": str(user.pk),
                "username": user.username,
                "full_name": user.full_name or "",
                "biography": getattr(user, "biography", "") or "",
                "follower_count": getattr(user, "follower_count", None),
                "following_count": getattr(user, "following_count", None),
                "media_count": getattr(user, "media_count", None),
                "is_private": user.is_private,
                "is_verified": user.is_verified,
                "is_business": getattr(user, "is_business_account", False) or getattr(user, "is_business", False),
                "profile_pic_url": str(user.profile_pic_url) if user.profile_pic_url else None,
            },
        }
    except Exception as e:
        logger.error(f"get_user_info error for @{username}: {e}")
        return JSONResponse(content=_handle_ig_error(e))


def _fetch_one_gql_chunk(cl, uid, max_amount, end_cursor=None, timeout=25):
    """Fetch a single GQL chunk with a hard timeout per chunk."""
    import concurrent.futures
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(cl.user_followers_gql_chunk, str(uid), max_amount, end_cursor)
        return future.result(timeout=timeout)


def _fetch_one_gql_following_chunk(cl, uid, max_amount, timeout=25):
    """Fetch following via GQL with a hard timeout."""
    import concurrent.futures
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(cl.user_following_gql, str(uid), max_amount)
        return future.result(timeout=timeout)


def _fetch_followers_sync(cl: Client, uid: int, limit: int):
    """Fetch followers using V1 (private/authenticated) API - works better from datacenter IPs."""
    logger.info(f"🔍 V1 followers for {uid} (limit={limit})...")
    try:
        raw = cl.user_followers_v1(uid, amount=limit)
        logger.info(f"✅ V1 returned {len(raw) if raw else 0} followers")
        return raw
    except Exception as v1_err:
        logger.warning(f"❌ V1 followers failed: {type(v1_err).__name__}: {v1_err}")
        logger.info(f"🔍 Trying GQL fallback for {uid}...")
        import concurrent.futures
        all_users = []
        cursor = None
        pages = 0
        while len(all_users) < limit:
            remaining = limit - len(all_users)
            fetch = min(20, remaining)
            pages += 1
            try:
                chunk, cursor = _fetch_one_gql_chunk(cl, uid, fetch, cursor, timeout=30)
            except (concurrent.futures.TimeoutError, Exception):
                break
            all_users.extend(chunk)
            if not cursor or not chunk:
                break
            if len(all_users) < limit:
                time.sleep(3)
        if all_users:
            return all_users[:limit]
        raise v1_err


def _fetch_following_sync(cl: Client, uid: int, limit: int):
    """Fetch following using V1 (private/authenticated) API first."""
    logger.info(f"🔍 V1 following for {uid} (limit={limit})...")
    try:
        raw = cl.user_following_v1(uid, amount=limit)
        logger.info(f"✅ V1 returned {len(raw) if raw else 0} following")
        return raw
    except Exception as v1_err:
        logger.warning(f"❌ V1 following failed: {type(v1_err).__name__}: {v1_err}")
        import concurrent.futures
        logger.info(f"🔍 Trying GQL following fallback for {uid}...")
        try:
            result = _fetch_one_gql_following_chunk(cl, uid, limit, timeout=30)
            return result
        except Exception:
            raise v1_err


@app.get("/user/{username}/followers")
async def get_followers(username: str, limit: int = Query(30), user_id: str = Query(...)):
    cl, err = _require_client(user_id)
    if err:
        return JSONResponse(content={**err, "followers": [], "total": 0})
    try:
        logger.info(f"⏳ Fetching followers for @{username} (limit={limit})...")
        uid = await _run_with_timeout(_safe_user_id_from_username, cl, username, timeout_seconds=60)
        logger.info(f"✅ User ID resolved for @{username}: {uid}")
        followers_raw = await _run_with_timeout(_fetch_followers_sync, cl, uid, limit, timeout_seconds=120)
        if isinstance(followers_raw, dict):
            followers = [_format_user(u) for u in followers_raw.values()][:limit]
        elif isinstance(followers_raw, list):
            followers = [_format_user(u) for u in followers_raw][:limit]
        else:
            followers = []
        logger.info(f"✅ {len(followers)} followers fetched for @{username}")
        return {"success": True, "followers": followers, "total": len(followers)}
    except asyncio.TimeoutError:
        logger.error(f"⏰ Timeout fetching followers for @{username}")
        return JSONResponse(content={
            "success": False, "followers": [], "total": 0,
            "error": "La solicitud tardó demasiado. Instagram puede estar limitando las peticiones. Inténtalo en unos minutos.",
            "rate_limited": True,
        })
    except (ChallengeRequired, json.JSONDecodeError) as e:
        logger.warning(f"Challenge on get_followers for @{username}: {e}")
        return JSONResponse(content={
            "success": False, "followers": [], "total": 0,
            "error": "Instagram requiere verificación adicional. Espera unos minutos e inténtalo de nuevo.",
        })
    except Exception as e:
        logger.error(f"get_followers error for @{username}: {e}")
        result = _handle_ig_error(e, {"followers": [], "total": 0})
        return JSONResponse(content=result)


@app.get("/user/{username}/following")
async def get_following(username: str, limit: int = Query(30), user_id: str = Query(...)):
    cl, err = _require_client(user_id)
    if err:
        return JSONResponse(content={**err, "following": [], "total": 0})
    try:
        logger.info(f"⏳ Fetching following for @{username} (limit={limit})...")
        uid = await _run_with_timeout(_safe_user_id_from_username, cl, username, timeout_seconds=30)
        logger.info(f"✅ User ID resolved for @{username}: {uid}")
        following_raw = await _run_with_timeout(_fetch_following_sync, cl, uid, limit, timeout_seconds=100)
        if isinstance(following_raw, dict):
            following = [_format_user(u) for u in following_raw.values()][:limit]
        elif isinstance(following_raw, list):
            following = [_format_user(u) for u in following_raw][:limit]
        else:
            following = []
        logger.info(f"✅ {len(following)} following fetched for @{username}")
        return {"success": True, "following": following, "total": len(following)}
    except asyncio.TimeoutError:
        logger.error(f"⏰ Timeout fetching following for @{username}")
        return JSONResponse(content={
            "success": False, "following": [], "total": 0,
            "error": "La solicitud tardó demasiado. Instagram puede estar limitando las peticiones. Inténtalo en unos minutos.",
            "rate_limited": True,
        })
    except (ChallengeRequired, json.JSONDecodeError) as e:
        logger.warning(f"Challenge on get_following for @{username}: {e}")
        return JSONResponse(content={
            "success": False, "following": [], "total": 0,
            "error": "Instagram requiere verificación adicional. Espera unos minutos e inténtalo de nuevo.",
        })
    except Exception as e:
        logger.error(f"get_following error for @{username}: {e}")
        result = _handle_ig_error(e, {"following": [], "total": 0})
        return JSONResponse(content=result)


@app.get("/user/{username}/media")
async def get_user_media(username: str, limit: int = Query(20), user_id: str = Query(...)):
    cl, err = _require_client(user_id)
    if err:
        return JSONResponse(content={**err, "media": [], "total": 0})
    try:
        uid = _safe_user_id_from_username(cl, username)
        medias = cl.user_medias(uid, amount=limit)
        media = [_format_media(m) for m in medias[:limit]]
        logger.info(f"{len(media)} posts fetched for @{username}")
        return {"success": True, "media": media, "total": len(media), "username": username}
    except (ChallengeRequired, json.JSONDecodeError) as e:
        logger.warning(f"Challenge on get_user_media for @{username}: {e}")
        return JSONResponse(content={
            "success": False,
            "media": [],
            "total": 0,
            "error": "Instagram requiere verificación adicional. Espera unos minutos e inténtalo de nuevo.",
        })
    except Exception as e:
        logger.error(f"get_user_media error for @{username}: {e}")
        result = _handle_ig_error(e, {"media": [], "total": 0})
        return JSONResponse(content=result)


@app.get("/hashtag/{name}/media")
async def get_hashtag_media(name: str, limit: int = Query(30), user_id: str = Query(...)):
    cl, err = _require_client(user_id)
    if err:
        return JSONResponse(content={**err, "media": [], "total": 0})
    try:
        medias = cl.hashtag_medias_recent(name, amount=limit)
        media = [_format_media(m) for m in medias[:limit]]
        logger.info(f"{len(media)} posts fetched for #{name}")
        return {"success": True, "media": media, "total": len(media)}
    except Exception as e:
        logger.error(f"get_hashtag_media error for #{name}: {e}")
        result = _handle_ig_error(e, {"media": [], "total": 0})
        return JSONResponse(content=result)


@app.get("/location/{location_id}/media")
async def get_location_media(location_id: str, limit: int = Query(30), user_id: str = Query(...)):
    cl, err = _require_client(user_id)
    if err:
        return JSONResponse(content={**err, "media": [], "total": 0})
    try:
        medias = cl.location_medias_recent(int(location_id), amount=limit)
        media = [_format_media(m) for m in medias[:limit]]
        logger.info(f"{len(media)} posts fetched for location {location_id}")
        return {"success": True, "media": media, "total": len(media)}
    except Exception as e:
        logger.error(f"get_location_media error: {e}")
        result = _handle_ig_error(e, {"media": [], "total": 0})
        return JSONResponse(content=result)


@app.post("/post/likers")
async def get_post_likers(req: PostLikersRequest):
    cl, err = _require_client(req.user_id)
    if err:
        return JSONResponse(content={**err, "likes": [], "total": 0})
    try:
        shortcode = _extract_shortcode(req.post_url)
        if not shortcode:
            return {"success": False, "error": "URL de post inválida", "likes": [], "total": 0}
        media_pk = cl.media_pk_from_code(shortcode)
        media_info = cl.media_info(media_pk)
        likers_raw = cl.media_likers(media_pk)
        likers = [_format_user(u) for u in likers_raw[: req.limit]]
        return {
            "success": True,
            "likes": likers,
            "total": len(likers),
            "post_info": {
                "pk": str(media_pk),
                "shortcode": shortcode,
                "like_count": media_info.like_count or 0,
                "comment_count": media_info.comment_count or 0,
                "owner": {
                    "username": media_info.user.username if media_info.user else "unknown",
                    "pk": str(media_info.user.pk) if media_info.user else None,
                },
            },
        }
    except Exception as e:
        logger.error(f"get_post_likers error: {e}")
        result = _handle_ig_error(e, {"likes": [], "total": 0})
        return JSONResponse(content=result)


@app.get("/timeline")
async def get_timeline(limit: int = Query(20), user_id: str = Query(...)):
    cl, err = _require_client(user_id)
    if err:
        return JSONResponse(content={**err, "media": [], "total": 0})
    try:
        feed = cl.get_timeline_feed()
        items = feed.get("feed_items", [])
        media = []
        for item in items:
            m_data = item.get("media_or_ad")
            if not m_data:
                continue
            try:
                m = cl.media_info(m_data["pk"])
                media.append(_format_media(m))
            except Exception:
                continue
            if len(media) >= limit:
                break
        logger.info(f"{len(media)} timeline posts fetched")
        return {"success": True, "media": media, "total": len(media)}
    except Exception as e:
        logger.error(f"get_timeline error: {e}")
        result = _handle_ig_error(e, {"media": [], "total": 0})
        return JSONResponse(content=result)


@app.post("/dm/send")
async def send_dm(req: DMRequest):
    cl, err = _require_client(req.user_id)
    if err:
        return JSONResponse(content=err)
    try:
        uid = cl.user_id_from_username(req.recipient_username)
        result = cl.direct_send(req.text, [int(uid)])
        logger.info(f"DM sent to @{req.recipient_username}")
        return {"success": True, "data": {"thread_id": str(getattr(result, "thread_id", ""))}}
    except Exception as e:
        logger.error(f"send_dm error to @{req.recipient_username}: {e}")
        return JSONResponse(content={"success": False, "error": str(e)})


@app.post("/dm/mass")
async def send_mass_dm(req: MassDMRequest):
    cl, err = _require_client(req.user_id)
    if err:
        return JSONResponse(content=err)

    delay_s = max(5, req.delay_between_ms / 1000)
    sent = []
    failed = []

    for i, raw_username in enumerate(req.recipient_usernames):
        username = raw_username.strip().lstrip("@")
        if not username:
            continue
        text = req.message
        if req.use_username_template:
            text = re.sub(r"\{\{\s*username\s*\}\}", username, text, flags=re.IGNORECASE)
        try:
            uid = cl.user_id_from_username(username)
            cl.direct_send(text, [int(uid)])
            sent.append({"username": username, "success": True})
        except Exception as e:
            failed.append({"username": username, "error": str(e)})

        if i < len(req.recipient_usernames) - 1:
            time.sleep(delay_s)

    logger.info(f"Mass DM: {len(sent)} sent, {len(failed)} failed")
    return {"sent": sent, "failed": failed, "total": len(req.recipient_usernames)}


@app.get("/health")
async def health():
    return {"status": "ok", "clients": len(clients)}

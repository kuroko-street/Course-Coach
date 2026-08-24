import os

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token


class GoogleIdentityError(Exception):
    pass


class GoogleIdentityVerifier:
    def __init__(self, client_id=None, allowed_domain=None):
        self.client_id = client_id or os.getenv("GOOGLE_CLIENT_ID", "").strip()
        self.allowed_domain = (
            allowed_domain or os.getenv("GOOGLE_ALLOWED_DOMAIN", "kmitl.ac.th")
        ).strip().casefold()

    @property
    def configured(self):
        return bool(self.client_id)

    def verify(self, credential):
        if not self.configured:
            raise GoogleIdentityError("Google login is not configured.")
        try:
            claims = id_token.verify_oauth2_token(
                credential, google_requests.Request(), self.client_id
            )
        except Exception as exc:
            raise GoogleIdentityError("Google could not verify this sign-in.") from exc

        if claims.get("hd", "").casefold() != self.allowed_domain:
            raise GoogleIdentityError(
                f"Please sign in with a {self.allowed_domain} organization account."
            )
        if not claims.get("email_verified"):
            raise GoogleIdentityError("The Google email address is not verified.")
        if not claims.get("sub") or not claims.get("email"):
            raise GoogleIdentityError("Google did not return the required account details.")
        return claims

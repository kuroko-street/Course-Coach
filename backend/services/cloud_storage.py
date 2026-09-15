"""Cloudinary is opt-in; credentials never leave the backend."""
import logging
import os
import time
from domain.errors import ServiceError

PREFIX = 'cloudinary://'
log = logging.getLogger(__name__)

def enabled():
    provider = os.getenv('FILE_STORAGE', 'local').lower()
    if provider not in ('local', 'cloudinary'):
        raise ServiceError(503, 'Unknown FILE_STORAGE provider')
    return provider == 'cloudinary'

def client():
    import cloudinary
    import cloudinary.uploader
    import cloudinary.utils
    config = cloudinary.config()
    if not all((config.cloud_name, config.api_key, config.api_secret)):
        raise ServiceError(503, 'Cloudinary is not configured. Set CLOUDINARY_URL on the server.')
    return cloudinary

def save(path, *, avatar=False):
    sdk = client()
    public_id = 'coursecoach/' + ('avatars/' if avatar else 'documents/') + path.name
    try:
        result = sdk.uploader.upload(str(path), public_id=public_id,
            resource_type='image' if avatar else 'raw',
            type='upload' if avatar else 'private', overwrite=False, timeout=60)
        return (result['secure_url'], result['public_id']) if avatar else PREFIX + result['public_id']
    except Exception as exc:
        # Do not expose provider errors/credentials in HTTP responses.
        raise ServiceError(502, 'Cloud storage upload failed. Please retry.') from exc

def remove(reference):
    try:
        client().uploader.destroy(reference[len(PREFIX):], resource_type='raw', type='private', timeout=30)
    except Exception:
        log.error('Cloudinary rollback cleanup failed; reconcile orphaned assets in the dashboard.')

def download_url(reference):
    return client().utils.private_download_url(reference[len(PREFIX):], None,
        resource_type='raw', type='private', expires_at=int(time.time()) + 60,
        attachment=True, secure=True)


def remove_avatar(public_id):
    try:
        client().uploader.destroy(public_id, resource_type='image', type='upload', invalidate=True, timeout=30)
    except Exception:
        log.error('Cloudinary avatar cleanup failed; reconcile orphaned assets in the dashboard.')

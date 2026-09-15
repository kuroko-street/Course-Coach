import asyncio
import io
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch
from urllib.parse import urlparse, parse_qs

from fastapi import UploadFile
from starlette.datastructures import Headers
from PIL import Image
from pypdf import PdfWriter
from domain.errors import ServiceError
from services import cloud_storage
from services.summary_file_service import SummaryFileService
from services.user_service import UserService


class CloudStorageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.conn = Mock()
        self.service = SummaryFileService(self.temp.name, lambda: self.conn)

    def test_old_local_file_still_downloads(self):
        path = Path(self.temp.name) / 'old.pdf'
        path.write_bytes(b'old file')
        self.service.files.find = Mock(return_value=dict(status='ACTIVE', stored_path=str(path), filename='old.pdf', mime_type='application/pdf'))
        self.assertEqual(self.service.get_download(1)[0], path)

    def test_hidden_cloud_file_never_gets_signed_url(self):
        self.service.files.find = Mock(return_value=dict(status='HIDDEN', stored_path='cloudinary://secret.pdf'))
        with patch.object(cloud_storage, 'download_url') as sign:
            with self.assertRaises(ServiceError): self.service.get_download(1)
            sign.assert_not_called()

    def test_cloud_file_gets_signed_download(self):
        self.service.files.find = Mock(return_value=dict(status='ACTIVE', stored_path='cloudinary://coursecoach/documents/a.pdf', filename='notes.pdf', mime_type='application/pdf'))
        with patch.object(cloud_storage, 'download_url', return_value='https://example.invalid/signed') as sign:
            self.assertEqual(self.service.get_download(1)[1], 'notes.pdf')
            sign.assert_called_once()

    def test_sdk_signs_raw_file_with_expiration(self):
        import cloudinary
        with patch.object(cloudinary, 'config', wraps=cloudinary.config):
            cloudinary.config(cloud_name='test-only', api_key='test-key', api_secret='test-secret')
            with patch.object(cloud_storage.time, 'time', return_value=1000):
                url = cloud_storage.download_url('cloudinary://coursecoach/documents/test.pdf')
            query = parse_qs(urlparse(url).query)
            self.assertEqual(query['public_id'], ['coursecoach/documents/test.pdf'])
            self.assertEqual(query['expires_at'], ['1060'])
            self.assertEqual(query['type'], ['private'])
            self.assertIn('signature', query)
            self.assertNotIn('test-secret', url)

    def test_upload_is_private_and_never_uses_original_filename(self):
        sdk = Mock()
        sdk.uploader.upload.return_value = {'public_id': 'coursecoach/documents/random.pdf'}
        with patch.object(cloud_storage, 'client', return_value=sdk):
            result = cloud_storage.save(Path(self.temp.name) / 'random.pdf')
        self.assertTrue(result.startswith(cloud_storage.PREFIX))
        self.assertEqual(sdk.uploader.upload.call_args.kwargs['type'], 'private')
        self.assertEqual(sdk.uploader.upload.call_args.kwargs['resource_type'], 'raw')

    def run_upload(self, *, commit_error=False, oversized=False):
        pdf = PdfWriter(); pdf.add_blank_page(width=72, height=72)
        stream = io.BytesIO(); pdf.write(stream)
        upload = UploadFile(filename='notes.pdf', file=io.BytesIO(b'x' * 10_000_001 if oversized else stream.getvalue()))
        cursor = Mock()
        cursor.fetchone.side_effect = [None, {'upload_batch_id': 1}, {'file_id': 1}]
        context = Mock(); context.__enter__ = Mock(return_value=cursor); context.__exit__ = Mock(return_value=False)
        self.service.quotas = Mock(); self.service.audit = Mock()
        if commit_error: self.conn.commit.side_effect = RuntimeError('DB commit failed')
        with patch('services.summary_file_service.dict_cursor', return_value=context), patch('services.summary_file_service.ReviewRepository') as repo, patch.object(cloud_storage, 'enabled', return_value=True), patch.object(cloud_storage, 'save', return_value='cloudinary://coursecoach/documents/test.pdf') as save, patch.object(cloud_storage, 'remove') as remove:
            repo.return_value.course_exists.return_value = True
            if commit_error or oversized:
                with self.assertRaises(RuntimeError if commit_error else ServiceError):
                    asyncio.run(self.service.upload(1, {'user_id': 1}, [upload]))
                self.conn.rollback.assert_called_once()
            else:
                asyncio.run(self.service.upload(1, {'user_id': 1}, [upload]))
                self.conn.commit.assert_called_once()
            self.assertEqual(list(Path(self.temp.name).iterdir()), [])
            if oversized: save.assert_not_called()
            elif commit_error: remove.assert_called_once_with('cloudinary://coursecoach/documents/test.pdf')
            else: remove.assert_not_called()

    def test_success_removes_local_temporary_file(self): self.run_upload()
    def test_database_failure_removes_remote_file(self): self.run_upload(commit_error=True)
    def test_rejects_over_10mb_before_cloud_upload(self): self.run_upload(oversized=True)

    def avatar_upload(self, data):
        return UploadFile(filename='avatar.png', file=io.BytesIO(data), headers=Headers({'content-type': 'image/png'}))

    def test_avatar_rejects_disguised_non_image(self):
        service = UserService(connection_factory=lambda: self.conn, avatars_dir=self.temp.name)
        with patch.object(cloud_storage, 'save') as save:
            with self.assertRaises(ServiceError):
                asyncio.run(service.upload_avatar({'user_id': 1}, self.avatar_upload(b'not png')))
            save.assert_not_called()

    def test_cloud_avatar_stores_url_and_removes_temporary_file(self):
        service = UserService(connection_factory=lambda: self.conn, avatars_dir=self.temp.name)
        service.users = Mock()
        stream = io.BytesIO(); Image.new('RGB', (2, 2)).save(stream, format='PNG')
        with patch.object(cloud_storage, 'enabled', return_value=True), patch.object(cloud_storage, 'save', return_value=('https://res.cloudinary.com/test/image/upload/avatar.png', 'coursecoach/avatars/test')):
            asyncio.run(service.upload_avatar({'user_id': 1}, self.avatar_upload(stream.getvalue())))
        self.assertEqual(service.users.update_avatar_url.call_args.args[2], 'https://res.cloudinary.com/test/image/upload/avatar.png')
        self.assertEqual(list((Path(self.temp.name) / '1').iterdir()), [])

    def test_avatar_db_failure_keeps_previous_local_avatar(self):
        service = UserService(connection_factory=lambda: self.conn, avatars_dir=self.temp.name)
        service.users = Mock(); self.conn.commit.side_effect = RuntimeError('commit failed')
        previous = Path(self.temp.name) / '1' / 'old.png'; previous.parent.mkdir(); previous.write_bytes(b'old')
        stream = io.BytesIO(); Image.new('RGB', (2, 2)).save(stream, format='PNG')
        with patch.object(cloud_storage, 'enabled', return_value=True), patch.object(cloud_storage, 'save', return_value=('https://example.invalid/avatar.png', 'coursecoach/avatars/new')), patch.object(cloud_storage, 'remove_avatar') as remove:
            with self.assertRaises(RuntimeError):
                asyncio.run(service.upload_avatar({'user_id': 1}, self.avatar_upload(stream.getvalue())))
            remove.assert_called_once_with('coursecoach/avatars/new')
        self.assertEqual(previous.read_bytes(), b'old')


if __name__ == '__main__':
    unittest.main()

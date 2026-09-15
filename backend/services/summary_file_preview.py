"""Create a small PNG preview without exposing the original private file URL."""
from io import BytesIO
import os
from pathlib import Path
import shutil
import subprocess
from tempfile import TemporaryDirectory
from urllib.request import urlopen

from PIL import Image, ImageOps

from domain.errors import ServiceError


def preview_png(source, mime_type):
    if mime_type not in ('application/pdf', 'image/jpeg', 'image/png'):
        raise ServiceError(415, 'ไฟล์ประเภทนี้ไม่มีภาพตัวอย่าง')
    try:
        if isinstance(source, Path):
            data = source.read_bytes()
        else:
            # Cloud storage supplies a short-lived signed URL. Keep it on the server.
            with urlopen(source, timeout=10) as response:
                data = response.read(10_000_001)
        if len(data) > 10_000_000:
            raise ServiceError(413, 'ไฟล์ใหญ่เกินขนาดที่รองรับการพรีวิว')
        if mime_type == 'application/pdf':
            renderer = os.getenv('PDF_RENDERER') or shutil.which('pdftoppm')
            if not renderer:
                raise ServiceError(503, 'ตัวเรนเดอร์ PDF ยังไม่พร้อม')
            with TemporaryDirectory() as directory:
                pdf = Path(directory) / 'source.pdf'
                output = Path(directory) / 'page'
                pdf.write_bytes(data)
                subprocess.run([renderer, '-f', '1', '-l', '1', '-singlefile',
                                '-scale-to', '900', '-png', str(pdf), str(output)],
                               check=True, timeout=15, capture_output=True)
                return output.with_suffix('.png').read_bytes()
        with Image.open(BytesIO(data)) as original:
            image = ImageOps.exif_transpose(original)
            image.thumbnail((700, 900))
            output = BytesIO()
            image.convert('RGB').save(output, format='PNG', optimize=True)
            return output.getvalue()
    except ServiceError:
        raise
    except Exception as exc:
        raise ServiceError(422, 'สร้างภาพตัวอย่างของไฟล์นี้ไม่ได้') from exc

import React, { useState, useEffect } from 'react';

const ALLOWED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.doc', '.ptff'];
const MAX_FILES = 3;

export default function ReviewAttachments({ reviewId, currentUserId, isAuthor }) {
  const [files, setFiles] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [isOpenModal, setIsOpenModal] = useState(false);

  const fetchFiles = async () => {
    try {
      const res = await fetch(`/api/reviews/${reviewId}/files`);
      if (res.ok) {
        const data = await res.json();
        setFiles(data);
      }
    } catch (err) {
      console.error("Failed to load files", err);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, [reviewId]);

  const handleFileChange = (e) => {
    const fileList = Array.from(e.target.files);
    
    if (fileList.length === 0) {
      setSelectedFiles([]);
      setError('');
      return;
    }

    if (fileList.length > MAX_FILES) {
      setError(`สามารถเลือกอัปโหลดได้สูงสุดไม่เกิน ${MAX_FILES} ไฟล์ต่อครั้ง`);
      setSelectedFiles([]);
      return;
    }

    let invalidError = '';
    for (const file of fileList) {
      const ext = '.' + file.name.split('.').pop().toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        invalidError = `ไฟล์ "${file.name}" ผิดประเภท! (อนุญาตเฉพาะ PDF, PNG, JPG, JPEG, DOC, PTFF)`;
        break;
      }
      if (file.size > 20 * 1024 * 1024) {
        invalidError = `ไฟล์ "${file.name}" มีขนาดเกิน 20MB`;
        break;
      }
    }

    if (invalidError) {
      setError(invalidError);
      setSelectedFiles([]);
    } else {
      setError('');
      setSelectedFiles(fileList);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (selectedFiles.length === 0 || error) return;

    setUploading(true);
    setError('');

    const formData = new FormData();
    selectedFiles.forEach((file) => {
      formData.append('files', file);
    });

    try {
      const res = await fetch(`/api/reviews/${reviewId}/files`, {
        method: 'POST',
        headers: { 'X-User-Id': currentUserId },
        body: formData,
      });

      if (res.ok) {
        setSelectedFiles([]);
        e.target.reset();
        setIsOpenModal(false);
        fetchFiles();
      } else {
        const data = await res.json();
        setError(data.detail || 'เกิดข้อผิดพลาดในการอัปโหลด');
      }
    } catch (err) {
      setError('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้');
    } finally {
      setUploading(false);
    }
  };

  const isButtonDisabled = selectedFiles.length === 0 || !!error || uploading;

  return (
    <div style={{ marginTop: '8px' }}>
      {/* รายการไฟล์แนบที่มีอยู่เดิม */}
      {files.length > 0 && (
        <div style={{ marginBottom: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {files.map((file) => (
            <a 
              key={file.file_id} 
              href={`/api/files/${file.file_id}/download`} 
              download 
              style={{
                fontSize: '0.85em',
                padding: '4px 8px',
                background: '#eef2f5',
                borderRadius: '4px',
                textDecoration: 'none',
                color: '#0066cc',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              📥 {file.filename}
            </a>
          ))}
        </div>
      )}

      {/* ปุ่มสำหรับกดเปิด Pop-up */}
      {isAuthor && (
        <button 
          onClick={() => setIsOpenModal(true)}
          style={{
            padding: '6px 12px',
            fontSize: '0.85em',
            background: '#ffffff',
            border: '1px solid #ccc',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          📎 แนบไฟล์เพิ่มเติม
        </button>
      )}

      {/* หน้าต่าง Pop-up Modal */}
      {isOpenModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(0,0,0,0.4)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '12px',
            padding: '24px',
            width: '420px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            position: 'relative'
          }}>
            {/* ปุ่มปิด Pop-up */}
            <button 
              onClick={() => { setIsOpenModal(false); setError(''); setSelectedFiles([]); }}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                border: 'none',
                background: 'transparent',
                fontSize: '18px',
                cursor: 'pointer',
                color: '#666'
              }}
            >
              ✕
            </button>

            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.2em' }}>แนบไฟล์เอกสาร/รูปภาพ</h3>

            <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input 
                type="file" 
                multiple 
                accept=".pdf,.png,.jpg,.jpeg,.doc,.ptff"
                onChange={handleFileChange} 
              />
              
              <span style={{ fontSize: '0.8em', color: '#666' }}>
                * อัปโหลดได้สูงสุด 3 ไฟล์ (รองรับ PDF, PNG, JPG, JPEG, DOC, PTFF)
              </span>

              {/* กรอบข้อความเตือนเมื่ออัปโหลดผิดประเภท */}
              {error && (
                <div style={{
                  padding: '10px 12px',
                  background: '#fde8e8',
                  border: '1px solid #f8b4b4',
                  borderRadius: '6px',
                  color: '#9b1c1c',
                  fontSize: '0.85em',
                  fontWeight: '500'
                }}>
                  ⚠️ {error}
                </div>
              )}

              {/* ปุ่มกดส่งรีวิว/ไฟล์ */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <button 
                  type="button" 
                  onClick={() => { setIsOpenModal(false); setError(''); setSelectedFiles([]); }}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: '1px solid #ccc',
                    background: '#fff',
                    cursor: 'pointer'
                  }}
                >
                  ยกเลิก
                </button>
                <button 
                  type="submit" 
                  disabled={isButtonDisabled} 
                  style={{ 
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: 'none',
                    fontWeight: 'bold',
                    cursor: isButtonDisabled ? 'not-allowed' : 'pointer',
                    backgroundColor: isButtonDisabled ? '#e0e0e0' : '#0066cc',
                    color: isButtonDisabled ? '#888888' : '#ffffff',
                    transition: 'all 0.2s ease-in-out'
                  }}
                >
                  {uploading ? 'กำลังอัปโหลด...' : `อัปโหลดไฟล์ (${selectedFiles.length})`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
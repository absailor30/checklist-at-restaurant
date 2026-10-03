'use client';

import { useEffect, useRef, useState } from 'react';

// Pure getUserMedia capture — no <input type="file">, so there is no OS
// gallery/upload picker to fall back to, only the live camera.
export function CameraCapture({
  onCapture,
  onClose,
  disabled,
}: {
  onCapture: (file: File) => void;
  onClose: () => void;
  disabled?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((stream) => {
        if (!active) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => setError('Could not access the camera. Check camera permission for this site.'));

    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
      onCapture(file);
    }, 'image/jpeg', 0.9);
  };

  return (
    <div className="camera-capture-overlay">
      <div className="camera-capture-box">
        {error ? (
          <p className="lede" style={{ color: 'var(--locked)' }}>{error}</p>
        ) : (
          <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', borderRadius: 8 }} />
        )}
        <div className="btn-row" style={{ marginTop: 12 }}>
          <button type="button" className="btn-primary" disabled={disabled || !!error} onClick={capture}>
            Capture
          </button>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, Upload, Key, RefreshCw, AlertTriangle, CheckCircle } from 'lucide-react';
import jsQR from 'jsqr';
import Modal from './Modal';
import Spinner from './Spinner';

interface QRScannerModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (token: string) => void;
}

export const QRScannerModal: React.FC<QRScannerModalProps> = ({ open, onClose, onSuccess }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'camera' | 'upload' | 'manual'>('camera');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [decoding, setDecoding] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  
  // Manual Input State
  const [manualToken, setManualToken] = useState('');

  // Camera Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Clean up stream on close / change tab
  const stopCamera = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    if (!open) {
      stopCamera();
      setErrorMsg(null);
      setSuccessMsg(null);
      setManualToken('');
    } else if (activeTab === 'camera') {
      void startCamera();
    }
    return () => {
      stopCamera();
    };
  }, [open, activeTab]);

  const extractToken = (text: string): string => {
    try {
      if (text.startsWith('http://') || text.startsWith('https://')) {
        const url = new URL(text);
        const token = url.searchParams.get('token');
        if (token) return token;
      }
    } catch {
      // not a valid URL
    }
    return text.trim();
  };

  const startCamera = async () => {
    stopCamera();
    setErrorMsg(null);
    setCameraLoading(true);
    try {
      const constraints = {
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true'); // required for iOS Safari
        void videoRef.current.play();
        animationFrameRef.current = requestAnimationFrame(tick);
      }
    } catch (err) {
      console.error('Camera access error:', err);
      setErrorMsg(t('scan.cameraAccessError', 'Impossibile accedere alla fotocamera. Verifica i permessi.'));
    } finally {
      setCameraLoading(false);
    }
  };

  const tick = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (video.readyState === video.HAVE_ENOUGH_DATA && ctx) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert',
      });

      if (code && code.data) {
        const token = extractToken(code.data);
        if (token) {
          stopCamera();
          setSuccessMsg(t('scan.uploadSuccess', 'Codice QR rilevato con successo!'));
          setTimeout(() => {
            onSuccess(token);
          }, 1000);
          return;
        }
      }
    }
    animationFrameRef.current = requestAnimationFrame(tick);
  };

  // Handle Drag & Drop / File selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = (file: File) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setDecoding(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (ctx) {
          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, img.width, img.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          setDecoding(false);
          if (code && code.data) {
            const token = extractToken(code.data);
            setSuccessMsg(t('scan.uploadSuccess', 'Codice QR decodificato!'));
            setTimeout(() => {
              onSuccess(token);
            }, 1000);
          } else {
            setErrorMsg(t('scan.invalidQrCode', 'Codice QR non valido o non riconosciuto.'));
          }
        } else {
          setDecoding(false);
          setErrorMsg(t('common.error', 'Si è verificato un errore.'));
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualToken.trim()) {
      onSuccess(manualToken.trim());
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        stopCamera();
        onClose();
      }}
      title={t('scan.scanTitle', 'Scansiona QR Presenze')}
      maxWidth="500px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* Navigation Tabs */}
        <div style={{
          display: 'flex',
          background: 'var(--surface-warm)',
          padding: '4px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-light)'
        }}>
          {(['camera', 'upload', 'manual'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1,
                padding: '8px 12px',
                border: 'none',
                background: activeTab === tab ? 'var(--surface)' : 'transparent',
                color: activeTab === tab ? 'var(--accent)' : 'var(--text-secondary)',
                fontWeight: activeTab === tab ? 700 : 500,
                fontSize: '13px',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                boxShadow: activeTab === tab ? 'var(--shadow-sm)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              {tab === 'camera' && <Camera size={14} />}
              {tab === 'upload' && <Upload size={14} />}
              {tab === 'manual' && <Key size={14} />}
              {tab === 'camera' && t('scan.scanQrCode', 'Fotocamera')}
              {tab === 'upload' && t('scan.uploadQrImage', 'Carica Immagine')}
              {tab === 'manual' && t('scan.enterTokenManually', 'Inserisci Token')}
            </button>
          ))}
        </div>

        {/* Dynamic content wrapper */}
        <div style={{
          minHeight: '260px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          position: 'relative',
          background: 'var(--surface-warm)',
          borderRadius: 'var(--radius-lg)',
          border: '1.5px dashed var(--border)',
          overflow: 'hidden'
        }}>
          
          {/* Status Banners */}
          {errorMsg && (
            <div style={{
              position: 'absolute', top: 12, left: 12, right: 12, zIndex: 10,
              padding: '10px 14px', borderRadius: 8, fontSize: '13px', fontWeight: 600,
              background: 'rgba(220,38,38,0.10)', border: '1px solid rgba(220,38,38,0.30)',
              color: '#dc2626', display: 'flex', alignItems: 'center', gap: '8px'
            }}>
              <AlertTriangle size={15} />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div style={{
              position: 'absolute', top: 12, left: 12, right: 12, zIndex: 10,
              padding: '10px 14px', borderRadius: 8, fontSize: '13px', fontWeight: 600,
              background: 'rgba(22,163,74,0.10)', border: '1px solid rgba(22,163,74,0.30)',
              color: '#16a34a', display: 'flex', alignItems: 'center', gap: '8px'
            }}>
              <CheckCircle size={15} />
              <span>{successMsg}</span>
            </div>
          )}

          {/* TAB 1: Camera Scanner */}
          {activeTab === 'camera' && (
            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              {cameraLoading && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', color: 'var(--text-muted)' }}>
                  <Spinner size="md" color="var(--accent)" />
                  <span style={{ fontSize: '12px' }}>{t('qr.generating', 'Avvio fotocamera...')}</span>
                </div>
              )}
              
              <video
                ref={videoRef}
                style={{
                  width: '100%',
                  height: '280px',
                  objectFit: 'cover',
                  display: cameraLoading || errorMsg ? 'none' : 'block'
                }}
              />
              <canvas ref={canvasRef} style={{ display: 'none' }} />

              {!cameraLoading && !errorMsg && !successMsg && (
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  border: '40px solid rgba(15, 23, 42, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  pointerEvents: 'none'
                }}>
                  {/* Glowing Box */}
                  <div style={{
                    width: '180px',
                    height: '180px',
                    border: '3px solid var(--accent)',
                    borderRadius: '12px',
                    boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.2), inset 0 0 15px rgba(201,151,58,0.3)',
                    position: 'relative'
                  }}>
                    {/* Laser scanning line */}
                    <div style={{
                      position: 'absolute',
                      left: '5%',
                      right: '5%',
                      height: '2px',
                      background: 'var(--accent)',
                      boxShadow: '0 0 8px var(--accent)',
                      animation: 'scan-line 2.5s linear infinite',
                      top: 0
                    }} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Upload Image */}
          {activeTab === 'upload' && (
            <div style={{ width: '100%', padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              {decoding ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', color: 'var(--text-muted)' }}>
                  <Spinner size="md" color="var(--accent)" />
                  <span style={{ fontSize: '13px' }}>{t('scan.imageDecoding', 'Analisi immagine QR...')}</span>
                </div>
              ) : (
                <label style={{
                  width: '100%',
                  height: '160px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '12px',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)'
                }}>
                  <Upload size={32} style={{ color: 'var(--accent)' }} />
                  <span style={{ fontSize: '14px', fontWeight: 600, textAlign: 'center' }}>
                    {t('scan.dragAndDrop', 'Carica un file immagine con il QR Code')}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Format supportati: PNG, JPG, JPEG
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                  />
                </label>
              )}
            </div>
          )}

          {/* TAB 3: Manual Token Input */}
          {activeTab === 'manual' && (
            <form onSubmit={handleManualSubmit} style={{ width: '100%', padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {t('scan.enterTokenManually', 'Token Presenza')}
                </label>
                <input
                  type="text"
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                  placeholder={t('scan.manualTokenPlaceholder', 'Es. a1b2c3d4...')}
                  required
                  style={{
                    height: '42px',
                    padding: '0 12px',
                    borderRadius: '8px',
                    border: '1.5px solid var(--border)',
                    background: 'var(--surface)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    outline: 'none',
                    fontFamily: 'var(--font-body)'
                  }}
                />
              </div>
              <button
                type="submit"
                className="btn btn-primary"
                style={{
                  height: '42px',
                  fontWeight: 700,
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  borderRadius: '8px'
                }}
              >
                <Key size={16} />
                {t('scan.manualSubmit', 'Invia Token')}
              </button>
            </form>
          )}
        </div>

        {/* Scan instructions footer */}
        {activeTab === 'camera' && (
          <p style={{
            fontSize: '12px',
            color: 'var(--text-muted)',
            textAlign: 'center',
            margin: 0,
            lineHeight: 1.5,
            padding: '0 8px'
          }}>
            {t('scan.scanInstructions', 'Inquadra il codice QR del terminale del negozio per registrare la tua presenza.')}
          </p>
        )}
      </div>
    </Modal>
  );
};

export default QRScannerModal;

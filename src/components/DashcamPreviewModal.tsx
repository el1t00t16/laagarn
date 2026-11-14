import React, { useState } from 'react';
import {
  X,
  Download,
  Share2,
  CheckCircle,
  Film,
  Camera,
  HardDrive,
  Clock,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { formatDurationSec } from '../utils/stravaRecorder';
import { CapturedMediaKind } from '../hooks/useCameraRecorder';

interface DashcamPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoUrl: string | null;
  videoSize: number;
  durationSeconds: number;
  mode: 'normal' | 'timelapse';
  mediaKind?: CapturedMediaKind;
  mimeType?: string;
  onSaveToDevice: () => void;
  onShareToPhotos: () => Promise<boolean>;
  onDiscard?: () => void;
  theme?: 'dark' | 'amoled' | 'light';
}

export const DashcamPreviewModal: React.FC<DashcamPreviewModalProps> = ({
  isOpen,
  onClose,
  videoUrl,
  videoSize,
  durationSeconds,
  mode,
  mediaKind = 'video',
  mimeType = 'video/mp4',
  onSaveToDevice,
  onShareToPhotos,
  onDiscard,
  theme = 'dark',
}) => {
  const [shared, setShared] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [sharingInProgress, setSharingInProgress] = useState(false);

  if (!isOpen || !videoUrl) return null;

  const isDark = theme !== 'light';
  const isPhoto = mediaKind === 'photo' || mimeType.startsWith('image/');
  const sizeLabel =
    videoSize >= 1024 * 1024
      ? `${(videoSize / (1024 * 1024)).toFixed(1)} MB`
      : `${Math.max(1, Math.round(videoSize / 1024))} KB`;

  const handleShare = async () => {
    setSharingInProgress(true);
    try {
      const ok = await onShareToPhotos();
      if (ok) {
        setShared(true);
        setTimeout(() => setShared(false), 4000);
      }
    } finally {
      setSharingInProgress(false);
    }
  };

  const handleDownload = () => {
    onSaveToDevice();
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 4000);
  };

  return (
    <div className="fixed inset-0 z-[1300] flex items-end sm:items-center justify-center sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="cockpit-shell w-full max-w-md rounded-t-3xl sm:rounded-3xl border-t sm:border p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:p-5 relative flex flex-col max-h-[92dvh] overflow-y-auto transition-all text-[var(--ink)]">
        {/* Mobile sheet drag pill */}
        <div className="w-10 h-1 rounded-full bg-purple-400/35 mx-auto mb-3 sm:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-[var(--surface-pill)] border border-[var(--border)] flex items-center justify-center text-[var(--accent-light)]">
              {isPhoto ? <Camera className="w-5 h-5" /> : <Film className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight leading-tight">
                {isPhoto
                  ? 'GPS Stamped Photo'
                  : mode === 'timelapse'
                  ? 'Highway Timelapse'
                  : 'Dashcam Video'}
              </h2>
              <div className="text-[10px] mono uppercase font-bold text-[var(--accent-light)]">
                Ready to Save or Share
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {onDiscard && (
              <button
                type="button"
                onClick={() => {
                  onDiscard();
                  onClose();
                }}
                className="p-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 active:scale-95 transition-all cursor-pointer"
                title="Discard Media"
                aria-label="Discard Media"
              >
                <Trash2 className="w-4.5 h-4.5" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2.5 rounded-xl bg-[var(--surface-pill)] hover:opacity-80 active:scale-95 transition-all cursor-pointer text-[var(--ink)]"
              title="Close Preview"
              aria-label="Close Preview"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Adaptive Portrait / Landscape Media Preview Container */}
        <div className="my-3.5 relative rounded-2xl overflow-hidden bg-black max-h-[50dvh] min-h-[210px] flex items-center justify-center border border-[var(--border)] shadow-inner">
          {isPhoto ? (
            <img
              src={videoUrl}
              alt="GPS Watermarked Snapshot"
              className="max-h-[50dvh] w-auto max-w-full object-contain"
            />
          ) : (
            <video
              src={videoUrl}
              controls
              autoPlay
              playsInline
              loop
              className="max-h-[50dvh] w-auto max-w-full object-contain"
            />
          )}
        </div>

        {/* Metadata Badges */}
        <div className="grid grid-cols-3 gap-2 mb-3.5">
          <div className="cockpit-subcard p-2.5 text-center">
            <div className="text-[9.5px] mono text-[var(--ink-dim)] uppercase flex items-center justify-center gap-1">
              <Clock className="w-3 h-3 text-[var(--accent)]" /> {isPhoto ? 'Type' : 'Duration'}
            </div>
            <div className="text-xs font-bold mt-0.5 mono">
              {isPhoto ? 'SNAPSHOT' : formatDurationSec(durationSeconds)}
            </div>
          </div>

          <div className="cockpit-subcard p-2.5 text-center">
            <div className="text-[9.5px] mono text-[var(--ink-dim)] uppercase flex items-center justify-center gap-1">
              <HardDrive className="w-3 h-3 text-[var(--accent)]" /> Size
            </div>
            <div className="text-xs font-bold mt-0.5 mono">{sizeLabel}</div>
          </div>

          <div className="cockpit-subcard p-2.5 text-center">
            <div className="text-[9.5px] mono text-[var(--ink-dim)] uppercase flex items-center justify-center gap-1">
              <Sparkles className="w-3 h-3 text-[var(--accent)]" /> Format
            </div>
            <div className="text-xs font-bold mt-0.5 uppercase mono text-[var(--accent-light)] truncate">
              {isPhoto ? 'JPEG HD' : mimeType.toLowerCase().includes('mp4') ? 'MP4' : 'WEBM'}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2">
          <button
            type="button"
            disabled={sharingInProgress}
            onClick={handleShare}
            className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-[#a855f7] via-[#9333ea] to-[#7c3aed] hover:brightness-110 active:scale-[0.98] text-white text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-purple-600/30 transition-all cursor-pointer"
          >
            {shared ? (
              <>
                <CheckCircle className="w-5 h-5 text-emerald-300" /> Saved / Shared!
              </>
            ) : (
              <>
                <Share2 className="w-5 h-5" />
                <span>{isPhoto ? 'Save Photo / Share' : 'Save Video to Photos / Share'}</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleDownload}
            className={`w-full py-3 px-4 rounded-2xl border text-center text-xs font-bold flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all cursor-pointer ${
              isDark
                ? 'border-purple-500/30 hover:bg-white/5 text-purple-200'
                : 'border-purple-200 hover:bg-purple-50 text-purple-900'
            }`}
          >
            {downloaded ? (
              <>
                <CheckCircle className="w-4 h-4 text-emerald-400" /> Downloaded to Device!
              </>
            ) : (
              <>
                <Download className="w-4 h-4" /> Download File Directly
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

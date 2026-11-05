import React, { useState } from 'react';
import {
  X,
  Play,
  Download,
  Share2,
  CheckCircle,
  Film,
  HardDrive,
  Clock,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { formatDurationSec } from '../utils/stravaRecorder';

interface DashcamPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoUrl: string | null;
  videoSize: number;
  durationSeconds: number;
  mode: 'normal' | 'timelapse';
  mimeType?: string;
  onSaveToDevice: () => void;
  onShareToPhotos: () => Promise<boolean>;
  theme?: 'dark' | 'amoled' | 'light';
}

export const DashcamPreviewModal: React.FC<DashcamPreviewModalProps> = ({
  isOpen,
  onClose,
  videoUrl,
  videoSize,
  durationSeconds,
  mode,
  mimeType = 'video/mp4',
  onSaveToDevice,
  onShareToPhotos,
  theme = 'dark',
}) => {
  const [shared, setShared] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [sharingInProgress, setSharingInProgress] = useState(false);

  if (!isOpen || !videoUrl) return null;

  const isDark = theme !== 'light';
  const sizeMb = (videoSize / (1024 * 1024)).toFixed(1);

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
    <div className="fixed inset-0 z-[1300] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div
        className={`w-full max-w-lg rounded-3xl border p-4 sm:p-5 shadow-2xl relative flex flex-col max-h-[92vh] overflow-y-auto transition-all ${
          isDark
            ? 'bg-[#120824] border-purple-500/40 text-white shadow-purple-950/40'
            : 'bg-white border-purple-200 text-gray-900 shadow-purple-950/20'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-purple-500/20">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#a855f7]/20 border border-[#a855f7]/40 flex items-center justify-center text-[#c084fc]">
              <Film className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight leading-tight">
                {mode === 'timelapse' ? 'Highway Timelapse' : 'Dashcam Video'}
              </h2>
              <div className="text-[10px] mono uppercase font-bold text-purple-400">
                Preview & Export Recording
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 transition-all cursor-pointer"
            title="Close Preview"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Video Player Container */}
        <div className="my-3.5 relative rounded-2xl overflow-hidden bg-black aspect-video flex items-center justify-center border border-purple-500/30 shadow-inner">
          <video
            src={videoUrl}
            controls
            autoPlay
            playsInline
            loop
            className="w-full h-full object-contain"
          />
        </div>

        {/* Metadata Badges */}
        <div className="grid grid-cols-3 gap-2 mb-3.5">
          <div
            className={`p-2.5 rounded-xl border text-center ${
              isDark ? 'bg-purple-950/30 border-purple-500/20' : 'bg-purple-50 border-purple-200/60'
            }`}
          >
            <div className="text-[10px] mono opacity-70 uppercase flex items-center justify-center gap-1">
              <Clock className="w-3 h-3 text-purple-400" /> Duration
            </div>
            <div className="text-sm font-black mt-0.5 mono">
              {formatDurationSec(durationSeconds)}
            </div>
          </div>

          <div
            className={`p-2.5 rounded-xl border text-center ${
              isDark ? 'bg-purple-950/30 border-purple-500/20' : 'bg-purple-50 border-purple-200/60'
            }`}
          >
            <div className="text-[10px] mono opacity-70 uppercase flex items-center justify-center gap-1">
              <HardDrive className="w-3 h-3 text-purple-400" /> Size
            </div>
            <div className="text-sm font-black mt-0.5 mono">{sizeMb} MB</div>
          </div>

          <div
            className={`p-2.5 rounded-xl border text-center ${
              isDark ? 'bg-purple-950/30 border-purple-500/20' : 'bg-purple-50 border-purple-200/60'
            }`}
          >
            <div className="text-[10px] mono opacity-70 uppercase flex items-center justify-center gap-1">
              <Sparkles className="w-3 h-3 text-purple-400" /> Format
            </div>
            <div className="text-xs font-black mt-0.5 uppercase mono text-[#c084fc] truncate">
              {mimeType.toLowerCase().includes('mp4') ? 'MP4 (Photos Ready)' : 'WEBM'}
            </div>
          </div>
        </div>

        {/* Action Buttons: Native Share / Save to Photos & File Download */}
        <div className="space-y-2">
          {/* Primary Action: Save to Photos via Native Share Sheet */}
          <button
            type="button"
            disabled={sharingInProgress}
            onClick={handleShare}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#a855f7] via-[#9333ea] to-[#7c3aed] hover:brightness-110 active:scale-[0.98] text-white font-bold flex items-center justify-center gap-2 shadow-lg shadow-purple-600/30 transition-all cursor-pointer"
          >
            {shared ? (
              <>
                <CheckCircle className="w-5 h-5 text-emerald-300" /> Shared Successfully!
              </>
            ) : (
              <>
                <Share2 className="w-5 h-5" />
                <span>Save to Photos / Share Sheet</span>
              </>
            )}
          </button>

          {/* Secondary Action: Direct File Download to phone storage */}
          <button
            type="button"
            onClick={handleDownload}
            className={`w-full py-2.5 px-4 rounded-xl border text-center text-xs font-bold flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all cursor-pointer ${
              isDark
                ? 'border-purple-500/30 hover:bg-white/5 text-purple-200'
                : 'border-purple-200 hover:bg-purple-50 text-purple-900'
            }`}
          >
            {downloaded ? (
              <>
                <CheckCircle className="w-4 h-4 text-emerald-400" /> Saved to Downloads Folder!
              </>
            ) : (
              <>
                <Download className="w-4 h-4" /> Download to Device Files
              </>
            )}
          </button>
        </div>

        {/* Helpful OS Guide Note */}
        <div
          className={`mt-3 p-2.5 rounded-xl border text-[11px] leading-relaxed ${
            isDark
              ? 'bg-black/40 border-purple-500/20 text-gray-300'
              : 'bg-gray-50 border-gray-200 text-gray-600'
          }`}
        >
          <div className="font-bold text-[#c084fc] mb-0.5 flex items-center gap-1">
            📱 Where to find on your phone:
          </div>
          <ul className="list-disc list-inside space-y-0.5 opacity-90">
            <li>
              <strong>iPhone:</strong> Tap <em>Save to Photos</em> above ➔ select <em>Save Video</em>, or check the <strong>Files</strong> app under <em>Downloads</em>.
            </li>
            <li>
              <strong>Android:</strong> Check your <strong>Downloads</strong> folder or Gallery.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

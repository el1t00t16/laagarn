import React, { useState } from 'react';
import { OFFLINE_REGION_PACKS, OfflineRegionPack } from '../utils/travelData';
import { TileCacheStats } from '../utils/tileCacheStorage';

interface OfflineCachePanelProps {
  stats: TileCacheStats;
  isOfflineMode: boolean;
  onToggleOfflineMode: () => void;
  onDownloadRegionPack: (
    pack: OfflineRegionPack,
    onProgress: (done: number, total: number) => void
  ) => Promise<void>;
  onCacheActiveRouteCorridor: (
    onProgress: (done: number, total: number) => void
  ) => Promise<void>;
  onClearCache: () => Promise<void>;
  onFocusCoordinate: (lat: number, lng: number, zoom?: number) => void;
  hasActiveRoute: boolean;
}

export const OfflineCachePanel: React.FC<OfflineCachePanelProps> = ({
  stats,
  isOfflineMode,
  onToggleOfflineMode,
  onDownloadRegionPack,
  onCacheActiveRouteCorridor,
  onClearCache,
  onFocusCoordinate,
  hasActiveRoute,
}) => {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [progressState, setProgressState] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const formattedMb = (stats.totalBytes / (1024 * 1024)).toFixed(2);

  const handlePackDownload = async (pack: OfflineRegionPack) => {
    setDownloadingId(pack.id);
    setStatusMessage(null);
    setProgressState({ done: 0, total: 1 });
    await onDownloadRegionPack(pack, (done, total) => {
      setProgressState({ done, total });
    });
    setDownloadingId(null);
    setProgressState(null);
    setStatusMessage(`Archived "${pack.name}" cartography to IndexedDB.`);
    onFocusCoordinate(pack.center.lat, pack.center.lng, 11);
  };

  const handleCacheCorridor = async () => {
    setDownloadingId('active-corridor');
    setStatusMessage(null);
    setProgressState({ done: 0, total: 1 });
    await onCacheActiveRouteCorridor((done, total) => {
      setProgressState({ done, total });
    });
    setDownloadingId(null);
    setProgressState(null);
    setStatusMessage('Active Philippine corridor tiles archived for offline use.');
  };

  const handlePurge = async () => {
    await onClearCache();
    setStatusMessage('Purged all cached map tiles from IndexedDB storage.');
  };

  return (
    <div className="flex flex-col gap-10 min-h-full">
      <div>
        <div className="flex items-center justify-between mb-4">
          <span className="section-label mono !mb-0">
            I. Cartographic Archive
          </span>
          <button
            type="button"
            onClick={onToggleOfflineMode}
            aria-pressed={isOfflineMode}
            className={`plot-btn ${isOfflineMode ? 'active' : ''}`}
          >
            {isOfflineMode ? 'Offline Mode On' : 'Online (Auto-Cache)'}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 p-4 bg-[var(--surface)] backdrop-blur-md border border-[var(--border)] rounded-xl shadow-sm">
          <div>
            <div className="route-meta mono">Archived Tiles</div>
            <div
              data-testid="cached-tile-count"
              className="text-2xl display font-extrabold text-[var(--ink)] mt-1"
            >
              {stats.tileCount}
            </div>
          </div>
          <div>
            <div className="route-meta mono">IndexedDB Volume</div>
            <div className="text-2xl display font-extrabold text-[var(--accent)] mt-1">
              {formattedMb} MB
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            disabled={downloadingId !== null || !hasActiveRoute}
            onClick={handleCacheCorridor}
            className="btn-primary display !mt-0 flex-1"
          >
            {downloadingId === 'active-corridor'
              ? 'Archiving Route...'
              : hasActiveRoute
              ? 'Cache Active Route'
              : 'Plot Route to Cache'}
          </button>
          <button
            type="button"
            onClick={handlePurge}
            disabled={stats.tileCount === 0 || downloadingId !== null}
            aria-label="Purge cached map tiles"
            className="plot-btn !py-4 !px-4 disabled:opacity-40"
          >
            Purge
          </button>
        </div>

        {progressState && (
          <div className="mt-4">
            <div className="flex items-center justify-between route-meta mono mb-1">
              <span>WRITING TILES TO INDEXEDDB...</span>
              <span>
                {progressState.done} / {progressState.total}
              </span>
            </div>
            <div className="w-full h-1 bg-purple-950/40 rounded-full overflow-hidden border border-purple-500/20">
              <div
                className="h-full bg-gradient-to-r from-[#a855f7] to-[#c084fc] transition-transform duration-150 origin-left"
                style={{
                  transform: `scaleX(${
                    progressState.total > 0
                      ? progressState.done / progressState.total
                      : 0
                  })`,
                }}
              />
            </div>
          </div>
        )}

        {statusMessage && (
          <div
            role="status"
            className="mt-4 p-3 bg-[#110820]/90 backdrop-blur-md border border-purple-500/30 rounded-xl route-meta mono !text-[#f8f6fc]"
          >
            {statusMessage}
          </div>
        )}
      </div>

      <div>
        <span className="section-label mono">
          II. Philippine Regional Folios
        </span>
        <div>
          {OFFLINE_REGION_PACKS.map((pack) => {
            const isDownloaded = stats.downloadedPacks.includes(pack.id);
            const isBusy = downloadingId === pack.id;

            return (
              <div
                key={pack.id}
                className={`route-card cursor-default ${
                  isDownloaded ? 'active' : ''
                }`}
              >
                <div className="route-card-header">
                  <span className="route-title">{pack.name}</span>
                  <span className="route-time mono">~{pack.estimatedSizeMb} MB</span>
                </div>
                <div className="route-meta mono">{pack.subtitle}</div>

                <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-[var(--border-subtle)]">
                  <button
                    type="button"
                    onClick={() =>
                      onFocusCoordinate(pack.center.lat, pack.center.lng, 11)
                    }
                    className="mono text-[0.62rem] uppercase text-[var(--ink-dim)] hover:text-[var(--accent)] underline cursor-pointer font-bold"
                  >
                    Preview Region
                  </button>

                  <button
                    type="button"
                    disabled={downloadingId !== null}
                    onClick={() => handlePackDownload(pack)}
                    className={`plot-btn ${isDownloaded ? 'active' : ''}`}
                  >
                    {isDownloaded
                      ? isBusy
                        ? 'Updating...'
                        : 'Cached · Refresh'
                      : isBusy
                      ? 'Archiving...'
                      : 'Download Pack'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

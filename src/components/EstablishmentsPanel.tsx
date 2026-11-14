import React, { useEffect, useState } from 'react';
import {
  Establishment,
  EstablishmentCategory,
  ESTABLISHMENT_CATEGORIES,
  searchEstablishments,
} from '../utils/establishmentData';
import { GpsPositionState } from '../utils/gpsAndGeocoding';
import {
  Search,
  X,
  Crosshair,
  MapPin,
  Navigation,
  PlusCircle,
  Fuel,
  Utensils,
  ShoppingBag,
  Store,
  Hospital,
  Pill,
  Landmark,
  Hotel,
  Building2,
  Clock,
  Phone,
  Sparkles,
} from 'lucide-react';

interface EstablishmentsPanelProps {
  gpsState: GpsPositionState | null;
  onLocateUserGps?: () => void;
  onSelectEstablishmentRoute: (establishment: Establishment) => void;
  onFocusEstablishment: (establishment: Establishment) => void;
  onAddEstablishmentStop: (establishment: Establishment) => void;
  selectedEstablishmentId?: string | null;
  theme?: 'dark' | 'amoled' | 'light';
}

const CATEGORY_ICON_MAP: Record<EstablishmentCategory, React.ComponentType<{ className?: string }>> = {
  fuel: Fuel,
  food: Utensils,
  mall: ShoppingBag,
  convenience: Store,
  hospital: Hospital,
  pharmacy: Pill,
  bank: Landmark,
  hotel: Hotel,
  transit: Building2,
  services: Building2,
};

export const EstablishmentsPanel: React.FC<EstablishmentsPanelProps> = ({
  gpsState,
  onLocateUserGps,
  onSelectEstablishmentRoute,
  onFocusEstablishment,
  onAddEstablishmentStop,
  selectedEstablishmentId,
  theme = 'dark',
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<EstablishmentCategory | 'all'>('all');
  const [onlyNearby, setOnlyNearby] = useState<boolean>(true);
  const [radiusKm, setRadiusKm] = useState<number>(25);
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [addedNotice, setAddedNotice] = useState<string | null>(null);

  // Perform search with debounce
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await searchEstablishments(searchQuery, {
          category: selectedCategory,
          nearLat: onlyNearby && gpsState ? gpsState.lat : undefined,
          nearLng: onlyNearby && gpsState ? gpsState.lng : undefined,
          radiusKm: onlyNearby && gpsState ? radiusKm : undefined,
          limit: 35,
        });
        if (!cancelled) {
          setEstablishments(results);
        }
      } catch {
        // Fallback or error handled silently
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, selectedCategory, onlyNearby, radiusKm, gpsState?.lat, gpsState?.lng]);

  const handleClearSearch = () => {
    setSearchQuery('');
  };

  const handleAddStop = (est: Establishment) => {
    onAddEstablishmentStop(est);
    setAddedNotice(`Added "${est.name}" to route stops!`);
    setTimeout(() => setAddedNotice(null), 3000);
  };

  const isLight = theme === 'light';

  return (
    <div className="space-y-3.5 pb-4">
      {/* Search Input Bar */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[var(--accent)]">
          <Search className="w-4 h-4" />
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search Jollibee, Shell, SM Mall, Hospital, ATM..."
          className="w-full min-h-[44px] pl-10 pr-9 py-2.5 rounded-2xl text-sm bg-[var(--surface-subcard,var(--surface-subtle))] border border-[var(--border)] text-[var(--ink)] placeholder-[var(--ink-dim)] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 transition-all"
        />
        {searchQuery.length > 0 && (
          <button
            type="button"
            onClick={handleClearSearch}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-[var(--ink-dim)] hover:text-[var(--ink)] cursor-pointer"
            aria-label="Clear search query"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Category Quick Filter Chips */}
      <div>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            aria-pressed={selectedCategory === 'all'}
            className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold shrink-0 transition-all cursor-pointer flex items-center gap-1.5 border ${
              selectedCategory === 'all'
                ? 'bg-gradient-to-r from-[#a855f7] to-[#7c3aed] border-purple-400/50 text-white shadow-md shadow-purple-500/25'
                : 'cockpit-pill text-[var(--ink-dim)] hover:text-[var(--ink)]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span>All</span>
          </button>

          {ESTABLISHMENT_CATEGORIES.map((cat) => {
            const Icon = CATEGORY_ICON_MAP[cat.id] || Store;
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                aria-pressed={isSelected}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold shrink-0 transition-all cursor-pointer flex items-center gap-1.5 border ${
                  isSelected
                    ? 'border-transparent text-white shadow-md'
                    : 'cockpit-pill text-[var(--ink-dim)] hover:text-[var(--ink)]'
                }`}
                style={{
                  backgroundColor: isSelected ? cat.color : undefined,
                  boxShadow: isSelected ? `0 4px 12px ${cat.color}40` : undefined,
                }}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="whitespace-nowrap">{cat.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Proximity / Location Controls */}
      <div className="p-2.5 cockpit-subcard flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          {gpsState ? (
            <button
              type="button"
              onClick={() => setOnlyNearby((v) => !v)}
              className={`px-2.5 py-1 rounded-lg text-[10px] mono uppercase font-bold flex items-center gap-1 cursor-pointer transition-colors border ${
                onlyNearby
                  ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/40'
                  : 'cockpit-pill text-[var(--ink-dim)]'
              }`}
            >
              <Crosshair className="w-3 h-3 text-emerald-500 shrink-0" />
              <span>{onlyNearby ? 'Near GPS' : 'All PH'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onLocateUserGps}
              className="px-2.5 py-1 rounded-lg text-[10px] mono uppercase font-bold bg-purple-500/15 text-[var(--accent)] border border-purple-500/30 flex items-center gap-1 cursor-pointer hover:bg-purple-500/25"
            >
              <Crosshair className="w-3 h-3 shrink-0" />
              <span>Acquire GPS</span>
            </button>
          )}

          {onlyNearby && gpsState && (
            <div className="flex items-center gap-1">
              {[10, 25, 50].map((dist) => (
                <button
                  key={dist}
                  type="button"
                  onClick={() => setRadiusKm(dist)}
                  className={`px-2 py-0.5 rounded-md text-[10px] mono font-bold cursor-pointer transition-colors tabular-nums ${
                    radiusKm === dist
                      ? 'bg-[var(--accent)] text-white'
                      : 'cockpit-pill text-[var(--ink-dim)]'
                  }`}
                >
                  {dist}km
                </button>
              ))}
            </div>
          )}
        </div>

        <span className="text-[10px] mono text-[var(--ink-dim)] tabular-nums inline-flex items-center gap-1.5">
          {loading && <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-ping" />}
          <span>
            {establishments.length} place{establishments.length === 1 ? '' : 's'}
          </span>
        </span>
      </div>

      {/* Added to route notification toast */}
      {addedNotice && (
        <div className="p-2.5 rounded-2xl bg-purple-500/15 border border-purple-500/35 text-[var(--ink)] text-xs flex items-center gap-2 animate-fadeIn">
          <PlusCircle className="w-4 h-4 text-emerald-500 shrink-0" />
          <span className="font-semibold">{addedNotice}</span>
        </div>
      )}

      {/* Establishments Results List */}
      <div className="space-y-2.5">
        {establishments.length === 0 ? (
          <div className="py-8 px-4 text-center cockpit-subcard border-dashed">
            <Store className="w-8 h-8 mx-auto text-[var(--accent)] opacity-70 mb-2" />
            <div className="text-xs font-bold text-[var(--ink)]">No places matched</div>
            <p className="text-[11px] text-[var(--ink-dim)] mt-1 max-w-xs mx-auto">
              {searchQuery
                ? `No results for "${searchQuery}". Try broader words like "Petron", "Jollibee", "SM", or "Hospital".`
                : 'Try typing a name or tapping a category chip above.'}
            </p>
            {selectedCategory !== 'all' && (
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className="mt-3 px-3 py-1.5 rounded-xl text-[10.5px] mono uppercase font-bold bg-purple-500/15 text-[var(--accent)] border border-purple-500/30 hover:bg-purple-500/25 cursor-pointer"
              >
                Clear Filter
              </button>
            )}
          </div>
        ) : (
          establishments.map((est) => {
            const catMeta = ESTABLISHMENT_CATEGORIES.find((c) => c.id === est.category);
            const Icon = CATEGORY_ICON_MAP[est.category] || Store;
            const isSelected = selectedEstablishmentId === est.id;

            const pillBg = catMeta
              ? isLight
                ? catMeta.bgLight
                : catMeta.bgDark
              : isLight
              ? '#f3e8ff'
              : 'rgba(168,85,247,0.15)';

            const pillColor = catMeta
              ? isLight
                ? catMeta.id === 'fuel'
                  ? '#b45309'
                  : catMeta.id === 'convenience'
                  ? '#0891b2'
                  : catMeta.id === 'bank'
                  ? '#1d4ed8'
                  : catMeta.id === 'pharmacy'
                  ? '#047857'
                  : catMeta.id === 'hotel'
                  ? '#4338ca'
                  : catMeta.color
                : catMeta.color
              : isLight
              ? '#7c3aed'
              : '#c084fc';

            return (
              <div
                key={est.id}
                className={`p-3 rounded-2xl transition-all ${
                  isSelected
                    ? 'cockpit-card border-[var(--accent)] bg-purple-500/12 shadow-lg shadow-purple-500/15'
                    : 'cockpit-subcard hover:border-[var(--accent)]/40'
                }`}
              >
                {/* Top card row: Category Pill & Distance */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="px-2 py-0.5 rounded-md text-[9.5px] mono uppercase font-bold flex items-center gap-1 shrink-0"
                      style={{
                        backgroundColor: pillBg,
                        color: pillColor,
                        border: `1px solid ${catMeta ? catMeta.color : '#a855f7'}40`,
                      }}
                    >
                      <Icon className="w-3 h-3" />
                      <span>{est.categoryLabel || est.category}</span>
                    </span>

                    {est.brand && (
                      <span className="text-[10px] mono text-[var(--ink-dim)] font-medium truncate">
                        &middot; {est.brand}
                      </span>
                    )}
                  </div>

                  {typeof est.distanceKm === 'number' && (
                    <span className="text-[10.5px] mono font-bold text-emerald-500 tabular-nums shrink-0">
                      {est.distanceKm < 1
                        ? `${Math.round(est.distanceKm * 1000)} m`
                        : `${est.distanceKm.toFixed(1)} km`}
                    </span>
                  )}
                </div>

                {/* Establishment Name */}
                <h3 className="text-sm font-bold text-[var(--ink)] mt-1.5 leading-snug">
                  {est.name}
                </h3>

                {/* Address & Region */}
                <div className="flex items-start gap-1 text-[11.5px] text-[var(--ink-dim)] mt-1">
                  <MapPin className="w-3.5 h-3.5 shrink-0 text-[var(--accent)] mt-0.5" />
                  <span className="line-clamp-2">{est.address || est.region}</span>
                </div>

                {/* Hours & Phone & Features */}
                {(est.openingHours || est.phone || (est.features && est.features.length > 0)) && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    {est.openingHours && (
                      <div className="flex items-center gap-1 text-[10px] mono font-semibold text-[var(--ink)] mr-1">
                        <Clock className="w-3 h-3 text-[var(--accent)]" />
                        <span>{est.openingHours}</span>
                      </div>
                    )}

                    {est.phone && (
                      <div className="flex items-center gap-1 text-[10px] mono text-[var(--ink-dim)] mr-1 tabular-nums">
                        <Phone className="w-3 h-3 text-[var(--accent)]" />
                        <span>{est.phone}</span>
                      </div>
                    )}

                    {est.features?.slice(0, 3).map((feat, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 rounded-md text-[9.5px] font-semibold cockpit-pill text-[var(--ink-dim)]"
                      >
                        {feat}
                      </span>
                    ))}
                  </div>
                )}

                {/* Quick Action Buttons */}
                <div className="grid grid-cols-3 gap-2 mt-3 pt-2.5 border-t border-[var(--border-subtle)]">
                  <button
                    type="button"
                    onClick={() => onSelectEstablishmentRoute(est)}
                    className="min-h-[38px] py-1.5 px-2 rounded-xl bg-gradient-to-r from-[#a855f7] to-[#7c3aed] active:scale-95 text-white text-[11px] font-semibold flex items-center justify-center gap-1.5 shadow-sm cursor-pointer transition-all"
                    title="Get turn-by-turn navigation directions to this establishment"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    <span>Route</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onFocusEstablishment(est)}
                    className="min-h-[38px] py-1.5 px-2 rounded-xl cockpit-pill text-[var(--ink)] text-[11px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                    title="Center and view this establishment on the interactive map"
                  >
                    <MapPin className="w-3.5 h-3.5 text-[var(--accent)]" />
                    <span>Map</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAddStop(est)}
                    className="min-h-[38px] py-1.5 px-2 rounded-xl cockpit-pill text-[var(--ink)] text-[11px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                    title="Add as intermediate stop to active route planner"
                  >
                    <PlusCircle className="w-3.5 h-3.5 text-emerald-500" />
                    <span>+ Stop</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

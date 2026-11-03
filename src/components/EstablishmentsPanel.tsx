import React, { useEffect, useMemo, useState } from 'react';
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
  ArrowRight,
} from 'lucide-react';

interface EstablishmentsPanelProps {
  gpsState: GpsPositionState | null;
  onLocateUserGps?: () => void;
  onSelectEstablishmentRoute: (establishment: Establishment) => void;
  onFocusEstablishment: (establishment: Establishment) => void;
  onAddEstablishmentStop: (establishment: Establishment) => void;
  selectedEstablishmentId?: string | null;
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

  return (
    <div className="space-y-4">
      {/* Panel Header */}
      <div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="section-label mb-0">Establishments & Places</span>
            <span className="px-1.5 py-0.5 rounded text-[9px] mono uppercase font-bold bg-purple-500/15 text-[#c084fc] border border-purple-500/30">
              {establishments.length}
            </span>
          </div>
          {loading && (
            <div className="flex items-center gap-1 text-[10px] mono text-purple-400">
              <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping" />
              <span>Searching...</span>
            </div>
          )}
        </div>
        <p className="text-xs text-[var(--ink-dim)] mt-1">
          Explore restaurants, gas stations, malls, 24/7 stores, and hospitals in the Philippines.
        </p>
      </div>

      {/* Search Input Bar */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[var(--accent)]">
          <Search className="w-4 h-4" />
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search Jollibee, Shell, SM Mall, Hospital, ATM..."
          className="w-full pl-9 pr-8 py-2.5 rounded-xl text-xs bg-[var(--surface)] border border-[var(--border)] text-[var(--ink)] placeholder-[var(--ink-dim)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-all"
        />
        {searchQuery.length > 0 && (
          <button
            type="button"
            onClick={handleClearSearch}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-[var(--ink-dim)] hover:text-[var(--ink)] cursor-pointer"
            aria-label="Clear search query"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Category Quick Filter Chips */}
      <div>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 no-scrollbar">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={`px-2.5 py-1.5 rounded-lg text-xs mono uppercase font-bold shrink-0 transition-all cursor-pointer flex items-center gap-1.5 ${
              selectedCategory === 'all'
                ? 'bg-gradient-to-r from-[#a855f7] to-[#7c3aed] text-white shadow-md shadow-purple-500/25'
                : 'bg-[var(--surface)] text-[var(--ink-dim)] border border-[var(--border-subtle)] hover:border-[var(--border)]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
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
                className={`px-2.5 py-1.5 rounded-lg text-xs mono uppercase font-bold shrink-0 transition-all cursor-pointer flex items-center gap-1.5 border ${
                  isSelected
                    ? 'border-transparent text-white shadow-md'
                    : 'bg-[var(--surface)] text-[var(--ink-dim)] border-[var(--border-subtle)] hover:border-[var(--border)]'
                }`}
                style={{
                  backgroundColor: isSelected ? cat.color : undefined,
                  boxShadow: isSelected ? `0 4px 12px ${cat.color}40` : undefined,
                }}
              >
                <span>{cat.emoji}</span>
                <span className="whitespace-nowrap">{cat.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Proximity / Location Controls */}
      <div className="p-2.5 rounded-xl bg-[var(--surface)] border border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          {gpsState ? (
            <button
              type="button"
              onClick={() => setOnlyNearby((v) => !v)}
              className={`px-2 py-1 rounded-md text-[10px] mono uppercase font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                onlyNearby
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-purple-950/30 text-zinc-400 border border-purple-500/20'
              }`}
            >
              <Crosshair className="w-3 h-3 text-emerald-400" />
              <span>{onlyNearby ? 'Near GPS' : 'All PH'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onLocateUserGps}
              className="px-2 py-1 rounded-md text-[10px] mono uppercase font-bold bg-purple-500/15 text-[#c084fc] border border-purple-500/30 flex items-center gap-1 cursor-pointer hover:bg-purple-500/25"
            >
              <Crosshair className="w-3 h-3 text-purple-400" />
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
                  className={`px-1.5 py-0.5 rounded text-[9.5px] mono font-bold cursor-pointer transition-colors ${
                    radiusKm === dist
                      ? 'bg-[var(--accent)] text-white'
                      : 'bg-purple-500/10 text-[var(--ink-dim)] hover:text-white'
                  }`}
                >
                  {dist}km
                </button>
              ))}
            </div>
          )}
        </div>

        <span className="text-[10px] mono text-[var(--ink-dim)]">
          {establishments.length} establishment{establishments.length === 1 ? '' : 's'} found
        </span>
      </div>

      {/* Added to route notification toast */}
      {addedNotice && (
        <div className="p-2.5 rounded-xl bg-purple-500/20 border border-purple-500/40 text-purple-200 text-xs flex items-center gap-2 animate-fadeIn">
          <PlusCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="font-semibold">{addedNotice}</span>
        </div>
      )}

      {/* Establishments Results List */}
      <div className="space-y-2.5 max-h-[calc(100vh-25rem)] overflow-y-auto pr-1">
        {establishments.length === 0 ? (
          <div className="py-8 px-4 text-center rounded-2xl bg-[var(--surface)] border border-dashed border-[var(--border)]">
            <Store className="w-8 h-8 mx-auto text-[var(--accent-light)] opacity-60 mb-2" />
            <div className="text-xs font-bold text-[var(--ink)]">No establishments found</div>
            <p className="text-[11px] text-[var(--ink-dim)] mt-1 max-w-xs mx-auto">
              {searchQuery
                ? `No results for "${searchQuery}". Try broader words like "Petron", "Jollibee", "SM", or "Hospital".`
                : 'Try typing a name or tapping a category chip above.'}
            </p>
            {selectedCategory !== 'all' && (
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className="mt-3 px-3 py-1 rounded-lg text-xs mono uppercase font-bold bg-purple-500/20 text-[#c084fc] hover:bg-purple-500/30 cursor-pointer"
              >
                Clear Category Filter
              </button>
            )}
          </div>
        ) : (
          establishments.map((est) => {
            const catMeta = ESTABLISHMENT_CATEGORIES.find((c) => c.id === est.category);
            const Icon = CATEGORY_ICON_MAP[est.category] || Store;
            const isSelected = selectedEstablishmentId === est.id;

            return (
              <div
                key={est.id}
                className={`p-3 rounded-2xl border transition-all ${
                  isSelected
                    ? 'bg-purple-500/15 border-[var(--accent)] shadow-lg shadow-purple-500/20'
                    : 'bg-[var(--surface)] border-[var(--border-subtle)] hover:border-[var(--border)]'
                }`}
              >
                {/* Top card row: Category Pill & Distance */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="px-2 py-0.5 rounded-md text-[9px] mono uppercase font-bold flex items-center gap-1"
                      style={{
                        backgroundColor: catMeta ? catMeta.bgDark : 'rgba(168,85,247,0.15)',
                        color: catMeta ? catMeta.color : '#c084fc',
                        border: `1px solid ${catMeta ? catMeta.color : '#a855f7'}40`,
                      }}
                    >
                      <Icon className="w-3 h-3" />
                      <span>{est.categoryLabel || est.category}</span>
                    </span>

                    {est.brand && (
                      <span className="text-[9.5px] mono text-[var(--ink-dim)] font-medium">
                        &middot; {est.brand}
                      </span>
                    )}
                  </div>

                  {typeof est.distanceKm === 'number' && (
                    <span className="text-[10px] mono font-bold text-emerald-400">
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
                <div className="flex items-start gap-1 text-[11px] text-[var(--ink-dim)] mt-1">
                  <MapPin className="w-3 h-3 shrink-0 text-purple-400 mt-0.5" />
                  <span className="line-clamp-2">{est.address || est.region}</span>
                </div>

                {/* Hours & Phone & Features */}
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {est.openingHours && (
                    <div className="flex items-center gap-1 text-[10px] mono font-semibold text-purple-300">
                      <Clock className="w-3 h-3 text-purple-400" />
                      <span>{est.openingHours}</span>
                    </div>
                  )}

                  {est.phone && (
                    <div className="flex items-center gap-1 text-[10px] mono text-[var(--ink-dim)]">
                      <Phone className="w-3 h-3 text-purple-400" />
                      <span>{est.phone}</span>
                    </div>
                  )}

                  {est.features?.slice(0, 3).map((feat, idx) => (
                    <span
                      key={idx}
                      className="px-1.5 py-0.2 rounded text-[8.5px] mono bg-purple-500/10 text-purple-200/90 border border-purple-500/20"
                    >
                      {feat}
                    </span>
                  ))}
                </div>

                {/* Quick Action Buttons */}
                <div className="grid grid-cols-3 gap-1.5 mt-3 pt-2.5 border-t border-[var(--border-subtle)]">
                  {/* Route / Directions */}
                  <button
                    type="button"
                    onClick={() => onSelectEstablishmentRoute(est)}
                    className="py-1.5 px-2 rounded-xl bg-gradient-to-r from-[#a855f7] to-[#7c3aed] hover:from-[#c084fc] hover:to-[#a855f7] text-white text-[10.5px] mono uppercase font-bold flex items-center justify-center gap-1 shadow-sm cursor-pointer transition-all"
                    title="Get turn-by-turn navigation directions to this establishment"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    <span>Route</span>
                  </button>

                  {/* Show on Map */}
                  <button
                    type="button"
                    onClick={() => onFocusEstablishment(est)}
                    className="py-1.5 px-2 rounded-xl bg-[var(--surface)] hover:bg-purple-500/15 border border-[var(--border)] text-[var(--ink)] text-[10.5px] mono uppercase font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                    title="Center and view this establishment on the interactive map"
                  >
                    <MapPin className="w-3.5 h-3.5 text-purple-400" />
                    <span>Map</span>
                  </button>

                  {/* Add as Waypoint / Stop */}
                  <button
                    type="button"
                    onClick={() => handleAddStop(est)}
                    className="py-1.5 px-2 rounded-xl bg-[var(--surface)] hover:bg-purple-500/15 border border-[var(--border)] text-[var(--ink)] text-[10.5px] mono uppercase font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                    title="Add as intermediate stop to active route planner"
                  >
                    <PlusCircle className="w-3.5 h-3.5 text-emerald-400" />
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

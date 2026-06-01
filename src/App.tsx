import { useMemo, useState } from 'react';
import { Grid2X2, Home, Maximize2, Ruler, RotateCw } from 'lucide-react';
import { buildLayout, pointsToString } from './geometry';
import type { Point, ReusePair, RoomInput, TileInput, VisibleTile } from './types';

const initialRoom: RoomInput = {
  top: 420,
  right: 320,
  bottom: 420,
  left: 320,
  angleDeg: 90,
};

const initialTile: TileInput = {
  width: 120,
  height: 20,
  groutMm: 3,
  rowOffset: 40,
  rotationDeg: 0,
};

const formatNumber = (value: number, digits = 1) =>
  new Intl.NumberFormat('en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);

function getViewBox(points: Point[]) {
  if (!points.length) return '-50 -50 500 500';
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = Math.max(maxX - minX, 1);
  const height = Math.max(maxY - minY, 1);
  const padding = Math.max(width, height) * 0.12;
  return `${minX - padding} ${minY - padding} ${width + padding * 2} ${height + padding * 2}`;
}

function updateNumber<T extends Record<string, number>>(
  setter: React.Dispatch<React.SetStateAction<T>>,
  key: keyof T,
  value: string,
) {
  const parsed = Number(value);
  setter((current) => ({ ...current, [key]: Number.isFinite(parsed) ? parsed : 0 }));
}

export function App() {
  const [room, setRoom] = useState<RoomInput>(initialRoom);
  const [tile, setTile] = useState<TileInput>(initialTile);
  const [activePairId, setActivePairId] = useState<string | null>(null);
  const layout = useMemo(() => buildLayout(room, tile), [room, tile]);
  const tileById = useMemo(
    () => new Map(layout.tiles.map((visibleTile) => [visibleTile.id, visibleTile])),
    [layout.tiles],
  );
  const allPoints = [...layout.roomPolygon, ...layout.tiles.flatMap((item) => item.tilePolygon)];
  const viewBox = getViewBox(allPoints.length ? allPoints : layout.roomPolygon);
  const clipId = 'room-clip';

  return (
    <main className="app-shell">
      <aside className="control-panel" aria-label="Layout controls">
        <div className="brand-row">
          <div className="brand-mark">
            <Grid2X2 size={22} aria-hidden="true" />
          </div>
          <div>
            <h1>Tile Layout</h1>
            <p>Quadrilateral room planner</p>
          </div>
        </div>

        <section className="panel-section">
          <h2>
            <Home size={18} aria-hidden="true" />
            Room
          </h2>
          <div className="input-grid two">
            <NumberField label="Top side" value={room.top} suffix="cm" onChange={(value) => updateNumber(setRoom, 'top', value)} />
            <NumberField label="Right side" value={room.right} suffix="cm" onChange={(value) => updateNumber(setRoom, 'right', value)} />
            <NumberField label="Bottom side" value={room.bottom} suffix="cm" onChange={(value) => updateNumber(setRoom, 'bottom', value)} />
            <NumberField label="Left side" value={room.left} suffix="cm" onChange={(value) => updateNumber(setRoom, 'left', value)} />
          </div>
          <RangeField
            label="Corner angle"
            value={room.angleDeg}
            min={35}
            max={145}
            step={1}
            suffix="deg"
            onChange={(value) => updateNumber(setRoom, 'angleDeg', value)}
          />
        </section>

        <section className="panel-section">
          <h2>
            <Ruler size={18} aria-hidden="true" />
            Tile
          </h2>
          <div className="input-grid two">
            <NumberField label="Width" value={tile.width} suffix="cm" onChange={(value) => updateNumber(setTile, 'width', value)} />
            <NumberField label="Height" value={tile.height} suffix="cm" onChange={(value) => updateNumber(setTile, 'height', value)} />
            <NumberField label="Grout" value={tile.groutMm} suffix="mm" onChange={(value) => updateNumber(setTile, 'groutMm', value)} />
            <NumberField label="Row offset" value={tile.rowOffset} suffix="cm" onChange={(value) => updateNumber(setTile, 'rowOffset', value)} />
          </div>
          <RangeField
            label="Grid rotation"
            value={tile.rotationDeg}
            min={-90}
            max={90}
            step={1}
            suffix="deg"
            icon={<RotateCw size={16} aria-hidden="true" />}
            onChange={(value) => updateNumber(setTile, 'rotationDeg', value)}
          />
        </section>

        <section className="panel-section">
          <h2>
            <Maximize2 size={18} aria-hidden="true" />
            Estimate
          </h2>
          <div className="stats-grid">
            <Stat label="Room area" value={`${formatNumber(layout.stats.roomArea / 10000, 2)} m²`} />
            <Stat label="Tile area" value={`${formatNumber(layout.stats.tileArea / 10000, 3)} m²`} />
            <Stat label="Full tiles" value={layout.stats.fullTiles.toString()} />
            <Stat label="Cut pieces" value={layout.stats.cutPieces.toString()} />
            <Stat label="Reused offcuts" value={layout.stats.reusedOffcuts.toString()} />
            <Stat label="Buy tiles" value={layout.stats.purchasedTiles.toString()} emphasis />
            <Stat label="Waste" value={`${formatNumber(layout.stats.wastePercent, 1)}%`} />
            <Stat label="Waste area" value={`${formatNumber(layout.stats.wasteArea / 10000, 2)} m²`} />
          </div>
        </section>
      </aside>

      <section className="visualizer" aria-label="Tile layout preview">
        <div className="canvas-toolbar">
          <div>
            <strong>{tile.width} x {tile.height} cm</strong>
            <span>{tile.rowOffset} cm row offset · {tile.groutMm} mm grout · {tile.rotationDeg}deg</span>
          </div>
          <div className="legend" aria-label="Legend">
            <span><i className="legend-full" /> full</span>
            <span><i className="legend-cut" /> cut</span>
            <span><i className="legend-reuse" /> reused pair</span>
            <span><i className="legend-room" /> room</span>
          </div>
        </div>

        <div className="canvas-frame">
          {!layout.isValid && <div className="error-banner">{layout.message}</div>}
          <svg viewBox={viewBox} role="img" aria-label="Scaled floor tile layout">
            <defs>
              <clipPath id={clipId}>
                <polygon points={pointsToString(layout.roomPolygon)} />
              </clipPath>
              <pattern id="minor-grid" width="50" height="50" patternUnits="userSpaceOnUse">
                <path d="M 50 0 L 0 0 0 50" fill="none" stroke="rgba(35, 45, 57, 0.08)" strokeWidth="1" />
              </pattern>
            </defs>
            <rect x="-5000" y="-5000" width="10000" height="10000" fill="url(#minor-grid)" />
            <g clipPath={`url(#${clipId})`}>
              {layout.tiles.map((visibleTile) => (
                <polygon
                  key={visibleTile.id}
                  points={pointsToString(visibleTile.polygon)}
                  className={visibleTile.isFull ? 'tile-full' : 'tile-cut'}
                />
              ))}
            </g>
            <g clipPath={`url(#${clipId})`} className="reuse-pair-layer">
              {layout.reusePairs.map((reusePair) => (
                <ReusePairOverlay
                  key={reusePair.id}
                  active={activePairId === reusePair.id}
                  onActivate={setActivePairId}
                  reusePair={reusePair}
                  sourceTile={tileById.get(reusePair.sourceTileId)}
                  consumerTile={tileById.get(reusePair.consumerTileId)}
                />
              ))}
            </g>
            {layout.tiles.map((visibleTile) => (
              <polygon key={`edge-${visibleTile.id}`} points={pointsToString(visibleTile.tilePolygon)} className="tile-edge" />
            ))}
            <polygon points={pointsToString(layout.roomPolygon)} className="room-outline" />
          </svg>
        </div>
      </section>
    </main>
  );
}

function ReusePairOverlay({
  active,
  consumerTile,
  onActivate,
  reusePair,
  sourceTile,
}: {
  active: boolean;
  consumerTile?: VisibleTile;
  onActivate: (pairId: string | null) => void;
  reusePair: ReusePair;
  sourceTile?: VisibleTile;
}) {
  if (!sourceTile || !consumerTile) return null;
  return (
    <g
      aria-label={`Reusable offcut pair ${reusePair.id}: ${reusePair.reuseKind}`}
      className={active ? 'reuse-pair-interaction reuse-pair-active' : 'reuse-pair-interaction'}
      onBlur={() => onActivate(null)}
      onClick={() => onActivate(reusePair.id)}
      onFocus={() => onActivate(reusePair.id)}
      onMouseEnter={() => onActivate(reusePair.id)}
      onMouseLeave={() => onActivate(null)}
      role="button"
      tabIndex={0}
    >
      <polygon className="reuse-source-overlay" points={pointsToString(sourceTile.polygon)} />
      <polygon className="reuse-consumer-overlay" points={pointsToString(consumerTile.polygon)} />
    </g>
  );
}

type NumberFieldProps = {
  label: string;
  value: number;
  suffix: string;
  onChange: (value: string) => void;
};

function NumberField({ label, value, suffix, onChange }: NumberFieldProps) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="input-shell">
        <input type="number" value={value} min={0} step="any" onChange={(event) => onChange(event.target.value)} />
        <small>{suffix}</small>
      </div>
    </label>
  );
}

type RangeFieldProps = NumberFieldProps & {
  min: number;
  max: number;
  step: number;
  icon?: React.ReactNode;
};

function RangeField({ label, value, suffix, min, max, step, icon, onChange }: RangeFieldProps) {
  return (
    <label className="field range-field">
      <span>{icon}{label}</span>
      <input type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(event.target.value)} />
      <output>{value}{suffix}</output>
    </label>
  );
}

function Stat({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className={emphasis ? 'stat stat-emphasis' : 'stat'}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

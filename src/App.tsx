import { useMemo, useState } from 'react';
import { Check, Copy, Download, Grid2X2, Home, Image as ImageIcon, Maximize2, Ruler, RotateCw, Trash2, Upload, X } from 'lucide-react';
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
  offsetFlipRows: 0,
  rotationDeg: 0,
};

type TileImageFill = {
  dataUrl: string;
  fileName: string;
  orientation: 0 | 90 | 180 | 270;
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

function getRoomMeasurementLabels(roomPoints: Point[], room: RoomInput) {
  const sideLabels = [
    `${formatNumber(room.top, 1)} cm`,
    `${formatNumber(room.right, 1)} cm`,
    `${formatNumber(room.bottom, 1)} cm`,
    `${formatNumber(room.left, 1)} cm`,
  ];
  const center = roomPoints.length ? roomPoints.reduce(
    (acc, point) => ({ x: acc.x + point.x / roomPoints.length, y: acc.y + point.y / roomPoints.length }),
    { x: 0, y: 0 },
  ) : { x: 0, y: 0 };

  return roomPoints.map((point, index) => {
    const next = roomPoints[(index + 1) % roomPoints.length];
    const mid = { x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 };
    const dx = next.x - point.x;
    const dy = next.y - point.y;
    const length = Math.max(Math.hypot(dx, dy), 1);
    const offset = Math.max(length * 0.04, 16);
    const normal = { x: dy / length, y: -dx / length };
    const first = { x: mid.x + normal.x * offset, y: mid.y + normal.y * offset };
    const second = { x: mid.x - normal.x * offset, y: mid.y - normal.y * offset };
    const firstDistance = Math.hypot(first.x - center.x, first.y - center.y);
    const secondDistance = Math.hypot(second.x - center.x, second.y - center.y);
    const position = firstDistance > secondDistance ? first : second;
    let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (angle > 90 || angle < -90) angle += 180;

    return {
      id: `room-measure-${index}`,
      angle,
      label: sideLabels[index],
      x: position.x,
      y: position.y,
    };
  });
}

function updateNumber<T extends Record<string, number>>(
  setter: React.Dispatch<React.SetStateAction<T>>,
  key: keyof T,
  value: string,
) {
  const parsed = Number(value);
  setter((current) => ({ ...current, [key]: Number.isFinite(parsed) ? parsed : 0 }));
}

function escapeAttribute(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function getLocalBounds(points: Point[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    width: Math.max(Math.max(...xs) - Math.min(...xs), 1),
    height: Math.max(Math.max(...ys) - Math.min(...ys), 1),
  };
}

function getImageTransform(tileBounds: ReturnType<typeof getLocalBounds>, orientation: TileImageFill['orientation']) {
  if (orientation === 0) return '';
  return ` transform="${getImageRotateValue(tileBounds, orientation)}"`;
}

function getImageRotateValue(tileBounds: ReturnType<typeof getLocalBounds>, orientation: TileImageFill['orientation']) {
  if (orientation === 0) return undefined;
  const centerX = tileBounds.minX + tileBounds.width / 2;
  const centerY = tileBounds.minY + tileBounds.height / 2;
  return `rotate(${orientation} ${centerX.toFixed(2)} ${centerY.toFixed(2)})`;
}

function getOrientedImageBox(tileBounds: ReturnType<typeof getLocalBounds>, orientation: TileImageFill['orientation']) {
  if (orientation !== 90 && orientation !== 270) return tileBounds;

  const centerX = tileBounds.minX + tileBounds.width / 2;
  const centerY = tileBounds.minY + tileBounds.height / 2;
  return {
    minX: centerX - tileBounds.height / 2,
    minY: centerY - tileBounds.width / 2,
    width: tileBounds.height,
    height: tileBounds.width,
  };
}

function getTileFillClipId(tileId: string) {
  return `tile-fill-clip-${tileId.replaceAll(':', '-')}`;
}

function getRoomCentroid(points: Point[]) {
  if (!points.length) return { x: 0, y: 0 };
  return points.reduce(
    (acc, point) => ({ x: acc.x + point.x / points.length, y: acc.y + point.y / points.length }),
    { x: 0, y: 0 },
  );
}

function buildTileFillClipDefs(layout: ReturnType<typeof buildLayout>) {
  return layout.tiles
    .map(
      (visibleTile) =>
        `<clipPath id="${getTileFillClipId(visibleTile.id)}"><polygon points="${pointsToString(visibleTile.localPolygon)}" /></clipPath>`,
    )
    .join('\n    ');
}

function buildTileImageSvgLayer(layout: ReturnType<typeof buildLayout>, tileFill: TileImageFill | null, rotationDeg: number) {
  if (!tileFill || !layout.tiles.length) return '';

  const origin = getRoomCentroid(layout.roomPolygon);
  const href = escapeAttribute(tileFill.dataUrl);
  const images = layout.tiles
    .map((visibleTile) => {
      const bounds = getLocalBounds(visibleTile.localTilePolygon);
      const imageBox = getOrientedImageBox(bounds, tileFill.orientation);
      return `<g clip-path="url(#${getTileFillClipId(visibleTile.id)})"><image href="${href}" x="${imageBox.minX.toFixed(2)}" y="${imageBox.minY.toFixed(2)}" width="${imageBox.width.toFixed(2)}" height="${imageBox.height.toFixed(2)}" preserveAspectRatio="xMidYMid slice"${getImageTransform(bounds, tileFill.orientation)} /></g>`;
    })
    .join('\n      ');

  return `<g transform="rotate(${rotationDeg.toFixed(2)} ${origin.x.toFixed(2)} ${origin.y.toFixed(2)})">
      ${images}
    </g>`;
}

function buildSvgMarkup(
  layout: ReturnType<typeof buildLayout>,
  room: RoomInput,
  tile: TileInput,
  tileFill: TileImageFill | null,
  viewBox: string,
  showMeasurementView: boolean,
) {
  const roomPoints = pointsToString(layout.roomPolygon);
  const hasTileFill = Boolean(tileFill && !showMeasurementView);
  const tileClipDefs = hasTileFill ? buildTileFillClipDefs(layout) : '';
  const tileImageLayer = hasTileFill ? buildTileImageSvgLayer(layout, tileFill, tile.rotationDeg) : '';
  const tilePolygons = layout.tiles
    .map(
      (visibleTile) =>
        `<polygon points="${pointsToString(visibleTile.polygon)}" class="${visibleTile.isFull ? 'tile-full' : 'tile-cut'}${hasTileFill ? ' tile-under-image' : ''}" />`,
    )
    .join('\n      ');
  const tileEdges = layout.tiles
    .map((visibleTile) => `<polygon points="${pointsToString(visibleTile.tilePolygon)}" class="tile-edge" />`)
    .join('\n    ');
  const measurementLabels = showMeasurementView
    ? getRoomMeasurementLabels(layout.roomPolygon, room)
        .map(
          (label) =>
            `<text x="${label.x.toFixed(2)}" y="${label.y.toFixed(2)}" class="measurement-label" transform="rotate(${label.angle.toFixed(2)} ${label.x.toFixed(2)} ${label.y.toFixed(2)})">${label.label}</text>`,
        )
        .join('\n  ')
    : '';
  const svgClass = showMeasurementView ? 'measurement-svg' : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" class="${svgClass}" role="img" aria-label="Scaled floor tile layout">
  <defs>
    <style>
      .tile-full { fill: #d7b46a; stroke: #7a653b; stroke-width: 0.75; }
      .tile-cut { fill: #78a896; stroke: #315f54; stroke-width: 0.75; }
      .tile-under-image { fill-opacity: 0.26; }
      .tile-edge { fill: none; stroke: rgba(24, 37, 33, 0.24); stroke-width: 0.55; pointer-events: none; }
      .room-outline { fill: rgba(255, 255, 255, 0.06); stroke: #17221f; stroke-linejoin: round; stroke-width: 3; pointer-events: none; }
      .measurement-svg .tile-full, .measurement-svg .tile-cut { fill: #ffffff; stroke: #111111; }
      .measurement-svg .tile-edge { stroke: rgba(0, 0, 0, 0.55); }
      .measurement-svg .room-outline { fill: none; stroke: #000000; }
      .measurement-label { fill: #000000; font-family: Inter, Arial, sans-serif; font-size: 14px; font-weight: 800; paint-order: stroke; stroke: #ffffff; stroke-width: 4px; stroke-linejoin: round; text-anchor: middle; dominant-baseline: central; }
    </style>
    <clipPath id="room-clip">
      <polygon points="${roomPoints}" />
    </clipPath>
    ${tileClipDefs}
    <pattern id="minor-grid" width="50" height="50" patternUnits="userSpaceOnUse">
      <path d="M 50 0 L 0 0 0 50" fill="none" stroke="rgba(35, 45, 57, 0.08)" stroke-width="1" />
    </pattern>
  </defs>
  <rect x="-5000" y="-5000" width="10000" height="10000" fill="url(#minor-grid)" />
  <g clip-path="url(#room-clip)">
      ${tilePolygons}
      ${tileImageLayer}
  </g>
  ${tileEdges}
  <polygon points="${roomPoints}" class="room-outline" />
  ${measurementLabels}
</svg>`;
}

function getSvgCanvasSize(viewBox: string) {
  const [, , width, height] = viewBox.split(/\s+/).map(Number);
  const safeWidth = Number.isFinite(width) ? width : 800;
  const safeHeight = Number.isFinite(height) ? height : 800;
  const scale = Math.min(3, 1800 / Math.max(safeWidth, safeHeight));

  return {
    height: Math.max(Math.round(safeHeight * scale), 1),
    width: Math.max(Math.round(safeWidth * scale), 1),
  };
}

async function renderSvgToPngBlob(svgMarkup: string, viewBox: string) {
  const svgBlob = new Blob([svgMarkup], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(svgBlob);

  try {
    const image = new Image();
    const imageLoaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Unable to render SVG image.'));
    });
    image.src = url;
    await imageLoaded;

    const canvas = document.createElement('canvas');
    const size = getSvgCanvasSize(viewBox);
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Unable to create image canvas.');

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const pngBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!pngBlob) throw new Error('Unable to create PNG image.');

    return pngBlob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function copySvgImageToClipboard(svgMarkup: string, viewBox: string) {
  if (!navigator.clipboard?.write || !window.isSecureContext || !('ClipboardItem' in window)) {
    throw new Error('Image clipboard writes are not supported in this browser.');
  }

  const svgBlob = new Blob([svgMarkup], { type: 'image/svg+xml' });
  try {
    await navigator.clipboard.write([new ClipboardItem({ [svgBlob.type]: svgBlob })]);
    return;
  } catch {
    const pngBlob = await renderSvgToPngBlob(svgMarkup, viewBox);
    await navigator.clipboard.write([new ClipboardItem({ [pngBlob.type]: pngBlob })]);
  }
}

export function App() {
  const [room, setRoom] = useState<RoomInput>(initialRoom);
  const [tile, setTile] = useState<TileInput>(initialTile);
  const [tileFill, setTileFill] = useState<TileImageFill | null>(null);
  const [isTileFillDialogOpen, setTileFillDialogOpen] = useState(false);
  const [activePairId, setActivePairId] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [showMeasurementView, setShowMeasurementView] = useState(false);
  const layout = useMemo(() => buildLayout(room, tile), [room, tile]);
  const tileById = useMemo(
    () => new Map(layout.tiles.map((visibleTile) => [visibleTile.id, visibleTile])),
    [layout.tiles],
  );
  const allPoints = [...layout.roomPolygon, ...layout.tiles.flatMap((item) => item.tilePolygon)];
  const viewBox = getViewBox(allPoints.length ? allPoints : layout.roomPolygon);
  const clipId = 'room-clip';
  const roomCentroid = useMemo(() => getRoomCentroid(layout.roomPolygon), [layout.roomPolygon]);
  const showTileFill = Boolean(tileFill && !showMeasurementView);
  const roomMeasurementLabels = useMemo(() => getRoomMeasurementLabels(layout.roomPolygon, room), [layout.roomPolygon, room]);
  const svgMarkup = useMemo(
    () => buildSvgMarkup(layout, room, tile, tileFill, viewBox, showMeasurementView),
    [layout, room, tile, tileFill, viewBox, showMeasurementView],
  );

  function handleTileImageFile(file: File | null) {
    if (!file || !file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      setTileFill({
        dataUrl: reader.result,
        fileName: file.name,
        orientation: tile.width >= tile.height ? 0 : 90,
      });
      setTileFillDialogOpen(true);
    };
    reader.readAsDataURL(file);
  }

  async function handleCopySvg() {
    try {
      await copySvgImageToClipboard(svgMarkup, viewBox);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
    window.setTimeout(() => setCopyState('idle'), 1600);
  }

  function handleDownloadSvg() {
    const blob = new Blob([svgMarkup], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'tile-layout.svg';
    link.style.display = 'none';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

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
            <NumberField
              label="Flip after"
              value={tile.offsetFlipRows}
              min={0}
              step={1}
              suffix="rows"
              onChange={(value) => updateNumber(setTile, 'offsetFlipRows', value)}
            />
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
            <span>
              {tile.rowOffset} cm row offset
              {tile.offsetFlipRows > 0 ? ` · flips every ${Math.floor(tile.offsetFlipRows)} rows` : ''}
              {' · '}
              {tile.groutMm} mm grout · {tile.rotationDeg}deg
            </span>
          </div>
          <div className="legend" aria-label="Legend">
            <span><i className="legend-full" /> full</span>
            <span><i className="legend-cut" /> cut</span>
            <span><i className="legend-reuse" /> reused pair</span>
            <span><i className="legend-room" /> room</span>
          </div>
          <div className="toolbar-actions" aria-label="SVG actions">
            <button
              type="button"
              className={showMeasurementView ? 'icon-button icon-button-active' : 'icon-button'}
              onClick={() => setShowMeasurementView((current) => !current)}
              aria-label="Toggle black and white measurements in centimeters"
              aria-pressed={showMeasurementView}
              title="Black and white measurements"
            >
              <Ruler size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={tileFill ? 'icon-button icon-button-active' : 'icon-button'}
              onClick={() => setTileFillDialogOpen(true)}
              aria-label="Upload tile image fill"
              aria-pressed={Boolean(tileFill)}
              title="Tile image fill"
            >
              <ImageIcon size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={copyState === 'failed' ? 'icon-button icon-button-error' : 'icon-button'}
              onClick={handleCopySvg}
              aria-label="Copy SVG to clipboard"
              title={copyState === 'failed' ? 'Copy failed' : 'Copy SVG'}
            >
              {copyState === 'copied' && <Check size={18} aria-hidden="true" />}
              {copyState === 'failed' && <X size={18} aria-hidden="true" />}
              {copyState === 'idle' && <Copy size={18} aria-hidden="true" />}
            </button>
            <button type="button" className="icon-button" onClick={handleDownloadSvg} aria-label="Download SVG" title="Download SVG">
              <Download size={18} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className={showMeasurementView ? 'canvas-frame measurement-view' : 'canvas-frame'}>
          {!layout.isValid && <div className="error-banner">{layout.message}</div>}
          <svg viewBox={viewBox} role="img" aria-label="Scaled floor tile layout">
            <defs>
              <clipPath id={clipId}>
                <polygon points={pointsToString(layout.roomPolygon)} />
              </clipPath>
              {showTileFill && layout.tiles.map((visibleTile) => (
                <clipPath key={`fill-clip-${visibleTile.id}`} id={getTileFillClipId(visibleTile.id)}>
                  <polygon points={pointsToString(visibleTile.localPolygon)} />
                </clipPath>
              ))}
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
                  className={`${visibleTile.isFull ? 'tile-full' : 'tile-cut'}${showTileFill ? ' tile-under-image' : ''}`}
                />
              ))}
              {showTileFill && (
                <g transform={`rotate(${tile.rotationDeg} ${roomCentroid.x} ${roomCentroid.y})`}>
                  {layout.tiles.map((visibleTile) => {
                    const bounds = getLocalBounds(visibleTile.localTilePolygon);
                    const imageBox = tileFill ? getOrientedImageBox(bounds, tileFill.orientation) : bounds;
                    return (
                      <g key={`tile-fill-${visibleTile.id}`} clipPath={`url(#${getTileFillClipId(visibleTile.id)})`}>
                        <image
                          href={tileFill?.dataUrl}
                          x={imageBox.minX}
                          y={imageBox.minY}
                          width={imageBox.width}
                          height={imageBox.height}
                          preserveAspectRatio="xMidYMid slice"
                          transform={tileFill ? getImageRotateValue(bounds, tileFill.orientation) : undefined}
                        />
                      </g>
                    );
                  })}
                </g>
              )}
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
            {showMeasurementView && (
              <g className="measurement-layer" aria-label="Room side measurements in centimeters">
                {roomMeasurementLabels.map((label) => (
                  <text
                    key={label.id}
                    x={label.x}
                    y={label.y}
                    className="measurement-label"
                    transform={`rotate(${label.angle} ${label.x} ${label.y})`}
                  >
                    {label.label}
                  </text>
                ))}
              </g>
            )}
          </svg>
        </div>
      </section>
      {isTileFillDialogOpen && (
        <TileFillDialog
          tile={tile}
          tileFill={tileFill}
          onClose={() => setTileFillDialogOpen(false)}
          onFileSelected={handleTileImageFile}
          onRemove={() => setTileFill(null)}
          onUpdate={setTileFill}
        />
      )}
    </main>
  );
}

function TileFillDialog({
  onClose,
  onFileSelected,
  onRemove,
  onUpdate,
  tile,
  tileFill,
}: {
  onClose: () => void;
  onFileSelected: (file: File | null) => void;
  onRemove: () => void;
  onUpdate: React.Dispatch<React.SetStateAction<TileImageFill | null>>;
  tile: TileInput;
  tileFill: TileImageFill | null;
}) {
  const orientations: Array<TileImageFill['orientation']> = [0, 90, 180, 270];

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="tile-fill-title">
        <div className="modal-header">
          <h2 id="tile-fill-title">Tile Image Fill</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close tile image fill">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <label className={tileFill ? 'upload-drop upload-drop-filled' : 'upload-drop'}>
          <Upload size={20} aria-hidden="true" />
          <span>{tileFill?.fileName ?? 'Select image'}</span>
          <input
            type="file"
            accept="image/*"
            onChange={(event) => {
              onFileSelected(event.target.files?.[0] ?? null);
              event.target.value = '';
            }}
          />
        </label>

        {tileFill && (
          <>
            <div className="tile-fill-preview" style={{ aspectRatio: `${Math.max(tile.width, 1)} / ${Math.max(tile.height, 1)}` }}>
              <img
                src={tileFill.dataUrl}
                alt=""
                style={{ transform: `rotate(${tileFill.orientation}deg)` }}
              />
            </div>
            <div className="orientation-group" aria-label="Tile image orientation">
              {orientations.map((orientation) => (
                <button
                  key={orientation}
                  type="button"
                  className={tileFill.orientation === orientation ? 'orientation-button orientation-button-active' : 'orientation-button'}
                  onClick={() => onUpdate((current) => current ? { ...current, orientation } : current)}
                  aria-pressed={tileFill.orientation === orientation}
                >
                  {orientation}deg
                </button>
              ))}
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={onRemove}>
                <Trash2 size={16} aria-hidden="true" />
                Remove
              </button>
              <button type="button" className="primary-button" onClick={onClose}>
                Apply
              </button>
            </div>
          </>
        )}
      </div>
    </div>
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
  min?: number;
  step?: number | 'any';
  onChange: (value: string) => void;
};

function NumberField({ label, value, suffix, min = 0, step = 'any', onChange }: NumberFieldProps) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="input-shell">
        <input type="number" value={value} min={min} step={step} onChange={(event) => onChange(event.target.value)} />
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

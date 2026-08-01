import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildLayout } from '../src/geometry';
import { buildRowOffsetMeasurements } from '../src/measurements';

const room = {
  top: 420,
  right: 320,
  bottom: 420,
  left: 320,
  angleDeg: 90,
};

const baseTile = {
  width: 120,
  height: 20,
  groutMm: 3,
  rowOffset: 40,
  offsetFlipRows: 0,
  rotationDeg: 0,
};

test('builds repeated row offset measurements for staggered rows', () => {
  const layout = buildLayout(room, baseTile);
  const measurements = buildRowOffsetMeasurements(layout.tiles, baseTile);

  assert.ok(measurements.length > 0);
  assert.ok(measurements.length > 4);
  assert.ok(measurements.every((measurement) => measurement.label === '40 cm'));
  assert.ok(measurements.some((measurement) => measurement.lineStart.x > 20));
  assert.ok(measurements.some((measurement) => measurement.lineStart.x > 70));
});

test('omits row offset measurements when there is no row offset', () => {
  const tile = { ...baseTile, rowOffset: 0 };
  const layout = buildLayout(room, tile);
  const measurements = buildRowOffsetMeasurements(layout.tiles, tile);

  assert.equal(measurements.length, 0);
});

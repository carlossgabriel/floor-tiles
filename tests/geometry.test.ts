import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRoomPolygon, polygonArea } from '../src/geometry';

test('builds a valid rectangle when opposite room sides match and angle is 90 degrees', () => {
  const room = buildRoomPolygon({
    top: 130,
    right: 320,
    bottom: 130,
    left: 320,
    angleDeg: 90,
  });

  assert.equal(room.message, undefined);
  assert.equal(room.polygon.length, 4);
  assert.equal(Math.round(polygonArea(room.polygon)), 130 * 320);
});

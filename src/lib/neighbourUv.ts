/**
 * UVs in world metres for a neighbour's triangle soup (xyz triples, three
 * vertices per triangle). Walls: u runs horizontally along the wall, v is the
 * height. Roof slopes: u runs along the eaves, v up the slope, so tile courses
 * follow the eaves. Flat faces (caps): u = x, v = z.
 */
export function metricUvs(pos: ArrayLike<number>): Float32Array {
  const uv = new Float32Array((pos.length / 3) * 2);
  for (let t = 0; t + 8 < pos.length; t += 9) {
    const ax = pos[t + 3] - pos[t], ay = pos[t + 4] - pos[t + 1], az = pos[t + 5] - pos[t + 2];
    const bx = pos[t + 6] - pos[t], by = pos[t + 7] - pos[t + 1], bz = pos[t + 8] - pos[t + 2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    let ex: number, ez: number, sx: number, sy: number, sz: number;
    if (Math.abs(ny) > 0.999) {
      ex = 1; ez = 0; sx = 0; sy = 0; sz = 1;
    } else {
      // Along the eaves: horizontal and square to the face normal.
      const h = Math.hypot(nx, nz);
      ex = -nz / h; ez = nx / h;
      // Up the face: normal x eaves direction, flipped to point upward.
      sx = ny * ez; sy = nz * ex - nx * ez; sz = -ny * ex;
      if (sy < 0) { sx = -sx; sy = -sy; sz = -sz; }
    }
    for (let k = 0; k < 3; k++) {
      const i = t + k * 3;
      const o = ((t / 3) + k) * 2;
      uv[o] = pos[i] * ex + pos[i + 2] * ez;
      uv[o + 1] = pos[i] * sx + pos[i + 1] * sy + pos[i + 2] * sz;
    }
  }
  return uv;
}

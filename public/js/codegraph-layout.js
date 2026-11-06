/* Deterministic layout for the architecture code graph.
 *
 * The layout is a small force simulation with a fixed golden-angle start and a
 * fixed iteration count: the same symbols and edges always produce the same
 * picture, with no randomness and no dependency. It runs only for the symbols
 * that survived filtering and the node limit, never for the whole workspace.
 */

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const MIN_STEP = 0.6;
const MAX_STEP = 7;

/** Stable text comparison, independent of the current locale. */
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function initialPoints(nodes, width, height) {
  const points = nodes.map((node, i) => {
    const t = nodes.length === 1 ? 0 : Math.sqrt(i / (nodes.length - 1));
    const angle = i * GOLDEN_ANGLE;
    const radius = Math.min(width, height) * 0.4;
    return {
      id: node.id,
      x: width / 2 + Math.cos(angle) * radius * 1.2 * t,
      y: height / 2 + Math.sin(angle) * radius * t,
    };
  });
  return points;
}

/**
 * Lay out rendered nodes and the edges between them.
 * Input nodes need `{ id, radius }`; edges need `{ from, to }`.
 */
export function layoutCodeGraph(nodes, edges) {
  if (!nodes.length) return { width: 760, height: 420, points: new Map() };

  const order = [...nodes].sort((a, b) => compare(a.id, b.id));
  const count = order.length;
  const cols = Math.max(4, Math.ceil(Math.sqrt(count * 1.7)));
  const width = Math.max(720, Math.min(2800, cols * 82));
  const height = Math.max(620, Math.min(2000, Math.ceil(count / cols) * 82 + 120));

  const points = initialPoints(order, width, height);
  const index = new Map(order.map((node, i) => [node.id, i]));
  const radius = order.map((node) => node.radius || 5);
  const links = [];
  for (const edge of edges) {
    const a = index.get(edge.from);
    const b = index.get(edge.to);
    if (a == null || b == null || a === b) continue;
    links.push([a, b]);
  }
  links.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const area = width * height;
  const spacing = Math.max(54, Math.min(110, Math.sqrt(area / count) * 0.78));
  const reach = spacing * 2.3;
  const reach2 = reach * reach;
  const iterations = count > 180 ? 90 : count > 90 ? 120 : 150;
  const fx = new Float64Array(count);
  const fy = new Float64Array(count);
  const margin = 22;

  for (let iter = 0; iter < iterations; iter += 1) {
    fx.fill(0);
    fy.fill(0);

    // Repulsion: only nearby nodes push, which keeps the layout local.
    for (let i = 0; i < count; i += 1) {
      for (let j = i + 1; j < count; j += 1) {
        const dx = points[j].x - points[i].x;
        const dy = points[j].y - points[i].y;
        let d2 = dx * dx + dy * dy;
        if (d2 >= reach2) continue;
        if (d2 < 1) {
          // Deterministic tie-break for exactly coincident points.
          const angle = (i + 1) * 1.7 + (j + 1) * 0.9;
          const kick = 1.2 + ((i * 37 + j * 17) % 11) / 10;
          fx[i] -= Math.cos(angle) * kick;
          fy[i] -= Math.sin(angle) * kick;
          fx[j] += Math.cos(angle) * kick;
          fy[j] += Math.sin(angle) * kick;
          continue;
        }
        const d = Math.sqrt(d2);
        const push = ((reach - d) / reach) * 1.8;
        const ux = dx / d;
        const uy = dy / d;
        fx[i] -= ux * push;
        fy[i] -= uy * push;
        fx[j] += ux * push;
        fy[j] += uy * push;
      }
    }

    // Springs: callers and callees settle near each other without collapsing.
    for (const [a, b] of links) {
      const dx = points[b].x - points[a].x;
      const dy = points[b].y - points[a].y;
      const d = Math.max(0.5, Math.sqrt(dx * dx + dy * dy));
      const pull = (d - spacing * 0.9) * 0.009;
      const ux = dx / d;
      const uy = dy / d;
      fx[a] += ux * pull;
      fy[a] += uy * pull;
      fx[b] -= ux * pull;
      fy[b] -= uy * pull;
    }

    const centerX = width / 2;
    const centerY = height / 2;
    for (let i = 0; i < count; i += 1) {
      fx[i] += (centerX - points[i].x) * 0.002;
      fy[i] += (centerY - points[i].y) * 0.002;

      let dx = fx[i] * 0.9;
      let dy = fy[i] * 0.9;
      const move = Math.sqrt(dx * dx + dy * dy);
      if (move > MAX_STEP) {
        dx = (dx / move) * MAX_STEP;
        dy = (dy / move) * MAX_STEP;
      } else if (move < MIN_STEP && move > 0) {
        dx = (dx / move) * MIN_STEP;
        dy = (dy / move) * MIN_STEP;
      }

      points[i].x = Math.max(margin, Math.min(width - margin, points[i].x + dx));
      points[i].y = Math.max(margin, Math.min(height - margin, points[i].y + dy));
    }
  }

  // Keep the drawing centered after the simulation has spread it out.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const fit = Math.min((width - margin * 4) / spanX, (height - margin * 4) / spanY);
  const maxScale = count <= 24 ? 2.4 : count <= 60 ? 1.5 : count <= 120 ? 1.15 : 1;
  const scale = Math.min(fit, maxScale);
  for (const point of points) {
    point.x = (point.x - (minX + maxX) / 2) * scale + width / 2;
    point.y = (point.y - (minY + maxY) / 2) * scale + height / 2;
  }

  const map = new Map();
  for (let i = 0; i < count; i += 1) {
    map.set(order[i].id, { x: points[i].x, y: points[i].y, r: radius[i] });
  }
  return { width, height, points: map };
}

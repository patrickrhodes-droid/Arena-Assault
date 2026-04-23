import { HALF, LEDGE_GRACE, P_RAD, EPS, WALL_H } from "./config.js";
import { game } from "./state.js";

export function closestOnBox(cx, cz, obstacle) {
  return {
    x: Math.max(obstacle.min.x, Math.min(obstacle.max.x, cx)),
    z: Math.max(obstacle.min.z, Math.min(obstacle.max.z, cz)),
  };
}

export function resolveCircleBox(position, radius, obstacle, baseY = 0) {
  if (baseY >= obstacle.h - LEDGE_GRACE) {
    return;
  }

  const closest = closestOnBox(position.x, position.z, obstacle);
  const dx = position.x - closest.x;
  const dz = position.z - closest.z;
  const distance = Math.sqrt(dx * dx + dz * dz);

  if (distance < EPS) {
    const distances = [
      position.x - obstacle.min.x,
      obstacle.max.x - position.x,
      position.z - obstacle.min.z,
      obstacle.max.z - position.z,
    ];
    const index = distances.indexOf(Math.min(...distances));

    if (index === 0) {
      position.x = obstacle.min.x - radius;
    } else if (index === 1) {
      position.x = obstacle.max.x + radius;
    } else if (index === 2) {
      position.z = obstacle.min.z - radius;
    } else {
      position.z = obstacle.max.z + radius;
    }
    return;
  }

  if (distance < radius) {
    const push = radius - distance;
    position.x += (dx / distance) * push;
    position.z += (dz / distance) * push;
  }
}

export function circleOverBoxTop(px, pz, radius, obstacle) {
  return px >= obstacle.min.x - radius
    && px <= obstacle.max.x + radius
    && pz >= obstacle.min.z - radius
    && pz <= obstacle.max.z + radius;
}

export function getSupportHeight(prevY, nextY, px, pz) {
  let support = 0;

  for (const obstacle of game.oBs) {
    if (!circleOverBoxTop(px, pz, P_RAD * 0.75, obstacle)) {
      continue;
    }

    if (prevY >= obstacle.h - 0.05 && nextY <= obstacle.h + 0.35) {
      support = Math.max(support, obstacle.h);
    }
  }

  return support;
}

export function bulletHitObstacle(x, y, z) {
  for (const obstacle of game.oBs) {
    if (x >= obstacle.min.x && x <= obstacle.max.x && y >= 0 && y <= obstacle.h && z >= obstacle.min.z && z <= obstacle.max.z) {
      return true;
    }
  }

  if (Math.abs(x) > HALF || Math.abs(z) > HALF || y > WALL_H || y < 0) {
    return true;
  }

  return false;
}

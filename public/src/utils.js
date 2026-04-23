export function disposeObject3D(root) {
  root.traverse((child) => {
    if (child.geometry) {
      child.geometry.dispose();
    }

    if (!child.material) {
      return;
    }

    if (Array.isArray(child.material)) {
      child.material.forEach((material) => material.dispose());
      return;
    }

    child.material.dispose();
  });
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

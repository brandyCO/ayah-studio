// Motion preference shared by the calm screens (Night listening, Kids space). The 3D light scenes
// (three.js) were removed to keep the app light; only their flat 2D versions remain (flat.ts).

export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// Quality tiers and the automatic choice of a starting tier.
// Everything that costs GPU/CPU time is driven from here so that the whole
// world can be scaled from phones to desktop GPUs.

export const TIERS = {
  low: {
    id: 'low', label: 'Léger', quality: 0,
    maxPixelRatio: 1.25, minScale: 0.55,
    post: false, msaa: false,
    shadowStatic: 2048, shadowDynamic: 0, shadowSoft: false,
    reflection: 0.3, reflectionEvery: 2, reflectionDetail: 0,
    terrainRange: 0.62,
    treeNear: 16, treeMid: 52, treeFade: 8,
    grassRange: 26, grassDensity: 0.4,
    scatterRange: 42, scatterDensity: 0.5,
    particles: 0.4, layerSize: 512,
  },
  medium: {
    id: 'medium', label: 'Équilibré', quality: 1,
    maxPixelRatio: 1.5, minScale: 0.6,
    post: false, msaa: true,
    shadowStatic: 4096, shadowDynamic: 1024, shadowSoft: true,
    reflection: 0.4, reflectionEvery: 1, reflectionDetail: 1,
    terrainRange: 0.85,
    treeNear: 26, treeMid: 80, treeFade: 10,
    grassRange: 38, grassDensity: 0.7,
    scatterRange: 60, scatterDensity: 0.8,
    particles: 0.7, layerSize: 512,
  },
  high: {
    id: 'high', label: 'Élevé', quality: 2,
    maxPixelRatio: 1.75, minScale: 0.65,
    post: true, msaa: true,
    shadowStatic: 4096, shadowDynamic: 2048, shadowSoft: true,
    reflection: 0.5, reflectionEvery: 1, reflectionDetail: 2,
    terrainRange: 1.0,
    treeNear: 38, treeMid: 115, treeFade: 14,
    grassRange: 52, grassDensity: 1.0,
    scatterRange: 80, scatterDensity: 1.0,
    particles: 1.0, layerSize: 1024,
  },
  ultra: {
    id: 'ultra', label: 'Ultra', quality: 2,
    maxPixelRatio: 2, minScale: 0.8,
    post: true, msaa: true,
    shadowStatic: 4096, shadowDynamic: 2048, shadowSoft: true,
    reflection: 0.65, reflectionEvery: 1, reflectionDetail: 2,
    terrainRange: 1.3,
    treeNear: 55, treeMid: 160, treeFade: 18,
    grassRange: 70, grassDensity: 1.25,
    scatterRange: 110, scatterDensity: 1.2,
    particles: 1.2, layerSize: 1024,
  },
};

export const TIER_ORDER = ['low', 'medium', 'high', 'ultra'];

export function isMobile() {
  const ua = navigator.userAgent || '';
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return /Android|iPhone|iPad|iPod|Mobile|Silk/i.test(ua) || (coarse && Math.min(screen.width, screen.height) < 900);
}

/** Pick a starting tier from what the browser tells us about the device. */
export function detectTier(gl) {
  const forced = new URLSearchParams(location.search).get('q');
  if (forced && TIERS[forced]) return forced;
  const saved = localStorage.getItem('mmf.quality');
  if (saved && saved !== 'auto' && TIERS[saved]) return saved;
  let gpu = '';
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
  } catch { /* ignore */ }
  const g = gpu.toLowerCase();
  const software = /swiftshader|llvmpipe|software|basic render/.test(g);
  if (software) return 'low';
  if (isMobile()) {
    // recent flagship GPUs can afford the balanced tier
    if (/apple a1[5-9]|apple m\d|adreno \(tm\) 7[3-9]\d|adreno \(tm\) 8\d\d|mali-g7[1-9]\d|immortalis|xclipse/.test(g)) return 'medium';
    return 'low';
  }
  if (/rtx|radeon rx|radeon pro|geforce gtx 1[0-9]{3}|gtx 9[78]0|arc\(tm\) a|apple m[1-9]|quadro|amd radeon\(tm\) rx/.test(g)) return 'high';
  if (/intel|iris|uhd|hd graphics|radeon\(tm\) graphics|vega/.test(g)) return 'medium';
  const cores = navigator.hardwareConcurrency || 4;
  return cores >= 8 ? 'high' : 'medium';
}

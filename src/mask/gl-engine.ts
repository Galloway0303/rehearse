/**
 * Claude GPU effect engine — every cover effect as a WebGL2 fragment shader,
 * rendered at display refresh rate over the LIVE screen stream.
 *
 * Design notes (mapped to the grok-session requirements):
 * - "我都要实时的，而且不能闪"  → effects run 30–60fps on a WebRTC screen stream;
 *   the mask window is capture-excluded, so nothing ever hides/flashes.
 * - "真马赛克"                → nearest tile sampling of REAL video pixels; the
 *   per-tile colour is the true average (mip LOD), exactly AE-style mosaic.
 * - "苹果玻璃=磨砂玻璃，不发亮" → matte frosted plate, heavy blur, hairline only,
 *   plus a *very* slow refraction drift so it reads as material, not a grey box.
 * - "黑洞=扭曲力场，保色不阴"   → inverse-square gravitational lens + photon ring,
 *   same math as the CPU port but now per-pixel on GPU (it was 2fps, now 60).
 * - "动效太快影响观感"          → all motion runs through ANIM_TEMPO (0.28).
 * - "字幕变小错位"             → canvas is sized to *physical* pixels of the strip
 *   and the stream is cropped 1:1 — zero rescaling, zero drift.
 */
import { blockSizeForFriction, normalizeEffect, TARGET_FRICTION, type CoverEffect } from './effects'

export const GL_EFFECT_IDS: Record<CoverEffect, number> = {
  solid: 0,
  mosaic: 1,
  liquid_glass: 2,
  frost: 3,
  glass: 4,
  shade_wave: 5,
  soft_void: 6,
  veil: 7,
  smoke: 8,
  prism: 9,
  ripple: 10,
  glitch: 11,
  flip: 12,
  slow_blur: 13,
  blackhole: 14,
  blur: 4, // alias → glass
}

const VERT = `#version 300 es
layout(location=0) in vec2 a_pos;
out vec2 v_uv;
void main(){
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`

const FRAG = `#version 300 es
precision highp float;

uniform sampler2D u_tex;
uniform vec2  u_cssRes;   // strip size in CSS px (authoring space = old 2D code)
uniform float u_dpr;
uniform float u_time;     // seconds
uniform int   u_effect;
uniform float u_blockCss; // mosaic block, CSS px
uniform float u_friction;
uniform float u_maxLod;

in vec2 v_uv;
out vec4 fragColor;

const float TEMPO = 0.28; // global calm tempo (matches effects.ts ANIM_TEMPO)
const float GA    = 2.39996323; // golden angle

float At(float speed){ return u_time * TEMPO * speed; }
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec2 cssToUv(vec2 p){
  vec2 q = clamp(p, vec2(0.5), max(vec2(1.0), u_cssRes - 0.5));
  return vec2(q.x / u_cssRes.x, 1.0 - q.y / u_cssRes.y);
}

vec3 samp(vec2 pCss, float lod){
  return textureLod(u_tex, cssToUv(pCss), clamp(lod, 0.0, u_maxLod)).rgb;
}

float hash21(vec2 p){
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

float vnoise(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p){
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++){
    s += a * vnoise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return s;
}

/**
 * 13-tap golden-angle disc blur.
 * The old code used a 5-tap cross at a hand-picked LOD: a cross leaves visible
 * plus-shaped smear, and hand-picked LODs make the blur *step* between mip
 * levels whenever the radius animates. A Vogel disc at a radius-matched LOD,
 * rotated by a stable per-pixel hash, is what gives an actual creamy falloff.
 */
vec3 discBlur(vec2 pCss, float radiusCss){
  float r0  = max(1.0, radiusCss);
  float lod = clamp(log2(max(1.0, r0 * u_dpr) / 2.2), 0.0, u_maxLod);
  float a0  = hash21(floor(pCss * u_dpr)) * 6.2831853; // no time → temporally stable
  vec3  acc = samp(pCss, lod);
  float wsum = 1.0;
  for (int i = 1; i <= 12; i++){
    float fi = float(i);
    float rr = r0 * sqrt(fi / 12.0);
    float aa = a0 + fi * GA;
    float w  = 1.0 - 0.55 * (fi / 12.0); // centre bias → gaussian-ish, no hard disc rim
    acc  += samp(pCss + vec2(cos(aa), sin(aa)) * rr, lod) * w;
    wsum += w;
  }
  return acc / wsum;
}

/**
 * Local scene colour behind this part of the strip (coarse mip ≈ 6 buckets
 * across the strip). EVERY plate is built from this instead of a fixed RGB,
 * because a constant white plate is exactly what made the cover glow brighter
 * than the film on dark scenes.
 */
vec3 ambientLocal(vec2 pCss){
  return samp(pCss, max(0.0, u_maxLod - 2.0));
}

/** Hard rule: the cover is never brighter than the picture it sits in. */
vec3 toneLock(vec3 col, vec3 amb, float ceilK){
  float lim = luma(amb) * ceilK + 0.02; // small floor so pure-black scenes still show material
  float lc  = luma(col);
  return lc > lim ? col * (lim / max(lc, 1e-4)) : col;
}

/** Frosted glass scatters the SCENE's light, so the milk takes the scene's colour. */
vec3 milk(vec3 col, vec3 amb, float a){
  return mix(col, clamp(amb * 1.22 + 0.015, 0.0, 1.0), clamp(a, 0.0, 1.0));
}

/** Scene-tinted shade — soft material dim (glass etc). */
vec3 shade(vec3 col, vec3 amb, float k, float a){
  return mix(col, amb * k, clamp(a, 0.0, 1.0));
}

/**
 * True occlusion ink — mix toward near-black, NOT ambient*k.
 * ambient*k stays readable on bright subtitles; ink actually blocks glyphs.
 */
vec3 ink(vec3 col, float a){
  return mix(col, vec3(0.015, 0.016, 0.02), clamp(a, 0.0, 1.0));
}

/**
 * Matched film grain. A blurred patch is the only noise-free region on screen,
 * which is precisely why it reads as a pasted rectangle. Putting grain back —
 * quantised to ~11fps so it does not shimmer, weighted by luminance so blacks
 * stay clean — is what makes the cover sit *in* the picture. Doubles as dither,
 * killing the banding the flat alpha plates used to produce.
 */
vec3 grain(vec3 c, vec2 pCss){
  float gt = floor(u_time * 11.0);
  float n  = hash21(pCss * u_dpr + vec2(gt * 7.13, gt * 3.71)) - 0.5;
  return c + n * 0.014 * (0.30 + 0.70 * smoothstep(0.0, 0.30, luma(c)));
}

/** Soft boundary — a razor rectangle reads as a sticker no matter how good the material is. */
float feather(vec2 p){
  float fx = min(7.0, u_cssRes.x * 0.06);
  float fy = min(2.0, u_cssRes.y * 0.10);
  float ax = smoothstep(0.0, max(0.5, fx), p.x) * smoothstep(0.0, max(0.5, fx), u_cssRes.x - p.x);
  float ay = smoothstep(0.0, max(0.5, fy), p.y) * smoothstep(0.0, max(0.5, fy), u_cssRes.y - p.y);
  return ax * ay;
}

/**
 * 0..1 material strength from friction (f=7 → ~0.67).
 * Dark materials use this for how black the dark zones get.
 * Glass materials use it only lightly — spatial variation does the rest.
 */
float fStr(){
  return clamp((u_friction - 1.0) / 9.0, 0.0, 1.0);
}

/**
 * Regional soft blur field 0..1 — not a flat plate.
 * Slow drift + fBm so some patches stay clearer, some softer.
 * User want: 一点糊一点清, edge between readable / hard — never total soup.
 */
float softField(vec2 p){
  float s = max(12.0, u_cssRes.y);
  vec2 q = p / s;
  // large soft lobes drifting slowly
  float a = 0.5 + 0.5 * sin(q.x * 2.4 + At(0.35));
  float b = 0.5 + 0.5 * sin(q.x * 1.1 - q.y * 0.8 + At(0.22) + 1.3);
  float n = fbm(q * 1.6 + vec2(At(0.18), At(0.14) * 0.7));
  return clamp(0.40 * a + 0.35 * b + 0.25 * n, 0.0, 1.0);
}

/** Mild regional blur radius in CSS px — clearer patches stay nearly sharp. */
float softBlurR(vec2 p, float rClear, float rSoft){
  return mix(rClear, rSoft, softField(p));
}

vec3 softSamp(vec2 p, float radiusCss){
  return radiusCss < 1.4 ? samp(p, 0.0) : discBlur(p, radiusCss);
}

/* ---------- effects ---------- */

vec3 solidFx(vec2 p){
  // Near-black cover with a hint of scene so it doesn't punch a hole
  return mix(ambientLocal(p) * 0.08, vec3(0.02), 0.85);
}

vec3 mosaicFx(vec2 p){
  // Crisp true mosaic — smaller tiles, no fog
  float b = max(3.0, u_blockCss * 0.72);
  vec2 idx  = floor(p / b);
  vec2 tile = (idx + 0.5) * b;
  float lod = clamp(log2(max(1.0, b * u_dpr) * 0.35), 0.0, u_maxLod);
  float q = b * 0.22;
  vec3 c = (samp(tile + vec2(-q, -q), lod) + samp(tile + vec2(q, -q), lod)
          + samp(tile + vec2(-q,  q), lod) + samp(tile + vec2(q,  q), lod)) * 0.25;
  c *= 0.985 + 0.03 * hash21(idx);
  return toneLock(c, ambientLocal(p), 1.08);
}

vec3 liquidGlassFx(vec2 p){
  /**
   * 苹果磨砂 — soft regional frost, NOT black plate.
   * Clear patches: light frost, glyphs still as shapes.
   * Soft patches: more blur + milk. No heavy ink (that made everything vanish).
   */
  float t = At(0.25);
  vec3 amb = ambientLocal(p);
  float f = softField(p);
  float R = softBlurR(p, max(2.0, u_cssRes.y * 0.10), max(5.5, u_cssRes.y * 0.32));
  vec2 refr = vec2(sin(t + p.y * 0.04), cos(t * 0.55 + p.x * 0.018)) * mix(0.15, 0.7, f);
  vec3 c = softSamp(p + refr, R);
  c = milk(c, amb, mix(0.14, 0.32, f));
  // soft dim only — keep picture, kill easy reading
  c = shade(c, amb, 0.55, mix(0.08, 0.20, f));
  return toneLock(c, amb, 1.02);
}

vec3 frostFx(vec2 p){
  vec3 amb = ambientLocal(p);
  float cr = fbm(p * 0.5 + vec2(At(0.1), 0.0)) - 0.5;
  float f = softField(p);
  float R = softBlurR(p, max(2.2, u_cssRes.y * 0.11), max(6.0, u_cssRes.y * 0.34)) * (1.0 + cr * 0.08);
  vec3 c = softSamp(p + vec2(cr * 1.0, cr * 0.6) * f, R);
  c = milk(c, amb, mix(0.16, 0.34, f));
  c = shade(c, amb, 0.50, mix(0.10, 0.22, f));
  return toneLock(c, amb, 1.02);
}

vec3 glassFx(vec2 p){
  vec3 amb = ambientLocal(p);
  float f = softField(p);
  float bend = sin(p.y * 0.14 + At(0.22)) * mix(0.3, 1.0, f);
  float R = softBlurR(p, max(1.6, u_cssRes.y * 0.07), max(4.0, u_cssRes.y * 0.22));
  vec3 c = softSamp(p + vec2(bend, 0.0), R);
  c = shade(c, amb, 0.62, mix(0.06, 0.16, f));
  return toneLock(c, amb, 1.04);
}

vec3 slowBlurFx(vec2 p){
  vec3 amb = ambientLocal(p);
  float f = softField(p);
  float breathe = 0.5 + 0.5 * sin(At(0.28));
  float rLo = max(2.2, u_cssRes.y * mix(0.09, 0.13, breathe));
  float rHi = max(5.0, u_cssRes.y * mix(0.22, 0.34, breathe));
  float R = mix(rLo, rHi, f);
  vec3 c = softSamp(p, R);
  c = shade(c, amb, 0.58, mix(0.08, 0.18, f));
  return toneLock(c, amb, 1.02);
}

vec3 shadeWaveFx(vec2 p){
  /**
   * 明暗呼吸 — 看得见的动态：
   * 1) 暗带沿条带缓慢横移（约 4–6s 过一遍）
   * 2) 整体明暗幅度在「呼吸」——谷/峰一起鼓起来又落下
   * 峰顶真黑，谷底仍挡字，不是死板静态蒙版。
   *
   * 注意：At(s)=u_time*0.28*s；以前 At(0.15) 一圈要两分钟，像没动。
   */
  float x = p.x / max(1.0, u_cssRes.x);
  // 横移相位：真实角速度约 1.0 rad/s → 一圈 ~6s
  float tMove = At(3.6);
  float tMove2 = At(2.2);
  // 呼吸相位：约 5s 一吸一呼
  float tBreath = At(2.4);

  float band = 0.5 + 0.5 * sin(x * 3.2 + tMove);
  band = mix(band, 0.5 + 0.5 * sin(x * 1.6 - tMove2 + 1.1), 0.28);
  band = pow(smoothstep(0.05, 0.85, band), 0.9);

  // 呼吸：改变谷底与峰顶的黑度范围
  float breath = 0.5 + 0.5 * sin(tBreath);
  float lo = mix(0.40, 0.55, breath); // 谷：始终有遮挡
  float hi = mix(0.90, 0.99, breath); // 峰：接近纯黑
  float dark = mix(lo, hi, band);

  // 极轻的纵向起伏，避免像一条死竖条在滑
  float yNudge = 0.04 * sin(p.y * 0.08 + tBreath * 0.7);
  dark = clamp(dark + yNudge * band, 0.0, 1.0);

  vec3 c = samp(p, 0.0);
  return mix(c, vec3(0.0), dark);
}

vec3 softVoidFx(vec2 p){
  // Soft dark center, gentle rim — medium cover, calm pulse
  float pulse = 0.98 + 0.02 * sin(At(0.18));
  vec2 d = (p - u_cssRes * 0.5) / max(vec2(1.0), u_cssRes * 0.5 * pulse);
  float r = length(vec2(d.x * 0.5, d.y * 0.9));
  float core = 1.0 - smoothstep(0.08, 1.15, r);
  float dark = mix(0.30, 0.78, core);
  vec3 c = softSamp(p, mix(max(0.8, u_cssRes.y * 0.03), max(2.5, u_cssRes.y * 0.10), core));
  c = mix(c, vec3(0.04, 0.045, 0.055), dark);
  return c;
}

vec3 veilFx(vec2 p){
  // Even soft plate ~0.45–0.65 opacity, slow drift — not a black curtain
  float dens = mix(0.42, 0.62, softField(p));
  dens += 0.03 * sin(At(0.18) + p.x * 0.006);
  dens = clamp(dens, 0.38, 0.68);
  vec3 c = softSamp(p, max(1.2, u_cssRes.y * 0.05));
  c = mix(c, vec3(0.04, 0.045, 0.055), dens);
  return c;
}

vec3 smokeFx(vec2 p){
  float t = At(0.2);
  vec2 q = p / max(10.0, u_cssRes.y);
  vec2 warp = vec2(fbm(q * 1.2 + vec2(t * 0.5, 0.0)), fbm(q * 1.2 + vec2(0.0, t * 0.4) + 4.0));
  float dens = smoothstep(0.28, 0.75, fbm(q * 1.7 + warp * 1.1 - vec2(t * 0.3, 0.0)));
  float dark = mix(0.28, 0.70, dens);
  float R = mix(max(1.2, u_cssRes.y * 0.05), max(3.5, u_cssRes.y * 0.16), dens);
  vec3 c = softSamp(p, R);
  c = mix(c, vec3(0.04, 0.045, 0.055), dark);
  return c;
}

vec3 prismFx(vec2 p){
  vec3 amb = ambientLocal(p);
  float f = softField(p);
  vec2 dir = (p - u_cssRes * 0.5) / max(1.0, length(u_cssRes * 0.5));
  float R = softBlurR(p, max(1.5, u_cssRes.y * 0.05), max(3.5, u_cssRes.y * 0.18));
  float disp = mix(0.6, 1.8, f) * (1.0 + 0.2 * sin(At(0.35)));
  vec3 c;
  c.r = softSamp(p + dir * disp, R).r;
  c.g = softSamp(p, R).g;
  c.b = softSamp(p - dir * disp, R).b;
  c = shade(c, amb, 0.70, mix(0.04, 0.12, f));
  return toneLock(c, amb, 1.05);
}

vec3 rippleFx(vec2 p){
  vec3 amb = ambientLocal(p);
  float t = At(0.6);
  float s = max(8.0, u_cssRes.y);
  float k1 = (p.x * 0.9 + p.y * 1.7) / s * 6.283 + t * 1.7;
  float k2 = (p.x * 1.6 - p.y * 0.8) / s * 6.283 - t * 1.3;
  vec2 refr = vec2(cos(k1) * 0.9 + cos(k2) * 1.6, cos(k1) * 1.7 - cos(k2) * 0.8) * (s * 0.04);
  float f = softField(p);
  float R = softBlurR(p, max(1.2, u_cssRes.y * 0.04), max(3.2, u_cssRes.y * 0.16));
  vec3 c = softSamp(p + refr, R);
  c *= 1.0 + (sin(k1) + sin(k2)) * 0.02;
  c = shade(c, amb, 0.72, mix(0.03, 0.10, f));
  return toneLock(c, amb, 1.05);
}

vec3 glitchFx(vec2 p){
  vec3 amb = ambientLocal(p);
  float st  = floor(u_time * 2.2);
  float bh  = max(4.0, u_cssRes.y / 5.0);
  float row = floor(p.y / bh);
  float k   = hash21(vec2(row, st));
  float dx  = (k - 0.5) * u_cssRes.y * (k > 0.72 ? 0.50 : 0.12);
  vec3 c = samp(p + vec2(dx, 0.0), 0.0);
  c *= 0.80 + 0.20 * step(0.12, hash21(vec2(row * 3.1, st * 1.7)));
  c = shade(c, amb, 0.40, 0.16);
  return toneLock(c, amb, 1.0);
}

vec3 flipFx(vec2 p){
  vec3 amb = ambientLocal(p);
  vec3 c = samp(u_cssRes - p, 0.0);
  c = shade(c, amb, 0.70, 0.08);
  return toneLock(c, amb, 1.08);
}

vec3 blackholeFx(vec2 p){
  // Warp is the effect; core darkens, rim stays relatively clear
  vec3 amb = ambientLocal(p);
  vec2 c2 = u_cssRes * 0.5;
  vec2 d = p - c2;
  float r = length(d) + 1e-4;
  float rs = min(u_cssRes.x, u_cssRes.y) * 0.12;
  float mass = rs * rs * (1.0 + 0.08 * sin(At(0.25)));
  float soft = rs * 0.30;
  vec2 un = d / r;
  float defl = mass / (r * r + soft * soft);
  float rS = r + defl * r * 0.65 + (mass * 0.24) / (r + soft);
  float ang = (0.28 + 0.04 * sin(At(0.22))) * (rs / (r + soft));
  float ca = cos(ang);
  float sa = sin(ang);
  vec2 ru = vec2(un.x * ca - un.y * sa, un.x * sa + un.y * ca);
  float core = 1.0 - smoothstep(0.0, rs * 1.6, r);
  float R = mix(max(1.0, u_cssRes.y * 0.04), max(3.0, u_cssRes.y * 0.12), core);
  vec3 c = softSamp(c2 + ru * rS, R);
  float ringD = abs(r - rs * 2.0);
  float ring = exp(-ringD * ringD / max(1e-3, rs * rs * 0.10)) * 0.12;
  c += ring * vec3(1.0, 0.92, 0.78) * (0.28 + luma(amb));
  c = shade(c, amb, 0.10, core * 0.72);
  return toneLock(c, amb, 1.05);
}

void main(){
  vec2 p = vec2(v_uv.x, 1.0 - v_uv.y) * u_cssRes; // top-down CSS coords
  vec3 c;
  if      (u_effect == 0)  c = solidFx(p);
  else if (u_effect == 1)  c = mosaicFx(p);
  else if (u_effect == 3)  c = frostFx(p);
  else if (u_effect == 4)  c = glassFx(p);
  else if (u_effect == 5)  c = shadeWaveFx(p);
  else if (u_effect == 6)  c = softVoidFx(p);
  else if (u_effect == 7)  c = veilFx(p);
  else if (u_effect == 8)  c = smokeFx(p);
  else if (u_effect == 9)  c = prismFx(p);
  else if (u_effect == 10) c = rippleFx(p);
  else if (u_effect == 11) c = glitchFx(p);
  else if (u_effect == 12) c = flipFx(p);
  else if (u_effect == 13) c = slowBlurFx(p);
  else if (u_effect == 14) c = blackholeFx(p);
  else                     c = liquidGlassFx(p);

  c = grain(c, p);
  float a = feather(p);
  fragColor = vec4(clamp(c, 0.0, 1.0) * a, a); // premultiplied
}
`

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)
  if (!sh) throw new Error('createShader failed')
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh)
    gl.deleteShader(sh)
    throw new Error(`shader compile failed: ${log}`)
  }
  return sh
}

export class MaskGlEngine {
  private gl: WebGL2RenderingContext
  private prog: WebGLProgram
  private tex: WebGLTexture
  private vao: WebGLVertexArrayObject
  private u: Record<string, WebGLUniformLocation | null> = {}
  private texW = 0
  private texH = 0
  private maxLod = 0
  readonly canvas: HTMLCanvasElement

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const gl = canvas.getContext('webgl2', {
      // alpha ON: the cover feathers into the real video at its boundary
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    })
    if (!gl) throw new Error('WebGL2 unavailable')
    this.gl = gl

    const vs = compile(gl, gl.VERTEX_SHADER, VERT)
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const prog = gl.createProgram()
    if (!prog) throw new Error('createProgram failed')
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`program link failed: ${gl.getProgramInfoLog(prog)}`)
    }
    gl.deleteShader(vs)
    gl.deleteShader(fs)
    this.prog = prog

    const vao = gl.createVertexArray()
    if (!vao) throw new Error('createVertexArray failed')
    this.vao = vao
    gl.bindVertexArray(vao)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    )
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    gl.bindVertexArray(null)

    const tex = gl.createTexture()
    if (!tex) throw new Error('createTexture failed')
    this.tex = tex
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

    gl.useProgram(prog)
    for (const name of [
      'u_tex',
      'u_cssRes',
      'u_dpr',
      'u_time',
      'u_effect',
      'u_blockCss',
      'u_friction',
      'u_maxLod',
    ]) {
      this.u[name] = gl.getUniformLocation(prog, name)
    }
    gl.uniform1i(this.u.u_tex, 0)
  }

  /** Upload the latest cropped strip frame (canvas/video source, physical px). */
  upload(src: TexImageSource, w: number, h: number) {
    const gl = this.gl
    gl.bindTexture(gl.TEXTURE_2D, this.tex)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src)
    gl.generateMipmap(gl.TEXTURE_2D)
    this.texW = w
    this.texH = h
    this.maxLod = Math.max(0, Math.floor(Math.log2(Math.max(w, h))))
  }

  hasFrame(): boolean {
    return this.texW > 0 && this.texH > 0
  }

  draw(opts: {
    effect: CoverEffect | string
    timeMs: number
    cssW: number
    cssH: number
    dpr: number
    friction?: number
  }) {
    const gl = this.gl
    const eff = normalizeEffect(String(opts.effect))
    const id = GL_EFFECT_IDS[eff] ?? GL_EFFECT_IDS.liquid_glass
    const friction = opts.friction ?? TARGET_FRICTION
    const blockCss = blockSizeForFriction(Math.max(8, opts.cssH), friction)

    const pw = Math.max(2, Math.round(opts.cssW * opts.dpr))
    const ph = Math.max(2, Math.round(opts.cssH * opts.dpr))
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw
      this.canvas.height = ph
    }

    gl.viewport(0, 0, pw, ph)
    gl.useProgram(this.prog)
    gl.bindVertexArray(this.vao)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.tex)

    gl.uniform2f(this.u.u_cssRes, opts.cssW, opts.cssH)
    gl.uniform1f(this.u.u_dpr, opts.dpr)
    gl.uniform1f(this.u.u_time, opts.timeMs * 0.001)
    gl.uniform1i(this.u.u_effect, this.hasFrame() ? id : GL_EFFECT_IDS.solid)
    gl.uniform1f(this.u.u_blockCss, blockCss)
    gl.uniform1f(this.u.u_friction, friction)
    gl.uniform1f(this.u.u_maxLod, this.maxLod)

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.bindVertexArray(null)
  }

  dispose() {
    const gl = this.gl
    gl.deleteTexture(this.tex)
    gl.deleteProgram(this.prog)
    gl.deleteVertexArray(this.vao)
  }
}

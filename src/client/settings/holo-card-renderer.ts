/**
 * Shared WebGL2 holographic foil overlay renderer for the top four portrait cards.
 * Inspired by React Bits HoloCard (https://reactbits.dev/components/holo-card):
 * renders procedural foil patterns (bursts, stars, cosmos, shards), Blinn-Phong
 * specular glare, metallic frame sheen, and hexagonal edge sparkles onto a single
 * shared offscreen WebGL2 canvas and blits to each card's 2D overlay canvas.
 */

export type HoloPreset = 'bursts' | 'stars' | 'cosmos' | 'shards'

export interface HoloDrawParams {
  preset: HoloPreset
  tiltX: number
  tiltY: number
  lightX: number
  lightY: number
  awake: number
  intensity: number
  edgeSparkle: number
  glare: number
  radius: number
  dark: boolean
  foilColor: readonly [number, number, number]
}

const PRESET_INDEX: Record<HoloPreset, number> = {
  bursts: 0,
  stars: 1,
  cosmos: 2,
  shards: 3,
}

const PERSPECTIVE = 1100

const VERTEX_SOURCE = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`

const FRAGMENT_SOURCE = `#version 300 es
precision highp float;

uniform vec2 uSize;
uniform float uAspect;
uniform vec2 uTilt;
uniform vec2 uLight;
uniform float uDistance;
uniform int uPreset;
uniform float uIntensity;
uniform float uEdge;
uniform float uFrame;
uniform float uRadius;
uniform float uGlare;
uniform float uAwake;
uniform float uDark;
uniform vec3 uFoil;

out vec4 outColor;

const float TAU = 6.28318530718;

struct Foil {
  float mask;
  float angle;
  float jitter;
  vec2 facet;
};

float hash(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

vec2 hash2(vec2 p) {
  return vec2(hash(p), hash(p + 17.31));
}

vec3 hue(float t) {
  t = abs(fract(t * 0.5) * 2.0 - 1.0);
  vec3 c = mix(vec3(0.14, 0.36, 1.0), vec3(0.06, 0.86, 0.98), smoothstep(0.0, 0.25, t));
  c = mix(c, vec3(0.32, 0.96, 0.48), smoothstep(0.25, 0.45, t));
  c = mix(c, vec3(1.0, 0.9, 0.22), smoothstep(0.45, 0.65, t));
  c = mix(c, vec3(1.0, 0.52, 0.24), smoothstep(0.65, 0.85, t));
  return mix(c, vec3(0.95, 0.24, 0.56), smoothstep(0.85, 1.0, t));
}

Foil bursts(vec2 p) {
  vec2 q = mat2(0.7071068, 0.7071068, -0.7071068, 0.7071068) * (p - vec2(0.5, 0.5 * uAspect)) / 0.26;
  vec2 d = fract(q) - 0.5;
  float u = length(d) / 0.49;
  float angle = atan(d.y, d.x);
  if (u < 0.12) {
    float ring = min(floor(u / 0.045 + 0.5), 2.0);
    float count = max(1.0, ring * 6.0);
    float spot = (floor(angle / TAU * count) + 0.5) / count * TAU;
    vec2 pt = vec2(cos(spot), sin(spot)) * ring * 0.045;
    float m = smoothstep(0.024, 0.012, length(d / 0.49 - pt));
    return Foil(m, angle, 0.5, vec2(0.0));
  }
  bool inner = u < 0.66;
  float slot = angle / TAU * (inner ? 56.0 : 72.0);
  bool shifted = mod(floor(slot), 2.0) > 0.5;
  vec2 band = inner ? (shifted ? vec2(0.45, 0.61) : vec2(0.33, 0.49)) : (shifted ? vec2(0.84, 0.99) : vec2(0.7, 0.85));
  float across = abs(u - (band.x + band.y) * 0.5) / ((band.y - band.x) * 0.5);
  float along = abs(fract(slot) - 0.5) * 2.0;
  float width = inner ? 0.72 : 0.6;
  float m = smoothstep(1.0, 0.78, across) * smoothstep(width, width - 0.2, along);
  return Foil(m, angle, 0.5, vec2(0.0));
}

Foil stars(vec2 p) {
  Foil best = Foil(0.0, 0.0, 0.0, vec2(0.0));
  vec2 g = p / 0.085;
  vec2 base = floor(g);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 id = base + vec2(float(i), float(j));
      float pick = hash(id + 1.3);
      vec2 d = g - (id + 0.5 + (hash2(id) - 0.5) * 0.55);
      float m = smoothstep(0.07, 0.035, length(d));
      if (pick < 0.62) {
        float size = mix(0.16, 0.5, pow(hash(id + 9.0), 1.8));
        float sector = TAU / (pick < 0.3 ? 4.0 : 5.0);
        float k = abs(fract((atan(d.y, d.x) + hash(id + 4.0) * TAU) / sector) - 0.5) * 2.0;
        float edge = size * mix(1.0, 0.36, pow(k, 0.6));
        m = smoothstep(edge, edge * 0.8, length(d));
      }
      if (m > best.mask) best = Foil(m, hash(id + 6.0) * TAU, hash(id + 8.0), (hash2(id + 2.0) - 0.5) * 0.6);
    }
  }
  return best;
}

Foil cosmos(vec2 p) {
  Foil best = Foil(0.0, 0.0, 0.0, vec2(0.0));
  vec2 g = p / 0.16;
  vec2 base = floor(g);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 id = base + vec2(float(i), float(j));
      vec2 d = g - (id + 0.5 + (hash2(id) - 0.5) * 0.7);
      float size = mix(0.16, 0.52, hash(id + 2.0));
      float r = length(d);
      float m = max(smoothstep(0.05, 0.0, abs(r - size)), smoothstep(size, size - 0.04, r) * 0.22);
      if (m > best.mask) best = Foil(m, hash(id + 6.0) * TAU + atan(d.y, d.x) * 0.5, hash(id + 1.0), (hash2(id + 4.0) - 0.5) * 0.5);
    }
  }
  vec2 fine = p / 0.036;
  vec2 cell = floor(fine);
  float dots = smoothstep(0.2, 0.1, length(fine - cell - 0.5 - (hash2(cell + 9.0) - 0.5) * 0.6)) * step(0.55, hash(cell + 2.0));
  if (dots > best.mask) best = Foil(dots, hash(cell) * TAU, hash(cell + 3.0), (hash2(cell + 7.0) - 0.5) * 0.6);
  return best;
}

Foil shards(vec2 p) {
  vec2 g = p * 16.0;
  vec2 base = floor(g);
  float best = 9.0;
  float second = 9.0;
  vec2 id = base;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 cell = base + vec2(float(i), float(j));
      float d = length(cell + 0.08 + hash2(cell) * 0.84 - g);
      if (d < best) {
        second = best;
        best = d;
        id = cell;
      } else if (d < second) {
        second = d;
      }
    }
  }
  float crack = smoothstep(0.015, 0.07, second - best);
  float shine = 0.25 + 0.75 * pow(hash(id + 7.7), 2.0);
  return Foil((0.2 + 0.8 * crack) * shine, hash(id + 3.17) * TAU, hash(id + 11.73), (hash2(id + 5.0) - 0.5) * 0.5);
}

vec3 sparkles(vec2 p, vec3 halfway, vec2 sweep, float awake) {
  vec2 g = p * 56.0;
  vec2 cell = floor(g);
  vec2 d = fract(g) - 0.5 - (hash2(cell) - 0.5) * 0.36;
  float spin = hash(cell + 3.0) * TAU;
  d = mat2(cos(spin), -sin(spin), sin(spin), cos(spin)) * d;
  vec2 a = abs(d);
  float hexagon = max(a.x * 0.866 + a.y * 0.5, a.y);
  float size = mix(0.22, 0.38, hash(cell + 2.0));
  float piece = smoothstep(size, size - 0.07, hexagon) * step(0.42, hash(cell + 4.0));
  vec3 facet = normalize(vec3((hash2(cell + 6.0) - 0.5) * 0.9, 1.0));
  float flash = pow(max(dot(facet, halfway), 0.0), 6.0);
  vec3 tint = hue(dot(sweep, vec2(cos(spin), sin(spin))) * 1.2 + dot(sweep, vec2(0.8, 0.6)) * 0.8 + hash(cell + 8.0) * 0.5);
  vec3 color = piece * tint * (0.35 + 1.55 * flash) * awake;
  vec2 fine = p * 185.0;
  vec2 speckCell = floor(fine);
  float speck = smoothstep(0.24, 0.0, length(fract(fine) - 0.5 - (hash2(speckCell) - 0.5) * 0.5)) * step(0.72, hash(speckCell + 1.0));
  float speckFlash = pow(max(dot(normalize(vec3((hash2(speckCell + 2.0) - 0.5) * 0.9, 1.0)), halfway), 0.0), 10.0);
  return color + vec3(1.2) * speck * speckFlash * (1.0 - piece);
}

vec4 blendOver(vec4 dst, vec3 srcRgb, float srcA) {
  float a = clamp(srcA, 0.0, 1.0);
  vec3 rgb = clamp(srcRgb, 0.0, 1.0) * a + dst.rgb * (1.0 - a);
  float outA = a + dst.a * (1.0 - a);
  return vec4(rgb, outA);
}

void main() {
  vec2 uv = vec2(gl_FragCoord.x / uSize.x, 1.0 - gl_FragCoord.y / uSize.y);
  vec2 p = vec2(uv.x, uv.y * uAspect);
  vec2 center = vec2(0.5, 0.5 * uAspect);
  vec2 q = abs(p - center) - center + uRadius;
  float outside = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uRadius;
  float pixel = 1.0 / uSize.x;
  float cardAlpha = clamp(0.5 - outside / pixel, 0.0, 1.0);
  if (cardAlpha <= 0.0) {
    outColor = vec4(0.0);
    return;
  }

  mat3 rx = mat3(1.0, 0.0, 0.0, 0.0, cos(uTilt.x), sin(uTilt.x), 0.0, -sin(uTilt.x), cos(uTilt.x));
  mat3 ry = mat3(cos(uTilt.y), 0.0, -sin(uTilt.y), 0.0, 1.0, 0.0, sin(uTilt.y), 0.0, cos(uTilt.y));
  mat3 turn = rx * ry;
  vec3 world = turn * vec3(p - center, 0.0);
  vec3 view = normalize(transpose(turn) * (vec3(0.0, 0.0, uDistance) - world));
  vec3 lamp = vec3((uLight - 0.5) * vec2(1.15, 1.15 * uAspect), 0.9);
  vec3 light = normalize(transpose(turn) * (lamp - world));
  vec3 halfway = normalize(light + view);
  vec2 sweep = light.xy + view.xy;
  float sheen = pow(max(halfway.z, 0.0), 8.0);
  float shine = pow(max(halfway.z, 0.0), 64.0);
  float frame = 1.0 - smoothstep(uFrame - pixel, uFrame + pixel, -outside);

  Foil f;
  if (uPreset == 0) f = bursts(p);
  else if (uPreset == 1) f = stars(p);
  else if (uPreset == 2) f = cosmos(p);
  else f = shards(p);

  vec4 look = uPreset == 0 ? vec4(0.25, 1.9, 0.12, 0.85)
    : uPreset == 1 ? vec4(0.6, 1.4, 0.3, 0.9)
    : uPreset == 2 ? vec4(0.7, 1.2, 0.35, 0.8)
    : vec4(0.9, 0.9, 0.6, 0.55);

  vec2 dir = vec2(cos(f.angle), sin(f.angle));
  float phase = dot(sweep, dir) * look.x + dot(sweep, vec2(0.8, 0.6)) * look.y + f.jitter * look.z;
  vec3 tint = hue(phase);
  float glint = pow(max(dot(normalize(vec3(f.facet, 1.0)), halfway), 0.0), 20.0) * step(0.001, length(f.facet));
  float band = uPreset == 3 ? 0.35 + 0.65 * smoothstep(0.25, 0.95, 0.5 + 0.5 * cos(phase * TAU * 0.5 + 1.3)) : 1.0;

  // Keep the central mascot artwork crisp while letting foil & sparkles blaze around it.
  bool isDark = uDark > 0.5;
  vec2 rel = (uv - vec2(0.5, 0.52)) * vec2(1.18, 1.06);
  float distCenter = length(rel);
  float foilGuard = mix(isDark ? 0.14 : 0.16, 1.0, smoothstep(0.18, 0.5, distCenter));
  float glareGuard = mix(0.26, 1.0, smoothstep(0.16, 0.5, distCenter));
  float spotlight = smoothstep(0.9, 0.08, length(uv - uLight));
  float activeFade = smoothstep(0.02, 0.22, uAwake);

  vec3 lightTint = pow(clamp(tint, 0.0, 1.0), vec3(1.65)) * 0.58;
  vec3 foilRgb = isDark
    ? mix(tint, vec3(1.0), 0.14) * (1.06 + 0.34 * sheen) + uFoil * glint * 0.9
    : mix(lightTint, lightTint * 1.25 + vec3(0.08, 0.1, 0.16), sheen * 0.45) + mix(vec3(0.18, 0.22, 0.32), tint * 0.65, 0.5) * glint * 0.8;
  float foilBase = uIntensity * f.mask * look.w * band * (1.0 - frame) * foilGuard * uAwake;
  float foilAlpha = isDark
    ? foilBase * (0.32 + 0.54 * spotlight + 0.26 * sheen)
    : clamp(foilBase * (0.58 + 0.68 * spotlight + 0.34 * sheen), 0.0, 0.72);

  float sparkWake = smoothstep(0.14, 0.82, uAwake);
  vec3 rawSpark = sparkles(p, halfway, sweep, mix(0.2, 0.95, sparkWake)) * uEdge * frame * (0.28 * activeFade + 0.72 * sparkWake);
  vec3 sparkRgb = isDark
    ? mix(rawSpark, uFoil * max(rawSpark.r, max(rawSpark.g, rawSpark.b)), 0.3)
    : mix(pow(clamp(rawSpark, 0.0, 1.0), vec3(1.45)) * 0.68, vec3(0.38, 0.42, 0.5), 0.28);
  float sparkPeak = max(rawSpark.r, max(rawSpark.g, rawSpark.b));
  float sparkAlpha = isDark ? clamp(sparkPeak * 0.55, 0.0, 0.58) : clamp(sparkPeak * 0.56, 0.0, 0.52);

  vec3 rimRgb = isDark
    ? uFoil
    : mix(vec3(0.28, 0.3, 0.36), lightTint * 1.05, 0.24 + 0.22 * sheen);
  float rimAlpha = isDark
    ? (0.04 + 0.16 * sheen) * frame * uAwake
    : (0.07 + 0.18 * sheen) * frame * activeFade;

  vec3 prismSweep = pow(clamp(hue(dot(sweep, vec2(0.7, 0.5)) * 1.1 + uv.x * 0.55 + uv.y * 0.35), 0.0, 1.0), vec3(1.5)) * 0.62;
  vec3 glareRgb = isDark ? vec3(1.0) : mix(prismSweep, vec3(1.0), clamp(shine * 1.2, 0.0, 0.82));
  float glareAlpha = isDark
    ? (sheen * 0.1 * glareGuard + shine * 0.32) * uGlare * uAwake
    : (sheen * 0.22 * glareGuard + shine * 0.38 * mix(0.45, 1.0, glareGuard)) * uGlare * uAwake;

  vec4 acc = vec4(0.0);
  acc = blendOver(acc, foilRgb, foilAlpha);
  acc = blendOver(acc, rimRgb, rimAlpha);
  acc = blendOver(acc, sparkRgb, sparkAlpha);
  acc = blendOver(acc, glareRgb, glareAlpha);

  vec3 gammaRgb = acc.a > 0.001 ? pow(clamp(acc.rgb / acc.a, 0.0, 1.0), vec3(1.0 / 2.2)) * acc.a : vec3(0.0);
  outColor = vec4(gammaRgb * cardAlpha, acc.a * cardAlpha);
}
`

const UNIFORM_NAMES = [
  'uSize',
  'uAspect',
  'uTilt',
  'uLight',
  'uDistance',
  'uPreset',
  'uIntensity',
  'uEdge',
  'uFrame',
  'uRadius',
  'uGlare',
  'uAwake',
  'uDark',
  'uFoil',
] as const

type UniformName = typeof UNIFORM_NAMES[number]

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader
  gl.deleteShader(shader)
  return null
}

class SharedHoloRenderer {
  private readonly canvas: HTMLCanvasElement
  private readonly gl: WebGL2RenderingContext
  private readonly program: WebGLProgram
  private readonly buffer: WebGLBuffer
  private readonly uniforms: Record<UniformName, WebGLUniformLocation | null>
  private refs = 0

  private constructor(
    canvas: HTMLCanvasElement,
    gl: WebGL2RenderingContext,
    program: WebGLProgram,
    buffer: WebGLBuffer,
    uniforms: Record<UniformName, WebGLUniformLocation | null>,
  ) {
    this.canvas = canvas
    this.gl = gl
    this.program = program
    this.buffer = buffer
    this.uniforms = uniforms
  }

  static create(): SharedHoloRenderer | null {
    if (typeof document === 'undefined') return null
    const canvas = document.createElement('canvas')
    let gl: WebGL2RenderingContext | null = null
    try {
      gl = canvas.getContext('webgl2', {
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        failIfMajorPerformanceCaveat: true,
      })
    } catch {
      return null
    }
    if (!gl) return null

    const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SOURCE)
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SOURCE)
    if (!vertex || !fragment) {
      if (vertex) gl.deleteShader(vertex)
      if (fragment) gl.deleteShader(fragment)
      return null
    }

    const program = gl.createProgram()
    if (!program) {
      gl.deleteShader(vertex)
      gl.deleteShader(fragment)
      return null
    }
    gl.attachShader(program, vertex)
    gl.attachShader(program, fragment)
    gl.bindAttribLocation(program, 0, 'position')
    gl.linkProgram(program)
    gl.deleteShader(vertex)
    gl.deleteShader(fragment)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program)
      return null
    }

    const buffer = gl.createBuffer()
    if (!buffer) {
      gl.deleteProgram(program)
      return null
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

    const uniforms = Object.fromEntries(
      UNIFORM_NAMES.map(name => [name, gl.getUniformLocation(program, name)]),
    ) as Record<UniformName, WebGLUniformLocation | null>

    return new SharedHoloRenderer(canvas, gl, program, buffer, uniforms)
  }

  retain(): void {
    this.refs += 1
  }

  release(): boolean {
    this.refs = Math.max(0, this.refs - 1)
    if (this.refs > 0) return false
    this.gl.deleteBuffer(this.buffer)
    this.gl.deleteProgram(this.program)
    return true
  }

  renderTo(target: HTMLCanvasElement, params: HoloDrawParams): boolean {
    const clientWidth = target.clientWidth
    const clientHeight = target.clientHeight
    if (!clientWidth || !clientHeight) return false
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const width = Math.max(1, Math.round(clientWidth * dpr))
    const height = Math.max(1, Math.round(clientHeight * dpr))
    if (target.width !== width || target.height !== height) {
      target.width = width
      target.height = height
    }
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width
      this.canvas.height = height
    }

    const ctx = target.getContext('2d')
    if (!ctx) return false

    const gl = this.gl
    gl.viewport(0, 0, width, height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(this.program)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

    gl.uniform2f(this.uniforms.uSize, width, height)
    gl.uniform1f(this.uniforms.uAspect, height / width)
    gl.uniform2f(this.uniforms.uTilt, (params.tiltX * Math.PI) / 180, (params.tiltY * Math.PI) / 180)
    gl.uniform2f(this.uniforms.uLight, params.lightX, params.lightY)
    gl.uniform1f(this.uniforms.uDistance, PERSPECTIVE / Math.max(1, clientWidth))
    gl.uniform1i(this.uniforms.uPreset, PRESET_INDEX[params.preset])
    gl.uniform1f(this.uniforms.uIntensity, params.intensity)
    gl.uniform1f(this.uniforms.uEdge, params.edgeSparkle)
    gl.uniform1f(this.uniforms.uFrame, 0.028)
    gl.uniform1f(this.uniforms.uRadius, params.radius / Math.max(1, clientWidth))
    gl.uniform1f(this.uniforms.uGlare, params.glare)
    gl.uniform1f(this.uniforms.uAwake, params.awake)
    gl.uniform1f(this.uniforms.uDark, params.dark ? 1 : 0)
    gl.uniform3f(this.uniforms.uFoil, params.foilColor[0], params.foilColor[1], params.foilColor[2])

    gl.drawArrays(gl.TRIANGLES, 0, 3)

    ctx.clearRect(0, 0, width, height)
    ctx.drawImage(this.canvas, 0, 0)
    return true
  }
}

let shared: SharedHoloRenderer | null = null
let unavailable = false

export function acquireHoloRenderer(): SharedHoloRenderer | null {
  if (unavailable) return null
  if (!shared) {
    shared = SharedHoloRenderer.create()
    if (!shared) {
      unavailable = true
      return null
    }
  }
  shared.retain()
  return shared
}

export function releaseHoloRenderer(renderer: SharedHoloRenderer | null): void {
  if (!renderer) return
  if (renderer.release() && shared === renderer) shared = null
}

export function isHoloPreset(value: string | undefined): value is HoloPreset {
  return value === 'bursts' || value === 'stars' || value === 'cosmos' || value === 'shards'
}

export type { SharedHoloRenderer }

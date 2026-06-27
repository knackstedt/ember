#version 450

layout(set = 0, binding = 0) uniform sampler2D u_inputImage;

layout(location = 0) in vec2 v_texcoord;
layout(location = 0) out vec4 outColor;

layout(push_constant) uniform PushConstants {
    float intensity;   // global blend 0-1
    float time;        // frame counter (for animated effects)
    vec2  resolution;  // swapchain dimensions
    float preset;      // 0=none, 1=crt, 2=bloom, 3=color-grade, ...
    float params[8];   // per-shader parameters (meaning depends on preset)
} pc;

// --- Utility ---

float random(vec2 st) {
    return fract(sin(dot(st, vec2(12.9898, 78.233))) * 43758.5453123);
}

vec3 sampleOffset(float dx, float dy) {
    return texture(u_inputImage, v_texcoord + vec2(dx, dy)).rgb;
}

float luma(vec3 c) {
    return dot(c, vec3(0.299, 0.587, 0.114));
}

// --- 1: CRT (scanlines + RGB aberration + vignette) ---
// params[0]=scanlineStrength, params[1]=aberration, params[2]=vignetteStrength
vec3 crtEffect(vec2 uv, vec3 color) {
    float scanline = sin(uv.y * pc.resolution.y * 3.14159) * 0.5 + 0.5;
    scanline = mix(1.0, scanline, pc.params[0] * pc.intensity);
    float shift = pc.params[1] * pc.intensity;
    vec3 ab;
    ab.r = texture(u_inputImage, uv + vec2(shift, 0.0)).r;
    ab.g = color.g;
    ab.b = texture(u_inputImage, uv - vec2(shift, 0.0)).b;
    vec2 center = uv - 0.5;
    float vig = 1.0 - dot(center, center) * pc.params[2] * pc.intensity;
    return ab * scanline * vig;
}

// --- 2: Bloom ---
// params[0]=radius, params[1]=mixAmount
vec3 bloomEffect(vec2 uv, vec3 color) {
    vec3 bloom = vec3(0.0);
    float radius = pc.params[0] * pc.intensity;
    for (int x = -2; x <= 2; x++) {
        for (int y = -2; y <= 2; y++) {
            bloom += texture(u_inputImage, uv + vec2(float(x), float(y)) * radius).rgb;
        }
    }
    bloom /= 25.0;
    return color + bloom * pc.params[1] * pc.intensity;
}

// --- 3: Color Grade (warm cinematic) ---
// params[0]=warmth, params[1]=contrast, params[2]=saturation
vec3 colorGradeEffect(vec2 uv, vec3 color) {
    color.r *= 1.0 + pc.params[0] * pc.intensity;
    color.b *= 1.0 - pc.params[0] * pc.intensity;
    color = (color - 0.5) * (1.0 + pc.params[1] * pc.intensity) + 0.5;
    float gray = luma(color);
    color = mix(vec3(gray), color, 1.0 + pc.params[2] * pc.intensity);
    return color;
}

// --- 4: FXAA (simplified edge anti-aliasing) ---
// params[0]=threshold
vec3 fxaaEffect(vec2 uv, vec3 color) {
    vec2 texel = 1.0 / pc.resolution;
    float lN = luma(sampleOffset(0.0, -texel.y));
    float lS = luma(sampleOffset(0.0,  texel.y));
    float lW = luma(sampleOffset(-texel.x, 0.0));
    float lE = luma(sampleOffset( texel.x, 0.0));
    float lM = luma(color);
    float lMin = min(lM, min(min(lN, lS), min(lW, lE)));
    float lMax = max(lM, max(max(lN, lS), max(lW, lE)));
    if (lMax - lMin < pc.params[0]) return color;
    float dx = -(lN + lS) + (lW + lE);
    float dy = -(lW + lE) + (lN + lS);
    vec2 dir = vec2(dx, dy);
    float len = length(dir);
    if (len < 0.001) return color;
    dir = (dir / len) * texel * pc.intensity;
    vec3 blend = sampleOffset(dir.x * 0.5, dir.y * 0.5);
    return mix(color, blend, 0.5 * pc.intensity);
}

// --- 5: CAS (Contrast Adaptive Sharpening) ---
// params[0]=sharpness
vec3 casEffect(vec2 uv, vec3 color) {
    vec2 texel = 1.0 / pc.resolution;
    vec3 a = sampleOffset(0.0, texel.y);
    vec3 b = sampleOffset(-texel.x, 0.0);
    vec3 c = sampleOffset(texel.x, 0.0);
    vec3 d = sampleOffset(0.0, -texel.y);
    float mn = min(min(luma(a), luma(b)), min(luma(c), luma(d)));
    float mx = max(max(luma(a), luma(b)), max(luma(c), luma(d)));
    float w = 1.0 + pc.params[0] * pc.intensity * (1.0 - (mx - mn) / max(mx, 0.001));
    vec3 sharpened = color * w - (a + b + c + d) * 0.25 * (w - 1.0);
    return mix(color, clamp(sharpened, 0.0, 1.0), pc.intensity);
}

// --- 6: Grayscale ---
vec3 grayscaleEffect(vec2 uv, vec3 color) {
    float gray = luma(color);
    return mix(color, vec3(gray), pc.intensity);
}

// --- 7: Sepia ---
vec3 sepiaEffect(vec2 uv, vec3 color) {
    vec3 sepia = vec3(
        dot(color, vec3(0.393, 0.769, 0.189)),
        dot(color, vec3(0.349, 0.686, 0.168)),
        dot(color, vec3(0.272, 0.534, 0.131))
    );
    return mix(color, clamp(sepia, 0.0, 1.0), pc.intensity);
}

// --- 8: Vignette ---
// params[0]=innerRadius, params[1]=outerRadius
vec3 vignetteEffect(vec2 uv, vec3 color) {
    vec2 center = uv - 0.5;
    float dist = length(center);
    float vig = 1.0 - smoothstep(pc.params[0], pc.params[1], dist) * pc.intensity;
    return color * vig;
}

// --- 9: Film Grain ---
// params[0]=noiseAmount
vec3 filmGrainEffect(vec2 uv, vec3 color) {
    float noise = random(uv * pc.resolution + pc.time) - 0.5;
    return color + noise * pc.params[0] * pc.intensity;
}

// --- 10: Chromatic Aberration ---
// params[0]=shiftAmount
vec3 chromaticAberrationEffect(vec2 uv, vec3 color) {
    vec2 dir = uv - 0.5;
    float shift = pc.params[0] * pc.intensity;
    vec3 ab;
    ab.r = texture(u_inputImage, uv + dir * shift).r;
    ab.g = color.g;
    ab.b = texture(u_inputImage, uv - dir * shift).b;
    return ab;
}

// --- 11: Sharpen (unsharp mask) ---
// params[0]=amount
vec3 sharpenEffect(vec2 uv, vec3 color) {
    vec2 texel = 1.0 / pc.resolution;
    vec3 blur = (
        sampleOffset(-texel.x, 0.0) +
        sampleOffset( texel.x, 0.0) +
        sampleOffset(0.0, -texel.y) +
        sampleOffset(0.0,  texel.y)
    ) * 0.25;
    vec3 highFreq = color - blur;
    return clamp(color + highFreq * pc.params[0] * pc.intensity, 0.0, 1.0);
}

// --- 12: Gaussian Blur ---
// params[0]=sigma
vec3 blurEffect(vec2 uv, vec3 color) {
    vec2 texel = 1.0 / pc.resolution;
    float sigma = pc.params[0] * pc.intensity + 0.5;
    vec3 sum = vec3(0.0);
    float weight = 0.0;
    for (int x = -3; x <= 3; x++) {
        for (int y = -3; y <= 3; y++) {
            float w = exp(-float(x*x + y*y) / (2.0 * sigma * sigma));
            sum += texture(u_inputImage, uv + vec2(float(x), float(y)) * texel).rgb * w;
            weight += w;
        }
    }
    return sum / weight;
}

// --- 13: Pixelate ---
// params[0]=pixelCount
vec3 pixelateEffect(vec2 uv, vec3 color) {
    float pixels = mix(8.0, pc.params[0], 1.0 - pc.intensity);
    vec2 pixelSize = pc.resolution / pixels;
    vec2 pix = floor(uv * pixelSize) / pixelSize;
    return texture(u_inputImage, pix).rgb;
}

// --- 14: Posterize ---
// params[0]=levels
vec3 posterizeEffect(vec2 uv, vec3 color) {
    float levels = mix(2.0, pc.params[0], 1.0 - pc.intensity);
    return floor(color * levels) / max(levels - 1.0, 1.0);
}

// --- 15: Invert ---
vec3 invertEffect(vec2 uv, vec3 color) {
    return mix(color, 1.0 - color, pc.intensity);
}

// --- 16: Scanline (simple, no CRT curvature) ---
// params[0]=strength
vec3 scanlineEffect(vec2 uv, vec3 color) {
    float scanline = sin(uv.y * pc.resolution.y * 3.14159) * 0.5 + 0.5;
    scanline = mix(1.0, scanline, pc.params[0] * pc.intensity);
    return color * scanline;
}

// --- 18: VHS (tracking distortion + noise + color shift) ---
// params[0]=warpAmount, params[1]=noiseAmount
vec3 vhsEffect(vec2 uv, vec3 color) {
    float t = pc.time * 0.01;
    float warp = sin(uv.y * 80.0 + t * 5.0) * pc.params[0] * pc.intensity;
    vec2 warped = uv + vec2(warp, 0.0);
    vec3 wc = texture(u_inputImage, warped).rgb;
    float scan = sin(uv.y * pc.resolution.y * 1.5 + t * 50.0) * 0.05 * pc.intensity;
    wc += scan;
    wc.r = texture(u_inputImage, warped + vec2(pc.params[0] * pc.intensity, 0.0)).r;
    wc.b = texture(u_inputImage, warped - vec2(pc.params[0] * pc.intensity, 0.0)).b;
    float noise = random(vec2(uv.x, floor(uv.y * 250.0) + t * 60.0)) * pc.params[1] * pc.intensity;
    wc += noise;
    return wc;
}

// --- 19: Night Vision (green amplification + scanlines + noise) ---
// params[0]=gain, params[1]=noiseAmount
vec3 nightVisionEffect(vec2 uv, vec3 color) {
    float lum = luma(color);
    lum = clamp(lum * (1.0 + pc.params[0] * pc.intensity), 0.0, 1.0);
    vec3 green = vec3(0.0, lum, 0.0);
    vec2 center = uv - 0.5;
    float vig = 1.0 - smoothstep(0.2, 0.7, length(center)) * pc.intensity;
    green *= vig;
    float scan = sin(uv.y * pc.resolution.y * 3.14159) * 0.1 + 0.9;
    green *= scan;
    float noise = random(uv * pc.resolution + pc.time) * pc.params[1] * pc.intensity;
    green += noise;
    return green;
}

// --- 20: Thermal (luminance-to-thermal gradient) ---
// params[0]=gain
vec3 thermalEffect(vec2 uv, vec3 color) {
    float lum = clamp(luma(color) * (1.0 + pc.params[0] * pc.intensity), 0.0, 1.0);
    vec3 thermal;
    if (lum < 0.25) {
        thermal = mix(vec3(0.0, 0.0, 0.5), vec3(0.5, 0.0, 0.5), lum * 4.0);
    } else if (lum < 0.5) {
        thermal = mix(vec3(0.5, 0.0, 0.5), vec3(1.0, 0.0, 0.0), (lum - 0.25) * 4.0);
    } else if (lum < 0.75) {
        thermal = mix(vec3(1.0, 0.0, 0.0), vec3(1.0, 1.0, 0.0), (lum - 0.5) * 4.0);
    } else {
        thermal = mix(vec3(1.0, 1.0, 0.0), vec3(1.0, 1.0, 1.0), (lum - 0.75) * 4.0);
    }
    return thermal;
}

// --- 21: Edge Detection (Sobel operator) ---
// params[0]=sensitivity
vec3 edgeDetectEffect(vec2 uv, vec3 color) {
    vec2 t = 1.0 / pc.resolution;
    float tl = luma(texture(u_inputImage, uv + vec2(-t.x, -t.y)).rgb);
    float tm = luma(texture(u_inputImage, uv + vec2( 0.0, -t.y)).rgb);
    float tr = luma(texture(u_inputImage, uv + vec2( t.x, -t.y)).rgb);
    float ml = luma(texture(u_inputImage, uv + vec2(-t.x,  0.0)).rgb);
    float mr = luma(texture(u_inputImage, uv + vec2( t.x,  0.0)).rgb);
    float bl = luma(texture(u_inputImage, uv + vec2(-t.x,  t.y)).rgb);
    float bm = luma(texture(u_inputImage, uv + vec2( 0.0,  t.y)).rgb);
    float br = luma(texture(u_inputImage, uv + vec2( t.x,  t.y)).rgb);
    float gx = -tl + tr - 2.0*ml + 2.0*mr - bl + br;
    float gy = -tl - 2.0*tm - tr + bl + 2.0*bm + br;
    float g = clamp(sqrt(gx*gx + gy*gy) * pc.params[0] * pc.intensity, 0.0, 1.0);
    return mix(color, vec3(g), pc.intensity);
}

// --- 22: Emboss ---
vec3 embossEffect(vec2 uv, vec3 color) {
    vec2 t = 1.0 / pc.resolution;
    vec3 tl = texture(u_inputImage, uv + vec2(-t.x, -t.y)).rgb;
    vec3 br = texture(u_inputImage, uv + vec2( t.x,  t.y)).rgb;
    float gray = luma(tl - br) * 2.0 + 0.5;
    gray = clamp(gray, 0.0, 1.0);
    return mix(color, vec3(gray), pc.intensity);
}

// --- 23: Retro Pixel (pixelate + posterize + scanline) ---
// params[0]=pixelCount, params[1]=levels
vec3 retroPixelEffect(vec2 uv, vec3 color) {
    float pixels = mix(16.0, pc.params[0], 1.0 - pc.intensity);
    vec2 pixelSize = pc.resolution / pixels;
    vec2 pix = floor(uv * pixelSize) / pixelSize;
    vec3 c = texture(u_inputImage, pix).rgb;
    float levels = mix(4.0, pc.params[1], 1.0 - pc.intensity);
    c = floor(c * levels) / max(levels - 1.0, 1.0);
    float scanline = sin(uv.y * pixels * 3.14159) * 0.15 + 0.85;
    return c * scanline;
}

void main() {
    vec3 color = texture(u_inputImage, v_texcoord).rgb;
    int preset = int(pc.preset);

    if (preset == 1)       color = crtEffect(v_texcoord, color);
    else if (preset == 2)  color = bloomEffect(v_texcoord, color);
    else if (preset == 3)  color = colorGradeEffect(v_texcoord, color);
    else if (preset == 4)  color = fxaaEffect(v_texcoord, color);
    else if (preset == 5)  color = casEffect(v_texcoord, color);
    else if (preset == 6)  color = grayscaleEffect(v_texcoord, color);
    else if (preset == 7)  color = sepiaEffect(v_texcoord, color);
    else if (preset == 8)  color = vignetteEffect(v_texcoord, color);
    else if (preset == 9)  color = filmGrainEffect(v_texcoord, color);
    else if (preset == 10) color = chromaticAberrationEffect(v_texcoord, color);
    else if (preset == 11) color = sharpenEffect(v_texcoord, color);
    else if (preset == 12) color = blurEffect(v_texcoord, color);
    else if (preset == 13) color = pixelateEffect(v_texcoord, color);
    else if (preset == 14) color = posterizeEffect(v_texcoord, color);
    else if (preset == 15) color = invertEffect(v_texcoord, color);
    else if (preset == 16) color = scanlineEffect(v_texcoord, color);
    else if (preset == 18) color = vhsEffect(v_texcoord, color);
    else if (preset == 19) color = nightVisionEffect(v_texcoord, color);
    else if (preset == 20) color = thermalEffect(v_texcoord, color);
    else if (preset == 21) color = edgeDetectEffect(v_texcoord, color);
    else if (preset == 22) color = embossEffect(v_texcoord, color);
    else if (preset == 23) color = retroPixelEffect(v_texcoord, color);

    outColor = vec4(color, 1.0);
}

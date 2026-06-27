#version 450

layout(set = 0, binding = 0) uniform sampler2D u_inputImage;

layout(location = 0) in vec2 v_texcoord;
layout(location = 0) out vec4 outColor;

layout(push_constant) uniform PushConstants {
    float intensity;
    float time;
    vec2 resolution;
    float preset;  // 0=none, 1=crt, 2=bloom, 3=color_grade
} pc;

// CRT scanline effect
vec3 crtEffect(vec2 uv, vec3 color) {
    float scanline = sin(uv.y * pc.resolution.y * 3.14159) * 0.5 + 0.5;
    scanline = mix(1.0, scanline, 0.3 * pc.intensity);
    
    // Slight RGB shift (aberration)
    float shift = 0.002 * pc.intensity;
    vec3 aberration;
    aberration.r = texture(u_inputImage, uv + vec2(shift, 0.0)).r;
    aberration.g = color.g;
    aberration.b = texture(u_inputImage, uv - vec2(shift, 0.0)).b;
    
    // Vignette
    vec2 center = uv - 0.5;
    float vignette = 1.0 - dot(center, center) * 0.8 * pc.intensity;
    
    return aberration * scanline * vignette;
}

// Bloom effect
vec3 bloomEffect(vec2 uv, vec3 color) {
    vec3 bloom = vec3(0.0);
    float radius = 0.01 * pc.intensity;
    for (float x = -2.0; x <= 2.0; x += 1.0) {
        for (float y = -2.0; y <= 2.0; y += 1.0) {
            bloom += texture(u_inputImage, uv + vec2(x, y) * radius).rgb;
        }
    }
    bloom /= 25.0;
    return color + bloom * pc.intensity * 0.5;
}

// Color grading
vec3 colorGradeEffect(vec2 uv, vec3 color) {
    // Warm tone
    color.r *= 1.0 + 0.1 * pc.intensity;
    color.b *= 1.0 - 0.1 * pc.intensity;
    // Contrast
    color = (color - 0.5) * (1.0 + 0.2 * pc.intensity) + 0.5;
    // Saturation
    float gray = dot(color, vec3(0.299, 0.587, 0.114));
    color = mix(vec3(gray), color, 1.0 + 0.3 * pc.intensity);
    return color;
}

void main() {
    vec3 color = texture(u_inputImage, v_texcoord).rgb;
    
    int preset = int(pc.preset);
    if (preset == 1) {
        color = crtEffect(v_texcoord, color);
    } else if (preset == 2) {
        color = bloomEffect(v_texcoord, color);
    } else if (preset == 3) {
        color = colorGradeEffect(v_texcoord, color);
    }
    
    outColor = vec4(color, 1.0);
}

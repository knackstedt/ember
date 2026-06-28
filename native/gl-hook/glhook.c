/*
 * Ember OpenGL Hook — Shader Injection for OpenGL games
 *
 * Hooks glXSwapBuffers via LD_PRELOAD to apply post-processing shaders.
 * Intercepts execve to survive LD_PRELOAD overwrites by game launcher scripts.
 *
 * Env vars:
 *   EMBER_SHADER_PRESET    - preset name (posterize, crt, etc.)
 *   EMBER_SHADER_INTENSITY - global blend 0-1
 *   EMBER_SHADER_PARAM0..7 - per-preset parameters
 *   EMBER_GL_HOOK_LIB      - path to this .so (for execve re-injection)
 */

#define _GNU_SOURCE
#include <dlfcn.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <errno.h>
#include <stdarg.h>
#include <sys/stat.h>
#include <GL/glx.h>
#include <GL/gl.h>
#define GL_GLEXT_PROTOTYPES
#include <GL/glext.h>
#include <EGL/egl.h>
#include <pthread.h>
#include <time.h>

// GL3 framebuffer constant (not always in older headers)
#ifndef GL_FRAMEBUFFER
#define GL_FRAMEBUFFER 0x8D40
#endif
#ifndef GL_FRAMEBUFFER_BINDING
#define GL_FRAMEBUFFER_BINDING 0x8CA6
#endif

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

static int g_logEnabled = 1;

static void glLog(const char* fmt, ...) {
    if (!g_logEnabled) return;
    va_list ap;
    va_start(ap, fmt);
    char buf[512];
    int len = vsnprintf(buf, sizeof(buf), fmt, ap);
    va_end(ap);
    if (len > 0) {
        if (len > (int)sizeof(buf)) len = sizeof(buf);
        int fd = open("/tmp/ember_gl_hook.log", O_WRONLY | O_CREAT | O_APPEND, 0644);
        if (fd >= 0) {
            write(fd, buf, len);
            close(fd);
        }
    }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

static int g_initialized = 0;
static int g_presetsInitialized = 0;
static int g_swapBuffersCalled = 0;       // set when glXSwapBuffers or eglSwapBuffers is first called
static time_t g_hookLoadTime = 0;         // set in constructor
static int g_autoDisabled = 0;            // set when auto-disable triggers

static void (*real_glXSwapBuffers)(Display*, GLXDrawable) = NULL;
static EGLBoolean (*real_eglSwapBuffers)(EGLDisplay, EGLSurface) = NULL;
static __GLXextFuncPtr (*real_glXGetProcAddressARB)(const GLubyte*) = NULL;
static __eglMustCastToProperFunctionPointerType (*real_eglGetProcAddress)(const char*) = NULL;
static int (*real_execve)(const char*, char* const[], char* const[]) = NULL;
static void* (*real_dlsym)(void*, const char*) = NULL;
static __thread int g_inDlsymHook = 0;

static char g_hookPath[4096] = {0};

// GL 2.0+ function pointers (loaded via glXGetProcAddressARB)
typedef GLuint   (*PFN_glCreateShader_t)(GLenum);
typedef void     (*PFN_glShaderSource_t)(GLuint, GLsizei, const char* const*, const GLint*);
typedef void     (*PFN_glCompileShader_t)(GLuint);
typedef void     (*PFN_glGetShaderiv_t)(GLuint, GLenum, GLint*);
typedef void     (*PFN_glGetShaderInfoLog_t)(GLuint, GLsizei, GLsizei*, char*);
typedef void     (*PFN_glDeleteShader_t)(GLuint);
typedef GLuint   (*PFN_glCreateProgram_t)(void);
typedef void     (*PFN_glAttachShader_t)(GLuint, GLuint);
typedef void     (*PFN_glLinkProgram_t)(GLuint);
typedef void     (*PFN_glGetProgramiv_t)(GLuint, GLenum, GLint*);
typedef void     (*PFN_glGetProgramInfoLog_t)(GLuint, GLsizei, GLsizei*, char*);
typedef void     (*PFN_glDeleteProgram_t)(GLuint);
typedef void     (*PFN_glUseProgram_t)(GLuint);
typedef GLint    (*PFN_glGetUniformLocation_t)(GLuint, const char*);
typedef void     (*PFN_glUniform1i_t)(GLint, GLint);
typedef void     (*PFN_glUniform1f_t)(GLint, GLfloat);
typedef void     (*PFN_glUniform2f_t)(GLint, GLfloat, GLfloat);
typedef void     (*PFN_glBindFramebuffer_t)(GLenum, GLuint);
typedef void     (*PFN_glActiveTexture_t)(GLenum);

static struct {
    PFN_glCreateShader_t         CreateShader;
    PFN_glShaderSource_t         ShaderSource;
    PFN_glCompileShader_t        CompileShader;
    PFN_glGetShaderiv_t          GetShaderiv;
    PFN_glGetShaderInfoLog_t     GetShaderInfoLog;
    PFN_glDeleteShader_t         DeleteShader;
    PFN_glCreateProgram_t        CreateProgram;
    PFN_glAttachShader_t         AttachShader;
    PFN_glLinkProgram_t          LinkProgram;
    PFN_glGetProgramiv_t         GetProgramiv;
    PFN_glGetProgramInfoLog_t    GetProgramInfoLog;
    PFN_glDeleteProgram_t        DeleteProgram;
    PFN_glUseProgram_t           UseProgram;
    PFN_glGetUniformLocation_t   GetUniformLocation;
    PFN_glUniform1i_t            Uniform1i;
    PFN_glUniform1f_t            Uniform1f;
    PFN_glUniform2f_t            Uniform2f;
    PFN_glBindFramebuffer_t      BindFramebuffer;
    PFN_glActiveTexture_t        ActiveTexture;
} gl;

// Cached uniform locations (resolved once after shader link)
static GLint loc_inputImage = -1;
static GLint loc_intensity  = -1;
static GLint loc_time       = -1;
static GLint loc_resolution = -1;
static GLint loc_preset     = -1;
static GLint loc_params[8]  = { -1, -1, -1, -1, -1, -1, -1, -1 };

static void* getGLProc(const char* name) {
    void* p = (void*)glXGetProcAddressARB((const GLubyte*)name);
    if (!p) {
        p = dlsym(RTLD_DEFAULT, name);
    }
    return p;
}

static void loadGLFunctions() {
    gl.CreateShader       = (PFN_glCreateShader_t)getGLProc("glCreateShader");
    gl.ShaderSource       = (PFN_glShaderSource_t)getGLProc("glShaderSource");
    gl.CompileShader      = (PFN_glCompileShader_t)getGLProc("glCompileShader");
    gl.GetShaderiv        = (PFN_glGetShaderiv_t)getGLProc("glGetShaderiv");
    gl.GetShaderInfoLog   = (PFN_glGetShaderInfoLog_t)getGLProc("glGetShaderInfoLog");
    gl.DeleteShader       = (PFN_glDeleteShader_t)getGLProc("glDeleteShader");
    gl.CreateProgram      = (PFN_glCreateProgram_t)getGLProc("glCreateProgram");
    gl.AttachShader       = (PFN_glAttachShader_t)getGLProc("glAttachShader");
    gl.LinkProgram        = (PFN_glLinkProgram_t)getGLProc("glLinkProgram");
    gl.GetProgramiv       = (PFN_glGetProgramiv_t)getGLProc("glGetProgramiv");
    gl.GetProgramInfoLog  = (PFN_glGetProgramInfoLog_t)getGLProc("glGetProgramInfoLog");
    gl.DeleteProgram      = (PFN_glDeleteProgram_t)getGLProc("glDeleteProgram");
    gl.UseProgram         = (PFN_glUseProgram_t)getGLProc("glUseProgram");
    gl.GetUniformLocation = (PFN_glGetUniformLocation_t)getGLProc("glGetUniformLocation");
    gl.Uniform1i          = (PFN_glUniform1i_t)getGLProc("glUniform1i");
    gl.Uniform1f          = (PFN_glUniform1f_t)getGLProc("glUniform1f");
    gl.Uniform2f          = (PFN_glUniform2f_t)getGLProc("glUniform2f");
    gl.BindFramebuffer    = (PFN_glBindFramebuffer_t)getGLProc("glBindFramebuffer");
    gl.ActiveTexture      = (PFN_glActiveTexture_t)getGLProc("glActiveTexture");
}

// Shader state
static GLuint g_program = 0;
static GLuint g_texture = 0;
static int g_texWidth = 0;
static int g_texHeight = 0;
static int g_frameCount = 0;

// Preset config
static int g_presetId = 0;
static float g_intensity = 1.0f;
static float g_params[8] = {0};

// Forward declaration — defined below
static int presetNameToId(const char* name);

// Runtime config file polling — stat() the config file every N swap calls
// and re-read if mtime changed. Lets the user change shaders during gameplay.
static const int kConfigPollInterval = 30;
static time_t g_configMtime = 0;
static int g_configPollCounter = 0;
static int g_configInited = 0;

// Minimal JSON value extractors for the tiny config file
static int extractJsonString(const char* json, const char* key, char* out, int outLen) {
    char needle[64];
    snprintf(needle, sizeof(needle), "\"%s\"", key);
    const char* k = strstr(json, needle);
    if (!k) return 0;
    k = strchr(k, ':');
    if (!k) return 0;
    k++;
    while (*k == ' ' || *k == '\t') k++;
    if (*k != '"') return 0;
    k++;
    const char* end = strchr(k, '"');
    if (!end) return 0;
    int len = (int)(end - k);
    if (len >= outLen) len = outLen - 1;
    memcpy(out, k, len);
    out[len] = '\0';
    return 1;
}

static int extractJsonFloat(const char* json, const char* key, float* out) {
    char needle[64];
    snprintf(needle, sizeof(needle), "\"%s\"", key);
    const char* k = strstr(json, needle);
    if (!k) return 0;
    k = strchr(k, ':');
    if (!k) return 0;
    k++;
    while (*k == ' ' || *k == '\t') k++;
    *out = (float)atof(k);
    return 1;
}

static int extractJsonFloatArray(const char* json, const char* key, float* arr, int maxCount) {
    char needle[64];
    snprintf(needle, sizeof(needle), "\"%s\"", key);
    const char* k = strstr(json, needle);
    if (!k) return 0;
    k = strchr(k, '[');
    if (!k) return 0;
    k++;
    for (int i = 0; i < maxCount; i++) {
        while (*k == ' ' || *k == '\t' || *k == ',') k++;
        if (*k == ']' || *k == '\0') return 1;
        arr[i] = (float)atof(k);
        k = strpbrk(k, ",]");
        if (!k || *k == ']') return 1;
        k++;
    }
    return 1;
}

static void refreshConfigFromFile(void) {
    const char* configPath = getenv("EMBER_SHADER_CONFIG_FILE");
    if (!configPath || !configPath[0]) return;

    struct stat st;
    if (stat(configPath, &st) != 0) return;

    if (st.st_mtime == g_configMtime && g_configInited) return;
    g_configMtime = st.st_mtime;
    g_configInited = 1;

    FILE* f = fopen(configPath, "r");
    if (!f) return;

    char buf[1024];
    size_t n = fread(buf, 1, sizeof(buf) - 1, f);
    fclose(f);
    buf[n] = '\0';

    char preset[64] = {0};
    if (extractJsonString(buf, "preset", preset, sizeof(preset))) {
        g_presetId = presetNameToId(preset);
    }

    float intensity;
    if (extractJsonFloat(buf, "intensity", &intensity)) {
        g_intensity = intensity;
    }

    float params[8] = {0};
    if (extractJsonFloatArray(buf, "params", params, 8)) {
        memcpy(g_params, params, sizeof(params));
    }

    glLog("[Ember GL Hook] Config reloaded: preset=%s(id=%d) intensity=%.2f\n",
          preset, g_presetId, g_intensity);
}

static void pollConfigFile(void) {
    if (++g_configPollCounter >= kConfigPollInterval) {
        g_configPollCounter = 0;
        refreshConfigFromFile();
    }
}

// Preset name -> ID mapping (matches Vulkan layer)
static int presetNameToId(const char* name) {
    if (!name) return 0;
    if (strcmp(name, "crt") == 0) return 1;
    if (strcmp(name, "bloom") == 0) return 2;
    if (strcmp(name, "color-grade") == 0) return 3;
    if (strcmp(name, "fxaa") == 0) return 4;
    if (strcmp(name, "cas") == 0) return 5;
    if (strcmp(name, "grayscale") == 0) return 6;
    if (strcmp(name, "sepia") == 0) return 7;
    if (strcmp(name, "vignette") == 0) return 8;
    if (strcmp(name, "film-grain") == 0) return 9;
    if (strcmp(name, "chromatic-aberration") == 0) return 10;
    if (strcmp(name, "sharpen") == 0) return 11;
    if (strcmp(name, "blur") == 0) return 12;
    if (strcmp(name, "pixelate") == 0) return 13;
    if (strcmp(name, "posterize") == 0) return 14;
    if (strcmp(name, "invert") == 0) return 15;
    if (strcmp(name, "scanline") == 0) return 16;
    if (strcmp(name, "vhs") == 0) return 18;
    if (strcmp(name, "night-vision") == 0) return 19;
    if (strcmp(name, "thermal") == 0) return 20;
    if (strcmp(name, "edge-detect") == 0) return 21;
    if (strcmp(name, "emboss") == 0) return 22;
    if (strcmp(name, "retro-pixel") == 0) return 23;
    return 0;
}

// ---------------------------------------------------------------------------
// Shader sources (GLSL 1.20 — compatible with OpenGL 2.1+)
// ---------------------------------------------------------------------------

static const char* kVertSrc =
    "#version 120\n"
    "varying vec2 v_texcoord;\n"
    "void main() {\n"
    "    v_texcoord = gl_MultiTexCoord0.xy;\n"
    "    gl_Position = gl_Vertex;\n"
    "}\n";

static const char* kFragSrc =
    "#version 120\n"
    "\n"
    "uniform sampler2D u_inputImage;\n"
    "uniform float u_intensity;\n"
    "uniform float u_time;\n"
    "uniform vec2  u_resolution;\n"
    "uniform int   u_preset;\n"
    "uniform float u_params[8];\n"
    "\n"
    "varying vec2 v_texcoord;\n"
    "\n"
    "#define pc_intensity u_intensity\n"
    "#define pc_time u_time\n"
    "#define pc_resolution u_resolution\n"
    "#define pc_preset u_preset\n"
    "#define pc_params u_params\n"
    "\n"
    "float random(vec2 st) {\n"
    "    return fract(sin(dot(st, vec2(12.9898, 78.233))) * 43758.5453123);\n"
    "}\n"
    "\n"
    "vec3 sampleOffset(float dx, float dy) {\n"
    "    return texture2D(u_inputImage, v_texcoord + vec2(dx, dy)).rgb;\n"
    "}\n"
    "\n"
    "float luma(vec3 c) {\n"
    "    return dot(c, vec3(0.299, 0.587, 0.114));\n"
    "}\n"
    "\n"
    "vec3 crtEffect(vec2 uv, vec3 color) {\n"
    "    float scanline = sin(uv.y * pc_resolution.y * 3.14159) * 0.5 + 0.5;\n"
    "    scanline = mix(1.0, scanline, pc_params[0] * pc_intensity);\n"
    "    float shift = pc_params[1] * pc_intensity;\n"
    "    vec3 ab;\n"
    "    ab.r = texture2D(u_inputImage, uv + vec2(shift, 0.0)).r;\n"
    "    ab.g = color.g;\n"
    "    ab.b = texture2D(u_inputImage, uv - vec2(shift, 0.0)).b;\n"
    "    vec2 center = uv - 0.5;\n"
    "    float vig = 1.0 - dot(center, center) * pc_params[2] * pc_intensity;\n"
    "    return ab * scanline * vig;\n"
    "}\n"
    "\n"
    "vec3 bloomEffect(vec2 uv, vec3 color) {\n"
    "    vec3 bloom = vec3(0.0);\n"
    "    float radius = pc_params[0] * pc_intensity;\n"
    "    for (int x = -2; x <= 2; x++) {\n"
    "        for (int y = -2; y <= 2; y++) {\n"
    "            bloom += texture2D(u_inputImage, uv + vec2(float(x), float(y)) * radius).rgb;\n"
    "        }\n"
    "    }\n"
    "    bloom /= 25.0;\n"
    "    return color + bloom * pc_params[1] * pc_intensity;\n"
    "}\n"
    "\n"
    "vec3 colorGradeEffect(vec2 uv, vec3 color) {\n"
    "    color.r *= 1.0 + pc_params[0] * pc_intensity;\n"
    "    color.b *= 1.0 - pc_params[0] * pc_intensity;\n"
    "    color = (color - 0.5) * (1.0 + pc_params[1] * pc_intensity) + 0.5;\n"
    "    float gray = luma(color);\n"
    "    color = mix(vec3(gray), color, 1.0 + pc_params[2] * pc_intensity);\n"
    "    return color;\n"
    "}\n"
    "\n"
    "vec3 fxaaEffect(vec2 uv, vec3 color) {\n"
    "    vec2 texel = 1.0 / pc_resolution;\n"
    "    float lN = luma(sampleOffset(0.0, -texel.y));\n"
    "    float lS = luma(sampleOffset(0.0,  texel.y));\n"
    "    float lW = luma(sampleOffset(-texel.x, 0.0));\n"
    "    float lE = luma(sampleOffset( texel.x, 0.0));\n"
    "    float lM = luma(color);\n"
    "    float lMin = min(lM, min(min(lN, lS), min(lW, lE)));\n"
    "    float lMax = max(lM, max(max(lN, lS), max(lW, lE)));\n"
    "    if (lMax - lMin < pc_params[0]) return color;\n"
    "    float dx = -(lN + lS) + (lW + lE);\n"
    "    float dy = -(lW + lE) + (lN + lS);\n"
    "    vec2 dir = vec2(dx, dy);\n"
    "    float len = length(dir);\n"
    "    if (len < 0.001) return color;\n"
    "    dir = (dir / len) * texel * pc_intensity;\n"
    "    vec3 blend = sampleOffset(dir.x * 0.5, dir.y * 0.5);\n"
    "    return mix(color, blend, 0.5 * pc_intensity);\n"
    "}\n"
    "\n"
    "vec3 casEffect(vec2 uv, vec3 color) {\n"
    "    vec2 texel = 1.0 / pc_resolution;\n"
    "    vec3 a = sampleOffset(0.0, texel.y);\n"
    "    vec3 b = sampleOffset(-texel.x, 0.0);\n"
    "    vec3 c = sampleOffset(texel.x, 0.0);\n"
    "    vec3 d = sampleOffset(0.0, -texel.y);\n"
    "    float mn = min(min(luma(a), luma(b)), min(luma(c), luma(d)));\n"
    "    float mx = max(max(luma(a), luma(b)), max(luma(c), luma(d)));\n"
    "    float w = 1.0 + pc_params[0] * pc_intensity * (1.0 - (mx - mn) / max(mx, 0.001));\n"
    "    vec3 sharpened = color * w - (a + b + c + d) * 0.25 * (w - 1.0);\n"
    "    return mix(color, clamp(sharpened, 0.0, 1.0), pc_intensity);\n"
    "}\n"
    "\n"
    "vec3 grayscaleEffect(vec2 uv, vec3 color) {\n"
    "    float gray = luma(color);\n"
    "    return mix(color, vec3(gray), pc_intensity);\n"
    "}\n"
    "\n"
    "vec3 sepiaEffect(vec2 uv, vec3 color) {\n"
    "    vec3 sepia = vec3(\n"
    "        dot(color, vec3(0.393, 0.769, 0.189)),\n"
    "        dot(color, vec3(0.349, 0.686, 0.168)),\n"
    "        dot(color, vec3(0.272, 0.534, 0.131))\n"
    "    );\n"
    "    return mix(color, clamp(sepia, 0.0, 1.0), pc_intensity);\n"
    "}\n"
    "\n"
    "vec3 vignetteEffect(vec2 uv, vec3 color) {\n"
    "    vec2 center = uv - 0.5;\n"
    "    float dist = length(center);\n"
    "    float vig = 1.0 - smoothstep(pc_params[0], pc_params[1], dist) * pc_intensity;\n"
    "    return color * vig;\n"
    "}\n"
    "\n"
    "vec3 filmGrainEffect(vec2 uv, vec3 color) {\n"
    "    float noise = random(uv * pc_resolution + pc_time) - 0.5;\n"
    "    return color + noise * pc_params[0] * pc_intensity;\n"
    "}\n"
    "\n"
    "vec3 chromaticAberrationEffect(vec2 uv, vec3 color) {\n"
    "    vec2 dir = uv - 0.5;\n"
    "    float shift = pc_params[0] * pc_intensity;\n"
    "    vec3 ab;\n"
    "    ab.r = texture2D(u_inputImage, uv + dir * shift).r;\n"
    "    ab.g = color.g;\n"
    "    ab.b = texture2D(u_inputImage, uv - dir * shift).b;\n"
    "    return ab;\n"
    "}\n"
    "\n"
    "vec3 sharpenEffect(vec2 uv, vec3 color) {\n"
    "    vec2 texel = 1.0 / pc_resolution;\n"
    "    vec3 blur = (\n"
    "        sampleOffset(-texel.x, 0.0) +\n"
    "        sampleOffset( texel.x, 0.0) +\n"
    "        sampleOffset(0.0, -texel.y) +\n"
    "        sampleOffset(0.0,  texel.y)\n"
    "    ) * 0.25;\n"
    "    vec3 highFreq = color - blur;\n"
    "    return clamp(color + highFreq * pc_params[0] * pc_intensity, 0.0, 1.0);\n"
    "}\n"
    "\n"
    "vec3 blurEffect(vec2 uv, vec3 color) {\n"
    "    vec2 texel = 1.0 / pc_resolution;\n"
    "    float sigma = pc_params[0] * pc_intensity + 0.5;\n"
    "    vec3 sum = vec3(0.0);\n"
    "    float weight = 0.0;\n"
    "    for (int x = -3; x <= 3; x++) {\n"
    "        for (int y = -3; y <= 3; y++) {\n"
    "            float w = exp(-float(x*x + y*y) / (2.0 * sigma * sigma));\n"
    "            sum += texture2D(u_inputImage, uv + vec2(float(x), float(y)) * texel).rgb * w;\n"
    "            weight += w;\n"
    "        }\n"
    "    }\n"
    "    return sum / weight;\n"
    "}\n"
    "\n"
    "vec3 pixelateEffect(vec2 uv, vec3 color) {\n"
    "    float pixels = mix(8.0, pc_params[0], 1.0 - pc_intensity);\n"
    "    vec2 pixelSize = pc_resolution / pixels;\n"
    "    vec2 pix = floor(uv * pixelSize) / pixelSize;\n"
    "    return texture2D(u_inputImage, pix).rgb;\n"
    "}\n"
    "\n"
    "vec3 posterizeEffect(vec2 uv, vec3 color) {\n"
    "    float levels = mix(2.0, pc_params[0], 1.0 - pc_intensity);\n"
    "    return floor(color * levels) / max(levels - 1.0, 1.0);\n"
    "}\n"
    "\n"
    "vec3 invertEffect(vec2 uv, vec3 color) {\n"
    "    return mix(color, 1.0 - color, pc_intensity);\n"
    "}\n"
    "\n"
    "vec3 scanlineEffect(vec2 uv, vec3 color) {\n"
    "    float scanline = sin(uv.y * pc_resolution.y * 3.14159) * 0.5 + 0.5;\n"
    "    scanline = mix(1.0, scanline, pc_params[0] * pc_intensity);\n"
    "    return color * scanline;\n"
    "}\n"
    "\n"
    "vec3 vhsEffect(vec2 uv, vec3 color) {\n"
    "    float t = pc_time * 0.01;\n"
    "    float warp = sin(uv.y * 80.0 + t * 5.0) * pc_params[0] * pc_intensity;\n"
    "    vec2 warped = uv + vec2(warp, 0.0);\n"
    "    vec3 wc = texture2D(u_inputImage, warped).rgb;\n"
    "    float scan = sin(uv.y * pc_resolution.y * 1.5 + t * 50.0) * 0.05 * pc_intensity;\n"
    "    wc += scan;\n"
    "    wc.r = texture2D(u_inputImage, warped + vec2(pc_params[0] * pc_intensity, 0.0)).r;\n"
    "    wc.b = texture2D(u_inputImage, warped - vec2(pc_params[0] * pc_intensity, 0.0)).b;\n"
    "    float noise = random(vec2(uv.x, floor(uv.y * 250.0) + t * 60.0)) * pc_params[1] * pc_intensity;\n"
    "    wc += noise;\n"
    "    return wc;\n"
    "}\n"
    "\n"
    "vec3 nightVisionEffect(vec2 uv, vec3 color) {\n"
    "    float lum = luma(color);\n"
    "    lum = clamp(lum * (1.0 + pc_params[0] * pc_intensity), 0.0, 1.0);\n"
    "    vec3 green = vec3(0.0, lum, 0.0);\n"
    "    vec2 center = uv - 0.5;\n"
    "    float vig = 1.0 - smoothstep(0.2, 0.7, length(center)) * pc_intensity;\n"
    "    green *= vig;\n"
    "    float scan = sin(uv.y * pc_resolution.y * 3.14159) * 0.1 + 0.9;\n"
    "    green *= scan;\n"
    "    float noise = random(uv * pc_resolution + pc_time) * pc_params[1] * pc_intensity;\n"
    "    green += noise;\n"
    "    return green;\n"
    "}\n"
    "\n"
    "vec3 thermalEffect(vec2 uv, vec3 color) {\n"
    "    float lum = clamp(luma(color) * (1.0 + pc_params[0] * pc_intensity), 0.0, 1.0);\n"
    "    vec3 thermal;\n"
    "    if (lum < 0.25) {\n"
    "        thermal = mix(vec3(0.0, 0.0, 0.5), vec3(0.5, 0.0, 0.5), lum * 4.0);\n"
    "    } else if (lum < 0.5) {\n"
    "        thermal = mix(vec3(0.5, 0.0, 0.5), vec3(1.0, 0.0, 0.0), (lum - 0.25) * 4.0);\n"
    "    } else if (lum < 0.75) {\n"
    "        thermal = mix(vec3(1.0, 0.0, 0.0), vec3(1.0, 1.0, 0.0), (lum - 0.5) * 4.0);\n"
    "    } else {\n"
    "        thermal = mix(vec3(1.0, 1.0, 0.0), vec3(1.0, 1.0, 1.0), (lum - 0.75) * 4.0);\n"
    "    }\n"
    "    return thermal;\n"
    "}\n"
    "\n"
    "vec3 edgeDetectEffect(vec2 uv, vec3 color) {\n"
    "    vec2 t = 1.0 / pc_resolution;\n"
    "    float tl = luma(texture2D(u_inputImage, uv + vec2(-t.x, -t.y)).rgb);\n"
    "    float tm = luma(texture2D(u_inputImage, uv + vec2( 0.0, -t.y)).rgb);\n"
    "    float tr = luma(texture2D(u_inputImage, uv + vec2( t.x, -t.y)).rgb);\n"
    "    float ml = luma(texture2D(u_inputImage, uv + vec2(-t.x,  0.0)).rgb);\n"
    "    float mr = luma(texture2D(u_inputImage, uv + vec2( t.x,  0.0)).rgb);\n"
    "    float bl = luma(texture2D(u_inputImage, uv + vec2(-t.x,  t.y)).rgb);\n"
    "    float bm = luma(texture2D(u_inputImage, uv + vec2( 0.0,  t.y)).rgb);\n"
    "    float br = luma(texture2D(u_inputImage, uv + vec2( t.x,  t.y)).rgb);\n"
    "    float gx = -tl + tr - 2.0*ml + 2.0*mr - bl + br;\n"
    "    float gy = -tl - 2.0*tm - tr + bl + 2.0*bm + br;\n"
    "    float g = clamp(sqrt(gx*gx + gy*gy) * pc_params[0] * pc_intensity, 0.0, 1.0);\n"
    "    return mix(color, vec3(g), pc_intensity);\n"
    "}\n"
    "\n"
    "vec3 embossEffect(vec2 uv, vec3 color) {\n"
    "    vec2 t = 1.0 / pc_resolution;\n"
    "    vec3 tl = texture2D(u_inputImage, uv + vec2(-t.x, -t.y)).rgb;\n"
    "    vec3 br = texture2D(u_inputImage, uv + vec2( t.x,  t.y)).rgb;\n"
    "    float gray = luma(tl - br) * 2.0 + 0.5;\n"
    "    gray = clamp(gray, 0.0, 1.0);\n"
    "    return mix(color, vec3(gray), pc_intensity);\n"
    "}\n"
    "\n"
    "vec3 retroPixelEffect(vec2 uv, vec3 color) {\n"
    "    float pixels = mix(16.0, pc_params[0], 1.0 - pc_intensity);\n"
    "    vec2 pixelSize = pc_resolution / pixels;\n"
    "    vec2 pix = floor(uv * pixelSize) / pixelSize;\n"
    "    vec3 c = texture2D(u_inputImage, pix).rgb;\n"
    "    float levels = mix(4.0, pc_params[1], 1.0 - pc_intensity);\n"
    "    c = floor(c * levels) / max(levels - 1.0, 1.0);\n"
    "    float scanline = sin(uv.y * pixels * 3.14159) * 0.15 + 0.85;\n"
    "    return c * scanline;\n"
    "}\n"
    "\n"
    "void main() {\n"
    "    vec3 color = texture2D(u_inputImage, v_texcoord).rgb;\n"
    "    int preset = pc_preset;\n"
    "\n"
    "    if (preset == 1)       color = crtEffect(v_texcoord, color);\n"
    "    else if (preset == 2)  color = bloomEffect(v_texcoord, color);\n"
    "    else if (preset == 3)  color = colorGradeEffect(v_texcoord, color);\n"
    "    else if (preset == 4)  color = fxaaEffect(v_texcoord, color);\n"
    "    else if (preset == 5)  color = casEffect(v_texcoord, color);\n"
    "    else if (preset == 6)  color = grayscaleEffect(v_texcoord, color);\n"
    "    else if (preset == 7)  color = sepiaEffect(v_texcoord, color);\n"
    "    else if (preset == 8)  color = vignetteEffect(v_texcoord, color);\n"
    "    else if (preset == 9)  color = filmGrainEffect(v_texcoord, color);\n"
    "    else if (preset == 10) color = chromaticAberrationEffect(v_texcoord, color);\n"
    "    else if (preset == 11) color = sharpenEffect(v_texcoord, color);\n"
    "    else if (preset == 12) color = blurEffect(v_texcoord, color);\n"
    "    else if (preset == 13) color = pixelateEffect(v_texcoord, color);\n"
    "    else if (preset == 14) color = posterizeEffect(v_texcoord, color);\n"
    "    else if (preset == 15) color = invertEffect(v_texcoord, color);\n"
    "    else if (preset == 16) color = scanlineEffect(v_texcoord, color);\n"
    "    else if (preset == 18) color = vhsEffect(v_texcoord, color);\n"
    "    else if (preset == 19) color = nightVisionEffect(v_texcoord, color);\n"
    "    else if (preset == 20) color = thermalEffect(v_texcoord, color);\n"
    "    else if (preset == 21) color = edgeDetectEffect(v_texcoord, color);\n"
    "    else if (preset == 22) color = embossEffect(v_texcoord, color);\n"
    "    else if (preset == 23) color = retroPixelEffect(v_texcoord, color);\n"
    "\n"
    "    gl_FragColor = vec4(color, 1.0);\n"
    "}\n";

// ---------------------------------------------------------------------------
// Shader compilation
// ---------------------------------------------------------------------------

static GLuint compileShader(GLenum type, const char* src) {
    if (!gl.CreateShader || !gl.ShaderSource || !gl.CompileShader) {
        glLog("[Ember GL Hook] GL shader functions not available\n");
        return 0;
    }
    GLuint shader = gl.CreateShader(type);
    gl.ShaderSource(shader, 1, &src, NULL);
    gl.CompileShader(shader);
    GLint status;
    gl.GetShaderiv(shader, GL_COMPILE_STATUS, &status);
    if (!status) {
        char log[2048];
        gl.GetShaderInfoLog(shader, sizeof(log), NULL, log);
        glLog("[Ember GL Hook] Shader compile error: %s\n", log);
        gl.DeleteShader(shader);
        return 0;
    }
    return shader;
}

static void initShaderProgram() {
    loadGLFunctions();
    GLuint vert = compileShader(GL_VERTEX_SHADER, kVertSrc);
    GLuint frag = compileShader(GL_FRAGMENT_SHADER, kFragSrc);
    if (!vert || !frag) {
        glLog("[Ember GL Hook] Failed to compile shaders\n");
        return;
    }
    g_program = gl.CreateProgram();
    gl.AttachShader(g_program, vert);
    gl.AttachShader(g_program, frag);
    gl.LinkProgram(g_program);
    GLint status;
    gl.GetProgramiv(g_program, GL_LINK_STATUS, &status);
    if (!status) {
        char log[2048];
        gl.GetProgramInfoLog(g_program, sizeof(log), NULL, log);
        glLog("[Ember GL Hook] Program link error: %s\n", log);
        gl.DeleteProgram(g_program);
        g_program = 0;
    }
    gl.DeleteShader(vert);
    gl.DeleteShader(frag);
    glLog("[Ember GL Hook] Shader program created (id=%u)\n", g_program);

    // Cache uniform locations — avoids snprintf in the render loop
    if (g_program != 0 && gl.GetUniformLocation) {
        loc_inputImage = gl.GetUniformLocation(g_program, "u_inputImage");
        loc_intensity  = gl.GetUniformLocation(g_program, "u_intensity");
        loc_time       = gl.GetUniformLocation(g_program, "u_time");
        loc_resolution = gl.GetUniformLocation(g_program, "u_resolution");
        loc_preset     = gl.GetUniformLocation(g_program, "u_preset");
        for (int i = 0; i < 8; i++) {
            char name[32];
            snprintf(name, sizeof(name), "u_params[%d]", i);
            loc_params[i] = gl.GetUniformLocation(g_program, name);
        }
    }
}

// ---------------------------------------------------------------------------
// GL state save/restore
// ---------------------------------------------------------------------------

struct GLState {
    GLint program;
    GLint texture;
    GLint viewport[4];
    GLint fbo;
    GLboolean blend;
    GLboolean depthTest;
    GLboolean cullFace;
    GLint activeTexture;
    GLint packAlignment;
    GLint unpackAlignment;
    GLint readBuffer;
    GLint drawBuffer;
};

static void saveGLState(struct GLState* s) {
    glGetIntegerv(GL_CURRENT_PROGRAM, &s->program);
    glGetIntegerv(GL_TEXTURE_BINDING_2D, &s->texture);
    glGetIntegerv(GL_VIEWPORT, s->viewport);
    glGetIntegerv(GL_FRAMEBUFFER_BINDING, &s->fbo);
    s->blend = glIsEnabled(GL_BLEND);
    s->depthTest = glIsEnabled(GL_DEPTH_TEST);
    s->cullFace = glIsEnabled(GL_CULL_FACE);
    glGetIntegerv(GL_ACTIVE_TEXTURE, &s->activeTexture);
    glGetIntegerv(GL_PACK_ALIGNMENT, &s->packAlignment);
    glGetIntegerv(GL_UNPACK_ALIGNMENT, &s->unpackAlignment);
    glGetIntegerv(GL_READ_BUFFER, &s->readBuffer);
    glGetIntegerv(GL_DRAW_BUFFER, &s->drawBuffer);
}

static void restoreGLState(const struct GLState* s) {
    if (gl.UseProgram) gl.UseProgram(s->program);
    glBindTexture(GL_TEXTURE_2D, s->texture);
    glViewport(s->viewport[0], s->viewport[1], s->viewport[2], s->viewport[3]);
    if (gl.BindFramebuffer) gl.BindFramebuffer(GL_FRAMEBUFFER, s->fbo);
    if (s->blend) glEnable(GL_BLEND); else glDisable(GL_BLEND);
    if (s->depthTest) glEnable(GL_DEPTH_TEST); else glDisable(GL_DEPTH_TEST);
    if (s->cullFace) glEnable(GL_CULL_FACE); else glDisable(GL_CULL_FACE);
    if (gl.ActiveTexture) gl.ActiveTexture(s->activeTexture);
    glPixelStorei(GL_PACK_ALIGNMENT, s->packAlignment);
    glPixelStorei(GL_UNPACK_ALIGNMENT, s->unpackAlignment);
    glReadBuffer(s->readBuffer);
    glDrawBuffer(s->drawBuffer);
}

// ---------------------------------------------------------------------------
// Shared shader render — called after backbuffer copy into g_texture
// ---------------------------------------------------------------------------

static void renderShaderQuad(int width, int height) {
    if (!gl.UseProgram || !gl.ActiveTexture) return;

    glViewport(0, 0, width, height);
    glDisable(GL_BLEND);
    glDisable(GL_DEPTH_TEST);
    glDisable(GL_CULL_FACE);

    gl.UseProgram(g_program);

    if (loc_inputImage >= 0) gl.Uniform1i(loc_inputImage, 0);
    if (loc_intensity  >= 0) gl.Uniform1f(loc_intensity, g_intensity);
    if (loc_time       >= 0) gl.Uniform1f(loc_time, (float)g_frameCount);
    if (loc_resolution >= 0) gl.Uniform2f(loc_resolution, (float)width, (float)height);
    if (loc_preset     >= 0) gl.Uniform1i(loc_preset, g_presetId);

    for (int i = 0; i < 8; i++) {
        if (loc_params[i] >= 0) gl.Uniform1f(loc_params[i], g_params[i]);
    }

    glBegin(GL_QUADS);
    glTexCoord2f(0.0f, 0.0f); glVertex2f(-1.0f, -1.0f);
    glTexCoord2f(1.0f, 0.0f); glVertex2f( 1.0f, -1.0f);
    glTexCoord2f(1.0f, 1.0f); glVertex2f( 1.0f,  1.0f);
    glTexCoord2f(0.0f, 1.0f); glVertex2f(-1.0f,  1.0f);
    glEnd();
}

// ---------------------------------------------------------------------------
// glXSwapBuffers hook
// ---------------------------------------------------------------------------

static void ensureTexture(int width, int height) {
    if (g_texture == 0) {
        glGenTextures(1, &g_texture);
    }
    if (g_texWidth != width || g_texHeight != height) {
        glBindTexture(GL_TEXTURE_2D, g_texture);
        glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, width, height, 0,
                     GL_RGBA, GL_UNSIGNED_BYTE, NULL);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
        g_texWidth = width;
        g_texHeight = height;
    }
}

void glXSwapBuffers(Display* dpy, GLXDrawable drawable) {
    if (!real_glXSwapBuffers) {
        real_glXSwapBuffers = dlsym(RTLD_NEXT, "glXSwapBuffers");
    }

    static int glx_first = 1;
    if (glx_first) {
        glx_first = 0;
        g_swapBuffersCalled = 1;
        glLog("[Ember GL Hook] glXSwapBuffers called (first time) pid=%d\n", getpid());
    }

    pollConfigFile();

    if (g_presetId == 0) {
        if (real_glXSwapBuffers) real_glXSwapBuffers(dpy, drawable);
        return;
    }

    // Lazy shader init — needs an active GL context
    if (g_program == 0 && !g_initialized) {
        g_initialized = 1;
        initShaderProgram();
        if (g_program == 0) {
            glLog("[Ember GL Hook] Shader init failed, disabling hook\n");
            g_presetId = 0;
            if (real_glXSwapBuffers) real_glXSwapBuffers(dpy, drawable);
            return;
        }
    }

    if (g_program == 0) {
        if (real_glXSwapBuffers) real_glXSwapBuffers(dpy, drawable);
        return;
    }

    // Temporary passthrough mode for debugging — hook is active but no shader rendering
    if (getenv("EMBER_GL_HOOK_PASSTHROUGH")) {
        real_glXSwapBuffers(dpy, drawable);
        return;
    }

    // Get dimensions from GL viewport (avoids X11 round-trip via glXQueryDrawable
    // which can deadlock when the NVIDIA driver calls our hook internally)
    GLint viewport[4] = {0, 0, 0, 0};
    glGetIntegerv(GL_VIEWPORT, viewport);
    unsigned int width = (unsigned int)viewport[2];
    unsigned int height = (unsigned int)viewport[3];
    if (width == 0 || height == 0) {
        if (real_glXSwapBuffers) real_glXSwapBuffers(dpy, drawable);
        return;
    }

    // Save GL state
    struct GLState saved;
    saveGLState(&saved);

    // Ensure texture exists and matches size
    ensureTexture(width, height);

    // --- Copy the default framebuffer's back buffer into our texture ---
    // The game may have an FBO bound; we must unbind it to read the back buffer.
    if (gl.BindFramebuffer) gl.BindFramebuffer(GL_FRAMEBUFFER, 0);
    glReadBuffer(GL_BACK);
    glDrawBuffer(GL_BACK);

    gl.ActiveTexture(GL_TEXTURE0);
    glBindTexture(GL_TEXTURE_2D, g_texture);
    glPixelStorei(GL_PACK_ALIGNMENT, 1);
    glPixelStorei(GL_UNPACK_ALIGNMENT, 1);
    glCopyTexSubImage2D(GL_TEXTURE_2D, 0, 0, 0, 0, 0, width, height);

    // --- Render fullscreen quad with shader ---
    renderShaderQuad(width, height);

    // Restore state
    restoreGLState(&saved);

    g_frameCount++;

    // Call real swap
    real_glXSwapBuffers(dpy, drawable);
}

// ---------------------------------------------------------------------------
// eglSwapBuffers hook
// ---------------------------------------------------------------------------

EGLBoolean eglSwapBuffers(EGLDisplay dpy, EGLSurface surface) {
    if (!real_eglSwapBuffers) {
        real_eglSwapBuffers = dlsym(RTLD_NEXT, "eglSwapBuffers");
    }

    static int egl_first = 1;
    if (egl_first) {
        egl_first = 0;
        g_swapBuffersCalled = 1;
        glLog("[Ember GL Hook] eglSwapBuffers called (first time) pid=%d\n", getpid());
    }

    pollConfigFile();

    if (g_presetId == 0) {
        if (real_eglSwapBuffers) return real_eglSwapBuffers(dpy, surface);
        return EGL_FALSE;
    }

    // Lazy shader init — needs an active GL context
    if (g_program == 0 && !g_initialized) {
        g_initialized = 1;
        initShaderProgram();
        if (g_program == 0) {
            glLog("[Ember GL Hook] Shader init failed (EGL), disabling hook\n");
            g_presetId = 0;
            if (real_eglSwapBuffers) return real_eglSwapBuffers(dpy, surface);
            return EGL_FALSE;
        }
    }

    if (g_program == 0) {
        if (real_eglSwapBuffers) return real_eglSwapBuffers(dpy, surface);
        return EGL_FALSE;
    }

    // Get surface dimensions
    EGLint width = 0, height = 0;
    eglQuerySurface(dpy, surface, EGL_WIDTH, &width);
    eglQuerySurface(dpy, surface, EGL_HEIGHT, &height);

    if (width == 0 || height == 0) {
        if (real_eglSwapBuffers) return real_eglSwapBuffers(dpy, surface);
        return EGL_FALSE;
    }

    // Save GL state
    struct GLState saved;
    saveGLState(&saved);

    ensureTexture(width, height);

    // Unbind any FBO to read from the default framebuffer
    if (gl.BindFramebuffer) gl.BindFramebuffer(GL_FRAMEBUFFER, 0);
    glReadBuffer(GL_BACK);
    glDrawBuffer(GL_BACK);

    gl.ActiveTexture(GL_TEXTURE0);
    glBindTexture(GL_TEXTURE_2D, g_texture);
    glPixelStorei(GL_PACK_ALIGNMENT, 1);
    glPixelStorei(GL_UNPACK_ALIGNMENT, 1);
    glCopyTexSubImage2D(GL_TEXTURE_2D, 0, 0, 0, 0, 0, width, height);

    renderShaderQuad(width, height);

    restoreGLState(&saved);

    g_frameCount++;

    return real_eglSwapBuffers(dpy, surface);
}

// ---------------------------------------------------------------------------
// Auto-disable timer — if the game never calls glXSwapBuffers/eglSwapBuffers
// within 15 seconds, it's using a different graphics API (Vulkan, DirectX,
// software rendering, etc.). Disable the hook to avoid any overhead.
// ---------------------------------------------------------------------------

static void* autoDisableThread(void* arg) {
    (void)arg;
    struct timespec ts = {15, 0};
    nanosleep(&ts, NULL);
    if (!g_swapBuffersCalled && g_presetId != 0) {
        g_autoDisabled = 1;
        g_presetId = 0;
        glLog("[Ember GL Hook] Auto-disable: no glXSwapBuffers/eglSwapBuffers within 15s, disabling hook\n");
    }
    return NULL;
}

static void startAutoDisableTimer(void) {
    pthread_t tid;
    pthread_create(&tid, NULL, autoDisableThread, NULL);
    pthread_detach(tid);
}

// ---------------------------------------------------------------------------
// dlsym interception — redirect glXSwapBuffers/eglSwapBuffers lookups
// GLFW loads glXSwapBuffers via dlsym(libgl_handle, "glXSwapBuffers"), which
// bypasses LD_PRELOAD interposition. We intercept dlsym to redirect these
// lookups to our hook. For RTLD_NEXT/RTLD_DEFAULT, we pass through unchanged
// to avoid breaking RTLD_NEXT semantics for the caller.
// ---------------------------------------------------------------------------

void* dlsym(void* handle, const char* symbol) {
    // Recursion guard
    if (g_inDlsymHook) {
        if (real_dlsym) return real_dlsym(handle, symbol);
        return NULL;
    }

    // Resolve real_dlsym lazily
    if (!real_dlsym) {
        g_inDlsymHook = 1;
        real_dlsym = (void* (*)(void*, const char*))dlvsym(RTLD_NEXT, "dlsym", "GLIBC_2.2.5");
        g_inDlsymHook = 0;
        if (!real_dlsym) return NULL;
    }

    // Only intercept specific-handle lookups (not RTLD_NEXT or RTLD_DEFAULT)
    // and only when a preset is active
    if (symbol && g_presetId != 0 && handle != RTLD_NEXT && handle != RTLD_DEFAULT) {
        if (strcmp(symbol, "glXSwapBuffers") == 0) {
            return (void*)glXSwapBuffers;
        }
        if (strcmp(symbol, "eglSwapBuffers") == 0) {
            return (void*)eglSwapBuffers;
        }
    }

    return real_dlsym(handle, symbol);
}

// ---------------------------------------------------------------------------
// execve interception — re-inject LD_PRELOAD for child processes
// ---------------------------------------------------------------------------

static char** modifyEnvp(char* const* envp) {
    if (g_hookPath[0] == '\0') return NULL;

    // Count entries
    int count = 0;
    while (envp[count]) count++;

    // Find existing LD_PRELOAD
    int ldPreloadIdx = -1;
    for (int i = 0; i < count; i++) {
        if (strncmp(envp[i], "LD_PRELOAD=", 11) == 0) {
            ldPreloadIdx = i;
            break;
        }
    }

    // Build new LD_PRELOAD value
    char newLdPreload[8192];
    if (ldPreloadIdx >= 0) {
        const char* existing = envp[ldPreloadIdx] + 11;
        // Check if our hook is already in the list
        if (strstr(existing, g_hookPath) != NULL) {
            return NULL; // Already there, no modification needed
        }
        snprintf(newLdPreload, sizeof(newLdPreload), "LD_PRELOAD=%s:%s",
                 g_hookPath, existing);
    } else {
        snprintf(newLdPreload, sizeof(newLdPreload), "LD_PRELOAD=%s", g_hookPath);
    }

    // Allocate new envp array
    char** newEnvp = (char**)malloc(sizeof(char*) * (count + 2));
    if (!newEnvp) return NULL;

    int j = 0;
    for (int i = 0; i < count; i++) {
        if (i == ldPreloadIdx) {
            newEnvp[j++] = strdup(newLdPreload);
        } else {
            newEnvp[j++] = strdup(envp[i]);
        }
    }
    if (ldPreloadIdx < 0) {
        newEnvp[j++] = strdup(newLdPreload);
    }
    newEnvp[j] = NULL;

    return newEnvp;
}

static void freeEnvp(char** envp) {
    if (!envp) return;
    for (int i = 0; envp[i]; i++) {
        free(envp[i]);
    }
    free(envp);
}

int execve(const char* path, char* const argv[], char* const envp[]) {
    if (!real_execve) {
        real_execve = dlsym(RTLD_NEXT, "execve");
    }

    char** newEnvp = modifyEnvp(envp);
    int result = real_execve(path, argv, newEnvp ? newEnvp : envp);
    freeEnvp(newEnvp);
    return result;
}

int execv(const char* path, char* const argv[]) {
    // execv uses environ
    extern char** environ;
    return execve(path, argv, environ);
}

int execvp(const char* file, char* const argv[]) {
    // For execvp, we need to intercept and use execve with PATH search
    // Simplest: just call execvpe which calls execve internally in glibc
    // But to be safe, let's use environ and let the real execvp handle PATH
    if (!real_execve) {
        real_execve = dlsym(RTLD_NEXT, "execve");
    }
    extern char** environ;
    char** newEnvp = modifyEnvp(environ);
    // Try with each PATH component
    const char* pathEnv = getenv("PATH");
    if (!pathEnv || strchr(file, '/')) {
        int result = real_execve(file, argv, newEnvp ? newEnvp : environ);
        freeEnvp(newEnvp);
        return result;
    }
    // Search PATH
    char pathBuf[4096];
    const char* p = pathEnv;
    while (*p) {
        const char* colon = strchr(p, ':');
        int len = colon ? (int)(colon - p) : (int)strlen(p);
        snprintf(pathBuf, sizeof(pathBuf), "%.*s/%s", len, p, file);
        int result = real_execve(pathBuf, argv, newEnvp ? newEnvp : environ);
        if (errno != ENOENT && errno != EACCES) {
            freeEnvp(newEnvp);
            return result;
        }
        if (!colon) break;
        p = colon + 1;
    }
    freeEnvp(newEnvp);
    errno = ENOENT;
    return -1;
}

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

__attribute__((constructor))
static void emberGlHookInit() {
    // Read hook path
    const char* hookPathEnv = getenv("EMBER_GL_HOOK_LIB");
    if (hookPathEnv) {
        strncpy(g_hookPath, hookPathEnv, sizeof(g_hookPath) - 1);
    }

    // Read preset
    const char* preset = getenv("EMBER_SHADER_PRESET");
    g_presetId = presetNameToId(preset);

    // Read intensity
    const char* intensityStr = getenv("EMBER_SHADER_INTENSITY");
    g_intensity = intensityStr ? atof(intensityStr) : 1.0f;

    // Read params
    for (int i = 0; i < 8; i++) {
        char name[32];
        snprintf(name, sizeof(name), "EMBER_SHADER_PARAM%d", i);
        const char* val = getenv(name);
        g_params[i] = val ? atof(val) : 0.0f;
    }

    g_logEnabled = getenv("EMBER_GL_HOOK_DEBUG") != NULL;
    if (getenv("EMBER_GL_HOOK_DEBUG") == NULL) g_logEnabled = 1; // temp: always log

    // Resolve real_dlsym early — safe to use dlvsym here before any game code runs.
    // The recursion guard protects against dlvsym calling dlsym internally.
    if (!real_dlsym) {
        g_inDlsymHook = 1;
        real_dlsym = (void* (*)(void*, const char*))dlvsym(RTLD_NEXT, "dlsym", "GLIBC_2.2.5");
        g_inDlsymHook = 0;
    }

    glLog("[Ember GL Hook] Constructor: preset=%s(id=%d) pid=%d real_dlsym=%p\n",
          preset ? preset : "(null)", g_presetId, getpid(), (void*)real_dlsym);

    if (g_presetId == 0) {
        return;
    }

    g_presetsInitialized = 1;
    g_hookLoadTime = time(NULL);
    startAutoDisableTimer();
}

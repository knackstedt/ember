export const FLAME_PRESET_NAME = "Ember Flame";

export const FLAME_PRESET_DESCRIPTION =
  "Flame-shaped spectrum bars with treble sparks, bass whitening, and mid flares";

const disabledWave = () => ({
  baseVals: {
    enabled: 0,
    samples: 512,
    sep: 0,
    scaling: 1,
    smoothing: 0.5,
    r: 1,
    g: 1,
    b: 1,
    a: 1,
    spectrum: 0,
    usedots: 0,
    thick: 0,
    additive: 0,
  },
  init_eqs: (a: any) => { a.rkeys = []; return a; },
  frame_eqs: (a: any) => a,
  point_eqs: "",
});

const disabledShape = () => ({
  baseVals: {
    enabled: 0,
    sides: 4,
    additive: 0,
    thickoutline: 0,
    textured: 0,
    num_inst: 1,
    x: 0.5,
    y: 0.5,
    rad: 0.1,
    ang: 0,
    r: 1,
    g: 0,
    b: 0,
    a: 1,
    r2: 0,
    g2: 1,
    b2: 0,
    a2: 0,
    border_r: 1,
    border_g: 1,
    border_b: 1,
    border_a: 0.1,
  },
  init_eqs: (a: any) => { a.rkeys = []; return a; },
  frame_eqs: (a: any) => a,
});

export const FLAME_PRESET = {
  name: FLAME_PRESET_NAME,
  description: FLAME_PRESET_DESCRIPTION,
  preset: {
    baseVals: {
      decay: 0.95,
      gammaadj: 2.0,
      echo_zoom: 2,
      echo_alpha: 0,
      echo_orient: 0,
      red_blue: 0,
      brighten: 0.15,
      darken: 0,
      wrap: 1,
      darken_center: 0,
      solarize: 0,
      invert: 0,
      fshader: 0,
      b1n: 0,
      b2n: 0,
      b3n: 0,
      b1x: 1,
      b2x: 1,
      b3x: 1,
      b1ed: 0.25,
      wave_mode: 7,
      additivewave: 0,
      wave_dots: 0,
      wave_thick: 1,
      wave_a: 0.95,
      wave_scale: 1.4,
      wave_smoothing: 0.25,
      wave_mystery: 0,
      wave_r: 1,
      wave_g: 0.35,
      wave_b: 0.05,
      wave_x: 0.5,
      wave_y: 0.2,
      wave_brighten: 1,
      modwavealphabyvolume: 0,
      modwavealphastart: 0.75,
      modwavealphaend: 0.95,
      mv_x: 12,
      mv_y: 9,
      mv_dx: 0,
      mv_dy: 0,
      mv_l: 0.9,
      mv_r: 1,
      mv_g: 1,
      mv_b: 1,
      mv_a: 0,
      warpanimspeed: 1.4,
      warpscale: 1,
      zoomexp: 1,
      zoom: 1,
      rot: 0,
      cx: 0.5,
      cy: 0.5,
      dx: 0,
      dy: 0,
      warp: 0.35,
      sx: 1,
      sy: 1,
      ob_size: 0.025,
      ob_r: 1,
      ob_g: 0.25,
      ob_b: 0,
      ob_a: 0.25,
      ib_size: 0.01,
      ib_r: 0.25,
      ib_g: 0.25,
      ib_b: 0.25,
      ib_a: 0,
    },
    warp: "shader_body {\nvec2 uv2 = uv;\nfloat base = 1.0 - uv.y;\nfloat center = abs(uv.x - 0.5) * 2.0;\nfloat flameZone = max(0.0, 1.0 - center * 1.8) * pow(base, 1.2);\nuv2.y += flameZone * 0.02 * (bass + 0.3);\nuv2.x += sin(uv.y * 35.0 + time * 12.0) * 0.004 * flameZone;\nuv2.x += (uv.x - 0.5) * 0.01 * flameZone;\nret = texture2D(sampler_main, uv2).rgb;\nret -= 0.005;\n}\n",
    comp: "shader_body {\nret = texture2D(sampler_main, uv).rgb;\nret *= hue_shader;\nret.r *= 1.04;\nret.b *= 0.92;\n}\n",
    init_eqs: (a: any) => { a.rkeys = []; return a; },
    frame_eqs: (a: any) => {
      a.rkeys = [];

      const bassSpike = Math.max(0, a.bass - 1.1);
      const midFlare = Math.max(0, a.mid - 1.0);
      const trebleSpike = Math.max(0, a.treb - 1.1);

      // Fire flares when mids spike.
      a.brighten = 0.15 + midFlare * 0.4;
      a.zoom = 1 + midFlare * 0.025;
      a.warp = 0.35 + midFlare * 0.12;
      a.decay = 0.95 - midFlare * 0.03;

      // Base whitens when bass spikes.
      a.ob_r = 1;
      a.ob_g = 1 - bassSpike * 0.6;
      a.ob_b = 1 - bassSpike * 0.9;
      a.ob_a = 0.25 + bassSpike * 0.55;

      // Flame color modulation.
      a.wave_r = 1;
      a.wave_g = 0.25 + a.mid * 0.3;
      a.wave_b = 0.02 + a.treb * 0.2;

      // Pass spike intensities to shapes via q vars.
      a.q1 = trebleSpike;
      a.q2 = bassSpike;
      a.q3 = midFlare;

      return a;
    },
    pixel_eqs: (a: any) => {
      // Subtle inward/upward flame distortion in the lower center.
      const base = 1.0 - a.y;
      const center = Math.abs(a.x - 0.5) * 2;
      const flameZone = Math.max(0, 1 - center * 1.8) * Math.pow(base, 1.2);
      a.dx = a.dx + (a.x - 0.5) * 0.01 * flameZone;
      a.dy = a.dy + flameZone * 0.02 * a.bass_att;
      return a;
    },
    waves: [
      {
        baseVals: {
          enabled: 1,
          samples: 256,
          sep: 0,
          scaling: 1.8,
          smoothing: 0.3,
          r: 1,
          g: 0.5,
          b: 0.1,
          a: 0.85,
          spectrum: 1,
          usedots: 0,
          thick: 1,
          additive: 1,
        },
        init_eqs: (a: any) => { a.rkeys = []; return a; },
        frame_eqs: (a: any) => {
          a.r = 1;
          a.g = 0.25 + a.mid * 0.3;
          a.b = 0.02 + a.treb * 0.2;
          a.a = 0.85 + a.bass * 0.15;
          return a;
        },
        point_eqs: (a: any) => {
          const sample = a.sample;
          const value = a.value1;

          // Sharper flame profile, highest in the middle.
          const centerDist = Math.abs(sample - 0.5) * 2;
          const flameProfile = 1 - Math.pow(centerDist, 2.2);

          // Multi-frequency turbulence for jagged, fiery edges.
          const turb = Math.sin(a.time * 15 + sample * 45) * 0.5 +
                       Math.sin(a.time * 8 + sample * 70) * 0.3 +
                       Math.sin(a.time * 25 + sample * 20) * 0.2;

          // Narrower flame that tapers toward the top.
          const flameWidth = 0.5 + a.bass_att * 0.12;
          const widthAtHeight = flameWidth * (1 - value * 0.55 + turb * 0.04);
          const x = 0.5 + (sample - 0.5) * widthAtHeight;

          // Height follows the spectrum, boosted in the middle and by bass.
          const height = value * (0.35 + flameProfile * 1.3) * (1 + a.bass_att * 0.4);
          const flicker = turb * 0.025 * a.bass_att;
          const y = 0.18 + height + flicker;

          a.x = x;
          a.y = y;

          // Fire colors: deep red base, orange, yellow, white on bass spikes.
          const h = Math.min(1, (y - 0.18) / 0.55);
          const whiteness = Math.max(0, a.bass - 1.1) * (1 - h) * 0.9;

          a.r = 1;
          a.g = Math.max(0, 0.9 - h * 0.85) + whiteness;
          a.b = Math.max(0, 0.25 - h * 0.8) + whiteness;
          a.a = 0.85 + a.bass * 0.15;

          return a;
        },
      },
      disabledWave(),
      disabledWave(),
      disabledWave(),
    ],
    shapes: [
      {
        baseVals: {
          enabled: 1,
          sides: 4,
          additive: 1,
          thickoutline: 0,
          textured: 0,
          num_inst: 48,
          x: 0.5,
          y: 0.1,
          rad: 0.008,
          ang: 0,
          r: 1,
          g: 0.8,
          b: 0.2,
          a: 0,
          r2: 1,
          g2: 0.5,
          b2: 0,
          a2: 0,
          border_r: 1,
          border_g: 0.8,
          border_b: 0.2,
          border_a: 0,
          tex_zoom: 1,
          tex_ang: 0,
        },
        init_eqs: (a: any) => { a.rkeys = []; return a; },
        frame_eqs: (a: any) => {
          const trebleSpike = a.q1 || 0;
          const sparkIntensity = Math.min(1, trebleSpike * 2.5);

          // More numerous sparks on strong treble spikes.
          a.num_inst = 24 + sparkIntensity * 56;
          a.a = sparkIntensity;
          a.a2 = sparkIntensity * 0.7;
          a.border_a = sparkIntensity * 0.5;

          // Each spark has a unique rising trajectory based on its instance.
          const seed = a.instance * 1.618;
          const phase = (a.time * 0.7 + seed * 0.7) % 1;
          const spreadX = 0.22 + Math.sin(seed * 9.7) * 0.07;

          a.x = 0.5 + Math.sin(seed * 3.7 + a.time * 0.9) * spreadX;
          a.y = 0.15 + phase * 0.7;
          a.rad = 0.004 + sparkIntensity * 0.016;
          a.ang = a.time * 2.5 + seed;

          // Bright yellow-white sparks.
          a.r = 1;
          a.g = 0.85 + sparkIntensity * 0.15;
          a.b = 0.4 + sparkIntensity * 0.5;
          a.r2 = 1;
          a.g2 = 0.65;
          a.b2 = 0.1;

          return a;
        },
      },
      disabledShape(),
      disabledShape(),
      disabledShape(),
    ],
  },
};

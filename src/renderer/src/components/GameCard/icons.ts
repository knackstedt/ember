import {
  siSteam,
  siGogdotcom,
  siPlaystation,
  siPlaystation2,
  siPlaystation3,
  siSega,
  siHeroicgameslauncher,
  siLutris,
} from "simple-icons";

function s(icon: { path: string }): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${icon.path}" fill="white"/></svg>`;
}

const flash = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="100%" height="100%" fill="black"/><path d="M 2,2.3279688 V 29.672031 H 30 V 2.3279688 Z m 20.879609,4.7904687 a 7.439,7.439 0 0 1 0.226407,0.00359 V 10.648984 A 4.655,4.655 0 0 0 21.56,10.892031 h 0.001 a 3.613,3.613 0 0 0 -1.2,0.695 4.6,4.6 0 0 0 -0.938047,1.095 11.3,11.3 0 0 0 -0.8,1.528985 H 21.315 v 3.546015 H 17.232969 L 16.26,19.981016 a 13.442,13.442 0 0 1 -1.251016,2.015 A 7.487,7.487 0 0 1 8.8939844,24.88 v -3.561016 a 4.525,4.525 0 0 0 1.9460156,-0.4 4.02,4.02 0 0 0 1.39,-1.146953 9.844,9.844 0 0 0 1.06,-1.876015 23.24,23.24 0 0 0 1.025,-2.518985 l 1.147031,-2.8 a 11.422,11.422 0 0 1 1.528985,-2.571015 7.439,7.439 0 0 1 5.888593,-2.8875785 z" fill="white"/></svg>`;

const gamecube = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="100%" height="100%" fill="black"/><path d="M9.088 20.172l6.272 3.62v-7.245l-6.277-3.62v7.245zM6.385 21.729l8.975 5.177v5.093l-13.387-7.724v-15.453l4.412 2.547zM16 8.193l-6.271 3.624 6.271 3.62 6.271-3.62-6.271-3.62zM16 5.083l7.547 4.371 4.412-2.547-11.959-6.907-13.369 7.719 4.411 2.541zM25.609 21.729v-5.265l-2.697 1.557v2.151l-6.272 3.625v-7.245l13.387-7.724v15.448l-13.387 7.729v-5.088z" fill="white"/></svg>`;

const wii = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14.293 14.293"><rect width="100%" height="100%" fill="black"/><path d="M5.823,9.66L4.636,5.259L3.434,9.66c-0.094,0.334-0.167,0.573-0.223,0.719c-0.055,0.145-0.151,0.275-0.288,0.391c-0.137,0.114-0.319,0.173-0.545,0.173c-0.184,0-0.335-0.035-0.454-0.104c-0.118-0.067-0.214-0.165-0.288-0.29s-0.134-0.273-0.18-0.445C1.409,9.931,1.367,9.773,1.331,9.625L0.11,4.682C0.037,4.396,0,4.177,0,4.026c0-0.19,0.067-0.351,0.2-0.48c0.134-0.13,0.299-0.195,0.496-0.195c0.271,0,0.452,0.087,0.545,0.26c0.094,0.173,0.176,0.425,0.246,0.756l0.961,4.286l1.076-4.011c0.08-0.307,0.152-0.541,0.215-0.701S3.906,3.642,4.05,3.525S4.389,3.35,4.636,3.35c0.25,0,0.445,0.061,0.583,0.183c0.139,0.122,0.235,0.254,0.288,0.398s0.125,0.381,0.215,0.711l1.086,4.011l0.961-4.286C7.816,4.144,7.86,3.97,7.902,3.843s0.113-0.241,0.216-0.34c0.102-0.101,0.249-0.15,0.442-0.15c0.194,0,0.358,0.064,0.493,0.193c0.136,0.128,0.203,0.29,0.203,0.483c0,0.137-0.037,0.355-0.11,0.656L7.924,9.626C7.841,9.96,7.772,10.204,7.716,10.36c-0.055,0.154-0.148,0.29-0.28,0.407c-0.132,0.116-0.317,0.176-0.558,0.176c-0.227,0-0.409-0.058-0.545-0.171c-0.137-0.113-0.232-0.241-0.286-0.383C5.994,10.247,5.919,10.003,5.823,9.66z" fill="white"/><path d="M10.839,4.748c-0.19,0-0.354-0.059-0.488-0.175c-0.136-0.117-0.202-0.282-0.202-0.496c0-0.193,0.068-0.353,0.207-0.478s0.3-0.188,0.483-0.188c0.177,0,0.333,0.057,0.471,0.17c0.137,0.114,0.205,0.279,0.205,0.496c0,0.21-0.066,0.375-0.2,0.494C11.181,4.689,11.023,4.748,10.839,4.748z M11.515,6.16v3.95c0,0.274-0.065,0.481-0.195,0.621c-0.13,0.141-0.296,0.211-0.496,0.211c-0.199,0-0.362-0.072-0.487-0.216s-0.188-0.349-0.188-0.616V6.2c0-0.27,0.063-0.474,0.188-0.611s0.288-0.205,0.487-0.205c0.2,0,0.366,0.068,0.496,0.205S11.515,5.917,11.515,6.16z" fill="white"/><path d="M13.617,4.748c-0.19,0-0.353-0.059-0.488-0.175c-0.135-0.117-0.202-0.282-0.202-0.496c0-0.193,0.069-0.353,0.208-0.478c0.138-0.125,0.299-0.188,0.482-0.188c0.177,0,0.334,0.057,0.471,0.17c0.137,0.114,0.205,0.279,0.205,0.496c0,0.21-0.066,0.375-0.2,0.494C13.96,4.689,13.801,4.748,13.617,4.748z M14.293,6.16v3.95c0,0.274-0.064,0.481-0.195,0.621c-0.13,0.141-0.295,0.211-0.495,0.211s-0.363-0.072-0.488-0.216s-0.188-0.349-0.188-0.616V6.2c0-0.27,0.063-0.474,0.188-0.611s0.288-0.205,0.488-0.205s0.365,0.068,0.495,0.205C14.229,5.726,14.293,5.917,14.293,6.16z" fill="white"/></svg>`;

const nes = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100%" height="100%" fill="black"/><rect x="10" y="20" width="80" height="60" rx="4" fill="white"/><rect x="18" y="28" width="64" height="20" fill="black"/><rect x="22" y="56" width="8" height="8" fill="black"/><rect x="36" y="56" width="8" height="8" fill="black"/></svg>`;

const snes = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100%" height="100%" fill="black"/><rect x="10" y="15" width="80" height="70" rx="12" fill="white"/><rect x="18" y="23" width="64" height="24" fill="black"/><circle cx="30" cy="62" r="6" fill="black"/><circle cx="50" cy="62" r="6" fill="black"/><circle cx="70" cy="62" r="6" fill="black"/></svg>`;

const gb = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100%" height="100%" fill="black"/><rect x="25" y="5" width="50" height="90" rx="8" fill="white"/><rect x="32" y="18" width="36" height="28" fill="black"/><rect x="32" y="54" width="10" height="10" fill="black"/><rect x="48" y="54" width="10" height="10" fill="black"/></svg>`;

const gba = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100%" height="100%" fill="black"/><rect x="5" y="25" width="90" height="50" rx="8" fill="white"/><rect x="15" y="32" width="50" height="28" fill="black"/><circle cx="78" cy="55" r="8" fill="black"/></svg>`;

const dos = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100%" height="100%" fill="black"/><rect x="10" y="10" width="80" height="70" rx="4" fill="white"/><text x="50" y="55" font-size="30" font-weight="bold" text-anchor="middle" fill="black">C:\\</text><rect x="10" y="82" width="80" height="8" rx="2" fill="white"/></svg>`;

const desktop = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100%" height="100%" fill="black"/><rect x="10" y="15" width="80" height="55" rx="4" fill="white"/><rect x="35" y="75" width="30" height="8" fill="white"/><rect x="20" y="20" width="60" height="40" fill="black"/></svg>`;

const n64 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100%" height="100%" fill="black"/><text x="50" y="70" font-family="Arial Black, Impact, Arial, sans-serif" font-size="42" font-weight="900" text-anchor="middle" fill="white">N64</text></svg>`;

const pce = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100%" height="100%" fill="black"/><rect x="25" y="30" width="50" height="40" rx="5" fill="white"/><rect x="32" y="36" width="22" height="16" fill="black"/><circle cx="70" cy="44" r="5" fill="black"/><circle cx="70" cy="58" r="5" fill="black"/><rect x="30" y="62" width="12" height="3" fill="black"/></svg>`;

const nds = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100%" height="100%" fill="black"/><rect x="30" y="12" width="40" height="34" rx="4" fill="white"/><rect x="32" y="14" width="36" height="28" fill="black"/><rect x="30" y="54" width="40" height="34" rx="4" fill="white"/><rect x="32" y="56" width="36" height="28" fill="black"/><circle cx="50" cy="50" r="3" fill="white"/></svg>`;

const dreamcast = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100%" height="100%" fill="black"/><path d="M50 15 C75 15, 85 30, 85 50 C85 70, 75 85, 50 85 C35 85, 25 75, 25 60 C25 48, 35 42, 50 42 C60 42, 68 48, 68 58 C68 68, 60 74, 50 74" fill="none" stroke="white" stroke-width="6" stroke-linecap="round"/></svg>`;

const xbox = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100%" height="100%" fill="black"/><text x="50" y="68" font-family="Arial Black, Impact, Arial, sans-serif" font-size="40" font-weight="900" text-anchor="middle" fill="white">X</text></svg>`;

const windows = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100%" height="100%" fill="black"/><rect x="16" y="16" width="32" height="32" fill="white"/><rect x="52" y="16" width="32" height="32" fill="white"/><rect x="16" y="52" width="32" height="32" fill="white"/><rect x="52" y="52" width="32" height="32" fill="white"/></svg>`;

const unknown = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100%" height="100%" fill="black"/><circle cx="50" cy="50" r="45" fill="white"/><text x="50" y="70" font-size="55" font-weight="bold" text-anchor="middle" fill="black">?</text></svg>`;

export const PLATFORM_ICONS: Record<string, string> = {
  steam: s(siSteam),
  gog: s(siGogdotcom),
  flash,
  "dolphin-gc": gamecube,
  "dolphin-wii": wii,
  heroic: s(siHeroicgameslauncher),
  lutris: s(siLutris),
  nes,
  snes,
  gb,
  gba,
  dos,
  desktop,
  n64,
  genesis: s(siSega),
  sms: s(siSega),
  gamegear: s(siSega),
  pce,
  psx: s(siPlaystation),
  ps1: s(siPlaystation),
  ps2: s(siPlaystation2),
  ps3: s(siPlaystation3),
  nds,
  dreamcast,
  xbox,
  windows,
  unknown,
};

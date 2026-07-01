// Wrapper for MinGW on Linux: ReShade SDK uses <Windows.h> (capital W)
// but MinGW headers are lowercase <windows.h> on case-sensitive filesystems.
#ifndef _EMBER_WINDOWS_H_WRAPPER
#define _EMBER_WINDOWS_H_WRAPPER
#include <windows.h>
// MinGW's __uuidof emulation only works for types with __CRT_UUID_DECL.
// The ReShade SDK uses __uuidof(T) in template methods we never call.
// Override it to avoid compilation errors.
#ifdef __MINGW32__
#undef __uuidof
#define __uuidof(x) ((const ::GUID *)0)
#endif
#endif

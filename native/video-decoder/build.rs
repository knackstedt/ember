extern crate napi_build;

fn main() {
    napi_build::setup();

    #[cfg(target_os = "linux")]
    {
        // Link FFmpeg libraries.
        println!("cargo:rustc-link-lib=avcodec");
        println!("cargo:rustc-link-lib=avformat");
        println!("cargo:rustc-link-lib=avutil");
        println!("cargo:rustc-link-lib=swscale");

        // Pick the system library path based on the compilation target.
        let target = std::env::var("TARGET").unwrap_or_default();
        let (syslib, libsearch) = if target.contains("aarch64") {
            (
                "/usr/lib/aarch64-linux-gnu",
                Some("/usr/lib/aarch64-linux-gnu"),
            )
        } else {
            ("/lib/x86_64-linux-gnu", None)
        };

        // For cross-compilation, add the foreign-arch library search path
        // so the linker can find the FFmpeg libraries.
        if let Some(path) = libsearch {
            println!("cargo:rustc-link-search=native={}", path);
        }

        // Use RPATH (not RUNPATH) so it's searched before the host
        // binary's RPATH for our direct dependencies.
        println!(
            "cargo:rustc-link-arg=-Wl,--disable-new-dtags,-rpath,$ORIGIN:{}",
            syslib
        );
    }
}

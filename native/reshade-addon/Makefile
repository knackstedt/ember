# ReShade Addon DLL — cross-compiled for Windows x64 with MinGW
#
# Requires: mingw-w64 (apt install mingw-w64 on Debian/Ubuntu)
#
# The output file uses .addon64 extension (ReShade 6+ loads *.addon/*.addon64, not *.dll)

CXX = x86_64-w64-mingw32-g++
CXXFLAGS = -std=c++17 -O2 -Wall -Wno-unused-function -shared \
           -Iinclude -DUNICODE -D_UNICODE \
           -static-libgcc -static-libstdc++
TARGET = EmberReShadeAddon.addon64
SRC = src/ember_reshade_addon.cpp

.PHONY: all clean install

all: $(TARGET)

$(TARGET): $(SRC)
	$(CXX) $(CXXFLAGS) -o $(TARGET) $(SRC)

install: all
	mkdir -p ../../resources/reshade
	cp $(TARGET) ../../resources/reshade/

clean:
	rm -f $(TARGET)

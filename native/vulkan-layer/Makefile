# Ember Vulkan Layer Makefile
# Build: make
# Install: make install (copies to ~/.local/share/vulkan/explicit_layer.d/)

LAYER_NAME = VkLayer_ember_shader
CXX = g++
CXXFLAGS = -std=c++17 -fPIC -O2 -Wall -Wno-unused-function
LDFLAGS = -shared
LIBS = -lvulkan

GLSL_COMPILER = glslangValidator

.PHONY: all install clean shaders

all: $(LAYER_NAME).so

shaders: spirv/post_vert.h spirv/post_frag.h

spirv/post.vert.spv: shaders/post.vert
	mkdir -p spirv
	$(GLSL_COMPILER) -V -o spirv/post.vert.spv shaders/post.vert

spirv/post.frag.spv: shaders/post.frag
	mkdir -p spirv
	$(GLSL_COMPILER) -V -o spirv/post.frag.spv shaders/post.frag

spirv/post_vert.h: spirv/post.vert.spv
	xxd -i spirv/post.vert.spv > spirv/post_vert.h

spirv/post_frag.h: spirv/post.frag.spv
	xxd -i spirv/post.frag.spv > spirv/post_frag.h

$(LAYER_NAME).so: layer.cpp spirv/post_vert.h spirv/post_frag.h
	$(CXX) $(CXXFLAGS) $(LDFLAGS) -o $@ layer.cpp $(LIBS)

install: all
	mkdir -p ~/.local/share/vulkan/explicit_layer.d/
	cp $(LAYER_NAME).so ~/.local/share/vulkan/explicit_layer.d/
	cp $(LAYER_NAME).json ~/.local/share/vulkan/explicit_layer.d/

clean:
	rm -f $(LAYER_NAME).so spirv/*.spv spirv/*.h

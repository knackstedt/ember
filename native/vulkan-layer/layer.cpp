/*
 * Ember Vulkan Layer — Shader Injection
 *
 * Intercepts vkQueuePresentKHR and applies post-processing shaders
 * to the swapchain image. Reads EMBER_SHADER_PRESET and
 * EMBER_SHADER_INTENSITY env vars.
 */

#include <vulkan/vulkan.h>
#include <vulkan/vk_layer.h>

#include <cstdlib>
#include <cstring>
#include <cstdio>
#include <cstdarg>
#include <string>
#include <unordered_map>
#include <mutex>
#include <atomic>
#include <unistd.h>
#include <vector>

#include "spirv/post_vert.h"
#include "spirv/post_frag.h"

#ifndef VK_LAYER_EXPORT
#define VK_LAYER_EXPORT __attribute__((visibility("default")))
#endif

static const char* kLayerName = "VK_LAYER_ember_shader";
static const uint32_t kLayerImplementationVersion = 1;

static void emberLog(const char* fmt, ...) {
    va_list ap;
    va_start(ap, fmt);
    vfprintf(stderr, fmt, ap);
    va_end(ap);
}

static std::string getShaderPreset() {
    const char* preset = std::getenv("EMBER_SHADER_PRESET");
    return preset ? std::string(preset) : std::string("none");
}

static float getShaderIntensity() {
    const char* intensity = std::getenv("EMBER_SHADER_INTENSITY");
    if (!intensity) return 1.0f;
    return std::atof(intensity);
}

static void getShaderParams(float* params, int maxParams) {
    for (int i = 0; i < maxParams; i++) {
        char envName[32];
        snprintf(envName, sizeof(envName), "EMBER_SHADER_PARAM%d", i);
        const char* val = std::getenv(envName);
        params[i] = val ? std::atof(val) : 0.0f;
    }
}

// ============================================================================
// Dispatch table
// ============================================================================

struct LayerDispatchTable {
    PFN_vkGetInstanceProcAddr getInstanceProcAddr = nullptr;
    PFN_vkGetDeviceProcAddr getDeviceProcAddr = nullptr;
    PFN_vkQueuePresentKHR queuePresentKHR = nullptr;
    PFN_vkGetSwapchainImagesKHR getSwapchainImagesKHR = nullptr;
    PFN_vkDestroySwapchainKHR destroySwapchainKHR = nullptr;
    PFN_vkCreateSwapchainKHR createSwapchainKHR = nullptr;

    // Pipeline resources
    PFN_vkGetPhysicalDeviceMemoryProperties getPhysicalDeviceMemoryProperties = nullptr;
    PFN_vkCreateImage createImage = nullptr;
    PFN_vkDestroyImage destroyImage = nullptr;
    PFN_vkAllocateMemory allocateMemory = nullptr;
    PFN_vkFreeMemory freeMemory = nullptr;
    PFN_vkBindImageMemory bindImageMemory = nullptr;
    PFN_vkGetImageMemoryRequirements getImageMemoryRequirements = nullptr;
    PFN_vkCreateImageView createImageView = nullptr;
    PFN_vkDestroyImageView destroyImageView = nullptr;
    PFN_vkCreateRenderPass createRenderPass = nullptr;
    PFN_vkDestroyRenderPass destroyRenderPass = nullptr;
    PFN_vkCreatePipelineLayout createPipelineLayout = nullptr;
    PFN_vkDestroyPipelineLayout destroyPipelineLayout = nullptr;
    PFN_vkCreateGraphicsPipelines createGraphicsPipelines = nullptr;
    PFN_vkDestroyPipeline destroyPipeline = nullptr;
    PFN_vkCreateDescriptorSetLayout createDescriptorSetLayout = nullptr;
    PFN_vkDestroyDescriptorSetLayout destroyDescriptorSetLayout = nullptr;
    PFN_vkCreateDescriptorPool createDescriptorPool = nullptr;
    PFN_vkDestroyDescriptorPool destroyDescriptorPool = nullptr;
    PFN_vkAllocateDescriptorSets allocateDescriptorSets = nullptr;
    PFN_vkUpdateDescriptorSets updateDescriptorSets = nullptr;
    PFN_vkCreateSampler createSampler = nullptr;
    PFN_vkDestroySampler destroySampler = nullptr;
    PFN_vkCreateFramebuffer createFramebuffer = nullptr;
    PFN_vkDestroyFramebuffer destroyFramebuffer = nullptr;
    PFN_vkCreateCommandPool createCommandPool = nullptr;
    PFN_vkDestroyCommandPool destroyCommandPool = nullptr;
    PFN_vkAllocateCommandBuffers allocateCommandBuffers = nullptr;
    PFN_vkBeginCommandBuffer beginCommandBuffer = nullptr;
    PFN_vkEndCommandBuffer endCommandBuffer = nullptr;
    PFN_vkResetCommandBuffer resetCommandBuffer = nullptr;
    PFN_vkCmdPipelineBarrier cmdPipelineBarrier = nullptr;
    PFN_vkCmdClearColorImage cmdClearColorImage = nullptr;
    PFN_vkCmdCopyImage cmdCopyImage = nullptr;
    PFN_vkCmdBeginRenderPass cmdBeginRenderPass = nullptr;
    PFN_vkCmdEndRenderPass cmdEndRenderPass = nullptr;
    PFN_vkCmdBindPipeline cmdBindPipeline = nullptr;
    PFN_vkCmdBindDescriptorSets cmdBindDescriptorSets = nullptr;
    PFN_vkCmdDraw cmdDraw = nullptr;
    PFN_vkCmdSetViewport cmdSetViewport = nullptr;
    PFN_vkCmdSetScissor cmdSetScissor = nullptr;
    PFN_vkQueueSubmit queueSubmit = nullptr;
    PFN_vkCreateFence createFence = nullptr;
    PFN_vkDestroyFence destroyFence = nullptr;
    PFN_vkWaitForFences waitForFences = nullptr;

    VkDevice device = VK_NULL_HANDLE;
    VkPhysicalDevice physicalDevice = VK_NULL_HANDLE;
    VkPhysicalDeviceMemoryProperties memProps{};
    VkCommandPool commandPool = VK_NULL_HANDLE;
    VkCommandBuffer commandBuffer = VK_NULL_HANDLE;
};

static std::mutex g_tableMutex;
static std::unordered_map<VkInstance, LayerDispatchTable*> g_instanceTables;
static std::unordered_map<VkDevice, LayerDispatchTable*> g_deviceTables;

// ============================================================================
// Per-swapchain pipeline data
// ============================================================================

struct SwapchainData {
    VkFormat format = VK_FORMAT_UNDEFINED;
    VkExtent2D extent = {0, 0};
    std::vector<VkImage> images;

    // Pipeline resources (shared across all images in this swapchain)
    VkRenderPass renderPass = VK_NULL_HANDLE;
    VkPipelineLayout pipelineLayout = VK_NULL_HANDLE;
    VkPipeline pipeline = VK_NULL_HANDLE;
    VkDescriptorSetLayout descriptorSetLayout = VK_NULL_HANDLE;
    VkDescriptorPool descriptorPool = VK_NULL_HANDLE;
    VkSampler sampler = VK_NULL_HANDLE;

    // Per-image resources
    struct ImageResources {
        VkImage tempImage = VK_NULL_HANDLE;
        VkDeviceMemory tempMemory = VK_NULL_HANDLE;
        VkImageView tempView = VK_NULL_HANDLE;
        VkImageView swapchainView = VK_NULL_HANDLE;
        VkFramebuffer framebuffer = VK_NULL_HANDLE;
        VkDescriptorSet descriptorSet = VK_NULL_HANDLE;
    };
    std::vector<ImageResources> perImage;
    bool pipelineCreated = false;
    LayerDispatchTable* table = nullptr;
};

static std::mutex g_swapchainMutex;
static std::unordered_map<VkSwapchainKHR, SwapchainData*> g_swapchainData;

static LayerDispatchTable* getTable(VkInstance instance) {
    std::lock_guard<std::mutex> lock(g_tableMutex);
    auto it = g_instanceTables.find(instance);
    return it != g_instanceTables.end() ? it->second : nullptr;
}

static LayerDispatchTable* getDeviceTable(VkDevice device) {
    std::lock_guard<std::mutex> lock(g_tableMutex);
    auto it = g_deviceTables.find(device);
    return it != g_deviceTables.end() ? it->second : nullptr;
}

// ============================================================================
// Logging
// ============================================================================

static std::atomic<bool> g_shaderLogged{false};

static void logShaderPreset() {
    if (g_shaderLogged.exchange(true)) return;
    std::string preset = getShaderPreset();
    float intensity = getShaderIntensity();
    emberLog("[Ember Vulkan Layer] Active shader preset: %s (intensity: %.2f) pid=%d\n",
            preset.c_str(), intensity, getpid());
}

// ============================================================================
// Forward declarations
// ============================================================================

static VKAPI_ATTR VkResult VKAPI_CALL emberEnumerateInstanceLayerProperties(
    uint32_t* pPropertyCount, VkLayerProperties* pProperties);
static VKAPI_ATTR VkResult VKAPI_CALL emberEnumerateInstanceExtensionProperties(
    const char* pLayerName, uint32_t* pPropertyCount, VkExtensionProperties* pProperties);
static VKAPI_ATTR VkResult VKAPI_CALL emberGetSwapchainImagesKHR(
    VkDevice device, VkSwapchainKHR swapchain,
    uint32_t* pSwapchainImageCount, VkImage* pSwapchainImages);
static VKAPI_ATTR void VKAPI_CALL emberDestroySwapchainKHR(
    VkDevice device, VkSwapchainKHR swapchain, const VkAllocationCallbacks* pAllocator);
static VKAPI_ATTR VkResult VKAPI_CALL emberCreateSwapchainKHR(
    VkDevice device, const VkSwapchainCreateInfoKHR* pCreateInfo,
    const VkAllocationCallbacks* pAllocator, VkSwapchainKHR* pSwapchain);

// ============================================================================
// Pipeline creation for a swapchain
// ============================================================================

static uint32_t findMemoryType(LayerDispatchTable* table, uint32_t typeBits, VkMemoryPropertyFlags props) {
    for (uint32_t i = 0; i < table->memProps.memoryTypeCount; i++) {
        if ((typeBits & (1 << i)) && (table->memProps.memoryTypes[i].propertyFlags & props) == props) {
            return i;
        }
    }
    return 0;
}

static bool createSwapchainPipeline(LayerDispatchTable* table, SwapchainData* sc) {
    VkDevice dev = table->device;
    VkFormat format = sc->format;
    VkExtent2D extent = sc->extent;

    emberLog("[Ember Vulkan Layer] Creating pipeline: %ux%u format=%d\n",
            extent.width, extent.height, (int)format);

    // --- Render pass ---
    VkAttachmentDescription colorAttachment = {};
    colorAttachment.format = format;
    colorAttachment.samples = VK_SAMPLE_COUNT_1_BIT;
    colorAttachment.loadOp = VK_ATTACHMENT_LOAD_OP_DONT_CARE;
    colorAttachment.storeOp = VK_ATTACHMENT_STORE_OP_STORE;
    colorAttachment.stencilLoadOp = VK_ATTACHMENT_LOAD_OP_DONT_CARE;
    colorAttachment.stencilStoreOp = VK_ATTACHMENT_STORE_OP_DONT_CARE;
    colorAttachment.initialLayout = VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL;
    colorAttachment.finalLayout = VK_IMAGE_LAYOUT_PRESENT_SRC_KHR;

    VkAttachmentReference colorRef = {};
    colorRef.attachment = 0;
    colorRef.layout = VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL;

    VkSubpassDescription subpass = {};
    subpass.pipelineBindPoint = VK_PIPELINE_BIND_POINT_GRAPHICS;
    subpass.colorAttachmentCount = 1;
    subpass.pColorAttachments = &colorRef;

    VkRenderPassCreateInfo rpInfo = {};
    rpInfo.sType = VK_STRUCTURE_TYPE_RENDER_PASS_CREATE_INFO;
    rpInfo.attachmentCount = 1;
    rpInfo.pAttachments = &colorAttachment;
    rpInfo.subpassCount = 1;
    rpInfo.pSubpasses = &subpass;

    if (table->createRenderPass(dev, &rpInfo, nullptr, &sc->renderPass) != VK_SUCCESS) {
        emberLog("[Ember Vulkan Layer] Failed to create render pass\n");
        return false;
    }

    // --- Descriptor set layout ---
    VkDescriptorSetLayoutBinding samplerBinding = {};
    samplerBinding.binding = 0;
    samplerBinding.descriptorType = VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER;
    samplerBinding.descriptorCount = 1;
    samplerBinding.stageFlags = VK_SHADER_STAGE_FRAGMENT_BIT;

    VkDescriptorSetLayoutCreateInfo dslInfo = {};
    dslInfo.sType = VK_STRUCTURE_TYPE_DESCRIPTOR_SET_LAYOUT_CREATE_INFO;
    dslInfo.bindingCount = 1;
    dslInfo.pBindings = &samplerBinding;

    if (table->createDescriptorSetLayout(dev, &dslInfo, nullptr, &sc->descriptorSetLayout) != VK_SUCCESS) {
        emberLog("[Ember Vulkan Layer] Failed to create descriptor set layout\n");
        return false;
    }

    // --- Pipeline layout ---
    VkPushConstantRange pcRange = {};
    pcRange.stageFlags = VK_SHADER_STAGE_FRAGMENT_BIT;
    pcRange.offset = 0;
    pcRange.size = sizeof(float) * 13; // intensity, time, resolution.x, resolution.y, preset, params[8]

    VkPipelineLayoutCreateInfo plInfo = {};
    plInfo.sType = VK_STRUCTURE_TYPE_PIPELINE_LAYOUT_CREATE_INFO;
    plInfo.setLayoutCount = 1;
    plInfo.pSetLayouts = &sc->descriptorSetLayout;
    plInfo.pushConstantRangeCount = 1;
    plInfo.pPushConstantRanges = &pcRange;

    if (table->createPipelineLayout(dev, &plInfo, nullptr, &sc->pipelineLayout) != VK_SUCCESS) {
        emberLog("[Ember Vulkan Layer] Failed to create pipeline layout\n");
        return false;
    }

    // --- Shader modules ---
    VkShaderModuleCreateInfo vertInfo = {};
    vertInfo.sType = VK_STRUCTURE_TYPE_SHADER_MODULE_CREATE_INFO;
    vertInfo.codeSize = spirv_post_vert_spv_len;
    vertInfo.pCode = (const uint32_t*)spirv_post_vert_spv;

    VkShaderModule vertModule;
    if (table->getDeviceProcAddr) {
        PFN_vkCreateShaderModule createShaderModule =
            (PFN_vkCreateShaderModule)table->getDeviceProcAddr(dev, "vkCreateShaderModule");
        PFN_vkDestroyShaderModule destroyShaderModule =
            (PFN_vkDestroyShaderModule)table->getDeviceProcAddr(dev, "vkDestroyShaderModule");
        if (!createShaderModule) return false;

        if (createShaderModule(dev, &vertInfo, nullptr, &vertModule) != VK_SUCCESS) {
            emberLog("[Ember Vulkan Layer] Failed to create vert shader module\n");
            return false;
        }

        VkShaderModuleCreateInfo fragInfo = {};
        fragInfo.sType = VK_STRUCTURE_TYPE_SHADER_MODULE_CREATE_INFO;
        fragInfo.codeSize = spirv_post_frag_spv_len;
        fragInfo.pCode = (const uint32_t*)spirv_post_frag_spv;

        VkShaderModule fragModule;
        if (createShaderModule(dev, &fragInfo, nullptr, &fragModule) != VK_SUCCESS) {
            emberLog("[Ember Vulkan Layer] Failed to create frag shader module\n");
            destroyShaderModule(dev, vertModule, nullptr);
            return false;
        }

        // --- Graphics pipeline ---
        VkPipelineShaderStageCreateInfo stages[2] = {};
        stages[0].sType = VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO;
        stages[0].stage = VK_SHADER_STAGE_VERTEX_BIT;
        stages[0].module = vertModule;
        stages[0].pName = "main";
        stages[1].sType = VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO;
        stages[1].stage = VK_SHADER_STAGE_FRAGMENT_BIT;
        stages[1].module = fragModule;
        stages[1].pName = "main";

        VkPipelineVertexInputStateCreateInfo vertexInput = {};
        vertexInput.sType = VK_STRUCTURE_TYPE_PIPELINE_VERTEX_INPUT_STATE_CREATE_INFO;

        VkPipelineInputAssemblyStateCreateInfo inputAssembly = {};
        inputAssembly.sType = VK_STRUCTURE_TYPE_PIPELINE_INPUT_ASSEMBLY_STATE_CREATE_INFO;
        inputAssembly.topology = VK_PRIMITIVE_TOPOLOGY_TRIANGLE_LIST;

        VkViewport viewport = {0.0f, 0.0f, (float)extent.width, (float)extent.height, 0.0f, 1.0f};
        VkRect2D scissor = {{0, 0}, extent};

        VkPipelineViewportStateCreateInfo viewportState = {};
        viewportState.sType = VK_STRUCTURE_TYPE_PIPELINE_VIEWPORT_STATE_CREATE_INFO;
        viewportState.viewportCount = 1;
        viewportState.pViewports = &viewport;
        viewportState.scissorCount = 1;
        viewportState.pScissors = &scissor;

        VkPipelineRasterizationStateCreateInfo rasterizer = {};
        rasterizer.sType = VK_STRUCTURE_TYPE_PIPELINE_RASTERIZATION_STATE_CREATE_INFO;
        rasterizer.depthClampEnable = VK_FALSE;
        rasterizer.rasterizerDiscardEnable = VK_FALSE;
        rasterizer.polygonMode = VK_POLYGON_MODE_FILL;
        rasterizer.cullMode = VK_CULL_MODE_NONE;
        rasterizer.frontFace = VK_FRONT_FACE_CLOCKWISE;
        rasterizer.lineWidth = 1.0f;

        VkPipelineMultisampleStateCreateInfo multisampling = {};
        multisampling.sType = VK_STRUCTURE_TYPE_PIPELINE_MULTISAMPLE_STATE_CREATE_INFO;
        multisampling.rasterizationSamples = VK_SAMPLE_COUNT_1_BIT;

        VkPipelineColorBlendAttachmentState blendAttachment = {};
        blendAttachment.blendEnable = VK_FALSE;
        blendAttachment.colorWriteMask = VK_COLOR_COMPONENT_R_BIT | VK_COLOR_COMPONENT_G_BIT |
                                         VK_COLOR_COMPONENT_B_BIT | VK_COLOR_COMPONENT_A_BIT;

        VkPipelineColorBlendStateCreateInfo blendState = {};
        blendState.sType = VK_STRUCTURE_TYPE_PIPELINE_COLOR_BLEND_STATE_CREATE_INFO;
        blendState.logicOpEnable = VK_FALSE;
        blendState.attachmentCount = 1;
        blendState.pAttachments = &blendAttachment;

        VkGraphicsPipelineCreateInfo pipelineInfo = {};
        pipelineInfo.sType = VK_STRUCTURE_TYPE_GRAPHICS_PIPELINE_CREATE_INFO;
        pipelineInfo.stageCount = 2;
        pipelineInfo.pStages = stages;
        pipelineInfo.pVertexInputState = &vertexInput;
        pipelineInfo.pInputAssemblyState = &inputAssembly;
        pipelineInfo.pViewportState = &viewportState;
        pipelineInfo.pRasterizationState = &rasterizer;
        pipelineInfo.pMultisampleState = &multisampling;
        pipelineInfo.pColorBlendState = &blendState;
        pipelineInfo.layout = sc->pipelineLayout;
        pipelineInfo.renderPass = sc->renderPass;
        pipelineInfo.subpass = 0;

        if (table->createGraphicsPipelines(dev, VK_NULL_HANDLE, 1, &pipelineInfo, nullptr, &sc->pipeline) != VK_SUCCESS) {
            emberLog("[Ember Vulkan Layer] Failed to create graphics pipeline\n");
            destroyShaderModule(dev, vertModule, nullptr);
            destroyShaderModule(dev, fragModule, nullptr);
            return false;
        }

        destroyShaderModule(dev, vertModule, nullptr);
        destroyShaderModule(dev, fragModule, nullptr);
    } else {
        return false;
    }

    // --- Sampler ---
    VkSamplerCreateInfo samplerInfo = {};
    samplerInfo.sType = VK_STRUCTURE_TYPE_SAMPLER_CREATE_INFO;
    samplerInfo.magFilter = VK_FILTER_LINEAR;
    samplerInfo.minFilter = VK_FILTER_LINEAR;
    samplerInfo.addressModeU = VK_SAMPLER_ADDRESS_MODE_CLAMP_TO_EDGE;
    samplerInfo.addressModeV = VK_SAMPLER_ADDRESS_MODE_CLAMP_TO_EDGE;
    samplerInfo.addressModeW = VK_SAMPLER_ADDRESS_MODE_CLAMP_TO_EDGE;
    samplerInfo.borderColor = VK_BORDER_COLOR_INT_OPAQUE_BLACK;
    samplerInfo.unnormalizedCoordinates = VK_FALSE;

    if (table->createSampler(dev, &samplerInfo, nullptr, &sc->sampler) != VK_SUCCESS) {
        emberLog("[Ember Vulkan Layer] Failed to create sampler\n");
        return false;
    }

    // --- Descriptor pool ---
    VkDescriptorPoolSize poolSize = {};
    poolSize.type = VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER;
    poolSize.descriptorCount = (uint32_t)sc->images.size();

    VkDescriptorPoolCreateInfo poolInfo = {};
    poolInfo.sType = VK_STRUCTURE_TYPE_DESCRIPTOR_POOL_CREATE_INFO;
    poolInfo.maxSets = (uint32_t)sc->images.size();
    poolInfo.poolSizeCount = 1;
    poolInfo.pPoolSizes = &poolSize;

    if (table->createDescriptorPool(dev, &poolInfo, nullptr, &sc->descriptorPool) != VK_SUCCESS) {
        emberLog("[Ember Vulkan Layer] Failed to create descriptor pool\n");
        return false;
    }

    // --- Per-image resources ---
    sc->perImage.resize(sc->images.size());

    for (size_t i = 0; i < sc->images.size(); i++) {
        auto& img = sc->perImage[i];

        // Create temp image (sampleable copy)
        VkImageCreateInfo imageInfo = {};
        imageInfo.sType = VK_STRUCTURE_TYPE_IMAGE_CREATE_INFO;
        imageInfo.imageType = VK_IMAGE_TYPE_2D;
        imageInfo.format = format;
        imageInfo.extent = {extent.width, extent.height, 1};
        imageInfo.mipLevels = 1;
        imageInfo.arrayLayers = 1;
        imageInfo.samples = VK_SAMPLE_COUNT_1_BIT;
        imageInfo.tiling = VK_IMAGE_TILING_OPTIMAL;
        imageInfo.usage = VK_IMAGE_USAGE_TRANSFER_DST_BIT | VK_IMAGE_USAGE_SAMPLED_BIT;
        imageInfo.initialLayout = VK_IMAGE_LAYOUT_UNDEFINED;

        if (table->createImage(dev, &imageInfo, nullptr, &img.tempImage) != VK_SUCCESS) {
            emberLog("[Ember Vulkan Layer] Failed to create temp image %zu\n", i);
            return false;
        }

        VkMemoryRequirements memReqs;
        table->getImageMemoryRequirements(dev, img.tempImage, &memReqs);

        VkMemoryAllocateInfo allocInfo = {};
        allocInfo.sType = VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO;
        allocInfo.allocationSize = memReqs.size;
        allocInfo.memoryTypeIndex = findMemoryType(table, memReqs.memoryTypeBits,
            VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT);

        if (table->allocateMemory(dev, &allocInfo, nullptr, &img.tempMemory) != VK_SUCCESS) {
            emberLog("[Ember Vulkan Layer] Failed to allocate temp memory %zu\n", i);
            return false;
        }

        table->bindImageMemory(dev, img.tempImage, img.tempMemory, 0);

        // Temp image view
        VkImageViewCreateInfo viewInfo = {};
        viewInfo.sType = VK_STRUCTURE_TYPE_IMAGE_VIEW_CREATE_INFO;
        viewInfo.image = img.tempImage;
        viewInfo.viewType = VK_IMAGE_VIEW_TYPE_2D;
        viewInfo.format = format;
        viewInfo.subresourceRange = {VK_IMAGE_ASPECT_COLOR_BIT, 0, 1, 0, 1};

        if (table->createImageView(dev, &viewInfo, nullptr, &img.tempView) != VK_SUCCESS) {
            emberLog("[Ember Vulkan Layer] Failed to create temp view %zu\n", i);
            return false;
        }

        // Swapchain image view
        viewInfo.image = sc->images[i];
        if (table->createImageView(dev, &viewInfo, nullptr, &img.swapchainView) != VK_SUCCESS) {
            emberLog("[Ember Vulkan Layer] Failed to create swapchain view %zu\n", i);
            return false;
        }

        // Framebuffer
        VkFramebufferCreateInfo fbInfo = {};
        fbInfo.sType = VK_STRUCTURE_TYPE_FRAMEBUFFER_CREATE_INFO;
        fbInfo.renderPass = sc->renderPass;
        fbInfo.attachmentCount = 1;
        fbInfo.pAttachments = &img.swapchainView;
        fbInfo.width = extent.width;
        fbInfo.height = extent.height;
        fbInfo.layers = 1;

        if (table->createFramebuffer(dev, &fbInfo, nullptr, &img.framebuffer) != VK_SUCCESS) {
            emberLog("[Ember Vulkan Layer] Failed to create framebuffer %zu\n", i);
            return false;
        }

        // Descriptor set
        VkDescriptorSetAllocateInfo dsAllocInfo = {};
        dsAllocInfo.sType = VK_STRUCTURE_TYPE_DESCRIPTOR_SET_ALLOCATE_INFO;
        dsAllocInfo.descriptorPool = sc->descriptorPool;
        dsAllocInfo.descriptorSetCount = 1;
        dsAllocInfo.pSetLayouts = &sc->descriptorSetLayout;

        if (table->allocateDescriptorSets(dev, &dsAllocInfo, &img.descriptorSet) != VK_SUCCESS) {
            emberLog("[Ember Vulkan Layer] Failed to allocate descriptor set %zu\n", i);
            return false;
        }

        VkDescriptorImageInfo descImageInfo = {};
        descImageInfo.sampler = sc->sampler;
        descImageInfo.imageView = img.tempView;
        descImageInfo.imageLayout = VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL;

        VkWriteDescriptorSet writeSet = {};
        writeSet.sType = VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET;
        writeSet.dstSet = img.descriptorSet;
        writeSet.dstBinding = 0;
        writeSet.dstArrayElement = 0;
        writeSet.descriptorType = VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER;
        writeSet.descriptorCount = 1;
        writeSet.pImageInfo = &descImageInfo;

        table->updateDescriptorSets(dev, 1, &writeSet, 0, nullptr);
    }

    return true;
}

static void destroySwapchainPipeline(LayerDispatchTable* table, SwapchainData* sc) {
    VkDevice dev = table->device;

    // Wait for device to be idle before destroying
    PFN_vkDeviceWaitIdle deviceWaitIdle =
        (PFN_vkDeviceWaitIdle)table->getDeviceProcAddr(dev, "vkDeviceWaitIdle");
    if (deviceWaitIdle) deviceWaitIdle(dev);

    for (auto& img : sc->perImage) {
        if (img.framebuffer) table->destroyFramebuffer(dev, img.framebuffer, nullptr);
        if (img.swapchainView) table->destroyImageView(dev, img.swapchainView, nullptr);
        if (img.tempView) table->destroyImageView(dev, img.tempView, nullptr);
        if (img.tempImage) table->destroyImage(dev, img.tempImage, nullptr);
        if (img.tempMemory) table->freeMemory(dev, img.tempMemory, nullptr);
    }
    sc->perImage.clear();

    if (sc->descriptorPool) table->destroyDescriptorPool(dev, sc->descriptorPool, nullptr);
    if (sc->sampler) table->destroySampler(dev, sc->sampler, nullptr);
    if (sc->pipeline) table->destroyPipeline(dev, sc->pipeline, nullptr);
    if (sc->pipelineLayout) table->destroyPipelineLayout(dev, sc->pipelineLayout, nullptr);
    if (sc->descriptorSetLayout) table->destroyDescriptorSetLayout(dev, sc->descriptorSetLayout, nullptr);
    if (sc->renderPass) table->destroyRenderPass(dev, sc->renderPass, nullptr);
}

// ============================================================================
// vkQueuePresentKHR — apply shader and forward
// ============================================================================

static VKAPI_ATTR VkResult VKAPI_CALL emberQueuePresentKHR(
    VkQueue queue, const VkPresentInfoKHR* pPresentInfo) {

    logShaderPreset();

    LayerDispatchTable* table = nullptr;
    // Try to find the table from the swapchain data first
    if (pPresentInfo->swapchainCount > 0) {
        std::lock_guard<std::mutex> lock(g_swapchainMutex);
        auto it = g_swapchainData.find(pPresentInfo->pSwapchains[0]);
        if (it != g_swapchainData.end() && it->second->table) {
            table = it->second->table;
        }
    }
    // Fallback to first device table
    if (!table) {
        std::lock_guard<std::mutex> lock(g_tableMutex);
        if (!g_deviceTables.empty()) {
            table = g_deviceTables.begin()->second;
        }
    }

    if (!table || !table->queuePresentKHR) {
        return VK_ERROR_INITIALIZATION_FAILED;
    }

    static std::atomic<int> g_presentCount{0};
    int count = g_presentCount.fetch_add(1);
    if (count < 3) {
        emberLog("[Ember Vulkan Layer] present #%d (swapchains=%u)\n",
                count, pPresentInfo->swapchainCount);
    }

    // Create command pool + buffer (all functions loaded in emberCreateDevice)
    if (table->commandPool == VK_NULL_HANDLE && table->createCommandPool) {
        VkCommandPoolCreateInfo poolInfo = {};
        poolInfo.sType = VK_STRUCTURE_TYPE_COMMAND_POOL_CREATE_INFO;
        poolInfo.queueFamilyIndex = 0;
        poolInfo.flags = VK_COMMAND_POOL_CREATE_RESET_COMMAND_BUFFER_BIT;

        VkResult poolResult = table->createCommandPool(table->device, &poolInfo, nullptr, &table->commandPool);
        if (poolResult != VK_SUCCESS) {
            emberLog("[Ember Vulkan Layer] createCommandPool failed: %d\n", poolResult);
        } else if (table->allocateCommandBuffers) {
            VkCommandBufferAllocateInfo allocInfo = {};
            allocInfo.sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_ALLOCATE_INFO;
            allocInfo.commandPool = table->commandPool;
            allocInfo.level = VK_COMMAND_BUFFER_LEVEL_PRIMARY;
            allocInfo.commandBufferCount = 1;
            VkResult allocResult = table->allocateCommandBuffers(table->device, &allocInfo, &table->commandBuffer);
            if (allocResult != VK_SUCCESS) {
                emberLog("[Ember Vulkan Layer] allocateCommandBuffers failed: %d\n", allocResult);
            } else {
                emberLog("[Ember Vulkan Layer] Command pool + buffer created\n");
            }
        }
    }

    if (table->commandBuffer == VK_NULL_HANDLE) {
        if (count < 3) {
            emberLog("[Ember Vulkan Layer] No command buffer, passthrough\n");
        }
        return table->queuePresentKHR(queue, pPresentInfo);
    }

    float intensity = getShaderIntensity();

    for (uint32_t i = 0; i < pPresentInfo->swapchainCount; i++) {
        VkSwapchainKHR sc = pPresentInfo->pSwapchains[i];
        uint32_t imgIdx = pPresentInfo->pImageIndices[i];

        SwapchainData* scData = nullptr;
        {
            std::lock_guard<std::mutex> lock(g_swapchainMutex);
            auto it = g_swapchainData.find(sc);
            if (it != g_swapchainData.end()) scData = it->second;
        }

        if (!scData) {
            if (count < 3) {
                emberLog("[Ember Vulkan Layer] No swapchain data, passthrough\n");
            }
            continue;
        }

        // Lazily create pipeline on first present (safe — device is fully initialized)
        if (!scData->pipelineCreated) {
            emberLog("[Ember Vulkan Layer] Creating pipeline on first present: %ux%u format=%d\n",
                    scData->extent.width, scData->extent.height, (int)scData->format);
            if (createSwapchainPipeline(table, scData)) {
                scData->pipelineCreated = true;
                emberLog("[Ember Vulkan Layer] Pipeline created successfully (%zu images)\n",
                        scData->images.size());
            } else {
                emberLog("[Ember Vulkan Layer] Pipeline creation failed, passthrough\n");
                continue;
            }
        }

        if (imgIdx >= scData->perImage.size()) {
            if (count < 3) {
                emberLog("[Ember Vulkan Layer] Image index %u out of range, passthrough\n", imgIdx);
            }
            continue;
        }

        auto& imgRes = scData->perImage[imgIdx];
        VkImage swapchainImage = scData->images[imgIdx];

        // Record command buffer
        VkCommandBufferBeginInfo beginInfo = {};
        beginInfo.sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO;
        beginInfo.flags = VK_COMMAND_BUFFER_USAGE_ONE_TIME_SUBMIT_BIT;

        table->resetCommandBuffer(table->commandBuffer, 0);
        table->beginCommandBuffer(table->commandBuffer, &beginInfo);

        // Step 1: Transition swapchain image PRESENT_SRC_KHR -> TRANSFER_SRC_OPTIMAL
        VkImageMemoryBarrier b1 = {};
        b1.sType = VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER;
        b1.srcAccessMask = VK_ACCESS_MEMORY_READ_BIT | VK_ACCESS_MEMORY_WRITE_BIT;
        b1.dstAccessMask = VK_ACCESS_TRANSFER_READ_BIT;
        b1.oldLayout = VK_IMAGE_LAYOUT_PRESENT_SRC_KHR;
        b1.newLayout = VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL;
        b1.srcQueueFamilyIndex = VK_QUEUE_FAMILY_IGNORED;
        b1.dstQueueFamilyIndex = VK_QUEUE_FAMILY_IGNORED;
        b1.image = swapchainImage;
        b1.subresourceRange = {VK_IMAGE_ASPECT_COLOR_BIT, 0, 1, 0, 1};

        table->cmdPipelineBarrier(table->commandBuffer,
            VK_PIPELINE_STAGE_ALL_COMMANDS_BIT, VK_PIPELINE_STAGE_TRANSFER_BIT,
            0, 0, nullptr, 0, nullptr, 1, &b1);

        // Step 2: Transition temp image UNDEFINED -> TRANSFER_DST_OPTIMAL
        VkImageMemoryBarrier b2 = {};
        b2.sType = VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER;
        b2.srcAccessMask = 0;
        b2.dstAccessMask = VK_ACCESS_TRANSFER_WRITE_BIT;
        b2.oldLayout = VK_IMAGE_LAYOUT_UNDEFINED;
        b2.newLayout = VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL;
        b2.srcQueueFamilyIndex = VK_QUEUE_FAMILY_IGNORED;
        b2.dstQueueFamilyIndex = VK_QUEUE_FAMILY_IGNORED;
        b2.image = imgRes.tempImage;
        b2.subresourceRange = {VK_IMAGE_ASPECT_COLOR_BIT, 0, 1, 0, 1};

        table->cmdPipelineBarrier(table->commandBuffer,
            VK_PIPELINE_STAGE_TOP_OF_PIPE_BIT, VK_PIPELINE_STAGE_TRANSFER_BIT,
            0, 0, nullptr, 0, nullptr, 1, &b2);

        // Step 3: Copy swapchain image -> temp image
        VkImageCopy copyRegion = {};
        copyRegion.srcSubresource = {VK_IMAGE_ASPECT_COLOR_BIT, 0, 0, 1};
        copyRegion.dstSubresource = {VK_IMAGE_ASPECT_COLOR_BIT, 0, 0, 1};
        copyRegion.extent = {scData->extent.width, scData->extent.height, 1};

        table->cmdCopyImage(table->commandBuffer,
            swapchainImage, VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL,
            imgRes.tempImage, VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL,
            1, &copyRegion);

        // Step 4: Transition swapchain image TRANSFER_SRC -> COLOR_ATTACHMENT_OPTIMAL
        VkImageMemoryBarrier b3 = {};
        b3.sType = VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER;
        b3.srcAccessMask = VK_ACCESS_TRANSFER_READ_BIT;
        b3.dstAccessMask = VK_ACCESS_COLOR_ATTACHMENT_READ_BIT | VK_ACCESS_COLOR_ATTACHMENT_WRITE_BIT;
        b3.oldLayout = VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL;
        b3.newLayout = VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL;
        b3.srcQueueFamilyIndex = VK_QUEUE_FAMILY_IGNORED;
        b3.dstQueueFamilyIndex = VK_QUEUE_FAMILY_IGNORED;
        b3.image = swapchainImage;
        b3.subresourceRange = {VK_IMAGE_ASPECT_COLOR_BIT, 0, 1, 0, 1};

        table->cmdPipelineBarrier(table->commandBuffer,
            VK_PIPELINE_STAGE_TRANSFER_BIT, VK_PIPELINE_STAGE_COLOR_ATTACHMENT_OUTPUT_BIT,
            0, 0, nullptr, 0, nullptr, 1, &b3);

        // Step 5: Transition temp image TRANSFER_DST -> SHADER_READ_ONLY
        VkImageMemoryBarrier b4 = {};
        b4.sType = VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER;
        b4.srcAccessMask = VK_ACCESS_TRANSFER_WRITE_BIT;
        b4.dstAccessMask = VK_ACCESS_SHADER_READ_BIT;
        b4.oldLayout = VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL;
        b4.newLayout = VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL;
        b4.srcQueueFamilyIndex = VK_QUEUE_FAMILY_IGNORED;
        b4.dstQueueFamilyIndex = VK_QUEUE_FAMILY_IGNORED;
        b4.image = imgRes.tempImage;
        b4.subresourceRange = {VK_IMAGE_ASPECT_COLOR_BIT, 0, 1, 0, 1};

        table->cmdPipelineBarrier(table->commandBuffer,
            VK_PIPELINE_STAGE_TRANSFER_BIT, VK_PIPELINE_STAGE_FRAGMENT_SHADER_BIT,
            0, 0, nullptr, 0, nullptr, 1, &b4);

        // Step 6: Begin render pass on swapchain image
        VkRenderPassBeginInfo rpBegin = {};
        rpBegin.sType = VK_STRUCTURE_TYPE_RENDER_PASS_BEGIN_INFO;
        rpBegin.renderPass = scData->renderPass;
        rpBegin.framebuffer = imgRes.framebuffer;
        rpBegin.renderArea = {{0, 0}, scData->extent};

        table->cmdBeginRenderPass(table->commandBuffer, &rpBegin, VK_SUBPASS_CONTENTS_INLINE);

        // Step 7: Bind pipeline + descriptor set + draw
        table->cmdBindPipeline(table->commandBuffer, VK_PIPELINE_BIND_POINT_GRAPHICS, scData->pipeline);

        VkViewport viewport = {0.0f, 0.0f, (float)scData->extent.width, (float)scData->extent.height, 0.0f, 1.0f};
        VkRect2D scissor = {{0, 0}, scData->extent};
        table->cmdSetViewport(table->commandBuffer, 0, 1, &viewport);
        table->cmdSetScissor(table->commandBuffer, 0, 1, &scissor);

        table->cmdBindDescriptorSets(table->commandBuffer, VK_PIPELINE_BIND_POINT_GRAPHICS,
            scData->pipelineLayout, 0, 1, &imgRes.descriptorSet, 0, nullptr);

        // Push constants: intensity, time, resolution.x, resolution.y, preset
        std::string presetName = getShaderPreset();
        float presetId = 0.0f; // none
        if (presetName == "crt") presetId = 1.0f;
        else if (presetName == "bloom") presetId = 2.0f;
        else if (presetName == "color-grade") presetId = 3.0f;
        else if (presetName == "fxaa") presetId = 4.0f;
        else if (presetName == "cas") presetId = 5.0f;
        else if (presetName == "grayscale") presetId = 6.0f;
        else if (presetName == "sepia") presetId = 7.0f;
        else if (presetName == "vignette") presetId = 8.0f;
        else if (presetName == "film-grain") presetId = 9.0f;
        else if (presetName == "chromatic-aberration") presetId = 10.0f;
        else if (presetName == "sharpen") presetId = 11.0f;
        else if (presetName == "blur") presetId = 12.0f;
        else if (presetName == "pixelate") presetId = 13.0f;
        else if (presetName == "posterize") presetId = 14.0f;
        else if (presetName == "invert") presetId = 15.0f;
        else if (presetName == "scanline") presetId = 16.0f;
        else if (presetName == "vhs") presetId = 18.0f;
        else if (presetName == "night-vision") presetId = 19.0f;
        else if (presetName == "thermal") presetId = 20.0f;
        else if (presetName == "edge-detect") presetId = 21.0f;
        else if (presetName == "emboss") presetId = 22.0f;
        else if (presetName == "retro-pixel") presetId = 23.0f;

        float shaderParams[8] = {};
        getShaderParams(shaderParams, 8);

        float pc[13] = {intensity, (float)count, (float)scData->extent.width, (float)scData->extent.height, presetId,
                        shaderParams[0], shaderParams[1], shaderParams[2], shaderParams[3],
                        shaderParams[4], shaderParams[5], shaderParams[6], shaderParams[7]};
        PFN_vkCmdPushConstants cmdPushConstants =
            (PFN_vkCmdPushConstants)table->getDeviceProcAddr(table->device, "vkCmdPushConstants");
        if (cmdPushConstants) {
            cmdPushConstants(table->commandBuffer, scData->pipelineLayout,
                VK_SHADER_STAGE_FRAGMENT_BIT, 0, sizeof(pc), pc);
        }

        table->cmdDraw(table->commandBuffer, 3, 1, 0, 0);

        table->cmdEndRenderPass(table->commandBuffer);

        // Render pass already transitions swapchain to PRESENT_SRC_KHR (finalLayout)
        table->endCommandBuffer(table->commandBuffer);

        // Submit with fence
        VkSubmitInfo submitInfo = {};
        submitInfo.sType = VK_STRUCTURE_TYPE_SUBMIT_INFO;
        submitInfo.commandBufferCount = 1;
        submitInfo.pCommandBuffers = &table->commandBuffer;

        VkFence fence = VK_NULL_HANDLE;
        VkFenceCreateInfo fenceInfo = {};
        fenceInfo.sType = VK_STRUCTURE_TYPE_FENCE_CREATE_INFO;

        if (table->createFence(table->device, &fenceInfo, nullptr, &fence) == VK_SUCCESS) {
            VkResult submitResult = table->queueSubmit(queue, 1, &submitInfo, fence);
            if (submitResult == VK_SUCCESS) {
                table->waitForFences(table->device, 1, &fence, VK_TRUE, UINT64_MAX);
            } else if (count < 5) {
                emberLog("[Ember Vulkan Layer] queueSubmit failed: %d\n", submitResult);
            }
            table->destroyFence(table->device, fence, nullptr);
        } else {
            table->queueSubmit(queue, 1, &submitInfo, VK_NULL_HANDLE);
        }

        if (count < 3) {
            emberLog("[Ember Vulkan Layer] Rendered shader on present #%d\n", count);
        }
    }

    return table->queuePresentKHR(queue, pPresentInfo);
}

// ============================================================================
// Swapchain creation / destruction
// ============================================================================

static VKAPI_ATTR VkResult VKAPI_CALL emberCreateSwapchainKHR(
    VkDevice device, const VkSwapchainCreateInfoKHR* pCreateInfo,
    const VkAllocationCallbacks* pAllocator, VkSwapchainKHR* pSwapchain) {

    emberLog("[Ember Vulkan Layer] emberCreateSwapchainKHR called\n");
    LayerDispatchTable* table = getDeviceTable(device);
    if (!table || !table->createSwapchainKHR) {
        return VK_ERROR_INITIALIZATION_FAILED;
    }

    // Add TRANSFER_SRC_BIT to swapchain image usage so we can copy from it
    VkSwapchainCreateInfoKHR modifiedInfo = *pCreateInfo;
    modifiedInfo.imageUsage |= VK_IMAGE_USAGE_TRANSFER_SRC_BIT | VK_IMAGE_USAGE_COLOR_ATTACHMENT_BIT;

    VkResult result = table->createSwapchainKHR(device, &modifiedInfo, pAllocator, pSwapchain);
    if (result != VK_SUCCESS) return result;

    // Just store format/extent — don't create any resources here (breaks DXVK)
    SwapchainData* scData = new SwapchainData();
    scData->format = pCreateInfo->imageFormat;
    scData->extent = pCreateInfo->imageExtent;
    scData->pipelineCreated = false;
    scData->table = table;

    // Get swapchain images (safe — just querying)
    uint32_t imageCount = 0;
    table->getSwapchainImagesKHR(device, *pSwapchain, &imageCount, nullptr);
    scData->images.resize(imageCount);
    table->getSwapchainImagesKHR(device, *pSwapchain, &imageCount, scData->images.data());

    emberLog("[Ember Vulkan Layer] Swapchain created: %ux%u format=%d images=%u\n",
            scData->extent.width, scData->extent.height, (int)scData->format, imageCount);

    {
        std::lock_guard<std::mutex> lock(g_swapchainMutex);
        g_swapchainData[*pSwapchain] = scData;
    }

    return VK_SUCCESS;
}

static VKAPI_ATTR VkResult VKAPI_CALL emberGetSwapchainImagesKHR(
    VkDevice device, VkSwapchainKHR swapchain,
    uint32_t* pSwapchainImageCount, VkImage* pSwapchainImages) {

    LayerDispatchTable* table = getDeviceTable(device);
    if (!table || !table->getSwapchainImagesKHR) {
        return VK_ERROR_INITIALIZATION_FAILED;
    }
    return table->getSwapchainImagesKHR(device, swapchain, pSwapchainImageCount, pSwapchainImages);
}

static VKAPI_ATTR void VKAPI_CALL emberDestroySwapchainKHR(
    VkDevice device, VkSwapchainKHR swapchain, const VkAllocationCallbacks* pAllocator) {

    LayerDispatchTable* table = getDeviceTable(device);
    if (table && table->destroySwapchainKHR) {
        table->destroySwapchainKHR(device, swapchain, pAllocator);
    }

    SwapchainData* scData = nullptr;
    {
        std::lock_guard<std::mutex> lock(g_swapchainMutex);
        auto it = g_swapchainData.find(swapchain);
        if (it != g_swapchainData.end()) {
            scData = it->second;
            g_swapchainData.erase(it);
        }
    }
    if (scData) {
        if (table) destroySwapchainPipeline(table, scData);
        delete scData;
    }
}

// ============================================================================
// Instance / Device creation
// ============================================================================

static VKAPI_ATTR VkResult VKAPI_CALL emberCreateInstance(
    const VkInstanceCreateInfo* pCreateInfo,
    const VkAllocationCallbacks* pAllocator,
    VkInstance* pInstance) {

    emberLog("[Ember Vulkan Layer] emberCreateInstance called pid=%d\n", getpid());

    VkLayerInstanceCreateInfo* chain = (VkLayerInstanceCreateInfo*)pCreateInfo->pNext;
    while (chain && (chain->sType != VK_STRUCTURE_TYPE_LOADER_INSTANCE_CREATE_INFO ||
                     chain->function != VK_LAYER_LINK_INFO)) {
        chain = (VkLayerInstanceCreateInfo*)chain->pNext;
    }

    if (!chain) return VK_ERROR_INITIALIZATION_FAILED;

    PFN_vkGetInstanceProcAddr fpGIPA = chain->u.pLayerInfo->pfnNextGetInstanceProcAddr;
    chain->u.pLayerInfo = chain->u.pLayerInfo->pNext;

    PFN_vkCreateInstance fpCreateInstance =
        (PFN_vkCreateInstance)fpGIPA(VK_NULL_HANDLE, "vkCreateInstance");
    if (!fpCreateInstance) return VK_ERROR_INITIALIZATION_FAILED;

    VkResult result = fpCreateInstance(pCreateInfo, pAllocator, pInstance);
    if (result != VK_SUCCESS) return result;

    LayerDispatchTable* table = new LayerDispatchTable();
    table->getInstanceProcAddr = fpGIPA;

    {
        std::lock_guard<std::mutex> lock(g_tableMutex);
        g_instanceTables[*pInstance] = table;
    }

    return VK_SUCCESS;
}

static VKAPI_ATTR void VKAPI_CALL emberDestroyInstance(
    VkInstance instance, const VkAllocationCallbacks* pAllocator) {

    LayerDispatchTable* table = getTable(instance);
    if (table) {
        PFN_vkDestroyInstance fpDestroyInstance =
            (PFN_vkDestroyInstance)table->getInstanceProcAddr(instance, "vkDestroyInstance");
        if (fpDestroyInstance) fpDestroyInstance(instance, pAllocator);

        std::lock_guard<std::mutex> lock(g_tableMutex);
        g_instanceTables.erase(instance);
        delete table;
    }
}

static VKAPI_ATTR VkResult VKAPI_CALL emberCreateDevice(
    VkPhysicalDevice physicalDevice,
    const VkDeviceCreateInfo* pCreateInfo,
    const VkAllocationCallbacks* pAllocator,
    VkDevice* pDevice) {

    VkLayerDeviceCreateInfo* chain = (VkLayerDeviceCreateInfo*)pCreateInfo->pNext;
    while (chain && (chain->sType != VK_STRUCTURE_TYPE_LOADER_DEVICE_CREATE_INFO ||
                     chain->function != VK_LAYER_LINK_INFO)) {
        chain = (VkLayerDeviceCreateInfo*)chain->pNext;
    }

    if (!chain) return VK_ERROR_INITIALIZATION_FAILED;

    PFN_vkGetInstanceProcAddr fpGIPA = chain->u.pLayerInfo->pfnNextGetInstanceProcAddr;
    PFN_vkGetDeviceProcAddr fpGDPA = chain->u.pLayerInfo->pfnNextGetDeviceProcAddr;
    chain->u.pLayerInfo = chain->u.pLayerInfo->pNext;

    PFN_vkCreateDevice fpCreateDevice =
        (PFN_vkCreateDevice)fpGIPA(VK_NULL_HANDLE, "vkCreateDevice");
    if (!fpCreateDevice) return VK_ERROR_INITIALIZATION_FAILED;

    VkResult result = fpCreateDevice(physicalDevice, pCreateInfo, pAllocator, pDevice);
    if (result != VK_SUCCESS) return result;

    LayerDispatchTable* table = new LayerDispatchTable();
    table->getDeviceProcAddr = fpGDPA;
    table->device = *pDevice;
    table->physicalDevice = physicalDevice;

    // Load ALL function pointers upfront — no lazy loading
    table->queuePresentKHR = (PFN_vkQueuePresentKHR)fpGDPA(*pDevice, "vkQueuePresentKHR");
    table->getSwapchainImagesKHR = (PFN_vkGetSwapchainImagesKHR)fpGDPA(*pDevice, "vkGetSwapchainImagesKHR");
    table->destroySwapchainKHR = (PFN_vkDestroySwapchainKHR)fpGDPA(*pDevice, "vkDestroySwapchainKHR");
    table->createSwapchainKHR = (PFN_vkCreateSwapchainKHR)fpGDPA(*pDevice, "vkCreateSwapchainKHR");
    table->createImage = (PFN_vkCreateImage)fpGDPA(*pDevice, "vkCreateImage");
    table->destroyImage = (PFN_vkDestroyImage)fpGDPA(*pDevice, "vkDestroyImage");
    table->allocateMemory = (PFN_vkAllocateMemory)fpGDPA(*pDevice, "vkAllocateMemory");
    table->freeMemory = (PFN_vkFreeMemory)fpGDPA(*pDevice, "vkFreeMemory");
    table->bindImageMemory = (PFN_vkBindImageMemory)fpGDPA(*pDevice, "vkBindImageMemory");
    table->getImageMemoryRequirements = (PFN_vkGetImageMemoryRequirements)fpGDPA(*pDevice, "vkGetImageMemoryRequirements");
    table->createImageView = (PFN_vkCreateImageView)fpGDPA(*pDevice, "vkCreateImageView");
    table->destroyImageView = (PFN_vkDestroyImageView)fpGDPA(*pDevice, "vkDestroyImageView");
    table->createRenderPass = (PFN_vkCreateRenderPass)fpGDPA(*pDevice, "vkCreateRenderPass");
    table->destroyRenderPass = (PFN_vkDestroyRenderPass)fpGDPA(*pDevice, "vkDestroyRenderPass");
    table->createPipelineLayout = (PFN_vkCreatePipelineLayout)fpGDPA(*pDevice, "vkCreatePipelineLayout");
    table->destroyPipelineLayout = (PFN_vkDestroyPipelineLayout)fpGDPA(*pDevice, "vkDestroyPipelineLayout");
    table->createGraphicsPipelines = (PFN_vkCreateGraphicsPipelines)fpGDPA(*pDevice, "vkCreateGraphicsPipelines");
    table->destroyPipeline = (PFN_vkDestroyPipeline)fpGDPA(*pDevice, "vkDestroyPipeline");
    table->createDescriptorSetLayout = (PFN_vkCreateDescriptorSetLayout)fpGDPA(*pDevice, "vkCreateDescriptorSetLayout");
    table->destroyDescriptorSetLayout = (PFN_vkDestroyDescriptorSetLayout)fpGDPA(*pDevice, "vkDestroyDescriptorSetLayout");
    table->createDescriptorPool = (PFN_vkCreateDescriptorPool)fpGDPA(*pDevice, "vkCreateDescriptorPool");
    table->destroyDescriptorPool = (PFN_vkDestroyDescriptorPool)fpGDPA(*pDevice, "vkDestroyDescriptorPool");
    table->allocateDescriptorSets = (PFN_vkAllocateDescriptorSets)fpGDPA(*pDevice, "vkAllocateDescriptorSets");
    table->updateDescriptorSets = (PFN_vkUpdateDescriptorSets)fpGDPA(*pDevice, "vkUpdateDescriptorSets");
    table->createSampler = (PFN_vkCreateSampler)fpGDPA(*pDevice, "vkCreateSampler");
    table->destroySampler = (PFN_vkDestroySampler)fpGDPA(*pDevice, "vkDestroySampler");
    table->createFramebuffer = (PFN_vkCreateFramebuffer)fpGDPA(*pDevice, "vkCreateFramebuffer");
    table->destroyFramebuffer = (PFN_vkDestroyFramebuffer)fpGDPA(*pDevice, "vkDestroyFramebuffer");
    table->createCommandPool = (PFN_vkCreateCommandPool)fpGDPA(*pDevice, "vkCreateCommandPool");
    table->destroyCommandPool = (PFN_vkDestroyCommandPool)fpGDPA(*pDevice, "vkDestroyCommandPool");
    table->allocateCommandBuffers = (PFN_vkAllocateCommandBuffers)fpGDPA(*pDevice, "vkAllocateCommandBuffers");
    table->beginCommandBuffer = (PFN_vkBeginCommandBuffer)fpGDPA(*pDevice, "vkBeginCommandBuffer");
    table->endCommandBuffer = (PFN_vkEndCommandBuffer)fpGDPA(*pDevice, "vkEndCommandBuffer");
    table->resetCommandBuffer = (PFN_vkResetCommandBuffer)fpGDPA(*pDevice, "vkResetCommandBuffer");
    table->cmdPipelineBarrier = (PFN_vkCmdPipelineBarrier)fpGDPA(*pDevice, "vkCmdPipelineBarrier");
    table->cmdCopyImage = (PFN_vkCmdCopyImage)fpGDPA(*pDevice, "vkCmdCopyImage");
    table->cmdBeginRenderPass = (PFN_vkCmdBeginRenderPass)fpGDPA(*pDevice, "vkCmdBeginRenderPass");
    table->cmdEndRenderPass = (PFN_vkCmdEndRenderPass)fpGDPA(*pDevice, "vkCmdEndRenderPass");
    table->cmdBindPipeline = (PFN_vkCmdBindPipeline)fpGDPA(*pDevice, "vkCmdBindPipeline");
    table->cmdBindDescriptorSets = (PFN_vkCmdBindDescriptorSets)fpGDPA(*pDevice, "vkCmdBindDescriptorSets");
    table->cmdDraw = (PFN_vkCmdDraw)fpGDPA(*pDevice, "vkCmdDraw");
    table->cmdSetViewport = (PFN_vkCmdSetViewport)fpGDPA(*pDevice, "vkCmdSetViewport");
    table->cmdSetScissor = (PFN_vkCmdSetScissor)fpGDPA(*pDevice, "vkCmdSetScissor");
    table->queueSubmit = (PFN_vkQueueSubmit)fpGDPA(*pDevice, "vkQueueSubmit");
    table->createFence = (PFN_vkCreateFence)fpGDPA(*pDevice, "vkCreateFence");
    table->destroyFence = (PFN_vkDestroyFence)fpGDPA(*pDevice, "vkDestroyFence");
    table->waitForFences = (PFN_vkWaitForFences)fpGDPA(*pDevice, "vkWaitForFences");

    // Get physical device memory properties via instance
    PFN_vkGetPhysicalDeviceMemoryProperties getMemProps =
        (PFN_vkGetPhysicalDeviceMemoryProperties)fpGIPA(VK_NULL_HANDLE, "vkGetPhysicalDeviceMemoryProperties");
    table->getPhysicalDeviceMemoryProperties = getMemProps;
    if (getMemProps) {
        getMemProps(physicalDevice, &table->memProps);
    }

    emberLog("[Ember Vulkan Layer] Device created, all %d function pointers loaded\n",
            (int)(g_deviceTables.size() + 1));

    {
        std::lock_guard<std::mutex> lock(g_tableMutex);
        g_deviceTables[*pDevice] = table;
    }

    return VK_SUCCESS;
}

static VKAPI_ATTR void VKAPI_CALL emberDestroyDevice(
    VkDevice device, const VkAllocationCallbacks* pAllocator) {

    LayerDispatchTable* table = getDeviceTable(device);
    if (table) {
        if (table->destroyCommandPool && table->commandPool != VK_NULL_HANDLE) {
            table->destroyCommandPool(device, table->commandPool, nullptr);
        }

        PFN_vkDestroyDevice fpDestroyDevice =
            (PFN_vkDestroyDevice)table->getDeviceProcAddr(device, "vkDestroyDevice");
        if (fpDestroyDevice) fpDestroyDevice(device, pAllocator);

        std::lock_guard<std::mutex> lock(g_tableMutex);
        g_deviceTables.erase(device);
        delete table;
    }
}

// ============================================================================
// Layer enumeration
// ============================================================================

static VKAPI_ATTR VkResult VKAPI_CALL emberEnumerateInstanceLayerProperties(
    uint32_t* pPropertyCount, VkLayerProperties* pProperties) {

    if (pProperties == nullptr) {
        *pPropertyCount = 1;
        return VK_SUCCESS;
    }
    if (*pPropertyCount < 1) {
        *pPropertyCount = 0;
        return VK_INCOMPLETE;
    }

    memset(pProperties, 0, sizeof(VkLayerProperties));
    strcpy(pProperties[0].layerName, kLayerName);
    strcpy(pProperties[0].description, "Ember HTPC Shader Injection Layer");
    pProperties[0].implementationVersion = kLayerImplementationVersion;
    pProperties[0].specVersion = VK_API_VERSION_1_3;

    *pPropertyCount = 1;
    return VK_SUCCESS;
}

static VKAPI_ATTR VkResult VKAPI_CALL emberEnumerateInstanceExtensionProperties(
    const char* pLayerName, uint32_t* pPropertyCount, VkExtensionProperties* pProperties) {

    if (pLayerName && strcmp(pLayerName, kLayerName) == 0) {
        *pPropertyCount = 0;
        return VK_SUCCESS;
    }
    return VK_ERROR_LAYER_NOT_PRESENT;
}

// ============================================================================
// ProcAddr
// ============================================================================

static VKAPI_ATTR PFN_vkVoidFunction VKAPI_CALL emberGetInstanceProcAddr(
    VkInstance instance, const char* pName) {

    if (strcmp(pName, "vkGetInstanceProcAddr") == 0)
        return (PFN_vkVoidFunction)emberGetInstanceProcAddr;
    if (strcmp(pName, "vkCreateInstance") == 0)
        return (PFN_vkVoidFunction)emberCreateInstance;
    if (strcmp(pName, "vkDestroyInstance") == 0)
        return (PFN_vkVoidFunction)emberDestroyInstance;
    if (strcmp(pName, "vkCreateDevice") == 0)
        return (PFN_vkVoidFunction)emberCreateDevice;
    if (strcmp(pName, "vkDestroyDevice") == 0)
        return (PFN_vkVoidFunction)emberDestroyDevice;
    if (strcmp(pName, "vkQueuePresentKHR") == 0)
        return (PFN_vkVoidFunction)emberQueuePresentKHR;
    if (strcmp(pName, "vkCreateSwapchainKHR") == 0)
        return (PFN_vkVoidFunction)emberCreateSwapchainKHR;
    if (strcmp(pName, "vkGetSwapchainImagesKHR") == 0)
        return (PFN_vkVoidFunction)emberGetSwapchainImagesKHR;
    if (strcmp(pName, "vkDestroySwapchainKHR") == 0)
        return (PFN_vkVoidFunction)emberDestroySwapchainKHR;
    if (strcmp(pName, "vkEnumerateInstanceLayerProperties") == 0)
        return (PFN_vkVoidFunction)emberEnumerateInstanceLayerProperties;
    if (strcmp(pName, "vkEnumerateInstanceExtensionProperties") == 0)
        return (PFN_vkVoidFunction)emberEnumerateInstanceExtensionProperties;

    if (instance) {
        LayerDispatchTable* table = getTable(instance);
        if (table && table->getInstanceProcAddr) {
            return table->getInstanceProcAddr(instance, pName);
        }
    }
    return nullptr;
}

static VKAPI_ATTR PFN_vkVoidFunction VKAPI_CALL emberGetDeviceProcAddr(
    VkDevice device, const char* pName) {

    if (strcmp(pName, "vkGetDeviceProcAddr") == 0)
        return (PFN_vkVoidFunction)emberGetDeviceProcAddr;
    if (strcmp(pName, "vkQueuePresentKHR") == 0)
        return (PFN_vkVoidFunction)emberQueuePresentKHR;
    if (strcmp(pName, "vkDestroyDevice") == 0)
        return (PFN_vkVoidFunction)emberDestroyDevice;
    if (strcmp(pName, "vkCreateSwapchainKHR") == 0)
        return (PFN_vkVoidFunction)emberCreateSwapchainKHR;
    if (strcmp(pName, "vkGetSwapchainImagesKHR") == 0)
        return (PFN_vkVoidFunction)emberGetSwapchainImagesKHR;
    if (strcmp(pName, "vkDestroySwapchainKHR") == 0)
        return (PFN_vkVoidFunction)emberDestroySwapchainKHR;

    if (device) {
        LayerDispatchTable* table = getDeviceTable(device);
        if (table && table->getDeviceProcAddr) {
            return table->getDeviceProcAddr(device, pName);
        }
    }
    return nullptr;
}

// ============================================================================
// Layer negotiation
// ============================================================================

extern "C" {

VK_LAYER_EXPORT VkResult vkNegotiateLoaderLayerInterfaceVersion(
    VkNegotiateLayerInterface* pVersion) {

    if (pVersion->loaderLayerInterfaceVersion >= 2) {
        pVersion->loaderLayerInterfaceVersion = 2;
    } else {
        pVersion->loaderLayerInterfaceVersion = 1;
    }

    pVersion->pfnGetInstanceProcAddr = emberGetInstanceProcAddr;
    pVersion->pfnGetDeviceProcAddr = emberGetDeviceProcAddr;
    pVersion->pfnGetPhysicalDeviceProcAddr = nullptr;

    return VK_SUCCESS;
}

VK_LAYER_EXPORT PFN_vkVoidFunction vkGetInstanceProcAddr(
    VkInstance instance, const char* pName) {
    return emberGetInstanceProcAddr(instance, pName);
}

VK_LAYER_EXPORT PFN_vkVoidFunction vkGetDeviceProcAddr(
    VkDevice device, const char* pName) {
    return emberGetDeviceProcAddr(device, pName);
}

VK_LAYER_EXPORT VkResult vkEnumerateInstanceLayerProperties(
    uint32_t* pPropertyCount, VkLayerProperties* pProperties) {
    return emberEnumerateInstanceLayerProperties(pPropertyCount, pProperties);
}

VK_LAYER_EXPORT VkResult vkEnumerateInstanceExtensionProperties(
    const char* pLayerName, uint32_t* pPropertyCount, VkExtensionProperties* pProperties) {
    return emberEnumerateInstanceExtensionProperties(pLayerName, pPropertyCount, pProperties);
}

} // extern "C"

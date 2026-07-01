/*
 * Ember ReShade Addon
 *
 * Polls a JSON config file written by Ember's main process and applies
 * changes to the ReShade effect runtime in real-time. Also writes a
 * state JSON file back for Ember's overlay UI to read.
 *
 * Config file path: <game_dir>/ember-reshade-control.json
 * State file path:  <game_dir>/ember-reshade-state.json
 */

// MinGW workaround: __uuidof emulation only works for types with __CRT_UUID_DECL.
// The ReShade SDK uses __uuidof(T) in template methods we never call.
// Include windows.h early and override __uuidof before ReShade headers pull in _mingw.h via <cfloat>.
#ifdef __MINGW32__
#include <windows.h>
inline const GUID& __ember_uuidof_dummy() { static const GUID _g = {0,0,0,{0,0,0,0,0,0,0,0}}; return _g; }
#undef __uuidof
#define __uuidof(x) (__ember_uuidof_dummy())
#endif

#include "reshade.hpp"
#include <windows.h>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>
#include <map>
#include <chrono>
#include <cstring>
#include <cstdio>

// ─── Minimal JSON helpers ──────────────────────────────────────

// Escape a string for JSON output
static std::string json_escape(const std::string &s)
{
	std::string out;
	out.reserve(s.size() + 8);
	for (char c : s)
	{
		switch (c)
		{
		case '"':  out += "\\\""; break;
		case '\\': out += "\\\\"; break;
		case '\n': out += "\\n";  break;
		case '\r': out += "\\r";  break;
		case '\t': out += "\\t";  break;
		default:   out += c;      break;
		}
	}
	return out;
}

// Simple JSON string value reader: finds "key" and returns the string value after it
static bool json_get_string(const std::string &json, const std::string &key, std::string &out)
{
	std::string needle = "\"" + key + "\"";
	size_t pos = json.find(needle);
	if (pos == std::string::npos) return false;
	pos = json.find(':', pos + needle.size());
	if (pos == std::string::npos) return false;
	pos++;
	while (pos < json.size() && (json[pos] == ' ' || json[pos] == '\t' || json[pos] == '\n' || json[pos] == '\r')) pos++;
	if (pos >= json.size() || json[pos] != '"') return false;
	pos++;
	out.clear();
	while (pos < json.size() && json[pos] != '"')
	{
		if (json[pos] == '\\' && pos + 1 < json.size())
		{
			pos++;
			switch (json[pos])
			{
			case '"':  out += '"';  break;
			case '\\': out += '\\'; break;
			case 'n':  out += '\n'; break;
			case 'r':  out += '\r'; break;
			case 't':  out += '\t'; break;
			default:   out += json[pos]; break;
			}
		}
		else
		{
			out += json[pos];
		}
		pos++;
	}
	return true;
}

// Simple JSON boolean reader
static bool json_get_bool(const std::string &json, const std::string &key, bool &out)
{
	std::string needle = "\"" + key + "\"";
	size_t pos = json.find(needle);
	if (pos == std::string::npos) return false;
	pos = json.find(':', pos + needle.size());
	if (pos == std::string::npos) return false;
	pos++;
	while (pos < json.size() && (json[pos] == ' ' || json[pos] == '\t')) pos++;
	if (pos >= json.size()) return false;
	if (json.compare(pos, 4, "true") == 0) { out = true; return true; }
	if (json.compare(pos, 5, "false") == 0) { out = false; return true; }
	return false;
}

// Simple JSON float reader
static bool json_get_float(const std::string &json, const std::string &key, float &out)
{
	std::string needle = "\"" + key + "\"";
	size_t pos = json.find(needle);
	if (pos == std::string::npos) return false;
	pos = json.find(':', pos + needle.size());
	if (pos == std::string::npos) return false;
	pos++;
	while (pos < json.size() && (json[pos] == ' ' || json[pos] == '\t')) pos++;
	if (pos >= json.size()) return false;
	try { out = std::stof(json.substr(pos)); return true; }
	catch (...) { return false; }
}

// Simple JSON int reader
static bool json_get_int(const std::string &json, const std::string &key, int &out)
{
	std::string needle = "\"" + key + "\"";
	size_t pos = json.find(needle);
	if (pos == std::string::npos) return false;
	pos = json.find(':', pos + needle.size());
	if (pos == std::string::npos) return false;
	pos++;
	while (pos < json.size() && (json[pos] == ' ' || json[pos] == '\t')) pos++;
	if (pos >= json.size()) return false;
	try { out = std::stoi(json.substr(pos)); return true; }
	catch (...) { return false; }
}

// Extract all "key":value pairs from a JSON object string (simple, non-nested)
static std::vector<std::pair<std::string, std::string>> json_get_object_pairs(const std::string &json, const std::string &key)
{
	std::vector<std::pair<std::string, std::string>> result;
	std::string needle = "\"" + key + "\"";
	size_t pos = json.find(needle);
	if (pos == std::string::npos) return result;
	pos = json.find('{', pos + needle.size());
	if (pos == std::string::npos) return result;
	pos++; // skip opening brace
	int depth = 1;
	size_t start = pos;
	while (pos < json.size() && depth > 0)
	{
		if (json[pos] == '{') depth++;
		else if (json[pos] == '}') { depth--; if (depth == 0) break; }
		pos++;
	}
	if (depth != 0) return result;
	std::string obj = json.substr(start, pos - start);

	// Parse pairs from obj
	size_t p = 0;
	while (p < obj.size())
	{
		// Find key
		size_t k_start = obj.find('"', p);
		if (k_start == std::string::npos) break;
		size_t k_end = obj.find('"', k_start + 1);
		if (k_end == std::string::npos) break;
		std::string k = obj.substr(k_start + 1, k_end - k_start - 1);
		size_t colon = obj.find(':', k_end);
		if (colon == std::string::npos) break;
		// Find value start
		size_t v_start = colon + 1;
		while (v_start < obj.size() && (obj[v_start] == ' ' || obj[v_start] == '\t')) v_start++;
		if (v_start >= obj.size()) break;
		std::string v;
		if (obj[v_start] == '"')
		{
			size_t v_end = v_start + 1;
			while (v_end < obj.size() && obj[v_end] != '"')
			{
				if (obj[v_end] == '\\' && v_end + 1 < obj.size()) v_end++;
				v_end++;
			}
			v = obj.substr(v_start + 1, v_end - v_start - 1);
			p = v_end + 1;
		}
		else
		{
			size_t v_end = v_start;
			while (v_end < obj.size() && obj[v_end] != ',' && obj[v_end] != '}') v_end++;
			v = obj.substr(v_start, v_end - v_start);
			// trim
			while (!v.empty() && (v.back() == ' ' || v.back() == '\t' || v.back() == '\n' || v.back() == '\r')) v.pop_back();
			p = v_end;
		}
		result.emplace_back(k, v);
		// Skip comma
		size_t comma = obj.find(',', p);
		if (comma == std::string::npos) break;
		p = comma + 1;
	}
	return result;
}

// Read entire file to string
static bool read_file(const std::string &path, std::string &out)
{
	std::ifstream f(path);
	if (!f.is_open()) return false;
	std::stringstream ss;
	ss << f.rdbuf();
	out = ss.str();
	return true;
}

// Write string to file
static bool write_file(const std::string &path, const std::string &content)
{
	std::ofstream f(path);
	if (!f.is_open()) return false;
	f << content;
	return true;
}

// Get file modification time
static long long get_file_mtime(const std::string &path)
{
	WIN32_FILE_ATTRIBUTE_DATA attrs;
	if (!GetFileAttributesExA(path.c_str(), GetFileExInfoStandard, &attrs))
		return -1;
	LARGE_INTEGER li;
	li.LowPart = attrs.ftLastWriteTime.dwLowDateTime;
	li.HighPart = attrs.ftLastWriteTime.dwHighDateTime;
	return li.QuadPart;
}

// ─── Addon state ───────────────────────────────────────────────

static std::string g_config_path;
static std::string g_state_path;
static long long g_last_config_mtime = 0;
static long long g_last_state_write = 0;
static bool g_effects_enabled = true;
static std::string g_last_config_json;

// Technique state: name -> enabled
struct TechniqueState
{
	std::string name;
	std::string effect_name;
	bool enabled;
};
static std::vector<TechniqueState> g_techniques;

// Uniform state: name -> {value_type, values}
struct UniformState
{
	std::string name;
	std::string effect_name;
	reshade::api::format base_type;
	uint32_t rows;
	uint32_t columns;
	float float_values[4];
	int int_values[4];
	bool bool_values[4];
};
static std::vector<UniformState> g_uniforms;

// ─── Config application ────────────────────────────────────────

static void apply_config(reshade::api::effect_runtime *runtime, const std::string &config_json)
{
	// Parse effects_enabled
	bool effects_enabled = true;
	if (json_get_bool(config_json, "effectsEnabled", effects_enabled))
	{
		if (effects_enabled != g_effects_enabled)
		{
			runtime->set_effects_state(effects_enabled);
			g_effects_enabled = effects_enabled;
		}
	}

	// Parse technique states (techniques is a JSON object, not a string)
	{
		auto pairs = json_get_object_pairs(config_json, "techniques");
		for (const auto &p : pairs)
		{
			bool enabled = (p.second == "true" || p.second == "1");
			// Find technique by name
			runtime->enumerate_techniques(nullptr, [runtime, &p, enabled](reshade::api::effect_runtime *rt, reshade::api::effect_technique tech) {
				char name[256] = {0};
				rt->get_technique_name(tech, name);
				if (name == p.first)
				{
					if (rt->get_technique_state(tech) != enabled)
						rt->set_technique_state(tech, enabled);
				}
			});
		}
	}

	// Parse uniform values (uniforms is a JSON object, not a string)
	{
		auto pairs = json_get_object_pairs(config_json, "uniforms");
		for (const auto &p : pairs)
		{
			// Find uniform by name
			reshade::api::effect_uniform_variable var = runtime->find_uniform_variable(nullptr, p.first.c_str());
			if (var.handle == 0) continue;

			reshade::api::format base_type = reshade::api::format::unknown;
			runtime->get_uniform_variable_type(var, &base_type);

			// Parse value based on type
			if (base_type == reshade::api::format::r32_float ||
			    base_type == reshade::api::format::r32g32_float ||
			    base_type == reshade::api::format::r32g32b32_float ||
			    base_type == reshade::api::format::r32g32b32a32_float)
			{
				float val = 0.0f;
				try { val = std::stof(p.second); } catch (...) { continue; }
				runtime->set_uniform_value_float(var, val);
			}
			else if (base_type == reshade::api::format::r32_sint ||
			         base_type == reshade::api::format::r32g32_sint ||
			         base_type == reshade::api::format::r32g32b32_sint ||
			         base_type == reshade::api::format::r32g32b32a32_sint)
			{
				int val = 0;
				try { val = std::stoi(p.second); } catch (...) { continue; }
				runtime->set_uniform_value_int(var, val);
			}
			else if (base_type == reshade::api::format::r32_uint ||
			         base_type == reshade::api::format::r32g32_uint ||
			         base_type == reshade::api::format::r32g32b32_uint ||
			         base_type == reshade::api::format::r32g32b32a32_uint)
			{
				uint32_t val = 0;
				try { val = (uint32_t)std::stoul(p.second); } catch (...) { continue; }
				runtime->set_uniform_value_uint(var, val);
			}
		}
	}

	// Parse custom config overrides (section/key/value triples)
	std::string overrides_str;
	if (json_get_string(config_json, "configOverrides", overrides_str))
	{
		// overrides is a JSON array of {section, key, value} objects
		// Simple parsing: find each object
		size_t pos = 0;
		std::string needle = "\"section\"";
		while ((pos = config_json.find(needle, pos)) != std::string::npos)
		{
			// Find the enclosing object
			size_t obj_start = config_json.rfind('{', pos);
			size_t obj_end = config_json.find('}', pos);
			if (obj_start == std::string::npos || obj_end == std::string::npos) break;
			std::string obj = config_json.substr(obj_start, obj_end - obj_start + 1);

			std::string section, key, value;
			if (json_get_string(obj, "section", section) &&
				json_get_string(obj, "key", key) &&
				json_get_string(obj, "value", value))
			{
				reshade::set_config_value(runtime, section.c_str(), key.c_str(), value.c_str());
			}
			pos = obj_end + 1;
		}
	}

	// Save preset if requested
	bool save_preset = false;
	if (json_get_bool(config_json, "savePreset", save_preset) && save_preset)
	{
		runtime->save_current_preset();
	}
}

// ─── State serialization ───────────────────────────────────────

static void write_state(reshade::api::effect_runtime *runtime)
{
	std::ostringstream ss;
	ss << "{";

	// Effects state
	ss << "\"effectsEnabled\":" << (runtime->get_effects_state() ? "true" : "false") << ",";

	// Techniques
	ss << "\"techniques\":[";
	bool first = true;
	runtime->enumerate_techniques(nullptr, [&ss, &first, runtime](reshade::api::effect_runtime *rt, reshade::api::effect_technique tech) {
		char name[256] = {0};
		rt->get_technique_name(tech, name);
		char effect_name[256] = {0};
		rt->get_technique_effect_name(tech, effect_name);
		bool enabled = rt->get_technique_state(tech);

		if (!first) ss << ",";
		first = false;
		ss << "{\"name\":\"" << json_escape(name) << "\","
		   << "\"effect\":\"" << json_escape(effect_name) << "\","
		   << "\"enabled\":" << (enabled ? "true" : "false") << "}";
	});
	ss << "],";

	// Uniforms
	ss << "\"uniforms\":[";
	first = true;
	runtime->enumerate_uniform_variables(nullptr, [&ss, &first, runtime](reshade::api::effect_runtime *rt, reshade::api::effect_uniform_variable var) {
		char name[256] = {0};
		rt->get_uniform_variable_name(var, name);

		reshade::api::format base_type = reshade::api::format::unknown;
		uint32_t rows = 0, cols = 0;
		rt->get_uniform_variable_type(var, &base_type, &rows, &cols);

		if (!first) ss << ",";
		first = false;
		ss << "{\"name\":\"" << json_escape(name) << "\","
		   << "\"type\":" << static_cast<int>(base_type) << ","
		   << "\"rows\":" << rows << ","
		   << "\"cols\":" << cols << ",";

		// Output values based on type
		if (base_type == reshade::api::format::r32_float ||
		    base_type == reshade::api::format::r32g32_float ||
		    base_type == reshade::api::format::r32g32b32_float ||
		    base_type == reshade::api::format::r32g32b32a32_float)
		{
			float vals[4] = {0};
			rt->get_uniform_value_float(var, vals, 4);
			ss << "\"values\":[" << vals[0];
			for (uint32_t i = 1; i < cols; i++) ss << "," << vals[i];
			ss << "]";
		}
		else if (base_type == reshade::api::format::r32_sint ||
		         base_type == reshade::api::format::r32g32_sint ||
		         base_type == reshade::api::format::r32g32b32_sint ||
		         base_type == reshade::api::format::r32g32b32a32_sint)
		{
			int32_t vals[4] = {0};
			rt->get_uniform_value_int(var, vals, 4);
			ss << "\"values\":[" << vals[0];
			for (uint32_t i = 1; i < cols; i++) ss << "," << vals[i];
			ss << "]";
		}
		else if (base_type == reshade::api::format::r32_uint ||
		         base_type == reshade::api::format::r32g32_uint ||
		         base_type == reshade::api::format::r32g32b32_uint ||
		         base_type == reshade::api::format::r32g32b32a32_uint)
		{
			uint32_t vals[4] = {0};
			rt->get_uniform_value_uint(var, vals, 4);
			ss << "\"values\":[" << vals[0];
			for (uint32_t i = 1; i < cols; i++) ss << "," << vals[i];
			ss << "]";
		}
		else
		{
			ss << "\"values\":[]";
		}
		ss << "}";
	});
	ss << "]";

	ss << "}";
	write_file(g_state_path, ss.str());
	g_last_state_write = get_file_mtime(g_state_path);
}

// ─── Event callbacks ───────────────────────────────────────────

static void on_reshade_present(reshade::api::effect_runtime *runtime)
{
	// Check for config file changes
	long long mtime = get_file_mtime(g_config_path);
	if (mtime > 0 && mtime != g_last_config_mtime)
	{
		g_last_config_mtime = mtime;
		std::string config_json;
		if (read_file(g_config_path, config_json))
		{
			apply_config(runtime, config_json);
		}
	}

	// Write state periodically (every ~2 seconds)
	static auto last_state_time = std::chrono::steady_clock::now();
	auto now = std::chrono::steady_clock::now();
	if (std::chrono::duration_cast<std::chrono::milliseconds>(now - last_state_time).count() > 2000)
	{
		write_state(runtime);
		last_state_time = now;
	}
}

static void on_reshade_reloaded_effects(reshade::api::effect_runtime *runtime)
{
	// Re-apply config after effects are reloaded
	g_last_config_mtime = 0; // Force re-read
	write_state(runtime);
}

// ─── DllMain ───────────────────────────────────────────────────

BOOL APIENTRY DllMain(HMODULE hModule, DWORD reason, LPVOID)
{
	switch (reason)
	{
	case DLL_PROCESS_ATTACH:
	{
		// Get the directory of this DLL to find config/state files
		char path[MAX_PATH] = {0};
		GetModuleFileNameA(hModule, path, MAX_PATH);
		std::string dll_dir(path);
		size_t last_slash = dll_dir.find_last_of("\\/");
		if (last_slash != std::string::npos)
			dll_dir = dll_dir.substr(0, last_slash);
		else
			dll_dir = ".";

		g_config_path = dll_dir + "\\ember-reshade-control.json";
		g_state_path = dll_dir + "\\ember-reshade-state.json";

		// Register addon
		if (!reshade::register_addon(hModule))
			return FALSE;

		// Register events
		reshade::register_event<reshade::addon_event::reshade_present>(on_reshade_present);
		reshade::register_event<reshade::addon_event::reshade_reloaded_effects>(on_reshade_reloaded_effects);

		break;
	}
	case DLL_PROCESS_DETACH:
	{
		reshade::unregister_event<reshade::addon_event::reshade_present>(on_reshade_present);
		reshade::unregister_event<reshade::addon_event::reshade_reloaded_effects>(on_reshade_reloaded_effects);
		reshade::unregister_addon(hModule);
		break;
	}
	}
	return TRUE;
}

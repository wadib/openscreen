#include "camera_controls.h"

#include <dshow.h>
#include <windows.h>

#include <algorithm>
#include <cwctype>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <string_view>

namespace {

enum class ControlFamily {
    videoProcAmp,
    cameraControl,
};

struct ControlDefinition {
    std::string_view id;
    std::string_view label;
    ControlFamily family;
    long property;
};

constexpr ControlDefinition controls[] = {
    {"brightness", "Brightness", ControlFamily::videoProcAmp, VideoProcAmp_Brightness},
    {"contrast", "Contrast", ControlFamily::videoProcAmp, VideoProcAmp_Contrast},
    {"hue", "Hue", ControlFamily::videoProcAmp, VideoProcAmp_Hue},
    {"saturation", "Saturation", ControlFamily::videoProcAmp, VideoProcAmp_Saturation},
    {"sharpness", "Sharpness", ControlFamily::videoProcAmp, VideoProcAmp_Sharpness},
    {"gamma", "Gamma", ControlFamily::videoProcAmp, VideoProcAmp_Gamma},
    {"whiteBalance", "White balance", ControlFamily::videoProcAmp, VideoProcAmp_WhiteBalance},
    {"backlightCompensation", "Backlight", ControlFamily::videoProcAmp, VideoProcAmp_BacklightCompensation},
    {"gain", "Gain", ControlFamily::videoProcAmp, VideoProcAmp_Gain},
    {"pan", "Pan", ControlFamily::cameraControl, CameraControl_Pan},
    {"tilt", "Tilt", ControlFamily::cameraControl, CameraControl_Tilt},
    {"roll", "Roll", ControlFamily::cameraControl, CameraControl_Roll},
    {"zoom", "Zoom", ControlFamily::cameraControl, CameraControl_Zoom},
    {"exposure", "Exposure", ControlFamily::cameraControl, CameraControl_Exposure},
    {"iris", "Iris", ControlFamily::cameraControl, CameraControl_Iris},
    {"focus", "Focus", ControlFamily::cameraControl, CameraControl_Focus},
};

std::string hresultMessage(const char* operation, HRESULT result) {
    std::ostringstream message;
    message << operation << " failed (0x" << std::hex << std::uppercase
            << static_cast<unsigned long>(result) << ")";
    return message.str();
}

void writeError(const std::string& message) {
    std::cout << "{\"success\":false,\"error\":\"" << message << "\"}" << std::endl;
}

const ControlDefinition* findControl(std::string_view id) {
    const auto match = std::find_if(std::begin(controls), std::end(controls), [id](const auto& control) {
        return control.id == id;
    });
    return match == std::end(controls) ? nullptr : match;
}

struct ControlInterfaces {
    IBaseFilter* filter = nullptr;
    IAMVideoProcAmp* videoProcAmp = nullptr;
    IAMCameraControl* cameraControl = nullptr;

    ~ControlInterfaces() {
        if (cameraControl) cameraControl->Release();
        if (videoProcAmp) videoProcAmp->Release();
        if (filter) filter->Release();
    }
};

std::wstring normalizeDeviceName(std::wstring value) {
    std::transform(value.begin(), value.end(), value.begin(), [](wchar_t character) {
        return std::iswalnum(character) ? static_cast<wchar_t>(std::towlower(character)) : L' ';
    });
    value.erase(std::unique(value.begin(), value.end(), [](wchar_t left, wchar_t right) {
        return left == L' ' && right == L' ';
    }), value.end());
    return value;
}

int scoreDeviceName(const std::wstring& candidateName, const std::wstring& requestedName) {
    const std::wstring candidate = normalizeDeviceName(candidateName);
    const std::wstring requested = normalizeDeviceName(requestedName);
    if (candidate == requested) return 1000;
    if (candidate.find(requested) != std::wstring::npos
        || requested.find(candidate) != std::wstring::npos) {
        return 900;
    }

    int score = 0;
    std::wistringstream words(requested);
    std::wstring word;
    while (words >> word) {
        if (word.size() > 1 && candidate.find(word) != std::wstring::npos) score += 100;
    }
    return score;
}

HRESULT openCamera(const std::wstring& deviceName, ControlInterfaces& interfaces) {
    ICreateDevEnum* deviceEnumerator = nullptr;
    HRESULT result = CoCreateInstance(
        CLSID_SystemDeviceEnum,
        nullptr,
        CLSCTX_INPROC_SERVER,
        __uuidof(ICreateDevEnum),
        reinterpret_cast<void**>(&deviceEnumerator));
    if (FAILED(result)) return result;

    IEnumMoniker* cameraEnumerator = nullptr;
    result = deviceEnumerator->CreateClassEnumerator(
        CLSID_VideoInputDeviceCategory,
        &cameraEnumerator,
        0);
    deviceEnumerator->Release();
    if (result != S_OK || !cameraEnumerator) return result == S_FALSE ? HRESULT_FROM_WIN32(ERROR_NOT_FOUND) : result;

    IMoniker* selected = nullptr;
    int selectedScore = -1;
    IMoniker* moniker = nullptr;
    while (cameraEnumerator->Next(1, &moniker, nullptr) == S_OK) {
        IPropertyBag* properties = nullptr;
        std::wstring friendlyName;
        if (SUCCEEDED(moniker->BindToStorage(nullptr, nullptr, __uuidof(IPropertyBag),
                reinterpret_cast<void**>(&properties)))) {
            VARIANT name{};
            VariantInit(&name);
            if (SUCCEEDED(properties->Read(L"FriendlyName", &name, nullptr)) && name.vt == VT_BSTR) {
                friendlyName = name.bstrVal;
            }
            VariantClear(&name);
            properties->Release();
        }

        const int score = scoreDeviceName(friendlyName, deviceName);
        if (score > selectedScore) {
            if (selected) selected->Release();
            selected = moniker;
            selectedScore = score;
        } else {
            moniker->Release();
        }
        moniker = nullptr;
    }
    cameraEnumerator->Release();

    if (!selected || selectedScore <= 0) {
        if (selected) selected->Release();
        return HRESULT_FROM_WIN32(ERROR_NOT_FOUND);
    }

    result = selected->BindToObject(
        nullptr,
        nullptr,
        __uuidof(IBaseFilter),
        reinterpret_cast<void**>(&interfaces.filter));
    selected->Release();
    if (FAILED(result)) return result;

    interfaces.filter->QueryInterface(
        __uuidof(IAMVideoProcAmp),
        reinterpret_cast<void**>(&interfaces.videoProcAmp));
    interfaces.filter->QueryInterface(
        __uuidof(IAMCameraControl),
        reinterpret_cast<void**>(&interfaces.cameraControl));
    return interfaces.videoProcAmp || interfaces.cameraControl ? S_OK : E_NOINTERFACE;
}

HRESULT getRange(
    const ControlDefinition& definition,
    const ControlInterfaces& interfaces,
    long* minimum,
    long* maximum,
    long* step,
    long* defaultValue,
    long* capabilities) {
    if (definition.family == ControlFamily::videoProcAmp) {
        return interfaces.videoProcAmp
            ? interfaces.videoProcAmp->GetRange(
                  definition.property, minimum, maximum, step, defaultValue, capabilities)
            : E_NOINTERFACE;
    }
    return interfaces.cameraControl
        ? interfaces.cameraControl->GetRange(
              definition.property, minimum, maximum, step, defaultValue, capabilities)
        : E_NOINTERFACE;
}

HRESULT getValue(
    const ControlDefinition& definition,
    const ControlInterfaces& interfaces,
    long* value,
    long* flags) {
    if (definition.family == ControlFamily::videoProcAmp) {
        return interfaces.videoProcAmp
            ? interfaces.videoProcAmp->Get(definition.property, value, flags)
            : E_NOINTERFACE;
    }
    return interfaces.cameraControl
        ? interfaces.cameraControl->Get(definition.property, value, flags)
        : E_NOINTERFACE;
}

HRESULT setValue(
    const ControlDefinition& definition,
    const ControlInterfaces& interfaces,
    long value,
    long flags) {
    if (definition.family == ControlFamily::videoProcAmp) {
        return interfaces.videoProcAmp
            ? interfaces.videoProcAmp->Set(definition.property, value, flags)
            : E_NOINTERFACE;
    }
    return interfaces.cameraControl
        ? interfaces.cameraControl->Set(definition.property, value, flags)
        : E_NOINTERFACE;
}

bool writeControl(const ControlDefinition& definition, const ControlInterfaces& interfaces) {
    long minimum = 0;
    long maximum = 0;
    long step = 0;
    long defaultValue = 0;
    long capabilities = 0;
    if (FAILED(getRange(
            definition,
            interfaces,
            &minimum,
            &maximum,
            &step,
            &defaultValue,
            &capabilities))) {
        return false;
    }

    long value = defaultValue;
    long flags = 0;
    getValue(definition, interfaces, &value, &flags);
    const long autoFlag = definition.family == ControlFamily::videoProcAmp
        ? VideoProcAmp_Flags_Auto
        : CameraControl_Flags_Auto;
    const long manualFlag = definition.family == ControlFamily::videoProcAmp
        ? VideoProcAmp_Flags_Manual
        : CameraControl_Flags_Manual;

    std::cout << "{\"id\":\"" << definition.id
              << "\",\"label\":\"" << definition.label
              << "\",\"min\":" << minimum
              << ",\"max\":" << maximum
              << ",\"step\":" << std::max(1L, step)
              << ",\"defaultValue\":" << defaultValue
              << ",\"value\":" << value
              << ",\"autoSupported\":" << ((capabilities & autoFlag) ? "true" : "false")
              << ",\"manualSupported\":" << ((capabilities & manualFlag) ? "true" : "false")
              << ",\"automatic\":" << ((flags & autoFlag) ? "true" : "false")
              << "}";
    return true;
}

} // namespace

int runCameraControlCommand(
    const std::wstring& deviceName,
    const std::string& action,
    const std::string& propertyId,
    long requestedValue,
    bool automatic) {
    const HRESULT comResult = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    struct ComLifetime {
        bool ownsCom;
        ~ComLifetime() {
            if (ownsCom) CoUninitialize();
        }
    } comLifetime{SUCCEEDED(comResult)};
    if (FAILED(comResult) && comResult != RPC_E_CHANGED_MODE) {
        writeError(hresultMessage("COM initialization", comResult));
        return 1;
    }

    ControlInterfaces interfaces;
    const HRESULT openResult = openCamera(deviceName, interfaces);
    if (FAILED(openResult)) {
        writeError(hresultMessage("Opening camera controls", openResult));
        return 1;
    }

    if (action == "list") {
        std::cout << "{\"success\":true,\"controls\":[";
        bool first = true;
        for (const auto& control : controls) {
            std::ostringstream candidate;
            auto* previousBuffer = std::cout.rdbuf(candidate.rdbuf());
            const bool supported = writeControl(control, interfaces);
            std::cout.rdbuf(previousBuffer);
            if (!supported) continue;
            if (!first) std::cout << ',';
            std::cout << candidate.str();
            first = false;
        }
        std::cout << "]}" << std::endl;
        return 0;
    }

    if (action != "set") {
        writeError("Unsupported camera control action");
        return 1;
    }

    const ControlDefinition* definition = findControl(propertyId);
    if (!definition) {
        writeError("Unsupported camera control property");
        return 1;
    }

    long minimum = 0;
    long maximum = 0;
    long step = 1;
    long defaultValue = 0;
    long capabilities = 0;
    HRESULT result = getRange(
        *definition,
        interfaces,
        &minimum,
        &maximum,
        &step,
        &defaultValue,
        &capabilities);
    if (FAILED(result)) {
        writeError(hresultMessage("Reading camera control range", result));
        return 1;
    }

    const long autoFlag = definition->family == ControlFamily::videoProcAmp
        ? VideoProcAmp_Flags_Auto
        : CameraControl_Flags_Auto;
    const long manualFlag = definition->family == ControlFamily::videoProcAmp
        ? VideoProcAmp_Flags_Manual
        : CameraControl_Flags_Manual;
    const long desiredFlag = automatic ? autoFlag : manualFlag;
    if ((capabilities & desiredFlag) == 0) {
        writeError(automatic ? "Automatic mode is not supported" : "Manual mode is not supported");
        return 1;
    }

    long currentValue = defaultValue;
    long currentFlags = 0;
    getValue(*definition, interfaces, &currentValue, &currentFlags);
    long value = automatic ? currentValue : std::clamp(requestedValue, minimum, maximum);
    if (!automatic && step > 1) {
        value = minimum + ((value - minimum) / step) * step;
    }

    result = setValue(*definition, interfaces, value, desiredFlag);
    if (FAILED(result)) {
        writeError(hresultMessage("Setting camera control", result));
        return 1;
    }

    std::cout << "{\"success\":true,\"control\":";
    writeControl(*definition, interfaces);
    std::cout << "}" << std::endl;
    return 0;
}

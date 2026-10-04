#include "popup_overlay_capture.h"

#include <dwmapi.h>

#include <algorithm>
#include <cmath>
#include <cstring>
#include <iostream>
#include <string>

namespace {

struct PopupCandidate {
    HWND window = nullptr;
    RECT bounds{};
};

struct EnumerationContext {
    HWND targetWindow = nullptr;
    DWORD targetProcessId = 0;
    RECT targetBounds{};
    std::vector<PopupCandidate>* candidates = nullptr;
};

bool getCaptureBounds(HWND window, RECT& bounds) {
    if (!GetWindowRect(window, &bounds)) {
        return false;
    }

    RECT visibleBounds{};
    if (SUCCEEDED(DwmGetWindowAttribute(
            window,
            DWMWA_EXTENDED_FRAME_BOUNDS,
            &visibleBounds,
            sizeof(visibleBounds))) &&
        visibleBounds.right > visibleBounds.left && visibleBounds.bottom > visibleBounds.top) {
        bounds = visibleBounds;
    }
    return bounds.right > bounds.left && bounds.bottom > bounds.top;
}

bool intersects(const RECT& first, const RECT& second) {
    return first.left < second.right && first.right > second.left &&
        first.top < second.bottom && first.bottom > second.top;
}

bool isOwnedBy(HWND window, HWND targetWindow) {
    for (HWND owner = GetWindow(window, GW_OWNER); owner; owner = GetWindow(owner, GW_OWNER)) {
        if (owner == targetWindow) {
            return true;
        }
    }
    return GetAncestor(window, GA_ROOTOWNER) == targetWindow;
}

bool isPopupClass(HWND window) {
    wchar_t className[128]{};
    const int length = GetClassNameW(window, className, ARRAYSIZE(className));
    if (length <= 0) {
        return false;
    }
    const std::wstring name(className, static_cast<size_t>(length));
    return name == L"#32768" || name == L"ComboLBox" || name == L"tooltips_class32";
}

BOOL CALLBACK collectPopupWindow(HWND window, LPARAM parameter) {
    auto* context = reinterpret_cast<EnumerationContext*>(parameter);
    if (!context || window == context->targetWindow || !IsWindowVisible(window) || IsIconic(window)) {
        return TRUE;
    }

    DWORD cloaked = 0;
    if (SUCCEEDED(DwmGetWindowAttribute(window, DWMWA_CLOAKED, &cloaked, sizeof(cloaked))) && cloaked) {
        return TRUE;
    }

    RECT bounds{};
    if (!GetWindowRect(window, &bounds) || !intersects(bounds, context->targetBounds)) {
        return TRUE;
    }

    DWORD processId = 0;
    GetWindowThreadProcessId(window, &processId);
    const bool related = isOwnedBy(window, context->targetWindow) ||
        (processId != 0 && processId == context->targetProcessId);
    const auto style = static_cast<DWORD_PTR>(GetWindowLongPtrW(window, GWL_STYLE));
    if (!related || (!isPopupClass(window) && (style & WS_POPUP) == 0)) {
        return TRUE;
    }

    context->candidates->push_back({window, bounds});
    return TRUE;
}

std::vector<PopupCandidate> findPopupWindows(HWND targetWindow, const RECT& targetBounds) {
    DWORD targetProcessId = 0;
    GetWindowThreadProcessId(targetWindow, &targetProcessId);
    std::vector<PopupCandidate> candidates;
    EnumerationContext context{targetWindow, targetProcessId, targetBounds, &candidates};
    EnumWindows(collectPopupWindow, reinterpret_cast<LPARAM>(&context));

    // EnumWindows returns topmost windows first. Paint bottom-to-top so the
    // final overlay preserves native popup stacking.
    std::reverse(candidates.begin(), candidates.end());
    return candidates;
}

int scaleCoordinate(int value, int sourceExtent, int destinationExtent) {
    if (sourceExtent <= 0 || destinationExtent <= 0) {
        return 0;
    }
    return static_cast<int>(std::llround(
        static_cast<double>(value) * static_cast<double>(destinationExtent) /
        static_cast<double>(sourceExtent)));
}

} // namespace

PopupOverlayCapture::~PopupOverlayCapture() {
    stop();
}

bool PopupOverlayCapture::initialize(HWND targetWindow, int fps, bool captureCursor) {
    targetWindow_ = targetWindow;
    monitor_ = MonitorFromWindow(targetWindow_, MONITOR_DEFAULTTONEAREST);
    if (!targetWindow_ || !monitor_) {
        return false;
    }
    if (!session_.initialize(monitor_, fps, captureCursor)) {
        return false;
    }

    session_.setFrameCallback([this](ID3D11Texture2D* texture, int64_t) {
        std::scoped_lock lock(frameMutex_);
        D3D11_TEXTURE2D_DESC desc{};
        texture->GetDesc(&desc);
        if (!latestFrameTexture_) {
            desc.BindFlags = 0;
            desc.CPUAccessFlags = 0;
            desc.MiscFlags = 0;
            if (FAILED(session_.device()->CreateTexture2D(&desc, nullptr, &latestFrameTexture_))) {
                return;
            }
        }
        session_.context()->CopyResource(latestFrameTexture_.Get(), texture);
    });
    return true;
}

bool PopupOverlayCapture::start() {
    started_ = session_.start();
    return started_;
}

void PopupOverlayCapture::stop() {
    if (started_) {
        session_.stop();
    }
    std::scoped_lock lock(frameMutex_);
    stagingTexture_.Reset();
    latestFrameTexture_.Reset();
    started_ = false;
}

bool PopupOverlayCapture::ensureStagingTexture(ID3D11Texture2D* texture) {
    D3D11_TEXTURE2D_DESC desc{};
    texture->GetDesc(&desc);
    if (stagingTexture_) {
        D3D11_TEXTURE2D_DESC stagingDesc{};
        stagingTexture_->GetDesc(&stagingDesc);
        if (stagingDesc.Width == desc.Width && stagingDesc.Height == desc.Height &&
            stagingDesc.Format == desc.Format) {
            return true;
        }
        stagingTexture_.Reset();
    }

    desc.MipLevels = 1;
    desc.ArraySize = 1;
    desc.Format = DXGI_FORMAT_B8G8R8A8_UNORM;
    desc.SampleDesc.Count = 1;
    desc.SampleDesc.Quality = 0;
    desc.Usage = D3D11_USAGE_STAGING;
    desc.BindFlags = 0;
    desc.CPUAccessFlags = D3D11_CPU_ACCESS_READ;
    desc.MiscFlags = 0;
    return SUCCEEDED(session_.device()->CreateTexture2D(&desc, nullptr, &stagingTexture_));
}

bool PopupOverlayCapture::copyOverlays(
    int outputWidth,
    int outputHeight,
    std::vector<PopupOverlayFrame>& overlays) {
    overlays.clear();
    if (!started_ || !IsWindow(targetWindow_)) {
        return true;
    }

    RECT targetBounds{};
    if (!getCaptureBounds(targetWindow_, targetBounds)) {
        return true;
    }
    const auto candidates = findPopupWindows(targetWindow_, targetBounds);
    if (candidates.empty()) {
        return true;
    }

    MONITORINFO monitorInfo{};
    monitorInfo.cbSize = sizeof(monitorInfo);
    if (!GetMonitorInfoW(monitor_, &monitorInfo)) {
        return false;
    }

    std::scoped_lock lock(frameMutex_);
    if (!latestFrameTexture_ || !ensureStagingTexture(latestFrameTexture_.Get())) {
        return true;
    }

    session_.context()->CopyResource(stagingTexture_.Get(), latestFrameTexture_.Get());
    D3D11_MAPPED_SUBRESOURCE mapped{};
    if (FAILED(session_.context()->Map(stagingTexture_.Get(), 0, D3D11_MAP_READ, 0, &mapped))) {
        return false;
    }

    D3D11_TEXTURE2D_DESC textureDesc{};
    latestFrameTexture_->GetDesc(&textureDesc);
    const int monitorWidth = monitorInfo.rcMonitor.right - monitorInfo.rcMonitor.left;
    const int monitorHeight = monitorInfo.rcMonitor.bottom - monitorInfo.rcMonitor.top;
    const int targetWidth = targetBounds.right - targetBounds.left;
    const int targetHeight = targetBounds.bottom - targetBounds.top;
    const auto* source = static_cast<const BYTE*>(mapped.pData);

    for (const auto& candidate : candidates) {
        RECT clipped{
            std::max(candidate.bounds.left, targetBounds.left),
            std::max(candidate.bounds.top, targetBounds.top),
            std::min(candidate.bounds.right, targetBounds.right),
            std::min(candidate.bounds.bottom, targetBounds.bottom),
        };
        if (clipped.right <= clipped.left || clipped.bottom <= clipped.top) {
            continue;
        }

        const int sourceLeft = std::clamp(
            scaleCoordinate(clipped.left - monitorInfo.rcMonitor.left, monitorWidth, textureDesc.Width),
            0,
            static_cast<int>(textureDesc.Width));
        const int sourceTop = std::clamp(
            scaleCoordinate(clipped.top - monitorInfo.rcMonitor.top, monitorHeight, textureDesc.Height),
            0,
            static_cast<int>(textureDesc.Height));
        const int sourceRight = std::clamp(
            scaleCoordinate(clipped.right - monitorInfo.rcMonitor.left, monitorWidth, textureDesc.Width),
            sourceLeft,
            static_cast<int>(textureDesc.Width));
        const int sourceBottom = std::clamp(
            scaleCoordinate(clipped.bottom - monitorInfo.rcMonitor.top, monitorHeight, textureDesc.Height),
            sourceTop,
            static_cast<int>(textureDesc.Height));

        PopupOverlayFrame overlay;
        overlay.width = sourceRight - sourceLeft;
        overlay.height = sourceBottom - sourceTop;
        overlay.destinationX = scaleCoordinate(clipped.left - targetBounds.left, targetWidth, outputWidth);
        overlay.destinationY = scaleCoordinate(clipped.top - targetBounds.top, targetHeight, outputHeight);
        if (overlay.width <= 0 || overlay.height <= 0) {
            continue;
        }

        overlay.data.resize(static_cast<size_t>(overlay.width) * overlay.height * 4);
        for (int row = 0; row < overlay.height; row += 1) {
            std::memcpy(
                overlay.data.data() + static_cast<size_t>(row) * overlay.width * 4,
                source + static_cast<size_t>(sourceTop + row) * mapped.RowPitch + sourceLeft * 4,
                static_cast<size_t>(overlay.width) * 4);
        }
        overlays.push_back(std::move(overlay));
    }

    session_.context()->Unmap(stagingTexture_.Get(), 0);
    if (!overlays.empty() && !reportedActive_) {
        reportedActive_ = true;
        std::cout << "{\"event\":\"popup-overlay-capture\",\"schemaVersion\":2,\"active\":true}" << std::endl;
    }
    return true;
}

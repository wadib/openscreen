#include "preview.h"

#include "popup_overlay_capture.h"

#include <wincodec.h>
#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstring>
#include <iostream>
#include <memory>
#include <mutex>
#include <string>
#include <vector>

using Microsoft::WRL::ComPtr;

namespace {

std::string base64(const BYTE* data, size_t size) {
    constexpr char chars[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    std::string output;
    output.reserve(((size + 2) / 3) * 4);
    for (size_t i = 0; i < size; i += 3) {
        const unsigned value = (unsigned(data[i]) << 16) |
            (i + 1 < size ? unsigned(data[i + 1]) << 8 : 0) |
            (i + 2 < size ? unsigned(data[i + 2]) : 0);
        output.push_back(chars[(value >> 18) & 63]);
        output.push_back(chars[(value >> 12) & 63]);
        output.push_back(i + 1 < size ? chars[(value >> 6) & 63] : '=');
        output.push_back(i + 2 < size ? chars[value & 63] : '=');
    }
    return output;
}

bool writePreviewFrame(WgcSession& session, IWICImagingFactory* factory,
                       ID3D11Texture2D* texture, ComPtr<ID3D11Texture2D>& staging,
                       PopupOverlayCapture* popupOverlayCapture) {
    D3D11_TEXTURE2D_DESC desc{};
    texture->GetDesc(&desc);
    D3D11_TEXTURE2D_DESC previous{};
    if (staging) staging->GetDesc(&previous);
    if (!staging || previous.Width != desc.Width || previous.Height != desc.Height) {
        staging.Reset();
        auto readback = desc;
        readback.Usage = D3D11_USAGE_STAGING;
        readback.BindFlags = 0;
        readback.CPUAccessFlags = D3D11_CPU_ACCESS_READ;
        readback.MiscFlags = 0;
        if (FAILED(session.device()->CreateTexture2D(&readback, nullptr, &staging))) return false;
    }
    session.context()->CopyResource(staging.Get(), texture);
    D3D11_MAPPED_SUBRESOURCE mapped{};
    if (FAILED(session.context()->Map(staging.Get(), 0, D3D11_MAP_READ, 0, &mapped))) return false;
    const UINT rowBytes = desc.Width * 4;
    std::vector<BYTE> pixels(static_cast<size_t>(rowBytes) * desc.Height);
    for (UINT row = 0; row < desc.Height; row += 1) {
        std::memcpy(
            pixels.data() + static_cast<size_t>(row) * rowBytes,
            static_cast<BYTE*>(mapped.pData) + static_cast<size_t>(row) * mapped.RowPitch,
            rowBytes);
    }
    session.context()->Unmap(staging.Get(), 0);

    if (popupOverlayCapture) {
        std::vector<PopupOverlayFrame> overlays;
        if (!popupOverlayCapture->copyOverlays(desc.Width, desc.Height, overlays)) return false;
        for (const auto& overlay : overlays) {
            const int sourceLeft = std::max(0, -overlay.destinationX);
            const int sourceTop = std::max(0, -overlay.destinationY);
            const int destinationLeft = std::max(0, overlay.destinationX);
            const int destinationTop = std::max(0, overlay.destinationY);
            const int copyWidth = std::min(overlay.width - sourceLeft,
                static_cast<int>(desc.Width) - destinationLeft);
            const int copyHeight = std::min(overlay.height - sourceTop,
                static_cast<int>(desc.Height) - destinationTop);
            if (copyWidth <= 0 || copyHeight <= 0) continue;
            for (int row = 0; row < copyHeight; row += 1) {
                std::memcpy(
                    pixels.data() + (static_cast<size_t>(destinationTop + row) * desc.Width + destinationLeft) * 4,
                    overlay.data.data() + (static_cast<size_t>(sourceTop + row) * overlay.width + sourceLeft) * 4,
                    static_cast<size_t>(copyWidth) * 4);
            }
        }
    }

    ComPtr<IWICBitmap> bitmap;
    const auto result = factory->CreateBitmapFromMemory(desc.Width, desc.Height,
        GUID_WICPixelFormat32bppBGRA, rowBytes, rowBytes * desc.Height,
        pixels.data(), &bitmap);
    if (FAILED(result)) return false;

    const double scale = std::min({1.0, 960.0 / desc.Width, 540.0 / desc.Height});
    const UINT width = std::max(1u, static_cast<UINT>(desc.Width * scale));
    const UINT height = std::max(1u, static_cast<UINT>(desc.Height * scale));
    ComPtr<IWICBitmapScaler> scaler;
    ComPtr<IStream> stream;
    ComPtr<IWICBitmapEncoder> encoder;
    ComPtr<IWICBitmapFrameEncode> frame;
    if (FAILED(factory->CreateBitmapScaler(&scaler)) ||
        FAILED(scaler->Initialize(bitmap.Get(), width, height, WICBitmapInterpolationModeLinear)) ||
        FAILED(CreateStreamOnHGlobal(nullptr, TRUE, &stream)) ||
        FAILED(factory->CreateEncoder(GUID_ContainerFormatPng, nullptr, &encoder)) ||
        FAILED(encoder->Initialize(stream.Get(), WICBitmapEncoderNoCache)) ||
        FAILED(encoder->CreateNewFrame(&frame, nullptr)) ||
        FAILED(frame->Initialize(nullptr)) || FAILED(frame->SetSize(width, height))) return false;
    auto format = GUID_WICPixelFormat32bppBGRA;
    if (FAILED(frame->SetPixelFormat(&format)) || FAILED(frame->WriteSource(scaler.Get(), nullptr)) ||
        FAILED(frame->Commit()) || FAILED(encoder->Commit())) return false;
    STATSTG stat{};
    HGLOBAL memory{};
    if (FAILED(stream->Stat(&stat, STATFLAG_NONAME)) || FAILED(GetHGlobalFromStream(stream.Get(), &memory))) return false;
    auto bytes = static_cast<BYTE*>(GlobalLock(memory));
    if (!bytes) return false;
    const auto data = base64(bytes, static_cast<size_t>(stat.cbSize.QuadPart));
    GlobalUnlock(memory);
    std::cout << "{\"event\":\"preview-frame\",\"sourceWidth\":" << desc.Width
              << ",\"sourceHeight\":" << desc.Height << ",\"imageDataUrl\":\"data:image/png;base64,"
              << data << "\"}" << std::endl;
    return true;
}

} // namespace

int runPreview(WgcSession& session, int fps, HWND sourceWindow, bool captureCursor) {
    struct PreviewState {
        ComPtr<IWICImagingFactory> factory;
        ComPtr<ID3D11Texture2D> staging;
        std::mutex mutex;
        std::atomic<bool> closing = false;
        std::atomic<bool> failed = false;
        std::chrono::steady_clock::time_point previous = std::chrono::steady_clock::time_point::min();
        std::unique_ptr<PopupOverlayCapture> popupOverlayCapture;
    };
    auto state = std::make_shared<PreviewState>();
    if (FAILED(CoCreateInstance(CLSID_WICImagingFactory, nullptr, CLSCTX_INPROC_SERVER,
        IID_PPV_ARGS(&state->factory)))) return 1;
    if (sourceWindow) {
        state->popupOverlayCapture = std::make_unique<PopupOverlayCapture>();
        if (!state->popupOverlayCapture->initialize(sourceWindow, fps, captureCursor) ||
            !state->popupOverlayCapture->start()) {
            state->popupOverlayCapture.reset();
        }
    }
    const auto interval = std::chrono::milliseconds(1000 / std::clamp(fps, 1, 15));
    session.setFrameCallback([&session, state, interval](ID3D11Texture2D* texture, int64_t) {
        std::scoped_lock lock(state->mutex);
        if (state->closing || state->failed) return;
        const auto now = std::chrono::steady_clock::now();
        if (state->previous != std::chrono::steady_clock::time_point::min() && now - state->previous < interval) return;
        state->previous = now;
        try {
            if (!writePreviewFrame(session, state->factory.Get(), texture, state->staging,
                    state->popupOverlayCapture.get())) state->failed = true;
        } catch (...) { state->failed = true; }
    });
    if (!session.start()) {
        if (state->popupOverlayCapture) state->popupOverlayCapture->stop();
        session.setFrameCallback(nullptr);
        session.stop();
        return 1;
    }

    // The preview has a pipe command channel, no encoder, audio, camera, or output file.
    const HANDLE input = GetStdHandle(STD_INPUT_HANDLE);
    std::string command;
    while (!state->failed) {
        if (sourceWindow && !IsWindow(sourceWindow)) break;
        DWORD available = 0;
        if (!PeekNamedPipe(input, nullptr, 0, nullptr, &available, nullptr)) break;
        if (available) {
            char buffer[256];
            DWORD count = 0;
            if (!ReadFile(input, buffer, std::min<DWORD>(available, sizeof(buffer)), &count, nullptr)) break;
            command.append(buffer, count);
            if (command.find("stop\n") != std::string::npos || command.find("quit\n") != std::string::npos) break;
            if (command.size() > 4096) command.clear();
        }
        Sleep(20);
    }
    state->closing = true;
    session.setFrameCallback(nullptr);
    {
        std::scoped_lock lock(state->mutex);
    }
    session.stop();
    if (state->popupOverlayCapture) state->popupOverlayCapture->stop();
    return state->failed ? 1 : 0;
}

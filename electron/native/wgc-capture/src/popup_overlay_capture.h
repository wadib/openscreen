#pragma once

#include "wgc_session.h"

#include <Windows.h>
#include <d3d11.h>
#include <wrl/client.h>

#include <mutex>
#include <vector>

struct PopupOverlayFrame {
    std::vector<BYTE> data;
    int width = 0;
    int height = 0;
    int destinationX = 0;
    int destinationY = 0;
};

class PopupOverlayCapture {
public:
    PopupOverlayCapture() = default;
    ~PopupOverlayCapture();

    PopupOverlayCapture(const PopupOverlayCapture&) = delete;
    PopupOverlayCapture& operator=(const PopupOverlayCapture&) = delete;

    bool initialize(HWND targetWindow, int fps, bool captureCursor);
    bool start();
    void stop();
    bool copyOverlays(int outputWidth, int outputHeight, std::vector<PopupOverlayFrame>& overlays);

private:
    bool ensureStagingTexture(ID3D11Texture2D* texture);

    HWND targetWindow_ = nullptr;
    HMONITOR monitor_ = nullptr;
    WgcSession session_;
    std::mutex frameMutex_;
    Microsoft::WRL::ComPtr<ID3D11Texture2D> latestFrameTexture_;
    Microsoft::WRL::ComPtr<ID3D11Texture2D> stagingTexture_;
    bool started_ = false;
    bool reportedActive_ = false;
};

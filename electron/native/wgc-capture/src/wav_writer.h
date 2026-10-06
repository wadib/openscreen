#pragma once

#include "wasapi_loopback_capture.h"

#include <cstddef>
#include <cstdint>
#include <fstream>
#include <string>

class WavWriter {
public:
    bool open(const std::wstring& path, const AudioInputFormat& format);
    bool write(const BYTE* data, DWORD byteCount);
    bool finalize();

    ~WavWriter();

private:
    void writeHeader(uint32_t dataSize);

    std::ofstream stream_;
    AudioInputFormat format_{};
    uint64_t dataBytes_ = 0;
    bool finalized_ = false;
};

#include "wav_writer.h"

#include <algorithm>
#include <filesystem>
#include <limits>

namespace {

template <typename T>
void writeValue(std::ofstream& stream, T value) {
    stream.write(reinterpret_cast<const char*>(&value), sizeof(value));
}

} // namespace

WavWriter::~WavWriter() {
    finalize();
}

bool WavWriter::open(const std::wstring& path, const AudioInputFormat& format) {
    if (path.empty() || format.sampleRate == 0 || format.channels == 0 ||
        format.bitsPerSample != 16 || format.subtype != MFAudioFormat_PCM) {
        return false;
    }

    stream_.open(std::filesystem::path(path), std::ios::binary | std::ios::trunc);
    if (!stream_) {
        return false;
    }

    format_ = format;
    dataBytes_ = 0;
    finalized_ = false;
    writeHeader(0);
    return stream_.good();
}

bool WavWriter::write(const BYTE* data, DWORD byteCount) {
    if (!stream_ || finalized_ || !data || byteCount == 0) {
        return byteCount == 0;
    }

    if (dataBytes_ + byteCount > std::numeric_limits<uint32_t>::max()) {
        return false;
    }

    stream_.write(reinterpret_cast<const char*>(data), byteCount);
    if (!stream_) {
        return false;
    }
    dataBytes_ += byteCount;
    return true;
}

bool WavWriter::finalize() {
    if (finalized_) {
        return true;
    }
    if (!stream_.is_open()) {
        return false;
    }

    stream_.seekp(0, std::ios::beg);
    writeHeader(static_cast<uint32_t>(dataBytes_));
    stream_.flush();
    const bool succeeded = stream_.good();
    stream_.close();
    finalized_ = succeeded;
    return succeeded;
}

void WavWriter::writeHeader(uint32_t dataSize) {
    const uint16_t audioFormat = 1;
    const uint16_t channels = static_cast<uint16_t>(format_.channels);
    const uint32_t sampleRate = format_.sampleRate;
    const uint16_t bitsPerSample = static_cast<uint16_t>(format_.bitsPerSample);
    const uint16_t blockAlign = static_cast<uint16_t>(channels * bitsPerSample / 8);
    const uint32_t byteRate = sampleRate * blockAlign;
    const uint32_t riffSize = 36 + dataSize;
    const uint32_t formatSize = 16;

    stream_.write("RIFF", 4);
    writeValue(stream_, riffSize);
    stream_.write("WAVE", 4);
    stream_.write("fmt ", 4);
    writeValue(stream_, formatSize);
    writeValue(stream_, audioFormat);
    writeValue(stream_, channels);
    writeValue(stream_, sampleRate);
    writeValue(stream_, byteRate);
    writeValue(stream_, blockAlign);
    writeValue(stream_, bitsPerSample);
    stream_.write("data", 4);
    writeValue(stream_, dataSize);
}

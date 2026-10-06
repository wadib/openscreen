#include "audio_sample_utils.h"
#include "capture_clock.h"

#include <mfapi.h>

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstring>
#include <limits>
#include <iostream>

namespace {

bool isFloatFormat(const AudioInputFormat& format) {
    return format.subtype == MFAudioFormat_Float && format.bitsPerSample == 32;
}

bool isPcmFormat(const AudioInputFormat& format, UINT32 bitsPerSample) {
    return format.subtype == MFAudioFormat_PCM && format.bitsPerSample == bitsPerSample;
}

template <typename T>
T clampTo(double value) {
    const double minValue = static_cast<double>(std::numeric_limits<T>::min());
    const double maxValue = static_cast<double>(std::numeric_limits<T>::max());
    return static_cast<T>(std::clamp(std::round(value), minValue, maxValue));
}

size_t bytesPerSample(const AudioInputFormat& format) {
    return format.bitsPerSample / 8;
}

double readSampleAsDouble(const BYTE* source, const AudioInputFormat& format, size_t frameIndex, UINT32 channelIndex) {
    if (!source || format.blockAlign == 0 || channelIndex >= format.channels) {
        return 0.0;
    }

    const size_t offset = frameIndex * format.blockAlign + channelIndex * bytesPerSample(format);
    if (isFloatFormat(format)) {
        return static_cast<double>(*reinterpret_cast<const float*>(source + offset));
    }
    if (isPcmFormat(format, 16)) {
        return static_cast<double>(*reinterpret_cast<const int16_t*>(source + offset)) / 32768.0;
    }
    if (isPcmFormat(format, 32)) {
        return static_cast<double>(*reinterpret_cast<const int32_t*>(source + offset)) / 2147483648.0;
    }
    return 0.0;
}

void writeSampleFromDouble(BYTE* destination, const AudioInputFormat& format, size_t frameIndex, UINT32 channelIndex, double value) {
    if (!destination || format.blockAlign == 0 || channelIndex >= format.channels) {
        return;
    }

    const double clamped = std::clamp(value, -1.0, 1.0);
    const size_t offset = frameIndex * format.blockAlign + channelIndex * bytesPerSample(format);
    if (isFloatFormat(format)) {
        *reinterpret_cast<float*>(destination + offset) = static_cast<float>(clamped);
        return;
    }
    if (isPcmFormat(format, 16)) {
        *reinterpret_cast<int16_t*>(destination + offset) = clampTo<int16_t>(clamped * 32767.0);
        return;
    }
    if (isPcmFormat(format, 32)) {
        *reinterpret_cast<int32_t*>(destination + offset) = clampTo<int32_t>(clamped * 2147483647.0);
    }
}

double readMappedChannel(const BYTE* source, const AudioInputFormat& format, size_t frameIndex, UINT32 targetChannel, UINT32 targetChannels) {
    if (format.channels == 0) {
        return 0.0;
    }
    if (format.channels == targetChannels && targetChannel < format.channels) {
        return readSampleAsDouble(source, format, frameIndex, targetChannel);
    }
    if (format.channels == 1) {
        return readSampleAsDouble(source, format, frameIndex, 0);
    }
    if (targetChannels == 1) {
        double sum = 0.0;
        for (UINT32 channel = 0; channel < format.channels; ++channel) {
            sum += readSampleAsDouble(source, format, frameIndex, channel);
        }
        return sum / static_cast<double>(format.channels);
    }
    return readSampleAsDouble(source, format, frameIndex, std::min(targetChannel, format.channels - 1));
}

double peakAudioLevel(const BYTE* source, DWORD byteCount, const AudioInputFormat& format) {
    if (!source || byteCount == 0 || format.blockAlign == 0 || format.channels == 0) {
        return 0.0;
    }

    const size_t frameCount = byteCount / format.blockAlign;
    double peak = 0.0;
    for (size_t frame = 0; frame < frameCount; ++frame) {
        for (UINT32 channel = 0; channel < format.channels; ++channel) {
            peak = std::max(peak, std::abs(readSampleAsDouble(source, format, frame, channel)));
        }
    }
    return peak;
}

} // namespace

constexpr int64_t HnsPerSecond = 10'000'000;

bool sameAudioFormatForMixing(const AudioInputFormat& left, const AudioInputFormat& right) {
    return left.subtype == right.subtype &&
           left.sampleRate == right.sampleRate &&
           left.channels == right.channels &&
           left.bitsPerSample == right.bitsPerSample &&
           left.blockAlign == right.blockAlign &&
           left.avgBytesPerSec == right.avgBytesPerSec;
}

AudioInputFormat makeAacCompatibleAudioFormat(const AudioInputFormat& source) {
    AudioInputFormat format{};
    format.subtype = MFAudioFormat_PCM;
    format.sampleRate = source.sampleRate > 0 ? source.sampleRate : 48000;
    format.channels = 2;
    format.bitsPerSample = 16;
    format.blockAlign = format.channels * (format.bitsPerSample / 8);
    format.avgBytesPerSec = format.sampleRate * format.blockAlign;
    return format;
}

void copyAudioWithGain(
    const BYTE* source,
    DWORD byteCount,
    const AudioInputFormat& format,
    double gain,
    std::vector<BYTE>& destination) {
    destination.resize(byteCount);
    if (!source || byteCount == 0) {
        std::fill(destination.begin(), destination.end(), static_cast<BYTE>(0));
        return;
    }

    if (std::abs(gain - 1.0) < 0.0001) {
        std::memcpy(destination.data(), source, byteCount);
        return;
    }

    if (isFloatFormat(format)) {
        const auto* input = reinterpret_cast<const float*>(source);
        auto* output = reinterpret_cast<float*>(destination.data());
        const size_t sampleCount = byteCount / sizeof(float);
        for (size_t index = 0; index < sampleCount; index += 1) {
            output[index] = static_cast<float>(std::clamp(input[index] * gain, -1.0, 1.0));
        }
        return;
    }

    if (isPcmFormat(format, 16)) {
        const auto* input = reinterpret_cast<const int16_t*>(source);
        auto* output = reinterpret_cast<int16_t*>(destination.data());
        const size_t sampleCount = byteCount / sizeof(int16_t);
        for (size_t index = 0; index < sampleCount; index += 1) {
            output[index] = clampTo<int16_t>(static_cast<double>(input[index]) * gain);
        }
        return;
    }

    if (isPcmFormat(format, 32)) {
        const auto* input = reinterpret_cast<const int32_t*>(source);
        auto* output = reinterpret_cast<int32_t*>(destination.data());
        const size_t sampleCount = byteCount / sizeof(int32_t);
        for (size_t index = 0; index < sampleCount; index += 1) {
            output[index] = clampTo<int32_t>(static_cast<double>(input[index]) * gain);
        }
        return;
    }

    std::memcpy(destination.data(), source, byteCount);
}

void convertAudioWithGain(
    const BYTE* source,
    DWORD byteCount,
    const AudioInputFormat& sourceFormat,
    const AudioInputFormat& targetFormat,
    double gain,
    std::vector<BYTE>& destination) {
    if (!source || byteCount == 0 || sourceFormat.blockAlign == 0 || targetFormat.blockAlign == 0 ||
        sourceFormat.sampleRate == 0 || targetFormat.sampleRate == 0 || sourceFormat.channels == 0 ||
        targetFormat.channels == 0) {
        destination.clear();
        return;
    }

    if (sameAudioFormatForMixing(sourceFormat, targetFormat)) {
        copyAudioWithGain(source, byteCount, targetFormat, gain, destination);
        return;
    }

    const size_t sourceFrames = byteCount / sourceFormat.blockAlign;
    if (sourceFrames == 0) {
        destination.clear();
        return;
    }

    const double rateRatio = static_cast<double>(targetFormat.sampleRate) /
        static_cast<double>(sourceFormat.sampleRate);
    const size_t targetFrames = std::max<size_t>(1, static_cast<size_t>(std::llround(sourceFrames * rateRatio)));
    destination.assign(targetFrames * targetFormat.blockAlign, 0);

	for (size_t targetFrame = 0; targetFrame < targetFrames; ++targetFrame) {
		const double sourcePosition = static_cast<double>(targetFrame) / rateRatio;
		const size_t sourceFrame = std::min(sourceFrames - 1, static_cast<size_t>(sourcePosition));
		const size_t nextSourceFrame = std::min(sourceFrames - 1, sourceFrame + 1);
		const double fraction = sourcePosition - static_cast<double>(sourceFrame);
		for (UINT32 channel = 0; channel < targetFormat.channels; ++channel) {
			const double first = readMappedChannel(
				source,
				sourceFormat,
				sourceFrame,
				channel,
				targetFormat.channels);
			const double second = readMappedChannel(
				source,
				sourceFormat,
				nextSourceFrame,
				channel,
				targetFormat.channels);
			const double sample = first + (second - first) * fraction;
			writeSampleFromDouble(destination.data(), targetFormat, targetFrame, channel, sample * gain);
        }
    }
}

void mixAudioInPlace(
    std::vector<BYTE>& destination,
    const BYTE* source,
    DWORD byteCount,
    const AudioInputFormat& format) {
    if (!source || byteCount == 0 || destination.empty()) {
        return;
    }

    const size_t mixByteCount = std::min(destination.size(), static_cast<size_t>(byteCount));

    if (isFloatFormat(format)) {
        auto* output = reinterpret_cast<float*>(destination.data());
        const auto* input = reinterpret_cast<const float*>(source);
        const size_t sampleCount = mixByteCount / sizeof(float);
        for (size_t index = 0; index < sampleCount; index += 1) {
            output[index] = static_cast<float>(std::clamp(output[index] + input[index], -1.0f, 1.0f));
        }
        return;
    }

    if (isPcmFormat(format, 16)) {
        auto* output = reinterpret_cast<int16_t*>(destination.data());
        const auto* input = reinterpret_cast<const int16_t*>(source);
        const size_t sampleCount = mixByteCount / sizeof(int16_t);
        for (size_t index = 0; index < sampleCount; index += 1) {
            output[index] = clampTo<int16_t>(
                static_cast<double>(output[index]) + static_cast<double>(input[index]));
        }
        return;
    }

    if (isPcmFormat(format, 32)) {
        auto* output = reinterpret_cast<int32_t*>(destination.data());
        const auto* input = reinterpret_cast<const int32_t*>(source);
        const size_t sampleCount = mixByteCount / sizeof(int32_t);
        for (size_t index = 0; index < sampleCount; index += 1) {
            output[index] = clampTo<int32_t>(
                static_cast<double>(output[index]) + static_cast<double>(input[index]));
        }
    }
}

void MicrophoneAutomaticGain::reset() {
    gain_ = 1.0;
}

double MicrophoneAutomaticGain::update(
    const BYTE* source,
    DWORD byteCount,
    const AudioInputFormat& format,
    double manualGain) {
    constexpr double NoiseGatePeak = 0.0005; // Roughly -66 dBFS.
    constexpr double TargetPeak = 0.35;      // Roughly -9 dBFS.
    constexpr double MaximumGain = 64.0;     // +36 dB, with sample limiting downstream.

    if (manualGain <= 0.0) {
        return 1.0;
    }

    const double peak = peakAudioLevel(source, byteCount, format);
    if (!std::isfinite(peak) || peak < NoiseGatePeak) {
        return gain_;
    }

    const double desiredGain = std::clamp(TargetPeak / (peak * manualGain), 1.0, MaximumGain);
    if (desiredGain < gain_) {
        // Reduce immediately when the input gets louder so the limiter is rarely needed.
        gain_ = desiredGain;
    } else {
        // Raise smoothly to avoid audible pumping on quiet speech.
        gain_ = std::min(desiredGain, gain_ * 1.08 + 0.02);
    }
    return gain_;
}

double MicrophoneAutomaticGain::gain() const {
    return gain_;
}

void TimestampedAudioQueue::clear() {
    packets_.clear();
}

void TimestampedAudioQueue::append(std::vector<BYTE> data, int64_t firstFrame, uint32_t blockAlign) {
    if (data.empty() || blockAlign == 0) return;
    Packet packet{firstFrame, std::move(data)};
    const auto position = std::upper_bound(packets_.begin(), packets_.end(), firstFrame,
        [](int64_t frame, const Packet& candidate) { return frame < candidate.firstFrame; });
    packets_.insert(position, std::move(packet));
}

void TimestampedAudioQueue::read(
    std::vector<BYTE>& chunk, int64_t firstFrame, uint32_t frames, uint32_t blockAlign) {
    chunk.assign(static_cast<size_t>(frames) * blockAlign, 0);
    const int64_t endFrame = firstFrame + frames;
    while (!packets_.empty()) {
        const auto& packet = packets_.front();
        const int64_t packetEnd = packet.firstFrame + static_cast<int64_t>(packet.data.size() / blockAlign);
        if (packet.firstFrame >= endFrame) break;
        const int64_t overlapStart = std::max(firstFrame, packet.firstFrame);
        const int64_t overlapEnd = std::min(endFrame, packetEnd);
        if (overlapEnd > overlapStart) {
            std::memcpy(chunk.data() + (overlapStart - firstFrame) * blockAlign,
                packet.data.data() + (overlapStart - packet.firstFrame) * blockAlign,
                static_cast<size_t>(overlapEnd - overlapStart) * blockAlign);
        }
        if (packetEnd > endFrame) break;
        packets_.pop_front();
    }
}

AudioMixer::AudioMixer(
    const AudioInputFormat& format,
    const AudioInputFormat& systemFormat,
    const AudioInputFormat& microphoneFormat,
    bool includeSystem,
    bool includeMicrophone,
    double microphoneGain,
    OutputCallback output,
    bool automaticMicrophoneGain)
    : format_(format),
      systemFormat_(systemFormat),
      microphoneFormat_(microphoneFormat),
      includeSystem_(includeSystem),
      includeMicrophone_(includeMicrophone),
      microphoneGain_(microphoneGain),
      automaticMicrophoneGain_(automaticMicrophoneGain),
      output_(std::move(output)) {}

AudioMixer::~AudioMixer() {
    stop();
}

bool AudioMixer::start() {
    if (!output_ || format_.sampleRate == 0 || format_.blockAlign == 0) {
        return false;
    }

    stopRequested_ = false;
    emittedFrames_ = 0;
    stopAtFrames_ = 0;
    packetCount_ = 0;
    discardedPacketCount_ = 0;
    maxDeliveryHns_ = 0;
    timelineStarted_ = false;
    paused_ = false;
    thread_ = std::thread([this] {
        mixLoop();
    });
    return true;
}

void AudioMixer::beginTimeline(int64_t epochHns) {
    {
        std::scoped_lock lock(mutex_);
        systemQueue_.clear();
        microphoneQueue_.clear();
        systemTimeline_ = {};
        microphoneTimeline_ = {};
        microphoneAutomaticGain_.reset();
        emittedFrames_ = 0;
        epochHns_ = epochHns > 0 ? epochHns : captureClockHns();
        activeStartHns_ = epochHns_;
        pausedHns_ = 0;
        clockStart_ = std::chrono::steady_clock::now() -
            std::chrono::nanoseconds((captureClockHns() - epochHns_) * 100);
        timelineStarted_ = true;
    }
    cv_.notify_all();
}

void AudioMixer::setPaused(bool paused, int64_t transitionHns) {
    {
        std::scoped_lock lock(mutex_);
        if (paused_ == paused) return;
        const int64_t boundaryHns = transitionHns > 0 ? transitionHns : captureClockHns();
        paused_ = paused;
        if (paused_) {
            pauseStartHns_ = boundaryHns;
        } else {
            activeStartHns_ = boundaryHns;
            pausedHns_ += activeStartHns_ - pauseStartHns_;
            // Keep audio already captured before pause. Only reset packet continuity
            // so the first post-resume packet starts from its device timestamp.
            systemTimeline_ = {};
            microphoneTimeline_ = {};
        }
    }
    cv_.notify_all();
}

void AudioMixer::stop() {
    {
        std::scoped_lock lock(mutex_);
        if (timelineStarted_ && !stopRequested_) {
            const int64_t endHns = paused_ ? pauseStartHns_ : captureClockHns();
            stopAtFrames_ = static_cast<uint64_t>(std::max<int64_t>(0, endHns - epochHns_ - pausedHns_)) *
                format_.sampleRate / HnsPerSecond;
        }
        stopRequested_ = true;
    }
    cv_.notify_all();
    if (thread_.joinable()) {
        thread_.join();
        std::cerr << "{\"event\":\"audio-timing\",\"packets\":" << packetCount_
                  << ",\"discardedPackets\":" << discardedPacketCount_
                  << ",\"maxDeliveryMs\":" << maxDeliveryHns_ / 10000
                  << ",\"microphoneAutoGain\":" << microphoneAutomaticGain_.gain()
                  << ",\"lookaheadMs\":250}" << std::endl;
    }
}

void AudioMixer::pushSystem(const BYTE* data, DWORD byteCount, int64_t timestampHns) {
    if (!includeSystem_ || stopRequested_) {
        return;
    }

    {
        std::scoped_lock lock(mutex_);
        if (paused_ || !timelineStarted_) {
            return;
        }
        append(systemQueue_, systemTimeline_, data, byteCount, systemFormat_, 1.0, timestampHns);
    }
    cv_.notify_all();
}

void AudioMixer::pushMicrophone(const BYTE* data, DWORD byteCount, int64_t timestampHns) {
    if (!includeMicrophone_ || stopRequested_) {
        return;
    }

    {
        std::scoped_lock lock(mutex_);
        if (paused_ || !timelineStarted_) {
            return;
        }
        const double automaticGain = automaticMicrophoneGain_
            ? microphoneAutomaticGain_.update(data, byteCount, microphoneFormat_, microphoneGain_)
            : 1.0;
        append(
            microphoneQueue_,
            microphoneTimeline_,
            data,
            byteCount,
            microphoneFormat_,
            microphoneGain_ * automaticGain,
            timestampHns);
    }
    cv_.notify_all();
}

void AudioMixer::append(
    TimestampedAudioQueue& queue,
    StreamTimeline& timeline,
    const BYTE* data,
    DWORD byteCount,
    const AudioInputFormat& sourceFormat,
    double gain,
    int64_t timestampHns) {
    if (!data || byteCount == 0) {
        return;
    }

    convertAudioWithGain(data, byteCount, sourceFormat, format_, gain, gainBuffer_);
    ++packetCount_;
    maxDeliveryHns_ = std::max(maxDeliveryHns_, captureClockHns() - timestampHns);
    const int64_t timestampFrame = static_cast<int64_t>(std::llround(
        static_cast<double>(timestampHns - epochHns_ - pausedHns_) * format_.sampleRate / HnsPerSecond));
    int64_t firstFrame = timestampFrame;
    const int64_t jitterToleranceFrames = std::max<int64_t>(1, format_.sampleRate / 200);
    if (timeline.initialized && std::abs(timestampFrame - timeline.nextFrame) <= jitterToleranceFrames) {
        // WASAPI QPC timestamps can jitter by a few frames. Normal packets are contiguous;
        // treating that jitter as gaps or overlaps creates a click at every packet boundary.
        firstFrame = timeline.nextFrame;
    }
    timeline.initialized = true;
    const int64_t packetFrames = static_cast<int64_t>(gainBuffer_.size() / format_.blockAlign);
    timeline.nextFrame = firstFrame + packetFrames;

    // Keep genuine device gaps as timeline gaps, not queued silence after silence was already emitted.
    const int64_t activeFrame = static_cast<int64_t>(std::llround(
        static_cast<double>(activeStartHns_ - epochHns_ - pausedHns_) * format_.sampleRate / HnsPerSecond));
    const int64_t keepFrom = std::max<int64_t>(emittedFrames_, activeFrame);
    if (firstFrame + packetFrames <= keepFrom || firstFrame > keepFrom + format_.sampleRate * 2LL) {
        ++discardedPacketCount_;
        return;
    }
    if (firstFrame < keepFrom) {
        gainBuffer_.erase(gainBuffer_.begin(),
            gainBuffer_.begin() + static_cast<std::ptrdiff_t>((keepFrom - firstFrame) * format_.blockAlign));
    }
    queue.append(gainBuffer_, std::max(firstFrame, keepFrom), format_.blockAlign);
}

void AudioMixer::mixLoop() {
    const uint32_t chunkFrames = std::max<uint32_t>(1, format_.sampleRate / 100);
    const size_t chunkBytes = static_cast<size_t>(chunkFrames) * format_.blockAlign;
    std::vector<BYTE> mixedChunk;
    std::vector<BYTE> sourceChunk;
    int64_t timestampHns = 0;

    while (true) {
        {
            std::unique_lock lock(mutex_);
            cv_.wait(lock, [&] { return stopRequested_.load() || (timelineStarted_ && !paused_); });

            if (stopRequested_ && emittedFrames_ >= stopAtFrames_) {
                break;
            }
            // A fixed look-ahead absorbs normal WASAPI delivery latency without shifting MP4 timestamps.
            const auto nextDeadline = clockStart_ + std::chrono::milliseconds(250) +
                std::chrono::nanoseconds(pausedHns_ * 100) +
                std::chrono::duration_cast<std::chrono::steady_clock::duration>(
                    std::chrono::duration<double>(static_cast<double>(emittedFrames_) / format_.sampleRate));
            cv_.wait_until(lock, nextDeadline, [&] { return stopRequested_.load() || paused_; });
            if (stopRequested_ && emittedFrames_ >= stopAtFrames_) {
                break;
            }
            if (paused_ && !stopRequested_) {
                continue;
            }
            // Loopback devices may deliver no packets during silence. The MP4 audio
            // clock must still advance or its sink can block video indefinitely.
            mixedChunk.assign(chunkBytes, 0);
            if (includeSystem_) {
                systemQueue_.read(sourceChunk, emittedFrames_, chunkFrames, format_.blockAlign);
                mixAudioInPlace(mixedChunk, sourceChunk.data(), static_cast<DWORD>(sourceChunk.size()), format_);
            }
            if (includeMicrophone_) {
                microphoneQueue_.read(sourceChunk, emittedFrames_, chunkFrames, format_.blockAlign);
                mixAudioInPlace(mixedChunk, sourceChunk.data(), static_cast<DWORD>(sourceChunk.size()), format_);
            }
            timestampHns = static_cast<int64_t>((emittedFrames_ * HnsPerSecond) / format_.sampleRate);
            emittedFrames_ += chunkFrames;
        }
        const int64_t durationHns =
            static_cast<int64_t>((static_cast<uint64_t>(chunkFrames) * HnsPerSecond) / format_.sampleRate);
        if (!output_(mixedChunk.data(), static_cast<DWORD>(mixedChunk.size()), timestampHns, durationHns)) {
            stopRequested_ = true;
            break;
        }
    }
}

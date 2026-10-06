#pragma once

#include "mf_encoder.h"

#include <Windows.h>

#include <atomic>
#include <condition_variable>
#include <chrono>
#include <cstdint>
#include <deque>
#include <functional>
#include <mutex>
#include <thread>
#include <vector>

bool sameAudioFormatForMixing(const AudioInputFormat& left, const AudioInputFormat& right);
AudioInputFormat makeAacCompatibleAudioFormat(const AudioInputFormat& source);
void copyAudioWithGain(
    const BYTE* source,
    DWORD byteCount,
    const AudioInputFormat& format,
    double gain,
    std::vector<BYTE>& destination);
void convertAudioWithGain(
    const BYTE* source,
    DWORD byteCount,
    const AudioInputFormat& sourceFormat,
    const AudioInputFormat& targetFormat,
    double gain,
    std::vector<BYTE>& destination);
void mixAudioInPlace(
    std::vector<BYTE>& destination,
    const BYTE* source,
    DWORD byteCount,
    const AudioInputFormat& format);

class MicrophoneAutomaticGain {
public:
    void reset();
    double update(
        const BYTE* source,
        DWORD byteCount,
        const AudioInputFormat& format,
        double manualGain);
    double gain() const;

private:
    double gain_ = 1.0;
};

class TimestampedAudioQueue {
public:
    void clear();
    void append(std::vector<BYTE> data, int64_t firstFrame, uint32_t blockAlign);
    void read(std::vector<BYTE>& chunk, int64_t firstFrame, uint32_t frames, uint32_t blockAlign);

private:
    struct Packet {
        int64_t firstFrame;
        std::vector<BYTE> data;
    };
    std::deque<Packet> packets_;
};

class AudioMixer {
public:
    using OutputCallback = std::function<bool(const BYTE* data, DWORD byteCount, int64_t timestampHns, int64_t durationHns)>;

    AudioMixer(
        const AudioInputFormat& format,
        const AudioInputFormat& systemFormat,
        const AudioInputFormat& microphoneFormat,
        bool includeSystem,
        bool includeMicrophone,
        double microphoneGain,
        OutputCallback output,
        bool automaticMicrophoneGain = false);
    ~AudioMixer();

    AudioMixer(const AudioMixer&) = delete;
    AudioMixer& operator=(const AudioMixer&) = delete;

    bool start();
    void beginTimeline(int64_t epochHns = 0);
    void setPaused(bool paused, int64_t transitionHns = 0);
    void stop();
    void pushSystem(const BYTE* data, DWORD byteCount, int64_t timestampHns);
    void pushMicrophone(const BYTE* data, DWORD byteCount, int64_t timestampHns);

private:
    struct StreamTimeline {
        bool initialized = false;
        int64_t nextFrame = 0;
    };

    void append(
        TimestampedAudioQueue& queue,
        StreamTimeline& timeline,
        const BYTE* data,
        DWORD byteCount,
        const AudioInputFormat& sourceFormat,
        double gain,
        int64_t timestampHns);
    void mixLoop();

    AudioInputFormat format_{};
    AudioInputFormat systemFormat_{};
    AudioInputFormat microphoneFormat_{};
    bool includeSystem_ = false;
    bool includeMicrophone_ = false;
    double microphoneGain_ = 1.0;
    bool automaticMicrophoneGain_ = false;
    MicrophoneAutomaticGain microphoneAutomaticGain_;
    OutputCallback output_;
    std::mutex mutex_;
    std::condition_variable cv_;
    TimestampedAudioQueue systemQueue_;
    TimestampedAudioQueue microphoneQueue_;
    StreamTimeline systemTimeline_;
    StreamTimeline microphoneTimeline_;
    std::vector<BYTE> gainBuffer_;
    std::thread thread_;
    std::atomic<bool> stopRequested_ = false;
    bool timelineStarted_ = false;
    bool paused_ = false;
    uint64_t emittedFrames_ = 0;
    int64_t epochHns_ = 0;
    int64_t activeStartHns_ = 0;
    int64_t pauseStartHns_ = 0;
    int64_t pausedHns_ = 0;
    uint64_t stopAtFrames_ = 0;
    uint64_t packetCount_ = 0;
    uint64_t discardedPacketCount_ = 0;
    int64_t maxDeliveryHns_ = 0;
    std::chrono::steady_clock::time_point clockStart_;
};

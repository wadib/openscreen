#include "../src/audio_sample_utils.h"
#include "../src/capture_clock.h"

#include <algorithm>
#include <chrono>
#include <iostream>
#include <stdexcept>
#include <thread>

using namespace std::chrono_literals;

void require(bool condition, const char* message) {
    if (!condition) throw std::runtime_error(message);
}

int main() {
    try {
        TimestampedAudioQueue queue;
        std::vector<BYTE> chunk;
        // Sparse markers over a simulated half hour must not slide forward after silent gaps.
        for (int second = 0; second <= 1800; second += 10) {
            const int64_t frame = second * 48000LL;
            queue.read(chunk, frame - 480, 480, 4);
            require(std::all_of(chunk.begin(), chunk.end(), [](BYTE b) { return b == 0; }),
                "Missing device packets did not leave silence");
            queue.append(std::vector<BYTE>(1920, 17), frame, 4);
            queue.read(chunk, frame, 480, 4);
            require(std::all_of(chunk.begin(), chunk.end(), [](BYTE b) { return b == 17; }),
                "Marker drifted after a device silence gap");
        }
        queue.append(std::vector<BYTE>(1920, 29), 0, 4);
        queue.append(std::vector<BYTE>(1920, 31), 48000, 4);
        queue.read(chunk, 48000, 480, 4);
        require(std::all_of(chunk.begin(), chunk.end(), [](BYTE b) { return b == 31; }),
            "Late stale packet shifted current audio");
        queue.clear();
        queue.append(std::vector<BYTE>(1920, 37), 240, 4);
        queue.read(chunk, 0, 480, 4);
        require(chunk.front() == 0 && chunk[959] == 0 && chunk[960] == 37,
            "Partial packet was not placed at its timestamp");
        queue.read(chunk, 480, 480, 4);
        require(chunk.front() == 37 && chunk[959] == 37 && chunk[960] == 0,
            "Partial packet continuation misplaced");
        AudioInputFormat format{};
        format.subtype = MFAudioFormat_PCM;
        format.sampleRate = 48000;
        format.channels = 2;
        format.bitsPerSample = 16;
        format.blockAlign = 4;
        format.avgBytesPerSec = 192000;
        AudioInputFormat floatStereo = format;
        floatStereo.subtype = MFAudioFormat_Float;
        floatStereo.bitsPerSample = 32;
        floatStereo.blockAlign = 8;
        floatStereo.avgBytesPerSec = 384000;
        std::vector<float> quietSpeech(480 * 2, 0.0f);
        for (size_t frame = 0; frame < quietSpeech.size() / 2; ++frame) {
            quietSpeech[frame * 2 + 1] = frame % 2 == 0 ? 0.003f : -0.003f;
        }
        MicrophoneAutomaticGain automaticGain;
        for (int packet = 0; packet < 100; ++packet) {
            automaticGain.update(
                reinterpret_cast<const BYTE*>(quietSpeech.data()),
                static_cast<DWORD>(quietSpeech.size() * sizeof(float)),
                floatStereo,
                1.0);
        }
        require(automaticGain.gain() > 20.0 && automaticGain.gain() <= 64.0,
            "Quiet speech was not raised into an audible range");
        std::fill(quietSpeech.begin(), quietSpeech.end(), 0.0001f);
        automaticGain.reset();
        for (int packet = 0; packet < 100; ++packet) {
            automaticGain.update(
                reinterpret_cast<const BYTE*>(quietSpeech.data()),
                static_cast<DWORD>(quietSpeech.size() * sizeof(float)),
                floatStereo,
                1.0);
        }
        require(automaticGain.gain() == 1.0,
            "The microphone noise gate amplified a near-silent endpoint");
        std::fill(quietSpeech.begin(), quietSpeech.end(), 0.8f);
        automaticGain.update(
            reinterpret_cast<const BYTE*>(quietSpeech.data()),
            static_cast<DWORD>(quietSpeech.size() * sizeof(float)),
            floatStereo,
            1.0);
        require(automaticGain.gain() == 1.0,
            "Automatic microphone gain did not release immediately for loud input");
        AudioInputFormat lowRateMono = format;
        lowRateMono.sampleRate = 2;
        lowRateMono.channels = 1;
        lowRateMono.blockAlign = 2;
        lowRateMono.avgBytesPerSec = 4;
        AudioInputFormat highRateMono = lowRateMono;
        highRateMono.sampleRate = 4;
        highRateMono.avgBytesPerSec = 8;
        const int16_t ramp[] = {-32768, 32767};
        std::vector<BYTE> interpolated;
        convertAudioWithGain(
            reinterpret_cast<const BYTE*>(ramp), sizeof(ramp), lowRateMono, highRateMono, 1.0, interpolated);
        const auto* interpolatedSamples = reinterpret_cast<const int16_t*>(interpolated.data());
        require(interpolated.size() == 8 && std::abs(interpolatedSamples[1]) <= 1,
            "Sample-rate conversion introduced a nearest-neighbor step");
        std::mutex mutex;
        std::condition_variable cv;
        std::vector<int64_t> timestamps;
        bool allSilent = true;
        AudioMixer mixer(format, format, format, true, false, 1.0,
            [&](const BYTE* data, DWORD bytes, int64_t timestamp, int64_t duration) {
                std::scoped_lock lock(mutex);
                allSilent = allSilent && std::all_of(data, data + bytes, [](BYTE value) { return value == 0; });
                require(bytes == 1920 && duration == 100000, "Incorrect audio chunk duration");
                timestamps.push_back(timestamp);
                cv.notify_all();
                return true;
            });
        require(mixer.start(), "Mixer failed to start");
        std::this_thread::sleep_for(40ms);
        {
            std::scoped_lock lock(mutex);
            require(timestamps.empty(), "Audio started before capture timeline");
        }
        mixer.beginTimeline();
        {
            std::unique_lock lock(mutex);
            require(cv.wait_for(lock, 2s, [&] { return timestamps.size() >= 10; }),
                "Silent loopback did not advance audio clock");
        }
        mixer.setPaused(true);
        std::this_thread::sleep_for(30ms);
        size_t pausedCount;
        {
            std::scoped_lock lock(mutex);
            pausedCount = timestamps.size();
        }
        std::this_thread::sleep_for(100ms);
        {
            std::scoped_lock lock(mutex);
            require(timestamps.size() == pausedCount, "Audio clock advanced while paused");
        }
        mixer.setPaused(false);
        {
            std::unique_lock lock(mutex);
            require(cv.wait_for(lock, 2s, [&] { return timestamps.size() >= pausedCount + 10; }),
                "Audio clock did not resume");
        }
        const auto stopStart = std::chrono::steady_clock::now();
        mixer.stop();
        require(std::chrono::steady_clock::now() - stopStart < 500ms, "Stop did not interrupt clock wait");
        require(allSilent, "Empty audio queues produced nonzero samples");
        for (size_t i = 0; i < timestamps.size(); ++i) {
            require(timestamps[i] == static_cast<int64_t>(i) * 100000,
                "Audio timestamps contain a pause gap or discontinuity");
        }

        std::vector<bool> preservedChunks;
        AudioMixer pauseBoundaryMixer(format, format, format, false, true, 1.0,
            [&](const BYTE* data, DWORD bytes, int64_t, int64_t) {
                std::scoped_lock lock(mutex);
                preservedChunks.push_back(std::any_of(
                    data, data + bytes, [](BYTE value) { return value != 0; }));
                cv.notify_all();
                return true;
            });
        require(pauseBoundaryMixer.start(), "Pause-boundary mixer failed to start");
        const int64_t pauseBoundaryEpoch = captureClockHns();
        pauseBoundaryMixer.beginTimeline(pauseBoundaryEpoch);
        std::vector<BYTE> bufferedPrePauseAudio(10 * 1920, 23);
        pauseBoundaryMixer.pushMicrophone(
            bufferedPrePauseAudio.data(),
            static_cast<DWORD>(bufferedPrePauseAudio.size()),
            pauseBoundaryEpoch);
        pauseBoundaryMixer.setPaused(true);
        std::this_thread::sleep_for(50ms);
        pauseBoundaryMixer.setPaused(false);
        {
            std::unique_lock lock(mutex);
            require(cv.wait_for(lock, 2s, [&] { return preservedChunks.size() >= 10; }),
                "Buffered pre-pause audio did not drain after resume");
        }
        pauseBoundaryMixer.stop();
        require(std::all_of(preservedChunks.begin(), preservedChunks.begin() + 10,
                    [](bool hasAudio) { return hasAudio; }),
            "Pause discarded buffered audio and shifted the resumed timeline");

        AudioInputFormat microphone = format;
        microphone.sampleRate = 44100;
        microphone.channels = 1;
        microphone.blockAlign = 2;
        microphone.avgBytesPerSec = 88200;
        std::vector<BYTE> micPacket(441 * 2, 0);
        for (size_t i = 1; i < micPacket.size(); i += 2) micPacket[i] = 16;
        std::vector<int64_t> micMarkers;
        bool microphoneTimingCorrect = true;
        AudioMixer micMixer(format, format, microphone, false, true, 1.0,
            [&](const BYTE* data, DWORD bytes, int64_t timestamp, int64_t) {
                std::scoped_lock lock(mutex);
                if (std::any_of(data, data + bytes, [](BYTE value) { return value != 0; })) {
                    micMarkers.push_back(timestamp);
                    microphoneTimingCorrect = microphoneTimingCorrect &&
                        (timestamp == 2'000'000 || timestamp == 4'000'000 ||
                         timestamp == 6'000'000 || timestamp == 8'000'000);
                }
                cv.notify_all();
                return true;
            });
        require(micMixer.start(), "Microphone mixer failed to start");
        const int64_t epoch = captureClockHns();
        micMixer.beginTimeline(epoch);
        // Packets arrive in a burst; the device timestamps, not delivery order or arrival time, place them.
        for (int64_t timestamp : {6'000'000LL, 2'000'000LL, 4'000'000LL}) {
            micMixer.pushMicrophone(micPacket.data(), static_cast<DWORD>(micPacket.size()), epoch + timestamp);
        }
        {
            std::unique_lock lock(mutex);
            require(cv.wait_for(lock, 2s, [&] { return micMarkers.size() >= 3; }),
                "Microphone markers did not reach the timeline");
        }
        micMixer.pushMicrophone(micPacket.data(), static_cast<DWORD>(micPacket.size()), epoch + 8'000'000);
        micMixer.stop();
        require(microphoneTimingCorrect &&
                micMarkers == std::vector<int64_t>{2'000'000, 4'000'000, 6'000'000, 8'000'000},
            "44.1 kHz microphone resampling or batched delivery shifted content timestamps");

        std::vector<std::vector<BYTE>> jitterChunks;
        AudioMixer jitterMixer(format, format, format, false, true, 1.0,
            [&](const BYTE* data, DWORD bytes, int64_t, int64_t) {
                std::scoped_lock lock(mutex);
                jitterChunks.emplace_back(data, data + bytes);
                cv.notify_all();
                return true;
            });
        require(jitterMixer.start(), "Jitter mixer failed to start");
        const int64_t jitterEpoch = captureClockHns();
        jitterMixer.beginTimeline(jitterEpoch);
        const std::vector<BYTE> continuousPacket(1920, 17);
        jitterMixer.pushMicrophone(continuousPacket.data(), 1920, jitterEpoch);
        jitterMixer.pushMicrophone(continuousPacket.data(), 1920, jitterEpoch + 100'208);
        jitterMixer.pushMicrophone(continuousPacket.data(), 1920, jitterEpoch + 199'792);
        {
            std::unique_lock lock(mutex);
            require(cv.wait_for(lock, 2s, [&] { return jitterChunks.size() >= 3; }),
                "Jitter packets did not reach the timeline");
        }
        jitterMixer.stop();
        require(std::all_of(jitterChunks.begin(), jitterChunks.begin() + 3,
                    [](const std::vector<BYTE>& data) {
                        return std::all_of(data.begin(), data.end(), [](BYTE value) { return value == 17; });
                    }),
            "Normal WASAPI timestamp jitter introduced a gap or overlap");
        std::cout << "PASS: microphone auto level/noise gate, interpolation, simulated half-hour gaps, stale/partial packets, silence, pause/resume, pause-boundary buffering, stop, 44.1 kHz microphone markers, packet jitter continuity"
                  << std::endl;
        return 0;
    } catch (const std::exception& error) {
        std::cerr << error.what() << std::endl;
        return 1;
    }
}

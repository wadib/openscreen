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
        std::cout << "PASS: simulated half-hour gaps, stale/partial packets, silence, pause/resume, stop, 44.1 kHz microphone markers"
                  << std::endl;
        return 0;
    } catch (const std::exception& error) {
        std::cerr << error.what() << std::endl;
        return 1;
    }
}

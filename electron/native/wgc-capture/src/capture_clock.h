#pragma once

#include <Windows.h>
#include <cstdint>

inline int64_t captureClockHns() {
    LARGE_INTEGER counter{};
    LARGE_INTEGER frequency{};
    QueryPerformanceCounter(&counter);
    QueryPerformanceFrequency(&frequency);
    return (counter.QuadPart / frequency.QuadPart) * 10'000'000 +
        ((counter.QuadPart % frequency.QuadPart) * 10'000'000) / frequency.QuadPart;
}

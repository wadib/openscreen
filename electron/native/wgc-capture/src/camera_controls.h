#pragma once

#include <string>

int runCameraControlCommand(
    const std::wstring& deviceName,
    const std::string& action,
    const std::string& propertyId,
    long requestedValue,
    bool automatic);

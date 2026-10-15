cmake_minimum_required(VERSION 3.16)
# wallet_link here; power_mgr is the WiFi cartridge's power manager, kept with the board (hardware/cart)
set(EXTRA_COMPONENT_DIRS ${CMAKE_CURRENT_LIST_DIR}/../components
                         ${CMAKE_CURRENT_LIST_DIR}/../../../hardware/cart/firmware/esp32c3/components)
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(kagiboy_radio)

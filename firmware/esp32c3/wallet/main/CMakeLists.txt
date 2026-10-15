idf_component_register(SRCS "main.c" "ble.c" "link.c" "power.c"
                       INCLUDE_DIRS "."
                       PRIV_REQUIRES wallet_link power_mgr bt nvs_flash esp_timer esp_adc esp_driver_gpio
                                     esp_driver_spi app_update esp_pm)

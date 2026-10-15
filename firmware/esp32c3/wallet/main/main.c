/* kagiboy radio (ESP32-C3): Bluetooth LE to the phone, SPI to the RP2350 that holds the wallet. It never sees keys
 * or PINs, only the phone link's messages, which it passes through unchanged (docs/phone-link.md). */
#include "app.h"
#include "esp_log.h"
#include "esp_ota_ops.h"
#include "esp_pm.h"
#include "esp_random.h"
#include "esp_timer.h"
#include "freertos/task.h"
#include "nvs_flash.h"

static const char *TAG = "main";

static void mark_valid(void *arg)
{
    esp_ota_mark_app_valid_cancel_rollback();
}

void app_main(void)
{
    esp_err_t e = nvs_flash_init();
    if (e == ESP_ERR_NVS_NO_FREE_PAGES || e == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        e = nvs_flash_init();
    }
    ESP_ERROR_CHECK(e);

    esp_pm_config_t pmc = {.max_freq_mhz = 160, .min_freq_mhz = 80, .light_sleep_enable = true};
    if (esp_pm_configure(&pmc) != ESP_OK)
        ESP_LOGW(TAG, "power management not available");

    kgb_link_mtx = xSemaphoreCreateMutex();
    wl_slave_init(&kgb_link, (uint8_t)(esp_random() | 1)); /* new boot id: the RP2350 forgets which seq it took */
    power_init();
    ble_init();

    xTaskCreate(link_task, "link", 4096, NULL, configMAX_PRIORITIES - 2, NULL);
    xTaskCreate(power_task, "power", 4096, NULL, configMAX_PRIORITIES - 1, NULL);
    esp_timer_handle_t t;
    esp_timer_create_args_t ta = {.callback = mark_valid, .name = "ota_valid"};
    ESP_ERROR_CHECK(esp_timer_create(&ta, &t));
    ESP_ERROR_CHECK(esp_timer_start_once(t, 5 * 1000 * 1000));
    ESP_LOGI(TAG, "kagiboy radio up (SPI link v%d)", WL_VERSION);
}

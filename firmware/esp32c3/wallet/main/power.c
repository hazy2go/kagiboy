/* 1 ms power loop: reservoir + cart rail on ADC1 -> the WiFi cartridge's power manager (linked unchanged) -> what the
 * radio may do. Bluetooth LE draws far less than WiFi, so the same thresholds leave it a wide margin; the phone is
 * only offered the cartridge while the reservoir is in RUN, and PARK frees the SPI slave so the chip can sleep. */
#include "app.h"
#include "driver/gpio.h"
#include "esp_adc/adc_cali.h"
#include "esp_adc/adc_cali_scheme.h"
#include "esp_adc/adc_oneshot.h"
#include "esp_log.h"
#include "freertos/task.h"

static const char *TAG = "power";

#define BOOT_MS 5            /* BLE start, like the WiFi cart's GBW_BOOT_MS */
#define USB_RAIL_MAX_V 1.0f  /* "on USB" only with the cart rail below this (see the WiFi cart's gbwifi.h) */

pm_t kgb_pm;

static adc_oneshot_unit_handle_t s_adc;
static adc_cali_handle_t s_cali;

/* a failed read keeps the last good value: a spurious 0 V would mean a spurious PARK */
static float read_v(adc_channel_t ch, float last)
{
    int raw = 0, mv = 0;
    if (adc_oneshot_read(s_adc, ch, &raw) != ESP_OK)
        return last;
    if (!s_cali || adc_cali_raw_to_voltage(s_cali, raw, &mv) != ESP_OK)
        mv = raw * 1300 / 4095;
    return mv / 1000.0f / ADC_DIV_K;
}

void power_init(void)
{
    adc_oneshot_unit_init_cfg_t ucfg = {.unit_id = ADC_UNIT_1};
    ESP_ERROR_CHECK(adc_oneshot_new_unit(&ucfg, &s_adc));
    adc_oneshot_chan_cfg_t ccfg = {.atten = ADC_ATTEN_DB_6, .bitwidth = ADC_BITWIDTH_DEFAULT};
    ESP_ERROR_CHECK(adc_oneshot_config_channel(s_adc, ADC_CHANNEL_0, &ccfg));
    ESP_ERROR_CHECK(adc_oneshot_config_channel(s_adc, ADC_CHANNEL_1, &ccfg));
    adc_cali_curve_fitting_config_t cal = {.unit_id = ADC_UNIT_1, .atten = ADC_ATTEN_DB_6, .bitwidth = ADC_BITWIDTH_DEFAULT};
    if (adc_cali_create_scheme_curve_fitting(&cal, &s_cali) != ESP_OK)
        s_cali = NULL;
    gpio_config_t in = {.pin_bit_mask = (1ULL << PIN_USB_PWR_ST) | (1ULL << PIN_LIM_FAULT), .mode = GPIO_MODE_INPUT};
    ESP_ERROR_CHECK(gpio_config(&in));
    gpio_config_t spare = {.pin_bit_mask = (1ULL << 3) | (1ULL << 20) | (1ULL << 21), .mode = GPIO_MODE_INPUT,
                           .pull_down_en = GPIO_PULLDOWN_ENABLE};
    ESP_ERROR_CHECK(gpio_config(&spare));
    pm_config_t cfg;
    pm_default_config(&cfg);
    cfg.boot_ms = BOOT_MS;
    pm_init(&kgb_pm, &cfg);
}

void power_task(void *arg)
{
    TickType_t last = xTaskGetTickCount();
    pm_state_t prev = PM_OFF;
    float v_res = 0, v_rail = 0;
    for (;;) {
        int ticks = prev == PM_PARK ? 10 : 1;
        vTaskDelayUntil(&last, pdMS_TO_TICKS(ticks));
        v_res = read_v(ADC_CHANNEL_0, v_res);
        v_rail = read_v(ADC_CHANNEL_1, v_rail);
        bool usb = gpio_get_level(PIN_USB_PWR_ST) && v_rail < USB_RAIL_MAX_V;
        for (int i = 0; i < ticks; i++)
            pm_tick_1ms(&kgb_pm, v_res, usb ? 5.0f : v_rail); /* on USB the rail watch does not apply */
        pm_state_t st = pm_state(&kgb_pm);
        if (st != prev) {
            ESP_LOGI(TAG, "pm %d -> %d (res %.2f V, rail %.3f V, usb %d)", prev, st, v_res, v_rail, usb);
            ble_allow(st == PM_RUN || st == PM_SLEEP);
            if (st == PM_PARK)
                link_pause(true);
            if (prev == PM_PARK)
                link_pause(false);
        }
        prev = st;
    }
}

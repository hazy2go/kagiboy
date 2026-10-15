/* kagiboy radio: the ESP32-C3 passes phone messages between Bluetooth LE and the RP2350 (docs/phone-link.md).
 * Pin map: hardware/cart/docs/design/DESIGN_CALCS.md (U104 table). */
#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "power_mgr.h"
#include "wallet_link.h"

/* U104 pins */
#define PIN_ESP_CS 10    /* FSPICS0, from RP2350 GPIO46 through U106 */
#define PIN_ESP_SCK 6    /* FSPICLK */
#define PIN_ESP_MOSI 7   /* FSPID */
#define PIN_ESP_MISO 2   /* FSPIQ -> U105 (driven only while CS is low) */
#define PIN_USB_PWR_ST 5 /* TPS2116 ST: high = running from USB (VIN1) */
#define PIN_LIM_FAULT 4  /* TPS2553 /FAULT: low = limiter saturated (telemetry) */
/* ADC1_CH0 = IO0 = ADC_VRES, ADC1_CH1 = IO1 = ADC_VCC; dividers 680k / 200k */
#define ADC_DIV_K (200.0f / (680.0f + 200.0f))

/* ---------------------------------------------------------------- link.c */
extern wl_slave_t kgb_link; /* the shipped SPI-slave half, guarded by kgb_link_mtx */
extern SemaphoreHandle_t kgb_link_mtx;
void link_task(void *arg);
void link_pause(bool pause); /* PARK: free the SPI slave so the chip can light-sleep */

/* ---------------------------------------------------------------- ble.c */
void ble_init(void);
void ble_allow(bool on);                         /* advertise / accept a phone only while the power allows */
void ble_send_reply(const uint8_t *msg, size_t len); /* a reply from the RP2350: notify the phone */

/* ---------------------------------------------------------------- power.c */
extern pm_t kgb_pm;
void power_init(void);
void power_task(void *arg);

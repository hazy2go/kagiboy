/* SPI slave for the RP2350 link, wallet profile (components/wallet_link; spec: docs/phone-link.md). One transaction
 * is always queued; its TX buffer is built right after the previous one finished and is never touched while queued
 * (the DMA owns it). Adapted from the WiFi cartridge's link.c (MIT). */
#include <string.h>

#include "app.h"
#include "driver/spi_slave.h"
#include "esp_heap_caps.h"
#include "esp_log.h"
#include "freertos/task.h"

static const char *TAG = "link";

wl_slave_t kgb_link;
SemaphoreHandle_t kgb_link_mtx;

static volatile bool s_pause_req;
static bool s_pending; /* a queued transaction not yet collected */
static SemaphoreHandle_t s_resume;

static void slave_up(void)
{
    spi_bus_config_t bus = {
        .mosi_io_num = PIN_ESP_MOSI,
        .miso_io_num = PIN_ESP_MISO,
        .sclk_io_num = PIN_ESP_SCK,
        .quadwp_io_num = -1,
        .quadhd_io_num = -1,
        .max_transfer_sz = WL_MAX_XFER,
    };
    spi_slave_interface_config_t sl = {.spics_io_num = PIN_ESP_CS, .queue_size = 1, .mode = 0};
    ESP_ERROR_CHECK(spi_slave_initialize(SPI2_HOST, &bus, &sl, SPI_DMA_CH_AUTO));
}

void link_pause(bool pause)
{
    s_pause_req = pause;
    if (!pause)
        xSemaphoreGive(s_resume); /* a stale token is harmless: the pause loop re-checks the flag */
}

void link_task(void *arg)
{
    s_resume = xSemaphoreCreateBinary();
    uint8_t *tx = heap_caps_malloc(WL_MAX_XFER, MALLOC_CAP_DMA);
    uint8_t *rx = heap_caps_malloc(WL_MAX_XFER, MALLOC_CAP_DMA);
    static uint8_t reply[WL_MAX_MSG];
    assert(tx && rx);
    slave_up();
    for (;;) {
        if (s_pause_req) {
            /* the slave driver holds an APB lock, which blocks light sleep; the master sees invalid headers meanwhile
             * and repeats (the protocol is state, not messages) */
            spi_slave_disable(SPI2_HOST);
            ESP_LOGI(TAG, "paused");
            while (s_pause_req)
                xSemaphoreTake(s_resume, pdMS_TO_TICKS(20));
            spi_slave_enable(SPI2_HOST);
            ESP_LOGI(TAG, "resumed");
        }
        static spi_slave_transaction_t t;
        if (!s_pending) {
            xSemaphoreTake(kgb_link_mtx, portMAX_DELAY);
            wl_slave_build_tx(&kgb_link, tx);
            xSemaphoreGive(kgb_link_mtx);
            memset(rx, 0, WL_MAX_XFER);
            t = (spi_slave_transaction_t){.length = WL_MAX_XFER * 8, .tx_buffer = tx, .rx_buffer = rx};
            if (spi_slave_queue_trans(SPI2_HOST, &t, portMAX_DELAY) != ESP_OK)
                continue;
        }
        spi_slave_transaction_t *done = NULL;
        /* bounded wait so a pause request is seen even when the master is quiet */
        while (spi_slave_get_trans_result(SPI2_HOST, &done, pdMS_TO_TICKS(50)) == ESP_ERR_TIMEOUT) {
            if (s_pause_req)
                break;
        }
        if (done == NULL) {
            s_pending = true; /* still queued (the driver is only disabled): collect it before building another */
            continue;
        }
        s_pending = false;
        xSemaphoreTake(kgb_link_mtx, portMAX_DELAY);
        int n = wl_slave_on_rx(&kgb_link, rx, done->trans_len / 8, reply);
        xSemaphoreGive(kgb_link_mtx);
        if (n > 0)
            ble_send_reply(reply, (size_t)n);
    }
}

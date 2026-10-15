/* Bluetooth LE: one GATT service, one phone at a time.
 *   RX  (write)   the phone's request, one whole message per write (long writes are reassembled by the stack)
 *   TX  (notify)  the cartridge's reply, in pieces that fit the connection's MTU: byte 0 is 0x80 when more pieces
 *                 follow and 0x00 on the last one, the rest is message bytes
 * The link is not encrypted at this layer; the wallet pairs the phone itself (a 6-digit code approved on the Game
 * Boy) and signs nothing the owner didn't see and approve there (docs/phone-link.md, "Security"). */
#include <string.h>

#include "app.h"
#include "esp_log.h"
#include "esp_mac.h"
#include "esp_random.h"
#include "host/ble_hs.h"
#include "host/util/util.h"
#include "nimble/nimble_port.h"
#include "nimble/nimble_port_freertos.h"
#include "services/gap/ble_svc_gap.h"
#include "services/gatt/ble_svc_gatt.h"

static const char *TAG = "ble";

static const ble_uuid128_t SVC_UUID = BLE_UUID128_INIT(0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x79, 0x6f, 0x62, 0x69, 0x67, 0x61, 0x6b);
static const ble_uuid128_t RX_UUID = BLE_UUID128_INIT(0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x79, 0x6f, 0x62, 0x69, 0x67, 0x61, 0x6b);
static const ble_uuid128_t TX_UUID = BLE_UUID128_INIT(0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x79, 0x6f, 0x62, 0x69, 0x67, 0x61, 0x6b);

static uint16_t s_tx_handle;
static volatile uint16_t s_conn = BLE_HS_CONN_HANDLE_NONE;
static volatile uint16_t s_mtu = 23;
static volatile bool s_synced, s_allowed;
static uint8_t s_addr_type;
static char s_name[16];

static int gap_event(struct ble_gap_event *ev, void *arg);

static void advertise(void)
{
    if (!s_synced || !s_allowed || s_conn != BLE_HS_CONN_HANDLE_NONE || ble_gap_adv_active())
        return;
    struct ble_hs_adv_fields f = {0};
    f.flags = BLE_HS_ADV_F_DISC_GEN | BLE_HS_ADV_F_BREDR_UNSUP;
    f.uuids128 = &SVC_UUID;
    f.num_uuids128 = 1;
    f.uuids128_is_complete = 1;
    int rc = ble_gap_adv_set_fields(&f);
    struct ble_hs_adv_fields rsp = {0};
    rsp.name = (const uint8_t *)s_name;
    rsp.name_len = strlen(s_name);
    rsp.name_is_complete = 1;
    if (rc == 0)
        rc = ble_gap_adv_rsp_set_fields(&rsp);
    struct ble_gap_adv_params p = {.conn_mode = BLE_GAP_CONN_MODE_UND, .disc_mode = BLE_GAP_DISC_MODE_GEN};
    if (rc == 0)
        rc = ble_gap_adv_start(s_addr_type, NULL, BLE_HS_FOREVER, &p, gap_event, NULL);
    if (rc)
        ESP_LOGW(TAG, "advertising: %d", rc);
}

/* The phone went away: what it queued is dropped, and a new boot id tells the RP2350 to forget replies in flight. */
static void forget_phone(void)
{
    xSemaphoreTake(kgb_link_mtx, portMAX_DELAY);
    wl_slave_init(&kgb_link, (uint8_t)(esp_random() | 1));
    xSemaphoreGive(kgb_link_mtx);
}

static int gap_event(struct ble_gap_event *ev, void *arg)
{
    switch (ev->type) {
    case BLE_GAP_EVENT_CONNECT:
        if (ev->connect.status == 0) {
            s_conn = ev->connect.conn_handle;
            s_mtu = 23;
            xSemaphoreTake(kgb_link_mtx, portMAX_DELAY);
            kgb_link.connected = true;
            xSemaphoreGive(kgb_link_mtx);
            ESP_LOGI(TAG, "phone connected");
        } else {
            advertise();
        }
        break;
    case BLE_GAP_EVENT_DISCONNECT:
        s_conn = BLE_HS_CONN_HANDLE_NONE;
        forget_phone();
        ESP_LOGI(TAG, "phone gone (%d)", ev->disconnect.reason);
        advertise();
        break;
    case BLE_GAP_EVENT_ADV_COMPLETE:
        advertise();
        break;
    case BLE_GAP_EVENT_MTU:
        s_mtu = ev->mtu.value;
        break;
    default:
        break;
    }
    return 0;
}

static int rx_access(uint16_t conn, uint16_t attr, struct ble_gatt_access_ctxt *ctxt, void *arg)
{
    if (ctxt->op != BLE_GATT_ACCESS_OP_WRITE_CHR)
        return BLE_ATT_ERR_UNLIKELY;
    uint8_t buf[WL_MAX_MSG];
    uint16_t len = OS_MBUF_PKTLEN(ctxt->om);
    if (len == 0 || len > WL_MAX_MSG)
        return BLE_ATT_ERR_INVALID_ATTR_VALUE_LEN;
    if (ble_hs_mbuf_to_flat(ctxt->om, buf, sizeof buf, &len) != 0)
        return BLE_ATT_ERR_UNLIKELY;
    xSemaphoreTake(kgb_link_mtx, portMAX_DELAY);
    bool ok = wl_slave_push(&kgb_link, buf, len);
    xSemaphoreGive(kgb_link_mtx);
    return ok ? 0 : BLE_ATT_ERR_INSUFFICIENT_RES; /* queue full: the phone tries again */
}

static int tx_access(uint16_t conn, uint16_t attr, struct ble_gatt_access_ctxt *ctxt, void *arg)
{
    return BLE_ATT_ERR_READ_NOT_PERMITTED; /* notify only */
}

static const struct ble_gatt_svc_def SVCS[] = {
    {
        .type = BLE_GATT_SVC_TYPE_PRIMARY,
        .uuid = &SVC_UUID.u,
        .characteristics =
            (struct ble_gatt_chr_def[]){
                {.uuid = &RX_UUID.u, .access_cb = rx_access, .flags = BLE_GATT_CHR_F_WRITE},
                {.uuid = &TX_UUID.u, .access_cb = tx_access, .flags = BLE_GATT_CHR_F_NOTIFY, .val_handle = &s_tx_handle},
                {0},
            },
    },
    {0},
};

void ble_send_reply(const uint8_t *msg, size_t len)
{
    uint16_t conn = s_conn;
    if (conn == BLE_HS_CONN_HANDLE_NONE)
        return;
    size_t piece = (size_t)s_mtu - 3 - 1;
    for (size_t o = 0; o < len; o += piece) {
        size_t n = len - o < piece ? len - o : piece;
        uint8_t buf[WL_MAX_MSG + 1];
        buf[0] = o + n < len ? 0x80 : 0x00;
        memcpy(buf + 1, msg + o, n);
        struct os_mbuf *om = ble_hs_mbuf_from_flat(buf, n + 1);
        if (!om || ble_gatts_notify_custom(conn, s_tx_handle, om) != 0) {
            ESP_LOGW(TAG, "notify failed: the phone asks again");
            return;
        }
    }
}

void ble_allow(bool on)
{
    s_allowed = on;
    if (on) {
        advertise();
    } else {
        if (ble_gap_adv_active())
            ble_gap_adv_stop();
        if (s_conn != BLE_HS_CONN_HANDLE_NONE)
            ble_gap_terminate(s_conn, BLE_ERR_REM_USER_CONN_TERM);
    }
}

static void on_sync(void)
{
    ble_hs_util_ensure_addr(0);
    ble_hs_id_infer_auto(0, &s_addr_type);
    s_synced = true;
    advertise();
}

static void host_task(void *arg)
{
    nimble_port_run();
    nimble_port_freertos_deinit();
}

void ble_init(void)
{
    uint8_t mac[6];
    esp_read_mac(mac, ESP_MAC_BT);
    snprintf(s_name, sizeof s_name, "KAGIBOY-%02X%02X", mac[4], mac[5]);
    ESP_ERROR_CHECK(nimble_port_init());
    ble_hs_cfg.sync_cb = on_sync;
    ble_svc_gap_init();
    ble_svc_gatt_init();
    ESP_ERROR_CHECK(ble_gatts_count_cfg(SVCS));
    ESP_ERROR_CHECK(ble_gatts_add_svcs(SVCS));
    ble_svc_gap_device_name_set(s_name);
    nimble_port_freertos_init(host_task);
}

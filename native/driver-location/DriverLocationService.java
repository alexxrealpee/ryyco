package com.ryyco.app;

import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.location.*;
import android.os.*;
import androidx.core.app.NotificationCompat;
import org.json.*;
import java.net.*;
import java.io.*;
import java.util.*;
import java.util.concurrent.*;

public class DriverLocationService extends Service implements LocationListener {
    static volatile boolean running = false;
    static volatile String lastError = "";
    static volatile long lastUpdate = 0;
    static volatile double latitude = 0, longitude = 0, accuracy = 0;
    static volatile long gpsTimestamp = 0;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private LocationManager manager;
    private JSONObject config;
    private String token = "";
    private long expires = 0, lastAttempt = 0;
    private volatile boolean busy = false, destroyed = false;
    private static final String ROOT = "projects/studio-9002217802-13e05/databases/ai-studio-be9196c8-7041-4ba9-b337-ca71c1485d15/documents";
    @Override public void onCreate() {
        super.onCreate(); manager = (LocationManager)getSystemService(LOCATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel("ryyco_location", "Ubicación del domiciliario", NotificationManager.IMPORTANCE_LOW);
            channel.setSound(null, null); getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }
    }
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        try {
            String saved = DriverGpsVault.read(this);
            if (saved == null) { stopSelf(); return START_NOT_STICKY; }
            JSONObject next = new JSONObject(saved);
            if (config == null || !next.optString("authUid").equals(config.optString("authUid"))) { token = ""; expires = 0; }
            config = next;
            Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
            PendingIntent pending = PendingIntent.getActivity(this, 31, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            Notification notification = new NotificationCompat.Builder(this, "ryyco_location")
                .setSmallIcon(com.ryyco.app.R.drawable.ic_notification).setContentTitle("RYYCO · Ubicación compartida")
                .setContentText("GPS activo mientras estás disponible o tienes una entrega. Abre RYYCO para cambiar tu disponibilidad.")
                .setContentIntent(pending).setOngoing(true).setOnlyAlertOnce(true).setCategory(NotificationCompat.CATEGORY_SERVICE).build();
            if (Build.VERSION.SDK_INT >= 29) startForeground(3101, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            else startForeground(3101, notification);
            manager.removeUpdates(this);
            if (manager.getAllProviders().contains(LocationManager.GPS_PROVIDER)) manager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 5000, 0, this);
            if (manager.getAllProviders().contains(LocationManager.NETWORK_PROVIDER)) manager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 5000, 0, this);
            running = true; lastError = "";
            return START_STICKY;
        } catch (Exception e) { lastError = "No se pudo activar GPS en segundo plano. Revisa los permisos y abre RYYCO."; stopSelf(); return START_NOT_STICKY; }
    }
    private JSONObject http(String url, String method, JSONObject body, boolean authenticated) throws Exception {
        HttpURLConnection connection = (HttpURLConnection)new URL(url).openConnection();
        connection.setConnectTimeout(10000); connection.setReadTimeout(10000); connection.setRequestMethod(method);
        if (authenticated) connection.setRequestProperty("Authorization", "Bearer " + token);
        boolean renewal = url.startsWith("https://securetoken.googleapis.com/");
        connection.setRequestProperty("Content-Type", renewal ? "application/x-www-form-urlencoded" : "application/json");
        try {
            if (body != null) { connection.setDoOutput(true); try (OutputStream out = connection.getOutputStream()) { String payload = renewal ? "grant_type=refresh_token&refresh_token=" + UriEncode(body.getString("refresh_token")) : body.toString(); out.write(payload.getBytes("UTF-8")); } }
            int status = connection.getResponseCode();
            if (status == 401 || status == 403) { expires = 0; throw new SecurityException("Firebase rechazó la sesión GPS. Abre RYYCO y verifica tu cuenta."); }
            if (status < 200 || status >= 300) throw new IOException("No se pudo confirmar la transmisión GPS.");
            try (InputStream input = connection.getInputStream()) { return new JSONObject(readText(input)); }
        } finally { connection.disconnect(); }
    }
    private static String readText(InputStream input) throws Exception {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream(); byte[] buffer = new byte[4096]; int count;
        while ((count = input.read(buffer)) != -1) bytes.write(buffer, 0, count);
        return bytes.toString("UTF-8");
    }
    private static String timestamp() {
        java.text.SimpleDateFormat format = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("UTC")); return format.format(new Date());
    }
    private void authenticate(JSONObject session) throws Exception {
        if (System.currentTimeMillis() < expires && !token.isEmpty()) return;
        JSONObject result = http("https://securetoken.googleapis.com/v1/token?key=" + UriEncode(session.getString("apiKey")), "POST",
            new JSONObject().put("grant_type", "refresh_token").put("refresh_token", session.getString("refreshToken")), false);
        if (!session.getString("authUid").equals(result.getString("user_id"))) throw new SecurityException("La sesión GPS cambió. Abre RYYCO.");
        token = result.getString("id_token"); expires = System.currentTimeMillis() + (Long.parseLong(result.getString("expires_in")) - 120) * 1000;
        session.put("refreshToken", result.getString("refresh_token"));
        // Never resurrect an explicitly stopped session.
        String current = DriverGpsVault.read(this);
        if (!destroyed && current != null) {
            JSONObject latest = new JSONObject(current);
            if (latest.optString("authUid").equals(session.optString("authUid"))) {
                latest.put("refreshToken", result.getString("refresh_token")); DriverGpsVault.save(this, latest.toString());
            }
        }
    }
    private static String UriEncode(String value) throws Exception { return java.net.URLEncoder.encode(value, "UTF-8").replace("+", "%20"); }
    private JSONObject read(String collection, String id) throws Exception {
        String[] wanted = collection.equals("drivers")
            ? new String[]{"status", "isAvailable", "firstName", "lastName", "phone", "vehicleType", "vehiclePlate", "uid"}
            : new String[]{"deliveryDriverId", "driverId", "status", "deliveryStep", "orderNumber", "customerEmail", "customerPhone", "customerName", "customerAddress", "customerReference", "storeName", "storeAddress", "storeReference", "storeLat", "storeLng", "customerLat", "customerLng"};
        StringBuilder mask = new StringBuilder();
        for (String field : wanted) mask.append(mask.length() == 0 ? "?" : "&").append("mask.fieldPaths=").append(field);
        return http("https://firestore.googleapis.com/v1/" + ROOT + "/" + collection + "/" + UriEncode(id) + mask, "GET", null, true).getJSONObject("fields");
    }
    private static String str(JSONObject fields, String key) { return fields.optJSONObject(key) == null ? "" : fields.optJSONObject(key).optString("stringValue"); }
    private static boolean bool(JSONObject fields, String key) { return fields.optJSONObject(key) != null && fields.optJSONObject(key).optBoolean("booleanValue"); }
    private static JSONObject value(Object v) throws Exception {
        JSONObject result = new JSONObject();
        if (v instanceof Boolean) return result.put("booleanValue", v);
        if (v instanceof Number) return result.put("doubleValue", v);
        return result.put("stringValue", String.valueOf(v));
    }
    private JSONObject write(String collection, String id, JSONObject fields, String... timestamps) throws Exception {
        JSONObject typed = new JSONObject(); JSONArray mask = new JSONArray(), transforms = new JSONArray();
        for (Iterator<String> it = fields.keys(); it.hasNext();) { String key = it.next(); typed.put(key, value(fields.get(key))); mask.put(key); }
        for (String key : timestamps) transforms.put(new JSONObject().put("fieldPath", key).put("setToServerValue", "REQUEST_TIME"));
        return new JSONObject().put("update", new JSONObject().put("name", ROOT + "/" + collection + "/" + id).put("fields", typed))
            .put("updateMask", new JSONObject().put("fieldPaths", mask)).put("updateTransforms", transforms);
    }
    private void commit(JSONArray writes) throws Exception { if (writes.length() > 0) http("https://firestore.googleapis.com/v1/" + ROOT + ":commit", "POST", new JSONObject().put("writes", writes), true); }
    private JSONObject deletion(String id) throws Exception { return new JSONObject().put("delete", ROOT + "/driver_presence/" + id); }
    private boolean presenceWritten = false, trackingWritten = false;
    private String trackingOrder = "";
    @Override public void onLocationChanged(Location location) {
        long now = System.currentTimeMillis();
        if (destroyed || busy || now - lastAttempt < 5000 || location.isFromMockProvider() || !location.hasAccuracy() || location.getAccuracy() > 60 ||
            now - location.getTime() > 15000 || location.getTime() > now + 5000 || Math.abs(location.getLatitude()) > 90 || Math.abs(location.getLongitude()) > 180) return;
        if (gpsTimestamp > 0 && location.getTime() < gpsTimestamp) return;
        if (gpsTimestamp > 0 && location.getTime() > gpsTimestamp) {
            float[] distance = new float[1]; Location.distanceBetween(latitude, longitude, location.getLatitude(), location.getLongitude(), distance);
            if (distance[0] > 42 * ((location.getTime() - gpsTimestamp) / 1000.0) + accuracy + location.getAccuracy()) return;
        }
        busy = true; lastAttempt = now;
        worker.execute(() -> {
            try {
                if (destroyed || DriverGpsVault.read(this) == null) return;
                JSONObject session = new JSONObject(DriverGpsVault.read(this)); authenticate(session);
                String driverId = session.getString("driverId");
                JSONObject driver = read("drivers", driverId);
                if (!str(driver, "status").equals("approved")) { stopSelf(); return; }
                boolean available = bool(driver, "isAvailable");
                JSONObject point = new JSONObject().put("lat", location.getLatitude()).put("lng", location.getLongitude())
                    .put("accuracy", location.getAccuracy()).put("gpsTimestamp", location.getTime());
                if (location.hasBearing()) point.put("heading", location.getBearing());
                if (location.hasSpeed()) point.put("speed", location.getSpeed());
                JSONArray writes = new JSONArray();
                if (available) { writes.put(write("driver_presence", driverId, point, "updatedAt")); presenceWritten = true; }
                else if (presenceWritten) { writes.put(deletion(driverId)); presenceWritten = false; }
                String orderId = session.optString("orderId"); boolean delivering = false;
                if (!orderId.isEmpty()) {
                    JSONObject order = read("orders", orderId);
                    String assigned = str(order, "deliveryDriverId"); if (assigned.isEmpty()) assigned = str(order, "driverId");
                    String status = str(order, "status"), step = str(order, "deliveryStep");
                    delivering = assigned.equals(driverId) && !Arrays.asList("delivered", "cancelled").contains(status) && !Arrays.asList("delivered", "cancelled").contains(step);
                    if (delivering) {
                        JSONObject data = new JSONObject(point.toString()).put("orderId", orderId).put("driverId", driverId)
                            .put("driverAuthUid", session.getString("authUid")).put("isTrackingActive", true).put("status", step.isEmpty() ? "accepted" : step)
                            .put("updatedAt", timestamp());
                        // Participant identities come from the assigned Firestore order, never a client-supplied customer.
                        for (String key : new String[]{"customerEmail", "customerPhone", "customerName", "customerAddress", "customerReference", "storeName", "storeAddress", "storeReference"}) {
                            String text = str(order, key); if (!text.isEmpty()) data.put(key, key.equals("customerEmail") ? text.trim().toLowerCase(Locale.ROOT) : text);
                        }
                        for (String key : new String[]{"storeLat", "storeLng", "customerLat", "customerLng", "orderNumber"}) {
                            JSONObject field = order.optJSONObject(key);
                            if (field != null) { if (field.has("doubleValue")) data.put(key, field.getDouble("doubleValue")); else if (field.has("integerValue")) data.put(key, field.getLong("integerValue")); }
                        }
                        data.put("vehicleType", str(driver,"vehicleType")).put("vehiclePlate", str(driver,"vehiclePlate"));
                        data.put("driverName", (str(driver,"firstName") + " " + str(driver,"lastName")).trim()).put("driverPhone", str(driver,"phone"));
                        writes.put(write("delivery_tracking", orderId, data, "serverUpdatedAt", "heartbeatAt"));
                        trackingOrder = orderId; trackingWritten = true;
                    }
                }
                if (!delivering && trackingWritten) { writes.put(write("delivery_tracking", trackingOrder, new JSONObject().put("isTrackingActive", false), "serverUpdatedAt", "heartbeatAt")); trackingWritten = false; }
                if (destroyed || DriverGpsVault.read(this) == null) return;
                commit(writes); lastUpdate = System.currentTimeMillis(); latitude = location.getLatitude(); longitude = location.getLongitude(); accuracy = location.getAccuracy(); gpsTimestamp = location.getTime(); lastError = "";
                if (!available && !delivering) { DriverGpsVault.clear(this); stopSelf(); }
            } catch (Exception e) { lastError = e instanceof SecurityException ? e.getMessage() : "No se pudo transmitir la ubicación. Reintentando con conexión y GPS."; }
            finally { busy = false; }
        });
    }
    @Override public void onDestroy() {
        destroyed = true; running = false; manager.removeUpdates(this); stopForeground(true);
        worker.execute(() -> {
            try {
                if (!token.isEmpty() && config != null) {
                    JSONArray writes = new JSONArray();
                    if (presenceWritten) writes.put(deletion(config.getString("driverId")));
                    if (trackingWritten) writes.put(write("delivery_tracking", trackingOrder, new JSONObject().put("isTrackingActive", false), "serverUpdatedAt", "heartbeatAt"));
                    commit(writes);
                }
            } catch (Exception ignored) { /* Last position expires on the map if offline. */ }
        });
        worker.shutdown(); super.onDestroy();
    }
    @Override public void onProviderDisabled(String provider) { lastError = "Activa el GPS del teléfono para compartir una ubicación reciente."; }
    @Override public void onProviderEnabled(String provider) { lastError = ""; }
    @Override public IBinder onBind(Intent intent) { return null; }
}

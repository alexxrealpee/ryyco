package com.ryyco.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import androidx.core.content.ContextCompat;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "DriverLocation")
public class DriverLocationPlugin extends Plugin {
    @PluginMethod public void configure(PluginCall call) {
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            call.reject("Activa la ubicación precisa para compartir el GPS en segundo plano."); return;
        }
        try {
            JSObject data = call.getData();
            if (data.optString("refreshToken").isEmpty() || data.optString("driverId").isEmpty()) { call.reject("Verifica tu sesión de Firebase para activar el GPS."); return; }
            DriverGpsVault.save(getContext(), data.toString());
            Intent intent = new Intent(getContext(), DriverLocationService.class);
            ContextCompat.startForegroundService(getContext(), intent);
            call.resolve();
        } catch (Exception error) { call.reject("No se pudo iniciar el servicio GPS. Abre la app y revisa sus permisos."); }
    }
    @PluginMethod public void stop(PluginCall call) {
        DriverGpsVault.clear(getContext());
        getContext().stopService(new Intent(getContext(), DriverLocationService.class));
        call.resolve();
    }
    @PluginMethod public void status(PluginCall call) {
        JSObject result = new JSObject(); result.put("running", DriverLocationService.running);
        result.put("error", DriverLocationService.lastError);
        result.put("lastUpdate", DriverLocationService.lastUpdate);
        result.put("lat", DriverLocationService.latitude); result.put("lng", DriverLocationService.longitude);
        result.put("accuracy", DriverLocationService.accuracy); result.put("gpsTimestamp", DriverLocationService.gpsTimestamp);
        call.resolve(result);
    }
}

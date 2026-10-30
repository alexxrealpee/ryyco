package com.ryyco.app;

import android.app.Application;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ContentResolver;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;

/** Creates the channel before FCM can display a notification, even on a cold start. */
public class RyycoApplication extends Application {
    @Override public void onCreate() {
        super.onCreate();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                "ryyco_orders_v2", "Pedidos y domicilios", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Nuevos pedidos de RYYCO · Rico, Rico");
            channel.enableVibration(true);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            channel.setSound(Uri.parse(ContentResolver.SCHEME_ANDROID_RESOURCE + "://" + getPackageName() + "/raw/ryyco_order"),
                new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
            // Recreating the same channel preserves the user's sound/importance preferences.
            getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }
    }
}

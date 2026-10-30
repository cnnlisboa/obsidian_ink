package com.sergeylappo.booxrapiddraw.utils

import android.content.Context

private const val PREFS_NAME = "boox_rapid_draw_prefs"
private const val KEY_OBSIDIAN_ONLY = "obsidian_only_mode"
private const val KEY_LIGHT_PEN_DETAIL = "light_pen_detail"

/**
 * Whether raw stylus capture should be restricted to the active Obsidian writing embed
 * (via the companion bridge) instead of working normally in every app. Off by default —
 * preserves the app's original, general-purpose behavior. Toggled from the foreground
 * service notification in OverlayShowingService.
 */
object BridgePrefs {
    fun isObsidianOnlyMode(context: Context): Boolean =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getBoolean(KEY_OBSIDIAN_ONLY, false)

    fun setObsidianOnlyMode(context: Context, value: Boolean) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_OBSIDIAN_ONLY, value)
            .apply()
    }

    /**
     * Whether pen points sent to the plugin are thinned to about the density of the WebView's own
     * pen events, rather than every sample the digitizer reports. On by default: full detail
     * roughly doubles the size of every stroke, which on a device short of memory slows Obsidian
     * down. Per device, and toggled from the service notification.
     */
    fun isLightPenDetail(context: Context): Boolean =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getBoolean(KEY_LIGHT_PEN_DETAIL, true)

    fun setLightPenDetail(context: Context, value: Boolean) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_LIGHT_PEN_DETAIL, value)
            .apply()
    }
}

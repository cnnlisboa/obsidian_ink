package com.sergeylappo.booxrapiddraw

import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.Rect
import android.graphics.RectF
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import android.os.Looper
import android.view.Gravity
import android.view.MotionEvent
import android.view.SurfaceView
import android.view.View
import android.view.View.OnLayoutChangeListener
import android.view.WindowManager
import android.view.WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
import android.view.WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
import android.view.WindowManager.LayoutParams.MATCH_PARENT
import android.view.WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
import android.widget.Toast
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.onyx.android.sdk.data.note.TouchPoint
import com.onyx.android.sdk.pen.RawInputCallback
import com.onyx.android.sdk.pen.TouchHelper
import com.onyx.android.sdk.pen.data.TouchPointList
import com.sergeylappo.booxrapiddraw.utils.BridgePrefs
import org.json.JSONArray
import org.json.JSONObject

private const val TAG = "RapidDrawOverlay"

private const val CHANNEL_ID = "rapid_draw_channel_overlay_01"
private const val STROKE_WIDTH = 3.0f

// Pen points go to the plugin a frame's worth at a time. tldraw draws once a frame anyway, and the
// instant ink on screen is the overlay's, so nothing visible waits on this.
private const val POINT_BATCH_MS = 16L

// With light pen detail on, a moving point is only sent once it's this far from the last one sent,
// in CSS px — about the spacing of the WebView's own pen events. See BridgePrefs.isLightPenDetail.
private const val LIGHT_POINT_SPACING_CSS_PX = 3.0

class OverlayShowingService : Service(), BridgeServerListener {
    private val paint = Paint()

    private lateinit var touchHelper: TouchHelper
    private lateinit var wm: WindowManager
    private lateinit var overlayPaintingView: SurfaceView
    private lateinit var fullScreenBounds: Rect

    // Obsidian-plugin companion bridge. See /COMPANION_APP_RESEARCH.md in the parent repo.
    private var bridgeServer: BridgeServer? = null
    private var writingMode: WritingModeState? = null

    // Answers the plugin's transcription requests. Independent of the pen and the overlay.
    private val inkRecognizer by lazy { InkRecognizer(applicationContext) }

    // Read once and updated on toggle, rather than from SharedPreferences for every pen sample.
    @Volatile private var lightPenDetail = true

    // Points waiting to go out in the next batch. Filled from the pen's callback thread, sent from
    // pointSender's, in order.
    private class PendingPoint(val sessionId: String, val canvasId: String, val point: JSONObject)
    private val pendingPoints = ArrayList<PendingPoint>()
    private var batchScheduled = false
    private val pointSenderThread = HandlerThread("bridge-points").apply { start() }
    private val pointSender = Handler(pointSenderThread.looper)
    private val sendBatch = Runnable { flushPoints() }

    override fun onBind(intent: Intent) = null

    override fun onCreate() {
        super.onCreate()

        createForegroundNotification()

        wm = getSystemService(WINDOW_SERVICE) as WindowManager

        createOverlayPaintingView()

        initPaint()
        initSurfaceView()

        lightPenDetail = BridgePrefs.isLightPenDetail(this)
        bridgeServer = BridgeServer(BuildConfig.BRIDGE_PORT, this).also { it.start() }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == "STOP") {
            Toast.makeText(this, "Terminating Rapid Draw Service...", Toast.LENGTH_SHORT).show()
            stopSelf()
            return START_NOT_STICKY // Prevents service from being recreated
        }

        if (intent?.action == "TOGGLE_OBSIDIAN_ONLY") {
            val newValue = !BridgePrefs.isObsidianOnlyMode(this)
            BridgePrefs.setObsidianOnlyMode(this, newValue)
            applyCaptureState()
            createForegroundNotification() // rebuild so the action label reflects the new state
            return START_STICKY
        }

        if (intent?.action == "TOGGLE_LIGHT_PEN_DETAIL") {
            lightPenDetail = !lightPenDetail
            BridgePrefs.setLightPenDetail(this, lightPenDetail)
            createForegroundNotification()
            return START_STICKY
        }

        Toast.makeText(this, "Starting Rapid Draw Service", Toast.LENGTH_SHORT).show()
        return START_STICKY // Service will be recreated if killed
    }

    private fun createForegroundNotification() {
        val notificationManager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager

        notificationManager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                "Boox Rapid draw overlay service",
                NotificationManager.IMPORTANCE_HIGH
            )
        )

        // add notification intent to finish the service
        val pendingIntent = PendingIntent.getService(
            this,
            0,
            Intent(this, OverlayShowingService::class.java).apply { action = "STOP" },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Obsidian-plugin companion bridge: lets the general-purpose (works in any app)
        // behavior be switched to Obsidian-writing-embed-only, and back, without a rebuild.
        // See /COMPANION_APP_RESEARCH.md in the parent repo.
        val obsidianOnly = BridgePrefs.isObsidianOnlyMode(this)
        val toggleObsidianOnlyIntent = PendingIntent.getService(
            this,
            1,
            Intent(this, OverlayShowingService::class.java).apply { action = "TOGGLE_OBSIDIAN_ONLY" },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val toggleLabel = if (obsidianOnly) "Obsidian-only: ON (tap for all apps)" else "Obsidian-only: OFF (tap to restrict)"

        val togglePenDetailIntent = PendingIntent.getService(
            this,
            2,
            Intent(this, OverlayShowingService::class.java).apply { action = "TOGGLE_LIGHT_PEN_DETAIL" },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val penDetailLabel = if (BridgePrefs.isLightPenDetail(this)) "Pen detail: light (tap for full)" else "Pen detail: full (tap for light)"

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.overlay_service_notification_content_title))
            .setContentText(getString(R.string.overlay_service_notification_content))
            .setSmallIcon(R.drawable.rapid_draw)
            .addAction(NotificationCompat.Action.Builder(null, "Stop", pendingIntent).build())
            .addAction(NotificationCompat.Action.Builder(null, toggleLabel, toggleObsidianOnlyIntent).build())
            .addAction(NotificationCompat.Action.Builder(null, penDetailLabel, togglePenDetailIntent).build())
            .build()

        //noinspection InlinedApi (Seems to work, IDK why, maybe older Android versions might not support this)
        ServiceCompat.startForeground(this, 1, notification, FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    }

    private fun createOverlayPaintingView() {
        overlayPaintingView = SurfaceView(this)
        overlayPaintingView.setZOrderOnTop(true)
        overlayPaintingView.holder.setFormat(PixelFormat.TRANSPARENT)
        overlayPaintingView.alpha = 1.0f

        val topLeftParams = WindowManager.LayoutParams(
            MATCH_PARENT,
            MATCH_PARENT,
            TYPE_APPLICATION_OVERLAY,
            FLAG_NOT_FOCUSABLE or FLAG_NOT_TOUCHABLE,
            PixelFormat.TRANSPARENT
        )
        topLeftParams.alpha = 0.2f
        topLeftParams.gravity = Gravity.START or Gravity.TOP

        //        TODO this is duplicated
        //        TODO actual bottom place is calculated incorrectly due to the status bar...
        val displayMetrics = resources.displayMetrics
        val bounds = Rect(0, 0, displayMetrics.widthPixels, displayMetrics.heightPixels)
        fullScreenBounds = bounds

        topLeftParams.x = bounds.left
        topLeftParams.y = bounds.top

        wm.addView(overlayPaintingView, topLeftParams)
    }

    private fun initPaint() {
        paint.isAntiAlias = true
        paint.style = Paint.Style.STROKE
        paint.color = Color.BLACK
        paint.strokeWidth = STROKE_WIDTH
    }

    //    TODO fix suppress
    @SuppressLint("ClickableViewAccessibility")
    private fun initSurfaceView() {
        touchHelper = TouchHelper.create(overlayPaintingView, 2, callback)
        touchHelper.setPenUpRefreshTimeMs(1000)
        overlayPaintingView.addOnLayoutChangeListener(object : OnLayoutChangeListener {
            override fun onLayoutChange(
                v: View,
                left: Int,
                top: Int,
                right: Int,
                bottom: Int,
                oldLeft: Int,
                oldTop: Int,
                oldRight: Int,
                oldBottom: Int
            ) {
                val bounds = Rect(0, 0, right, bottom)
                overlayPaintingView.getLocalVisibleRect(bounds)
                touchHelper.setStrokeColor(Color.BLACK)
                touchHelper.setStrokeStyle(TouchHelper.STROKE_STYLE_PENCIL)
                touchHelper.openRawDrawing()
                touchHelper.setStrokeWidth(STROKE_WIDTH).setLimitRect(bounds, listOf())
                appliedLimit = Rect(bounds)
                appliedExcludes = emptyList()
                touchHelper.setRawInputReaderEnable(!touchHelper.isRawDrawingInputEnabled)
                applyCaptureState() // applies Obsidian-only-mode's initial disabled state, if on
                overlayPaintingView.addOnLayoutChangeListener(this)
            }
        })

        overlayPaintingView.setOnTouchListener { _: View?, _: MotionEvent? -> true }
    }

    override fun onDestroy() {
        super.onDestroy()
        wm.removeViewImmediate(overlayPaintingView)
        touchHelper.closeRawDrawing()
        bridgeServer?.stop()
        bridgeServer = null
        pointSenderThread.quitSafely()
        inkRecognizer.close()
    }

    ////////
    //////// Obsidian-plugin companion bridge. See /COMPANION_APP_RESEARCH.md in the parent repo.
    ////////

    // A failed port bind used to be invisible — WebSocketServer reports it through onError, which
    // only logged, leaving the service running with a dead server while the plugin happily talked
    // to whichever *other* install had grabbed the port. Surface it instead.
    override fun onBridgeServerError(message: String) {
        Handler(Looper.getMainLooper()).post {
            Toast.makeText(this, "Rapid Draw bridge: $message", Toast.LENGTH_LONG).show()
        }
    }

    override fun onRecognizeInk(
        language: String,
        lines: List<InkLine>,
        onDownloadingModel: () -> Unit,
        onResult: (List<String>) -> Unit,
        onError: (InkRecognitionException) -> Unit,
    ) {
        inkRecognizer.recognize(language, lines, onDownloadingModel, onResult, onError)
    }

    override fun onWritingModeChanged(state: WritingModeState) {
        writingMode = if (state.active) state else null
        applyCaptureState()
    }

    // Scope raw capture to just the writing embed's region while a session is active,
    // restoring full-screen capture when it isn't. The coordinate conversion here is the
    // same one used for outgoing points, just inverted (CSS px -> physical px) and without
    // subtracting screenOrigin, since setLimitRect wants physical-screen-absolute
    // coordinates, same space touchPoint.x/y already are.
    //
    // Whether an inactive session actually *disables* capture (vs. just widening back to
    // full-screen) is opt-in via BridgePrefs — default off preserves the app's original,
    // general-purpose behavior. This is the DEV build (see build.gradle.kts
    // applicationIdSuffix) specifically so this can be tested without risking the stable
    // install. See /COMPANION_APP_RESEARCH.md for the two prior attempts at this.
    private fun applyCaptureState() {
        if (!::touchHelper.isInitialized) return
        val mode = writingMode

        if (mode != null) {
            val scale = cssScale(mode)
            val origin = viewOrigin()

            // Same CSS -> view-local physical conversion as the limit rect below. These are the UI
            // regions sitting over the embed — its menu bar, popups, the keyboard — that should not
            // capture the pen even though they fall inside the area we're drawing in.
            val excludes = mode.excludeRects.mapNotNull { r ->
                val exLeft = ((mode.screenOriginX + r.left) * scale).toInt() - origin[0]
                val exTop = ((mode.screenOriginY + r.top) * scale).toInt() - origin[1]
                val exRight = exLeft + (r.width * scale).toInt()
                val exBottom = exTop + (r.height * scale).toInt()
                // An empty rect is meaningless to the SDK and cheap to drop here.
                if (exRight <= exLeft || exBottom <= exTop) null else Rect(exLeft, exTop, exRight, exBottom)
            }
            // setLimitRect takes view-local coordinates — the original code passed it
            // `getLocalVisibleRect` output — so subtract the view's own screen position here,
            // exactly mirroring the addition on the outgoing-point path.
            val left = ((mode.screenOriginX + mode.rectLeft) * scale).toInt() - origin[0]
            val top = ((mode.screenOriginY + mode.rectTop) * scale).toInt() - origin[1]
            val right = left + (mode.rectWidth * scale).toInt()
            val bottom = top + (mode.rectHeight * scale).toInt()
            if (setLimitRectIfChanged(Rect(left, top, right, bottom), excludes)) {
                Log.i(
                    TAG,
                    "capture limit=($left,$top,$right,$bottom) excludes=${excludes.size}" +
                        excludes.joinToString(prefix = " ", separator = " ") { "[${it.left},${it.top},${it.right},${it.bottom}]" }
                )
            }
            setRawCaptureEnabled(true)
        } else {
            // No session: back to the app's general-purpose behaviour, whole screen, nothing
            // excluded. Stale exclusions here would be invisible dead patches in other apps.
            setLimitRectIfChanged(fullScreenBounds, listOf())
            setRawCaptureEnabled(!BridgePrefs.isObsidianOnlyMode(this))
        }
    }

    // The capture region last handed to the SDK. Each change costs two native calls and two into
    // Onyx's display controller, and the plugin re-sends its state on every pen-down and every
    // frame of a scroll, mostly unchanged — so an update that changes nothing isn't applied again.
    private var appliedLimit: Rect? = null
    private var appliedExcludes: List<Rect> = emptyList()

    private fun setLimitRectIfChanged(limit: Rect, excludes: List<Rect>): Boolean {
        if (limit == appliedLimit && excludes == appliedExcludes) return false
        touchHelper.setLimitRect(limit, excludes)
        appliedLimit = Rect(limit)
        appliedExcludes = excludes.map { Rect(it) }
        return true
    }

    // Mirrors the reader's last-applied enabled state so setRawInputReaderEnable is only
    // called on an actual transition, not on every onWritingModeChanged (which fires on
    // every camera move and every pen-calibration event — i.e. repeatedly during a single
    // active session). Calling it redundantly was a real bug found on 2026-09-14 — see
    // /COMPANION_APP_RESEARCH.md — though even fixing it didn't fully resolve that session's
    // testing, which is exactly why this now lives in an isolated dev-only install.
    private var rawCaptureEnabled = true

    private fun setRawCaptureEnabled(enabled: Boolean) {
        if (rawCaptureEnabled == enabled) return
        rawCaptureEnabled = enabled
        touchHelper.setRawInputReaderEnable(enabled)
    }

    // Scratch buffer for getLocationOnScreen — the overlay's own top-left in physical screen px.
    private val viewOriginOnScreen = IntArray(2)

    // Onyx raw TouchPoints are host-view-local (OpenInkBridge tags its own as
    // HOST_VIEW_LOCAL_PHYSICAL_PIXELS), while `screenOrigin` from the plugin is screen-absolute.
    // The earlier code bridged the two by assuming the overlay window's top-left *is* the screen's
    // top-left. That holds only while nothing (status bar, cutout, insets) pushes the window down,
    // and it silently shifts every stroke by the difference when it doesn't. Ask the view where it
    // actually is instead — this is a no-op at (0,0), and correct when it isn't.
    private fun viewOrigin(): IntArray {
        overlayPaintingView.getLocationOnScreen(viewOriginOnScreen)
        return viewOriginOnScreen
    }

    // Physical px per CSS px. The plugin's devicePixelRatio is authoritative when present, since
    // clientX/clientY — the units tldraw actually consumes — are defined against it, and it already
    // accounts for Obsidian's page zoom. displayMetrics.density is the pre-existing fallback.
    private fun cssScale(mode: WritingModeState): Double {
        val dpr = mode.devicePixelRatio
        return if (dpr > 0.0) dpr else resources.displayMetrics.density.toDouble()
    }

    private fun forwardPointToBridge(touchPoint: TouchPoint?, phase: String) {
        val mode = writingMode ?: return
        val point = touchPoint ?: return
        val scale = cssScale(mode)
        val origin = viewOrigin()
        val cssX = (point.x.toDouble() + origin[0]) / scale - mode.screenOriginX
        val cssY = (point.y.toDouble() + origin[1]) / scale - mode.screenOriginY

        if (phase == "down") {
            // One line per stroke, not per point — enough to solve a coordinate mismatch offline
            // (`adb logcat -s RapidDrawOverlay`) without flooding the log while writing.
            Log.i(
                TAG,
                "pen down raw=(${point.x},${point.y}) viewOrigin=(${origin[0]},${origin[1]}) " +
                    "dpr=${mode.devicePixelRatio} density=${resources.displayMetrics.density} scale=$scale " +
                    "screenOrigin=(${mode.screenOriginX},${mode.screenOriginY}) " +
                    "rect=(${mode.rectLeft},${mode.rectTop},${mode.rectWidth},${mode.rectHeight}) " +
                    "-> css=($cssX,$cssY)"
            )
        }

        // Down and up always go, so every stroke starts and ends exactly where the pen did.
        if (phase == "move" && lightPenDetail) {
            val last = lastSentPoint
            if (last != null && Math.hypot(cssX - last[0], cssY - last[1]) < LIGHT_POINT_SPACING_CSS_PX) return
        }
        lastSentPoint = if (phase == "up") null else doubleArrayOf(cssX, cssY)

        queuePoint(
            PendingPoint(
                sessionId = mode.sessionId,
                canvasId = mode.canvasId,
                point = JSONObject().apply {
                    put("x", cssX)
                    put("y", cssY)
                    put("pressure", point.pressure.toDouble())
                    put("tilt", 0)
                    put("isPen", true)
                    put("phase", phase)
                    put("t", point.timestamp.toLong())
                },
            ),
            endOfStroke = phase == "up",
        )
    }

    // The last point sent in the current stroke, in CSS px. Only touched from the pen's callbacks.
    private var lastSentPoint: DoubleArray? = null

    private fun queuePoint(point: PendingPoint, endOfStroke: Boolean) {
        synchronized(pendingPoints) {
            pendingPoints.add(point)
            if (endOfStroke) {
                // The stroke is complete, so it goes now rather than waiting out the batch.
                pointSender.removeCallbacks(sendBatch)
                batchScheduled = false
                pointSender.post(sendBatch)
                return
            }
            if (batchScheduled) return
            batchScheduled = true
            pointSender.postDelayed(sendBatch, POINT_BATCH_MS)
        }
    }

    private fun flushPoints() {
        val batch: List<PendingPoint>
        synchronized(pendingPoints) {
            batch = ArrayList(pendingPoints)
            pendingPoints.clear()
            batchScheduled = false
        }
        // One message per run of points from the same session, in the order they were drawn.
        var start = 0
        while (start < batch.size) {
            val first = batch[start]
            val points = JSONArray()
            var end = start
            while (end < batch.size && batch[end].sessionId == first.sessionId && batch[end].canvasId == first.canvasId) {
                points.put(batch[end].point)
                end++
            }
            bridgeServer?.sendStrokePoints(first.sessionId, first.canvasId, points)
            start = end
        }
    }


    ////////

    private val callback: RawInputCallback = object : RawInputCallback() {
        override fun onBeginRawDrawing(b: Boolean, touchPoint: TouchPoint?) {
            forwardPointToBridge(touchPoint, "down")
        }

        override fun onEndRawDrawing(b: Boolean, touchPoint: TouchPoint?) {
            forwardPointToBridge(touchPoint, "up")
        }

        override fun onRawDrawingTouchPointMoveReceived(touchPoint: TouchPoint?) {
            forwardPointToBridge(touchPoint, "move")
        }

        override fun onPenActive(point: TouchPoint?) {
            touchHelper.setRawDrawingEnabled(true)
        }

        override fun onRawDrawingTouchPointListReceived(touchPointList: TouchPointList) {}

        override fun onBeginRawErasing(b: Boolean, touchPoint: TouchPoint?) {}

        override fun onEndRawErasing(b: Boolean, touchPoint: TouchPoint?) {}

        override fun onRawErasingTouchPointMoveReceived(touchPoint: TouchPoint?) {}

        override fun onRawErasingTouchPointListReceived(touchPointList: TouchPointList?) {}

        override fun onPenUpRefresh(refreshRect: RectF?) {
            touchHelper.isRawDrawingRenderEnabled = false
            super.onPenUpRefresh(refreshRect)
        }
    }
}

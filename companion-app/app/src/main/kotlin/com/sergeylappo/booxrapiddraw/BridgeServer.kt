package com.sergeylappo.booxrapiddraw

import android.util.Log
import org.java_websocket.WebSocket
import org.java_websocket.handshake.ClientHandshake
import org.java_websocket.server.WebSocketServer
import org.json.JSONArray
import org.json.JSONObject
import java.net.InetSocketAddress

private const val TAG = "BridgeServer"

/** A rectangle in the plugin's viewport-relative CSS px space. */
data class BridgeRect(
    val left: Double,
    val top: Double,
    val width: Double,
    val height: Double,
)

// Mirrors SetWritingModeMessage in src/types/bridge-protocol.ts (the Obsidian plugin repo).
data class WritingModeState(
    val sessionId: String,
    val canvasId: String,
    val active: Boolean,
    val rectLeft: Double,
    val rectTop: Double,
    val rectWidth: Double,
    val rectHeight: Double,
    // Where the WebView viewport's (0,0) sits on the physical screen, in CSS px — see
    // "Coordinate calibration" in /COMPANION_APP_RESEARCH.md. {0,0} until the plugin calibrates.
    val screenOriginX: Double,
    val screenOriginY: Double,
    // The WebView's own physical->CSS px ratio. 0.0 when the plugin didn't send one (older build
    // or the mock server), in which case the caller falls back to displayMetrics.density.
    val devicePixelRatio: Double,
    // Regions inside `rect` that must not capture the pen: the embed's menu bar and scroll buttons,
    // popups and modals open over it, and the on-screen keyboard. A blocklist, so an empty list
    // just means "capture the whole rect" — the behaviour before this existed.
    val excludeRects: List<BridgeRect>,
)

interface BridgeServerListener {
    fun onWritingModeChanged(state: WritingModeState)

    /**
     * A request to turn handwriting into text, for the plugin's transcripts. Unrelated to the pen
     * and the overlay. Exactly one of the callbacks after the first is called, from any thread.
     */
    fun onRecognizeInk(
        language: String,
        lines: List<InkLine>,
        onDownloadingModel: () -> Unit,
        onResult: (List<String>) -> Unit,
        onError: (InkRecognitionException) -> Unit,
    )

    /** Server-level failure — most importantly a port already held by another install. */
    fun onBridgeServerError(message: String)
}

/**
 * Embedded loopback WebSocket server for the Obsidian-plugin companion bridge.
 * See /COMPANION_APP_RESEARCH.md in the parent repo for the message schema this speaks.
 *
 * Bound to 127.0.0.1 only — never reachable off-device. Broadcasts strokePoints to whichever
 * client is connected; in practice that's exactly one (the Obsidian plugin), which already
 * ignores anything not matching its own sessionId, so a stray second client is harmless.
 */
class BridgeServer(port: Int, private val listener: BridgeServerListener) :
    WebSocketServer(InetSocketAddress("127.0.0.1", port)) {

    override fun onOpen(conn: WebSocket, handshake: ClientHandshake) {
        Log.i(TAG, "Plugin connected: ${conn.remoteSocketAddress}")
    }

    override fun onClose(conn: WebSocket, code: Int, reason: String?, remote: Boolean) {
        Log.i(TAG, "Plugin disconnected (code=$code reason=$reason)")
    }

    override fun onMessage(conn: WebSocket, message: String) {
        try {
            val json = JSONObject(message)
            when (json.optString("type")) {
                "setWritingMode" -> handleSetWritingMode(json)
                "recognizeInk" -> handleRecognizeInk(conn, json)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to parse bridge message: $message", e)
        }
    }

    private fun handleSetWritingMode(json: JSONObject) {
        val rect = json.getJSONObject("rect")
        val origin = json.optJSONObject("screenOrigin")
        listener.onWritingModeChanged(
            WritingModeState(
                sessionId = json.getString("sessionId"),
                canvasId = json.getString("canvasId"),
                active = json.getBoolean("active"),
                rectLeft = rect.getDouble("left"),
                rectTop = rect.getDouble("top"),
                rectWidth = rect.getDouble("width"),
                rectHeight = rect.getDouble("height"),
                screenOriginX = origin?.optDouble("x", 0.0) ?: 0.0,
                screenOriginY = origin?.optDouble("y", 0.0) ?: 0.0,
                devicePixelRatio = json.optDouble("devicePixelRatio", 0.0),
                excludeRects = parseRects(json.optJSONArray("excludeRects")),
            )
        )
    }

    // Mirrors RecognizeInkMessage and its replies in src/types/bridge-protocol.ts. Answered on the
    // connection that asked, which the plugin opens just for the request.
    private fun handleRecognizeInk(conn: WebSocket, json: JSONObject) {
        val requestId = json.getString("requestId")
        fun reply(type: String, fill: JSONObject.() -> Unit) {
            if (!conn.isOpen) return
            conn.send(
                JSONObject().apply {
                    put("type", type)
                    put("requestId", requestId)
                    fill()
                }.toString()
            )
        }

        listener.onRecognizeInk(
            language = json.optString("language", "en-US"),
            lines = parseInkLines(json.getJSONArray("lines")),
            onDownloadingModel = { reply("inkRecognitionStatus") { put("status", "downloadingModel") } },
            onResult = { texts -> reply("inkRecognized") { put("lines", JSONArray(texts)) } },
            onError = { e ->
                reply("inkRecognitionFailed") {
                    put("reason", e.reason)
                    put("message", e.message ?: "")
                }
            },
        )
    }

    private fun parseInkLines(array: JSONArray): List<InkLine> {
        val lines = ArrayList<InkLine>(array.length())
        for (i in 0 until array.length()) {
            val line = array.getJSONObject(i)
            val strokesJson = line.getJSONArray("strokes")
            val strokes = ArrayList<FloatArray>(strokesJson.length())
            for (j in 0 until strokesJson.length()) {
                val coords = strokesJson.getJSONArray(j)
                strokes.add(FloatArray(coords.length()) { k -> coords.getDouble(k).toFloat() })
            }
            lines.add(
                InkLine(
                    strokes = strokes,
                    width = line.getDouble("width").toFloat(),
                    height = line.getDouble("height").toFloat(),
                )
            )
        }
        return lines
    }

    private fun parseRects(array: JSONArray?): List<BridgeRect> {
        if (array == null) return emptyList()
        val rects = ArrayList<BridgeRect>(array.length())
        for (i in 0 until array.length()) {
            val obj = array.optJSONObject(i) ?: continue
            rects.add(
                BridgeRect(
                    left = obj.optDouble("left", 0.0),
                    top = obj.optDouble("top", 0.0),
                    width = obj.optDouble("width", 0.0),
                    height = obj.optDouble("height", 0.0),
                )
            )
        }
        return rects
    }

    override fun onError(conn: WebSocket?, ex: Exception) {
        Log.w(TAG, "Bridge server error", ex)
        // A null conn means the failure is the server's own, not one client's — a bind failure
        // lands here, and silently ignoring it is what made the port collision so hard to spot.
        if (conn == null) {
            listener.onBridgeServerError(ex.message ?: ex.javaClass.simpleName)
        }
    }

    override fun onStart() {
        Log.i(TAG, "Bridge server listening on 127.0.0.1:$port")
    }

    /** Sends one stroke point (already converted to CSS/viewport-relative coordinates). */
    fun sendStrokePoint(
        sessionId: String,
        canvasId: String,
        x: Double,
        y: Double,
        pressure: Double,
        phase: String,
        t: Long,
    ) {
        val point = JSONObject().apply {
            put("x", x)
            put("y", y)
            put("pressure", pressure)
            put("tilt", 0)
            put("isPen", true)
            put("phase", phase)
            put("t", t)
        }
        val msg = JSONObject().apply {
            put("type", "strokePoints")
            put("sessionId", sessionId)
            put("canvasId", canvasId)
            put("points", JSONArray().put(point))
        }
        val text = msg.toString()
        for (conn in connections) {
            if (conn.isOpen) conn.send(text)
        }
    }
}

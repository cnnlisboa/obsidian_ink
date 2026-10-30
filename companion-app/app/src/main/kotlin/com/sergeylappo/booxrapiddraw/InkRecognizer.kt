package com.sergeylappo.booxrapiddraw

import android.util.Log
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.common.MlKitException
import com.google.mlkit.common.model.DownloadConditions
import com.google.mlkit.common.model.RemoteModelManager
import com.google.mlkit.vision.digitalink.DigitalInkRecognition
import com.google.mlkit.vision.digitalink.DigitalInkRecognitionModel
import com.google.mlkit.vision.digitalink.DigitalInkRecognitionModelIdentifier
import com.google.mlkit.vision.digitalink.DigitalInkRecognizer
import com.google.mlkit.vision.digitalink.DigitalInkRecognizerOptions
import com.google.mlkit.vision.digitalink.Ink
import com.google.mlkit.vision.digitalink.RecognitionContext
import com.google.mlkit.vision.digitalink.WritingArea
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException

private const val TAG = "InkRecognizer"

// A language model is ~20 MB, fetched once over whatever connection the device has.
private const val DOWNLOAD_TIMEOUT_S = 300L

// recognize() can hang on malformed ink; one line of handwriting never takes this long.
private const val RECOGNIZE_TIMEOUT_S = 10L

// How much of the previous line is passed along as context for the next.
private const val PRE_CONTEXT_CHARS = 20

/**
 * One line of handwriting. Each stroke is a flat [x0, y0, x1, y1, ...] array in the line's own
 * coordinates, in the order the plugin wants them read.
 */
class InkLine(val strokes: List<FloatArray>, val width: Float, val height: Float)

/** `reason` is one of the failure reasons in bridge-protocol.ts in the plugin repo. */
class InkRecognitionException(val reason: String, message: String) : Exception(message)

/**
 * Turns handwriting into text for the Obsidian plugin's transcripts, using Google ML Kit's
 * Digital Ink Recognition: on-device, and offline once a language's model has downloaded on first
 * use. Nothing here touches the pen or the overlay — it only answers the plugin's requests.
 *
 * Lines are recognised one at a time, since the recogniser expects a single line of text, with
 * the end of the line before as context for the next.
 */
class InkRecognizer {
    // One worker, so a second request waits for the first rather than racing it for the same
    // model download.
    private val executor = Executors.newSingleThreadExecutor()
    private val recognizers = HashMap<String, DigitalInkRecognizer>()

    fun recognize(
        language: String,
        lines: List<InkLine>,
        onDownloadingModel: () -> Unit,
        onResult: (List<String>) -> Unit,
        onError: (InkRecognitionException) -> Unit,
    ) {
        executor.execute {
            try {
                onResult(recognizeLines(language, lines, onDownloadingModel))
            } catch (e: InkRecognitionException) {
                onError(e)
            } catch (e: Exception) {
                Log.w(TAG, "Recognition failed", e)
                onError(InkRecognitionException("error", e.message ?: e.javaClass.simpleName))
            }
        }
    }

    fun close() {
        executor.shutdownNow()
        recognizers.values.forEach { it.close() }
        recognizers.clear()
    }

    private fun recognizeLines(language: String, lines: List<InkLine>, onDownloadingModel: () -> Unit): List<String> {
        val recognizer = getRecognizer(language, onDownloadingModel)
        val texts = ArrayList<String>(lines.size)
        // Timestamps only have to rise through the ink in the order it should be read.
        var timestamp = 0L

        for (line in lines) {
            val ink = Ink.builder()
            for (stroke in line.strokes) {
                if (stroke.size < 2) continue
                val strokeBuilder = Ink.Stroke.builder()
                for (i in 0 until stroke.size - 1 step 2) {
                    strokeBuilder.addPoint(Ink.Point.create(stroke[i], stroke[i + 1], timestamp))
                    timestamp += 10
                }
                ink.addStroke(strokeBuilder.build())
            }
            if (ink.isEmpty) {
                texts.add("")
                continue
            }

            val context = RecognitionContext.builder()
                // Required despite the docs: build() throws when it was never set.
                .setPreContext(texts.lastOrNull { it.isNotEmpty() }.orEmpty().takeLast(PRE_CONTEXT_CHARS))
                .setWritingArea(WritingArea(line.width, line.height))
                .build()
            val result = try {
                Tasks.await(recognizer.recognize(ink.build(), context), RECOGNIZE_TIMEOUT_S, TimeUnit.SECONDS)
            } catch (e: TimeoutException) {
                throw InkRecognitionException("timeout", "Recognising a line of handwriting timed out")
            }
            texts.add(result.candidates.firstOrNull()?.text.orEmpty())
        }
        return texts
    }

    private fun getRecognizer(language: String, onDownloadingModel: () -> Unit): DigitalInkRecognizer {
        recognizers[language]?.let { return it }

        // Returns null for a well-formed tag with no model, throws for a malformed one.
        val identifier = try {
            DigitalInkRecognitionModelIdentifier.fromLanguageTag(language)
        } catch (e: MlKitException) {
            null
        } ?: throw InkRecognitionException("unsupportedLanguage", "There's no handwriting model for '$language'")

        val model = DigitalInkRecognitionModel.builder(identifier).build()
        val manager = RemoteModelManager.getInstance()
        if (!Tasks.await(manager.isModelDownloaded(model))) {
            onDownloadingModel()
            try {
                Tasks.await(manager.download(model, DownloadConditions.Builder().build()), DOWNLOAD_TIMEOUT_S, TimeUnit.SECONDS)
            } catch (e: TimeoutException) {
                throw InkRecognitionException("modelUnavailable", "Downloading the handwriting model timed out")
            } catch (e: ExecutionException) {
                throw InkRecognitionException("modelUnavailable", e.cause?.message ?: "Couldn't download the handwriting model")
            }
        }

        return DigitalInkRecognition.getClient(DigitalInkRecognizerOptions.builder(model).build())
            .also { recognizers[language] = it }
    }
}

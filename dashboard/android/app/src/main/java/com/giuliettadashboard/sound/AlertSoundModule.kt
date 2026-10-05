package com.giuliettadashboard.sound

import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.ReactApplicationContext
import com.giuliettadashboard.specs.NativeAlertSoundSpec

/**
 * Zvučna upozorenja bez audio fajlova: ToneGenerator na STREAM_MUSIC.
 * Ne traži audio focus, pa se signal miješa preko muzike umjesto da je prekida.
 */
class AlertSoundModule(context: ReactApplicationContext) : NativeAlertSoundSpec(context) {

  private val handler = Handler(Looper.getMainLooper())
  private var tone: ToneGenerator? = null

  private data class Beep(val tone: Int, val ms: Int, val gapMs: Int = 0)

  private val patterns = mapOf(
    "critical" to listOf(
      Beep(ToneGenerator.TONE_CDMA_ALERT_CALL_GUARD, 350, 150),
      Beep(ToneGenerator.TONE_CDMA_ALERT_CALL_GUARD, 350, 150),
      Beep(ToneGenerator.TONE_CDMA_ALERT_CALL_GUARD, 350),
    ),
    "warning" to listOf(Beep(ToneGenerator.TONE_PROP_BEEP2, 300)),
    "info" to listOf(Beep(ToneGenerator.TONE_PROP_BEEP, 150)),
    "shift" to listOf(Beep(ToneGenerator.TONE_CDMA_PIP, 120)),
    "connect" to listOf(Beep(ToneGenerator.TONE_PROP_ACK, 250)),
  )

  override fun getName() = NAME

  override fun play(kind: String) {
    val seq = patterns[kind] ?: patterns.getValue("info")
    handler.post {
      val gen = tone ?: runCatching { ToneGenerator(AudioManager.STREAM_MUSIC, 90) }.getOrNull()?.also { tone = it } ?: return@post
      var at = 0L
      for (b in seq) {
        handler.postDelayed({ gen.startTone(b.tone, b.ms) }, at)
        at += b.ms + b.gapMs
      }
    }
  }

  override fun invalidate() {
    handler.removeCallbacksAndMessages(null)
    tone?.release()
    tone = null
    super.invalidate()
  }

  companion object {
    const val NAME = "NativeAlertSound"
  }
}

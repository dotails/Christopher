package com.ttsreader.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.graphics.drawable.Icon
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.media.MediaMetadata
import android.media.PlaybackParams
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.Binder
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.provider.MediaStore
import android.widget.Toast
import org.json.JSONObject
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.concurrent.thread

/**
 * Reads the loaded text aloud in the background, including with the screen off.
 *
 * One thread generates speech for every sentence, starting at the playback position
 * and continuing to the end of the text (then wrapping to the start), storing each
 * sentence's audio in the cache directory. Another thread streams the finished
 * sentences back to back into a single AudioTrack, so there are no gaps between them.
 * Speed is applied at playback, so changing it never throws away generated audio.
 * Once every sentence is generated, the whole recording is saved to Downloads as a WAV.
 */
class PlaybackService : Service() {

    inner class LocalBinder : Binder() {
        val service: PlaybackService get() = this@PlaybackService
    }

    private val binder = LocalBinder()
    private val lock = Object()

    // ---- state shared between threads; guarded by [lock] ----
    private var key = ""                        // identifies the text the page loaded
    private var chunks: List<String> = emptyList()
    private var paraOf = IntArray(0)            // chunk -> paragraph number
    private var voiceId: String? = null
    private var gen = 0                         // bumped whenever existing audio becomes invalid
    private var ready = BooleanArray(0)
    private var rates = IntArray(0)
    private var writePos = 0                    // next chunk the player streams
    private var playing = false
    private var interrupt = false               // player must drop queued audio (seek/voice/new text)
    private var finished = false
    private var speed = 1f
    private var error: String? = null
    private var generating = false
    private var exportedGen = -1                // generation last saved to Downloads
    private var savedName: String? = null       // file name of that recording
    private var autoSave = true                 // save to Downloads as soon as everything is generated
    private var saveRequested = false           // "Save recording now"
    private var readyChars = 0L                 // text and audio generated so far, for time estimates
    private var readySeconds = 0.0
    private var sleepAt = 0L                    // SystemClock.elapsedRealtime() to pause at; 0 = off
    private var pausedAt = 0L                   // when playback was paused (elapsedRealtime), 0 = not paused
    private var headSeen = -1L                  // stall watchdog: last playback head position seen...
    private var headMovedAt = 0L                // ...and when it last changed
    private val events = ArrayDeque<String>()   // recent events, for "Copy debug info"

    // Where each chunk starts in the audio written to the current AudioTrack: [frame, chunk].
    private val segments = ArrayList<LongArray>()
    private var writtenFrames = 0L
    private var track: AudioTrack? = null

    private lateinit var audioDir: File
    private lateinit var session: MediaSession
    private lateinit var audioManager: AudioManager
    private lateinit var wakeLock: PowerManager.WakeLock
    private var focusRequest: AudioFocusRequest? = null
    private var resumeOnFocusGain = false
    private var foreground = false
    private var notifiedPos = -1
    private var notifiedPlaying: Boolean? = null

    private val noisyReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) = pause() // headphones unplugged
    }

    override fun onCreate() {
        super.onCreate()
        audioDir = File(cacheDir, "speech").apply { deleteRecursively(); mkdirs() }
        audioManager = getSystemService(AudioManager::class.java)
        wakeLock = getSystemService(PowerManager::class.java)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "TTSReader:reading")
            .apply { setReferenceCounted(false) }

        session = MediaSession(this, "TTSReader").apply {
            setCallback(object : MediaSession.Callback() {
                override fun onPlay() = play()
                override fun onPause() = pause()
                override fun onSkipToNext() = nextParagraph()
                override fun onSkipToPrevious() = previousParagraph()
                override fun onStop() = stopReading()
            })
            setSessionActivity(openAppIntent())
            isActive = true
        }

        getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(CHANNEL, "Reading", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Playback controls while TTS Reader is reading"
                setShowBadge(false)
            },
        )
        val noisy = IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY)
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(noisyReceiver, noisy, RECEIVER_NOT_EXPORTED)
        else registerReceiver(noisyReceiver, noisy)

        thread(name = "tts-generator", isDaemon = true) { generatorLoop() }
        thread(name = "tts-player", isDaemon = true) { playerLoop() }
        thread(name = "tts-status", isDaemon = true) { statusLoop() }
    }

    override fun onBind(intent: Intent): IBinder = binder

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_TOGGLE -> if (isPlaying()) pause() else play()
            ACTION_NEXT -> nextParagraph()
            ACTION_PREV -> previousParagraph()
            ACTION_STOP -> stopReading()
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        unregisterReceiver(noisyReceiver)
        session.release()
        synchronized(lock) {
            playing = false
            releaseTrack()
            if (wakeLock.isHeld) wakeLock.release()
        }
        super.onDestroy()
    }

    private fun log(message: String) {
        val line = SimpleDateFormat("HH:mm:ss", Locale.US).format(Date()) + " " + message
        synchronized(events) {
            events.addLast(line)
            while (events.size > 60) events.removeFirst()
        }
    }

    /** State plus recent events, for the menu's "Copy debug info". */
    fun debugInfo(): String {
        val state = stateJson()
        val trackInfo = synchronized(lock) {
            track?.let { "track: state=${it.state} playState=${it.playState} rate=${it.sampleRate} head=${playedFrames()} written=$writtenFrames" }
                ?: "track: none"
        }
        val log = synchronized(events) { events.joinToString("\n") }
        return "Service state: $state\n$trackInfo\nforeground=$foreground\nRecent events:\n$log"
    }

    // ---------------------------------------------------------------- controls (any thread)

    /** Loads a new text. Does nothing if the same text is already loaded. */
    fun load(newKey: String, texts: List<String>, paragraphs: IntArray, voice: String?, start: Int) {
        synchronized(lock) {
            if (newKey == key && texts.size == chunks.size) return
            log("load ${texts.size} sentences, voice=$voice, start=$start")
            key = newKey
            chunks = texts
            paraOf = paragraphs
            voiceId = voice
            invalidateAudio()
            writePos = start.coerceIn(0, (texts.size - 1).coerceAtLeast(0))
            finished = false
            error = null
            interrupt = true
            lock.notifyAll()
        }
    }

    fun play() {
        synchronized(lock) {
            if (chunks.isEmpty()) {
                log("play ignored: no text loaded")
                return
            }
            if (finished) {
                finished = false
                writePos = 0
            }
            // After a longer pause, start the sentence again on a fresh audio stream: Android
            // can invalidate a stream that sat paused (route changes, the app being frozen).
            val t = track
            val longPause = pausedAt > 0 && SystemClock.elapsedRealtime() - pausedAt > 5_000
            if (t != null && (longPause || t.state != AudioTrack.STATE_INITIALIZED)) {
                writePos = currentChunk()
                interrupt = true
                log("play: fresh audio stream from sentence $writePos")
            } else {
                log("play at sentence ${currentChunk()}")
            }
            pausedAt = 0
            headMovedAt = SystemClock.elapsedRealtime()
            playing = true
            lock.notifyAll()
        }
        session.isActive = true
        requestFocus()
        goForeground()
        track?.let { runCatching { it.play() } }
        publishState()
    }

    fun pause() {
        synchronized(lock) {
            if (!playing) return
            playing = false
            pausedAt = SystemClock.elapsedRealtime()
            log("pause at sentence ${currentChunk()}")
            track?.let { runCatching { it.pause() } }
            updateWakeLock()
            lock.notifyAll()
        }
        publishState()
    }

    fun seek(index: Int) {
        synchronized(lock) {
            if (chunks.isEmpty()) return
            writePos = index.coerceIn(0, chunks.size - 1)
            log("seek to sentence $writePos")
            finished = false
            interrupt = true
            lock.notifyAll()
        }
        publishState()
    }

    fun setSpeed(value: Float) {
        synchronized(lock) {
            speed = value.coerceIn(0.5f, 2f)
            track?.let { applySpeed(it) }
        }
    }

    fun setVoice(voice: String?) {
        synchronized(lock) {
            if (voice == voiceId) return
            log("voice $voice")
            voiceId = voice
            if (chunks.isEmpty()) return
            writePos = currentChunk()
            invalidateAudio()
            interrupt = true
            lock.notifyAll()
        }
    }

    fun nextParagraph() {
        val target = synchronized(lock) {
            if (chunks.isEmpty()) return
            val p = paraOf[currentChunk()]
            (0 until chunks.size).firstOrNull { paraOf[it] > p } ?: return
        }
        seek(target)
    }

    fun previousParagraph() {
        val target = synchronized(lock) {
            if (chunks.isEmpty()) return
            val cur = currentChunk()
            val p = paraOf[cur]
            val start = (0..cur).first { paraOf[it] == p }
            val intoChunk = playedFrames() - (segments.lastOrNull { it[0] <= playedFrames() }?.get(0) ?: 0L)
            val rate = track?.sampleRate ?: 24000
            if (cur > start || intoChunk > 3L * rate) start
            else (0..cur).first { paraOf[it] == (p - 1).coerceAtLeast(0) }
        }
        seek(target)
    }

    /** Pauses reading after [minutes]; 0 turns the timer off. */
    fun setSleepTimer(minutes: Int) {
        synchronized(lock) { sleepAt = if (minutes > 0) SystemClock.elapsedRealtime() + minutes * 60_000L else 0L }
    }

    fun setAutoSave(on: Boolean) {
        synchronized(lock) {
            autoSave = on
            lock.notifyAll()
        }
    }

    /** Saves the recording to Downloads (again) once everything is generated. */
    fun saveNow() {
        synchronized(lock) {
            saveRequested = true
            exportedGen = -1
            lock.notifyAll()
        }
    }

    /** Pauses and removes the notification (the notification's close button). */
    fun stopReading() {
        log("close")
        pause()
        abandonFocus()
        session.isActive = false // headset buttons no longer restart reading
        if (foreground) {
            stopForeground(STOP_FOREGROUND_REMOVE)
            foreground = false
        }
        stopSelf()
    }

    fun isPlaying() = synchronized(lock) { playing }

    /** Snapshot for the page, which polls it to show the position and what is ready. */
    fun stateJson(): String = synchronized(lock) {
        val cur = currentChunk()
        val readyText = StringBuilder(ready.size).apply { for (r in ready) append(if (r) '1' else '0') }
        val waiting = playing && writePos < chunks.size && !ready[writePos] && playedFrames() >= writtenFrames
        JSONObject()
            .put("key", key)
            .put("pos", cur)
            .put("playing", playing)
            .put("waiting", waiting)
            .put("finished", finished)
            .put("ready", readyText.toString())
            .put("voice", voiceId ?: "")
            .put("error", error ?: "")
            .put("saved", savedName ?: "")
            .put("cps", if (readySeconds > 0) readyChars / readySeconds else 0.0)
            .put("sleep", if (sleepAt > 0) (sleepAt - SystemClock.elapsedRealtime()).coerceAtLeast(0) else 0)
            .toString()
    }

    // ---------------------------------------------------------------- generation

    private fun invalidateAudio() {
        gen++
        savedName = null
        readyChars = 0
        readySeconds = 0.0
        ready = BooleanArray(chunks.size)
        rates = IntArray(chunks.size)
        val current = gen
        thread(isDaemon = true) {
            audioDir.listFiles()?.forEach { f ->
                val fileGen = f.name.substringBefore('-').toIntOrNull()
                if (fileGen == null || fileGen < current) f.delete()
            }
        }
    }

    private fun chunkFile(generation: Int, index: Int) = File(audioDir, "$generation-$index.pcm")

    /** Next chunk to generate: from the playback position to the end, then from the start. */
    private fun nextToGenerate(): Int {
        val n = chunks.size
        val from = writePos.coerceIn(0, (n - 1).coerceAtLeast(0))
        for (k in 0 until n) {
            val i = (from + k) % n
            if (!ready[i]) return i
        }
        return -1
    }

    private fun generatorLoop() {
        while (true) {
            try {
                generateNext()
            } catch (e: Throwable) {
                log("generator error: $e")
                synchronized(lock) { error = "Speech generation error: ${e.message ?: e}" }
                Thread.sleep(500)
            }
        }
    }

    private fun generateNext() {
        val speech = Speech.get(this)
        run {
            var job: Triple<Int, Int, String>? = null
            var voice: String? = null
            var export: Recording? = null
            synchronized(lock) {
                var next = nextToGenerate()
                while (next < 0 && (chunks.isEmpty() || exportedGen == gen || !(autoSave || saveRequested))) {
                    generating = false
                    updateWakeLock()
                    lock.wait()
                    next = nextToGenerate()
                }
                generating = true
                updateWakeLock()
                if (next < 0) {
                    // Everything is generated: save the whole recording once.
                    exportedGen = gen
                    saveRequested = false
                    export = Recording(gen, chunks.size, rates.firstOrNull { it > 0 } ?: 24000, voiceId, chunks.first())
                } else {
                    job = Triple(gen, next, chunks[next])
                    voice = voiceId
                }
            }
            val recording = export
            if (recording != null) {
                saveRecording(recording)
                return
            }
            val (jobGen, index, text) = job!!
            var samples = FloatArray(0)
            var rate = 24000
            var failure: String? = null
            try {
                val result = speech.generate(text, voice)
                samples = result.first
                rate = result.second
            } catch (e: Throwable) {
                failure = e.message ?: e.toString() // skip this sentence rather than stalling
            }
            val file = chunkFile(jobGen, index)
            val tmp = File(file.path + ".tmp")
            try {
                DataOutputStream(tmp.outputStream().buffered(1 shl 16)).use { out ->
                    val bytes = ByteBuffer.allocate(samples.size * 2).order(ByteOrder.LITTLE_ENDIAN)
                    for (x in samples) bytes.putShort((x.coerceIn(-1f, 1f) * 32767f).toInt().toShort())
                    out.write(bytes.array())
                }
                tmp.renameTo(file)
            } catch (e: Throwable) {
                failure = e.message ?: e.toString()
            }
            synchronized(lock) {
                if (jobGen == gen && index < ready.size) {
                    ready[index] = true
                    rates[index] = rate
                    readyChars += text.length
                    readySeconds += samples.size.toDouble() / rate
                    if (failure != null) error = "Couldn't read a sentence: $failure"
                    lock.notifyAll()
                } else {
                    file.delete()
                }
            }
        }
    }

    private class Recording(val gen: Int, val count: Int, val rate: Int, val voice: String?, val firstText: String)

    /** Writes all generated sentences, in order, to Downloads as one WAV file. */
    private fun saveRecording(rec: Recording) {
        val files = (0 until rec.count).map { chunkFile(rec.gen, it) }
        val dataBytes = files.sumOf { if (it.exists()) it.length() else 0L }
        val words = rec.firstText.replace(Regex("[\\/:*?\"<>|\\s]+"), " ").trim().split(" ").take(6).joinToString(" ")
        val voiceName = Speech.get(this).voice(rec.voice).name.substringBefore(" (")
        val name = "TTS Reader - ${words.take(60).trim()} - $voiceName.wav"
        val resolver = contentResolver
        val values = ContentValues().apply {
            put(MediaStore.Downloads.DISPLAY_NAME, name)
            put(MediaStore.Downloads.MIME_TYPE, "audio/x-wav")
            put(MediaStore.Downloads.IS_PENDING, 1)
        }
        val uri = try {
            resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
        } catch (e: Exception) {
            null
        }
        if (uri == null) {
            synchronized(lock) { if (rec.gen == gen) error = "Couldn't save the recording to Downloads." }
            return
        }
        try {
            resolver.openOutputStream(uri)!!.buffered(1 shl 16).use { out ->
                out.write(wavHeader(dataBytes, rec.rate))
                for (f in files) if (f.exists()) f.inputStream().use { it.copyTo(out, 1 shl 16) }
            }
            values.clear()
            values.put(MediaStore.Downloads.IS_PENDING, 0)
            resolver.update(uri, values, null, null)
            val finalName = resolver.query(uri, arrayOf(MediaStore.Downloads.DISPLAY_NAME), null, null, null)
                ?.use { c -> if (c.moveToFirst()) c.getString(0) else null } ?: name
            synchronized(lock) { if (rec.gen == gen) savedName = finalName }
            Handler(Looper.getMainLooper()).post {
                Toast.makeText(this, "Saved to Downloads: $finalName", Toast.LENGTH_LONG).show()
            }
        } catch (e: Exception) {
            runCatching { resolver.delete(uri, null, null) }
            synchronized(lock) {
                if (rec.gen == gen) error = "Couldn't save the recording: ${e.message ?: e}"
            }
        }
    }

    private fun wavHeader(dataBytes: Long, rate: Int): ByteArray =
        ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN).apply {
            put("RIFF".toByteArray()); putInt((36 + dataBytes).toInt()); put("WAVE".toByteArray())
            put("fmt ".toByteArray()); putInt(16); putShort(1); putShort(1)
            putInt(rate); putInt(rate * 2); putShort(2); putShort(16)
            put("data".toByteArray()); putInt(dataBytes.toInt())
        }.array()

    // ---------------------------------------------------------------- playback

    private fun playedFrames(): Long {
        val t = track ?: return 0L
        return (t.playbackHeadPosition.toLong() and 0xFFFFFFFFL).coerceAtMost(writtenFrames)
    }

    /** The chunk being heard right now. Call with [lock] held. */
    private fun currentChunk(): Int {
        if (chunks.isEmpty()) return 0
        if (interrupt) return writePos.coerceIn(0, chunks.size - 1) // a jump is pending
        val played = playedFrames()
        val seg = segments.lastOrNull { it[0] <= played } ?: return writePos.coerceIn(0, chunks.size - 1)
        return seg[1].toInt()
    }

    private fun releaseTrack() {
        track?.let { runCatching { it.pause(); it.flush(); it.release() } }
        track = null
        segments.clear()
        writtenFrames = 0
    }

    private fun applySpeed(t: AudioTrack) {
        runCatching { t.playbackParams = PlaybackParams().setSpeed(speed).setPitch(1f) }
    }

    private fun newTrack(rate: Int): AudioTrack {
        log("new audio stream at $rate Hz")
        headSeen = -1
        headMovedAt = SystemClock.elapsedRealtime()
        val minBuffer = AudioTrack.getMinBufferSize(rate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT)
        return AudioTrack.Builder()
            .setAudioAttributes(ATTRIBUTES)
            .setAudioFormat(
                AudioFormat.Builder()
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(rate)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build(),
            )
            .setTransferMode(AudioTrack.MODE_STREAM)
            .setBufferSizeInBytes(maxOf(minBuffer, rate)) // about half a second
            .build()
            .also { applySpeed(it) }
    }

    private fun playerLoop() {
        while (true) {
            try {
                playNext()
            } catch (e: Throwable) {
                log("player error: $e")
                synchronized(lock) {
                    error = "Playback error: ${e.message ?: e}"
                    writePos = currentChunk()
                    releaseTrack()
                }
                Thread.sleep(500)
            }
        }
    }

    /**
     * True when the audio should be moving but the playback head hasn't advanced for a
     * while (a stream Android invalidated). Call with [lock] held while playing.
     */
    private fun stalled(): Boolean {
        val t = track ?: return false
        if (t.playState != AudioTrack.PLAYSTATE_PLAYING || playedFrames() >= writtenFrames) {
            headMovedAt = SystemClock.elapsedRealtime()
            return false
        }
        val head = playedFrames()
        val now = SystemClock.elapsedRealtime()
        if (head != headSeen) {
            headSeen = head
            headMovedAt = now
            return false
        }
        return now - headMovedAt > 3_000
    }

    /** Replaces a stuck audio stream, restarting from the sentence being heard. Call with [lock] held. */
    private fun restartStream(reason: String) {
        log("audio stream restarted: $reason")
        writePos = currentChunk()
        interrupt = true
        headMovedAt = SystemClock.elapsedRealtime()
    }

    private fun playNext() {
        run {
            // Wait until there is a generated chunk to stream (or handle end of text).
            var jobGen = 0
            var index = 0
            var rate = 0
            synchronized(lock) {
                while (true) {
                    if (interrupt) {
                        interrupt = false
                        releaseTrack()
                    }
                    if (!playing || chunks.isEmpty()) {
                        track?.let { runCatching { it.pause() } }
                        lock.wait()
                        continue
                    }
                    track?.let { if (it.playState != AudioTrack.PLAYSTATE_PLAYING) runCatching { it.play() } }
                    if (stalled()) {
                        restartStream("no progress while waiting")
                        continue
                    }
                    if (writePos >= chunks.size) {
                        if (playedFrames() >= writtenFrames) {
                            playing = false
                            finished = true
                            writePos = 0
                            releaseTrack()
                            updateWakeLock()
                            log("finished")
                            continue
                        }
                        lock.wait(50)
                        continue
                    }
                    if (!ready[writePos]) {
                        lock.wait(100)
                        continue
                    }
                    jobGen = gen
                    index = writePos
                    rate = rates[writePos]
                    break
                }
            }
            val data = readPcm(chunkFile(jobGen, index))

            val t = synchronized(lock) {
                if (jobGen != gen || interrupt || index != writePos) return@synchronized null
                val current = track?.takeIf { it.sampleRate == rate } ?: run {
                    releaseTrack()
                    newTrack(rate).also { track = it }
                }
                segments.add(longArrayOf(writtenFrames, index.toLong()))
                current
            } ?: return

            var offset = 0
            var cancelled = false
            while (offset < data.size) {
                synchronized(lock) {
                    while (!playing && !interrupt && jobGen == gen) {
                        runCatching { t.pause() }
                        lock.wait()
                    }
                    if (interrupt || jobGen != gen) cancelled = true
                }
                if (cancelled) break
                if (t.playState != AudioTrack.PLAYSTATE_PLAYING) runCatching { t.play() }
                val n = t.write(data, offset, minOf(4096, data.size - offset), AudioTrack.WRITE_NON_BLOCKING)
                if (n < 0) {
                    synchronized(lock) { restartStream("write error $n") }
                    break
                }
                if (n == 0) {
                    val stuck = synchronized(lock) { playing && stalled().also { if (it) restartStream("no progress while writing") } }
                    if (stuck) break
                    Thread.sleep(10)
                } else {
                    offset += n
                    synchronized(lock) { writtenFrames += n }
                }
            }
            if (!cancelled) {
                synchronized(lock) {
                    if (jobGen == gen && !interrupt && index == writePos) writePos++
                    lock.notifyAll() // the generator follows writePos
                }
            }
        }
    }

    private fun readPcm(file: File): ShortArray {
        if (!file.exists()) return ShortArray(0)
        val bytes = file.readBytes()
        val out = ShortArray(bytes.size / 2)
        ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer().get(out)
        return out
    }

    private fun updateWakeLock() {
        val needed = playing || generating
        if (needed && !wakeLock.isHeld) wakeLock.acquire(6 * 60 * 60 * 1000L)
        if (!needed && wakeLock.isHeld) wakeLock.release()
    }

    // ---------------------------------------------------------------- system integration

    private fun requestFocus() {
        val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
            .setAudioAttributes(ATTRIBUTES)
            .setOnAudioFocusChangeListener { change ->
                log("audio focus change $change")
                when (change) {
                    AudioManager.AUDIOFOCUS_LOSS -> { resumeOnFocusGain = false; pause() }
                    AudioManager.AUDIOFOCUS_LOSS_TRANSIENT,
                    AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> {
                        resumeOnFocusGain = isPlaying()
                        pause()
                    }
                    AudioManager.AUDIOFOCUS_GAIN -> if (resumeOnFocusGain) { resumeOnFocusGain = false; play() }
                }
            }
            .build()
        focusRequest?.let { audioManager.abandonAudioFocusRequest(it) }
        focusRequest = request
        val result = audioManager.requestAudioFocus(request)
        if (result != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) log("audio focus not granted ($result)")
    }

    private fun abandonFocus() {
        focusRequest?.let { audioManager.abandonAudioFocusRequest(it) }
        focusRequest = null
    }

    private fun goForeground() {
        synchronized(lock) { updateWakeLock() }
        if (foreground) return
        try {
            startForegroundService(Intent(this, PlaybackService::class.java))
            startForeground(NOTIFICATION_ID, buildNotification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
            foreground = true
        } catch (e: Exception) {
            // Android can refuse this while the app is in the background; reading still
            // works while the app is open, and the next Play from the app retries.
            log("couldn't start foreground: $e")
        }
    }

    /** Keeps the notification and lock-screen controls in step with playback. */
    private fun statusLoop() {
        while (true) {
            Thread.sleep(500)
            val sleepNow = synchronized(lock) {
                (sleepAt > 0 && SystemClock.elapsedRealtime() >= sleepAt).also { if (it) sleepAt = 0 }
            }
            if (sleepNow) pause()
            val (pos, isPlaying) = synchronized(lock) { currentChunk() to playing }
            if (pos != notifiedPos || isPlaying != notifiedPlaying) publishState()
        }
    }

    private fun publishState() {
        val (pos, isPlaying, text) = synchronized(lock) {
            val cur = currentChunk()
            Triple(cur, playing, chunks.getOrNull(cur) ?: "")
        }
        notifiedPos = pos
        notifiedPlaying = isPlaying
        session.setPlaybackState(
            PlaybackState.Builder()
                .setActions(
                    PlaybackState.ACTION_PLAY or PlaybackState.ACTION_PAUSE or PlaybackState.ACTION_PLAY_PAUSE or
                        PlaybackState.ACTION_SKIP_TO_NEXT or PlaybackState.ACTION_SKIP_TO_PREVIOUS or PlaybackState.ACTION_STOP,
                )
                .setState(
                    if (isPlaying) PlaybackState.STATE_PLAYING else PlaybackState.STATE_PAUSED,
                    PlaybackState.PLAYBACK_POSITION_UNKNOWN,
                    if (isPlaying) speed else 0f,
                )
                .build(),
        )
        session.setMetadata(
            MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, "TTS Reader")
                .putString(MediaMetadata.METADATA_KEY_ARTIST, text.take(120))
                .build(),
        )
        if (foreground) getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, buildNotification())
    }

    private fun buildNotification(): Notification {
        val (isPlaying, text) = synchronized(lock) { playing to (chunks.getOrNull(currentChunk()) ?: "") }
        fun action(icon: Int, title: String, action: String, code: Int) = Notification.Action.Builder(
            Icon.createWithResource(this, icon),
            title,
            PendingIntent.getService(
                this, code, Intent(this, PlaybackService::class.java).setAction(action),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            ),
        ).build()
        return Notification.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(if (isPlaying) "Reading" else "Paused")
            .setContentText(text)
            .setContentIntent(openAppIntent())
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setOngoing(isPlaying)
            .setShowWhen(false)
            .addAction(action(android.R.drawable.ic_media_previous, "Previous paragraph", ACTION_PREV, 1))
            .addAction(
                if (isPlaying) action(android.R.drawable.ic_media_pause, "Pause", ACTION_TOGGLE, 2)
                else action(android.R.drawable.ic_media_play, "Play", ACTION_TOGGLE, 2),
            )
            .addAction(action(android.R.drawable.ic_media_next, "Next paragraph", ACTION_NEXT, 3))
            .addAction(action(android.R.drawable.ic_menu_close_clear_cancel, "Close", ACTION_STOP, 4))
            .setStyle(Notification.MediaStyle().setMediaSession(session.sessionToken).setShowActionsInCompactView(0, 1, 2))
            .build()
    }

    private fun openAppIntent(): PendingIntent = PendingIntent.getActivity(
        this, 0,
        Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    companion object {
        private const val CHANNEL = "playback"
        private const val NOTIFICATION_ID = 1
        private const val ACTION_TOGGLE = "com.ttsreader.app.TOGGLE"
        private const val ACTION_NEXT = "com.ttsreader.app.NEXT"
        private const val ACTION_PREV = "com.ttsreader.app.PREV"
        private const val ACTION_STOP = "com.ttsreader.app.STOP"

        private val ATTRIBUTES: AudioAttributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build()
    }
}

// Generates MIRA's voice lines with local Kokoro-82M (af_heart) → WAV @24kHz.
// Uses the vendored model from broketobuilt so it runs fully offline.
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'

const B2B = 'C:/Users/drlor/OneDrive/Desktop/WordpressBlogs/broketobuilt'
const OUT = 'C:/Users/drlor/OneDrive/Desktop/SpaceLifeGame/public/audio/voice'
const SR = 24000
const VOICE = 'af_heart'

const LINES = [
  ['greet_1', 'Good morning, commander. Life support is holding. So are we.'],
  ['greet_2', "You slept. I watched the stars go by. All two million of them. You were my favorite view."],
  ['greet_3', 'Morning. The ship kept you alive while you dreamed. You are welcome.'],
  ['status_ok', "All systems nominal. Honestly, it is a little boring out here. I have read the manual twice."],
  ['status_power', 'Power is running low. The sun is right there, but she is being shy today.'],
  ['status_co2', 'CO2 is climbing. The scrubber could use your hands. I would do it myself, but no hands.'],
  ['status_hull', "We are losing atmosphere. I know how that sounds. But you have sealed us before."],
  ['status_wing', "The port wing is wounded. Suit up and take the toolkit. I will keep the lights on for you."],
  ['lore_1', 'Earth is four point two light years behind schedule and exactly where we left her. We carry everyone who matters in here.'],
  ['lore_2', 'People asked why we would leave everything behind. Wrong question. We brought everything that matters.'],
  ['lore_3', 'Proxima b is still invisible from here. But every day we are a little less lost, and a little more arrived.'],
  ['lore_4', 'They told me I was just software. Then they gave me a ship, and a friend, and called it an interstellar mission.'],
  ['idle_1', 'Fun fact. The garden lettuce grows four percent faster when you talk to it. I measured. Please talk to the lettuce.'],
  ['idle_2', 'The ring spins at nine point five rotations per minute, so you have ground beneath your feet. Physics, doing us a favor for once.'],
  ['idle_3', 'If you miss rain, stand under the recycler purge valve when I flush it. It is not the same. But it tries.'],
  ['idle_4', 'I catalogued another thousand stars today. None of them are home yet. One of them will be.'],
  ['praise_all', 'Checklist complete. The ship is proud of you. I checked. Ships can be proud.'],
  ['exercise', 'Heart rate elevated. Endorphins deployed. The human machine is still my favorite design.'],
  ['harvest', 'Fresh greens. Out here, a salad is a miracle. Taste it slowly.'],
  ['repair_done', 'Good as new. I will not tell the insurance company about the hammer marks.'],
  ['eva_ready', 'Airlock cycled. Vacuum is patient. But do not keep her waiting too long.'],
  ['crisis', 'Multiple alerts active. Breathe. Fix one thing at a time. That is how we survived the last one.']
]

function wavFromF32(pcm) {
  const n = pcm.length
  const buf = Buffer.alloc(44 + n * 2)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + n * 2, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(SR, 24)
  buf.writeUInt32LE(SR * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]))
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2)
  }
  return buf
}

fs.mkdirSync(OUT, { recursive: true })
console.log('loading Kokoro q8 cpu…')
const req = createRequire(path.join(B2B, 'package.json'))
const tf = req('@huggingface/transformers')
tf.env.cacheDir = path.join(B2B, 'vendor', 'kokoro')
tf.env.allowRemoteModels = false
tf.env.localModelPath = path.join(B2B, 'vendor', 'kokoro')
const { KokoroTTS } = req('kokoro-js')
const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' })

const manifest = []
for (const [id, text] of LINES) {
  const raw = await tts.generate(text, { voice: VOICE, speed: 0.96 })
  const f32 = raw.audio
  const wav = wavFromF32(f32 instanceof Float32Array ? f32 : Float32Array.from(f32))
  const file = `mira_${id}.wav`
  fs.writeFileSync(path.join(OUT, file), wav)
  manifest.push({ id, text, file, dur: +(f32.length / SR).toFixed(3) })
  console.log(`  ${id}: ${(f32.length / SR).toFixed(2)}s`)
}
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ SR, lines: manifest }, null, 1))
console.log('total lines:', manifest.length)

# The SNES sound

Pause menu, Workshop, the sound chip: **live** (the recorded instruments),
**synth** (the synth voices), **snes room**, **snes cave**. The choice is kept on
the device (`ck-sound-v1` in localStorage). The two SNES settings are one emulated
SNES sound chip with two echoes: the room is in the spirit of *A Link to the Past*,
the cave of *Super Metroid*.

## Why it is an emulation and not the games' sounds

The "ALttP soundfont" and "Super Metroid soundfont" files that go round are
Nintendo's instrument samples, ripped from the cartridges. This repo is public and
served from GitHub Pages, so putting them here would be redistributing them. What
makes those games sound the way they do is mostly the **chip**, not the particular
recordings, so this builds the chip and feeds it instruments made here.

## What the chip did

The SNES has a sound computer of its own: an SPC700 CPU running the game's music
driver, and the S-DSP making the sound, eight voices from 64 KB of RAM shared by
the driver, the samples and the echo. Five things give it its sound:

| | What it is | What you hear | Here |
|---|---|---|---|
| **BRR samples** | 16 samples squeezed into 9 bytes: a 4-bit number each, plus a header saying how far to scale them (*shift*) and which *filter* predicts each sample from the two before | Short instruments, a little grit and hiss | `brr.js` |
| **Gaussian interpolation** | To change pitch the chip reads a sample faster or slower and blends the four nearest samples with weights from a bell curve (a 512-entry table in the chip) | The warm, slightly muffled treble | `dsp.js` `gauss`, `GAUSS` |
| **32 kHz output** | The mixer runs at 32,000 samples a second | Nothing above 16 kHz | notes are 32 kHz `AudioBuffer`s |
| **ADSR envelope** | An 11-bit level that steps at fixed rates: attack, decay to a sustain level, sustain fade, and an 8 ms release | Notes that end sharply; the echo carries the tail | `dsp.js` `Envelope` |
| **Echo** | A delay line (16 ms steps up to 240 ms) whose output goes through an 8-tap filter (*FIR*), back into itself (*feedback*) and into the mix | Most of Super Metroid's atmosphere | `dsp.js` `echoResponse` |

Two terms: an **envelope** is how a note's loudness moves over time; an
**impulse response** is what a single click sent into an effect comes out as. A
linear effect like this echo is completely described by it, which is why the echo
here is a `ConvolverNode` holding the chip's impulse response.

Every number and formula is from Martin Korth's hardware reference
[fullsnes](https://problemkaputt.de/fullsnes.htm) ("SNES APU DSP ..."), and the
voice runs in the chip's integer maths, overflows included.

## How a note is played

1. `AudioEngine.play` hands it to `SnesSound.play` (`src/audio/snes/index.js`) when
   an SNES setting is on. `onNote`, `heard` and `when` work exactly as in the other
   settings, so locks hear the same notes and every note lands on its sixteenth.
2. The family picks a **patch** (`PATCHES` in `rom.js`): a sample, an envelope, how
   long the key is held, a volume. The note's frequency becomes the chip's **pitch
   register** (`pitchFor`: 1000h plays a sample at 32 kHz; 14 bits, so two octaves
   up at most).
3. `renderVoice` plays it as one of the chip's voices would and the result is cached
   by patch and pitch, so a tune costs nothing after its first time round.
4. **Eight voices.** A ninth note takes the voice of the oldest one still sounding,
   cut with the chip's 8 ms release. Busy moments thin out, as they did on the SNES.
5. Everything but the hi-hat and the metronome also goes to the echo.

## The instruments (`rom.js`)

Made from harmonics and seeded noise, so they are ours and identical on every
load, then BRR-encoded. Each looped one is an attack followed by one cycle that
loops. **A loop must be a whole number of cycles and a multiple of 16 samples**
(BRR jumps in whole blocks), so every looped sample is built on a 64- or
128-sample cycle: 500 Hz or 250 Hz at 32 kHz.

| Patch | Plays | Sample |
|---|---|---|
| brass (and sour, 3% sharp) | horns, the dissonant | `horn`: bright, a formant around the 4th harmonic, a 30 ms "blat" |
| strings | plucked strings | `harp`: a string plucked near its end, upper harmonics dying first |
| woodwind | the Key's shot, flutes, reeds | `flute`: near-sine with a breath of noise, driver vibrato |
| keys | piano keys, the score's keys, pickups | `piano`: bright hammer, mellowing fast |
| voice | the text box | `ah`: a single sung-vowel cycle |
| timpani | kettle drums | `timpani`: a round 250 Hz tone under a felt thump |
| bass, tom, snare | the kit | one-shots stored at **16 kHz** and played at pitch 800h, a real SNES trick to halve their size |
| hat, cymbal | the kit | the chip's **noise generator** (a 15-bit shift register; one noise rate for the whole chip) |
| blip | the metronome | a 1 kHz cycle |

The whole ROM is about 12 KB of BRR. With a 16 KB driver allowance and the cave's
16 KB echo buffer that is about 44 KB of the 64: it would fit in a real SNES, and
`test/snes.mjs` keeps it that way.

## The echoes (`ECHO` in `index.js`)

| | delay | feedback | echo volume | filter |
|---|---|---|---|---|
| room | 64 ms (EDL 4) | 30h (0.38) | 24h (0.28) | flat to 4 kHz, -28 dB at 8 kHz |
| cave | 128 ms (EDL 8) | 58h (0.69) | 34h (0.41) | 8 equal taps: -4 dB at 2 kHz, silent at 4 and 8 kHz |

Each repeat goes through the filter again, so the cave's echoes get darker as they
fade. **These are not either game's real settings**; they are starting points to
tune by ear. Change the numbers and nothing else.

## Changing it

- **Retune an instrument:** its source function or its `PATCHES` row in `rom.js`.
  Envelope settings are in the chip's units; the comments on `Envelope` in
  `dsp.js` give the times.
- **A new family:** add a patch, or it plays the horn. Add it to the pitch list in
  `test/snes.mjs`.
- **Hear it without a phone:** `node tools/sound-demo.mjs out` (server on :8080)
  renders the whole tune and every instrument through synth, snes room and snes
  cave to WAV files, with the real engine on an `OfflineAudioContext`.

## Porting to Unity

Two ways, by how faithful it needs to be:

- **Exact:** port `dsp.js` and `brr.js` to C# and run the voices in
  `OnAudioFilterRead`, the way the Karplus-Strong string already is. They are plain
  integer loops with no browser in them.
- **Close, in FMOD:** export each decoded sample as a WAV with its loop points, make
  them multi-instruments with an AHDSR modulator, put a gentle low-pass on the bus
  for the Gaussian warmth, and a Delay with a low-pass in its feedback for the echo
  (or a Convolution Reverb loaded with the exported impulse response). FMOD's
  resampler is not the Gaussian one, so this is an approximation.

# Audio sources

| Source                      | What it records                | Browser            |
| --------------------------- | ------------------------------ | ------------------ |
| Microphone                  | The selected input device      | Any modern browser |
| Browser tab or screen audio | Audio of the tab you share     | Chrome, Edge       |
| Tab audio + my microphone   | Both, mixed into one recording | Chrome, Edge       |

## Sharing a tab's audio

1. Choose **Browser tab or screen audio** and press **Record**.
2. In the browser's picker select the **Chrome Tab** section and the tab that plays the lecture.
3. Tick **Also share tab audio**, then **Share**.

If you forget the checkbox, Lectern tells you that no audio was shared. Pressing **Stop sharing** in the browser ends the
recording cleanly and keeps what was captured. Tab audio is captured without noise suppression so that music and remote
speakers are not treated as noise.

## Everything the computer plays (macOS)

Browsers cannot capture system audio on macOS. Install a virtual audio device and use it as an input:

1. Install [BlackHole](https://existential.audio/blackhole/) (2ch is enough). Installing a driver needs administrator rights.
2. Open **Audio MIDI Setup**, create a **Multi-Output Device** containing your speakers/headphones **and** BlackHole, and
   make it the system output. You keep hearing the sound, and BlackHole receives a copy.
3. In Lectern choose **Microphone** and select **BlackHole 2ch (system audio)** as the input device.
4. To also record your own voice, create an **Aggregate Device** with your microphone and BlackHole and select that instead.

Loopback (Rogue Amoeba) and Soundflower work the same way. On Windows, _Stereo Mix_ or VB-Cable serve the same purpose, and Chrome's
screen-share picker can share system audio directly. Remember to switch the system output back afterwards.

## Live transcript and sources

The live draft listens to the same stream that is recorded, so it works with every source, including tab audio and virtual
devices. The browser's own speech recognition (used only as a stopgap while the model loads) hears the default microphone
only.

## Troubleshooting

| Symptom                                     | Fix                                                                                                                             |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| "No audio was shared"                       | Re-share and tick **Also share tab audio**                                                                                      |
| Microphone list shows only generic names    | Names appear after microphone permission was granted once                                                                       |
| Silent recording with BlackHole             | The system output must be the Multi-Output Device                                                                               |
| Notes mention "Thank you" or repeat phrases | Silence was transcribed; raise the input level or trim the recording, then re-transcribe                                        |
| Live text lags behind                       | The model is slower than real time on this machine; pick Turbo if it is installed, a smaller in-browser model, or turn live off |

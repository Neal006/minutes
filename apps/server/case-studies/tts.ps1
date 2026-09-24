# Synthesizes each line of a case study to 16 kHz mono 16-bit WAV with the built-in Windows voices.
# Usage: powershell -File tts.ps1 -In lines.json -Out dir   (lines.json: [{ text, voice, rate }])
param([Parameter(Mandatory)][string]$In, [Parameter(Mandatory)][string]$Out)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$lines = Get-Content -Raw -Path $In | ConvertFrom-Json
New-Item -ItemType Directory -Force -Path $Out | Out-Null
$i = 0
foreach ($line in $lines) {
  $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $synth.SelectVoice($line.voice)
  $synth.Rate = [int]$line.rate
  $synth.SetOutputToWaveFile((Join-Path $Out "$i.wav"), $format)
  $synth.Speak($line.text)
  $synth.Dispose()
  $i++
}
